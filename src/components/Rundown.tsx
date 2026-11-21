import Link from "next/link";
import { addDays, startOfDay } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { PlatformBadge } from "./ui";

export interface RundownItem { id: string; at: string; text: string; status: string; platforms: string[] }

const TONE: Record<string, { bg: string; fg: string; label?: string }> = {
  PUBLISHED: { bg: "rgba(255,255,255,.07)", fg: "#9FB5AE", label: "Published" },
  PARTIAL: { bg: "rgba(255,201,60,.16)", fg: "#FFD35C", label: "Partly published" },
  FAILED: { bg: "rgba(229,72,77,.2)", fg: "#FF8A8D", label: "Failed" },
  PENDING_APPROVAL: { bg: "rgba(255,201,60,.16)", fg: "#FFD35C", label: "Needs approval" },
  SCHEDULED: { bg: "rgba(63,184,164,.16)", fg: "#CFEFE8" },
  PUBLISHING: { bg: "rgba(63,184,164,.28)", fg: "#fff", label: "Publishing" },
};

/**
 * The broadcast rundown: yesterday + the next 6 days on one strip, posts placed by day,
 * with a live "now" marker. The single loud element of the product.
 */
export function Rundown({ items, tz }: { items: RundownItem[]; tz: string }) {
  const now = new Date();
  const today0 = startOfDay(toZonedTime(now, tz));
  const days = Array.from({ length: 7 }, (_, i) => addDays(today0, i - 1));
  const key = (d: Date) => formatInTimeZone(fromZonedTime(d, tz), tz, "yyyy-MM-dd");
  const todayKey = key(today0);
  const nowPct = ((toZonedTime(now, tz).getHours() * 60 + toZonedTime(now, tz).getMinutes()) / 1440) * 100;
  const upcoming = items.filter((i) => new Date(i.at) > now && i.status !== "PUBLISHED").sort((a, b) => a.at.localeCompare(b.at))[0];

  return (
    <section className="relative overflow-hidden rounded-2xl border text-[#C9D6D1]" style={{ background: "var(--console)", borderColor: "var(--line)" }} aria-label="Rundown for the week">
      <div className="flex flex-wrap items-end justify-between gap-3 px-6 pb-4 pt-5">
        <div>
          <div className="flex items-center gap-2 text-[13px]">
            <span className="live-dot h-2 w-2 rounded-full" style={{ background: "var(--live)" }} />
            <span className="text-[#9FB5AE]">Live · {formatInTimeZone(now, tz, "EEEE HH:mm")}</span>
          </div>
          <h2 className="mt-1 font-display text-[22px] font-semibold text-white">
            {upcoming ? <>Next up {formatInTimeZone(new Date(upcoming.at), tz, "EEE HH:mm")}</> : "Nothing scheduled"}
          </h2>
        </div>
        <Link href="/calendar" className="rounded-full px-3 py-1.5 text-sm text-white transition hover:bg-white/10">Open calendar</Link>
      </div>

      <div className="overflow-x-auto pb-5">
        <div className="grid min-w-[760px] grid-cols-7 gap-px px-6">
          {days.map((d) => {
            const k = key(d);
            const isToday = k === todayKey;
            const list = items.filter((i) => formatInTimeZone(new Date(i.at), tz, "yyyy-MM-dd") === k).sort((a, b) => a.at.localeCompare(b.at));
            return (
              <div key={k} className="relative min-h-[168px] px-1.5">
                <div className="mb-2 flex items-baseline gap-1.5 border-b border-white/10 pb-2">
                  <span className={isToday ? "font-display text-[15px] font-semibold text-white" : "font-display text-[15px] text-[#9FB5AE]"}>{formatInTimeZone(fromZonedTime(d, tz), tz, "EEE")}</span>
                  <span className={isToday ? "text-sm text-white" : "text-sm text-[#7F9891]"}>{formatInTimeZone(fromZonedTime(d, tz), tz, "d")}</span>
                  {isToday && <span className="ml-auto rounded-full px-1.5 text-[11px] font-semibold text-[var(--console)]" style={{ background: "var(--signal)" }}>Today</span>}
                </div>
                {isToday && <div className="pointer-events-none absolute bottom-0 top-[34px] z-0 w-[2px]" style={{ left: `calc(6px + ${nowPct}% * (100% - 12px) / 100%)`, background: "var(--signal)", boxShadow: "0 0 12px rgba(255,201,60,.6)" }} aria-hidden />}
                <div className="relative z-10 flex flex-col gap-1.5">
                  {list.slice(0, 4).map((i) => {
                    const t = TONE[i.status] ?? TONE.SCHEDULED;
                    return (
                      <Link key={i.id} href={`/posts/${i.id}`} className="group block rounded-lg px-2 py-1.5 transition hover:brightness-125" style={{ background: t.bg }} title={i.text}>
                        <div className="flex items-center gap-1">
                          <span className="text-[11.5px] font-medium tabular-nums" style={{ color: t.fg }}>{formatInTimeZone(new Date(i.at), tz, "HH:mm")}</span>
                          <span className="ml-auto flex -space-x-0.5">{[...new Set(i.platforms)].slice(0, 3).map((p) => <PlatformBadge key={p} id={p} size={13} />)}</span>
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[#E6EEEB]">{i.text || "Untitled"}</div>
                        {t.label && <div className="mt-0.5 text-[10.5px]" style={{ color: t.fg }}>{t.label}</div>}
                      </Link>
                    );
                  })}
                  {list.length > 4 && <Link href="/calendar" className="px-2 text-[11.5px] text-[#9FB5AE] hover:text-white">+{list.length - 4} more</Link>}
                  {list.length === 0 && d >= today0 && <Link href={`/publisher?date=${encodeURIComponent(fromZonedTime(`${k}T10:00:00`, tz).toISOString())}`} className="rounded-lg border border-dashed border-white/10 px-2 py-3 text-center text-[11.5px] text-[#7F9891] transition hover:border-white/30 hover:text-white">Open slot</Link>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
