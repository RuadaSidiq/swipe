import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPlan } from "@/lib/billing";
import { env } from "@/lib/env";
import { Card, Empty, Notice } from "@/components/ui";
import { InboxView } from "./InboxView";

export const metadata = { title: "Inbox" };

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ f?: string; type?: string; platform?: string; q?: string; c?: string }> }) {
  const ctx = await requireCtx();
  if (!ctx.can("inbox.view")) return <Notice tone="warn">Your role doesn&apos;t include inbox access.</Notice>;
  const { plan } = await getPlan(ctx.workspace.organizationId);
  const sp = await searchParams;
  const ws = ctx.workspace.id;
  const hasDemo = env.demoMode && (await db.conversation.count({ where: { workspaceId: ws, isDemo: true } })) > 0;
  if (!plan.features.inbox && !hasDemo) return <Card><Empty title="The unified inbox is part of Professional and Agency" body="Upgrade to answer every network in one place." action={<Link href="/billing" className="btn-primary">See plans</Link>} /></Card>;
  const f = sp.f ?? "open";
  const where: Prisma.ConversationWhereInput = { workspaceId: ws, ...(!plan.features.inbox ? { isDemo: true } : {}) };
  if (f === "open") where.status = { in: ["OPEN", "PENDING"] };
  if (f === "unread") { where.unread = true; where.status = { in: ["OPEN", "PENDING"] }; }
  if (f === "mine") { where.assigneeId = ctx.membershipId; where.status = { in: ["OPEN", "PENDING"] }; }
  if (f === "unassigned") { where.assigneeId = null; where.status = { in: ["OPEN", "PENDING"] }; }
  if (f === "priority") { where.priority = true; where.status = { in: ["OPEN", "PENDING"] }; }
  if (f === "awaiting") { where.awaitingReply = true; where.status = { in: ["OPEN", "PENDING"] }; }
  if (f === "read") { where.unread = false; where.status = { in: ["OPEN", "PENDING"] }; }
  if (f === "pending") where.status = "PENDING";
  if (f === "resolved") where.status = "RESOLVED";
  if (f === "archived") where.status = "ARCHIVED";
  if (sp.type) where.kind = sp.type === "comment" ? { in: ["comment", "reply"] } : sp.type;
  if (sp.platform) where.account = { platform: sp.platform };
  if (sp.q) where.OR = [{ lastMessagePreview: { contains: sp.q, mode: "insensitive" } }, { contact: { displayName: { contains: sp.q, mode: "insensitive" } } }, { messages: { some: { body: { contains: sp.q, mode: "insensitive" } } } }, { tags: { has: sp.q.toLowerCase() } }];
  const [convs, members, saved, counts] = await Promise.all([
    db.conversation.findMany({ where, orderBy: [{ priority: "desc" }, { lastMessageAt: "desc" }], take: 150, include: { contact: { select: { displayName: true, avatarUrl: true, username: true } }, account: { select: { platform: true, displayName: true, isDemo: true } }, assignee: { include: { user: { select: { name: true } } } } } }),
    db.membership.findMany({ where: { workspaceId: ws, role: { in: ["OWNER", "ADMIN", "MANAGER", "SUPPORT"] } }, include: { user: { select: { name: true } } } }),
    db.savedReply.findMany({ where: { workspaceId: ws }, orderBy: { title: "asc" } }),
    db.conversation.groupBy({ by: ["unread"], where: { workspaceId: ws, status: { in: ["OPEN", "PENDING"] } }, _count: true }),
  ]);
  return (
    <InboxView key={JSON.stringify(sp)} convs={JSON.parse(JSON.stringify(convs))} members={members.map((m) => ({ id: m.id, name: m.user.name }))} saved={saved} me={ctx.membershipId}
      filters={{ f, type: sp.type ?? "", platform: sp.platform ?? "", q: sp.q ?? "" }} openId={sp.c} unreadCount={counts.find((c) => c.unread)?._count ?? 0}
      can={{ reply: ctx.can("inbox.reply"), assign: ctx.can("inbox.assign"), ai: env.aiConfigured && ctx.can("ai.use") && plan.features.aiReplies }} />
  );
}
