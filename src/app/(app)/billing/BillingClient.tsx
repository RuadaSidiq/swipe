"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Notice, cx } from "@/components/ui";
import type { Plan } from "@/lib/plans";
import { checkout, portal, setCancel } from "../_actions/billing";

export function BillingClient({ mode, plans, current, stripe, hasStripeSub, cancelAtPeriodEnd }: { mode: "plans" | "manage"; plans?: Plan[]; current?: string; stripe: boolean; hasStripeSub: boolean; cancelAtPeriodEnd: boolean }) {
  const router = useRouter(); const [annual, setAnnual] = useState(false); const [pending, start] = useTransition(); const [err, setErr] = useState("");
  const go = (fn: () => Promise<unknown>) => start(async () => { try { await fn(); } catch (e) { if (!String((e as { digest?: string }).digest ?? "").startsWith("NEXT_REDIRECT")) setErr((e as Error).message); else throw e; } });
  if (mode === "manage") return (
    <div className="mt-4 space-y-2">
      {err && <Notice tone="error">{err}</Notice>}
      {stripe && hasStripeSub && <button className="btn-secondary w-full" disabled={pending} onClick={() => go(() => portal())}>Manage payment & invoices</button>}
      {stripe && hasStripeSub && <button className="btn-ghost w-full text-sm" disabled={pending} onClick={() => (cancelAtPeriodEnd || confirm("Cancel at the end of the billing period? You'll move to the Free plan then.")) && start(async () => { const r = await setCancel(!cancelAtPeriodEnd); if (!r.ok) setErr(r.error); router.refresh(); })}>{cancelAtPeriodEnd ? "Resume subscription" : "Cancel subscription"}</button>}
    </div>);
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm"><button className={cx("btn py-1", !annual ? "soft font-medium" : "muted")} onClick={() => setAnnual(false)}>Monthly</button><button className={cx("btn py-1", annual ? "soft font-medium" : "muted")} onClick={() => setAnnual(true)}>Annual <span className="chip bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">2 months free</span></button></div>
      {err && <div className="mb-3"><Notice tone="error">{err}</Notice></div>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{plans!.map((p) => (
        <div key={p.id} className={cx("panel flex flex-col p-4", p.id === current && "ring-2 ring-brand-500")}>
          <div className="flex items-center justify-between"><div className="font-semibold">{p.name}</div>{p.id === current && <span className="chip bg-brand-500 text-white">Current</span>}</div>
          <div className="muted text-xs">{p.tagline}</div>
          <div className="mt-3 text-3xl font-semibold">${annual ? Math.round(p.annual / 12) : p.monthly}<span className="muted text-sm font-normal">/mo</span></div>
          {annual && p.annual > 0 && <div className="muted text-xs">${p.annual} billed yearly</div>}
          <ul className="mt-3 flex-1 space-y-1.5 text-sm">{p.highlights.map((h) => <li key={h} className="flex gap-2"><Check size={15} className="mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-400" />{h}</li>)}</ul>
          {p.id !== "free" && p.id !== current && <button className="btn-primary mt-4" disabled={!stripe || pending} onClick={() => go(() => checkout(p.id, annual ? "year" : "month"))}>{hasStripeSub ? "Switch plan" : "Upgrade"}</button>}
          {p.id === "free" && current !== "free" && hasStripeSub && <p className="muted mt-4 text-xs">Cancel your subscription to return to Free.</p>}
        </div>))}</div>
    </div>
  );
}
