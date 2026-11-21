"use client";
import { useMemo, useState } from "react";

type Fmt = "number" | "compact";
const fmtFn = (f: Fmt) => (n: number) => f === "compact" ? Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n) : n.toLocaleString();

// Categorical slots from the validated reference palette (fixed order, never cycled).
const LIGHT = ["#00a36f", "#eb6834", "#2a78d6", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
const DARK = ["#16a978", "#d95926", "#3987e5", "#c98500", "#d55181", "#0ca30c", "#9085e9", "#e66767"];
export const seriesVar = (i: number) => `var(--series-${(i % 8) + 1})`;
export function ChartStyles() {
  const decl = (arr: string[]) => arr.map((c, i) => `--series-${i + 1}:${c};`).join("");
  return <style>{`.viz{${decl(LIGHT)}--seq:#00b37a;--grid:color-mix(in srgb,var(--muted) 22%,transparent)}@media (prefers-color-scheme:dark){.viz{${decl(DARK)}--seq:#1fc48d}}`}</style>;
}

export interface Series { key: string; label: string; points: { date: string; value: number }[] }

/** Multi-series line chart with crosshair tooltip. Series beyond 8 should be folded by the caller. */
export function LineChart({ series, height = 240, format: f = "number" }: { series: Series[]; height?: number; format?: Fmt }) {
  const format = fmtFn(f);
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = height, P = { l: 52, r: 16, t: 12, b: 28 };
  const dates = useMemo(() => [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort(), [series]);
  const vals = series.flatMap((s) => s.points.map((p) => p.value));
  if (!dates.length) return null;
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min = min * 0.95; max = max * 1.05 + 1; }
  const pad = (max - min) * 0.1; min = Math.max(0, min - pad); max = max + pad;
  const x = (d: string) => P.l + (dates.length === 1 ? (W - P.l - P.r) / 2 : (dates.indexOf(d) / (dates.length - 1)) * (W - P.l - P.r));
  const y = (v: number) => P.t + (1 - (v - min) / (max - min)) * (H - P.t - P.b);
  const ticks = Array.from({ length: 4 }, (_, i) => min + ((max - min) * i) / 3);
  const hd = hover !== null ? dates[hover] : null;
  return (
    <div className="viz relative">
      <ChartStyles />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Line chart of ${series.map((s) => s.label).join(", ")}`}
        onMouseMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; let best = 0, bd = Infinity; dates.forEach((d, i) => { const dd = Math.abs(x(d) - px); if (dd < bd) { bd = dd; best = i; } }); setHover(best); }}
        onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => <g key={t}><line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" /><text x={P.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{format(Math.round(t))}</text></g>)}
        {[dates[0], dates[Math.floor(dates.length / 2)], dates.at(-1)!].filter((d, i, a) => a.indexOf(d) === i).map((d) => <text key={d} x={x(d)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{d.slice(5)}</text>)}
        {series.map((s, i) => {
          const pts = s.points.filter((p) => dates.includes(p.date));
          return <g key={s.key}>
            <path d={pts.map((p, k) => `${k ? "L" : "M"}${x(p.date)},${y(p.value)}`).join("")} fill="none" stroke={seriesVar(i)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {pts.length === 1 && <circle cx={x(pts[0].date)} cy={y(pts[0].value)} r={4} fill={seriesVar(i)} />}
          </g>;
        })}
        {hd && <line x1={x(hd)} x2={x(hd)} y1={P.t} y2={H - P.b} stroke="var(--muted)" strokeDasharray="3 3" />}
        {hd && series.map((s, i) => { const p = s.points.find((q) => q.date === hd); return p ? <circle key={s.key} cx={x(hd)} cy={y(p.value)} r={4.5} fill={seriesVar(i)} stroke="var(--panel)" strokeWidth={2} /> : null; })}
      </svg>
      {hd && (
        <div className="panel pointer-events-none absolute top-2 z-10 min-w-[160px] p-2 text-xs shadow-lg" style={{ left: `${Math.min(70, (x(hd) / W) * 100)}%` }}>
          <div className="mb-1 font-semibold">{hd}</div>
          {series.map((s, i) => { const p = s.points.find((q) => q.date === hd); return p ? <div key={s.key} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: seriesVar(i) }} /><span className="muted flex-1 truncate">{s.label}</span><b>{format(p.value)}</b></div> : null; })}
        </div>
      )}
      {series.length > 1 && <div className="mt-2 flex flex-wrap gap-3 text-xs">{series.map((s, i) => <span key={s.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: seriesVar(i) }} />{s.label}</span>)}</div>}
    </div>
  );
}

/** Horizontal bars, single sequential hue (magnitude), values labelled in text ink. */
export function BarList({ rows, format: f = "number" }: { rows: { key: string; label: React.ReactNode; value: number; hint?: string }[]; format?: Fmt }) {
  const format = fmtFn(f);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="viz space-y-2"><ChartStyles />
      {rows.map((r) => (
        <div key={r.key} className="group" title={r.hint}>
          <div className="mb-1 flex items-center justify-between text-xs"><span className="flex items-center gap-1.5">{r.label}</span><b className="tabular-nums">{format(r.value)}</b></div>
          <div className="soft h-2 overflow-hidden rounded-full"><div className="h-full rounded-full transition-all group-hover:opacity-80" style={{ width: `${(r.value / max) * 100}%`, background: "var(--seq)" }} /></div>
        </div>
      ))}
    </div>
  );
}


export function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null;
  const min = Math.min(...points), max = Math.max(...points), W = 80, H = 24;
  const d = points.map((v, i) => `${i ? "L" : "M"}${(i / (points.length - 1)) * W},${H - 2 - ((v - min) / (max - min || 1)) * (H - 4)}`).join("");
  return <svg width={W} height={H} className="viz" aria-hidden><ChartStyles /><path d={d} fill="none" stroke="var(--seq)" strokeWidth={2} strokeLinecap="round" /></svg>;
}

/** Simple column chart: pale bars, current period solid brand green, tooltip on hover. */
export function BarChart({ data, height = 220, format: f = "number", unit = "" }: { data: { label: string; value: number; detail?: string }[]; height?: number; format?: Fmt; unit?: string }) {
  const format = fmtFn(f);
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return null;
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / nice) * nice;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * top);
  const active = hover ?? data.length - 1;
  return (
    <div className="relative" style={{ height }} role="img" aria-label={`Bar chart: ${data.map((d) => `${d.label} ${format(d.value)}${unit}`).join(", ")}`}>
      <div className="absolute inset-0 flex flex-col justify-between pb-7 pl-10">
        {ticks.slice().reverse().map((t) => (
          <div key={t} className="relative h-0 border-t border-dashed" style={{ borderColor: "var(--line)" }}>
            <span className="muted absolute -left-10 -top-2 w-8 text-right text-[11px] tabular-nums">{format(t)}</span>
          </div>
        ))}
      </div>
      <div className="absolute inset-0 flex items-end gap-2 pb-7 pl-12 pr-1 sm:gap-3">
        {data.map((d, i) => {
          const h = (d.value / top) * 100;
          const on = i === active;
          return (
            <div key={d.label} className="relative flex h-full flex-1 flex-col justify-end" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}>
              {on && (
                <div className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs shadow-lg" style={{ bottom: `calc(${h}% + 10px)`, background: "var(--text)", color: "var(--panel)" }}>
                  <div className="font-semibold">{format(d.value)}{unit}</div>{d.detail && <div className="opacity-75">{d.detail}</div>}
                </div>
              )}
              <div className="w-full rounded-t-lg transition-all" style={{ height: `${Math.max(h, 1.5)}%`, background: on ? "var(--accent-bright)" : "color-mix(in srgb, var(--accent-bright) 16%, var(--panel))" }} />
              <span className={`absolute -bottom-6 left-0 right-0 text-center text-[11.5px] ${on ? "font-semibold" : "muted"}`}>{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
