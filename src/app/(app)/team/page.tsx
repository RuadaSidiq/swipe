import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS, permissionsFor, PERMISSIONS } from "@/lib/rbac";
import { fmtDate } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { TeamClient } from "./TeamClient";
import type { Role } from "@prisma/client";
export const metadata = { title: "Team" };
const PERM_LABELS: Record<string, string> = {
  "accounts.connect": "Connect accounts", "accounts.manage": "Manage accounts", "posts.create": "Create posts", "posts.edit": "Edit posts", "posts.schedule": "Schedule posts",
  "posts.publish": "Publish posts", "posts.approve": "Approve posts", "posts.delete": "Delete posts", "inbox.view": "Read the inbox", "inbox.reply": "Reply to messages",
  "inbox.assign": "Assign conversations", "analytics.view": "View analytics", "media.manage": "Manage media", "campaigns.manage": "Manage campaigns", "contacts.manage": "Manage contacts",
  "automations.manage": "Manage automations", "team.manage": "Manage the team", "billing.manage": "Manage billing", "workspace.settings": "Change workspace settings", "ai.use": "Use the AI assistant", "audit.view": "See activity",
};
const ACTIONS: Record<string, string> = {
  "post.schedule": "scheduled a post", "post.publish_now": "published a post", "post.draft": "saved a draft", "post.approve": "approved a post", "post.reschedule": "rescheduled a post", "post.delete": "deleted a post",
  "inbox.reply": "replied to a message", "inbox.assign": "assigned a conversation", "media.upload": "uploaded media", "account.connect": "connected an account", "account.disconnect": "disconnected an account",
  "team.invite": "invited someone", "team.role_change": "changed a role", "user.login": "signed in", "user.2fa_enabled": "turned on two-factor", "campaign.create": "created a campaign",
};
export default async function Team() {
  const ctx = await requireCtx(); const ws = ctx.workspace.id;
  const [members, invites, logs] = await Promise.all([
    db.membership.findMany({ where: { workspaceId: ws }, include: { user: { select: { name: true, email: true, lastActiveAt: true } } }, orderBy: { createdAt: "asc" } }),
    db.invite.findMany({ where: { workspaceId: ws, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
    ctx.can("audit.view") ? db.auditLog.findMany({ where: { workspaceId: ws }, orderBy: { createdAt: "desc" }, take: 60 }) : [],
  ]);
  const roles = Object.keys(ROLE_LABELS) as Role[];
  return (<>
    <PageHeader title="Team & permissions" subtitle="Invite people and choose what each person can do." />
    <TeamClient members={members.map((m) => ({ id: m.id, role: m.role, name: m.user.name, email: m.user.email, lastActive: m.user.lastActiveAt?.toISOString() ?? null, me: m.userId === ctx.user.id }))}
      invites={invites.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt.toISOString() }))} canManage={ctx.can("team.manage")} isOwner={ctx.role === "OWNER"} labels={ROLE_LABELS} />
    <details className="panel group mt-6 px-6 py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between font-medium [&::-webkit-details-marker]:hidden">What each role can do <span className="muted text-sm group-open:hidden">Show</span></summary>
      <div className="-mx-6 mt-3 overflow-x-auto"><table className="table w-full"><thead><tr><th>Can…</th>{roles.map((r) => <th key={r} className="text-center">{ROLE_LABELS[r].split(" ")[0]}</th>)}</tr></thead>
        <tbody>{PERMISSIONS.map((p) => <tr key={p}><td>{PERM_LABELS[p] ?? p}</td>{roles.map((r) => <td key={r} className="text-center">{permissionsFor(r).includes(p) ? <span className="text-brand-600 dark:text-brand-400">✓</span> : <span className="muted">–</span>}</td>)}</tr>)}</tbody></table></div>
    </details>
    {ctx.can("audit.view") && (
      <details className="panel group mt-4 px-6 py-4">
        <summary className="flex cursor-pointer list-none items-center justify-between font-medium [&::-webkit-details-marker]:hidden">Activity <span className="muted text-sm group-open:hidden">Show</span></summary>
        <ul className="mt-3 flex flex-col gap-3">{logs.map((l) => <li key={l.id} className="flex items-baseline justify-between gap-4 text-sm"><span><span className="font-medium">{l.actorName ?? "System"}</span> {ACTIONS[l.action] ?? l.action.replace(/[._]/g, " ")}</span><span className="muted shrink-0 text-xs">{fmtDate(l.createdAt, ctx.user.timezone, "MMM d, HH:mm")}</span></li>)}</ul>
      </details>
    )}
  </>);
}
