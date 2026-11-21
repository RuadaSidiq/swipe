import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { Avatar, Card, Empty, PageHeader, PlatformBadge, StatusBadge } from "@/components/ui";
import { Thumb } from "@/components/media";
export const metadata = { title: "Search" };
export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireCtx(); const { q = "" } = await searchParams; const ws = ctx.workspace.id; const term = q.trim();
  const ci = { contains: term, mode: "insensitive" as const };
  const [posts, convs, contacts, campaigns, media, accounts] = term.length < 2 ? [[], [], [], [], [], []] : await Promise.all([
    ctx.can("posts.create") || ctx.can("posts.edit") || ctx.can("analytics.view") ? db.post.findMany({ where: { workspaceId: ws, OR: [{ body: ci }, { title: ci }, { tags: { has: term.toLowerCase() } }] }, take: 20, orderBy: { updatedAt: "desc" } }) : [],
    ctx.can("inbox.view") ? db.conversation.findMany({ where: { workspaceId: ws, OR: [{ lastMessagePreview: ci }, { messages: { some: { body: ci } } }, { contact: { displayName: ci } }, { tags: { has: term.toLowerCase() } }] }, take: 20, include: { account: { select: { platform: true } }, contact: { select: { displayName: true, avatarUrl: true } } } }) : [],
    ctx.can("contacts.manage") || ctx.can("inbox.view") ? db.contact.findMany({ where: { workspaceId: ws, OR: [{ displayName: ci }, { username: ci }, { notes: ci }] }, take: 20 }) : [],
    db.campaign.findMany({ where: { workspaceId: ws, OR: [{ name: ci }, { description: ci }] }, take: 10 }),
    db.mediaAsset.findMany({ where: { workspaceId: ws, OR: [{ filename: ci }, { altText: ci }, { tags: { has: term.toLowerCase() } }] }, take: 12 }),
    db.socialAccount.findMany({ where: { workspaceId: ws, OR: [{ displayName: ci }, { username: ci }] }, take: 10, select: { id: true, platform: true, displayName: true, avatarUrl: true, status: true } }),
  ]);
  const total = posts.length + convs.length + contacts.length + campaigns.length + media.length + accounts.length;
  return (<>
    <PageHeader title={term ? `Results for “${term}”` : "Search"} subtitle={term ? `${total} results` : "Search posts, conversations, contacts, campaigns, media and accounts."} />
    <form className="mb-4"><input name="q" defaultValue={q} className="input max-w-lg" placeholder="Search…" autoFocus /></form>
    {term && total === 0 && <Card><Empty title="Nothing found" /></Card>}
    <div className="grid gap-4 lg:grid-cols-2">
      {posts.length > 0 && <Card title={`Posts (${posts.length})`} pad={false}><ul>{posts.map((p) => <li key={p.id}><Link href={`/posts/${p.id}`} className="line flex items-center gap-2 border-t px-4 py-2 text-sm first:border-t-0 hover:bg-[var(--soft)]"><span className="flex-1 truncate">{p.title || p.body}</span><StatusBadge status={p.status} /><span className="muted text-xs">{fmtDate(p.scheduledAt ?? p.updatedAt, ctx.user.timezone, "MMM d")}</span></Link></li>)}</ul></Card>}
      {convs.length > 0 && <Card title={`Conversations (${convs.length})`} pad={false}><ul>{convs.map((c) => <li key={c.id}><Link href={`/inbox?c=${c.id}&f=all`} className="line flex items-center gap-2 border-t px-4 py-2 text-sm first:border-t-0 hover:bg-[var(--soft)]"><Avatar src={c.contact?.avatarUrl} name={c.contact?.displayName ?? "?"} size={24} platform={c.account.platform} /><span className="flex-1 truncate">{c.lastMessagePreview}</span><StatusBadge status={c.status} /></Link></li>)}</ul></Card>}
      {contacts.length > 0 && <Card title={`Contacts (${contacts.length})`} pad={false}><ul>{contacts.map((c) => <li key={c.id}><Link href={`/contacts?id=${c.id}`} className="line flex items-center gap-2 border-t px-4 py-2 text-sm first:border-t-0 hover:bg-[var(--soft)]"><Avatar src={c.avatarUrl} name={c.displayName} size={24} platform={c.platform} />{c.displayName}<span className="chip soft ml-auto">{c.status}</span></Link></li>)}</ul></Card>}
      {campaigns.length > 0 && <Card title={`Campaigns (${campaigns.length})`} pad={false}><ul>{campaigns.map((c) => <li key={c.id}><Link href={`/campaigns/${c.id}`} className="line block border-t px-4 py-2 text-sm first:border-t-0 hover:bg-[var(--soft)]">{c.name}</Link></li>)}</ul></Card>}
      {accounts.length > 0 && <Card title={`Accounts (${accounts.length})`} pad={false}><ul>{accounts.map((a) => <li key={a.id} className="line flex items-center gap-2 border-t px-4 py-2 text-sm first:border-t-0"><PlatformBadge id={a.platform} size={18} />{a.displayName}<StatusBadge status={a.status} /></li>)}</ul></Card>}
      {media.length > 0 && <Card title={`Media (${media.length})`}><div className="grid grid-cols-4 gap-2">{media.map((m) => <Link key={m.id} href="/media" className="aspect-square overflow-hidden rounded-lg" title={m.filename}><Thumb a={m} /></Link>)}</div></Card>}
    </div>
  </>);
}
