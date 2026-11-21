import type { Prisma } from "@prisma/client";
import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { Avatar, Card, Empty, Notice, PageHeader } from "@/components/ui";
import { PLATFORM_LIST } from "@/lib/platforms/registry";
import { ContactPanel } from "./ContactPanel";
import Link from "next/link";

export const metadata = { title: "Contacts" };
const STATUSES = ["contact", "lead", "customer", "vip", "blocked"];

export default async function Contacts({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; platform?: string; id?: string; tag?: string }> }) {
  const ctx = await requireCtx();
  if (!ctx.can("contacts.manage") && !ctx.can("inbox.view")) return <Notice tone="warn">Your role doesn&apos;t include contacts.</Notice>;
  const sp = await searchParams; const ws = ctx.workspace.id;
  const where: Prisma.ContactWhereInput = { workspaceId: ws, ...(sp.status ? { status: sp.status } : {}), ...(sp.platform ? { platform: sp.platform } : {}), ...(sp.tag ? { tags: { has: sp.tag } } : {}),
    ...(sp.q ? { OR: [{ displayName: { contains: sp.q, mode: "insensitive" } }, { username: { contains: sp.q, mode: "insensitive" } }, { notes: { contains: sp.q, mode: "insensitive" } }] } : {}) };
  const [contacts, members, selected] = await Promise.all([
    db.contact.findMany({ where, orderBy: { lastInteractionAt: "desc" }, take: 300, include: { _count: { select: { conversations: true } } } }),
    db.membership.findMany({ where: { workspaceId: ws }, include: { user: { select: { id: true, name: true } } } }),
    sp.id ? db.contact.findFirst({ where: { id: sp.id, workspaceId: ws }, include: { conversations: { orderBy: { lastMessageAt: "desc" }, include: { account: { select: { displayName: true, platform: true } } } } } }) : null,
  ]);
  return (<>
    <PageHeader title="Contacts" subtitle="People who've messaged or commented on your accounts. Only data the networks share through their APIs is stored; you can erase a contact at any time." />
    <form className="mb-4 flex flex-wrap gap-2">
      <input name="q" defaultValue={sp.q} className="input max-w-xs" placeholder="Search name, username, notes" />
      <select name="status" defaultValue={sp.status ?? ""} className="input w-36"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
      <select name="platform" defaultValue={sp.platform ?? ""} className="input w-40"><option value="">All networks</option>{PLATFORM_LIST.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <button className="btn-secondary">Filter</button>
    </form>
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <Card pad={false}>{contacts.length === 0 ? <Empty title="No contacts yet" body="Contacts are created automatically when people message or comment on your connected accounts." /> : (
        <div className="overflow-x-auto"><table className="table w-full"><thead><tr><th>Name</th><th>Status</th><th>Tags</th><th>Conversations</th><th>Last interaction</th></tr></thead><tbody>
          {contacts.map((c) => (<tr key={c.id} className={sp.id === c.id ? "bg-[var(--soft)]" : "hover:bg-[var(--soft)]"}>
            <td><Link href={`/contacts?${new URLSearchParams({ ...sp, id: c.id } as Record<string, string>)}`} className="flex items-center gap-2"><Avatar src={c.avatarUrl} name={c.displayName} size={28} platform={c.platform} /><div><div className="font-medium">{c.displayName}</div>{c.username && <div className="muted text-xs">@{c.username}</div>}</div></Link></td>
            <td><span className="chip soft capitalize">{c.status}</span></td><td className="text-xs">{c.tags.join(", ")}</td><td>{c._count.conversations}</td><td className="muted text-xs">{fmtDate(c.lastInteractionAt, ctx.user.timezone)}</td></tr>))}
        </tbody></table></div>)}</Card>
      {selected ? <ContactPanel c={JSON.parse(JSON.stringify(selected))} members={members.map((m) => ({ id: m.user.id, name: m.user.name }))} canEdit={ctx.can("contacts.manage")} /> : <Card><Empty title="Select a contact" /></Card>}
    </div>
  </>);
}
