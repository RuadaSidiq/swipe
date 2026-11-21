import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { Card, Empty, PageHeader, PlatformBadge, StatusBadge, cx } from "@/components/ui";
import { PLATFORM_LIST } from "@/lib/platforms/registry";

export const metadata = { title: "Posts" };
const TABS = [["all", "All"], ["PENDING_APPROVAL", "Awaiting approval"], ["SCHEDULED", "Scheduled"], ["DRAFT", "Drafts"], ["PUBLISHED", "Published"], ["FAILED", "Failed"]] as const;

export default async function PostsPage({ searchParams }: { searchParams: Promise<{ status?: string; platform?: string; campaign?: string; q?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const tz = ctx.user.timezone;
  const where: Prisma.PostWhereInput = { workspaceId: ctx.workspace.id };
  if (sp.status && sp.status !== "all") where.status = sp.status === "FAILED" ? { in: ["FAILED", "PARTIAL"] } : sp.status === "DRAFT" ? { in: ["DRAFT", "CHANGES_REQUESTED"] } : (sp.status as never);
  if (sp.platform) where.targets = { some: { account: { platform: sp.platform } } };
  if (sp.campaign) where.campaignId = sp.campaign;
  if (sp.q) where.OR = [{ body: { contains: sp.q, mode: "insensitive" } }, { title: { contains: sp.q, mode: "insensitive" } }, { tags: { has: sp.q } }];
  const [posts, counts, campaigns] = await Promise.all([
    db.post.findMany({ where, orderBy: [{ scheduledAt: { sort: "desc", nulls: "first" } }, { updatedAt: "desc" }], take: 200, include: { targets: { include: { account: { select: { platform: true, displayName: true, isDemo: true } } } }, campaign: { select: { name: true, color: true } } } }),
    db.post.groupBy({ by: ["status"], where: { workspaceId: ctx.workspace.id }, _count: true }),
    db.campaign.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true } }),
  ]);
  const c = (s: string[]) => counts.filter((x) => s.includes(x.status)).reduce((n, x) => n + x._count, 0);
  const tabCount: Record<string, number> = { all: c(["DRAFT", "PENDING_APPROVAL", "CHANGES_REQUESTED", "SCHEDULED", "PUBLISHING", "PUBLISHED", "PARTIAL", "FAILED"]), PENDING_APPROVAL: c(["PENDING_APPROVAL"]), SCHEDULED: c(["SCHEDULED"]), DRAFT: c(["DRAFT", "CHANGES_REQUESTED"]), PUBLISHED: c(["PUBLISHED"]), FAILED: c(["FAILED", "PARTIAL"]) };
  const qs = (o: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ ...sp, ...o }).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <>
      <PageHeader title="Posts" />
      <div className="mb-3 flex flex-wrap gap-1">
        {TABS.map(([k, l]) => <Link key={k} href={qs({ status: k })} className={cx("btn py-1.5", (sp.status ?? "all") === k ? "soft font-medium" : "muted")}>{l} <span className="muted text-xs">{tabCount[k]}</span></Link>)}
      </div>
      <form className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="status" value={sp.status ?? ""} />
        <input name="q" defaultValue={sp.q} className="input max-w-xs" placeholder="Search text or tag" />
        <select name="platform" defaultValue={sp.platform ?? ""} className="input w-40"><option value="">All networks</option>{PLATFORM_LIST.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select name="campaign" defaultValue={sp.campaign ?? ""} className="input w-44"><option value="">All campaigns</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <button className="btn-secondary">Filter</button>
      </form>
      <Card pad={false}>
        {posts.length === 0 ? <Empty title="No posts match" body="Create a post or change the filters." action={<Link href="/publisher" className="btn-primary">Create post</Link>} /> : (
          <div className="overflow-x-auto"><table className="table w-full">
            <thead><tr><th>Post</th><th>Destinations</th><th>Status</th><th>When</th></tr></thead>
            <tbody>{posts.map((p) => (
              <tr key={p.id} className="hover:bg-[var(--soft)]">
                <td className="max-w-md"><Link href={`/posts/${p.id}`} className="block"><div className="line-clamp-2">{p.title ? <b>{p.title} — </b> : null}{p.body || <span className="muted italic">No text</span>}</div>
                  <div className="mt-1 flex flex-wrap gap-1">{p.campaign && <span className="chip" style={{ background: p.campaign.color + "22", color: p.campaign.color }}>{p.campaign.name}</span>}{p.aiGenerated && <span className="chip bg-brand-500/10 text-brand-500">AI-assisted</span>}{p.recurrence && <span className="chip soft">Repeats</span>}</div></Link></td>
                <td><div className="flex flex-wrap gap-1">{p.targets.map((t) => <span key={t.id} title={`${t.account.displayName}: ${t.status}${t.error ? ` — ${t.error}` : ""}`} className={cx("rounded-md", t.status === "FAILED" && "ring-2 ring-red-500", t.status === "PUBLISHED" && "ring-2 ring-emerald-500")}><PlatformBadge id={t.account.platform} size={20} /></span>)}</div></td>
                <td><StatusBadge status={p.status} /></td>
                <td className="muted whitespace-nowrap text-xs">{fmtDate(p.publishedAt ?? p.scheduledAt, tz)}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </Card>
    </>
  );
}
