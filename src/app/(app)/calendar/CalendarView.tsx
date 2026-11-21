"use client";
import { Fragment, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { ChevronLeft, ChevronRight, Plus, SlidersHorizontal } from "lucide-react";
import { Card, Empty, Notice, PlatformBadge, StatusBadge, cx } from "@/components/ui";
import { rescheduleAction } from "../_actions/posts";

interface Item { id: string; title: string; body: string; status: string; at: string; campaign: { id: string; name: string; color: string } | null; targets: { status: string; platform: string; accountId: string; name: string }[] }
type View = "month" | "week" | "day" | "list" | "campaign";
const STATUS_DOT: Record<string, string> = { DRAFT: "bg-zinc-400", PENDING_APPROVAL: "bg-amber-500", CHANGES_REQUESTED: "bg-orange-500", SCHEDULED: "bg-sky-500", PUBLISHING: "bg-indigo-500", PUBLISHED: "bg-emerald-500", PARTIAL: "bg-amber-500", FAILED: "bg-red-500" };

export function CalendarView({ items, accounts, campaigns, slots, tz, initialView, anchorIso, canSchedule }: {
  items: Item[]; accounts: { id: string; platform: string; displayName: string }[]; campaigns: { id: string; name: string; color: string; startDate: string | null; endDate: string | null; status: string }[];
  slots: { platform: string | null; weekday: number; minuteOfDay: number }[]; tz: string; initialView: View; anchorIso: string; canSchedule: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>(initialView);
  const [anchor, setAnchor] = useState(toZonedTime(new Date(anchorIso), tz));
  const [fPlatform, setFP] = useState(""); const [fAccount, setFA] = useState(""); const [fCampaign, setFC] = useState(""); const [fStatus, setFS] = useState("");
  const [err, setErr] = useState(""); const [pending, start] = useTransition();
  const [showFilters, setShowFilters] = useState(false);
  const activeFilters = [fPlatform, fAccount, fCampaign, fStatus].filter(Boolean).length;
  const [local, setLocal] = useState(items);

  const filtered = useMemo(() => local.filter((i) => (!fPlatform || i.targets.some((t) => t.platform === fPlatform)) && (!fAccount || i.targets.some((t) => t.accountId === fAccount))
    && (!fCampaign || i.campaign?.id === fCampaign) && (!fStatus || (fStatus === "FAILED" ? ["FAILED", "PARTIAL"].includes(i.status) : i.status === fStatus))), [local, fPlatform, fAccount, fCampaign, fStatus]);
  const dayKey = (iso: string) => formatInTimeZone(new Date(iso), tz, "yyyy-MM-dd");
  const byDay = useMemo(() => { const m = new Map<string, Item[]>(); for (const i of filtered) m.set(dayKey(i.at), [...(m.get(dayKey(i.at)) ?? []), i]); for (const v of m.values()) v.sort((a, b) => a.at.localeCompare(b.at)); return m; }, [filtered]); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (id: string, day: Date, hour?: number) => {
    const item = local.find((i) => i.id === id); if (!item) return;
    if (!["SCHEDULED", "DRAFT", "PENDING_APPROVAL", "CHANGES_REQUESTED"].includes(item.status)) { setErr("Only unpublished posts can be moved."); return; }
    const time = formatInTimeZone(new Date(item.at), tz, "HH:mm:ss");
    const dayStr = formatInTimeZone(fromZonedTime(day, tz), tz, "yyyy-MM-dd");
    const target = fromZonedTime(`${dayStr}T${hour !== undefined ? `${String(hour).padStart(2, "0")}:${time.slice(3)}` : time}`, tz);
    if (target.getTime() < Date.now()) { setErr("Can't move a post into the past."); return; }
    const prev = local;
    setLocal((l) => l.map((i) => (i.id === id ? { ...i, at: target.toISOString() } : i)));
    start(async () => { const r = await rescheduleAction(id, target.toISOString()); if (!r.ok) { setErr(r.error); setLocal(prev); } else { setErr(""); router.refresh(); } });
  };

  const nav = (dir: 1 | -1) => setAnchor((a) => (view === "month" || view === "list" || view === "campaign" ? addMonths(a, dir) : view === "week" ? addWeeks(a, dir) : addDays(a, dir)));
  const label = view === "day" ? formatInTimeZone(fromZonedTime(anchor, tz), tz, "EEEE, MMM d yyyy") : view === "week" ? `Week of ${formatInTimeZone(fromZonedTime(startOfWeek(anchor), tz), tz, "MMM d, yyyy")}` : formatInTimeZone(fromZonedTime(anchor, tz), tz, "MMMM yyyy");
  const today = formatInTimeZone(new Date(), tz, "yyyy-MM-dd");

  const Chip = ({ i }: { i: Item }) => (
    <Link href={`/posts/${i.id}`} draggable={canSchedule} onDragStart={(e) => e.dataTransfer.setData("text/plain", i.id)}
      className="block rounded-md border px-1.5 py-1 text-[11px] leading-tight transition hover:shadow-sm line" style={{ background: "var(--panel)", borderLeft: `3px solid ${i.campaign?.color ?? "transparent"}` }}>
      <div className="flex items-center gap-1"><span className={cx("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[i.status])} /><span className="muted">{formatInTimeZone(new Date(i.at), tz, "HH:mm")}</span>
        <span className="ml-auto flex -space-x-1">{[...new Set(i.targets.map((t) => t.platform))].slice(0, 4).map((p) => <PlatformBadge key={p} id={p} size={13} />)}</span></div>
      <div className="mt-0.5 line-clamp-2">{i.title || i.body || "(no text)"}</div>
    </Link>
  );
  const drop = (day: Date, hour?: number) => ({ onDragOver: (e: React.DragEvent) => e.preventDefault(), onDrop: (e: React.DragEvent) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain"); if (id) move(id, day, hour); } });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="panel flex gap-1 p-1">{(["month", "week", "list"] as View[]).map((v) => <button key={v} onClick={() => setView(v)} className="tab-link capitalize" data-active={view === v}>{v}</button>)}
          <select className="input w-[84px] border-0 py-1 text-sm shadow-none" value={["day", "campaign"].includes(view) ? view : ""} onChange={(e) => e.target.value && setView(e.target.value as View)} aria-label="More views"><option value="">More</option><option value="day">Day</option><option value="campaign">Campaigns</option></select></div>
        <div className="flex items-center gap-1"><button className="btn-ghost p-1.5" onClick={() => nav(-1)} aria-label="Previous"><ChevronLeft size={16} /></button><button className="btn-secondary py-1" onClick={() => setAnchor(toZonedTime(new Date(), tz))}>Today</button><button className="btn-ghost p-1.5" onClick={() => nav(1)} aria-label="Next"><ChevronRight size={16} /></button></div>
        <div className="font-display text-[17px] font-semibold">{label} <span className="muted ml-1 font-sans text-xs font-normal">{tz}</span></div>
        <div className="flex-1" />
        <button className={cx("btn-secondary py-2", activeFilters > 0 && "border-[var(--accent-bright)] text-[var(--accent)]")} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}><SlidersHorizontal size={15} /> Filters{activeFilters ? ` (${activeFilters})` : ""}</button>
      </div>
      {showFilters && (
        <div className="flex flex-wrap gap-2">
        <select className="input w-auto py-2" value={fPlatform} onChange={(e) => setFP(e.target.value)}><option value="">All networks</option>{[...new Set(accounts.map((a) => a.platform))].map((p) => <option key={p} value={p}>{p}</option>)}</select>
        <select className="input w-auto py-2" value={fAccount} onChange={(e) => setFA(e.target.value)}><option value="">All accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.displayName}</option>)}</select>
        <select className="input w-auto py-2" value={fCampaign} onChange={(e) => setFC(e.target.value)}><option value="">All campaigns</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="input w-auto py-2" value={fStatus} onChange={(e) => setFS(e.target.value)}><option value="">All statuses</option><option value="DRAFT">Drafts</option><option value="PENDING_APPROVAL">Awaiting approval</option><option value="SCHEDULED">Scheduled</option><option value="PUBLISHED">Published</option><option value="FAILED">Failed</option></select>
          {activeFilters > 0 && <button className="btn-ghost" onClick={() => { setFP(""); setFA(""); setFC(""); setFS(""); }}>Clear</button>}
        </div>
      )}
      {err && <Notice tone="error">{err}</Notice>}
      {pending && <div className="muted text-xs">Saving…</div>}

      {view === "month" && (() => {
        const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(anchor)), end: endOfWeek(endOfMonth(anchor)) });
        return (
          <div className="panel overflow-hidden">
            <div className="grid grid-cols-7 text-center text-xs font-medium muted">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-2">{d}</div>)}</div>
            <div className="grid grid-cols-7">{days.map((d) => { const k = formatInTimeZone(fromZonedTime(d, tz), tz, "yyyy-MM-dd"); const list = byDay.get(k) ?? []; const gap = isSameMonth(d, anchor) && k >= today && list.length === 0;
              return (
                <div key={k} {...drop(d)} className={cx("group line min-h-[110px] border-t border-l p-1.5", !isSameMonth(d, anchor) && "opacity-40", gap && "bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,var(--soft)_6px,var(--soft)_7px)]")}>
                  <div className="mb-1 flex items-center justify-between"><span className={cx("grid h-6 w-6 place-items-center rounded-full text-xs", k === today && "bg-brand-500 font-bold text-white")}>{d.getDate()}</span>
                    {canSchedule && k >= today && <Link href={`/publisher?date=${encodeURIComponent(fromZonedTime(`${k}T10:00:00`, tz).toISOString())}`} className="hidden rounded p-0.5 group-hover:block hover:bg-[var(--soft)]" title="Create post on this day"><Plus size={13} /></Link>}</div>
                  <div className="space-y-1">{list.slice(0, 4).map((i) => <Chip key={i.id} i={i} />)}{list.length > 4 && <button onClick={() => { setAnchor(d); setView("day"); }} className="muted text-[11px]">+{list.length - 4} more</button>}</div>
                </div>); })}</div>
            <div className="muted line border-t px-3 py-2 text-[11px]">Striped days are upcoming content gaps.</div>
          </div>);
      })()}

      {(view === "week" || view === "day") && (() => {
        const days = view === "week" ? eachDayOfInterval({ start: startOfWeek(anchor), end: endOfWeek(anchor) }) : [anchor];
        const hours = Array.from({ length: 24 }, (_, h) => h);
        return (
          <div className="panel overflow-x-auto">
            <div className="grid min-w-[700px]" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
              <div />{days.map((d) => { const k = formatInTimeZone(fromZonedTime(d, tz), tz, "yyyy-MM-dd"); return <div key={k} className={cx("py-2 text-center text-xs font-medium", k === today && "text-brand-500")}>{formatInTimeZone(fromZonedTime(d, tz), tz, "EEE d")}</div>; })}
              {hours.map((h) => (<Fragment key={h}>
                <div key={`h${h}`} className="muted line border-t pr-2 pt-1 text-right text-[10px]">{String(h).padStart(2, "0")}:00</div>
                {days.map((d) => { const k = formatInTimeZone(fromZonedTime(d, tz), tz, "yyyy-MM-dd"); const list = (byDay.get(k) ?? []).filter((i) => Number(formatInTimeZone(new Date(i.at), tz, "H")) === h);
                  const slot = slots.some((s) => s.weekday === d.getDay() && Math.floor(s.minuteOfDay / 60) === h);
                  return <div key={`${k}${h}`} {...drop(d, h)} className={cx("line min-h-[44px] space-y-1 border-l border-t p-1", slot && "bg-emerald-500/5")} title={slot ? "Preferred posting time" : undefined}>{list.map((i) => <Chip key={i.id} i={i} />)}</div>; })}
              </Fragment>))}
            </div>
          </div>);
      })()}

      {view === "list" && (
        <Card pad={false}>{(() => { const keys = [...byDay.keys()].filter((k) => k.slice(0, 7) === formatInTimeZone(fromZonedTime(anchor, tz), tz, "yyyy-MM")).sort();
          return keys.length === 0 ? <Empty title="Nothing this month" /> : keys.map((k) => (
            <div key={k}><div className="soft px-4 py-1.5 text-xs font-semibold">{formatInTimeZone(new Date(`${k}T12:00:00Z`), "UTC", "EEEE, MMMM d")}</div>
              {byDay.get(k)!.map((i) => (
                <Link key={i.id} href={`/posts/${i.id}`} className="line flex items-center gap-3 border-t px-4 py-2.5 hover:bg-[var(--soft)]">
                  <span className="muted w-12 text-xs">{formatInTimeZone(new Date(i.at), tz, "HH:mm")}</span>
                  <span className="flex -space-x-1">{[...new Set(i.targets.map((t) => t.platform))].map((p) => <PlatformBadge key={p} id={p} size={18} />)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{i.title || i.body}</span>{i.campaign && <span className="chip" style={{ background: i.campaign.color + "22", color: i.campaign.color }}>{i.campaign.name}</span>}<StatusBadge status={i.status} />
                </Link>))}</div>)); })()}</Card>
      )}

      {view === "campaign" && (
        <Card pad={false}>{campaigns.length === 0 ? <Empty title="No campaigns" action={<Link href="/campaigns" className="btn-primary">Create campaign</Link>} /> : (() => {
          const ms = startOfMonth(anchor), me = endOfMonth(anchor); const days = eachDayOfInterval({ start: ms, end: me });
          return (<div className="overflow-x-auto"><div className="min-w-[800px]">
            <div className="grid" style={{ gridTemplateColumns: `180px repeat(${days.length}, 1fr)` }}><div />{days.map((d) => <div key={d.toISOString()} className="muted py-1 text-center text-[10px]">{d.getDate()}</div>)}</div>
            {campaigns.map((c) => { const s = c.startDate ? new Date(c.startDate) : null, e = c.endDate ? new Date(c.endDate) : null;
              return (<div key={c.id} className="line grid items-center border-t" style={{ gridTemplateColumns: `180px repeat(${days.length}, 1fr)` }}>
                <Link href={`/campaigns/${c.id}`} className="truncate px-3 py-2 text-sm font-medium">{c.name}</Link>
                {days.map((d) => { const inRange = s && e && d >= startOfDay(s) && d <= e; const n = (byDay.get(formatInTimeZone(fromZonedTime(d, tz), tz, "yyyy-MM-dd")) ?? []).filter((i) => i.campaign?.id === c.id).length;
                  return <div key={d.toISOString()} className="h-8 px-px py-1.5"><div className="grid h-full place-items-center rounded-sm text-[10px] font-bold text-white" style={{ background: inRange ? c.color : "transparent", opacity: inRange ? (n ? 1 : 0.35) : 1 }}>{n || ""}</div></div>; })}
              </div>); })}
          </div></div>); })()}</Card>
      )}
    </div>
  );
}
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
