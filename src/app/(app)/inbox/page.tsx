import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPlan } from "@/lib/billing";
import { env } from "@/lib/env";
import { Card, Empty, Notice } from "@/components/ui";
import { InboxView } from "./InboxView";

export const metadata = { title: "Inbox" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ s?: string; t?: string; p?: string; q?: string; c?: string }> }) {
  const ctx = await requireCtx();
  if (!ctx.can("inbox.view")) return <Notice tone="warn">Your role doesn&apos;t include inbox access.</Notice>;
  const { plan } = await getPlan(ctx.workspace.organizationId);
  const sp = await searchParams;
  const ws = ctx.workspace.id;
  const hasDemo = env.demoMode && (await db.conversation.count({ where: { workspaceId: ws, isDemo: true } })) > 0;
  if (!plan.features.inbox && !hasDemo) return <Card><Empty title="The unified inbox is part of Professional and Agency" body="Upgrade to answer every network in one place." action={<Link href="/billing" className="btn-primary">See plans</Link>} /></Card>;
  // Two filters, each multi-select; empty means "All". Within a filter choices are OR'd, filters are AND'd.
  const list = (v?: string) => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const status = list(sp.s), types = list(sp.t), platforms = list(sp.p);
  const STATUS: Record<string, Prisma.ConversationWhereInput> = {
    unread: { unread: true }, read: { unread: false }, mine: { assigneeId: ctx.membershipId }, unassigned: { assigneeId: null },
    flagged: { priority: true }, awaiting: { awaitingReply: true }, done: { status: "RESOLVED" }, archived: { status: "ARCHIVED" },
  };
  const KIND: Record<string, string[]> = { dm: ["dm"], comment: ["comment", "reply"], mention: ["mention"] };
  const and: Prisma.ConversationWhereInput[] = [];
  const st = status.filter((x) => STATUS[x]), kinds = types.filter((x) => KIND[x]).flatMap((x) => KIND[x]);
  if (st.length) and.push({ OR: st.map((x) => STATUS[x]) });
  if (!status.includes("archived")) and.push({ status: { not: "ARCHIVED" } });
  if (kinds.length) and.push({ kind: { in: kinds } });
  if (platforms.length) and.push({ account: { platform: { in: platforms as never[] } } });
  if (sp.q) and.push({ OR: [{ lastMessagePreview: { contains: sp.q, mode: "insensitive" } }, { contact: { displayName: { contains: sp.q, mode: "insensitive" } } }, { messages: { some: { body: { contains: sp.q, mode: "insensitive" } } } }, { tags: { has: sp.q.toLowerCase() } }] });
  const where: Prisma.ConversationWhereInput = { workspaceId: ws, ...(!plan.features.inbox ? { isDemo: true } : {}), AND: and };
  const connected = await db.socialAccount.findMany({ where: { workspaceId: ws, status: { not: "DISCONNECTED" } }, select: { platform: true }, distinct: ["platform"] });
  const [convs, members, saved, counts] = await Promise.all([
    db.conversation.findMany({ where, orderBy: [{ priority: "desc" }, { lastMessageAt: "desc" }], take: 150, include: { contact: { select: { displayName: true, avatarUrl: true, username: true } }, account: { select: { platform: true, displayName: true, isDemo: true } }, assignee: { include: { user: { select: { name: true } } } } } }),
    db.membership.findMany({ where: { workspaceId: ws, role: { in: ["OWNER", "ADMIN", "MANAGER", "SUPPORT"] } }, include: { user: { select: { name: true } } } }),
    db.savedReply.findMany({ where: { workspaceId: ws }, orderBy: { title: "asc" } }),
    db.conversation.groupBy({ by: ["unread"], where: { workspaceId: ws, status: { in: ["OPEN", "PENDING"] } }, _count: true }),
  ]);
  return (
    <InboxView key={JSON.stringify(sp)} convs={JSON.parse(JSON.stringify(convs))} members={members.map((m) => ({ id: m.id, name: m.user.name }))} saved={saved} me={ctx.membershipId}
      filters={{ status, types, platforms, q: sp.q ?? "" }} channels={connected.map((a) => a.platform)} openId={sp.c} unreadCount={counts.find((c) => c.unread)?._count ?? 0}
      can={{ reply: ctx.can("inbox.reply"), assign: ctx.can("inbox.assign"), ai: env.aiConfigured && ctx.can("ai.use") && plan.features.aiReplies }} />
  );
}
