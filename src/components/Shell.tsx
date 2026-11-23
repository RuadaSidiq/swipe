"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LayoutGrid, Inbox, PenSquare, CalendarDays, Users, BarChart3, Sparkles, Workflow, Settings, Bell, Search, Plus,
  LogOut, X, Menu, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { cx, SwipeLogo } from "./ui";
import { logout } from "@/app/(auth)/actions";

type Icon = React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
interface Tab { href: string; label: string; match?: string[]; query?: [string, string] }
interface Section { key: string; label: string; href: string; icon: Icon; match: string[]; tabs?: Tab[]; hint: string }

/**
 * Information architecture: every feature has one home.
 * Routes are unchanged; sections group them and the header shows the section's tabs.
 */
export const SECTIONS: Section[] = [
  { key: "overview", label: "Overview", href: "/dashboard", icon: LayoutGrid, match: ["/dashboard"], hint: "Your social media at a glance" },
  { key: "inbox", label: "Inbox", href: "/inbox", icon: Inbox, match: ["/inbox"], hint: "Messages, comments and mentions" },
  { key: "studio", label: "Content Studio", href: "/publisher", icon: PenSquare, match: ["/publisher", "/posts", "/media"], hint: "Create, publish and manage content",
    tabs: [{ href: "/publisher", label: "Create" }, { href: "/posts", label: "Content" }, { href: "/media", label: "Media library" }] },
  { key: "planner", label: "Content Planner", href: "/calendar", icon: CalendarDays, match: ["/calendar", "/campaigns"], hint: "Plan, schedule and run campaigns",
    tabs: [{ href: "/calendar", label: "Calendar" }, { href: "/campaigns", label: "Campaigns" }] },
  { key: "crm", label: "Audience & CRM", href: "/contacts", icon: Users, match: ["/contacts"], hint: "Contacts, leads and follow-ups" },
  { key: "analytics", label: "Analytics", href: "/analytics", icon: BarChart3, match: ["/analytics"], hint: "Performance and reports" },
  { key: "ai", label: "Swipe AI", href: "/assistant", icon: Sparkles, match: ["/assistant"], hint: "Your AI social media manager" },
  { key: "automations", label: "Automations", href: "/automations", icon: Workflow, match: ["/automations"], hint: "Repeatable workflows" },
];
export const SETTINGS: Section = { key: "settings", label: "Settings", href: "/account", icon: Settings, hint: "Account, workspace and team",
  match: ["/account", "/accounts", "/team", "/settings", "/billing", "/notifications", "/admin", "/search"],
  tabs: [{ href: "/account", label: "Personal" }, { href: "/settings", label: "Workspace" }, { href: "/accounts", label: "Social accounts" },
    { href: "/team", label: "Team & permissions" }, { href: "/billing", label: "Billing" }, { href: "/notifications", label: "Notifications" }] };
const ALL = [...SECTIONS, SETTINGS];
const hit = (m: string, path: string) => path === m || path.startsWith(m + "/");
const inSection = (s: Section, path: string) => s.match.some((m) => hit(m, path));

interface Props {
  user: { name: string; email: string; isPlatformAdmin: boolean };
  workspace: { id: string; name: string };
  workspaces: { id: string; name: string }[];
  counts: { inbox: number; notifications: number; approvals: number; accounts: number };
  demo: boolean;
  banners: React.ReactNode;
  children: React.ReactNode;
}

const COLLAPSE_KEY = "swipe.sidebar.collapsed";

export function Shell({ user, counts, banners, children }: Props) {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const section = ALL.find((s) => inSection(s, path));
  const tabs = section?.tabs ? [...section.tabs, ...(section.key === "settings" && user.isPlatformAdmin ? [{ href: "/admin", label: "Admin" }] : [])] : null;

  useEffect(() => { try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1"); } catch { /* storage unavailable */ } }, []);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1"); } catch { /* ignore */ } return !c; });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") { e.preventDefault(); toggle(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { setSheet(false); }, [path]);

  const initials = user.name.split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const badge = (key: string) => (key === "inbox" ? counts.inbox : key === "planner" ? counts.approvals : 0);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar: a floating clay panel that collapses to icons */}
      <aside className={cx("no-print sticky top-0 hidden h-screen shrink-0 p-3 transition-[width] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] lg:block", collapsed ? "w-[92px]" : "w-[272px]")} aria-label="Main">
        <div className="clay flex h-full flex-col overflow-hidden rounded-[28px] px-3 pb-3 pt-4">
          <div className={cx("mb-4 flex items-center", collapsed ? "flex-col gap-3" : "justify-between pl-2")}>
            <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="Swipe home">
              <SwipeLogo size={36} />
              {!collapsed && <span className="font-display text-[19px] font-semibold tracking-tight">Swipe</span>}
            </Link>
            <button onClick={toggle} className="icon-btn" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} title={`${collapsed ? "Expand" : "Collapse"} (Ctrl+\\)`}>
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          </div>

          <nav className="-mx-1 flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden px-1 py-1" aria-label="Main">
            {SECTIONS.map((s) => {
              const active = section?.key === s.key;
              const n = badge(s.key);
              return (
                <Link key={s.key} href={s.href} data-active={active} data-ai={s.key === "ai"} aria-current={active ? "page" : undefined}
                  className={cx("nav-link group", collapsed && "justify-center px-0")} title={collapsed ? s.label : undefined}>
                  <span className="relative grid place-items-center"><s.icon size={19} strokeWidth={active ? 2.2 : 1.8} />
                    {collapsed && n > 0 && <span className="absolute -right-2 -top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--panel)]" style={{ background: "var(--accent-bright)" }} />}
                  </span>
                  {!collapsed && <span className="flex-1 truncate">{s.label}</span>}
                  {!collapsed && s.key === "ai" && !active && <span className="rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wide" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>AI</span>}
                  {!collapsed && n > 0 && <span className="nav-count">{n}</span>}
                </Link>
              );
            })}
          </nav>

          <div className="mt-2 flex flex-col gap-1 border-t pt-3" style={{ borderColor: "var(--line)" }}>
            <Link href="/account" data-active={section?.key === "settings"} className={cx("nav-link", collapsed && "justify-center px-0")} title={collapsed ? "Settings" : undefined}>
              <Settings size={19} strokeWidth={1.8} />{!collapsed && <span className="flex-1">Settings</span>}
              {!collapsed && counts.accounts > 0 && <span className="nav-count" style={{ background: "#E5484D" }} title="Social accounts need attention">{counts.accounts}</span>}
            </Link>
            <div className={cx("flex items-center gap-1", collapsed && "flex-col")}>
              <Link href="/account" className={cx("flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl p-1.5 transition hover:bg-[var(--soft)]", collapsed && "justify-center")} title={collapsed ? user.name : undefined} aria-label="Your profile">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white" style={{ background: "linear-gradient(145deg,#1E2836,#0F1724)" }}>{initials}</span>
                {!collapsed && <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">{user.name}</span><span className="muted block truncate text-[11.5px]">{user.email}</span></span>}
              </Link>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-24 lg:pb-0">
        <header className="no-print sticky top-0 z-20 px-4 pt-3 md:px-8 lg:pl-3" style={{ background: "linear-gradient(var(--bg) 70%, transparent)" }}>
          <div className="flex items-center gap-3 py-2">
            <Link href="/dashboard" className="lg:hidden" aria-label="Swipe home"><SwipeLogo size={34} /></Link>
            <div className="hidden min-w-0 md:block">
              <div className="muted text-[12px]">{today}</div>
              <div className="flex items-center gap-1.5 font-display text-[15px] font-semibold">{section && <section.icon size={15} />}{section?.label ?? "Swipe"}</div>
            </div>
            <div className="flex-1" />
            <form className="relative hidden w-full max-w-sm sm:block" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }}>
              <Search size={16} className="muted pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" />
              <input ref={searchRef} className="clay-inset h-11 w-full rounded-full pl-11 pr-14 text-sm outline-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search posts, conversations, contacts…" aria-label="Search" />
              <kbd className="muted pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: "var(--soft)" }}>⌘K</kbd>
            </form>
            <Link href="/notifications" className="clay icon-btn relative h-11 w-11 rounded-full" aria-label={`Notifications${counts.notifications ? `, ${counts.notifications} unread` : ""}`}>
              <Bell size={18} />
              {counts.notifications > 0 && <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--panel)]" style={{ background: "#E5484D" }} />}
            </Link>
          </div>
          {tabs && (
            <nav className="no-print -mx-1 flex gap-1 overflow-x-auto px-1 pb-2 pt-1" aria-label={`${section!.label} sections`}>
              {tabs.map((t) => { const a = hit(t.href, path) && (!t.query || params.get(t.query[0]) === t.query[1]); return <Link key={t.href} href={t.href} className="seg" data-active={a} aria-current={a ? "page" : undefined}>{t.label}</Link>; })}
            </nav>
          )}
        </header>
        {banners}
        <main key={path} className="page-in mx-auto w-full max-w-[1280px] flex-1 px-4 pb-12 pt-2 md:px-8 lg:pl-3">
          {children}
        </main>
      </div>

      {/* Mobile: floating clay tab bar + full menu sheet */}
      <nav className="no-print fixed inset-x-3 bottom-3 z-30 lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="Main">
        <div className="clay grid grid-cols-5 items-center rounded-[26px] px-1.5 py-1.5">
          <MobileTab s={SECTIONS[0]} active={section?.key === "overview"} />
          <MobileTab s={SECTIONS[1]} active={section?.key === "inbox"} badge={counts.inbox} />
          <Link href="/publisher" className="btn-primary mx-auto h-12 w-12 rounded-2xl p-0" aria-label="Create post"><Plus size={22} /></Link>
          <MobileTab s={SECTIONS[3]} active={section?.key === "planner"} label="Planner" />
          <button onClick={() => setSheet(true)} className={cx("flex flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10.5px] font-medium", !["overview", "inbox", "planner"].includes(section?.key ?? "") ? "text-[var(--accent)]" : "muted")}><Menu size={21} />Menu</button>
        </div>
      </nav>
      {sheet && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="fade-in absolute inset-0 bg-[rgba(15,23,36,.35)] backdrop-blur-[2px]" onClick={() => setSheet(false)} />
          <div className="sheet-in clay absolute inset-x-2 bottom-2 max-h-[85vh] overflow-y-auto rounded-[28px] p-3" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full" style={{ background: "var(--line-strong)" }} />
            <div className="mb-2 flex items-center justify-between px-2">
              <div className="font-display text-lg font-semibold">Menu</div>
              <button onClick={() => setSheet(false)} className="icon-btn" aria-label="Close menu"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SECTIONS.map((s) => (
                <Link key={s.key} href={s.href} data-active={section?.key === s.key} data-ai={s.key === "ai"} className="sheet-tile">
                  <s.icon size={20} /><span className="font-semibold">{s.label}</span><span className="muted text-[11.5px] leading-snug">{s.hint}</span>
                </Link>
              ))}
            </div>
            <Link href="/account" className="nav-link mt-2" data-active={section?.key === "settings"}><Settings size={18} /> Settings</Link>
            <form action={logout}><button className="nav-link w-full text-red-600 dark:text-red-400"><LogOut size={18} /> Sign out</button></form>
          </div>
        </div>
      )}
    </div>
  );
}

function MobileTab({ s, active, badge = 0, label }: { s: Section; active: boolean; badge?: number; label?: string }) {
  return (
    <Link href={s.href} className={cx("relative flex flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10.5px] font-medium transition", active ? "text-[var(--accent)]" : "muted")} aria-current={active ? "page" : undefined}>
      <s.icon size={21} strokeWidth={active ? 2.2 : 1.8} />{label ?? s.label}
      {badge > 0 && <span className="absolute right-[18%] top-0.5 min-w-[18px] rounded-full px-1 text-center text-[10px] font-semibold leading-[18px] text-white" style={{ background: "var(--accent-bright)" }}>{badge}</span>}
    </Link>
  );
}
