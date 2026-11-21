import { z } from "zod";
import { addDays, addMonths, addWeeks } from "date-fns";
import type { Post, PostTarget, Prisma } from "@prisma/client";
import { db } from "./db";
import type { Ctx } from "./auth";
import { platform, type PlatformId } from "./platforms/registry";
import { validateVersion, type Issue, type MediaInfo } from "./platforms/validate";
import { ADAPTERS } from "./platforms/adapters";
import { PlatformError } from "./platforms/http";
import { freshAccount, markAuthProblem } from "./accounts";
import { signedMediaUrl, storagePath } from "./storage";
import { notifyWorkspace, notifyUsers } from "./notify";
import { audit } from "./audit";
import { enforceLimit, requireFeature } from "./billing";
import { emitEvent } from "./events";
import { env } from "./env";

export const targetInput = z.object({
  accountId: z.string(),
  body: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  link: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
  mediaIds: z.array(z.string()).default([]),
  useCustomMedia: z.boolean().default(false),
  options: z.record(z.any()).default({}),
});
export const postInput = z.object({
  id: z.string().optional(),
  title: z.string().max(300).default(""),
  body: z.string().max(70000).default(""),
  link: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
  mediaIds: z.array(z.string()).max(20).default([]),
  campaignId: z.string().nullable().optional(),
  brandId: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  targets: z.array(targetInput).default([]),
  action: z.enum(["draft", "schedule", "publish_now", "submit"]),
  scheduledAt: z.string().datetime().nullable().optional(),
  timezone: z.string().default("UTC"),
  recurrence: z.object({ freq: z.enum(["daily", "weekly", "monthly"]), interval: z.number().int().min(1).max(12), count: z.number().int().min(1).max(52) }).nullable().optional(),
  aiGenerated: z.boolean().default(false),
});
export type PostInput = z.infer<typeof postInput>;

export interface TargetReport { accountId: string; platform: string; accountName: string; issues: Issue[] }

async function mediaMap(workspaceId: string, ids: string[]) {
  const rows = ids.length ? await db.mediaAsset.findMany({ where: { workspaceId, id: { in: ids } } }) : [];
  return new Map(rows.map((r) => [r.id, r]));
}

/** Validates every destination version. Exported so the composer can show live checks. */
export async function validatePost(workspaceId: string, input: Pick<PostInput, "body" | "title" | "link" | "mediaIds" | "targets">): Promise<TargetReport[]> {
  const allIds = [...new Set([...input.mediaIds, ...input.targets.flatMap((t) => t.mediaIds)])];
  const media = await mediaMap(workspaceId, allIds);
  const accounts = await db.socialAccount.findMany({ where: { workspaceId, id: { in: input.targets.map((t) => t.accountId) } } });
  return input.targets.map((t) => {
    const acc = accounts.find((a) => a.id === t.accountId);
    if (!acc) return { accountId: t.accountId, platform: "?", accountName: "Unknown", issues: [{ level: "error" as const, message: "Account not found in this workspace." }] };
    const ids = t.useCustomMedia ? t.mediaIds : input.mediaIds;
    const m: MediaInfo[] = ids.map((id) => media.get(id)).filter(Boolean).map((r) => ({ id: r!.id, kind: r!.kind, mimeType: r!.mimeType, sizeBytes: r!.sizeBytes, durationSec: r!.durationSec, width: r!.width, height: r!.height, altText: r!.altText }));
    const issues = validateVersion(acc.platform as PlatformId, { body: t.body ?? input.body, title: t.title ?? input.title, link: t.link ?? input.link, media: m, options: t.options });
    if (acc.status !== "CONNECTED") issues.unshift({ level: "error", message: `${acc.displayName} needs reconnecting before it can publish.` });
    if (acc.isDemo && !env.demoMode) issues.unshift({ level: "error", message: "Demo accounts can only be used while DEMO_MODE is enabled." });
    return { accountId: acc.id, platform: acc.platform, accountName: acc.displayName, issues };
  });
}

export class ValidationFailed extends Error { constructor(public reports: TargetReport[]) { super("Some destinations have problems that must be fixed first."); } }

export async function savePost(ctx: Ctx, raw: unknown): Promise<{ post: Post; reports: TargetReport[] }> {
  const input = postInput.parse(raw);
  ctx.assert(input.id ? "posts.edit" : "posts.create");
  const wsId = ctx.workspace.id;
  const existing = input.id ? await db.post.findFirst({ where: { id: input.id, workspaceId: wsId }, include: { targets: true } }) : null;
  if (input.id && !existing) throw new Error("Post not found");
  if (existing && ["PUBLISHING", "PUBLISHED"].includes(existing.status)) throw new Error("Published posts can't be edited. Duplicate it instead.");
  if (input.campaignId && !(await db.campaign.findFirst({ where: { id: input.campaignId, workspaceId: wsId } }))) throw new Error("Campaign not found");
  if (input.brandId && !(await db.brand.findFirst({ where: { id: input.brandId, workspaceId: wsId } }))) throw new Error("Brand not found");

  const reports = await validatePost(wsId, input);
  const going = input.action !== "draft";
  if (going) {
    if (!input.targets.length) throw new Error("Select at least one destination account.");
    if (reports.some((r) => r.issues.some((i) => i.level === "error"))) throw new ValidationFailed(reports);
  }

  let scheduledAt: Date | null = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (input.action === "publish_now") scheduledAt = new Date();
  const needsApproval = going && ctx.workspace.requireApproval && !ctx.can("posts.approve");
  if (input.action === "schedule") {
    if (!needsApproval) ctx.assert("posts.schedule");
    if (!scheduledAt) throw new Error("Choose a date and time to schedule.");
    if (scheduledAt.getTime() < Date.now() - 60_000) throw new Error("The scheduled time is in the past.");
  }
  if (input.action === "publish_now" && !needsApproval) ctx.assert("posts.publish");
  if (needsApproval) await requireFeature(ctx.workspace.organizationId, "approvals");
  if (going && !needsApproval) {
    const already = existing?.targets.filter((t) => t.status === "SCHEDULED").length ?? 0;
    await enforceLimit(ctx.workspace.organizationId, "scheduledPosts", Math.max(0, input.targets.length - already));
  }

  const status = !going ? "DRAFT" : needsApproval ? "PENDING_APPROVAL" : "SCHEDULED";
  const tStatus = status === "SCHEDULED" ? "SCHEDULED" : "DRAFT";

  const data = {
    title: input.title, body: input.body, link: input.link ?? null, mediaIds: input.mediaIds, campaignId: input.campaignId ?? null, brandId: input.brandId ?? null,
    tags: input.tags, status, scheduledAt, timezone: input.timezone, recurrence: (input.recurrence ?? undefined) as Prisma.InputJsonValue | undefined, aiGenerated: input.aiGenerated,
  } as const;

  const post = await db.$transaction(async (tx) => {
    const p = existing
      ? await tx.post.update({ where: { id: existing.id }, data: { ...data, approvedById: null, approvedAt: null } })
      : await tx.post.create({ data: { ...data, workspaceId: wsId, createdById: ctx.user.id } });
    await tx.postTarget.deleteMany({ where: { postId: p.id, status: { notIn: ["PUBLISHED", "PUBLISHING"] } } });
    for (const t of input.targets) {
      await tx.postTarget.create({ data: {
        postId: p.id, accountId: t.accountId, body: t.body ?? null, title: t.title ?? null, link: t.link ?? null, mediaIds: t.mediaIds,
        useCustomMedia: t.useCustomMedia, options: t.options as Prisma.InputJsonValue, status: tStatus, scheduledAt, nextAttemptAt: tStatus === "SCHEDULED" ? scheduledAt : null } });
    }
    if (needsApproval) await tx.postComment.create({ data: { postId: p.id, userId: ctx.user.id, userName: ctx.user.name, body: "Submitted for approval", kind: "submitted" } });
    return p;
  });

  if (needsApproval) await notifyWorkspace(wsId, { type: "approval", title: "Post awaiting approval", body: `${ctx.user.name}: ${input.body.slice(0, 120)}`, href: `/posts/${post.id}` }, ["posts.approve"]);
  await audit(ctx, `post.${input.action}`, { targetType: "post", targetId: post.id, detail: { targets: input.targets.length, status } });
  return { post, reports };
}

export async function approvePost(ctx: Ctx, postId: string, note?: string) {
  ctx.assert("posts.approve");
  const post = await db.post.findFirstOrThrow({ where: { id: postId, workspaceId: ctx.workspace.id }, include: { targets: true } });
  if (post.status !== "PENDING_APPROVAL") throw new Error("This post isn't awaiting approval.");
  const when = post.scheduledAt && post.scheduledAt > new Date() ? post.scheduledAt : new Date();
  await enforceLimit(ctx.workspace.organizationId, "scheduledPosts", post.targets.length);
  await db.$transaction([
    db.post.update({ where: { id: postId }, data: { status: "SCHEDULED", approvedById: ctx.user.id, approvedAt: new Date(), scheduledAt: when } }),
    db.postTarget.updateMany({ where: { postId, status: "DRAFT" }, data: { status: "SCHEDULED", scheduledAt: when, nextAttemptAt: when } }),
    db.postComment.create({ data: { postId, userId: ctx.user.id, userName: ctx.user.name, body: note || "Approved", kind: "approval" } }),
  ]);
  await notifyUsers(ctx.workspace.id, [post.createdById], { type: "approval", title: "Your post was approved", body: post.body.slice(0, 120), href: `/posts/${postId}` });
  await audit(ctx, "post.approve", { targetType: "post", targetId: postId });
}

export async function requestChanges(ctx: Ctx, postId: string, note: string) {
  ctx.assert("posts.approve");
  const post = await db.post.findFirstOrThrow({ where: { id: postId, workspaceId: ctx.workspace.id } });
  await db.$transaction([
    db.post.update({ where: { id: postId }, data: { status: "CHANGES_REQUESTED" } }),
    db.postComment.create({ data: { postId, userId: ctx.user.id, userName: ctx.user.name, body: note || "Changes requested", kind: "changes_requested" } }),
  ]);
  await notifyUsers(ctx.workspace.id, [post.createdById], { type: "approval", title: "Changes requested on your post", body: note, href: `/posts/${postId}` });
  await audit(ctx, "post.request_changes", { targetType: "post", targetId: postId });
}

export async function reschedulePost(ctx: Ctx, postId: string, when: Date) {
  ctx.assert("posts.schedule");
  if (when.getTime() < Date.now()) throw new Error("Can't move a post into the past.");
  const post = await db.post.findFirstOrThrow({ where: { id: postId, workspaceId: ctx.workspace.id } });
  if (!["SCHEDULED", "DRAFT", "PENDING_APPROVAL", "CHANGES_REQUESTED", "FAILED"].includes(post.status)) throw new Error("Only unpublished posts can be rescheduled.");
  await db.$transaction([
    db.post.update({ where: { id: postId }, data: { scheduledAt: when } }),
    db.postTarget.updateMany({ where: { postId, status: { in: ["SCHEDULED", "DRAFT"] } }, data: { scheduledAt: when } }),
    db.postTarget.updateMany({ where: { postId, status: "SCHEDULED" }, data: { nextAttemptAt: when } }),
  ]);
  await audit(ctx, "post.reschedule", { targetType: "post", targetId: postId, detail: { when } });
}

export async function cancelPost(ctx: Ctx, postId: string) {
  ctx.assert("posts.schedule");
  await db.post.findFirstOrThrow({ where: { id: postId, workspaceId: ctx.workspace.id } });
  await db.postTarget.updateMany({ where: { postId, status: { in: ["SCHEDULED", "QUEUED"] } }, data: { status: "DRAFT", nextAttemptAt: null } });
  await db.post.update({ where: { id: postId }, data: { status: "DRAFT" } });
  await recomputePostStatus(postId);
  await audit(ctx, "post.unschedule", { targetType: "post", targetId: postId });
}

export async function deletePost(ctx: Ctx, postId: string) {
  ctx.assert("posts.delete");
  const p = await db.post.findFirstOrThrow({ where: { id: postId, workspaceId: ctx.workspace.id }, include: { targets: true } });
  if (p.targets.some((t) => t.status === "PUBLISHING")) throw new Error("This post is publishing right now.");
  await db.post.delete({ where: { id: postId } });
  await audit(ctx, "post.delete", { targetType: "post", targetId: postId });
}

export async function duplicatePost(ctx: Ctx, postId: string) {
  ctx.assert("posts.create");
  const p = await db.post.findFirstOrThrow({ where: { id: postId, workspaceId: ctx.workspace.id }, include: { targets: true } });
  const copy = await db.post.create({ data: {
    workspaceId: p.workspaceId, title: p.title, body: p.body, link: p.link, mediaIds: p.mediaIds, campaignId: p.campaignId, brandId: p.brandId, tags: p.tags,
    status: "DRAFT", timezone: p.timezone, createdById: ctx.user.id,
    targets: { create: p.targets.map((t) => ({ accountId: t.accountId, body: t.body, title: t.title, link: t.link, mediaIds: t.mediaIds, useCustomMedia: t.useCustomMedia, options: t.options as Prisma.InputJsonValue })) },
  } });
  await audit(ctx, "post.duplicate", { targetType: "post", targetId: copy.id, detail: { from: postId } });
  return copy;
}

export async function retryTarget(ctx: Ctx, targetId: string) {
  ctx.assert("posts.publish");
  const t = await db.postTarget.findFirstOrThrow({ where: { id: targetId, post: { workspaceId: ctx.workspace.id } } });
  if (t.status !== "FAILED") throw new Error("Only failed destinations can be retried.");
  await db.postTarget.update({ where: { id: targetId }, data: { status: "QUEUED", nextAttemptAt: new Date(), error: null, errorCode: null } });
  await db.post.update({ where: { id: t.postId }, data: { status: "PUBLISHING" } });
  await audit(ctx, "post.retry_target", { targetType: "post_target", targetId });
}

// ───────────────────────── Worker side ─────────────────────────

const MAX_ATTEMPTS = 5;

/** Atomically claims due targets so multiple workers never publish the same one twice. */
export async function claimDueTargets(limit = 10): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE "PostTarget" SET "status" = 'PUBLISHING', "lockedAt" = now(), "attempts" = "attempts" + 1
    WHERE "id" IN (
      SELECT t."id" FROM "PostTarget" t JOIN "Post" p ON p."id" = t."postId"
      WHERE t."status" IN ('SCHEDULED', 'QUEUED') AND t."nextAttemptAt" <= now() AND p."status" IN ('SCHEDULED', 'PUBLISHING', 'PARTIAL', 'FAILED')
      ORDER BY t."nextAttemptAt" ASC FOR UPDATE OF t SKIP LOCKED LIMIT ${limit}
    ) RETURNING "id"`;
  return rows.map((r) => r.id);
}

/** A worker that crashed mid-publish leaves rows in PUBLISHING. We can't know if the network accepted it, so fail safe. */
export async function releaseStaleLocks() {
  const stale = await db.postTarget.findMany({ where: { status: "PUBLISHING", lockedAt: { lt: new Date(Date.now() - 45 * 60_000) } } });
  for (const t of stale) {
    await db.postTarget.update({ where: { id: t.id }, data: { status: "FAILED", lockedAt: null, errorCode: "interrupted",
      error: "Publishing was interrupted. Check the destination before retrying to avoid a duplicate post." } });
    await recomputePostStatus(t.postId);
  }
}

function resolveVersion(post: Post, t: PostTarget) {
  return { body: t.body ?? post.body, title: t.title ?? post.title, link: t.link ?? post.link, mediaIds: t.useCustomMedia ? t.mediaIds : post.mediaIds, options: (t.options ?? {}) as Record<string, any> };
}

export async function publishTarget(targetId: string) {
  const t = await db.postTarget.findUniqueOrThrow({ where: { id: targetId }, include: { post: true, account: true } });
  const v = resolveVersion(t.post, t);
  const p = platform(t.account.platform);
  const log = (ok: boolean, message: string, response?: unknown) => db.publishAttempt.create({ data: { targetId, ok, message, response: (response ?? undefined) as Prisma.InputJsonValue | undefined } });

  try {
    if (t.account.status !== "CONNECTED") throw new PlatformError(`${t.account.displayName} is ${t.account.status.toLowerCase()}; reconnect it to publish.`, { auth: true });
    let result: { externalId: string; url?: string; raw?: unknown };
    let simulated = false;
    if (t.account.isDemo) {
      if (!env.demoMode) throw new PlatformError("Demo accounts can't publish while DEMO_MODE is off.");
      simulated = true;
      result = { externalId: `demo_${t.id}`, raw: { simulated: true } };
    } else {
      const adapter = ADAPTERS[p.id];
      if (!adapter.publish) throw new PlatformError(`${p.name} publishing isn't available. ${p.caps.publishVideo.note ?? p.caps.publishText.note ?? ""}`);
      const assets = v.mediaIds.length ? await db.mediaAsset.findMany({ where: { id: { in: v.mediaIds }, workspaceId: t.post.workspaceId } }) : [];
      const ordered = v.mediaIds.map((id) => assets.find((a) => a.id === id)).filter(Boolean).map((a) => ({
        id: a!.id, kind: a!.kind, mimeType: a!.mimeType, publicUrl: signedMediaUrl(a!.id), filePath: storagePath(a!.storageKey), sizeBytes: a!.sizeBytes, altText: a!.altText }));
      const { acc } = await freshAccount(t.accountId);
      result = await adapter.publish(acc, { body: v.body, title: v.title, link: v.link, media: ordered, options: v.options });
    }
    await db.postTarget.update({ where: { id: targetId }, data: { status: "PUBLISHED", externalId: result.externalId, externalUrl: result.url ?? null, publishedAt: new Date(), lockedAt: null, error: null, errorCode: null, simulated } });
    await log(true, simulated ? "Simulated publish (demo account) — nothing was sent to the network" : `Published to ${p.name}`, result.raw ?? { id: result.externalId, url: result.url });
  } catch (e) {
    const err = e instanceof PlatformError ? e : new PlatformError((e as Error).message ?? "Unknown error", { retryable: true });
    const retry = err.retryable && t.attempts < MAX_ATTEMPTS;
    const delayMin = Math.min(60, 2 ** t.attempts);
    await db.postTarget.update({ where: { id: targetId }, data: retry
      ? { status: "QUEUED", nextAttemptAt: new Date(Date.now() + delayMin * 60_000), lockedAt: null, error: err.message, errorCode: err.opts.code ?? null }
      : { status: "FAILED", lockedAt: null, error: err.message, errorCode: err.opts.code ?? null } });
    await log(false, retry ? `${err.message} — retrying in ${delayMin} min` : err.message, err.opts.body);
    if (err.auth) await markAuthProblem(t.account, err.message);
    if (!retry) {
      await notifyWorkspace(t.post.workspaceId, { type: "publish_failed", title: `Failed to publish to ${t.account.displayName}`, body: err.message, href: `/posts/${t.postId}` }, ["posts.publish"]);
      await emitEvent(t.post.workspaceId, "post.failed", { postId: t.postId, targetId, platform: p.id, account: t.account.displayName, error: err.message });
    }
  }
  await recomputePostStatus(t.postId);
}

export async function recomputePostStatus(postId: string) {
  const post = await db.post.findUnique({ where: { id: postId }, include: { targets: true } });
  if (!post || ["DRAFT", "PENDING_APPROVAL", "CHANGES_REQUESTED", "CANCELLED"].includes(post.status) && !post.targets.some((t) => ["PUBLISHED", "FAILED", "PUBLISHING", "QUEUED"].includes(t.status))) return;
  const s = post.targets.map((t) => t.status);
  const active = s.some((x) => x === "PUBLISHING" || x === "QUEUED");
  const pub = s.filter((x) => x === "PUBLISHED").length;
  const failed = s.filter((x) => x === "FAILED").length;
  const scheduled = s.filter((x) => x === "SCHEDULED").length;
  let status = post.status;
  if (active) status = "PUBLISHING";
  else if (scheduled && !pub && !failed) status = "SCHEDULED";
  else if (pub && pub === s.length) status = "PUBLISHED";
  else if (pub && (failed || scheduled)) status = "PARTIAL";
  else if (failed && !pub) status = "FAILED";
  else if (!s.length || s.every((x) => x === "DRAFT")) status = "DRAFT";
  const becamePublished = status === "PUBLISHED" && post.status !== "PUBLISHED";
  const finished = !active && !scheduled && (pub || failed);
  await db.post.update({ where: { id: postId }, data: { status, publishedAt: pub && !post.publishedAt ? new Date() : post.publishedAt } });
  if (becamePublished) {
    await notifyUsers(post.workspaceId, [post.createdById], { type: "publish_success", title: "Post published", body: `Published to ${pub} destination${pub > 1 ? "s" : ""}.`, href: `/posts/${postId}` });
    await emitEvent(post.workspaceId, "post.published", { postId });
  }
  if (finished && post.recurrence && post.status !== status) await scheduleNextOccurrence(post.id);
}

async function scheduleNextOccurrence(postId: string) {
  const p = await db.post.findUniqueOrThrow({ where: { id: postId }, include: { targets: true } });
  const r = p.recurrence as { freq: "daily" | "weekly" | "monthly"; interval: number; count: number } | null;
  if (!r || !p.scheduledAt || r.count <= 1) return;
  const next = r.freq === "daily" ? addDays(p.scheduledAt, r.interval) : r.freq === "weekly" ? addWeeks(p.scheduledAt, r.interval) : addMonths(p.scheduledAt, r.interval);
  await db.post.create({ data: {
    workspaceId: p.workspaceId, title: p.title, body: p.body, link: p.link, mediaIds: p.mediaIds, campaignId: p.campaignId, brandId: p.brandId, tags: p.tags,
    status: "SCHEDULED", scheduledAt: next, timezone: p.timezone, createdById: p.createdById, recurrence: { ...r, count: r.count - 1 }, recurrenceParentId: p.recurrenceParentId ?? p.id,
    approvedById: p.approvedById, approvedAt: p.approvedAt,
    targets: { create: p.targets.map((t) => ({ accountId: t.accountId, body: t.body, title: t.title, link: t.link, mediaIds: t.mediaIds, useCustomMedia: t.useCustomMedia,
      options: t.options as Prisma.InputJsonValue, status: "SCHEDULED", scheduledAt: next, nextAttemptAt: next })) },
  } });
}
