import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAnalytics, summarize } from "@/lib/analytics";
import { parseRange } from "@/lib/range";
import { getPlan } from "@/lib/billing";
import { env } from "@/lib/env";
import { compact, fmtDate } from "@/lib/format";
import { Card, DemoBadge, Empty, Notice, PageHeader, PlatformBadge, Stat } from "@/components/ui";
import { BarList, LineChart } from "@/components/charts";
import { PLATFORM_LIST, platformLabel } from "@/lib/platforms/registry";
import { ExplainButton } from "./ExplainButton";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireCtx();
  if (!ctx.can("analytics.view")) return <Notice tone="warn">Your role doesn&apos;t include analytics.</Notice>;
  const sp = await searchParams;
  const { from, to } = parseRange(sp);
  const f = { from, to, platform: sp.platform, accountId: sp.account, campaignId: sp.campaign, brandId: sp.brand };
  const [a, accounts, campaigns, brands, { plan }] = await Promise.all([
    getAnalytics(ctx.workspace.id, f),
    db.socialAccount.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, displayName: true, platform: true } }),
    db.campaign.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true } }),
    db.brand.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true } }),
    getPlan(ctx.workspace.organizationId),
  ]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const withFollowers = a.series.filter((s) => s.points.length);
  const shown = withFollowers.slice(0, 8);
  const tz = ctx.user.timezone;
  const totalFollowers = withFollowers.reduce((n, s) => n + (s.latest ?? 0), 0);
  const growth = withFollowers.reduce((n, s) => n + (s.change ?? 0), 0);
  return (
    <>
      <PageHeader title="Analytics" subtitle={`${fmtDate(from, tz, "MMM d, yyyy")} – ${fmtDate(to, tz, "MMM d, yyyy")}. Every number shows its source; metrics a network doesn't provide are marked unavailable, never estimated.`}
        actions={<>
          {plan.features.reports && <a className="btn-secondary" href={`/api/reports/analytics?${qs}`}>Export CSV</a>}
          {plan.features.reports && <Link className="btn-secondary" href={`/reports/analytics?${qs}`} target="_blank">PDF report</Link>}
          {env.aiConfigured && ctx.can("ai.use") && <ExplainButton summary={summarize(a, f)} />}
        </>} />
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="range" defaultValue={sp.range ?? "30"} className="input w-36"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option></select>
        <select name="platform" defaultValue={sp.platform ?? ""} className="input w-40"><option value="">All networks</option>{PLATFORM_LIST.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select name="account" defaultValue={sp.account ?? ""} className="input w-44"><option value="">All accounts</option>{accounts.map((x) => <option key={x.id} value={x.id}>{x.displayName}</option>)}</select>
        <select name="campaign" defaultValue={sp.campaign ?? ""} className="input w-44"><option value="">All campaigns</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        {brands.length > 1 && <select name="brand" defaultValue={sp.brand ?? ""} className="input w-40"><option value="">All brands</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
        <button className="btn-secondary">Apply</button>
      </form>
      {a.usesDemo && <div className="mb-4"><Notice tone="warn">Some figures come from demo accounts and are simulated sample data, labelled “demo”. They are not real network metrics.</Notice></div>}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Followers (latest)" value={withFollowers.length ? compact(totalFollowers) : "—"} hint={withFollowers.length ? `${withFollowers.length} accounts reporting` : "No follower data yet"} />
        <Stat label="Follower change" value={withFollowers.length ? `${growth >= 0 ? "+" : ""}${compact(growth)}` : "—"} tone={growth > 0 ? "good" : growth < 0 ? "bad" : undefined} hint="Within selected period" />
        <Stat label="Posts published" value={a.published} hint={`${a.withMetrics} with engagement data`} />
        <Stat label="Engagements" value={a.withMetrics ? compact(["likes", "comments", "shares", "saves"].reduce((n, k) => n + (a.totals[k] ?? 0), 0)) : "—"} hint="Likes + comments + shares + saves" />
        <Stat label="Views / impressions" value={a.totals.views || a.totals.impressions ? compact((a.totals.views ?? 0) + (a.totals.impressions ?? 0)) : "—"} hint={a.totals.views || a.totals.impressions ? "Where networks report them" : "Not reported by these networks"} />
        <Stat label="Reach" value={a.totals.reach ? compact(a.totals.reach) : "—"} hint={a.totals.reach ? "Instagram media insights" : "Unavailable"} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Follower growth" className="xl:col-span-2">
          {shown.length ? <LineChart series={shown.map((s) => ({ key: s.id, label: `${s.displayName} (${platformLabel(s.platform)})`, points: s.points }))} format="compact" /> : <Empty title="No follower history in this period" body="Orbit records follower counts every 6 hours for connected accounts whose network exposes them." />}
          {withFollowers.length > 8 && <p className="muted mt-2 text-xs">Showing the first 8 accounts; filter to see others.</p>}
        </Card>
        <Card title="Engagement by network">
          {a.byPlatform.length ? <BarList rows={a.byPlatform.sort((x, y) => y.engagement - x.engagement).map((p) => ({ key: p.platform, label: <><PlatformBadge id={p.platform} size={14} /> {platformLabel(p.platform)} <span className="muted">· {p.posts} posts</span></>, value: p.engagement, hint: `avg ${p.avg.toFixed(1)} per post` }))} format="compact" />
            : <Empty title="No engagement data yet" body="Post metrics are collected from networks that expose them after publishing." />}
        </Card>
        <Card title="Accounts" className="xl:col-span-2" pad={false}>
          <div className="overflow-x-auto"><table className="table w-full"><thead><tr><th>Account</th><th>Followers</th><th>Change</th><th>Other</th><th>Source & as-of</th></tr></thead><tbody>
            {a.series.map((s) => (<tr key={s.id}><td><span className="flex items-center gap-2"><PlatformBadge id={s.platform} size={16} />{s.displayName}{s.isDemo && <DemoBadge />}</span></td>
              <td className="tabular-nums">{s.latest !== null ? s.latest.toLocaleString() : <span className="muted">unavailable</span>}</td>
              <td className={s.change ? (s.change > 0 ? "text-emerald-600" : "text-red-500") : "muted"}>{s.change !== null ? `${s.change >= 0 ? "+" : ""}${s.change.toLocaleString()}` : "—"}</td>
              <td className="text-xs">{Object.entries(s.other).map(([k, v]) => <span key={k} className="mr-2" title={v.source}>{k}: <b>{compact(v.value)}</b></span>)}</td>
              <td className="muted text-xs">{s.source ? `${s.source} · ${fmtDate(s.lastAt, tz, "MMM d HH:mm")}` : "No data collected"}</td></tr>))}
            {!a.series.length && <tr><td colSpan={5} className="muted text-center">No accounts match.</td></tr>}
          </tbody></table></div>
        </Card>
        <Card title="Content type performance">
          {a.byType.length ? <BarList rows={a.byType.map((t) => ({ key: t.type, label: <span className="capitalize">{t.type} <span className="muted">· {t.posts}</span></span>, value: Math.round(t.avg) }))} /> : <Empty title="Not enough data" />}
          {a.byType.length > 0 && <p className="muted mt-2 text-xs">Average engagements per post.</p>}
        </Card>
        <Card title="Top-performing posts" className="xl:col-span-3" pad={false}>
          {a.top.length === 0 ? <Empty title="No post metrics in this period" /> : (
            <div className="overflow-x-auto"><table className="table w-full"><thead><tr><th>Post</th><th>Network</th><th>Likes</th><th>Comments</th><th>Shares</th><th>Views</th><th>Eng. rate</th><th>Source</th></tr></thead><tbody>
              {a.top.map((p) => (<tr key={p.targetId}><td className="max-w-xs"><Link href={`/posts/${p.postId}`} className="line-clamp-2 hover:underline">{p.text}</Link></td>
                <td><span className="flex items-center gap-1.5"><PlatformBadge id={p.platform} size={14} /> {p.account}{p.isDemo && <DemoBadge />}</span></td>
                {["likes", "comments", "shares"].map((k) => <td key={k} className="tabular-nums">{p.metrics[k]?.toLocaleString() ?? <span className="muted">n/a</span>}</td>)}
                <td className="tabular-nums">{(p.metrics.views ?? p.metrics.impressions)?.toLocaleString() ?? <span className="muted">n/a</span>}</td>
                <td>{p.engagementRate !== null ? `${(p.engagementRate * 100).toFixed(1)}%` : <span className="muted">n/a</span>}</td>
                <td className="muted max-w-[200px] text-[11px]">{p.sources.join("; ")}</td></tr>))}
            </tbody></table></div>)}
        </Card>
      </div>
    </>
  );
}
