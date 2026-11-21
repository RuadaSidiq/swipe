import { subDays } from "date-fns";
import { requirePlatformAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLANS } from "@/lib/plans";
import { PLATFORM_LIST, isPlatformConfigured } from "@/lib/platforms/registry";
import { env } from "@/lib/env";
import { stripeEnabled } from "@/lib/stripe";
import { fmtDate, compact } from "@/lib/format";
import { Card, PageHeader, PlatformBadge, Stat, StatusBadge } from "@/components/ui";
import { BarList } from "@/components/charts";
import { AdminClient } from "./AdminClient";
export const metadata = { title: "Admin console" };

/** Platform operator view. Aggregates only — no access to private conversation content. */
export default async function Admin() {
  const s = await requirePlatformAdmin();
  const since = subDays(new Date(), 30); const d7 = subDays(new Date(), 7);
  const [users, active, subs, accounts, accountsByPlatform, published, failed, failures, ai, storage, orgs, recentUsers, tickets, flags, logs, broken] = await Promise.all([
    db.user.count(), db.user.count({ where: { lastActiveAt: { gte: d7 } } }), db.subscription.groupBy({ by: ["plan", "status"], _count: true }),
    db.socialAccount.count({ where: { status: "CONNECTED", isDemo: false } }), db.socialAccount.groupBy({ by: ["platform"], where: { isDemo: false, status: { not: "DISCONNECTED" } }, _count: true }),
    db.postTarget.count({ where: { status: "PUBLISHED", publishedAt: { gte: since } } }), db.postTarget.count({ where: { status: "FAILED", updatedAt: { gte: since } } }),
    db.postTarget.groupBy({ by: ["errorCode"], where: { status: "FAILED", updatedAt: { gte: since } }, _count: true, orderBy: { _count: { errorCode: "desc" } }, take: 8 }),
    db.aiUsage.aggregate({ where: { createdAt: { gte: since } }, _sum: { inputTokens: true, outputTokens: true }, _count: true }),
    db.mediaAsset.aggregate({ _sum: { sizeBytes: true } }),
    db.organization.findMany({ include: { subscription: true, _count: { select: { workspaces: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.user.findMany({ orderBy: { createdAt: "desc" }, take: 25, select: { id: true, name: true, email: true, createdAt: true, lastActiveAt: true, disabledAt: true, isPlatformAdmin: true } }),
    db.supportTicket.findMany({ orderBy: { createdAt: "desc" }, take: 20 }), db.featureFlag.findMany(),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 30, select: { id: true, action: true, actorName: true, createdAt: true, targetType: true } }),
    db.socialAccount.groupBy({ by: ["platform"], where: { status: { in: ["EXPIRED", "REVOKED", "ERROR"] } }, _count: true }),
  ]);
  const paying = subs.filter((x) => x.plan !== "free" && x.status === "active");
  const mrr = paying.reduce((n, x) => n + PLANS[x.plan as keyof typeof PLANS].monthly * x._count, 0);
  return (<>
    <PageHeader title="Admin console" subtitle="Platform health and operations. Conversation content is intentionally not accessible here." />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      <Stat label="Users" value={users} /><Stat label="Active (7d)" value={active} /><Stat label="Paying orgs" value={paying.reduce((n, x) => n + x._count, 0)} /><Stat label="Est. MRR" value={`$${compact(mrr)}`} hint="List price, excludes discounts" />
      <Stat label="Connected accounts" value={accounts} /><Stat label="Published (30d)" value={published} /><Stat label="Failed (30d)" value={failed} tone={failed ? "warn" : undefined} /><Stat label="AI requests (30d)" value={ai._count} hint={`${compact((ai._sum.inputTokens ?? 0) + (ai._sum.outputTokens ?? 0))} tokens`} />
    </div>
    <div className="mt-4 grid gap-4 xl:grid-cols-3">
      <Card title="Integration status"><ul className="space-y-1.5 text-sm">{PLATFORM_LIST.map((p) => { const b = broken.find((x) => x.platform === p.id)?._count ?? 0; return (
        <li key={p.id} className="flex items-center gap-2"><PlatformBadge id={p.id} size={16} /><span className="flex-1">{p.name}</span>{b > 0 && <span className="chip bg-red-500/15 text-red-600">{b} need reconnect</span>}<span className={isPlatformConfigured(p.id) ? "text-emerald-600 text-xs" : "muted text-xs"}>{isPlatformConfigured(p.id) ? "configured" : "not configured"}</span></li>); })}
        <li className="line mt-2 border-t pt-2 text-xs">AI: {env.aiConfigured ? "configured" : "not configured"} · Stripe: {stripeEnabled() ? "configured" : "not configured"} · Email: {process.env.RESEND_API_KEY ? "configured" : "not configured"} · Demo mode: {env.demoMode ? "ON" : "off"}</li></ul></Card>
      <Card title="Accounts by network">{accountsByPlatform.length ? <BarList rows={accountsByPlatform.map((x) => ({ key: x.platform, label: <><PlatformBadge id={x.platform} size={14} /> {x.platform}</>, value: x._count }))} /> : <span className="muted text-sm">None yet</span>}</Card>
      <Card title="Top publishing failures (30d)">{failures.length ? <BarList rows={failures.map((f) => ({ key: f.errorCode ?? "unknown", label: <code className="text-xs">{f.errorCode ?? "unknown"}</code>, value: f._count }))} /> : <span className="muted text-sm">No failures</span>}
        <p className="muted mt-3 text-xs">Storage used: {compact((storage._sum.sizeBytes ?? 0) / 1e6)} MB</p></Card>
    </div>
    <AdminClient orgs={orgs.map((o) => ({ id: o.id, name: o.name, workspaces: o._count.workspaces, plan: o.subscription?.plan ?? "free", status: o.subscription?.status ?? "active", createdAt: o.createdAt.toISOString() }))}
      users={recentUsers.map((u) => ({ ...u, createdAt: u.createdAt.toISOString(), lastActiveAt: u.lastActiveAt?.toISOString() ?? null, disabledAt: u.disabledAt?.toISOString() ?? null }))} me={s.userId}
      tickets={tickets.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() }))} flags={flags} />
    <Card title="System activity" className="mt-4" pad={false}><ul className="max-h-80 overflow-y-auto">{logs.map((l) => <li key={l.id} className="line border-t px-4 py-1.5 text-xs first:border-t-0"><span className="font-mono">{l.action}</span> · {l.actorName ?? "system"} · <span className="muted">{fmtDate(l.createdAt, "UTC")} UTC</span></li>)}</ul></Card>
    <p className="muted mt-2 text-xs">Subscriptions by plan: {subs.map((x) => `${x.plan}/${x.status}: ${x._count}`).join(" · ")}</p>
    <div className="hidden"><StatusBadge status="OPEN" /></div>
  </>);
}
