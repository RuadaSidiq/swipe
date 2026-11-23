"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Zap } from "lucide-react";
import { Card, Empty, Notice, cx } from "@/components/ui";
import { Modal } from "../accounts/AccountsClient";
import { deleteAutomation, saveAutomation, toggleAutomation } from "../_actions/automations";

type Cond = { field: string; op: string; value: string };
type Act = { type: string; [k: string]: any };
interface Auto { id?: string; name: string; trigger: string; conditions: Cond[]; actions: Act[]; enabled: boolean; _count?: { runs: number } }
const FIELDS: Record<string, [string, string][]> = {
  "message.received": [["text", "Message text"], ["platform", "Network"], ["author", "Sender name"], ["account", "Receiving account"]],
  "comment.received": [["text", "Comment text"], ["platform", "Network"], ["kind", "Type (comment/mention)"], ["author", "Author"], ["account", "Account"]],
  "post.failed": [["platform", "Network"], ["error", "Error message"], ["account", "Account"]], "post.published": [], "conversation.assigned": [], "conversation.resolved": [], "campaign.created": [["name", "Campaign name"]],
};
const TEMPLATES: Auto[] = [
  { name: "Notify the team about new DMs", trigger: "message.received", conditions: [], actions: [{ type: "notify", target: "everyone" }], enabled: true },
  { name: "Flag comments with keywords", trigger: "comment.received", conditions: [{ field: "text", op: "contains", value: "price, cost, broken, refund" }], actions: [{ type: "set_priority" }, { type: "add_tag", tag: "review" }], enabled: true },
  { name: "Tell the assignee", trigger: "conversation.assigned", conditions: [], actions: [{ type: "notify", target: "assignee", message: "A conversation was assigned to you" }], enabled: true },
  { name: "Alert managers when a post fails", trigger: "post.failed", conditions: [], actions: [{ type: "notify", target: "managers", message: "A post failed to publish" }], enabled: true },
  { name: "Mark sales enquiries as leads", trigger: "message.received", conditions: [{ field: "text", op: "contains", value: "buy, quote, pricing, order, interested" }], actions: [{ type: "create_contact", status: "lead" }, { type: "add_tag", tag: "lead" }], enabled: true },
  { name: "Draft AI replies for review", trigger: "message.received", conditions: [], actions: [{ type: "ai_draft_reply" }], enabled: true },
  { name: "Suggest a calendar for new campaigns", trigger: "campaign.created", conditions: [], actions: [{ type: "ai_campaign_calendar" }], enabled: true },
];

export function Automations({ autos, runs, members, events, actionLabels }: { autos: Auto[]; runs: any[]; members: { id: string; name: string }[]; events: Record<string, string>; actionLabels: Record<string, string> }) {
  const router = useRouter(); const [edit, setEdit] = useState<Auto | null>(null); const [err, setErr] = useState(""); const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); setErr(r.ok ? "" : r.error!); router.refresh(); });
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-4">
        {err && <Notice tone="error">{err}</Notice>}
        <Card title="Your automations" actions={<button className="btn-primary py-1.5" onClick={() => setEdit({ name: "", trigger: "message.received", conditions: [], actions: [{ type: "notify", target: "everyone" }], enabled: true })}><Plus size={14} /> New</button>} pad={false}>
          {autos.length === 0 ? <Empty title="No automations yet" body="Start from a template below." /> : <ul>{autos.map((a) => (
            <li key={a.id} className="line flex flex-wrap items-center gap-3 border-t px-4 py-3 first:border-t-0">
              <Zap size={16} className={a.enabled ? "text-brand-500" : "muted"} />
              <button className="min-w-0 flex-1 text-left" onClick={() => setEdit(a)}><div className="font-medium">{a.name}</div><div className="muted text-xs">When {events[a.trigger]?.toLowerCase()}{a.conditions.length ? ` · ${a.conditions.length} condition${a.conditions.length > 1 ? "s" : ""}` : ""} → {a.actions.map((x) => actionLabels[x.type]).join(", ")} · {a._count?.runs ?? 0} runs</div></button>
              <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="switch" checked={a.enabled} disabled={pending} onChange={(e) => act(() => toggleAutomation(a.id!, e.target.checked))} /> {a.enabled ? "On" : "Paused"}</label>
              <button className="btn-ghost p-2 text-red-600 dark:text-red-400" onClick={() => confirm("Delete this automation?") && act(() => deleteAutomation(a.id!))}><Trash2 size={15} /></button>
            </li>))}</ul>}
        </Card>
        <Card title="Templates"><div className="grid gap-2.5 sm:grid-cols-2">{TEMPLATES.map((t) => <button key={t.name} className="tile text-sm" onClick={() => setEdit(structuredClone(t))}><div className="font-semibold">{t.name}</div><div className="muted text-xs">{events[t.trigger]}</div></button>)}</div></Card>
      </div>
      <Card title="Run history" pad={false}>{runs.length === 0 ? <Empty icon={<Zap size={20} />} title="No runs yet" body="Each time an automation runs, it shows up here." /> : <ul className="max-h-[70vh] overflow-y-auto">{runs.map((r) => (
        <li key={r.id} className="line border-t px-4 py-2.5 text-xs first:border-t-0"><div className="flex items-center gap-2"><span className={cx("chip", r.status === "success" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : r.status === "failed" ? "bg-red-500/15 text-red-600" : "soft")}>{r.status}</span><b className="truncate">{r.automation.name}</b><span className="muted ml-auto">{new Date(r.createdAt).toLocaleString()}</span></div><div className="muted mt-1">{r.detail}</div></li>))}</ul>}</Card>
      {edit && <Editor a={edit} members={members} events={events} actionLabels={actionLabels} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); router.refresh(); }} />}
    </div>
  );
}

function Editor({ a, members, events, actionLabels, onClose, onSaved }: { a: Auto; members: { id: string; name: string }[]; events: Record<string, string>; actionLabels: Record<string, string>; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<Auto>(a); const [err, setErr] = useState(""); const [pending, start] = useTransition();
  const fields = FIELDS[v.trigger] ?? [];
  const setAct = (i: number, p: Partial<Act>) => setV({ ...v, actions: v.actions.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  const defaults: Record<string, Act> = { notify: { type: "notify", target: "everyone" }, add_tag: { type: "add_tag", tag: "" }, set_priority: { type: "set_priority" }, assign: { type: "assign", membershipId: members[0]?.id ?? "" },
    set_status: { type: "set_status", status: "PENDING" }, create_contact: { type: "create_contact", status: "lead" }, ai_draft_reply: { type: "ai_draft_reply" }, ai_campaign_calendar: { type: "ai_campaign_calendar" } };
  return (
    <Modal title={a.id ? "Edit automation" : "New automation"} onClose={onClose} wide>
      <div className="space-y-4">
        <input className="input" placeholder="Name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <div><span className="label">When</span><select className="input" value={v.trigger} onChange={(e) => setV({ ...v, trigger: e.target.value, conditions: [] })}>{Object.entries(events).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div><span className="label">Only if (all must match)</span>
          {v.conditions.map((c, i) => <div key={i} className="mb-2 flex gap-2">
            <select className="input" value={c.field} onChange={(e) => setV({ ...v, conditions: v.conditions.map((x, k) => (k === i ? { ...x, field: e.target.value } : x)) })}>{fields.map(([f, l]) => <option key={f} value={f}>{l}</option>)}</select>
            <select className="input w-40" value={c.op} onChange={(e) => setV({ ...v, conditions: v.conditions.map((x, k) => (k === i ? { ...x, op: e.target.value } : x)) })}><option value="contains">contains any of</option><option value="not_contains">contains none of</option><option value="equals">equals</option><option value="not_equals">does not equal</option></select>
            <input className="input" value={c.value} placeholder="comma-separated" onChange={(e) => setV({ ...v, conditions: v.conditions.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)) })} />
            <button className="btn-ghost p-2" onClick={() => setV({ ...v, conditions: v.conditions.filter((_, k) => k !== i) })}>✕</button></div>)}
          {fields.length > 0 && <button className="btn-ghost py-1 text-xs" onClick={() => setV({ ...v, conditions: [...v.conditions, { field: fields[0][0], op: "contains", value: "" }] })}>+ Add condition</button>}
        </div>
        <div><span className="label">Then</span>
          {v.actions.map((x, i) => <div key={i} className="mb-2 flex flex-wrap gap-2">
            <select className="input w-72" value={x.type} onChange={(e) => setV({ ...v, actions: v.actions.map((y, k) => (k === i ? defaults[e.target.value] : y)) })}>{Object.entries(actionLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            {x.type === "notify" && <><select className="input w-36" value={x.target} onChange={(e) => setAct(i, { target: e.target.value })}><option value="everyone">Everyone</option><option value="managers">Managers</option><option value="assignee">Assignee</option></select><input className="input flex-1" placeholder="Message (optional)" value={x.message ?? ""} onChange={(e) => setAct(i, { message: e.target.value })} /></>}
            {x.type === "add_tag" && <input className="input flex-1" placeholder="tag" value={x.tag} onChange={(e) => setAct(i, { tag: e.target.value })} />}
            {x.type === "assign" && <select className="input flex-1" value={x.membershipId} onChange={(e) => setAct(i, { membershipId: e.target.value })}>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>}
            {x.type === "set_status" && <select className="input flex-1" value={x.status} onChange={(e) => setAct(i, { status: e.target.value })}>{["OPEN", "PENDING", "RESOLVED", "ARCHIVED"].map((s) => <option key={s}>{s}</option>)}</select>}
            {x.type === "create_contact" && <select className="input flex-1" value={x.status} onChange={(e) => setAct(i, { status: e.target.value })}>{["lead", "customer", "vip", "contact"].map((s) => <option key={s}>{s}</option>)}</select>}
            {x.type === "ai_draft_reply" && <span className="muted self-center text-xs">Sensitive messages (payments, legal, complaints) are flagged for a human instead.</span>}
            <button className="btn-ghost p-2" onClick={() => setV({ ...v, actions: v.actions.filter((_, k) => k !== i) })}>✕</button></div>)}
          <button className="btn-ghost py-1 text-xs" onClick={() => setV({ ...v, actions: [...v.actions, defaults.notify] })}>+ Add action</button>
        </div>
        {err && <Notice tone="error">{err}</Notice>}
        <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={pending || !v.name} onClick={() => start(async () => { const r = await saveAutomation(v); if (r.ok) onSaved(); else setErr(r.error); })}>Save</button></div>
      </div>
    </Modal>
  );
}
