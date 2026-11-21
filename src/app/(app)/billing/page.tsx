import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPlan, usage } from "@/lib/billing";
import { PLANS, isUnlimited } from "@/lib/plans";
import { stripeEnabled } from "@/lib/stripe";
import { fmtDate } from "@/lib/format";
import { Card, Empty, Notice, PageHeader, cx } from "@/components/ui";
import { BillingClient } from "./BillingClient";
export const metadata = { title: "Billing" };
export default async function Billing({ searchParams }: { searchParams: Promise<{ success?: string }> }) {
  const ctx = await requireCtx();
  if (!ctx.can("billing.manage")) return <Notice tone="warn">Only the workspace owner can manage billing.</Notice>;
  const sp = await searchParams; const org = ctx.workspace.organizationId;
  const [{ plan, status, trialEndsAt }, u, sub, invoices, members] = await Promise.all([getPlan(org), usage(org), db.subscription.findUnique({ where: { organizationId: org } }), db.invoice.findMany({ where: { organizationId: org }, orderBy: { createdAt: "desc" }, take: 24 }), db.membership.count({ where: { workspace: { organizationId: org } } })]);
  const meters: [string, number, number][] = [["Connected accounts", u.accounts, plan.limits.accounts], ["Scheduled posts", u.scheduledPosts, plan.limits.scheduledPosts], ["Workspaces", u.workspaces, plan.limits.workspaces],
    ["Team members", members, plan.limits.members], ["AI requests this month", u.aiRequests, plan.limits.aiRequestsPerMonth], ["Active automations", u.automations, plan.limits.automations], ["Storage (MB)", u.storageMb, plan.limits.storageMb]];
  return (<>
    <PageHeader title="Billing" />
    {sp.success && <div className="mb-4"><Notice tone="success">Thanks! Your subscription is being activated — it may take a few seconds to appear.</Notice></div>}
    {!stripeEnabled() && <div className="mb-4"><Notice tone="warn">Payments aren&apos;t set up yet (STRIPE_SECRET_KEY).</Notice></div>}
    <div className="grid gap-4 xl:grid-cols-3">
      <Card title="Current plan">
        <div className="text-2xl font-semibold">{plan.name}</div>
        <div className="muted text-sm capitalize">{status.replace("_", " ")}{sub?.interval && plan.id !== "free" ? ` · billed ${sub.interval === "year" ? "annually" : "monthly"}` : ""}</div>
        {status === "trialing" && trialEndsAt && <p className="mt-2 text-sm">Trial ends {fmtDate(trialEndsAt, ctx.user.timezone, "MMM d, yyyy")}.</p>}
        {sub?.currentPeriodEnd && <p className="mt-2 text-sm">{sub.cancelAtPeriodEnd ? "Cancels" : "Renews"} {fmtDate(sub.currentPeriodEnd, ctx.user.timezone, "MMM d, yyyy")}.</p>}
        <BillingClient mode="manage" hasStripeSub={Boolean(sub?.stripeSubscriptionId && status !== "canceled")} cancelAtPeriodEnd={sub?.cancelAtPeriodEnd ?? false} stripe={stripeEnabled()} />
      </Card>
      <Card title="Usage" className="xl:col-span-2"><div className="grid gap-3 sm:grid-cols-2">{meters.map(([l, v, max]) => { const pct = isUnlimited(max) ? 0 : max === 0 ? 100 : Math.min(100, (v / max) * 100); return (
        <div key={l}><div className="flex justify-between text-sm"><span>{l}</span><span className="tabular-nums">{v.toLocaleString()} / {isUnlimited(max) ? "∞" : max.toLocaleString()}</span></div>
          <div className="soft mt-1 h-2 overflow-hidden rounded-full"><div className={cx("h-full rounded-full", pct >= 100 ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-brand-500")} style={{ width: `${pct}%` }} /></div></div>); })}</div></Card>
    </div>
    <h2 className="mb-3 mt-6 font-semibold">Plans</h2>
    <BillingClient mode="plans" plans={Object.values(PLANS)} current={plan.id} stripe={stripeEnabled()} hasStripeSub={Boolean(sub?.stripeSubscriptionId)} cancelAtPeriodEnd={false} />
    <Card title="Billing history" className="mt-6" pad={false}>{invoices.length === 0 ? <Empty title="No invoices yet" /> : (
      <table className="table w-full"><thead><tr><th>Date</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>{invoices.map((i) => (
        <tr key={i.id}><td>{fmtDate(i.createdAt, ctx.user.timezone, "MMM d, yyyy")}</td><td>{(i.amountCents / 100).toLocaleString(undefined, { style: "currency", currency: i.currency.toUpperCase() })}</td><td className="capitalize">{i.status}</td>
          <td className="text-right">{i.hostedUrl && <a className="text-brand-500 text-sm" href={i.hostedUrl} target="_blank" rel="noreferrer">View</a>} {i.pdfUrl && <a className="text-brand-500 ml-2 text-sm" href={i.pdfUrl} target="_blank" rel="noreferrer">PDF</a>}</td></tr>))}</tbody></table>)}</Card>
  </>);
}
