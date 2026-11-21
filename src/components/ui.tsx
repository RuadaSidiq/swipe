import clsx from "clsx";
import Link from "next/link";
import { PLATFORMS, type PlatformId } from "@/lib/platforms/registry";

export const cx = clsx;

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="muted mt-1 text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, pad = true }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cx("panel", className)}>
      {(title || actions) && (
        <div className="line flex items-center justify-between gap-2 border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {actions}
        </div>
      )}
      <div className={pad ? "p-4" : ""}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, href, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string; tone?: "warn" | "bad" | "good" }) {
  const inner = (
    <div className="panel h-full p-4 transition hover:shadow-sm">
      <div className="muted text-xs font-medium">{label}</div>
      <div className={cx("mt-1.5 text-2xl font-semibold tabular-nums", tone === "bad" && "text-red-500", tone === "warn" && "text-amber-500", tone === "good" && "text-emerald-500")}>{value}</div>
      {hint && <div className="muted mt-1 text-xs">{hint}</div>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export function Empty({ title, body, action, icon }: { title: string; body?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="muted mb-3">{icon}</div>}
      <div className="font-medium">{title}</div>
      {body && <div className="muted mt-1 max-w-md text-sm">{body}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PlatformBadge({ id, size = 20, className }: { id: string; size?: number; className?: string }) {
  const p = PLATFORMS[id as PlatformId];
  if (!p) return null;
  const dark = id === "snapchat";
  return (
    <span title={p.name} className={cx("inline-flex shrink-0 items-center justify-center rounded-md font-bold", className)}
      style={{ width: size, height: size, background: p.color, color: dark ? "#111" : "#fff", fontSize: Math.max(8, size * 0.42) }}>
      {p.short}
    </span>
  );
}

export function Avatar({ src, name, size = 32, platform }: { src?: string | null; name: string; size?: number; platform?: string }) {
  const initials = name.replace(/^u\//, "").split(/\s+/).map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" referrerPolicy="no-referrer" className="h-full w-full rounded-full object-cover" />
      ) : (
        <span className="soft flex h-full w-full items-center justify-center rounded-full text-xs font-semibold">{initials || "?"}</span>
      )}
      {platform && <span className="absolute -bottom-0.5 -right-0.5 rounded-md ring-2 ring-[var(--panel)]"><PlatformBadge id={platform} size={Math.round(size * 0.45)} /></span>}
    </span>
  );
}

const STATUS: Record<string, [string, string]> = {
  DRAFT: ["Draft", "bg-zinc-500/15 text-zinc-500"], PENDING_APPROVAL: ["Pending approval", "bg-amber-500/15 text-amber-600"],
  CHANGES_REQUESTED: ["Changes requested", "bg-orange-500/15 text-orange-600"], SCHEDULED: ["Scheduled", "bg-sky-500/15 text-sky-600"],
  QUEUED: ["Retrying", "bg-amber-500/15 text-amber-600"], PUBLISHING: ["Publishing", "bg-indigo-500/15 text-indigo-500"],
  PUBLISHED: ["Published", "bg-emerald-500/15 text-emerald-600"], PARTIAL: ["Partly published", "bg-amber-500/15 text-amber-600"],
  FAILED: ["Failed", "bg-red-500/15 text-red-600"], CANCELLED: ["Cancelled", "bg-zinc-500/15 text-zinc-500"],
  CONNECTED: ["Connected", "bg-emerald-500/15 text-emerald-600"], EXPIRED: ["Needs reconnect", "bg-red-500/15 text-red-600"],
  REVOKED: ["Revoked", "bg-red-500/15 text-red-600"], ERROR: ["Error", "bg-red-500/15 text-red-600"], DISCONNECTED: ["Disconnected", "bg-zinc-500/15 text-zinc-500"],
  OPEN: ["Open", "bg-sky-500/15 text-sky-600"], PENDING: ["Pending", "bg-amber-500/15 text-amber-600"], RESOLVED: ["Resolved", "bg-emerald-500/15 text-emerald-600"], ARCHIVED: ["Archived", "bg-zinc-500/15 text-zinc-500"],
  implemented: ["Supported", "bg-emerald-500/15 text-emerald-600"], limited: ["Limited", "bg-amber-500/15 text-amber-600"], unavailable: ["Unavailable", "bg-zinc-500/15 text-zinc-500"],
};
export function StatusBadge({ status, simulated }: { status: string; simulated?: boolean }) {
  const [label, cls] = STATUS[status] ?? [status, "bg-zinc-500/15 text-zinc-500"];
  return <span className={cx("chip", cls)}>{label}{simulated ? " · simulated" : ""}</span>;
}

export function DemoBadge() {
  return <span className="chip bg-fuchsia-500/15 text-fuchsia-600" title="Sandbox account. Nothing is sent to the real network.">DEMO</span>;
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
  const cls = { info: "border-sky-500/30 bg-sky-500/10", warn: "border-amber-500/30 bg-amber-500/10", error: "border-red-500/30 bg-red-500/10", success: "border-emerald-500/30 bg-emerald-500/10" }[tone];
  return <div className={cx("rounded-lg border px-3 py-2 text-sm", cls)}>{children}</div>;
}
