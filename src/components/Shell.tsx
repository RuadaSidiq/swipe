"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { LayoutDashboard, Link2, PenSquare, CalendarDays, Inbox, Sparkles, BarChart3, Image as ImageIcon, Flag, Users, Workflow, UserCog, Settings, CreditCard, Bell, Search, Menu, ShieldCheck, ListChecks, LogOut, ChevronsUpDown, Plus, Check } from "lucide-react";
import { cx } from "./ui";
import { switchWorkspace } from "@/app/(app)/_actions/common";
import { logout } from "@/app/(auth)/actions";

type BadgeKey = "inbox" | "approvals" | "accounts";
interface NavItem { href: string; label: string; icon: React.ComponentType<{ size?: number }>; badge?: BadgeKey }
const NAV: { group: string; items: NavItem[] }[] = [
  { group: "", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }, { href: "/inbox", label: "Inbox", icon: Inbox, badge: "inbox" }] },
  { group: "Plan", items: [
    { href: "/publisher", label: "Compose", icon: PenSquare }, { href: "/calendar", label: "Calendar", icon: CalendarDays },
    { href: "/posts", label: "Posts", icon: ListChecks, badge: "approvals" }, { href: "/campaigns", label: "Campaigns", icon: Flag }, { href: "/media", label: "Media", icon: ImageIcon }] },
  { group: "Grow", items: [
    { href: "/analytics", label: "Analytics", icon: BarChart3 }, { href: "/assistant", label: "AI assistant", icon: Sparkles },
    { href: "/contacts", label: "Contacts", icon: Users }, { href: "/automations", label: "Automations", icon: Workflow }] },
  { group: "Workspace", items: [
    { href: "/accounts", label: "Accounts", icon: Link2, badge: "accounts" }, { href: "/team", label: "Team", icon: UserCog },
    { href: "/settings", label: "Settings", icon: Settings }, { href: "/billing", label: "Billing", icon: CreditCard }] },
];

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
  const [open, setOpen] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { setOpen(false); setWsOpen(false); }, [path]);

  const sidebar = (
    <nav className="flex h-full flex-col overflow-y-auto px-3 pb-3 pt-4" style={{ background: "var(--console)", color: "var(--console-text)" }} aria-label="Main">
      <div className="mb-5 flex items-center gap-2 px-2.5">
        <span className="relative grid h-7 w-7 place-items-center rounded-full" style={{ background: "var(--signal)" }} aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--console)" }} />
        </span>
        <span className="font-display text-[19px] font-semibold tracking-tight text-white">Orbit</span>
      </div>

      <div className="relative mb-4">
        <button onClick={() => setWsOpen(!wsOpen)} aria-expanded={wsOpen} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-[var(--console-hover)]">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-xs font-bold text-[var(--console)]" style={{ background: "#CFE7E1" }}>{workspace.name[0]?.toUpperCase()}</span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium text-white">{workspace.name}</span></span>
          <ChevronsUpDown size={14} style={{ color: "var(--console-muted)" }} />
        </button>
        {wsOpen && (
          <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-xl p-1 shadow-2xl" style={{ background: "#16302A", border: "1px solid #24423B" }}>
            {workspaces.map((w) => (
              <button key={w.id} disabled={pending} onClick={() => start(() => switchWorkspace(w.id))} className="nav-link w-full">
                <span className="flex-1 truncate text-left">{w.name}</span>{w.id === workspace.id && <Check size={14} />}
              </button>
            ))}
            <Link href="/settings#workspaces" className="nav-link"><Plus size={14} /> New workspace</Link>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {NAV.map((g, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            {g.group && <div className="px-2.5 pb-1 text-[12px] font-medium" style={{ color: "var(--console-muted)" }}>{g.group}</div>}
            {g.items.map((n) => {
              const active = path === n.href || path.startsWith(n.href + "/");
              const count = n.badge ? counts[n.badge] : 0;
              return (
                <Link key={n.href} href={n.href} className="nav-link" data-active={active} aria-current={active ? "page" : undefined}>
                  <n.icon size={16} /> <span className="flex-1">{n.label}</span>
                  {count > 0 && <span className={cx("min-w-[20px] rounded-full px-1.5 text-center text-[11px] font-semibold leading-5", n.badge === "accounts" ? "bg-red-500 text-white" : "text-[var(--console)]")} style={n.badge === "accounts" ? undefined : { background: "var(--signal)" }}>{count}</span>}
                </Link>
              );
            })}
          </div>
        ))}
        {user.isPlatformAdmin && <Link href="/admin" className="nav-link" data-active={path.startsWith("/admin")}><ShieldCheck size={16} /> Admin</Link>}
      </div>

      <div className="mt-auto flex items-center gap-2.5 rounded-lg px-2.5 pt-6">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white" style={{ background: "#24423B" }}>{user.name.split(" ").map((s) => s[0]).join("").slice(0, 2)}</span>
        <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium text-white">{user.name}</div><div className="truncate text-[11.5px]" style={{ color: "var(--console-muted)" }}>{user.email}</div></div>
        <form action={logout}><button className="rounded-md p-1.5 transition hover:bg-[var(--console-hover)]" title="Sign out" aria-label="Sign out"><LogOut size={15} /></button></form>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 hidden h-screen w-[244px] shrink-0 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[264px] shadow-2xl">{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-20 flex items-center gap-2 px-4 py-3 md:px-8" style={{ background: "color-mix(in srgb, var(--bg) 88%, transparent)", backdropFilter: "blur(10px)" }}>
          <button className="btn-ghost p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
          <form className="relative w-full max-w-sm" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }}>
            <Search size={15} className="muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" />
            <input ref={searchRef} className="input rounded-full border-transparent pl-9 pr-12" style={{ background: "var(--panel)" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search everything" />
            <kbd className="muted pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 text-[11px] sm:block">⌘K</kbd>
          </form>
          <div className="flex-1" />
          {demo && <span className="hidden items-center gap-1.5 rounded-full border border-dashed px-2.5 py-1 text-xs md:inline-flex" style={{ borderColor: "var(--line-strong)", color: "var(--muted)" }} title="Demo accounts simulate publishing and replies. Nothing is sent to real networks.">Demo data</span>}
          <Link href="/notifications" className="btn-ghost relative p-2" aria-label={`Notifications${counts.notifications ? ` (${counts.notifications} unread)` : ""}`}>
            <Bell size={18} />
            {counts.notifications > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-[var(--bg)]" />}
          </Link>
          <Link href="/publisher" className="btn-signal rounded-full px-4"><Plus size={16} /> <span className="hidden sm:inline">Create post</span></Link>
        </header>
        {banners}
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 pb-10 pt-4 md:px-8">{children}</main>
      </div>
    </div>
  );
}
