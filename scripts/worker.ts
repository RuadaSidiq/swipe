/**
 * Background worker: publishing queue, automation outbox, analytics sync, token refresh and reminders.
 * Run one or more instances: `npm run worker`. All jobs use row locks, so instances can scale horizontally.
 */
import { db } from "../src/lib/db";
import { claimDueTargets, publishTarget, releaseStaleLocks } from "../src/lib/publishing";
import { processEvent } from "../src/lib/automation";
import { ADAPTERS } from "../src/lib/platforms/adapters";
import { freshAccount, markAuthProblem } from "../src/lib/accounts";
import { PlatformError } from "../src/lib/platforms/http";
import { notifyUsers } from "../src/lib/notify";
import type { PlatformId } from "../src/lib/platforms/registry";
import { postMetrics } from "../src/lib/platforms/adapters/postMetrics";
import { ingest } from "../src/lib/inbox";

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

async function publishTick() {
  await releaseStaleLocks();
  const ids = await claimDueTargets(10);
  await Promise.all(ids.map(async (id) => {
    try { await publishTarget(id); log("published target", id); } catch (e) { log("publish error", id, (e as Error).message); }
  }));
  return ids.length;
}

async function eventsTick() {
  const evs = await db.$queryRaw<{ id: string }[]>`
    UPDATE "JobEvent" SET "processedAt" = now() WHERE "id" IN (
      SELECT "id" FROM "JobEvent" WHERE "processedAt" IS NULL ORDER BY "createdAt" LIMIT 25 FOR UPDATE SKIP LOCKED) RETURNING "id"`;
  for (const { id } of evs) {
    const ev = await db.jobEvent.findUniqueOrThrow({ where: { id } });
    try { await processEvent(ev); } catch (e) { log("automation error", id, (e as Error).message); }
  }
}

async function metricsTick() {
  const due = await db.socialAccount.findMany({ where: { status: "CONNECTED", isDemo: false, OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: new Date(Date.now() - 6 * 3600_000) } }] }, take: 20 });
  for (const a of due) {
    const adapter = ADAPTERS[a.platform as PlatformId];
    await db.socialAccount.update({ where: { id: a.id }, data: { lastSyncedAt: new Date() } });
    if (!adapter.metrics) continue;
    try {
      const { acc } = await freshAccount(a.id);
      const points = await adapter.metrics(acc);
      await db.metricSnapshot.createMany({ data: points.map((p) => ({ accountId: a.id, ...p })) });
    } catch (e) {
      if (e instanceof PlatformError && e.auth) await markAuthProblem(a, e.message);
      log("metrics error", a.platform, a.id, (e as Error).message);
    }
  }
}

async function postMetricsTick() {
  const due = await db.postTarget.findMany({ where: { status: "PUBLISHED", simulated: false, externalId: { not: null }, publishedAt: { gt: new Date(Date.now() - 30 * 86400_000) },
    account: { status: "CONNECTED", isDemo: false }, NOT: { metrics: { some: { collectedAt: { gt: new Date(Date.now() - 6 * 3600_000) } } } } }, include: { account: true }, take: 25 });
  for (const t of due) {
    const fn = postMetrics[t.account.platform];
    if (!fn) continue;
    try {
      const { acc } = await freshAccount(t.accountId);
      const points = await fn(acc, t.externalId!, t.publishedAt!);
      await db.metricSnapshot.createMany({ data: points.map((p) => ({ accountId: t.accountId, targetId: t.id, ...p })) });
    } catch (e) { log("post metrics error", t.id, (e as Error).message); }
  }
}

/** Inbox polling for networks without webhooks (YouTube, Reddit, X, Threads). Cursor + timing live in account.meta. */
const POLL_EVERY_MIN: Record<string, number> = { x: 5, youtube: 3, reddit: 2, threads: 3 };
async function pollTick() {
  const accs = await db.socialAccount.findMany({ where: { status: "CONNECTED", isDemo: false, platform: { in: Object.keys(POLL_EVERY_MIN) } } });
  for (const a of accs) {
    const meta = (a.meta ?? {}) as Record<string, any>;
    const last = meta.lastPolledAt ? new Date(meta.lastPolledAt).getTime() : 0;
    const backoff = meta.pollBackoffMin ?? 0;
    if (Date.now() - last < (POLL_EVERY_MIN[a.platform] + backoff) * 60_000) continue;
    const adapter = ADAPTERS[a.platform as PlatformId];
    if (!adapter.poll) continue;
    try {
      const { acc } = await freshAccount(a.id);
      const { items, cursor } = await adapter.poll(acc, meta.pollCursor ?? null);
      for (const it of items.sort((x, y) => (x.at?.getTime() ?? 0) - (y.at?.getTime() ?? 0))) await ingest(a, it);
      await db.socialAccount.update({ where: { id: a.id }, data: { meta: { ...meta, pollCursor: cursor, lastPolledAt: new Date().toISOString(), pollBackoffMin: 0, pollError: null } } });
      if (items.length) log("polled", a.platform, a.id, items.length, "items");
    } catch (e) {
      const err = e as Error;
      if (e instanceof PlatformError && e.auth) await markAuthProblem(a, err.message);
      // Rate limits / paid-tier errors: back off up to an hour instead of hammering the API.
      await db.socialAccount.update({ where: { id: a.id }, data: { meta: { ...meta, lastPolledAt: new Date().toISOString(), pollBackoffMin: Math.min(60, Math.max(5, backoff * 2)), pollError: err.message.slice(0, 300) } } });
      log("poll error", a.platform, a.id, err.message);
    }
  }
}

async function tokenTick() {
  const soon = await db.socialAccount.findMany({ where: { status: "CONNECTED", isDemo: false, tokenExpiresAt: { lt: new Date(Date.now() + 24 * 3600_000) } }, take: 20 });
  for (const a of soon) {
    if (!ADAPTERS[a.platform as PlatformId].refresh) {
      if (a.tokenExpiresAt && a.tokenExpiresAt < new Date()) await markAuthProblem(a, "Access token expired. Reconnect the account.");
      continue;
    }
    if (a.tokenExpiresAt && a.tokenExpiresAt.getTime() - Date.now() > 10 * 60_000 && a.platform !== "threads") continue;
    try { await freshAccount(a.id); } catch (e) { log("refresh error", a.id, (e as Error).message); }
  }
}

async function reminderTick() {
  const soon = await db.post.findMany({ where: { status: "SCHEDULED", scheduledAt: { gte: new Date(Date.now() + 14 * 60_000), lt: new Date(Date.now() + 15 * 60_000) } } });
  for (const p of soon) await notifyUsers(p.workspaceId, [p.createdById], { type: "schedule_reminder", title: "Post publishing in 15 minutes", body: p.body.slice(0, 120), href: `/posts/${p.id}` });
}

async function main() {
  log("worker started");
  let tick = 0;
  while (!stopping) {
    try {
      const n = await publishTick();
      await eventsTick();
      if (tick % 4 === 0) await reminderTick();
      if (tick % 4 === 2) await pollTick();
      if (tick % 20 === 0) await tokenTick();
      if (tick % 40 === 0) await metricsTick();
      if (tick % 40 === 20) await postMetricsTick();
      tick++;
      if (n === 0) await new Promise((r) => setTimeout(r, 15_000));
    } catch (e) { log("tick error", (e as Error).message); await new Promise((r) => setTimeout(r, 15_000)); }
  }
  await db.$disconnect();
  log("worker stopped");
}
main();
