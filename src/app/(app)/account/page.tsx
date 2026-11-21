import Link from "next/link";
import { Link2, Users, Building2, CreditCard, ShieldCheck, Bell, LogOut, ChevronRight, KeyRound } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPlan } from "@/lib/billing";
import { ROLE_LABELS } from "@/lib/rbac";
import { PlatformBadge } from "@/components/ui";
import { logout } from "@/app/(auth)/actions";

export const metadata = { title: "Account center" };

export default async function AccountCenter() {
  const ctx = await requireCtx();
  const ws = ctx.workspace.id;
  const [accounts, members, me, unread, { plan, status }] = await Promise.all([
    db.socialAccount.findMany({ where: { workspaceId: ws, status: { not: "DISCONNECTED" } }, select: { platform: true, status: true } }),
    db.membership.count({ where: { workspaceId: ws } }),
    db.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { totpEnabledAt: true } }),
    db.notification.count({ where: { userId: ctx.user.id, workspaceId: ws, readAt: null } }),
    getPlan(ctx.workspace.organizationId),
  ]);
  const broken = accounts.filter((a) => a.status !== "CONNECTED").length;
  const initials = ctx.user.name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  const tiles = [
    { href: "/accounts", icon: Link2, title: "Social accounts", text: broken ? `${broken} need${broken === 1 ? "s" : ""} reconnecting` : `${accounts.length} connected`, warn: broken > 0,
      extra: <div className="mt-3 flex flex-wrap gap-1.5">{[...new Set(accounts.map((a) => a.platform))].slice(0, 8).map((p) => <PlatformBadge key={p} id={p} size={24} />)}</div> },
    { href: "/team", icon: Users, title: "Team", text: `${members} member${members === 1 ? "" : "s"}` },
    { href: "/settings", icon: Building2, title: "Workspace", text: "Name, timezone, brand voice" },
    { href: "/billing", icon: CreditCard, title: "Billing", text: `${plan.name} plan${status === "trialing" ? " (trial)" : ""}` },
    { href: "/settings", icon: KeyRound, title: "Security", text: me.totpEnabledAt ? "Two-factor is on" : "Two-factor is off", warn: !me.totpEnabledAt },
    { href: "/notifications", icon: Bell, title: "Notifications", text: unread ? `${unread} unread` : "All caught up" },
    ...(ctx.user.isPlatformAdmin ? [{ href: "/admin", icon: ShieldCheck, title: "Admin console", text: "Platform health" }] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <section className="panel flex flex-wrap items-center gap-4 p-6">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-lg font-semibold text-white" style={{ background: "var(--text)" }}>{initials}</span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[22px] font-semibold leading-tight">{ctx.user.name}</h1>
          <p className="muted text-sm">{ctx.user.email} · {ROLE_LABELS[ctx.role]} in {ctx.workspace.name}</p>
        </div>
        <form action={logout}><button className="btn-secondary"><LogOut size={16} /> Sign out</button></form>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.title} href={t.href} className="panel group flex flex-col p-5 transition hover:-translate-y-px">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><t.icon size={19} /></span>
              <span className="flex-1 font-display text-[16px] font-semibold">{t.title}</span>
              <ChevronRight size={18} className="muted transition group-hover:translate-x-0.5" />
            </div>
            <div className={t.warn ? "mt-3 text-sm font-medium text-amber-700 dark:text-amber-400" : "muted mt-3 text-sm"}>{t.text}</div>
            {"extra" in t && t.extra}
          </Link>
        ))}
      </div>
    </div>
  );
}
