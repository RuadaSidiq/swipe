import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS, permissionsFor, PERMISSIONS } from "@/lib/rbac";
import { fmtDate } from "@/lib/format";
import { Card, PageHeader } from "@/components/ui";
import { TeamClient } from "./TeamClient";
import type { Role } from "@prisma/client";
export const metadata = { title: "Team" };
export default async function Team() {
  const ctx = await requireCtx(); const ws = ctx.workspace.id;
  const [members, invites, logs] = await Promise.all([
    db.membership.findMany({ where: { workspaceId: ws }, include: { user: { select: { name: true, email: true, lastActiveAt: true } } }, orderBy: { createdAt: "asc" } }),
    db.invite.findMany({ where: { workspaceId: ws, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
    ctx.can("audit.view") ? db.auditLog.findMany({ where: { workspaceId: ws }, orderBy: { createdAt: "desc" }, take: 60 }) : [],
  ]);
  const roles = Object.keys(ROLE_LABELS) as Role[];
  return (<>
    <PageHeader title="Team" subtitle="Invite people and control what each role can do in this workspace." />
    <TeamClient members={members.map((m) => ({ id: m.id, role: m.role, name: m.user.name, email: m.user.email, lastActive: m.user.lastActiveAt?.toISOString() ?? null, me: m.userId === ctx.user.id }))}
      invites={invites.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt.toISOString() }))} canManage={ctx.can("team.manage")} isOwner={ctx.role === "OWNER"} labels={ROLE_LABELS} />
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <Card title="Role permissions" pad={false}><div className="overflow-x-auto"><table className="table w-full text-xs"><thead><tr><th>Permission</th>{roles.map((r) => <th key={r} className="text-center">{ROLE_LABELS[r].split(" ")[0]}</th>)}</tr></thead>
        <tbody>{PERMISSIONS.map((p) => <tr key={p}><td className="font-mono">{p}</td>{roles.map((r) => <td key={r} className="text-center">{permissionsFor(r).includes(p) ? "✓" : <span className="muted">–</span>}</td>)}</tr>)}</tbody></table></div></Card>
      {ctx.can("audit.view") && <Card title="Activity log" pad={false}><ul className="max-h-[520px] overflow-y-auto">{logs.map((l) => <li key={l.id} className="line border-t px-4 py-2 text-xs first:border-t-0"><b>{l.actorName ?? "System"}</b> <span className="font-mono">{l.action}</span> {l.targetType && <span className="muted">{l.targetType}</span>}<div className="muted">{fmtDate(l.createdAt, ctx.user.timezone)}{l.ip ? ` · ${l.ip}` : ""}</div></li>)}</ul></Card>}
    </div>
  </>);
}
