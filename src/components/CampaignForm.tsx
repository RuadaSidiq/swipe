"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Notice, PlatformBadge, cx } from "./ui";
import { saveCampaign } from "@/app/(app)/_actions/campaigns";

export interface CampaignInit { id?: string; name: string; description: string; goals: string; color: string; status: string; startDate: string; endDate: string; brandId: string; accountIds: string[]; memberIds: string[] }

export function CampaignForm({ init, accounts, members, brands, onDone }: { init: CampaignInit; accounts: { id: string; platform: string; displayName: string }[]; members: { id: string; name: string }[]; brands: { id: string; name: string }[]; onDone?: () => void }) {
  const router = useRouter(); const [v, setV] = useState(init); const [err, setErr] = useState(""); const [pending, start] = useTransition();
  const set = (p: Partial<CampaignInit>) => setV((x) => ({ ...x, ...p }));
  const toggle = (k: "accountIds" | "memberIds", id: string) => set({ [k]: v[k].includes(id) ? v[k].filter((x) => x !== id) : [...v[k], id] });
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await saveCampaign({ ...v, startDate: v.startDate || null, endDate: v.endDate || null, brandId: v.brandId || null }); if (!r.ok) setErr(r.error); else { onDone?.(); router.push(`/campaigns/${r.data}`); router.refresh(); } }); }}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><input className="input" required placeholder="Campaign name (e.g. Spring launch)" value={v.name} onChange={(e) => set({ name: e.target.value })} /><input type="color" className="h-10 w-14 rounded-lg" value={v.color} onChange={(e) => set({ color: e.target.value })} aria-label="Colour" /></div>
      <textarea className="input" rows={3} placeholder="Description" value={v.description} onChange={(e) => set({ description: e.target.value })} />
      <textarea className="input" rows={2} placeholder="Goals (e.g. 500 sign-ups, launch awareness)" value={v.goals} onChange={(e) => set({ goals: e.target.value })} />
      <div className="grid gap-3 sm:grid-cols-4">
        <label><span className="label">Start</span><input type="date" className="input" value={v.startDate} onChange={(e) => set({ startDate: e.target.value })} /></label>
        <label><span className="label">End</span><input type="date" className="input" value={v.endDate} onChange={(e) => set({ endDate: e.target.value })} /></label>
        <label><span className="label">Status</span><select className="input" value={v.status} onChange={(e) => set({ status: e.target.value })}>{["planning", "active", "paused", "completed"].map((s) => <option key={s}>{s}</option>)}</select></label>
        <label><span className="label">Brand</span><select className="input" value={v.brandId} onChange={(e) => set({ brandId: e.target.value })}><option value="">Default</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      </div>
      <div><span className="label">Accounts</span><div className="flex flex-wrap gap-1.5">{accounts.map((a) => <button type="button" key={a.id} onClick={() => toggle("accountIds", a.id)} className={cx("chip border py-1 line", v.accountIds.includes(a.id) ? "border-brand-500 bg-brand-500/10" : "opacity-60")}><PlatformBadge id={a.platform} size={14} /> {a.displayName}</button>)}</div></div>
      <div><span className="label">Team</span><div className="flex flex-wrap gap-1.5">{members.map((m) => <button type="button" key={m.id} onClick={() => toggle("memberIds", m.id)} className={cx("chip border py-1 line", v.memberIds.includes(m.id) ? "border-brand-500 bg-brand-500/10" : "opacity-60")}>{m.name}</button>)}</div></div>
      {err && <Notice tone="error">{err}</Notice>}
      <button className="btn-primary" disabled={pending}>{v.id ? "Save campaign" : "Create campaign"}</button>
    </form>
  );
}
