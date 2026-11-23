import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { NOTIFICATION_TYPES } from "@/lib/notify";
import { getPlan } from "@/lib/billing";
import { PageHeader } from "@/components/ui";
import { SettingsClient } from "./SettingsClient";
import { TwoFactorCard } from "./TwoFactorCard";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
export const metadata = { title: "Settings" };
export default async function Settings() {
  const ctx = await requireCtx();
  const [brands, slots, prefs, { plan }, me, memberships] = await Promise.all([
    db.brand.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "asc" } }),
    db.postingSlot.findMany({ where: { workspaceId: ctx.workspace.id } }),
    db.notificationPreference.findMany({ where: { userId: ctx.user.id } }),
    getPlan(ctx.workspace.organizationId),
    db.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { totpEnabledAt: true } }),
    db.membership.findMany({ where: { userId: ctx.user.id }, include: { workspace: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  const prefRows = Object.entries(NOTIFICATION_TYPES).map(([type, t]) => { const p = prefs.find((x) => x.type === type); return { type, label: t.label, inApp: p?.inApp ?? true, email: p?.email ?? t.defaultEmail }; });
  return (<><PageHeader title="Workspace" />
    <WorkspaceSwitcher workspaces={memberships.map((m) => m.workspace)} currentId={ctx.workspace.id} />
    <div className="mb-4"><TwoFactorCard enabled={Boolean(me.totpEnabledAt)} /></div>
    <SettingsClient user={ctx.user} workspace={ctx.workspace} brands={JSON.parse(JSON.stringify(brands))} slots={slots.map((s) => ({ weekday: s.weekday, minuteOfDay: s.minuteOfDay, platform: s.platform }))} prefs={prefRows}
      canWorkspace={ctx.can("workspace.settings")} isOwner={ctx.role === "OWNER"} canCreateWs={ctx.role === "OWNER" || ctx.role === "ADMIN"} features={plan.features} /></>);
}
