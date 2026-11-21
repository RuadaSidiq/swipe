"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { randomToken, sha256 } from "@/lib/crypto";
import { enforceLimit } from "@/lib/billing";
import { sendEmail } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { safe } from "./common";

const ROLES = ["ADMIN", "MANAGER", "CREATOR", "SUPPORT", "ANALYST", "APPROVER"] as const;

export async function inviteMember(input: { email: string; role: string }) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("team.manage");
    const { email, role } = z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(ROLES) }).parse(input);
    if (role === "ADMIN" && ctx.role !== "OWNER") throw new Error("Only the owner can invite administrators.");
    await enforceLimit(ctx.workspace.organizationId, "members");
    const existing = await db.membership.findFirst({ where: { workspaceId: ctx.workspace.id, user: { email } } });
    if (existing) throw new Error("That person is already a member of this workspace.");
    const token = randomToken(24);
    await db.invite.create({ data: { workspaceId: ctx.workspace.id, email, role: role as Role, tokenHash: sha256(token), invitedById: ctx.user.id, expiresAt: new Date(Date.now() + 7 * 86400_000) } });
    const link = `${env.appUrl}/invite/${token}`;
    const sent = await sendEmail(email, `${ctx.user.name} invited you to ${ctx.workspace.name} on Orbit`, `You've been invited to join ${ctx.workspace.name} on Orbit.\n\nAccept: ${link}\n\nThis link expires in 7 days.`);
    await audit(ctx, "team.invite", { targetType: "invite", detail: { email, role } });
    revalidatePath("/team");
    return { link, sent };
  });
}
export async function changeRole(membershipId: string, role: string) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("team.manage");
    const r = z.enum([...ROLES, "OWNER"]).parse(role) as Role;
    const m = await db.membership.findFirstOrThrow({ where: { id: membershipId, workspaceId: ctx.workspace.id } });
    if ((m.role === "OWNER" || r === "OWNER" || r === "ADMIN") && ctx.role !== "OWNER") throw new Error("Only the owner can change owner or administrator roles.");
    if (m.role === "OWNER" && r !== "OWNER" && (await db.membership.count({ where: { workspaceId: ctx.workspace.id, role: "OWNER" } })) <= 1) throw new Error("A workspace needs at least one owner.");
    await db.membership.update({ where: { id: m.id }, data: { role: r } });
    await audit(ctx, "team.role_change", { targetType: "membership", targetId: m.id, detail: { from: m.role, to: r } });
    revalidatePath("/team"); return true;
  });
}
export async function removeMember(membershipId: string) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("team.manage");
    const m = await db.membership.findFirstOrThrow({ where: { id: membershipId, workspaceId: ctx.workspace.id } });
    if (m.role === "OWNER") throw new Error("Transfer ownership before removing an owner.");
    if (m.role === "ADMIN" && ctx.role !== "OWNER") throw new Error("Only the owner can remove administrators.");
    await db.$transaction([db.conversation.updateMany({ where: { assigneeId: m.id }, data: { assigneeId: null } }), db.membership.delete({ where: { id: m.id } }), db.session.updateMany({ where: { userId: m.userId, workspaceId: ctx.workspace.id }, data: { workspaceId: null } })]);
    await audit(ctx, "team.remove", { targetType: "membership", targetId: m.id });
    revalidatePath("/team"); return true;
  });
}
export async function revokeInvite(id: string) {
  return safe(async () => { const ctx = await requireCtx(); ctx.assert("team.manage"); await db.invite.deleteMany({ where: { id, workspaceId: ctx.workspace.id, acceptedAt: null } }); revalidatePath("/team"); return true; });
}
