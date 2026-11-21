import { db } from "./db";
import type { JobEvent } from "@prisma/client";
import { notifyWorkspace, notifyUsers } from "./notify";
import { suggestReply, generateCalendar, isSensitive } from "./ai";

export interface Condition { field: string; op: "contains" | "not_contains" | "equals" | "not_equals"; value: string }
export type Action =
  | { type: "notify"; target: "managers" | "everyone" | "assignee"; message?: string }
  | { type: "add_tag"; tag: string }
  | { type: "set_priority" }
  | { type: "assign"; membershipId: string }
  | { type: "set_status"; status: "OPEN" | "PENDING" | "RESOLVED" | "ARCHIVED" }
  | { type: "create_contact"; status: string }
  | { type: "ai_draft_reply" }
  | { type: "ai_campaign_calendar" };

export const ACTION_LABELS: Record<Action["type"], string> = {
  notify: "Send a notification", add_tag: "Add a tag to the conversation", set_priority: "Flag conversation as priority", assign: "Assign the conversation",
  set_status: "Change conversation status", create_contact: "Create / update a contact record", ai_draft_reply: "Draft an AI reply for human review (never auto-sent)",
  ai_campaign_calendar: "Generate a suggested content calendar (as drafts)",
};

const get = (obj: Record<string, unknown>, path: string) => path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);

export function matches(conds: Condition[], payload: Record<string, unknown>) {
  return conds.every((c) => {
    const v = String(get(payload, c.field) ?? "").toLowerCase();
    const want = c.value.toLowerCase();
    if (c.op === "contains") return want.split(",").map((s) => s.trim()).filter(Boolean).some((w) => v.includes(w));
    if (c.op === "not_contains") return !want.split(",").map((s) => s.trim()).filter(Boolean).some((w) => v.includes(w));
    if (c.op === "equals") return v === want;
    return v !== want;
  });
}

async function runAction(a: Action, ev: JobEvent, p: Record<string, any>): Promise<string> {
  const convId = p.conversationId as string | undefined;
  const needConv = () => { if (!convId) throw new Error(`"${a.type}" needs a conversation event`); return convId; };
  switch (a.type) {
    case "notify": {
      const n = { type: "automation", title: a.message || `Automation: ${ev.type}`, body: String(p.text ?? p.error ?? p.name ?? "").slice(0, 200), href: convId ? `/inbox?c=${convId}` : p.postId ? `/posts/${p.postId}` : undefined };
      if (a.target === "assignee" && convId) {
        const c = await db.conversation.findUnique({ where: { id: convId }, include: { assignee: true } });
        if (c?.assignee) { await notifyUsers(ev.workspaceId, [c.assignee.userId], n); return "notified assignee"; }
        return "no assignee to notify";
      }
      await notifyWorkspace(ev.workspaceId, n, a.target === "managers" ? ["inbox.assign"] : []);
      return `notified ${a.target}`;
    }
    case "add_tag": { const c = await db.conversation.findUniqueOrThrow({ where: { id: needConv() } }); await db.conversation.update({ where: { id: c.id }, data: { tags: [...new Set([...c.tags, a.tag])] } }); return `tagged "${a.tag}"`; }
    case "set_priority": await db.conversation.update({ where: { id: needConv() }, data: { priority: true } }); return "flagged priority";
    case "set_status": await db.conversation.update({ where: { id: needConv() }, data: { status: a.status } }); return `status → ${a.status}`;
    case "assign": {
      const m = await db.membership.findFirst({ where: { id: a.membershipId, workspaceId: ev.workspaceId } });
      if (!m) throw new Error("Assignee is no longer a member");
      await db.conversation.update({ where: { id: needConv() }, data: { assigneeId: m.id } });
      await notifyUsers(ev.workspaceId, [m.userId], { type: "assignment", title: "Conversation assigned to you (automation)", href: `/inbox?c=${convId}` });
      return "assigned";
    }
    case "create_contact": {
      const c = await db.conversation.findUniqueOrThrow({ where: { id: needConv() } });
      if (!c.contactId) return "conversation has no contact";
      await db.contact.update({ where: { id: c.contactId }, data: { status: a.status } });
      return `contact marked ${a.status}`;
    }
    case "ai_draft_reply": {
      const id = needConv();
      if (isSensitive(String(p.text ?? ""))) {
        await db.conversation.update({ where: { id }, data: { priority: true, tags: { push: "needs-human" } } });
        return "sensitive content detected — flagged for a human instead of drafting";
      }
      const draft = await suggestReply(ev.workspaceId, null, id, { tone: "friendly" });
      await db.conversationNote.create({ data: { conversationId: id, userId: "automation", userName: "AI draft (automation)", body: `Suggested reply — review before sending:\n\n${draft}` } });
      return "AI draft added as internal note";
    }
    case "ai_campaign_calendar": {
      if (!p.campaignId) throw new Error("needs a campaign event");
      const n = await generateCalendar(ev.workspaceId, String(p.createdById ?? ""), String(p.campaignId));
      return `created ${n} draft posts`;
    }
  }
}

export async function processEvent(ev: JobEvent) {
  const autos = await db.automation.findMany({ where: { workspaceId: ev.workspaceId, trigger: ev.type, enabled: true } });
  const payload = ev.payload as Record<string, any>;
  for (const a of autos) {
    if (!matches((a.conditions as unknown as Condition[]) ?? [], payload)) {
      await db.automationRun.create({ data: { automationId: a.id, event: ev.payload as object, status: "skipped", detail: "Conditions not met" } });
      continue;
    }
    const results: string[] = [];
    let failed = false;
    for (const act of (a.actions as unknown as Action[]) ?? []) {
      try { results.push(await runAction(act, ev, payload)); }
      catch (e) { failed = true; results.push(`${act.type} failed: ${(e as Error).message}`); }
    }
    await db.automationRun.create({ data: { automationId: a.id, event: ev.payload as object, status: failed ? "failed" : "success", detail: results.join("; ") } });
    if (failed) await notifyWorkspace(ev.workspaceId, { type: "automation", title: `Automation "${a.name}" had errors`, body: results.join("; "), href: "/automations" }, ["automations.manage"]);
  }
}
