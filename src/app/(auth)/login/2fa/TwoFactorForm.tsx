"use client";
import { useActionState } from "react";
import Link from "next/link";
import { verifySecondFactor } from "../../actions";
export function TwoFactorForm() {
  const [state, action, pending] = useActionState(verifySecondFactor, undefined);
  return (
    <form action={action} className="space-y-3">
      <input className="input text-center text-lg tracking-[0.3em]" name="code" inputMode="text" autoComplete="one-time-code" placeholder="123456" autoFocus required />
      {state?.error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600" role="alert">{state.error}</p>}
      <button className="btn-primary w-full py-2.5" disabled={pending}>{pending ? "Verifying…" : "Verify"}</button>
      <p className="muted text-center text-sm"><Link className="text-brand-500 hover:underline" href="/login">Back to sign in</Link></p>
    </form>
  );
}
