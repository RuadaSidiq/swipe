"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { emitEvent } from "@/lib/events";
import { generateCalendar } from "@/lib/ai";
import { audit } from "@/lib/audit";
import { safe } from "./common";

const schema = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(120), description: z.string().max(4000).default(""), goals: z.string().max(2000).default(""),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#6d5efc"), status: z.enum(["planning", "active", "paused", "completed"]).default("planning"),
  startDate: z.string().nullable().optional(), endDate: z.string().nullable().optional(), brandId: z.string().nullable().optional(), accountIds: z.array(z.string()).default([]), memberIds: z.array(z.string()).default([]) });

export async function saveCampaign(input: unknown) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("campaigns.manage");
    const d = schema.parse(input);
    const ws = ctx.workspace.id;
    const accounts = await db.socialAccount.findMany({ where: { workspaceId: ws, id: { in: d.accountIds } }, select: { id: true } });
    const members = await db.membership.findMany({ where: { workspaceId: ws, id: { in: d.memberIds } }, select: { id: true } });
    if (d.brandId) await db.brand.findFirstOrThrow({ where: { id: d.brandId, workspaceId: ws } });
    const data = { name: d.name, description: d.description, goals: d.goals, color: d.color, status: d.status, brandId: d.brandId || null, memberIds: members.map((m) => m.id),
      startDate: d.startDate ? new Date(d.startDate) : null, endDate: d.endDate ? new Date(d.endDate) : null };
    if (data.startDate && data.endDate && data.endDate < data.startDate) throw new Error("End date must be after the start date.");
    let id = d.id;
    if (id) {
      await db.campaign.findFirstOrThrow({ where: { id, workspaceId: ws } });
      await db.$transaction([db.campaign.update({ where: { id }, data }), db.campaignAccount.deleteMany({ where: { campaignId: id } }), db.campaignAccount.createMany({ data: accounts.map((a) => ({ campaignId: id!, accountId: a.id })) })]);
    } else {
      const c = await db.campaign.create({ data: { ...data, workspaceId: ws, accounts: { create: accounts.map((a) => ({ accountId: a.id })) } } });
      id = c.id;
      await emitEvent(ws, "campaign.created", { campaignId: id, name: d.name, createdById: ctx.user.id });
    }
    await audit(ctx, d.id ? "campaign.update" : "campaign.create", { targetType: "campaign", targetId: id });
    revalidatePath("/campaigns");
    return id;
  });
}
export async function deleteCampaign(id: string) {
  return safe(async () => { const ctx = await requireCtx(); ctx.assert("campaigns.manage"); await db.campaign.findFirstOrThrow({ where: { id, workspaceId: ctx.workspace.id } }); await db.campaign.delete({ where: { id } }); revalidatePath("/campaigns"); return true; });
}
export async function campaignCalendar(id: string) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("campaigns.manage"); ctx.assert("ai.use");
    await db.campaign.findFirstOrThrow({ where: { id, workspaceId: ctx.workspace.id } });
    const n = await generateCalendar(ctx.workspace.id, ctx.user.id, id);
    revalidatePath(`/campaigns/${id}`);
    return n;
  });
}
