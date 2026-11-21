import { addDays, endOfMonth, endOfWeek, startOfMonth, startOfWeek, subDays } from "date-fns";
import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { CalendarView } from "./CalendarView";
export const metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const anchor = sp.date ? new Date(sp.date) : new Date();
  const from = subDays(startOfWeek(startOfMonth(anchor)), 7);
  const to = addDays(endOfWeek(endOfMonth(anchor)), 7);
  const [posts, accounts, campaigns, slots] = await Promise.all([
    db.post.findMany({ where: { workspaceId: ctx.workspace.id, status: { not: "CANCELLED" }, OR: [{ scheduledAt: { gte: from, lte: to } }, { publishedAt: { gte: from, lte: to } }] },
      include: { targets: { select: { status: true, account: { select: { id: true, platform: true, displayName: true } } } }, campaign: { select: { id: true, name: true, color: true } } }, take: 2000 }),
    db.socialAccount.findMany({ where: { workspaceId: ctx.workspace.id, status: { not: "DISCONNECTED" } }, select: { id: true, platform: true, displayName: true } }),
    db.campaign.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true, color: true, startDate: true, endDate: true, status: true } }),
    db.postingSlot.findMany({ where: { workspaceId: ctx.workspace.id } }),
  ]);
  const items = posts.map((p) => ({ id: p.id, title: p.title, body: p.body.slice(0, 140), status: p.status, at: (p.publishedAt ?? p.scheduledAt)!.toISOString(), campaign: p.campaign,
    targets: p.targets.map((t) => ({ status: t.status, platform: t.account.platform, accountId: t.account.id, name: t.account.displayName })) }));
  return (
    <>
      <PageHeader title="Calendar" />
      <CalendarView items={items} accounts={accounts} campaigns={JSON.parse(JSON.stringify(campaigns))} slots={slots} tz={ctx.user.timezone} initialView={(sp.view as "month") ?? "month"} anchorIso={anchor.toISOString()} canSchedule={ctx.can("posts.schedule")} />
    </>
  );
}
