import clsx from "clsx";
import Link from "next/link";
import { PLATFORMS, type PlatformId } from "@/lib/platforms/registry";
import { LOGOS } from "@/lib/platforms/logos";

export const cx = clsx;

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="font-display text-[26px] font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="muted mt-0.5 text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, pad = true }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("panel overflow-hidden", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-6 pt-5">
          <h2 className="section-title">{title}</h2>
          {actions && <div className="flex items-center gap-2 text-sm">{actions}</div>}
        </div>
      )}
      <div className={pad ? "px-6 pb-6 pt-4" : "pb-2 pt-3"}>{children}</div>
    </section>
  );
}

/** KPI card: icon, label, value and an optional change pill. */
export function Stat({ label, value, hint, href, icon, change, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string; icon?: React.ReactNode; change?: number | null; tone?: "warn" | "bad" | "good" }) {
  const inner = (
    <div className="panel flex h-full flex-col gap-2 p-4 transition sm:gap-3 sm:p-5">
      {icon && <span className="hidden h-9 w-9 place-items-center rounded-full sm:grid" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{icon}</span>}
      <div className="text-sm font-medium">{label}</div>
      <div className={cx("num text-[22px] font-semibold leading-none sm:text-[30px]", tone === "bad" && "text-red-600 dark:text-red-400", tone === "warn" && "text-amber-700 dark:text-amber-400")}>{value}</div>
      {(hint || change != null) && (
        <div className="muted flex flex-wrap items-center gap-2 text-xs">
          {hint}
          {change != null && change !== 0 && <span className={cx("rounded-full px-2 py-0.5 font-semibold", change > 0 ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400" : "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400")}>{change > 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%</span>}
        </div>
      )}
    </div>
  );
  return href ? <Link href={href} className="block rounded-2xl hover:-translate-y-px">{inner}</Link> : inner;
}

export function Empty({ title, body, action, icon }: { title: string; body?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-4 grid h-12 w-12 place-items-center rounded-full" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{icon}</div>}
      <div className="font-display text-base font-semibold">{title}</div>
      {body && <div className="muted mt-1 max-w-xs text-sm">{body}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Official network logo on a rounded tile in the network's colour. */
export function PlatformBadge({ id, size = 20, className, plain }: { id: string; size?: number; className?: string; plain?: boolean }) {
  const p = PLATFORMS[id as PlatformId];
  const logo = LOGOS[id];
  if (!p) return null;
  const bg = logo?.hex ?? p.color;
  const fg = id === "snapchat" ? "#111" : "#fff";
  if (plain && logo) return <svg role="img" aria-label={p.name} viewBox="0 0 24 24" width={size} height={size} className={cx("shrink-0", className)} fill={id === "x" || id === "threads" || id === "tiktok" ? "currentColor" : bg}><title>{p.name}</title><path d={logo.path} /></svg>;
  return (
    <span title={p.name} role="img" aria-label={p.name} className={cx("inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size, borderRadius: Math.max(5, size * 0.3), background: bg }}>
      {logo ? <svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58} fill={fg} aria-hidden><path d={logo.path} /></svg> : <span style={{ color: fg, fontSize: size * 0.4, fontWeight: 700 }}>{p.short}</span>}
    </span>
  );
}

export function Avatar({ src, name, size = 36, platform }: { src?: string | null; name: string; size?: number; platform?: string }) {
  const clean = name.replace(/^u\//, "").replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  const initials = clean.split(/\s+/).map((s) => s[0]).join("").slice(0, platform || size < 40 ? 1 : 2).toUpperCase();
  const badge = Math.max(14, Math.round(size * 0.44));
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" referrerPolicy="no-referrer" className="h-full w-full rounded-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full font-semibold" style={{ background: "var(--accent-soft)", color: "var(--accent)", fontSize: size * 0.38 }}>{initials || "?"}</span>
      )}
      {platform && <span className="absolute rounded-[6px]" style={{ right: -badge * 0.3, bottom: -badge * 0.25, boxShadow: "0 0 0 2px var(--panel)" }}><PlatformBadge id={platform} size={badge} /></span>}
    </span>
  );
}

const STATUS: Record<string, [string, string]> = {
  DRAFT: ["Draft", "#94A3AE"], PENDING_APPROVAL: ["Needs approval", "#E3A008"], CHANGES_REQUESTED: ["Changes requested", "#EA7A1F"],
  SCHEDULED: ["Scheduled", "#3B82F6"], QUEUED: ["Retrying", "#E3A008"], PUBLISHING: ["Publishing", "#00B37A"],
  PUBLISHED: ["Published", "#00B37A"], PARTIAL: ["Partly published", "#E3A008"], FAILED: ["Failed", "#E5484D"], CANCELLED: ["Cancelled", "#94A3AE"],
  CONNECTED: ["Connected", "#00B37A"], EXPIRED: ["Reconnect", "#E5484D"], REVOKED: ["Revoked", "#E5484D"], ERROR: ["Error", "#E5484D"], DISCONNECTED: ["Disconnected", "#94A3AE"],
  OPEN: ["Open", "#3B82F6"], PENDING: ["Pending", "#E3A008"], RESOLVED: ["Resolved", "#00B37A"], ARCHIVED: ["Archived", "#94A3AE"],
  implemented: ["Supported", "#00B37A"], limited: ["Limited", "#E3A008"], unavailable: ["Unavailable", "#94A3AE"],
};
export function StatusBadge({ status, simulated }: { status: string; simulated?: boolean }) {
  const [label, color] = STATUS[status] ?? [status, "#94A3AE"];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium">
      <span className={cx("h-2 w-2 rounded-full", status === "PUBLISHING" && "live-dot")} style={{ background: color }} />
      {label}{simulated ? <span className="muted font-normal"> (simulated)</span> : null}
    </span>
  );
}

export function DemoBadge() {
  return <span className="chip soft muted" title="Sandbox account. Nothing is sent to the real network.">Demo</span>;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="muted mt-1 block text-xs">{hint}</span>}
    </label>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "success"; children: React.ReactNode }) {
  const cls = { info: "bg-blue-50 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200", warn: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
    error: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200", success: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-100" }[tone];
  return <div className={cx("rounded-xl px-4 py-3 text-sm font-medium", cls)}>{children}</div>;
}

export function SwipeLogo({ size = 32 }: { size?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/swipe-logo.svg" alt="Swipe" width={size} height={size} className="shrink-0" />;
}
