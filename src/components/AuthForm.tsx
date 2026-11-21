"use client";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import type { FormState } from "@/app/(auth)/actions";

export function AuthForm({ mode, action, next, invite, email }: { mode: "login" | "signup"; action: (s: FormState, fd: FormData) => Promise<FormState>; next?: string; invite?: string; email?: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [tz, setTz] = useState("UTC");
  useEffect(() => { setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"); }, []);
  return (
    <form action={formAction} className="space-y-3">
      {mode === "signup" && (
        <>
          <input className="input" name="name" placeholder="Your name" required autoComplete="name" />
          {!invite && <input className="input" name="company" placeholder="Company or brand (optional)" autoComplete="organization" />}
        </>
      )}
      <input className="input" name="email" type="email" placeholder="Work email" defaultValue={email} required autoComplete="email" />
      <input className="input" name="password" type="password" placeholder={mode === "signup" ? "Password (10+ characters, letters & numbers)" : "Password"} required autoComplete={mode === "signup" ? "new-password" : "current-password"} />
      <input type="hidden" name="timezone" value={tz} />
      {next && <input type="hidden" name="next" value={next} />}
      {invite && <input type="hidden" name="invite" value={invite} />}
      {state?.error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600" role="alert">{state.error}</p>}
      <button className="btn-primary w-full py-2.5" disabled={pending}>{pending ? "Please wait…" : mode === "signup" ? "Create account — 14-day Pro trial" : "Sign in"}</button>
      <p className="muted text-center text-sm">
        {mode === "login" ? <>New to Orbit? <Link className="text-brand-500 hover:underline" href="/signup">Create an account</Link></> : <>Already have an account? <Link className="text-brand-500 hover:underline" href="/login">Sign in</Link></>}
      </p>
    </form>
  );
}
