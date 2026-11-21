"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { sendReply } from "@/lib/inbox";
import { notifyUsers } from "@/lib/notify";
import { emitEvent } from "@/lib/events";
import { audit } from "@/lib/audit";
import { safe } from "./common";

async function conv(id: string, perm: "inbox.view" | "inbox.reply" | "inbox.assign" = "inbox.view") {
  const ctx = await requireCtx(); ctx.assert(perm);
  const c = await db.conversation.findFirstOrThrow({ where: { id, workspaceId: ctx.workspace.id } });
  return { ctx, c };
}
const done = () => { revalidatePath("/inbox"); return true; };

export async function openConversation(id: string) {
  return safe(async () => {
    const { c } = await conv(id);
    if (c.unread) await db.conversation.update({ where: { id }, data: { unread: false } });
    const full = await db.conversation.findUniqueOrThrow({ where: { id }, include: {
      messages: { orderBy: { createdAt: "asc" }, take: 300 }, notes: { orderBy: { createdAt: "asc" } }, contact: true,
      account: { select: { id: true, platform: true, displayName: true, avatarUrl: true, isDemo: true, status: true } }, assignee: { include: { user: { select: { name: true } } } } } });
    return JSON.parse(JSON.stringify(full));
  });
}
export async function replyAction(id: string, body: string, aiAssisted: boolean) {
  return safe(async () => { const { ctx } = await conv(id, "inbox.reply"); const r = await sendReply(ctx, id, body, aiAssisted); if (!r.ok) throw new Error(r.error); done(); return r; });
}
export async function assignAction(id: string, membershipId: string | null) {
  return safe(async () => {
    const { ctx, c } = await conv(id, "inbox.assign");
    const m = membershipId ? await db.membership.findFirstOrThrow({ where: { id: membershipId, workspaceId: ctx.workspace.id } }) : null;
    await db.conversation.update({ where: { id }, data: { assigneeId: m?.id ?? null } });
    if (m && m.userId !== ctx.user.id) await notifyUsers(ctx.workspace.id, [m.userId], { type: "assignment", title: `${ctx.user.name} assigned you a conversation`, body: c.lastMessagePreview, href: `/inbox?c=${id}` });
    if (m) await emitEvent(ctx.workspace.id, "conversation.assigned", { conversationId: id, assignee: m.id });
    await audit(ctx, "inbox.assign", { targetType: "conversation", targetId: id, detail: { to: m?.id ?? null } });
    return done();
  });
}
export async function statusAction(id: string, status: "OPEN" | "PENDING" | "RESOLVED" | "ARCHIVED") {
  return safe(async () => {
    const { ctx } = await conv(id, "inbox.reply");
    await db.conversation.update({ where: { id }, data: { status, ...(status === "RESOLVED" ? { awaitingReply: false } : {}) } });
    if (status === "RESOLVED") await emitEvent(ctx.workspace.id, "conversation.resolved", { conversationId: id });
    return done();
  });
}
export async function flagsAction(id: string, f: { priority?: boolean; unread?: boolean; tags?: string[] }) {
  return safe(async () => { await conv(id, "inbox.reply"); await db.conversation.update({ where: { id }, data: { priority: f.priority, unread: f.unread, tags: f.tags?.map((t) => t.trim().toLowerCase()).filter(Boolean) } }); return done(); });
}
export async function noteAction(id: string, body: string) {
  return safe(async () => { const { ctx } = await conv(id); await db.conversationNote.create({ data: { conversationId: id, userId: ctx.user.id, userName: ctx.user.name, body: body.slice(0, 5000) } }); return done(); });
}
export async function savedReplyAction(input: { id?: string; title: string; body: string; remove?: boolean }) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("inbox.reply");
    if (input.remove && input.id) { await db.savedReply.deleteMany({ where: { id: input.id, workspaceId: ctx.workspace.id } }); return done(); }
    if (input.id) await db.savedReply.updateMany({ where: { id: input.id, workspaceId: ctx.workspace.id }, data: { title: input.title, body: input.body } });
    else await db.savedReply.create({ data: { workspaceId: ctx.workspace.id, title: input.title.slice(0, 80), body: input.body.slice(0, 4000) } });
    return done();
  });
}
