import Link from "next/link";
import { addDays, startOfWeek, subDays, subWeeks } from "date-fns";
import { Users, Heart, Send, CalendarClock, MessageCircle, Plus, AlertCircle, ChevronRight } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAnalytics } from "@/lib/analytics";
import { compact, fmtDate } from "@/lib/format";
import { Avatar, Card, Empty, PlatformBadge, Stat, StatusBadge } from "@/components/ui";
import { BarChart } from "@/components/charts";

export const metadata = { title: "Home" };

export default async function Home() {
  const ctx = await requireCtx();
  const ws = ctx.workspace.id; const tz = ctx.user.timezone;
  const now = new Date();
  const [accounts, upcoming, unread, unreadCount, activity, failed, approvals, current, previous] = await Promise.all([
    db.socialAccount.findMany({ where: { workspaceId: ws, status: { not: "DISCONNECTED" } }, select: { id: true, platform: true, displayName: true, avatarUrl: true, status: true }, orderBy: { platform: "asc" } }),
    db.post.findMany({ where: { workspaceId: ws, status: { in: ["SCHEDULED", "PENDING_APPROVAL"] }, scheduledAt: { gte: now } }, orderBy: { scheduledAt: "asc" }, take: 5, include: { targets: { select: { account: { select: { platform: true } } } } } }),
    db.conversation.findMany({ where: { workspaceId: ws, unread: true, status: { in: ["OPEN", "PENDING"] } }, orderBy: { lastMessageAt: "desc" }, take: 4, include: { contact: { select: { displayName: true, avatarUrl: true } }, account: { select: { platform: true } } } }),
    db.conversation.count({ where: { workspaceId: ws, unread: true, status: { in: ["OPEN", "PENDING"] } } }),
    db.auditLog.findMany({ where: { workspaceId: ws, action: { in: ["post.schedule", "post.publish_now", "post.approve", "account.connect", "inbox.reply", "campaign.create"] } }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.postTarget.count({ where: { status: "FAILED", post: { workspaceId: ws }, updatedAt: { gte: subDays(now, 14) } } }),
    ctx.can("posts.approve") ? db.post.count({ where: { workspaceId: ws, status: "PENDING_APPROVAL" } }) : 0,
    ctx.can("analytics.view") ? getAnalytics(ws, { from: subDays(now, 30), to: now }) : null,
    ctx.can("analytics.view") ? getAnalytics(ws, { from: subDays(now, 60), to: subDays(now, 30) }) : null,
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-semibold">Good {hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, {ctx.user.name.split(" ")[0]}</h1>
      </div>

      {accounts.length === 0 && (
        <Card><Empty icon={<Users size={22} />} title="Connect your first account" body="Link Instagram, Facebook, TikTok and more to start posting." action={<Link href="/accounts" className="btn-primary">Connect an account</Link>} /></Card>
      )}

      {alerts.length > 0 && (
        <div className="flex flex-col gap-2">
          {alerts.map((a) => (
            <Link key={a.text} href={a.href} className="flex items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 transition hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-200">
              <AlertCircle size={17} /><span className="flex-1">{a.text}</span><ChevronRight size={16} />
            </Link>
          ))}
        </div>
      )}

      {current && (
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <Stat icon={<Users size={17} />} label="Followers" value={followers ? compact(followers) : "—"} hint="Last 30 days" change={pct(followers, prevFollowers)} />
          <Stat icon={<Heart size={17} />} label="Engagement" value={current.withMetrics ? compact(eng(current)) : "—"} hint="Last 30 days" change={pct(eng(current), eng(previous))} />
          <Stat icon={<Send size={17} />} label="Posts published" value={current.published} hint="Last 30 days" change={pct(current.published, previous?.published ?? 0)} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        {current && (
          <Card title="New followers" actions={<Link href="/analytics" className="font-medium text-[var(--accent)]">View analytics</Link>}>
            {hasBars ? <BarChart data={bars} format="compact" height={230} /> : <Empty title="No data yet" body="Follower counts appear once your accounts sync." />}
          </Card>
        )}

        <Card title="Inbox" actions={<Link href="/inbox" className="font-medium text-[var(--accent)]">{unreadCount > 0 ? `${unreadCount} unread` : "Open"}</Link>} pad={false}>
          {unread.length === 0 ? <Empty icon={<MessageCircle size={22} />} title="You're all caught up" /> : (
            <ul className="px-3 pb-2">
              {unread.map((c) => (
                <li key={c.id}>
                  <Link href={`/inbox?c=${c.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-[var(--soft)]">
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

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card title="Upcoming posts" actions={<Link href="/calendar" className="font-medium text-[var(--accent)]">Calendar</Link>} pad={false}>
          {upcoming.length === 0 ? <Empty icon={<CalendarClock size={22} />} title="Nothing scheduled" action={<Link href="/publisher" className="btn-primary"><Plus size={16} /> Create post</Link>} /> : (
            <ul className="px-3 pb-2">
              {upcoming.map((p) => (
                <li key={p.id}>
                  <Link href={`/posts/${p.id}`} className="flex items-center gap-4 rounded-xl px-3 py-3 transition hover:bg-[var(--soft)]">
                    <div className="w-14 shrink-0 text-center"><div className="muted text-[11px] font-medium uppercase">{fmtDate(p.scheduledAt, tz, "EEE")}</div><div className="num text-lg font-semibold leading-tight">{fmtDate(p.scheduledAt, tz, "d")}</div></div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.title || p.body}</div>
                      <div className="mt-1 flex items-center gap-2"><span className="muted text-xs">{fmtDate(p.scheduledAt, tz, "HH:mm")}</span>
                        <span className="flex -space-x-1">{[...new Set(p.targets.map((t) => t.account.platform))].map((x) => <PlatformBadge key={x} id={x} size={18} className="ring-2 ring-[var(--panel)]" />)}</span>
                        {p.status === "PENDING_APPROVAL" && <StatusBadge status={p.status} />}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card title="Accounts" actions={<Link href="/accounts" className="font-medium text-[var(--accent)]">Manage</Link>}>
            {accounts.length === 0 ? <span className="muted text-sm">None connected yet.</span> : (
              <div className="flex flex-wrap gap-2">
                {accounts.map((a) => (
                  <span key={a.id} className="relative" title={`${a.displayName}${a.status !== "CONNECTED" ? " (needs reconnecting)" : ""}`}>
                    <PlatformBadge id={a.platform} size={38} />
                    {a.status !== "CONNECTED" && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full ring-2 ring-[var(--panel)]" style={{ background: "#E5484D" }} />}
                  </span>
                ))}
                <Link href="/accounts" className="grid h-[38px] w-[38px] place-items-center rounded-xl border border-dashed transition hover:bg-[var(--soft)]" style={{ borderColor: "var(--line-strong)" }} aria-label="Connect an account"><Plus size={16} className="muted" /></Link>
              </div>
            )}
          </Card>
          <Card title="Recent activity">
            {activity.length === 0 ? <span className="muted text-sm">No activity yet.</span> : (
              <ul className="flex flex-col gap-3">
                {activity.map((a) => <li key={a.id} className="flex items-baseline justify-between gap-3 text-sm"><span><span className="font-medium">{a.actorName?.split(" ")[0] ?? "Someone"}</span> {ACTION[a.action]}</span><span className="muted shrink-0 text-xs">{fmtDate(a.createdAt, tz, "MMM d")}</span></li>)}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
