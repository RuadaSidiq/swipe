"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { adminFlag, adminSetPlan, adminTicket, adminToggleUser } from "../_actions/admin";

export function AdminClient({ orgs, users, tickets, flags, me }: { orgs: any[]; users: any[]; tickets: any[]; flags: { key: string; enabled: boolean; description: string }[]; me: string }) {
  const router = useRouter(); const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) alert(r.error); router.refresh(); });
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <Card title="Organizations & subscriptions" pad={false}><div className="max-h-96 overflow-y-auto"><table className="table w-full"><thead><tr><th>Organization</th><th>Workspaces</th><th>Plan</th><th>Status</th></tr></thead><tbody>
        {orgs.map((o) => <tr key={o.id}><td>{o.name}<div className="muted text-xs">{new Date(o.createdAt).toLocaleDateString()}</div></td><td>{o.workspaces}</td>
          <td><select className="input py-1 text-xs" disabled={pending} value={o.plan} onChange={(e) => run(() => adminSetPlan(o.id, e.target.value, o.status))}>{["free", "starter", "pro", "agency"].map((p) => <option key={p}>{p}</option>)}</select></td>
          <td><select className="input py-1 text-xs" disabled={pending} value={o.status} onChange={(e) => run(() => adminSetPlan(o.id, o.plan, e.target.value))}>{["active", "trialing", "past_due", "canceled"].map((p) => <option key={p}>{p}</option>)}</select></td></tr>)}
      </tbody></table></div></Card>
      <Card title="Users" pad={false}><div className="max-h-96 overflow-y-auto"><table className="table w-full"><thead><tr><th>User</th><th>Joined</th><th>Last active</th><th /></tr></thead><tbody>
        {users.map((u) => <tr key={u.id}><td>{u.name}{u.isPlatformAdmin && " ★"}<div className="muted text-xs">{u.email}</div></td><td className="text-xs">{new Date(u.createdAt).toLocaleDateString()}</td><td className="text-xs">{u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleDateString() : "—"}</td>
          <td>{u.id !== me && <button className="btn-ghost py-1 text-xs" disabled={pending} onClick={() => run(() => adminToggleUser(u.id, !u.disabledAt))}>{u.disabledAt ? "Enable" : "Disable"}</button>}</td></tr>)}
      </tbody></table></div></Card>
      <Card title="Feature controls">
        <ul className="space-y-2 text-sm">{flags.map((f) => <li key={f.key} className="flex items-center gap-2"><input type="checkbox" checked={f.enabled} disabled={pending} onChange={(e) => run(() => adminFlag(f.key, e.target.checked))} /><code>{f.key}</code><span className="muted text-xs">{f.description}</span></li>)}</ul>
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(() => adminFlag(String(f.get("k")), true, String(f.get("d")))); e.currentTarget.reset(); }}><input name="k" className="input" placeholder="flag_key" required /><input name="d" className="input" placeholder="Description" /><button className="btn-secondary">Add</button></form>
      </Card>
      <Card title="Support requests" pad={false}>{tickets.length === 0 ? <p className="muted p-4 text-sm">No support requests.</p> : <ul>{tickets.map((t) => <li key={t.id} className="line border-t px-4 py-2.5 text-sm first:border-t-0"><div className="flex items-center gap-2"><b className="flex-1">{t.subject}</b>
        <select className="input w-28 py-1 text-xs" value={t.status} onChange={(e) => run(() => adminTicket(t.id, e.target.value))}>{["open", "pending", "closed"].map((s) => <option key={s}>{s}</option>)}</select></div><div className="muted text-xs">{t.email} · {new Date(t.createdAt).toLocaleString()}</div><div className="mt-1 whitespace-pre-wrap text-xs">{t.body}</div></li>)}</ul>}</Card>
    </div>
  );
}
