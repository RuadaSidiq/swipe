"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { destroySession, hashPassword, requireCtx, validatePassword, verifyPassword } from "@/lib/auth";
import { enforceLimit, requireFeature } from "@/lib/billing";
import { uniqueSlug } from "@/lib/workspace";
import { audit } from "@/lib/audit";
import { deleteObject } from "@/lib/storage";
import { safe } from "./common";

const tz = z.string().refine((t) => { try { Intl.DateTimeFormat("en", { timeZone: t }); return true; } catch { return false; } }, "Unknown timezone");

export async function updateProfile(input: unknown) {
  return safe(async () => {
    const ctx = await requireCtx();
    const d = z.object({ name: z.string().trim().min(1).max(80), timezone: tz }).parse(input);
    await db.user.update({ where: { id: ctx.user.id }, data: d }); revalidatePath("/", "layout"); return true;
  });
}
export async function changePassword(input: { current: string; next: string }) {
  return safe(async () => {
    const ctx = await requireCtx();
    const u = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id } });
    if (!(await verifyPassword(input.current, u.passwordHash))) throw new Error("Current password is incorrect.");
    const e = validatePassword(input.next); if (e) throw new Error(e);
    await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(input.next) } });
    await db.session.deleteMany({ where: { userId: u.id, id: { not: ctx.sessionId } } }); // sign out other devices
    await audit(ctx, "user.password_change"); return true;
  });
}
export async function updateWorkspace(input: unknown) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("workspace.settings");
    const d = z.object({ name: z.string().trim().min(1).max(80), timezone: tz, requireApproval: z.boolean() }).parse(input);
    if (d.requireApproval && !ctx.workspace.requireApproval) await requireFeature(ctx.workspace.organizationId, "approvals");
    await db.workspace.update({ where: { id: ctx.workspace.id }, data: d });
    await audit(ctx, "workspace.update", { detail: d }); revalidatePath("/", "layout"); return true;
  });
}
const brandSchema = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(80), description: z.string().max(4000), audience: z.string().max(2000), tone: z.string().max(1000), products: z.string().max(4000),
  guidelines: z.string().max(6000), bannedWords: z.string().max(1000), examples: z.string().max(12000), defaultHashtags: z.string().max(500), isDefault: z.boolean() });
export async function saveBrand(input: unknown) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("workspace.settings");
    const d = brandSchema.parse(input);
    const count = await db.brand.count({ where: { workspaceId: ctx.workspace.id } });
    if (!d.id && count >= 1) await requireFeature(ctx.workspace.organizationId, "multiBrand");
    if (d.isDefault) await db.brand.updateMany({ where: { workspaceId: ctx.workspace.id }, data: { isDefault: false } });
    const { id, ...data } = d;
    if (id) { await db.brand.findFirstOrThrow({ where: { id, workspaceId: ctx.workspace.id } }); await db.brand.update({ where: { id }, data }); }
    else await db.brand.create({ data: { ...data, workspaceId: ctx.workspace.id } });
    revalidatePath("/settings"); return true;
  });
}
export async function deleteBrand(id: string) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("workspace.settings");
    if ((await db.brand.count({ where: { workspaceId: ctx.workspace.id } })) <= 1) throw new Error("A workspace needs at least one brand.");
    await db.brand.deleteMany({ where: { id, workspaceId: ctx.workspace.id } }); revalidatePath("/settings"); return true;
  });
}
export async function saveSlots(slots: { weekday: number; minuteOfDay: number; platform: string | null }[]) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("workspace.settings");
    const d = z.array(z.object({ weekday: z.number().int().min(0).max(6), minuteOfDay: z.number().int().min(0).max(1439), platform: z.string().nullable() })).max(100).parse(slots);
    await db.$transaction([db.postingSlot.deleteMany({ where: { workspaceId: ctx.workspace.id } }), db.postingSlot.createMany({ data: d.map((s) => ({ ...s, workspaceId: ctx.workspace.id })) })]);
    revalidatePath("/settings"); return true;
  });
}
export async function saveNotificationPrefs(prefs: { type: string; inApp: boolean; email: boolean }[]) {
  return safe(async () => {
    const ctx = await requireCtx();
    for (const p of prefs) await db.notificationPreference.upsert({ where: { userId_type: { userId: ctx.user.id, type: p.type } }, create: { userId: ctx.user.id, ...p }, update: { inApp: p.inApp, email: p.email } });
    return true;
  });
}
export async function createWorkspace(name: string) {
  return safe(async () => {
    const ctx = await requireCtx();
    if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") throw new Error("Only owners and admins can create workspaces.");
    await enforceLimit(ctx.workspace.organizationId, "workspaces");
    const ws = await db.workspace.create({ data: { organizationId: ctx.workspace.organizationId, name: name.trim() || "New workspace", slug: await uniqueSlug(name), timezone: ctx.workspace.timezone,
      memberships: { create: { userId: ctx.user.id, role: "OWNER" } }, brands: { create: { name: name.trim() || "New workspace", isDefault: true } } } });
    await db.session.update({ where: { id: ctx.sessionId }, data: { workspaceId: ws.id } });
    await audit(ctx, "workspace.create", { targetType: "workspace", targetId: ws.id, workspaceId: ws.id });
    redirect("/dashboard");
  });
}
export async function deleteWorkspace(confirmName: string) {
  return safe(async () => {
    const ctx = await requireCtx();
    if (ctx.role !== "OWNER") throw new Error("Only the owner can delete a workspace.");
    if (confirmName !== ctx.workspace.name) throw new Error("Type the workspace name exactly to confirm.");
    const media = await db.mediaAsset.findMany({ where: { workspaceId: ctx.workspace.id }, select: { storageKey: true } });
    await db.workspace.delete({ where: { id: ctx.workspace.id } });
    await Promise.all(media.map((m) => deleteObject(m.storageKey)));
    await audit({ user: ctx.user, workspace: ctx.workspace }, "workspace.delete", { workspaceId: undefined, detail: { name: ctx.workspace.name } }).catch(() => {});
    redirect("/dashboard");
  });
}
export async function deleteMyAccount(password: string) {
  return safe(async () => {
    const ctx = await requireCtx();
    const u = await db.user.findUniqueOrThrow({ where: { id: ctx.user.id }, include: { memberships: true } });
    if (!(await verifyPassword(password, u.passwordHash))) throw new Error("Password is incorrect.");
    for (const m of u.memberships.filter((x) => x.role === "OWNER")) {
      const others = await db.membership.count({ where: { workspaceId: m.workspaceId, role: "OWNER", userId: { not: u.id } } });
      if (!others) throw new Error("You own a workspace with no other owner. Transfer ownership or delete that workspace first.");
    }
    await db.user.delete({ where: { id: u.id } });
    await destroySession();
    redirect("/login");
  });
}

export async function submitSupport(input: { subject: string; body: string }) {
  return safe(async () => {
    const ctx = await requireCtx();
    const d = z.object({ subject: z.string().trim().min(3).max(160), body: z.string().trim().min(10).max(8000) }).parse(input);
    await db.supportTicket.create({ data: { userId: ctx.user.id, email: ctx.user.email, ...d } });
    return true;
  });
}
