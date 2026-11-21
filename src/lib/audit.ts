import { db } from "./db";
import type { Ctx } from "./auth";

export async function audit(ctx: Pick<Ctx, "user" | "workspace"> | null, action: string, opts: { targetType?: string; targetId?: string; detail?: object; workspaceId?: string; ip?: string } = {}) {
  await db.auditLog.create({
    data: {
      workspaceId: opts.workspaceId ?? ctx?.workspace.id ?? null,
      actorId: ctx?.user.id, actorName: ctx?.user.name,
      action, targetType: opts.targetType, targetId: opts.targetId, detail: (opts.detail ?? {}) as object, ip: opts.ip,
    },
  });
}
