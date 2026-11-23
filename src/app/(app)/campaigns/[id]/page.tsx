import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { fmtDate, compact } from "@/lib/format";
import { getAnalytics } from "@/lib/analytics";
import { Card, Empty, PageHeader, PlatformBadge, Stat, StatusBadge } from "@/components/ui";
import { Thumb } from "@/components/media";
import { CampaignTools } from "./CampaignTools";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireCtx(); const { id } = await params; const ws = ctx.workspace.id; const tz = ctx.user.timezone;
  const c = await db.campaign.findFirst({ where: { id, workspaceId: ws }, include: { accounts: { include: { account: { select: { id: true, platform: true, displayName: true } } } },
    posts: { orderBy: { scheduledAt: "asc" }, include: { targets: { select: { account: { select: { platform: true } } } } } }, assets: { take: 24, orderBy: { createdAt: "desc" } } } });
  if (!c) notFound();
  const [accounts, members, brands] = await Promise.all([
    db.socialAccount.findMany({ where: { workspaceId: ws, status: { not: "DISCONNECTED" } }, select: { id: true, platform: true, displayName: true } }),
    db.membership.findMany({ where: { workspaceId: ws }, include: { user: { select: { name: true } } } }),
    db.brand.findMany({ where: { workspaceId: ws }, select: { id: true, name: true } }),
  ]);
  const a = await getAnalytics(ws, { from: c.startDate ?? new Date(Date.now() - 365 * 86400_000), to: c.endDate && c.endDate > new Date() ? c.endDate : new Date(), campaignId: c.id });
  const eng = ["likes", "comments", "shares", "saves"].reduce((n, k) => n + (a.totals[k] ?? 0), 0);
  const team = members.filter((m) => c.memberIds.includes(m.id));
  const groups = [["Drafts", ["DRAFT", "CHANGES_REQUESTED", "PENDING_APPROVAL"]], ["Scheduled", ["SCHEDULED", "PUBLISHING"]], ["Published", ["PUBLISHED", "PARTIAL"]], ["Failed", ["FAILED"]]] as const;
  return (<>
    <PageHeader title={c.name} subtitle={<><span className="chip soft mr-2 capitalize">{c.status}</span>{c.startDate ? fmtDate(c.startDate, tz, "MMM d, yyyy") : "No start"} – {c.endDate ? fmtDate(c.endDate, tz, "MMM d, yyyy") : "no end"}</>}
      actions={<><Link href={`/publisher?campaign=${c.id}`} className="btn-primary">Add post</Link>{ctx.can("campaigns.manage") && <CampaignTools aiEnabled={env.aiConfigured && ctx.can("ai.use")} accounts={accounts} members={members.map((m) => ({ id: m.id, name: m.user.name }))} brands={brands}
        init={{ id: c.id, name: c.name, description: c.description, goals: c.goals, color: c.color, status: c.status, startDate: c.startDate?.toISOString().slice(0, 10) ?? "", endDate: c.endDate?.toISOString().slice(0, 10) ?? "", brandId: c.brandId ?? "", accountIds: c.accounts.map((x) => x.accountId), memberIds: c.memberIds }} />}</>} />
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label="Posts" value={c.posts.length} /><Stat label="Published" value={a.published} /><Stat label="Engagements" value={a.withMetrics ? compact(eng) : "—"} hint={a.withMetrics ? `${a.withMetrics} posts with data` : "No metrics yet"} />
      <Stat label="Views / impressions" value={(a.totals.views ?? 0) + (a.totals.impressions ?? 0) ? compact((a.totals.views ?? 0) + (a.totals.impressions ?? 0)) : "—"} />
    </div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">{groups.map(([label, st]) => { const list = c.posts.filter((p) => (st as readonly string[]).includes(p.status)); return (
        <Card key={label} title={`${label} (${list.length})`} pad={false}>{list.length === 0 ? <div className="muted px-4 py-3 text-sm">None</div> : <ul>{list.map((p) => (
          <li key={p.id}><Link href={`/posts/${p.id}`} className="line flex items-center gap-3 border-t px-4 py-2.5 first:border-t-0 hover:bg-[var(--soft)]">
            <span className="muted w-24 shrink-0 text-xs">{p.scheduledAt ? fmtDate(p.scheduledAt, tz, "MMM d HH:mm") : "Unscheduled"}</span>
            <span className="flex -space-x-1">{[...new Set(p.targets.map((t) => t.account.platform))].map((x) => <PlatformBadge key={x} id={x} size={16} />)}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{p.title ? <b>{p.title}: </b> : null}{p.body}</span>{p.aiGenerated && <span className="chip bg-brand-500/10 text-brand-500">AI</span>}<StatusBadge status={p.status} /></Link></li>))}</ul>}</Card>); })}
      </div>
      <div className="space-y-4">
        {(c.description || c.goals) && <Card title="Brief"><p className="whitespace-pre-wrap text-sm">{c.description}</p>{c.goals && <><div className="label mt-3">Goals</div><p className="text-sm">{c.goals}</p></>}</Card>}
        <Card title="Accounts">{c.accounts.length ? <ul className="space-y-1.5">{c.accounts.map((x) => <li key={x.accountId} className="flex items-center gap-2 text-sm"><PlatformBadge id={x.account.platform} size={16} />{x.account.displayName}</li>)}</ul> : <span className="muted text-sm">None selected</span>}</Card>
        <Card title="Team">{team.length ? team.map((m) => <div key={m.id} className="text-sm">{m.user.name}</div>) : <span className="muted text-sm">No members assigned</span>}</Card>
        <Card title="Assets">{c.assets.length ? <div className="grid grid-cols-3 gap-2">{c.assets.map((m) => <Link key={m.id} href={`/publisher?campaign=${c.id}&media=${m.id}`} className="aspect-square overflow-hidden rounded-lg"><Thumb a={m} /></Link>)}</div> : <Empty title="No assets" />}</Card>
      </div>
    </div>
  </>);
}
