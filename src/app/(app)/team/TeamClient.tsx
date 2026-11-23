"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Notice } from "@/components/ui";
import { changeRole, inviteMember, removeMember, revokeInvite } from "../_actions/team";

export function TeamClient({ members, invites, canManage, isOwner, labels }: { members: { id: string; role: string; name: string; email: string; lastActive: string | null; me: boolean }[]; invites: { id: string; email: string; role: string; expiresAt: string }[]; canManage: boolean; isOwner: boolean; labels: Record<string, string> }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string; link?: string } | null>(null);
  const [email, setEmail] = useState(""); const [role, setRole] = useState("CREATOR");
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) setMsg({ tone: "error", text: r.error! }); router.refresh(); });
  const assignable = Object.keys(labels).filter((r) => r !== "OWNER" && (isOwner || r !== "ADMIN"));
  return (
    <div className="space-y-4">
      {msg && <Notice tone={msg.tone}>{msg.text}{msg.link && <div className="mt-1 break-all text-xs">Invite link: <code>{msg.link}</code></div>}</Notice>}
      {canManage && <Card title="Invite someone">
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await inviteMember({ email, role }); if (r.ok) { setMsg({ tone: "success", text: r.data.sent ? `Invitation emailed to ${email}.` : "Invitation created. Email isn't configured, so share this link:", link: r.data.sent ? undefined : r.data.link }); setEmail(""); } else setMsg({ tone: "error", text: r.error }); router.refresh(); }); }}>
          <input className="input max-w-xs" type="email" required placeholder="colleague@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select className="input w-56" value={role} onChange={(e) => setRole(e.target.value)}>{assignable.map((r) => <option key={r} value={r}>{labels[r]}</option>)}</select>
          <button className="btn-primary" disabled={pending}>Send invite</button>
        </form></Card>}
      <Card title={`Members (${members.length})`} pad={false}><table className="table w-full"><thead><tr><th>Name</th><th>Role</th><th>Last active</th><th /></tr></thead><tbody>
        {members.map((m) => <tr key={m.id}><td><div className="font-medium">{m.name}{m.me && " (you)"}</div><div className="muted text-xs">{m.email}</div></td>
          <td>{canManage && !m.me ? <select className="input w-60 py-1.5" value={m.role} disabled={pending} onChange={(e) => run(() => changeRole(m.id, e.target.value))}>{Object.keys(labels).filter((r) => isOwner || !["OWNER", "ADMIN"].includes(r) || r === m.role).map((r) => <option key={r} value={r}>{labels[r]}</option>)}</select> : labels[m.role]}</td>
          <td className="muted text-xs">{m.lastActive ? new Date(m.lastActive).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Never"}</td>
          <td className="text-right">{canManage && !m.me && m.role !== "OWNER" && <button className="btn-ghost py-1 text-xs text-red-600 dark:text-red-400" onClick={() => confirm(`Remove ${m.name}?`) && run(() => removeMember(m.id))}>Remove</button>}</td></tr>)}
      </tbody></table></Card>
      {invites.length > 0 && <Card title="Pending invitations" pad={false}><ul>{invites.map((i) => <li key={i.id} className="line flex items-center gap-3 border-t px-4 py-2.5 text-sm first:border-t-0"><span className="flex-1">{i.email} · {labels[i.role]}</span><span className="muted text-xs">expires {new Date(i.expiresAt).toLocaleDateString()}</span>{canManage && <button className="btn-ghost py-1 text-xs" onClick={() => run(() => revokeInvite(i.id))}>Revoke</button>}</li>)}</ul></Card>}
    </div>
  );
}
