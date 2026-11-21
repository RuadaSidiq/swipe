import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { Card, Empty, PageHeader, PlatformBadge } from "@/components/ui";
import { NewCampaign } from "./NewCampaign";
export const metadata = { title: "Campaigns" };
export default async function Campaigns() {
  const ctx = await requireCtx(); const ws = ctx.workspace.id;
  const [campaigns, accounts, members, brands] = await Promise.all([
    db.campaign.findMany({ where: { workspaceId: ws }, orderBy: [{ status: "asc" }, { startDate: "desc" }], include: { accounts: { include: { account: { select: { platform: true } } } }, posts: { select: { status: true } } } }),
    db.socialAccount.findMany({ where: { workspaceId: ws, status: { not: "DISCONNECTED" } }, select: { id: true, platform: true, displayName: true } }),
    db.membership.findMany({ where: { workspaceId: ws }, include: { user: { select: { name: true } } } }),
    db.brand.findMany({ where: { workspaceId: ws }, select: { id: true, name: true } }),
  ]);
  return (<>
    <PageHeader title="Campaigns" subtitle="Group posts, accounts, assets and people around a launch, event or promotion." actions={ctx.can("campaigns.manage") && <NewCampaign accounts={accounts} members={members.map((m) => ({ id: m.id, name: m.user.name }))} brands={brands} />} />
    {campaigns.length === 0 ? <Card><Empty title="No campaigns yet" body="Create a campaign to plan content around a product launch, event or promotion." /></Card> : (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{campaigns.map((c) => { const s = (st: string[]) => c.posts.filter((p) => st.includes(p.status)).length; return (
        <Link key={c.id} href={`/campaigns/${c.id}`} className="panel block p-4 transition hover:shadow-md" style={{ borderTop: `3px solid ${c.color}` }}>
          <div className="flex items-center justify-between"><div className="font-semibold">{c.name}</div><span className="chip soft capitalize">{c.status}</span></div>
          <div className="muted mt-1 line-clamp-2 text-sm">{c.description || "No description"}</div>
          <div className="muted mt-2 text-xs">{c.startDate ? fmtDate(c.startDate, ctx.user.timezone, "MMM d") : "?"} – {c.endDate ? fmtDate(c.endDate, ctx.user.timezone, "MMM d, yyyy") : "?"}</div>
          <div className="mt-3 flex items-center justify-between"><div className="flex -space-x-1">{[...new Set(c.accounts.map((a) => a.account.platform))].map((p) => <PlatformBadge key={p} id={p} size={18} />)}</div>
            <div className="text-xs"><b>{s(["DRAFT", "CHANGES_REQUESTED", "PENDING_APPROVAL"])}</b> drafts · <b>{s(["SCHEDULED"])}</b> scheduled · <b>{s(["PUBLISHED", "PARTIAL"])}</b> published</div></div>
        </Link>); })}</div>)}
  </>);
}
