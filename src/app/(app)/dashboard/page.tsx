import Link from "next/link";
import { subDays } from "date-fns";
import type { Prisma } from "@prisma/client";
import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAnalytics } from "@/lib/analytics";
import { compact, fmtDate } from "@/lib/format";
import { Avatar, Card, DemoBadge, Empty, Notice, PageHeader, PlatformBadge, Stat, StatusBadge } from "@/components/ui";
import { LineChart, Sparkline } from "@/components/charts";
import { PLATFORM_LIST, platformLabel } from "@/lib/platforms/registry";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ platform?: string; account?: string; brand?: string; range?: string; welcome?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const ws = ctx.workspace.id; const tz = ctx.user.timezone;
  const days = Number(sp.range ?? 30) || 30;
  const from = subDays(new Date(), days);
  const acctFilter: Prisma.SocialAccountWhereInput = { ...(sp.platform ? { platform: sp.platform } : {}), ...(sp.account ? { id: sp.account } : {}), ...(sp.brand ? { brandId: sp.brand } : {}) };
  const tf: Prisma.PostWhereInput = Object.keys(acctFilter).length ? { targets: { some: { account: acctFilter } } } : {};
  const cf: Prisma.ConversationWhereInput = Object.keys(acctFilter).length ? { account: acctFilter } : {};
  const [accounts, counts, unread, unanswered, mentions, upcoming, failed, activity, notifications, analytics, brands] = await Promise.all([
    db.socialAccount.findMany({ where: { workspaceId: ws, status: { not: "DISCONNECTED" }, ...acctFilter }, select: { id: true, platform: true, displayName: true, avatarUrl: true, status: true, statusMessage: true, isDemo: true } }),
    db.post.groupBy({ by: ["status"], where: { workspaceId: ws, ...tf }, _count: true }),
    db.conversation.count({ where: { workspaceId: ws, unread: true, status: { in: ["OPEN", "PENDING"] }, ...cf } }),
    db.conversation.count({ where: { workspaceId: ws, awaitingReply: true, kind: { in: ["comment", "reply"] }, status: { in: ["OPEN", "PENDING"] }, ...cf } }),
    db.conversation.findMany({ where: { workspaceId: ws, kind: "mention", ...cf }, orderBy: { lastMessageAt: "desc" }, take: 5, include: { account: { select: { platform: true } }, contact: { select: { displayName: true } } } }),
    db.post.findMany({ where: { workspaceId: ws, status: { in: ["SCHEDULED", "PENDING_APPROVAL"] }, scheduledAt: { gte: new Date() }, ...tf }, orderBy: { scheduledAt: "asc" }, take: 6, include: { targets: { select: { account: { select: { platform: true } } } } } }),
    db.postTarget.findMany({ where: { status: "FAILED", post: { workspaceId: ws }, updatedAt: { gte: subDays(new Date(), 14) }, ...(Object.keys(acctFilter).length ? { account: acctFilter } : {}) }, orderBy: { updatedAt: "desc" }, take: 5, include: { account: { select: { platform: true, displayName: true } }, post: { select: { id: true, body: true } } } }),
    db.auditLog.findMany({ where: { workspaceId: ws }, orderBy: { createdAt: "desc" }, take: 8 }),
    db.notification.findMany({ where: { workspaceId: ws, userId: ctx.user.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    ctx.can("analytics.view") ? getAnalytics(ws, { from, to: new Date(), platform: sp.platform, accountId: sp.account, brandId: sp.brand }) : null,
    db.brand.findMany({ where: { workspaceId: ws }, select: { id: true, name: true } }),
  ]);
  const c = (s: string[]) => counts.filter((x) => s.includes(x.status)).reduce((n, x) => n + x._count, 0);
  const needsReconnect = accounts.filter((a) => a.status !== "CONNECTED");
  const series = analytics?.series.filter((s) => s.points.length) ?? [];
  const eng = analytics ? ["likes", "comments", "shares", "saves"].reduce((n, k) => n + (analytics.totals[k] ?? 0), 0) : 0;
  const reach = analytics ? (analytics.totals.reach ?? 0) + (analytics.totals.impressions ?? 0) + (analytics.totals.views ?? 0) : 0;
  const ACTION: Record<string, string> = { "post.schedule": "scheduled a post", "post.publish_now": "published a post", "post.draft": "saved a draft", "post.submit": "submitted a post", "post.approve": "approved a post", "account.connect": "connected an account", "account.disconnect": "disconnected an account", "inbox.reply": "replied to a conversation", "media.upload": "uploaded media", "inbox.assign": "assigned a conversation", "post.reschedule": "rescheduled a post" };

  return (
    <>
      <PageHeader title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${ctx.user.name.split(" ")[0]}`} subtitle={`${ctx.workspace.name} · everything across your social accounts`}
        actions={<form className="flex flex-wrap gap-2">
          <select name="range" defaultValue={sp.range ?? "30"} className="input w-32 py-1.5"><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select>
          <select name="platform" defaultValue={sp.platform ?? ""} className="input w-36 py-1.5"><option value="">All networks</option>{PLATFORM_LIST.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          {brands.length > 1 && <select name="brand" defaultValue={sp.brand ?? ""} className="input w-36 py-1.5"><option value="">All brands</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
          <button className="btn-secondary py-1.5">Filter</button></form>} />
      {sp.welcome && accounts.length === 0 && <div className="mb-4"><Notice tone="info">Welcome to Orbit! Start by <Link className="font-medium text-brand-500" href="/accounts">connecting your social accounts</Link>, then set up your brand voice in <Link className="font-medium text-brand-500" href="/settings">Settings</Link>.</Notice></div>}
      {needsReconnect.length > 0 && <div className="mb-4"><Notice tone="error"><b>{needsReconnect.length} account{needsReconnect.length > 1 ? "s need" : " needs"} reconnecting:</b> {needsReconnect.map((a) => a.displayName).join(", ")}. <Link href="/accounts" className="underline">Fix now</Link></Notice></div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Connected accounts" value={accounts.length} href="/accounts" hint={`${new Set(accounts.map((a) => a.platform)).size} networks`} />
        <Stat label="Scheduled" value={c(["SCHEDULED"])} href="/posts?status=SCHEDULED" />
        <Stat label="Published" value={c(["PUBLISHED", "PARTIAL"])} href="/posts?status=PUBLISHED" />
        <Stat label="Drafts" value={c(["DRAFT", "CHANGES_REQUESTED"])} href="/posts?status=DRAFT" />
        <Stat label="Pending approval" value={c(["PENDING_APPROVAL"])} href="/posts?status=PENDING_APPROVAL" tone={c(["PENDING_APPROVAL"]) ? "warn" : undefined} />
        <Stat label="Unread messages" value={unread} href="/inbox?f=unread" tone={unread ? "warn" : undefined} />
        <Stat label="Unanswered comments" value={unanswered} href="/inbox?f=awaiting&type=comment" />
        <Stat label="Failed (14d)" value={failed.length} href="/posts?status=FAILED" tone={failed.length ? "bad" : undefined} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title={`Follower growth · ${days} days`} className="xl:col-span-2" actions={<Link href="/analytics" className="text-xs text-brand-500">Analytics →</Link>}>
          {series.length ? <LineChart series={series.slice(0, 8).map((s) => ({ key: s.id, label: s.displayName, points: s.points }))} height={220} format="compact" />
            : <Empty title="No follower data yet" body="Connected accounts report follower counts every 6 hours where the network allows it." />}
          {analytics && <div className="line mt-3 grid grid-cols-3 gap-3 border-t pt-3 text-sm">
            <div><div className="muted text-xs">Engagements</div><div className="font-semibold">{analytics.withMetrics ? compact(eng) : "—"}</div></div>
            <div><div className="muted text-xs">Reach / views</div><div className="font-semibold">{reach ? compact(reach) : "—"}</div></div>
            <div><div className="muted text-xs">Posts with metrics</div><div className="font-semibold">{analytics.withMetrics}/{analytics.published}</div></div>
          </div>}
          {analytics?.usesDemo && <p className="muted mt-2 text-xs">Includes simulated demo data.</p>}
        </Card>
        <Card title="Upcoming" actions={<Link href="/calendar" className="text-xs text-brand-500">Calendar →</Link>} pad={false}>
          {upcoming.length === 0 ? <Empty title="Nothing scheduled" action={<Link href="/publisher" className="btn-primary">Create post</Link>} /> : (
            <ul>{upcoming.map((p) => (
              <li key={p.id}><Link href={`/posts/${p.id}`} className="line flex items-start gap-3 border-t px-4 py-2.5 first:border-t-0 hover:bg-[var(--soft)]">
                <div className="w-14 shrink-0 text-xs"><div className="font-semibold">{fmtDate(p.scheduledAt, tz, "MMM d")}</div><div className="muted">{fmtDate(p.scheduledAt, tz, "HH:mm")}</div></div>
                <div className="min-w-0 flex-1"><div className="line-clamp-2 text-sm">{p.title || p.body}</div><div className="mt-1 flex gap-1">{[...new Set(p.targets.map((t) => t.account.platform))].map((x) => <PlatformBadge key={x} id={x} size={14} />)}{p.status !== "SCHEDULED" && <StatusBadge status={p.status} />}</div></div>
              </Link></li>))}</ul>)}
        </Card>
        <Card title="Accounts" pad={false}>
          {accounts.length === 0 ? <Empty title="No accounts" action={<Link href="/accounts" className="btn-primary">Connect</Link>} /> : (
            <ul>{accounts.slice(0, 8).map((a) => { const s = analytics?.series.find((x) => x.id === a.id); return (
              <li key={a.id} className="line flex items-center gap-3 border-t px-4 py-2 first:border-t-0"><Avatar src={a.avatarUrl} name={a.displayName} size={28} platform={a.platform} />
                <div className="min-w-0 flex-1"><div className="flex items-center gap-1 truncate text-sm">{a.displayName}{a.isDemo && <DemoBadge />}</div><div className="muted text-xs">{s?.latest !== null && s?.latest !== undefined ? `${compact(s.latest)} followers` : platformLabel(a.platform)}</div></div>
                {s && <Sparkline points={s.points.map((p) => p.value)} />}{a.status !== "CONNECTED" && <StatusBadge status={a.status} />}</li>); })}</ul>)}
        </Card>
        <Card title="Needs attention" pad={false}>
          {failed.length === 0 && mentions.length === 0 ? <Empty title="All clear" body="No failed posts or new mentions." /> : (
            <ul>
              {failed.map((t) => <li key={t.id}><Link href={`/posts/${t.post.id}`} className="line flex gap-3 border-t px-4 py-2.5 first:border-t-0 hover:bg-[var(--soft)]"><PlatformBadge id={t.account.platform} size={18} /><div className="min-w-0"><div className="truncate text-sm">Failed: {t.post.body.slice(0, 60)}</div><div className="truncate text-xs text-red-500">{t.error}</div></div></Link></li>)}
              {mentions.map((m) => <li key={m.id}><Link href={`/inbox?c=${m.id}`} className="line flex gap-3 border-t px-4 py-2.5 first:border-t-0 hover:bg-[var(--soft)]"><PlatformBadge id={m.account.platform} size={18} /><div className="min-w-0"><div className="truncate text-sm">Mention{m.contact ? ` by ${m.contact.displayName}` : ""}</div><div className="muted truncate text-xs">{m.lastMessagePreview}</div></div></Link></li>)}
            </ul>)}
        </Card>
        <Card title="Recent activity" pad={false}>
          {activity.length === 0 && notifications.length === 0 ? <Empty title="No activity yet" /> : (
            <ul>{[...notifications.map((n) => ({ id: n.id, at: n.createdAt, text: n.title, href: n.href })), ...activity.map((a) => ({ id: a.id, at: a.createdAt, text: `${a.actorName ?? "System"} ${ACTION[a.action] ?? a.action}`, href: null as string | null }))]
              .sort((a, b) => +b.at - +a.at).slice(0, 8).map((x) => (
              <li key={x.id} className="line border-t px-4 py-2 text-sm first:border-t-0">{x.href ? <Link href={x.href} className="hover:underline">{x.text}</Link> : x.text}<div className="muted text-xs">{fmtDate(x.at, tz, "MMM d HH:mm")}</div></li>))}</ul>)}
        </Card>
      </div>
    </>
  );
}
