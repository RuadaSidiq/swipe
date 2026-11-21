import Link from "next/link";
import { addDays, subDays } from "date-fns";
import type { Prisma } from "@prisma/client";
import { Inbox, CheckCircle2, AlertTriangle, PlugZap, MessageSquare, ChevronRight } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAnalytics } from "@/lib/analytics";
import { compact, fmtDate } from "@/lib/format";
import { Avatar, Card, Empty, Notice, StatusBadge } from "@/components/ui";
import { LineChart, Sparkline } from "@/components/charts";
import { Rundown } from "@/components/Rundown";
import { PLATFORM_LIST, platformLabel } from "@/lib/platforms/registry";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ platform?: string; brand?: string; range?: string; welcome?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const ws = ctx.workspace.id; const tz = ctx.user.timezone;
  const days = Number(sp.range ?? 30) || 30;
  const acctFilter: Prisma.SocialAccountWhereInput = { ...(sp.platform ? { platform: sp.platform } : {}), ...(sp.brand ? { brandId: sp.brand } : {}) };
  const filtered = Object.keys(acctFilter).length > 0;
  const tf: Prisma.PostWhereInput = filtered ? { targets: { some: { account: acctFilter } } } : {};
  const cf: Prisma.ConversationWhereInput = filtered ? { account: acctFilter } : {};
  const [accounts, counts, unread, unanswered, rundown, failed, mentions, analytics, brands] = await Promise.all([
    db.socialAccount.findMany({ where: { workspaceId: ws, status: { not: "DISCONNECTED" }, ...acctFilter }, select: { id: true, platform: true, displayName: true, avatarUrl: true, status: true } }),
    db.post.groupBy({ by: ["status"], where: { workspaceId: ws, ...tf }, _count: true }),
    db.conversation.count({ where: { workspaceId: ws, unread: true, status: { in: ["OPEN", "PENDING"] }, ...cf } }),
    db.conversation.count({ where: { workspaceId: ws, awaitingReply: true, kind: { in: ["comment", "reply"] }, status: { in: ["OPEN", "PENDING"] }, ...cf } }),
    db.post.findMany({ where: { workspaceId: ws, ...tf, OR: [{ scheduledAt: { gte: subDays(new Date(), 2), lte: addDays(new Date(), 7) } }, { publishedAt: { gte: subDays(new Date(), 2) } }], status: { notIn: ["DRAFT", "CANCELLED"] } },
      take: 80, include: { targets: { select: { account: { select: { platform: true } } } } } }),
    db.postTarget.count({ where: { status: "FAILED", post: { workspaceId: ws }, updatedAt: { gte: subDays(new Date(), 14) }, ...(filtered ? { account: acctFilter } : {}) } }),
    db.conversation.count({ where: { workspaceId: ws, kind: "mention", unread: true, ...cf } }),
    ctx.can("analytics.view") ? getAnalytics(ws, { from: subDays(new Date(), days), to: new Date(), platform: sp.platform, brandId: sp.brand }) : null,
    db.brand.findMany({ where: { workspaceId: ws }, select: { id: true, name: true } }),
  ]);
  const c = (s: string[]) => counts.filter((x) => s.includes(x.status)).reduce((n, x) => n + x._count, 0);
  const approvals = c(["PENDING_APPROVAL"]);
  const reconnect = accounts.filter((a) => a.status !== "CONNECTED");

  // Follower chart: one line per network (sum of its accounts), so the legend is readable.
  const byNet = new Map<string, Map<string, number>>();
  for (const s of analytics?.series ?? []) {
    const m = byNet.get(s.platform) ?? new Map<string, number>();
    for (const p of s.points) m.set(p.date, (m.get(p.date) ?? 0) + p.value);
    byNet.set(s.platform, m);
  }
  const netSeries = [...byNet.entries()].filter(([, m]) => m.size).sort((a, b) => Math.max(...b[1].values()) - Math.max(...a[1].values()))
    .slice(0, 6).map(([p, m]) => ({ key: p, label: platformLabel(p), points: [...m.entries()].sort().map(([date, value]) => ({ date, value })) }));
  const totalFollowers = (analytics?.series ?? []).reduce((n, s) => n + (s.latest ?? 0), 0);
  const growth = (analytics?.series ?? []).reduce((n, s) => n + (s.change ?? 0), 0);
  const eng = analytics ? ["likes", "comments", "shares", "saves"].reduce((n, k) => n + (analytics.totals[k] ?? 0), 0) : 0;

  const todo = [
    { show: unread > 0, icon: Inbox, text: `${unread} unread message${unread === 1 ? "" : "s"}`, href: "/inbox?f=unread", tone: "#2F7FD6" },
    { show: unanswered > 0, icon: MessageSquare, text: `${unanswered} comment${unanswered === 1 ? "" : "s"} to answer`, href: "/inbox?f=awaiting&type=comment", tone: "#2F7FD6" },
    { show: approvals > 0 && ctx.can("posts.approve"), icon: CheckCircle2, text: `${approvals} post${approvals === 1 ? "" : "s"} to approve`, href: "/posts?status=PENDING_APPROVAL", tone: "#D99A0B" },
    { show: failed > 0, icon: AlertTriangle, text: `${failed} failed publish${failed === 1 ? "" : "es"}`, href: "/posts?status=FAILED", tone: "#E5484D" },
    { show: reconnect.length > 0, icon: PlugZap, text: `Reconnect ${reconnect.map((a) => a.displayName).join(", ")}`, href: "/accounts", tone: "#E5484D" },
    { show: mentions > 0, icon: MessageSquare, text: `${mentions} new mention${mentions === 1 ? "" : "s"}`, href: "/inbox?type=mention", tone: "#2F7FD6" },
  ].filter((t) => t.show);
  const hour = Number(fmtDate(new Date(), tz, "H"));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-[28px] font-semibold leading-tight">Good {hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, {ctx.user.name.split(" ")[0]}</h1>
        <form className="flex flex-wrap gap-2">
          <select name="platform" defaultValue={sp.platform ?? ""} className="input w-auto py-1.5" aria-label="Network"><option value="">All networks</option>{PLATFORM_LIST.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          {brands.length > 1 && <select name="brand" defaultValue={sp.brand ?? ""} className="input w-auto py-1.5" aria-label="Brand"><option value="">All brands</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
          <button className="btn-secondary py-1.5">Apply</button>
        </form>
      </div>

      {sp.welcome && accounts.length === 0 && <Notice tone="info"><Link className="font-medium underline" href="/accounts">Connect your first account</Link> to get started.</Notice>}

      <Rundown tz={tz} items={rundown.map((p) => ({ id: p.id, at: (p.publishedAt ?? p.scheduledAt ?? p.createdAt).toISOString(), text: p.title || p.body, status: p.status, platforms: p.targets.map((t) => t.account.platform) }))} />

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <section aria-label="Needs you">
          <h2 className="section-title mb-3 flex h-8 items-center">Needs you</h2>
          {todo.length === 0 ? (
            <div className="panel flex items-center gap-3 px-4 py-4 text-sm"><CheckCircle2 size={18} className="text-emerald-700 dark:text-emerald-400" /> All clear.</div>
          ) : (
            <ul className="panel divide-y" style={{ borderColor: "var(--line)" }}>
              {todo.map((t) => (
                <li key={t.text} style={{ borderColor: "var(--line)" }}>
                  <Link href={t.href} className="flex items-center gap-3 px-4 py-3 text-sm transition hover:bg-[var(--soft)]">
                    <t.icon size={17} style={{ color: t.tone }} /><span className="flex-1">{t.text}</span><ChevronRight size={16} className="muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <h2 className="section-title mb-3 mt-6">At a glance</h2>
          <dl className="panel grid grid-cols-2 gap-px overflow-hidden" style={{ background: "var(--line)" }}>
            {[["Scheduled", c(["SCHEDULED"]), "/posts?status=SCHEDULED"], ["Published", c(["PUBLISHED", "PARTIAL"]), "/posts?status=PUBLISHED"], ["Drafts", c(["DRAFT", "CHANGES_REQUESTED"]), "/posts?status=DRAFT"], ["Accounts", accounts.length, "/accounts"]].map(([l, v, h]) => (
              <Link key={l as string} href={h as string} className="block px-4 py-3 transition hover:bg-[var(--soft)]" style={{ background: "var(--panel)" }}>
                <dt className="muted text-[13px]">{l}</dt><dd className="num mt-1 text-2xl font-semibold">{v}</dd>
              </Link>
            ))}
          </dl>
        </section>

        <section aria-label="Audience">
          <div className="mb-3 flex h-8 items-center justify-between gap-3">
            <h2 className="section-title">Audience</h2>
            <div className="flex gap-1 text-sm">{[7, 30, 90].map((d) => <Link key={d} href={`/dashboard?${new URLSearchParams({ ...(sp.platform ? { platform: sp.platform } : {}), range: String(d) })}`} className={d === days ? "tab-link" : "tab-link"} data-active={d === days}>{d}d</Link>)}</div>
          </div>
          <div className="panel px-5 pb-4 pt-5">
            <div className="mb-4 flex flex-wrap gap-x-10 gap-y-3">
              <div><div className="muted text-[13px]">Followers</div><div className="num text-[34px] font-semibold leading-tight">{totalFollowers ? compact(totalFollowers) : "—"}</div></div>
              <div><div className="muted text-[13px]">Change</div><div className={`num text-[34px] font-semibold leading-tight ${growth > 0 ? "text-emerald-700 dark:text-emerald-400" : growth < 0 ? "text-red-600 dark:text-red-400" : ""}`}>{growth ? `${growth > 0 ? "+" : ""}${compact(growth)}` : "—"}</div></div>
              <div><div className="muted text-[13px]">Engagements</div><div className="num text-[34px] font-semibold leading-tight">{analytics?.withMetrics ? compact(eng) : "—"}</div></div>
            </div>
            {netSeries.length ? <LineChart series={netSeries} height={200} format="compact" /> : <Empty title="No follower data yet" />}
            {analytics?.usesDemo && <p className="muted mt-2 text-xs">Includes simulated demo data.</p>}
          </div>
        </section>
      </div>

      <section aria-label="Accounts">
        <div className="mb-3 flex items-end justify-between"><h2 className="section-title">Accounts</h2><Link href="/accounts" className="text-sm text-[var(--accent)]">Manage</Link></div>
        {accounts.length === 0 ? <Card><Empty title="No accounts yet" action={<Link href="/accounts" className="btn-primary">Connect an account</Link>} /></Card> : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {accounts.slice(0, 8).map((a) => { const s = analytics?.series.find((x) => x.id === a.id); return (
              <div key={a.id} className="panel flex items-center gap-3 px-4 py-3">
                <Avatar src={a.avatarUrl} name={a.displayName} size={34} platform={a.platform} />
                <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{a.displayName}</div>
                  <div className="muted text-xs">{a.status !== "CONNECTED" ? <StatusBadge status={a.status} /> : s?.latest != null ? `${compact(s.latest)} followers` : platformLabel(a.platform)}</div></div>
                {s && <Sparkline points={s.points.map((p) => p.value)} />}
              </div>); })}
          </div>
        )}
      </section>
    </div>
  );
}
