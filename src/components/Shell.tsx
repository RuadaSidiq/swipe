"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Home, Inbox, CalendarDays, BarChart3, Sparkles, Settings, Bell, Search, Plus, ChevronsUpDown, Check, LogOut, ShieldCheck, MoreHorizontal, X, ListChecks, Flag, Image as ImageIcon, Users, Workflow, ChevronRight } from "lucide-react";
import { cx, SwipeLogo } from "./ui";
import { switchWorkspace } from "@/app/(app)/_actions/common";
import { logout } from "@/app/(auth)/actions";

interface Section { key: string; label: string; href: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }>; match: string[]; group?: string; tabs?: [string, string][] }
/** Sidebar: everyday work. Account-level pages live in the Account center (opened from the profile). */
export const SECTIONS: Section[] = [
  { key: "home", label: "Home", href: "/dashboard", icon: Home, match: ["/dashboard"] },
  { key: "inbox", label: "Inbox", href: "/inbox", icon: Inbox, match: ["/inbox"] },
  { key: "calendar", label: "Calendar", href: "/calendar", icon: CalendarDays, match: ["/calendar", "/publisher"], group: "Plan" },
  { key: "posts", label: "Posts", href: "/posts", icon: ListChecks, match: ["/posts"], group: "Plan" },
  { key: "campaigns", label: "Campaigns", href: "/campaigns", icon: Flag, match: ["/campaigns"], group: "Plan" },
  { key: "media", label: "Media", href: "/media", icon: ImageIcon, match: ["/media"], group: "Plan" },
  { key: "analytics", label: "Analytics", href: "/analytics", icon: BarChart3, match: ["/analytics"], group: "Grow" },
  { key: "assistant", label: "AI assistant", href: "/assistant", icon: Sparkles, match: ["/assistant"], group: "Grow" },
  { key: "contacts", label: "Contacts", href: "/contacts", icon: Users, match: ["/contacts"], group: "Grow" },
  { key: "automations", label: "Automations", href: "/automations", icon: Workflow, match: ["/automations"], group: "Grow" },
];
export const ACCOUNT_CENTER: Section = { key: "account", label: "Account center", href: "/account", icon: Settings,
  match: ["/account", "/accounts", "/team", "/settings", "/billing", "/notifications", "/admin", "/search"],
  tabs: [["/account", "Overview"], ["/accounts", "Social accounts"], ["/team", "Team"], ["/settings", "Workspace"], ["/billing", "Billing"], ["/notifications", "Notifications"]] };
const inSection = (s: Section, path: string) => s.match.some((m) => path === m || path.startsWith(m + "/"));

interface Props {
  user: { name: string; email: string; isPlatformAdmin: boolean };
  workspace: { id: string; name: string };
  workspaces: { id: string; name: string }[];
  counts: { inbox: number; notifications: number; approvals: number; accounts: number };
  demo: boolean;
  banners: React.ReactNode;
  children: React.ReactNode;
}

export function Shell({ user, workspace, workspaces, counts, demo, banners, children }: Props) {
  const path = usePathname();
  const router = useRouter();
  const [wsOpen, setWsOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [more, setMore] = useState(false);
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const section = [...SECTIONS, ACCOUNT_CENTER].find((s) => inSection(s, path));
  const tabs = section?.tabs ? [...section.tabs, ...(user.isPlatformAdmin ? [["/admin", "Admin"] as [string, string]] : [])] : null;
  const showTabs = tabs && tabs.some(([h]) => path === h || path.startsWith(h + "/"));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { setWsOpen(false); setMenu(false); setMore(false); }, [path]);

  const initials = user.name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col px-4 pb-4 pt-6 lg:flex" style={{ background: "var(--panel)", boxShadow: "1px 0 0 var(--line)" }} aria-label="Main">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2.5 px-2">
          <SwipeLogo size={32} />
          <span className="block font-display text-[17px] font-semibold leading-tight">Swipe</span>
        </Link>

        <div className="relative mb-4">
          <button onClick={() => setWsOpen(!wsOpen)} aria-expanded={wsOpen} className="flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition hover:bg-[var(--soft)]" style={{ borderColor: "var(--line-strong)" }}>
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-bold" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{workspace.name[0]?.toUpperCase()}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{workspace.name}</span>
            <ChevronsUpDown size={14} className="muted" />
          </button>
          {wsOpen && (
            <div className="panel absolute left-0 right-0 top-full z-30 mt-1.5 p-1.5">
              {workspaces.map((w) => (
                <button key={w.id} disabled={pending} onClick={() => start(() => switchWorkspace(w.id))} className="tab-link w-full justify-between">
                  <span className="truncate">{w.name}</span>{w.id === workspace.id && <Check size={14} />}
                </button>
              ))}
              <Link href="/settings#workspaces" className="tab-link"><Plus size={14} /> New workspace</Link>
            </div>
          )}
        </div>

        <Link href="/publisher" className="btn-primary mb-5 w-full"><Plus size={17} /> Create post</Link>

        <nav className="flex flex-col gap-0.5 overflow-y-auto" aria-label="Main">
          {SECTIONS.map((s, i) => {
            const active = section?.key === s.key;
            const heading = s.group && s.group !== SECTIONS[i - 1]?.group;
            return (
              <div key={s.key}>
                {heading && <div className="muted px-3.5 pb-1 pt-4 text-[12px] font-medium">{s.group}</div>}
                <Link href={s.href} className="nav-link py-2" data-active={active} aria-current={active ? "page" : undefined}>
                  <s.icon size={18} strokeWidth={active ? 2.2 : 1.8} /><span className="flex-1">{s.label}</span>
                  {s.key === "inbox" && counts.inbox > 0 && <span className={cx("min-w-[22px] rounded-full px-1.5 text-center text-[11px] font-semibold leading-[22px] text-white", active && "bg-white/25")} style={active ? undefined : { background: "var(--accent-bright)" }}>{counts.inbox}</span>}
                </Link>
              </div>
            );
          })}
        </nav>

        <div className="mt-auto pt-4">
          <Link href="/account" className={cx("flex w-full items-center gap-3 rounded-xl border px-2.5 py-2.5 transition hover:bg-[var(--soft)]", section?.key === "account" && "border-[var(--accent-bright)] bg-[var(--accent-soft)]")} style={section?.key === "account" ? undefined : { borderColor: "var(--line)" }} aria-current={section?.key === "account" ? "page" : undefined}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white" style={{ background: "var(--text)" }}>{initials}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">{user.name}</span><span className="muted block truncate text-[11.5px]">Account center</span></span>
            <ChevronRight size={16} className="muted" />
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-20 lg:pb-0">
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 px-4 py-3 md:px-8 md:py-4" style={{ background: "color-mix(in srgb, var(--bg) 90%, transparent)", backdropFilter: "blur(12px)" }}>
          <Link href="/dashboard" className="lg:hidden"><SwipeLogo size={30} /></Link>
          <form className="relative w-full max-w-md" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }}>
            <Search size={16} className="muted pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input ref={searchRef} className="input rounded-full border-transparent pl-10" style={{ background: "var(--panel)", boxShadow: "0 0 0 1px var(--line)" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search posts, conversations and contacts" />
          </form>
          <div className="flex-1" />
          {demo && <span className="chip soft muted hidden md:inline-flex" title="Demo accounts simulate publishing. Nothing reaches real networks.">Demo</span>}
          <Link href="/notifications" className="relative grid h-10 w-10 place-items-center rounded-full transition hover:bg-[var(--panel)]" aria-label={`Notifications${counts.notifications ? `, ${counts.notifications} unread` : ""}`}>
            <Bell size={19} />
            {counts.notifications > 0 && <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--bg)]" style={{ background: "#E5484D" }} />}
          </Link>
        </header>
        {banners}
        <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-12 md:px-8">
          {showTabs && (
            <nav className="no-print mb-6 flex gap-1 overflow-x-auto" aria-label="Account center">
              {tabs!.map(([href, label]) => { const a = path === href || path.startsWith(href + "/"); return <Link key={href} href={href} className="tab-link whitespace-nowrap" data-active={a} aria-current={a ? "page" : undefined}>{label}</Link>; })}
            </nav>
          )}
          {children}
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-end px-2 pt-1.5 lg:hidden" style={{ background: "var(--panel)", boxShadow: "0 -1px 0 var(--line)", paddingBottom: "max(8px, env(safe-area-inset-bottom))" }} aria-label="Main">
        {[SECTIONS[0], SECTIONS[1]].map((s) => <MobileTab key={s.key} s={s} active={section?.key === s.key} badge={s.key === "inbox" ? counts.inbox : 0} />)}
        <Link href="/publisher" className="mx-auto -mt-5 grid h-14 w-14 place-items-center rounded-full text-white shadow-btn" style={{ background: "var(--accent)" }} aria-label="Create post"><Plus size={26} /></Link>
        <MobileTab s={SECTIONS[2]} active={section?.key === "calendar"} />
        <button onClick={() => setMore(true)} className={cx("flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium", !["home", "inbox", "calendar"].includes(section?.key ?? "") ? "text-[var(--accent)]" : "muted")}><MoreHorizontal size={21} />More</button>
      </nav>
      {more && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl p-4" style={{ background: "var(--panel)", paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
            <div className="mb-3 flex items-center justify-between px-2"><span className="font-display text-lg font-semibold">{workspace.name}</span><button onClick={() => setMore(false)} className="btn-ghost p-2" aria-label="Close"><X size={18} /></button></div>
            <div className="grid grid-cols-2 gap-1">{SECTIONS.slice(3).map((s) => <Link key={s.key} href={s.href} className="nav-link" data-active={section?.key === s.key}><s.icon size={18} />{s.label}</Link>)}</div>
            <Link href="/account" className="nav-link mt-2" data-active={section?.key === "account"}><Settings size={18} /> Account center</Link>
            {workspaces.length > 1 && workspaces.filter((w) => w.id !== workspace.id).map((w) => <button key={w.id} onClick={() => start(() => switchWorkspace(w.id))} className="nav-link w-full">Switch to {w.name}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

function MobileTab({ s, active, badge = 0 }: { s: Section; active: boolean; badge?: number }) {
  return (
    <Link href={s.href} className={cx("relative flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium", active ? "text-[var(--accent)]" : "muted")} aria-current={active ? "page" : undefined}>
      <s.icon size={21} strokeWidth={active ? 2.2 : 1.8} />{s.label}
      {badge > 0 && <span className="absolute right-[22%] top-0.5 min-w-[18px] rounded-full px-1 text-center text-[10px] font-semibold leading-[18px] text-white" style={{ background: "var(--accent-bright)" }}>{badge}</span>}
    </Link>
  );
}
