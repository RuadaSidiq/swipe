import { db } from "./db";
import type { Prisma } from "@prisma/client";

export interface AnalyticsFilter { from: Date; to: Date; platform?: string; accountId?: string; campaignId?: string; brandId?: string }
const ENG = ["likes", "comments", "shares", "saves"] as const;

export async function getAnalytics(workspaceId: string, f: AnalyticsFilter) {
  const accWhere: Prisma.SocialAccountWhereInput = { workspaceId, ...(f.platform ? { platform: f.platform } : {}), ...(f.accountId ? { id: f.accountId } : {}), ...(f.brandId ? { brandId: f.brandId } : {}) };
  const accounts = await db.socialAccount.findMany({ where: accWhere, select: { id: true, platform: true, displayName: true, isDemo: true, status: true } });
  const ids = accounts.map((a) => a.id);
  const snaps = await db.metricSnapshot.findMany({ where: { accountId: { in: ids }, targetId: null, periodEnd: { gte: f.from, lte: f.to } }, orderBy: { periodEnd: "asc" } });
  const series = accounts.map((a) => {
    const fol = snaps.filter((s) => s.accountId === a.id && s.metric === "followers");
    const byDay = new Map<string, number>(); for (const s of fol) byDay.set(s.periodEnd.toISOString().slice(0, 10), s.value);
    const points = [...byDay.entries()].map(([d, v]) => ({ date: d, value: v }));
    const other = snaps.filter((s) => s.accountId === a.id && s.metric !== "followers");
    const latestOther: Record<string, { value: number; source: string }> = {};
    for (const s of other) latestOther[s.metric] = { value: s.value, source: s.source };
    return { ...a, points, latest: points.at(-1)?.value ?? null, change: points.length > 1 ? points.at(-1)!.value - points[0].value : null,
      source: fol.at(-1)?.source ?? null, lastAt: fol.at(-1)?.periodEnd ?? null, other: latestOther };
  });

  const targets = await db.postTarget.findMany({
    where: { accountId: { in: ids }, status: "PUBLISHED", publishedAt: { gte: f.from, lte: f.to }, ...(f.campaignId ? { post: { campaignId: f.campaignId } } : {}) },
    include: { post: { select: { id: true, title: true, body: true, mediaIds: true, campaignId: true } }, account: { select: { platform: true, displayName: true, isDemo: true } }, metrics: { orderBy: { collectedAt: "desc" } } },
  });
  const mediaKinds = new Map((await db.mediaAsset.findMany({ where: { workspaceId, id: { in: [...new Set(targets.flatMap((t) => t.post.mediaIds))] } }, select: { id: true, kind: true } })).map((m) => [m.id, m.kind]));
  const posts = targets.map((t) => {
    const m: Record<string, number> = {}; const sources = new Set<string>();
    for (const s of t.metrics) if (m[s.metric] === undefined) { m[s.metric] = s.value; sources.add(s.source); }
    const eng = ENG.reduce((n, k) => n + (m[k] ?? 0), 0);
    const reachBase = m.reach ?? m.impressions ?? m.views;
    const kinds = t.post.mediaIds.map((id) => mediaKinds.get(id));
    const type = kinds.includes("video") ? "video" : kinds.length > 1 ? "carousel" : kinds.length ? "image" : "text";
    return { targetId: t.id, postId: t.post.id, platform: t.account.platform, account: t.account.displayName, isDemo: t.account.isDemo, text: t.post.title || t.post.body.slice(0, 120),
      publishedAt: t.publishedAt, metrics: m, engagement: eng, engagementRate: reachBase ? eng / reachBase : null, hasMetrics: t.metrics.length > 0, sources: [...sources], type, url: t.externalUrl };
  });
  const withM = posts.filter((p) => p.hasMetrics);
  const totals: Record<string, number> = {};
  for (const p of withM) for (const [k, v] of Object.entries(p.metrics)) totals[k] = (totals[k] ?? 0) + v;
  const byPlatform = Object.entries(withM.reduce<Record<string, { posts: number; engagement: number; views: number }>>((acc, p) => {
    const x = (acc[p.platform] ??= { posts: 0, engagement: 0, views: 0 }); x.posts++; x.engagement += p.engagement; x.views += p.metrics.views ?? p.metrics.impressions ?? 0; return acc; }, {}))
    .map(([platform, v]) => ({ platform, ...v, avg: v.engagement / v.posts }));
  const byType = Object.entries(withM.reduce<Record<string, { posts: number; engagement: number }>>((acc, p) => { const x = (acc[p.type] ??= { posts: 0, engagement: 0 }); x.posts++; x.engagement += p.engagement; return acc; }, {}))
    .map(([type, v]) => ({ type, ...v, avg: v.engagement / v.posts }));
  const usesDemo = posts.some((p) => p.isDemo) || series.some((s) => s.isDemo && s.points.length);
  return { series, posts, top: [...withM].sort((a, b) => b.engagement - a.engagement).slice(0, 10), totals, byPlatform, byType, published: posts.length, withMetrics: withM.length, usesDemo };
}

/** Plain-text summary fed to the AI explainer — includes sources and period so it can't invent numbers. */
export function summarize(a: Awaited<ReturnType<typeof getAnalytics>>, f: AnalyticsFilter) {
  const lines = [`Reporting period: ${f.from.toISOString().slice(0, 10)} to ${f.to.toISOString().slice(0, 10)}`];
  for (const s of a.series) lines.push(`${s.platform} "${s.displayName}": followers ${s.latest ?? "not available"}${s.change !== null ? ` (change ${s.change >= 0 ? "+" : ""}${s.change})` : ""}${s.source ? ` [source: ${s.source}]` : ""}${s.isDemo ? " [DEMO DATA]" : ""}`);
  lines.push(`Published posts in period: ${a.published}; posts with engagement data: ${a.withMetrics}`);
  lines.push(`Totals across posts with data: ${JSON.stringify(a.totals)}`);
  for (const p of a.byPlatform) lines.push(`By platform ${p.platform}: ${p.posts} posts, ${p.engagement} engagements, avg ${p.avg.toFixed(1)}`);
  for (const t of a.byType) lines.push(`By content type ${t.type}: ${t.posts} posts, avg engagement ${t.avg.toFixed(1)}`);
  for (const p of a.top.slice(0, 5)) lines.push(`Top post (${p.platform}): "${p.text}" — ${JSON.stringify(p.metrics)}`);
  return lines.join("\n");
}
