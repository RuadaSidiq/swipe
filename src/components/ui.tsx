import clsx from "clsx";
import Link from "next/link";
import { PLATFORMS, type PlatformId } from "@/lib/platforms/registry";

export const cx = clsx;

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="font-display text-[28px] font-semibold leading-tight">{title}</h1>
        {subtitle && <p className="muted mt-1 max-w-2xl text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A titled region. Use `flush` for lists/tables that run edge to edge. */
export function Card({ title, actions, children, className, pad = true }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("panel overflow-hidden", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 px-5 pb-1 pt-4">
          <h2 className="section-title">{title}</h2>
          {actions && <div className="text-sm">{actions}</div>}
        </div>
      )}
      <div className={pad ? "px-5 pb-5 pt-3" : "pb-1 pt-2"}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, href, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string; tone?: "warn" | "bad" | "good" }) {
  const inner = (
    <div className="group flex h-full flex-col justify-between gap-2 px-1 py-1">
      <div className="muted text-[13px]">{label}</div>
      <div className={cx("num text-[30px] font-semibold leading-none", tone === "bad" && "text-red-600 dark:text-red-400", tone === "warn" && "text-amber-700 dark:text-amber-400", tone === "good" && "text-emerald-700 dark:text-emerald-400")}>{value}</div>
      {hint && <div className="muted text-xs">{hint}</div>}
    </div>
  );
  return href ? <Link href={href} className="block rounded-lg transition hover:bg-[var(--soft)]">{inner}</Link> : inner;
}

export function Empty({ title, body, action, icon }: { title: string; body?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      {icon && <div className="muted mb-3">{icon}</div>}
      <div className="font-medium">{title}</div>
      {body && <div className="muted mt-1 max-w-sm text-sm">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PlatformBadge({ id, size = 20, className }: { id: string; size?: number; className?: string }) {
  const p = PLATFORMS[id as PlatformId];
  if (!p) return null;
  const dark = id === "snapchat";
  return (
    <span title={p.name} aria-label={p.name} className={cx("inline-flex shrink-0 items-center justify-center font-bold", className)}
      style={{ width: size, height: size, borderRadius: Math.max(4, size * 0.28), background: p.color, color: dark ? "#111" : "#fff", fontSize: Math.max(7.5, size * 0.4), letterSpacing: "-0.02em" }}>
      {p.short}
    </span>
  );
}

export function Avatar({ src, name, size = 32, platform }: { src?: string | null; name: string; size?: number; platform?: string }) {
  const clean = name.replace(/^u\//, "").replace(/[^\p{L}\p{N}\s]/gu, " ").trim();
  const initials = clean.split(/\s+/).map((s) => s[0]).join("").slice(0, size < 40 && platform ? 1 : 2).toUpperCase();
  const badge = Math.max(12, Math.round(size * 0.42));
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" referrerPolicy="no-referrer" className="h-full w-full rounded-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full font-semibold" style={{ background: "var(--accent-soft)", color: "var(--accent)", fontSize: size * 0.36 }}>{initials || "?"}</span>
      )}
      {platform && (
        <span className="absolute rounded-[5px]" style={{ right: -badge * 0.35, bottom: -badge * 0.3, boxShadow: "0 0 0 2px var(--panel)" }}>
          <PlatformBadge id={platform} size={badge} />
        </span>
      )}
    </span>
  );
}

/** Status = coloured dot + plain label. Colour never carries meaning alone. */
const STATUS: Record<string, [string, string]> = {
  DRAFT: ["Draft", "#8A9A95"], PENDING_APPROVAL: ["Needs approval", "#D99A0B"], CHANGES_REQUESTED: ["Changes requested", "#E07B24"],
  SCHEDULED: ["Scheduled", "#2F7FD6"], QUEUED: ["Retrying", "#D99A0B"], PUBLISHING: ["Publishing", "#6C5CE7"],
  PUBLISHED: ["Published", "#1E9E6A"], PARTIAL: ["Partly published", "#D99A0B"], FAILED: ["Failed", "#E5484D"], CANCELLED: ["Cancelled", "#8A9A95"],
  CONNECTED: ["Connected", "#1E9E6A"], EXPIRED: ["Reconnect", "#E5484D"], REVOKED: ["Revoked", "#E5484D"], ERROR: ["Error", "#E5484D"], DISCONNECTED: ["Disconnected", "#8A9A95"],
  OPEN: ["Open", "#2F7FD6"], PENDING: ["Pending", "#D99A0B"], RESOLVED: ["Resolved", "#1E9E6A"], ARCHIVED: ["Archived", "#8A9A95"],
  implemented: ["Supported", "#1E9E6A"], limited: ["Limited", "#D99A0B"], unavailable: ["Unavailable", "#8A9A95"],
};
export function StatusBadge({ status, simulated }: { status: string; simulated?: boolean }) {
  const [label, color] = STATUS[status] ?? [status, "#8A9A95"];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium">
      <span className={cx("h-2 w-2 rounded-full", status === "PUBLISHING" && "live-dot")} style={{ background: color }} />
      {label}{simulated ? <span className="muted font-normal">(simulated)</span> : null}
    </span>
  );
}

export function DemoBadge() {
  return <span className="chip border border-dashed" style={{ borderColor: "var(--line-strong)", color: "var(--muted)" }} title="Sandbox account. Nothing is sent to the real network.">demo</span>;
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
  const bar = { info: "#2F7FD6", warn: "#D99A0B", error: "#E5484D", success: "#1E9E6A" }[tone];
  return <div className="rounded-lg px-3.5 py-2.5 text-sm" style={{ background: "var(--soft)", boxShadow: `inset 3px 0 0 ${bar}` }}>{children}</div>;
}
