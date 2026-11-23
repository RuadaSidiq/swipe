import Link from "next/link";
import { LogOut, ShieldCheck, ChevronRight } from "lucide-react";
import { ROLE_LABELS } from "@/lib/rbac";
import { logout } from "@/app/(auth)/actions";
import { SettingsClient } from "../settings/SettingsClient";
import { TwoFactorCard } from "../settings/TwoFactorCard";
import { WorkspaceSwitcher } from "../settings/WorkspaceSwitcher";
import { loadSettings } from "../settings/load";

export const metadata = { title: "My account" };

/** My account: everything about the signed-in person. It follows them into every workspace. */
export default async function MyAccount() {
  const { ctx, props, twoFactor, workspaces } = await loadSettings();
  const initials = ctx.user.name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="flex flex-col gap-5">
      <section className="hero relative flex flex-wrap items-center gap-4 overflow-hidden p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <span className="relative grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white/20 text-xl font-semibold backdrop-blur" style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,.35)" }}>{initials}</span>
        <div className="relative min-w-0 flex-1">
          <h1 className="font-display text-[24px] font-semibold leading-tight">{ctx.user.name}</h1>
          <p className="text-sm text-white/80">{ctx.user.email} · {ROLE_LABELS[ctx.role]} in {ctx.workspace.name}</p>
        </div>
        <form action={logout} className="relative"><button className="inline-flex items-center gap-2 rounded-[12px] bg-white px-4 py-2.5 text-sm font-semibold text-[#00714B] transition hover:-translate-y-px" style={{ boxShadow: "0 8px 16px -8px rgba(0,0,0,.35)" }}><LogOut size={16} /> Sign out</button></form>
      </section>

      <p className="muted -mt-1 text-sm">This is about you. It goes with you into every workspace. Settings for the business are under <Link href="/settings" className="font-medium text-[var(--accent)]">Settings</Link>.</p>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5"><SettingsClient section="profile" {...props} /></div>
        <div className="flex flex-col gap-5">
          <TwoFactorCard enabled={twoFactor} />
          <section className="panel p-6"><h2 className="section-title mb-3">My workspaces</h2><WorkspaceSwitcher workspaces={workspaces} currentId={ctx.workspace.id} bare /></section>
          {props.canCreateWs && <SettingsClient section="newws" {...props} />}
        </div>
      </div>
      <SettingsClient section="alerts" {...props} />
      <SettingsClient section="delete" {...props} />

      {ctx.user.isPlatformAdmin && (
        <Link href="/admin" className="panel lift flex items-center gap-3 p-5">
          <span className="grid h-10 w-10 place-items-center rounded-[12px]" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><ShieldCheck size={19} /></span>
          <span className="flex-1"><span className="block font-display text-[16px] font-semibold">Admin console</span><span className="muted text-sm">Platform health. Only visible to you.</span></span>
          <ChevronRight size={18} className="muted" />
        </Link>
      )}
    </div>
  );
}
