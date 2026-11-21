import { db } from "./db";
import type { Prisma, SocialAccount } from "@prisma/client";
import type { Ctx } from "./auth";
import { ADAPTERS } from "./platforms/adapters";
import { platform, type PlatformId } from "./platforms/registry";
import { PlatformError } from "./platforms/http";
import { freshAccount, markAuthProblem } from "./accounts";
import { notifyWorkspace } from "./notify";
import { emitEvent } from "./events";
import { audit } from "./audit";
import { env } from "./env";

export interface Inbound {
  kind: "dm" | "comment" | "mention" | "reply";
  threadId: string;           // DM: sender/chat id. Comment: parent post/comment id
  subject?: string;
  externalId: string;         // message/comment id (dedupe key)
  author: { id: string; name: string; handle?: string; avatar?: string };
  body: string;
  attachments?: { type: string; url?: string }[];
  at?: Date;
  fromSelf?: boolean;
}

/** Idempotent: webhooks are retried by networks, so duplicates are ignored via (conversation, externalId). */
export async function ingest(account: SocialAccount, m: Inbound) {
  const contact = m.fromSelf ? null : await db.contact.upsert({
    where: { workspaceId_platform_externalId: { workspaceId: account.workspaceId, platform: account.platform, externalId: m.author.id } },
    create: { workspaceId: account.workspaceId, platform: account.platform, externalId: m.author.id, displayName: m.author.name, username: m.author.handle, avatarUrl: m.author.avatar, lastInteractionAt: m.at ?? new Date() },
    update: { displayName: m.author.name, username: m.author.handle ?? undefined, avatarUrl: m.author.avatar ?? undefined, lastInteractionAt: m.at ?? new Date() },
  });
  const conv = await db.conversation.upsert({
    where: { accountId_kind_externalThreadId: { accountId: account.id, kind: m.kind, externalThreadId: m.threadId } },
    create: { workspaceId: account.workspaceId, accountId: account.id, kind: m.kind, externalThreadId: m.threadId, subject: m.subject, contactId: contact?.id, isDemo: account.isDemo, lastMessagePreview: m.body.slice(0, 160), lastMessageAt: m.at ?? new Date() },
    update: {},
  });
  const exists = await db.message.findUnique({ where: { conversationId_externalId: { conversationId: conv.id, externalId: m.externalId } } });
  if (exists) return { conversation: conv, duplicate: true };
  await db.message.create({ data: { conversationId: conv.id, direction: m.fromSelf ? "outbound" : "inbound", externalId: m.externalId, authorName: m.author.name, authorHandle: m.author.handle,
    authorAvatar: m.author.avatar, body: m.body, attachments: (m.attachments ?? []) as Prisma.InputJsonValue, status: m.fromSelf ? "sent" : "received", createdAt: m.at ?? new Date() } });
  if (m.fromSelf) return { conversation: conv, duplicate: false };
  const reopened = conv.status === "RESOLVED" || conv.status === "ARCHIVED";
  await db.conversation.update({ where: { id: conv.id }, data: { unread: true, awaitingReply: true, lastMessageAt: m.at ?? new Date(), lastMessagePreview: m.body.slice(0, 160), contactId: conv.contactId ?? contact?.id,
    ...(reopened ? { status: "OPEN" } : {}) } });
  const p = platform(account.platform);
  const type = m.kind === "dm" ? "message" : m.kind === "mention" ? "mention" : "comment";
  await notifyWorkspace(account.workspaceId, { type, title: `New ${m.kind === "dm" ? "message" : m.kind} on ${p.name}`, body: `${m.author.name}: ${m.body.slice(0, 140)}`, href: `/inbox?c=${conv.id}` }, ["inbox.view"]);
  await emitEvent(account.workspaceId, m.kind === "dm" ? "message.received" : "comment.received", {
    conversationId: conv.id, text: m.body, platform: account.platform, kind: m.kind, author: m.author.name, account: account.displayName });
  return { conversation: conv, duplicate: false };
}

export async function sendReply(ctx: Ctx, conversationId: string, body: string, aiAssisted = false) {
  ctx.assert("inbox.reply");
  if (!body.trim()) throw new Error("Write a reply first.");
  const conv = await db.conversation.findFirstOrThrow({ where: { id: conversationId, workspaceId: ctx.workspace.id }, include: { account: true, contact: true, messages: { where: { direction: "inbound" }, orderBy: { createdAt: "desc" }, take: 1 } } });
  const p = platform(conv.account.platform);
  const msg = await db.message.create({ data: { conversationId, direction: "outbound", authorName: ctx.user.name, body, sentById: ctx.user.id, status: "sending", aiAssisted } });
  try {
    let externalId: string;
    if (conv.account.isDemo) {
      if (!env.demoMode) throw new PlatformError("Demo accounts can't send while DEMO_MODE is off.");
      externalId = `demo_${msg.id}`;
    } else {
      const adapter = ADAPTERS[p.id as PlatformId];
      if (!adapter.reply) throw new PlatformError(`Replying on ${p.name} isn't supported.`);
      const lastIn = conv.messages[0];
      if (conv.kind === "dm" && ["instagram", "facebook", "whatsapp"].includes(p.id) && lastIn && Date.now() - lastIn.createdAt.getTime() > 24 * 3600_000)
        throw new PlatformError(`${p.name} only allows free-form replies within 24 hours of the customer's last message.`);
      const { acc } = await freshAccount(conv.accountId);
      const r = await adapter.reply(acc, { conversationKind: conv.kind, externalThreadId: conv.externalThreadId, recipientId: conv.contact?.externalId ?? conv.externalThreadId, replyToExternalId: lastIn?.externalId ?? undefined, body });
      externalId = r.externalId;
    }
    await db.message.update({ where: { id: msg.id }, data: { status: "sent", externalId } });
    await db.conversation.update({ where: { id: conversationId }, data: { awaitingReply: false, unread: false, lastMessageAt: new Date(), lastMessagePreview: `You: ${body.slice(0, 150)}` } });
    await audit(ctx, "inbox.reply", { targetType: "conversation", targetId: conversationId, detail: { aiAssisted, simulated: conv.account.isDemo } });
    return { ok: true as const, simulated: conv.account.isDemo };
  } catch (e) {
    const err = e as Error;
    await db.message.update({ where: { id: msg.id }, data: { status: "failed", error: err.message } });
    if (e instanceof PlatformError && e.auth) await markAuthProblem(conv.account, err.message);
    return { ok: false as const, error: err.message };
  }
}
