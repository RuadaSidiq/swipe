import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPlan } from "@/lib/billing";
import { EVENT_TYPES } from "@/lib/events";
import { ACTION_LABELS } from "@/lib/automation";
import { Notice, PageHeader } from "@/components/ui";
import { Automations } from "./Automations";
export const metadata = { title: "Automations" };
export default async function AutomationsPage() {
  const ctx = await requireCtx();
  if (!ctx.can("automations.manage")) return <Notice tone="warn">Your role can&apos;t manage automations.</Notice>;
  const [autos, runs, members, { plan }] = await Promise.all([
    db.automation.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "desc" }, include: { _count: { select: { runs: true } } } }),
    db.automationRun.findMany({ where: { automation: { workspaceId: ctx.workspace.id } }, orderBy: { createdAt: "desc" }, take: 50, include: { automation: { select: { name: true } } } }),
    db.membership.findMany({ where: { workspaceId: ctx.workspace.id }, include: { user: { select: { name: true } } } }),
    getPlan(ctx.workspace.organizationId),
  ]);
  return (<>
    <PageHeader title="Automations" subtitle="Repeatable workflows that run on their own." />
    {plan.limits.automations === 0 && <div className="mb-4"><Notice tone="warn">Automations aren&apos;t included in the Free plan. Upgrade in Billing to enable them.</Notice></div>}
    <Automations autos={JSON.parse(JSON.stringify(autos))} runs={JSON.parse(JSON.stringify(runs))} members={members.map((m) => ({ id: m.id, name: m.user.name }))} events={EVENT_TYPES} actionLabels={ACTION_LABELS} />
  </>);
}
