"use client";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { aiExplain } from "../_actions/ai";
import { Modal } from "../accounts/AccountsClient";

export function ExplainButton({ summary }: { summary: string }) {
  const [out, setOut] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  return (<>
    <button className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); setErr(""); const r = await aiExplain(summary); setBusy(false); if (r.ok) setOut(r.data); else setErr(r.error); }}><Sparkles size={15} /> {busy ? "Analysing…" : "Explain with AI"}</button>
    {err && <span className="text-xs text-red-600 dark:text-red-400">{err}</span>}
    {out && <Modal title="AI analysis" onClose={() => setOut(null)} wide><div className="whitespace-pre-wrap text-sm leading-relaxed">{out}</div><p className="muted mt-3 text-xs">Based only on the metrics shown on this page and their stated sources.</p></Modal>}
  </>);
}
