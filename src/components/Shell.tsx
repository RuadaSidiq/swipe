"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LayoutDashboard, Link2, PenSquare, CalendarDays, Inbox, Sparkles, BarChart3, Image as ImageIcon, Flag, Users, Workflow, UserCog, Settings, CreditCard, Bell, Search, Menu, X, ShieldCheck, ListChecks, LogOut, ChevronsUpDown } from "lucide-react";
import { cx } from "./ui";
import { switchWorkspace } from "@/app/(app)/_actions/common";
import { logout } from "@/app/(auth)/actions";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/publisher", label: "Publisher", icon: PenSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/posts", label: "Posts", icon: ListChecks, badge: "approvals" as const },
  { href: "/inbox", label: "Inbox", icon: Inbox, badge: "inbox" as const },
  { href: "/assistant", label: "AI assistant", icon: Sparkles },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/media", label: "Media library", icon: ImageIcon },
  { href: "/campaigns", label: "Campaigns", icon: Flag },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/automations", label: "Automations", icon: Workflow },
  { divider: true },
  { href: "/accounts", label: "Accounts", icon: Link2, badge: "accounts" as const },
  { href: "/team", label: "Team", icon: UserCog },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/billing", label: "Billing", icon: CreditCard },
] as const;

interface Props {
  user: { name: string; email: string; isPlatformAdmin: boolean };
  workspace: { id: string; name: string };
  workspaces: { id: string; name: string }[];
  counts: { inbox: number; notifications: number; approvals: number; accounts: number };
  banners: React.ReactNode;
  children: React.ReactNode;
}

export function Shell({ user, workspace, workspaces, counts, banners, children }: Props) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");

  const sidebar = (
    <nav className="flex h-full flex-col gap-0.5 overflow-y-auto p-3">
      <div className="relative mb-3">
        <button onClick={() => setWsOpen(!wsOpen)} className="btn-secondary w-full justify-between px-2.5" aria-expanded={wsOpen}>
          <span className="flex min-w-0 items-center gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-brand-500 text-xs font-bold text-white">{workspace.name[0]?.toUpperCase()}</span><span className="truncate">{workspace.name}</span></span>
          <ChevronsUpDown size={14} className="muted" />
        </button>
        {wsOpen && (
          <div className="panel absolute left-0 right-0 top-full z-30 mt-1 p-1 shadow-lg">
            <div className="muted px-2 py-1 text-[11px] font-medium uppercase tracking-wide">Workspaces</div>
            {workspaces.map((w) => (
              <button key={w.id} disabled={pending} onClick={() => start(() => switchWorkspace(w.id))} className={cx("nav-link w-full", w.id === workspace.id && "font-medium")} data-active={w.id === workspace.id}>{w.name}</button>
            ))}
            <Link href="/settings#workspaces" onClick={() => setWsOpen(false)} className="nav-link text-brand-500">+ New workspace</Link>
          </div>
        )}
      </div>
      {NAV.map((n, i) => "divider" in n ? <div key={i} className="line my-2 border-t" /> : (
        <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="nav-link" data-active={path === n.href || path.startsWith(n.href + "/")}>
          <n.icon size={16} /> <span className="flex-1">{n.label}</span>
          {"badge" in n && n.badge && counts[n.badge] > 0 && <span className={cx("chip", n.badge === "accounts" ? "bg-red-500/15 text-red-600" : "bg-brand-500 text-white")}>{counts[n.badge]}</span>}
        </Link>
      ))}
      {user.isPlatformAdmin && <Link href="/admin" className="nav-link" data-active={path.startsWith("/admin")}><ShieldCheck size={16} /> Admin console</Link>}
      <div className="mt-auto pt-3">
        <div className="line flex items-center gap-2 border-t pt-3">
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{user.name}</div><div className="muted truncate text-xs">{user.email}</div></div>
          <form action={logout}><button className="btn-ghost p-2" title="Sign out" aria-label="Sign out"><LogOut size={15} /></button></form>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="line no-print sticky top-0 hidden h-screen w-60 shrink-0 border-r lg:block" style={{ background: "var(--panel)" }}>{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72" style={{ background: "var(--panel)" }}>{sidebar}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="line no-print sticky top-0 z-20 flex items-center gap-2 border-b px-4 py-2.5 backdrop-blur" style={{ background: "color-mix(in srgb, var(--bg) 85%, transparent)" }}>
          <button className="btn-ghost p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">{open ? <X size={18} /> : <Menu size={18} />}</button>
          <form className="relative max-w-md flex-1" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`); }}>
            <Search size={15} className="muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search posts, conversations, contacts, media…" aria-label="Search" />
          </form>
          <div className="flex-1" />
          <Link href="/publisher" className="btn-primary hidden sm:inline-flex"><PenSquare size={15} /> Create post</Link>
          <Link href="/notifications" className="btn-ghost relative p-2" aria-label="Notifications">
            <Bell size={18} />
            {counts.notifications > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{counts.notifications > 99 ? "99+" : counts.notifications}</span>}
          </Link>
        </header>
        {banners}
        <main className="mx-auto w-full max-w-[1400px] flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
