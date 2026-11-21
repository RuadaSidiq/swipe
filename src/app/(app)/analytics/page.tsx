import Link from "next/link";
import { subDays } from "date-fns";
import { Users, Heart, Eye, Send, ChevronDown, Download, FileText } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAnalytics, summarize } from "@/lib/analytics";
import { parseRange } from "@/lib/range";
import { getPlan } from "@/lib/billing";
import { env } from "@/lib/env";
import { compact, fmtDate } from "@/lib/format";
import { Card, Empty, Notice, PageHeader, PlatformBadge, Stat } from "@/components/ui";
import { BarList, LineChart } from "@/components/charts";
import { PLATFORM_LIST, platformLabel } from "@/lib/platforms/registry";
import { ExplainButton } from "./ExplainButton";

export const metadata = { title: "Analytics" };
const ENG = ["likes", "comments", "shares", "saves"];

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireCtx();
  if (!ctx.can("analytics.view")) return <Notice tone="warn">Your role doesn&apos;t include analytics.</Notice>;
  const sp = await searchParams;
  const range = sp.range ?? "30";
  const { from, to } = parseRange({ ...sp, range });
  const f = { from, to, platform: sp.platform, accountId: sp.account, campaignId: sp.campaign, brandId: sp.brand };
  const span = to.getTime() - from.getTime();
  const [a, prev, accounts, campaigns, { plan }] = await Promise.all([
    getAnalytics(ctx.workspace.id, f),
    getAnalytics(ctx.workspace.id, { ...f, from: new Date(from.getTime() - span), to: from }),
    db.socialAccount.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, displayName: true, platform: true } }),
    db.campaign.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true } }),
    getPlan(ctx.workspace.organizationId),
  ]);
  const tz = ctx.user.timezone;
  const qs = (o: Record<string, string>) => new URLSearchParams(Object.entries({ ...sp, ...o }).filter(([, v]) => v) as [string, string][]).toString();
  const pct = (x: number, y: number) => (y ? ((x - y) / y) * 100 : null);
  const followers = a.series.reduce((n, s) => n + (s.latest ?? 0), 0);
  const prevFollowers = prev.series.reduce((n, s) => n + (s.latest ?? 0), 0);
  const eng = ENG.reduce((n, k) => n + (a.totals[k] ?? 0), 0);
  const prevEng = ENG.reduce((n, k) => n + (prev.totals[k] ?? 0), 0);
  const views = (a.totals.views ?? 0) + (a.totals.impressions ?? 0);
  const prevViews = (prev.totals.views ?? 0) + (prev.totals.impressions ?? 0);

  // One line: total followers across the selection.
  const byDate = new Map<string, number>();
  for (const s of a.series) for (const p of s.points) byDate.set(p.date, (byDate.get(p.date) ?? 0) + p.value);
  const total = [...byDate.entries()].sort().map(([date, value]) => ({ date, value }));
  const filtered = Boolean(sp.platform || sp.account || sp.campaign);

  return (
    <>
      <PageHeader title="Analytics" subtitle={`${fmtDate(from, tz, "MMM d")} – ${fmtDate(to, tz, "MMM d, yyyy")}${a.usesDemo ? " · includes demo data" : ""}`}
        actions={<div className="panel flex gap-1 p-1">{["7", "30", "90"].map((r) => <Link key={r} href={`/analytics?${qs({ range: r })}`} className="tab-link" data-active={range === r}>{r} days</Link>)}</div>} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={<Users size={17} />} label="Followers" value={followers ? compact(followers) : "—"} change={pct(followers, prevFollowers)} hint="vs previous period" />
        <Stat icon={<Heart size={17} />} label="Engagement" value={a.withMetrics ? compact(eng) : "—"} change={pct(eng, prevEng)} hint="Likes, comments, shares" />
        <Stat icon={<Eye size={17} />} label="Views" value={views ? compact(views) : "—"} change={pct(views, prevViews)} hint={views ? "Where reported" : "Not reported"} />
        <Stat icon={<Send size={17} />} label="Posts" value={a.published} change={pct(a.published, prev.published)} hint="Published" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card title="Followers over time">
          {total.length > 1 ? <LineChart series={[{ key: "total", label: "Followers", points: total }]} height={240} format="compact" /> : <Empty title="No follower data yet" body="Updated every 6 hours." />}
        </Card>
        <Card title="Top posts" pad={false}>
          {a.top.length === 0 ? <Empty title="No post data yet" /> : (
            <ol className="px-3 pb-2">
              {a.top.slice(0, 5).map((p) => (
                <li key={p.targetId}>
                  <Link href={`/posts/${p.postId}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-[var(--soft)]">
                    <PlatformBadge id={p.platform} size={30} />
                    <span className="min-w-0 flex-1 truncate text-sm">{p.text}</span>
                    <span className="num text-sm font-semibold">{compact(p.engagement)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      <details className="group mt-6" open={filtered || undefined}>
        <summary className="panel flex cursor-pointer list-none items-center justify-between px-6 py-4 [&::-webkit-details-marker]:hidden">
          <span className="section-title">Detailed report</span>
          <span className="muted flex items-center gap-1 text-sm">Filters, breakdowns and export <ChevronDown size={16} className="transition group-open:rotate-180" /></span>
        </summary>
        <div className="mt-4 flex flex-col gap-6">
          <form className="flex flex-wrap gap-2">
            <input type="hidden" name="range" value={range} />
            <select name="platform" defaultValue={sp.platform ?? ""} className="input w-auto" aria-label="Network"><option value="">All networks</option>{PLATFORM_LIST.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <select name="account" defaultValue={sp.account ?? ""} className="input w-auto" aria-label="Account"><option value="">All accounts</option>{accounts.map((x) => <option key={x.id} value={x.id}>{x.displayName} ({platformLabel(x.platform)})</option>)}</select>
            {campaigns.length > 0 && <select name="campaign" defaultValue={sp.campaign ?? ""} className="input w-auto" aria-label="Campaign"><option value="">All campaigns</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
            <button className="btn-secondary">Apply</button>
            <div className="flex-1" />
            {plan.features.reports && <a className="btn-secondary" href={`/api/reports/analytics?${qs({ range })}`}><Download size={15} /> CSV</a>}
            {plan.features.reports && <Link className="btn-secondary" href={`/reports/analytics?${qs({ range })}`} target="_blank"><FileText size={15} /> PDF</Link>}
            {env.aiConfigured && ctx.can("ai.use") && <ExplainButton summary={summarize(a, f)} />}
          </form>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Engagement by network">
              {a.byPlatform.length ? <BarList format="compact" rows={a.byPlatform.sort((x, y) => y.engagement - x.engagement).map((p) => ({ key: p.platform, label: <><PlatformBadge id={p.platform} size={18} /> {platformLabel(p.platform)}</>, value: p.engagement, hint: `${p.posts} posts` }))} /> : <Empty title="No data yet" />}
            </Card>
            <Card title="Engagement by content type">
              {a.byType.length ? <BarList rows={a.byType.map((t) => ({ key: t.type, label: <span className="capitalize">{t.type}</span>, value: Math.round(t.avg), hint: `${t.posts} posts, average per post` }))} /> : <Empty title="No data yet" />}
            </Card>
          </div>

          <Card title="Accounts" pad={false}>
            <div className="overflow-x-auto"><table className="table w-full"><thead><tr><th>Account</th><th>Followers</th><th>Change</th><th>Source</th></tr></thead><tbody>
              {a.series.map((s) => (
                <tr key={s.id}>
                  <td><span className="flex items-center gap-2.5"><PlatformBadge id={s.platform} size={24} />{s.displayName}</span></td>
                  <td className="num">{s.latest !== null ? s.latest.toLocaleString() : <span className="muted">—</span>}</td>
                  <td className={s.change ? (s.change > 0 ? "text-brand-600 dark:text-brand-400" : "text-red-600 dark:text-red-400") : "muted"}>{s.change !== null ? `${s.change >= 0 ? "+" : ""}${s.change.toLocaleString()}` : "—"}</td>
                  <td className="muted text-xs">{s.source ?? "Not collected"}</td>
                </tr>
              ))}
            </tbody></table></div>
          </Card>
        </div>
      </details>
    </>
  );
}
