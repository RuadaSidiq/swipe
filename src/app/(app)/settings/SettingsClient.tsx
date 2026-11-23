"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, Notice } from "@/components/ui";
import { submitSupport, changePassword, createWorkspace, deleteBrand, deleteMyAccount, deleteWorkspace, saveBrand, saveNotificationPrefs, saveSlots, updateProfile, updateWorkspace } from "../_actions/settings";

const TZS = ["UTC", ...(typeof Intl !== "undefined" && "supportedValuesOf" in Intl ? ((Intl as any).supportedValuesOf("timeZone") as string[]).filter((t) => t !== "UTC") : [])];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type R = { ok: boolean; error?: string };

export function SettingsClient({ user, workspace, brands, slots, prefs, canWorkspace, isOwner, canCreateWs, features }: any) {
  const router = useRouter(); const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Record<string, { ok: boolean; text: string }>>({});
  const run = (key: string, fn: () => Promise<R>, ok = "Saved") => start(async () => { const r = await fn(); setMsg((m) => ({ ...m, [key]: { ok: r.ok, text: r.ok ? ok : r.error! } })); if (r.ok) router.refresh(); });
  const M = ({ k }: { k: string }) => msg[k] ? <Notice tone={msg[k].ok ? "success" : "error"}>{msg[k].text}</Notice> : null;
  const [brandEdit, setBrandEdit] = useState<any>(null);
  const [sl, setSl] = useState<{ weekday: number; minuteOfDay: number; platform: string | null }[]>(slots);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Your profile">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("profile", () => updateProfile({ name: f.get("name"), timezone: f.get("tz") })); }}>
          <Field label="Name"><input name="name" className="input" defaultValue={user.name} /></Field>
          <Field label="Your timezone" hint="Calendar and schedule times are shown in this timezone."><select name="tz" className="input" defaultValue={user.timezone}>{TZS.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <button className="btn-primary" disabled={pending}>Save profile</button><M k="profile" />
        </form>
        <form className="line mt-4 space-y-2 border-t pt-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("pw", () => changePassword({ current: String(f.get("c")), next: String(f.get("n")) }), "Password changed. Other devices were signed out."); e.currentTarget.reset(); }}>
          <div className="text-sm font-medium">Change password</div>
          <input name="c" type="password" className="input" placeholder="Current password" autoComplete="current-password" required />
          <input name="n" type="password" className="input" placeholder="New password (10+ chars)" autoComplete="new-password" required />
          <button className="btn-secondary" disabled={pending}>Change password</button><M k="pw" />
        </form>
      </Card>

      {canWorkspace && <Card title="Workspace">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("ws", () => updateWorkspace({ name: f.get("name"), timezone: f.get("tz"), requireApproval: f.get("approval") === "on" })); }}>
          <Field label="Workspace name"><input name="name" className="input" defaultValue={workspace.name} /></Field>
          <Field label="Default publishing timezone"><select name="tz" className="input" defaultValue={workspace.timezone}>{TZS.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="approval" defaultChecked={workspace.requireApproval} className="mt-1" /><span><b>Require approval before publishing</b><br /><span className="muted">Creators&apos; posts go to an approver before they&apos;re scheduled.{!features.approvals && " (Agency plan)"}</span></span></label>
          <button className="btn-primary" disabled={pending}>Save workspace</button><M k="ws" />
        </form>
      </Card>}

      {canWorkspace && <Card title="Brands & AI voice" className="xl:col-span-2" actions={<button className="btn-secondary py-1.5" onClick={() => setBrandEdit({ name: "", description: "", audience: "", tone: "", products: "", guidelines: "", bannedWords: "", examples: "", defaultHashtags: "", isDefault: false })}>+ Add brand</button>}>
        <div id="brands" className="grid gap-3 md:grid-cols-3">{brands.map((b: any) => <button key={b.id} onClick={() => setBrandEdit(b)} className="line rounded-lg border p-3 text-left hover:bg-[var(--soft)]"><div className="font-medium">{b.name} {b.isDefault && <span className="chip bg-brand-500/15 text-brand-500">default</span>}</div><div className="muted mt-1 line-clamp-2 text-xs">{b.tone || b.description || "No voice defined yet — click to set one up."}</div></button>)}</div>
        {!features.multiBrand && <p className="muted mt-2 text-xs">Multiple brands are available on Professional and Agency.</p>}
        {brandEdit && (
          <form className="line mt-4 grid gap-3 border-t pt-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run("brand", async () => { const r = await saveBrand(brandEdit); if (r.ok) setBrandEdit(null); return r; }); }}>
            {[["name", "Brand name", 1], ["tone", "Tone of voice (e.g. warm, witty, no jargon)", 2], ["description", "About the brand", 3], ["audience", "Target audience", 2], ["products", "Products & services", 3], ["guidelines", "Communication guidelines (do / don't)", 4], ["examples", "Approved example posts (one per paragraph)", 6], ["bannedWords", "Words to avoid", 1], ["defaultHashtags", "Preferred hashtags", 1]].map(([k, l, rows]) => (
              <Field key={k as string} label={l as string}>{rows === 1 ? <input className="input" value={brandEdit[k as string]} onChange={(e) => setBrandEdit({ ...brandEdit, [k as string]: e.target.value })} required={k === "name"} /> : <textarea className="input" rows={rows as number} value={brandEdit[k as string]} onChange={(e) => setBrandEdit({ ...brandEdit, [k as string]: e.target.value })} />}</Field>))}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={brandEdit.isDefault} onChange={(e) => setBrandEdit({ ...brandEdit, isDefault: e.target.checked })} /> Default brand for this workspace</label>
            <div className="flex gap-2 md:col-span-2"><button className="btn-primary" disabled={pending}>Save brand</button><button type="button" className="btn-secondary" onClick={() => setBrandEdit(null)}>Cancel</button>
              {brandEdit.id && <button type="button" className="btn-ghost text-red-600 dark:text-red-400" onClick={() => confirm("Delete this brand?") && run("brand", async () => { const r = await deleteBrand(brandEdit.id); if (r.ok) setBrandEdit(null); return r; }, "Deleted")}>Delete</button>}</div>
          </form>)}
        <M k="brand" />
      </Card>}

      {canWorkspace && <Card title="Preferred posting times">
        <p className="muted mb-3 text-sm">Shown as highlighted slots in the calendar&apos;s week view (in the workspace timezone).</p>
        <ul className="space-y-2">{sl.map((s, i) => <li key={i} className="flex gap-2">
          <select className="input w-24" value={s.weekday} onChange={(e) => setSl(sl.map((x, k) => (k === i ? { ...x, weekday: Number(e.target.value) } : x)))}>{DAYS.map((d, k) => <option key={d} value={k}>{d}</option>)}</select>
          <input type="time" className="input w-32" value={`${String(Math.floor(s.minuteOfDay / 60)).padStart(2, "0")}:${String(s.minuteOfDay % 60).padStart(2, "0")}`} onChange={(e) => { const [h, m] = e.target.value.split(":").map(Number); setSl(sl.map((x, k) => (k === i ? { ...x, minuteOfDay: h * 60 + m } : x))); }} />
          <button className="btn-ghost p-2" onClick={() => setSl(sl.filter((_, k) => k !== i))}>✕</button></li>)}</ul>
        <div className="mt-3 flex gap-2"><button className="btn-secondary" onClick={() => setSl([...sl, { weekday: 2, minuteOfDay: 600, platform: null }])}>+ Add time</button><button className="btn-primary" disabled={pending} onClick={() => run("slots", () => saveSlots(sl))}>Save times</button></div><M k="slots" />
      </Card>}

      <Card title="Notification preferences">
        <form id="notifications" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("prefs", () => saveNotificationPrefs(prefs.map((p: any) => ({ type: p.type, inApp: f.get(`${p.type}-app`) === "on", email: f.get(`${p.type}-email`) === "on" })))); }}>
          <table className="table w-full"><thead><tr><th>Event</th><th className="text-center">In-app</th><th className="text-center">Email</th></tr></thead><tbody>
            {prefs.map((p: any) => <tr key={p.type}><td>{p.label}</td><td className="text-center"><input type="checkbox" name={`${p.type}-app`} defaultChecked={p.inApp} /></td><td className="text-center"><input type="checkbox" name={`${p.type}-email`} defaultChecked={p.email} /></td></tr>)}</tbody></table>
          <p className="muted mt-2 text-xs">Email needs RESEND_API_KEY on the server.</p>
          <button className="btn-primary mt-2" disabled={pending}>Save preferences</button><M k="prefs" />
        </form>
      </Card>

      <Card title="Workspaces">
        <div id="workspaces" />
        {canCreateWs ? <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run("nws", () => createWorkspace(String(f.get("name")))); }}><input name="name" className="input" placeholder="Client or brand name" required /><button className="btn-primary" disabled={pending}>Create workspace</button></form>
          : <p className="muted text-sm">Ask an owner or admin to create workspaces.</p>}
        <p className="muted mt-2 text-xs">Each workspace keeps its own accounts, content and team.</p><M k="nws" />
      </Card>

      <Card title="Contact support">
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const form = e.currentTarget; run("support", async () => { const r = await submitSupport({ subject: String(f.get("s")), body: String(f.get("b")) }); if (r.ok) form.reset(); return r; }, "Thanks — our team will get back to you by email."); }}>
          <input name="s" className="input" placeholder="Subject" required />
          <textarea name="b" className="input" rows={3} placeholder="Describe the problem (which account, what you tried, any error message)" required />
          <button className="btn-secondary" disabled={pending}>Send to support</button><M k="support" />
        </form>
      </Card>

      <Card title="Data & privacy">
        <div className="flex flex-wrap gap-2">
          {(isOwner || canWorkspace) && <a href="/api/export" className="btn-secondary">Export workspace data (JSON)</a>}
          {isOwner && <button className="btn-secondary text-red-600 dark:text-red-400" onClick={() => { const n = prompt(`Type "${workspace.name}" to permanently delete this workspace, its posts, media, conversations and connected accounts.`); if (n) run("delws", () => deleteWorkspace(n)); }}>Delete workspace</button>}
          <button className="btn-ghost text-red-600 dark:text-red-400" onClick={() => { const p = prompt("Enter your password to permanently delete your Swipe account."); if (p) run("delme", () => deleteMyAccount(p)); }}>Delete my account</button>
        </div>
        <p className="muted mt-2 text-xs">Exports never include access tokens. Published posts stay on the networks.</p>
        <M k="delws" /><M k="delme" />
      </Card>
    </div>
  );
}
