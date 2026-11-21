"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Card, Notice } from "@/components/ui";
import { confirmTwoFactor, disableTwoFactor, startTwoFactor } from "../_actions/settings";

export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const router = useRouter(); const [pending, start] = useTransition();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState(""); const [err, setErr] = useState("");
  return (
    <Card title={<span className="flex items-center gap-2"><ShieldCheck size={15} /> Two-factor authentication</span>}>
      {err && <div className="mb-2"><Notice tone="error">{err}</Notice></div>}
      {codes ? (
        <div className="space-y-2">
          <Notice tone="success">Two-factor is on. Save these recovery codes; each works once and they won&apos;t be shown again.</Notice>
          <pre className="soft grid grid-cols-2 gap-1 rounded-lg p-3 font-mono text-sm">{codes.map((c) => <span key={c}>{c}</span>)}</pre>
          <button className="btn-secondary" onClick={() => { navigator.clipboard.writeText(codes.join("\n")); }}>Copy codes</button>
        </div>
      ) : enabled ? (
        <div className="space-y-2">
          <p className="text-sm"><span className="chip bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">On</span> Sign-ins require a code from your authenticator app.</p>
          <button className="btn-ghost text-red-600 dark:text-red-400" disabled={pending} onClick={() => { const p = prompt("Enter your password to turn off two-factor authentication."); if (p) start(async () => { const r = await disableTwoFactor(p); if (!r.ok) setErr(r.error); router.refresh(); }); }}>Turn off</button>
        </div>
      ) : setup ? (
        <div className="space-y-3">
          <p className="text-sm">Scan with your authenticator app, then enter the code.</p>
          <img src={setup.qr} alt="QR code for your authenticator app" width={180} height={180} className="rounded-lg bg-white p-2" />
          <p className="muted text-xs">Can&apos;t scan? Enter this key manually: <code className="break-all">{setup.secret}</code></p>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await confirmTwoFactor(code); if (r.ok) { setCodes(r.data); setSetup(null); setErr(""); router.refresh(); } else setErr(r.error); }); }}>
            <input className="input w-36 text-center tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric" autoComplete="one-time-code" />
            <button className="btn-primary" disabled={pending || code.length < 6}>Verify & enable</button>
          </form>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="muted text-sm">Ask for a code from your phone at sign-in.</p>
          <button className="btn-primary" disabled={pending} onClick={() => start(async () => { const r = await startTwoFactor(); if (r.ok) setSetup(r.data); else setErr(r.error); })}>Set up two-factor</button>
        </div>
      )}
    </Card>
  );
}
