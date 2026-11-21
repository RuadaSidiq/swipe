"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { enforceLimit } from "@/lib/billing";
import { EVENT_TYPES } from "@/lib/events";
import { audit } from "@/lib/audit";
import { safe } from "./common";

const cond = z.object({ field: z.string().min(1), op: z.enum(["contains", "not_contains", "equals", "not_equals"]), value: z.string() });
const action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("notify"), target: z.enum(["managers", "everyone", "assignee"]), message: z.string().max(200).optional() }),
  z.object({ type: z.literal("add_tag"), tag: z.string().min(1).max(40) }), z.object({ type: z.literal("set_priority") }),
  z.object({ type: z.literal("assign"), membershipId: z.string() }), z.object({ type: z.literal("set_status"), status: z.enum(["OPEN", "PENDING", "RESOLVED", "ARCHIVED"]) }),
  z.object({ type: z.literal("create_contact"), status: z.enum(["contact", "lead", "customer", "vip"]) }), z.object({ type: z.literal("ai_draft_reply") }), z.object({ type: z.literal("ai_campaign_calendar") }),
]);
const schema = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(120), trigger: z.enum(Object.keys(EVENT_TYPES) as [string, ...string[]]), conditions: z.array(cond).max(10), actions: z.array(action).min(1).max(10), enabled: z.boolean().default(true) });

export async function saveAutomation(input: unknown) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("automations.manage");
    const d = schema.parse(input);
    for (const a of d.actions) if (a.type === "assign") await db.membership.findFirstOrThrow({ where: { id: a.membershipId, workspaceId: ctx.workspace.id } });
    if (d.enabled) await enforceLimit(ctx.workspace.organizationId, "automations", d.id ? 0 : 1);
    const data = { name: d.name, trigger: d.trigger, conditions: d.conditions, actions: d.actions, enabled: d.enabled };
    const a = d.id ? (await db.automation.findFirstOrThrow({ where: { id: d.id, workspaceId: ctx.workspace.id } }), await db.automation.update({ where: { id: d.id }, data }))
      : await db.automation.create({ data: { ...data, workspaceId: ctx.workspace.id, createdById: ctx.user.id } });
    await audit(ctx, d.id ? "automation.update" : "automation.create", { targetType: "automation", targetId: a.id });
    revalidatePath("/automations"); return a.id;
  });
}
export async function toggleAutomation(id: string, enabled: boolean) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("automations.manage");
    await db.automation.findFirstOrThrow({ where: { id, workspaceId: ctx.workspace.id } });
    if (enabled) await enforceLimit(ctx.workspace.organizationId, "automations");
    await db.automation.update({ where: { id }, data: { enabled } }); revalidatePath("/automations"); return true;
  });
}
export async function deleteAutomation(id: string) {
  return safe(async () => { const ctx = await requireCtx(); ctx.assert("automations.manage"); await db.automation.deleteMany({ where: { id, workspaceId: ctx.workspace.id } }); revalidatePath("/automations"); return true; });
}
