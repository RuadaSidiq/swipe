import Link from "next/link";
import { addDays, startOfWeek, subDays, subWeeks } from "date-fns";
import { Users, Heart, Send, CalendarClock, MessageCircle, Plus, AlertCircle, ChevronRight, Sparkles } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAnalytics } from "@/lib/analytics";
import { compact, fmtDate } from "@/lib/format";
import { Avatar, Card, Empty, PlatformBadge, StatusBadge } from "@/components/ui";
import { BarChart } from "@/components/charts";

export const metadata = { title: "Overview" };

export default async function Home() {
  const ctx = await requireCtx();
  const ws = ctx.workspace.id; const tz = ctx.user.timezone;
  const now = new Date();
  const wk = startOfWeek(now, { weekStartsOn: 1 });
  const [accounts, upcoming, unread, unreadCount, activity, failed, approvals, current, previous, weekPosts] = await Promise.all([
    db.socialAccount.findMany({ where: { workspaceId: ws, status: { not: "DISCONNECTED" } }, select: { id: true, platform: true, displayName: true, avatarUrl: true, status: true }, orderBy: { platform: "asc" } }),
    db.post.findMany({ where: { workspaceId: ws, status: { in: ["SCHEDULED", "PENDING_APPROVAL"] }, scheduledAt: { gte: now } }, orderBy: { scheduledAt: "asc" }, take: 5, include: { targets: { select: { account: { select: { platform: true } } } } } }),
    db.conversation.findMany({ where: { workspaceId: ws, unread: true, status: { in: ["OPEN", "PENDING"] } }, orderBy: { lastMessageAt: "desc" }, take: 4, include: { contact: { select: { displayName: true, avatarUrl: true } }, account: { select: { platform: true } } } }),
    db.conversation.count({ where: { workspaceId: ws, unread: true, status: { in: ["OPEN", "PENDING"] } } }),
    db.auditLog.findMany({ where: { workspaceId: ws, action: { in: ["post.schedule", "post.publish_now", "post.approve", "account.connect", "inbox.reply", "campaign.create"] } }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.postTarget.count({ where: { status: "FAILED", post: { workspaceId: ws }, updatedAt: { gte: subDays(now, 14) } } }),
    ctx.can("posts.approve") ? db.post.count({ where: { workspaceId: ws, status: "PENDING_APPROVAL" } }) : 0,
    ctx.can("analytics.view") ? getAnalytics(ws, { from: subDays(now, 30), to: now }) : null,
    ctx.can("analytics.view") ? getAnalytics(ws, { from: subDays(now, 60), to: subDays(now, 30) }) : null,
    db.post.findMany({ where: { workspaceId: ws, status: { in: ["SCHEDULED", "PENDING_APPROVAL", "PUBLISHED"] }, scheduledAt: { gte: wk, lt: addDays(wk, 7) } }, select: { scheduledAt: true } }),
  ]);

  const followers = current?.series.reduce((n, s) => n + (s.latest ?? 0), 0) ?? 0;
  const prevFollowers = previous?.series.reduce((n, s) => n + (s.latest ?? 0), 0) ?? 0;
  const eng = (a: typeof current) => (a ? ["likes", "comments", "shares", "saves"].reduce((n, k) => n + (a.totals[k] ?? 0), 0) : 0);
  const pct = (a: number, b: number) => (b ? ((a - b) / b) * 100 : null);

  // Followers gained per week, last 6 weeks (sum across accounts).
  const weeks = Array.from({ length: 6 }, (_, i) => startOfWeek(subWeeks(now, 5 - i), { weekStartsOn: 1 }));
  const perDay = new Map<string, number>();
  for (const s of current?.series ?? []) for (const p of s.points) perDay.set(p.date, (perDay.get(p.date) ?? 0) + p.value);
  const prevDaySeries = previous?.series ?? [];
  for (const s of prevDaySeries) for (const p of s.points) perDay.set(p.date, (perDay.get(p.date) ?? 0) + p.value);
  const dates = [...perDay.keys()].sort();
  const valueAt = (d: Date) => { const k = d.toISOString().slice(0, 10); const before = dates.filter((x) => x <= k); return before.length ? perDay.get(before.at(-1)!)! : null; };
  const bars = weeks.map((w) => { const a = valueAt(w), b = valueAt(addDays(w, 7) > now ? now : addDays(w, 7)); return { label: fmtDate(w, tz, "MMM d"), value: a != null && b != null ? Math.max(0, b - a) : 0, detail: "new followers" }; });
  const hasBars = bars.some((b) => b.value > 0);

  const reconnect = accounts.filter((a) => a.status !== "CONNECTED");
  const alerts = [
    failed > 0 && { text: `${failed} post${failed > 1 ? "s" : ""} failed to publish`, href: "/posts?status=FAILED" },
    approvals > 0 && { text: `${approvals} post${approvals > 1 ? "s" : ""} waiting for your approval`, href: "/posts?status=PENDING_APPROVAL" },
    reconnect.length > 0 && { text: `Reconnect ${reconnect[0].displayName}${reconnect.length > 1 ? ` and ${reconnect.length - 1} more` : ""}`, href: "/accounts" },
  ].filter(Boolean) as { text: string; href: string }[];
  const ACTION: Record<string, string> = { "post.schedule": "scheduled a post", "post.publish_now": "published a post", "post.approve": "approved a post", "account.connect": "connected an account", "inbox.reply": "replied to a message", "campaign.create": "created a campaign" };
  const hour = Number(fmtDate(now, tz, "H"));

  const first = ctx.user.name.split(" ")[0];
  const greet = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const followChange = pct(followers, prevFollowers);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dayKey = (d: Date) => fmtDate(d, tz, "yyyy-MM-dd");
  const perWeekday = new Map<string, number>();
  for (const p of weekPosts) perWeekday.set(dayKey(p.scheduledAt!), (perWeekday.get(dayKey(p.scheduledAt!)) ?? 0) + 1);
  const todayKey = dayKey(now);
  const thisWeek = weekPosts.length;
  // Recommendations are derived only from real workspace data.
  const tips = [
    unreadCount > 0 && { text: `Reply to ${unreadCount} unread conversation${unreadCount > 1 ? "s" : ""}. Fast replies build trust.`, href: "/inbox?f=unread", cta: "Open inbox" },
    thisWeek === 0 && { text: "Nothing is scheduled this week. Plan a few posts to stay visible.", href: "/calendar", cta: "Open planner" },
    approvals > 0 && { text: `${approvals} post${approvals > 1 ? "s are" : " is"} waiting for your approval.`, href: "/posts?status=PENDING_APPROVAL", cta: "Review" },
    current && current.published > 0 && { text: "See which posts performed best this month, and why.", href: "/assistant", cta: "Ask Swipe AI" },
  ].filter(Boolean).slice(0, 3) as { text: string; href: string; cta: string }[];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-semibold leading-tight">Good {greet}, {first}</h1>
          <p className="muted mt-0.5 text-sm">Here&apos;s what&apos;s happening across your social accounts.</p>
        </div>
      </div>

      {accounts.length === 0 && (
        <Card><Empty icon={<Users size={22} />} title="Connect your first account" body="Link Instagram, Facebook, TikTok and more to start posting." action={<Link href="/accounts" className="btn-primary">Connect an account</Link>} /></Card>
      )}

      <div className="stagger grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {/* Hero: performance summary */}
        <section className="hero relative flex flex-col overflow-hidden p-5 sm:p-7">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-24 right-24 h-56 w-56 rounded-full bg-black/10 blur-2xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[13px] font-medium text-white/80">Total followers · last 30 days</div>
              <div className="mt-2 flex items-end gap-3">
                <span className="num text-[48px] font-semibold leading-none sm:text-[56px]">{current && followers ? compact(followers) : "—"}</span>
                {followChange != null && followChange !== 0 && <span className="mb-2 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold backdrop-blur">{followChange > 0 ? "↑" : "↓"} {Math.abs(followChange).toFixed(1)}%</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-white/15 py-1 pl-1 pr-3 backdrop-blur">
              <span className="flex -space-x-2">{accounts.slice(0, 4).map((a) => <span key={a.id} className="rounded-full ring-2 ring-[#00A06C]"><PlatformBadge id={a.platform} size={26} /></span>)}</span>
              <span className="text-xs font-semibold">{accounts.length} connected</span>
            </div>
          </div>
          <div className="relative mt-6 grid grid-cols-3 gap-3">
            {[
              { icon: <Heart size={15} />, label: "Engagement", value: current?.withMetrics ? compact(eng(current)) : "—", change: current ? pct(eng(current), eng(previous)) : null },
              { icon: <Send size={15} />, label: "Published", value: current ? String(current.published) : "—", change: current ? pct(current.published, previous?.published ?? 0) : null },
              { icon: <CalendarClock size={15} />, label: "Scheduled", value: String(thisWeek), change: null },
            ].map((m) => (
              <div key={m.label} className="rounded-2xl bg-white/15 p-3 backdrop-blur sm:p-4" style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,.25)" }}>
                <div className="flex items-center gap-1.5 truncate whitespace-nowrap text-[11.5px] font-medium text-white/85 sm:text-[12px]">{m.icon}{m.label}</div>
                <div className="num mt-1.5 text-[22px] font-semibold leading-none sm:text-[26px]">{m.value}</div>
                {m.change != null && m.change !== 0 && <div className="mt-1 text-[11px] font-semibold text-white/80">{m.change > 0 ? "↑" : "↓"} {Math.abs(m.change).toFixed(1)}%</div>}
              </div>
            ))}
          </div>
          <div className="relative mt-auto flex flex-wrap items-center justify-between gap-3 pt-6">
            <span className="text-[12.5px] text-white/80">Scheduled counts posts planned for this week.</span>
            <Link href="/analytics" className="inline-flex items-center gap-1 rounded-full bg-white px-3.5 py-2 text-[13px] font-semibold text-[#00714B] transition hover:-translate-y-px" style={{ boxShadow: "0 8px 16px -8px rgba(0,0,0,.35), inset 0 -2px 4px rgba(0,0,0,.06)" }}>Full analytics <ChevronRight size={14} /></Link>
          </div>
        </section>

        {/* Today: week strip + next scheduled */}
        <section className="panel lift flex flex-col p-5">
          <div className="flex items-center justify-between">
            <div><h2 className="section-title">Today</h2><div className="muted text-xs">{fmtDate(now, tz, "EEEE, MMMM d")}</div></div>
            <Link href="/publisher" className="icon-btn clay rounded-full" aria-label="Create post"><Plus size={16} /></Link>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1.5">
            {days.map((d) => { const k = dayKey(d); const isToday = k === todayKey; const n = perWeekday.get(k) ?? 0; return (
              <Link key={k} href="/calendar" className={isToday ? "flex flex-col items-center rounded-2xl py-2 text-white" : "clay-inset flex flex-col items-center rounded-2xl py-2 transition hover:bg-[var(--accent-soft)]"} style={isToday ? { background: "linear-gradient(160deg,#1E2836,#0F1724)", boxShadow: "0 10px 18px -8px rgba(15,23,36,.5)" } : undefined}>
                <span className={isToday ? "text-[10.5px] text-white/70" : "muted text-[10.5px]"}>{fmtDate(d, tz, "EEE")}</span>
                <span className="num text-[15px] font-semibold">{fmtDate(d, tz, "d")}</span>
                <span className="mt-0.5 flex h-1.5 gap-0.5">{Array.from({ length: Math.min(n, 3) }, (_, i) => <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: isToday ? "#3BD9A2" : "var(--accent-bright)" }} />)}</span>
              </Link>); })}
          </div>
          <div className="mt-4 flex-1">
            {upcoming.length === 0 ? <div className="muted grid h-full place-items-center py-6 text-sm">Nothing scheduled. <Link href="/publisher" className="font-medium text-[var(--accent)]">Plan a post</Link></div> : (
              <ul className="flex flex-col gap-1">
                {upcoming.slice(0, 3).map((p) => (
                  <li key={p.id}><Link href={`/posts/${p.id}`} className="flex items-center gap-3 rounded-2xl px-2 py-2 transition hover:bg-[var(--soft)]">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><CalendarClock size={16} /></span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium">{p.title || p.body}</span><span className="muted flex items-center gap-1.5 text-[11.5px]">{fmtDate(p.scheduledAt, tz, "EEE d · HH:mm")}<span className="flex -space-x-1">{[...new Set(p.targets.map((t) => t.account.platform))].map((x) => <PlatformBadge key={x} id={x} size={14} className="ring-1 ring-[var(--panel)]" />)}</span></span></span>
                    {p.status === "PENDING_APPROVAL" && <StatusBadge status={p.status} />}
                  </Link></li>
                ))}
              </ul>
            )}
          </div>
          <Link href="/calendar" className="mt-2 flex items-center justify-center gap-1 rounded-2xl py-2 text-[13px] font-medium text-[var(--accent)] transition hover:bg-[var(--accent-soft)]">Open planner <ChevronRight size={14} /></Link>
        </section>
      </div>

      {alerts.length > 0 && (
        <div className="stagger flex flex-col gap-2">
          {alerts.map((a) => (
            <Link key={a.text} href={a.href} className="lift flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-200" style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,.8), 0 8px 18px -12px rgba(180,120,0,.35)" }}>
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-100 dark:bg-amber-500/20"><AlertCircle size={16} /></span><span className="flex-1">{a.text}</span><ChevronRight size={16} />
            </Link>
          ))}
        </div>
      )}

      <div className="stagger grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        {current && (
          <Card className="lift" title="New followers" actions={<Link href="/analytics" className="font-medium text-[var(--accent)]">View analytics</Link>}>
            {hasBars ? <BarChart data={bars} format="compact" height={220} /> : <Empty title="No data yet" body="Follower counts appear once your accounts sync." />}
          </Card>
        )}
        <Card className="lift" title="Inbox" actions={<Link href="/inbox" className="font-medium text-[var(--accent)]">{unreadCount > 0 ? `${unreadCount} unread` : "Open"}</Link>} pad={false}>
          {unread.length === 0 ? <Empty icon={<MessageCircle size={22} />} title="You're all caught up" /> : (
            <ul className="px-3 pb-2">
              {unread.map((c) => (
                <li key={c.id}>
                  <Link href={`/inbox?c=${c.id}`} className="flex items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-[var(--soft)]">
                    <Avatar src={c.contact?.avatarUrl} name={c.contact?.displayName ?? "?"} size={38} platform={c.account.platform} />
                    <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{c.contact?.displayName ?? "Unknown"}</div><div className="muted truncate text-[13px]">{c.lastMessagePreview}</div></div>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--accent-bright)" }} aria-label="Unread" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="stagger grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section className="panel lift relative overflow-hidden p-6">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full blur-2xl" style={{ background: "var(--accent-soft)" }} />
          <div className="relative flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl text-white" style={{ background: "linear-gradient(160deg,#1FC48D,#00875A)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.35)" }}><Sparkles size={17} /></span>
            <div><h2 className="section-title leading-tight">Swipe AI suggestions</h2><div className="muted text-xs">Based on your workspace right now</div></div>
          </div>
          {tips.length === 0 ? <p className="muted relative mt-4 text-sm">You&apos;re on top of everything. Nice work.</p> : (
            <ul className="relative mt-4 flex flex-col gap-2">
              {tips.map((t) => (
                <li key={t.text} className="clay-inset flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
                  <span className="min-w-0 flex-1 text-[13.5px]">{t.text}</span>
                  <Link href={t.href} className="inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--accent)]">{t.cta} <ChevronRight size={14} /></Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <Card className="lift" title="Recent activity">
          {activity.length === 0 ? <span className="muted text-sm">No activity yet.</span> : (
            <ul className="flex flex-col gap-3">
              {activity.map((a) => <li key={a.id} className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2.5"><span className="h-2 w-2 rounded-full" style={{ background: "var(--accent-bright)" }} /><span><span className="font-medium">{a.actorName?.split(" ")[0] ?? "Someone"}</span> {ACTION[a.action]}</span></span><span className="muted shrink-0 text-xs">{fmtDate(a.createdAt, tz, "MMM d")}</span></li>)}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
