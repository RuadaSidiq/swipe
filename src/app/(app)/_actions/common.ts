"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireCtx, requireUser } from "@/lib/auth";
import { ForbiddenError } from "@/lib/rbac";
import { PlanLimitError } from "@/lib/plans";
import { AiUnavailableError } from "@/lib/ai";
import { ValidationFailed } from "@/lib/publishing";
import { PlatformError } from "@/lib/platforms/http";
import { ZodError } from "zod";

export type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string; details?: unknown };

/** Wraps a server action so expected errors reach the UI as messages instead of a crash page. */
export async function safe<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, data: await fn() }; }
  catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
    if (e instanceof ValidationFailed) return { ok: false, error: e.message, details: e.reports };
    if (e instanceof ZodError) return { ok: false, error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    if (e instanceof ForbiddenError || e instanceof PlanLimitError || e instanceof AiUnavailableError || e instanceof PlatformError) return { ok: false, error: e.message };
    if (e instanceof Error && /not found|No .* found/i.test(e.message)) return { ok: false, error: "That item no longer exists or you don't have access to it." };
    if (e instanceof Error && e.constructor === Error) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export async function switchWorkspace(workspaceId: string) {
  const s = await requireUser();
  const m = await db.membership.findUnique({ where: { userId_workspaceId: { userId: s.userId, workspaceId } } });
  if (!m) throw new Error("Not a member of that workspace");
  await db.session.update({ where: { id: s.id }, data: { workspaceId } });
  redirect("/dashboard");
}

export async function markNotificationsRead(ids?: string[]) {
  const ctx = await requireCtx();
  await db.notification.updateMany({ where: { userId: ctx.user.id, workspaceId: ctx.workspace.id, readAt: null, ...(ids ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
  revalidatePath("/", "layout");
}
