"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { safe } from "./common";

const actor = (s: Awaited<ReturnType<typeof requirePlatformAdmin>>) => ({ user: { id: s.user.id, name: `${s.user.name} (platform admin)` }, workspace: { id: null } } as never);

export async function adminSetPlan(orgId: string, plan: string, status: string) {
  return safe(async () => {
    const s = await requirePlatformAdmin();
    const d = z.object({ plan: z.enum(["free", "starter", "pro", "agency"]), status: z.enum(["active", "trialing", "past_due", "canceled"]) }).parse({ plan, status });
    await db.subscription.upsert({ where: { organizationId: orgId }, create: { organizationId: orgId, ...d }, update: d });
    await audit(actor(s), "admin.set_plan", { targetType: "organization", targetId: orgId, detail: d });
    revalidatePath("/admin"); return true;
  });
}
export async function adminToggleUser(userId: string, disabled: boolean) {
  return safe(async () => {
    const s = await requirePlatformAdmin();
    if (userId === s.userId) throw new Error("You can't disable yourself.");
    await db.user.update({ where: { id: userId }, data: { disabledAt: disabled ? new Date() : null } });
    if (disabled) await db.session.deleteMany({ where: { userId } });
    await audit(actor(s), disabled ? "admin.disable_user" : "admin.enable_user", { targetType: "user", targetId: userId });
    revalidatePath("/admin"); return true;
  });
}
export async function adminFlag(key: string, enabled: boolean, description?: string) {
  return safe(async () => {
    const s = await requirePlatformAdmin();
    await db.featureFlag.upsert({ where: { key }, create: { key, enabled, description: description ?? "" }, update: { enabled } });
    await audit(actor(s), "admin.feature_flag", { detail: { key, enabled } });
    revalidatePath("/admin"); return true;
  });
}
export async function adminTicket(id: string, status: string) {
  return safe(async () => { await requirePlatformAdmin(); await db.supportTicket.update({ where: { id }, data: { status } }); revalidatePath("/admin"); return true; });
}
