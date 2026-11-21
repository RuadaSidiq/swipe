"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, CheckCircle2, Flag, MailOpen, Sparkles, Send, StickyNote, Smile, BookmarkPlus, ChevronLeft, ShieldAlert } from "lucide-react";
import { Avatar, DemoBadge, Empty, Notice, PlatformBadge, StatusBadge, cx } from "@/components/ui";
import { PLATFORMS, PLATFORM_LIST, type PlatformId } from "@/lib/platforms/registry";
import { assignAction, flagsAction, noteAction, openConversation, replyAction, savedReplyAction, statusAction } from "../_actions/inbox";
import { aiReply } from "../_actions/ai";

interface ConvRow { id: string; kind: string; status: string; priority: boolean; unread: boolean; awaitingReply: boolean; tags: string[]; lastMessageAt: string; lastMessagePreview: string; subject: string | null; isDemo: boolean;
  contact: { displayName: string; avatarUrl: string | null; username: string | null } | null; account: { platform: string; displayName: string; isDemo: boolean }; assignee: { id: string; user: { name: string } } | null; assigneeId: string | null }
const FOLDERS = [["open", "All open"], ["unread", "Unread"], ["read", "Read"], ["awaiting", "Awaiting reply"], ["mine", "Assigned to me"], ["unassigned", "Unassigned"], ["priority", "Priority"], ["pending", "Pending"], ["resolved", "Resolved"], ["archived", "Archived"]] as const;
const TYPES = [["", "All types"], ["dm", "Direct messages"], ["comment", "Comments"], ["mention", "Mentions"]] as const;
const EMOJI = ["🙂", "😊", "🙏", "👍", "❤️", "🎉", "🔥", "✅", "👋", "😅", "🙌", "💯"];
const SENSITIVE = /\b(refund|chargeback|lawyer|legal|sue|fraud|scam|stolen|hack|password|credit card|bank|payment|overcharged|complain|unacceptable|harass|emergency|injur|medical)\w*/i;
const ago = (iso: string) => { const s = (Date.now() - new Date(iso).getTime()) / 1000; return s < 60 ? "now" : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };

export function InboxView({ convs, members, saved, me, filters, openId, can, unreadCount }: {
  convs: ConvRow[]; members: { id: string; name: string }[]; saved: { id: string; title: string; body: string }[]; me: string; unreadCount: number;
  filters: { f: string; type: string; platform: string; q: string }; openId?: string; can: { reply: boolean; assign: boolean; ai: boolean };
}) {
  const router = useRouter(); const params = useSearchParams();
  const [active, setActive] = useState<string | undefined>(openId);
  const [thread, setThread] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState(filters.q);
  const setParam = (k: string, v: string) => { const p = new URLSearchParams(params.toString()); if (v) p.set(k, v); else p.delete(k); p.delete("c"); router.push(`/inbox?${p}`); };

  const load = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setLoading(true);
    const r = await openConversation(id); setLoading(false);
    if (r.ok) setThread(r.data);
  }, []);
  useEffect(() => { if (active) load(active); }, [active, load]);
  // Poll for new messages while the inbox is open.
  useEffect(() => { const h = setInterval(() => { router.refresh(); if (active) load(active, true); }, 20_000); return () => clearInterval(h); }, [active, load, router]);

  return (
    <div className="-m-4 grid h-[calc(100vh-57px)] md:-m-6 lg:grid-cols-[200px_340px_1fr]">
      <aside className="line hidden overflow-y-auto border-r p-3 lg:block">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide muted">Inbox {unreadCount > 0 && <span className="chip ml-1 bg-brand-500 text-white">{unreadCount}</span>}</div>
        {FOLDERS.map(([k, l]) => <button key={k} className="nav-link w-full" data-active={filters.f === k} onClick={() => setParam("f", k)}>{l}</button>)}
        <div className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide muted">Type</div>
        {TYPES.map(([k, l]) => <button key={k} className="nav-link w-full" data-active={filters.type === k} onClick={() => setParam("type", k)}>{l}</button>)}
        <div className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide muted">Network</div>
        <button className="nav-link w-full" data-active={!filters.platform} onClick={() => setParam("platform", "")}>All networks</button>
        {PLATFORM_LIST.filter((p) => p.caps.dms.status !== "unavailable" || p.caps.comments.status !== "unavailable").map((p) => <button key={p.id} className="nav-link w-full" data-active={filters.platform === p.id} onClick={() => setParam("platform", p.id)}><PlatformBadge id={p.id} size={16} /> {p.name}</button>)}
      </aside>

      <section className={cx("line flex min-h-0 flex-col border-r", active && "hidden lg:flex")}>
        <div className="line space-y-2 border-b p-3">
          <form onSubmit={(e) => { e.preventDefault(); setParam("q", q); }}><input className="input" placeholder="Search conversations" value={q} onChange={(e) => setQ(e.target.value)} /></form>
          <div className="flex gap-2 lg:hidden">
            <select className="input py-1.5" value={filters.f} onChange={(e) => setParam("f", e.target.value)}>{FOLDERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <select className="input py-1.5" value={filters.type} onChange={(e) => setParam("type", e.target.value)}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {convs.length === 0 && <Empty title="No conversations here" body="Messages and comments from connected accounts appear here as they arrive." />}
          {convs.map((c) => (
            <li key={c.id}>
              <button onClick={() => { setActive(c.id); router.replace(`/inbox?${new URLSearchParams({ ...Object.fromEntries(params), c: c.id })}`, { scroll: false }); }}
                className={cx("line flex w-full gap-3 border-b px-3 py-3 text-left transition hover:bg-[var(--soft)]", active === c.id && "bg-[var(--soft)]")}>
                <Avatar src={c.contact?.avatarUrl} name={c.contact?.displayName ?? "?"} size={36} platform={c.account.platform} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5"><span className={cx("truncate text-sm", c.unread && "font-semibold")}>{c.contact?.displayName ?? "Unknown"}</span>
                    {c.priority && <Flag size={12} className="shrink-0 fill-red-500 text-red-500" />}<span className="muted ml-auto shrink-0 text-[11px]">{ago(c.lastMessageAt)}</span></div>
                  <div className="muted truncate text-[11px]">{c.kind === "dm" ? "DM" : c.kind} · {c.account.displayName}{c.assignee ? ` · ${c.assignee.user.name}` : ""}</div>
                  <div className={cx("mt-0.5 line-clamp-2 text-xs", c.unread ? "" : "muted")}>{c.lastMessagePreview}</div>
                  <div className="mt-1 flex flex-wrap gap-1">{c.isDemo && <DemoBadge />}{c.tags.slice(0, 3).map((t) => <span key={t} className="chip soft">{t}</span>)}{c.awaitingReply && c.status !== "RESOLVED" && <span className="chip bg-amber-500/15 text-amber-600">needs reply</span>}</div>
                </div>
                {c.unread && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className={cx("flex min-h-0 flex-col", !active && "hidden lg:flex")}>
        {!active ? <div className="flex flex-1 items-center justify-center"><Empty title="Select a conversation" body="Reply to messages and comments from every connected network without leaving Orbit." /></div>
          : loading && !thread ? <div className="muted p-6 text-sm">Loading…</div>
          : thread && <Thread key={thread.id} t={thread} members={members} saved={saved} me={me} can={can} onBack={() => setActive(undefined)} reload={() => { load(thread.id, true); router.refresh(); }} />}
      </section>
    </div>
  );
}

function Thread({ t, members, saved, me, can, onBack, reload }: { t: any; members: { id: string; name: string }[]; saved: { id: string; title: string; body: string }[]; me: string; can: { reply: boolean; assign: boolean; ai: boolean }; onBack: () => void; reload: () => void }) {
  const p = PLATFORMS[t.account.platform as PlatformId];
  const [body, setBody] = useState(""); const [ai, setAi] = useState(false); const [mode, setMode] = useState<"reply" | "note">("reply");
  const [err, setErr] = useState(""); const [info, setInfo] = useState(""); const [pending, start] = useTransition(); const [aiBusy, setAiBusy] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false); const [search, setSearch] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView(); }, [t.messages.length]);
  const canReply = p.caps.dms.status !== "unavailable" || p.caps.comments.status !== "unavailable";
  const sensitive = t.messages.some((m: any) => m.direction === "inbound" && SENSITIVE.test(m.body));
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) setErr(r.error!); else { setErr(""); reload(); } });
  const suggest = async (o: { tone?: string; draft?: string }) => { setAiBusy(true); setErr(""); const r = await aiReply({ conversationId: t.id, ...o }); setAiBusy(false); if (r.ok) { setBody(r.data); setAi(true); } else setErr(r.error); };
  const messages = search ? t.messages.filter((m: any) => m.body.toLowerCase().includes(search.toLowerCase())) : t.messages;
  const timeline = [...messages.map((m: any) => ({ ...m, _t: "m" })), ...t.notes.map((n: any) => ({ ...n, _t: "n" }))].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="grid min-h-0 flex-1 xl:grid-cols-[1fr_280px]">
      <div className="flex min-h-0 flex-col">
        <div className="line flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
          <button className="btn-ghost p-1.5 lg:hidden" onClick={onBack} aria-label="Back"><ChevronLeft size={16} /></button>
          <Avatar src={t.contact?.avatarUrl} name={t.contact?.displayName ?? "?"} size={32} platform={t.account.platform} />
          <div className="min-w-0 flex-1"><div className="truncate font-semibold">{t.contact?.displayName ?? "Unknown"}</div>
            <div className="muted flex items-center gap-1 text-xs"><PlatformBadge id={p.id} size={14} /> {p.name} {t.kind === "dm" ? "direct message" : t.kind} → {t.account.displayName} {t.account.isDemo && <DemoBadge />}</div></div>
          <StatusBadge status={t.status} />
          <input className="input w-36 py-1 text-xs" placeholder="Search thread" value={search} onChange={(e) => setSearch(e.target.value)} />
          {can.reply && <>
            <button className="btn-ghost p-2" title={t.priority ? "Remove priority" : "Mark priority"} onClick={() => act(() => flagsAction(t.id, { priority: !t.priority }))}><Flag size={15} className={t.priority ? "fill-red-500 text-red-500" : ""} /></button>
            <button className="btn-ghost p-2" title="Mark unread" onClick={() => act(() => flagsAction(t.id, { unread: true }))}><MailOpen size={15} /></button>
            {t.status !== "RESOLVED" ? <button className="btn-secondary py-1" onClick={() => act(() => statusAction(t.id, "RESOLVED"))}><CheckCircle2 size={14} /> Resolve</button> : <button className="btn-secondary py-1" onClick={() => act(() => statusAction(t.id, "OPEN"))}>Reopen</button>}
            <button className="btn-ghost p-2" title="Archive" onClick={() => act(() => statusAction(t.id, "ARCHIVED"))}><Archive size={15} /></button>
          </>}
        </div>
        {t.subject && <div className="soft line border-b px-4 py-2 text-xs"><span className="muted">On post:</span> {t.subject}</div>}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {timeline.map((m: any) => m._t === "n" ? (
            <div key={m.id} className="mx-auto max-w-lg rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs"><div className="font-semibold"><StickyNote size={11} className="mr-1 inline" />Internal note · {m.userName}</div><div className="mt-0.5 whitespace-pre-wrap">{m.body}</div></div>
          ) : (
            <div key={m.id} className={cx("flex gap-2", m.direction === "outbound" && "flex-row-reverse")}>
              {m.direction === "inbound" && <Avatar src={m.authorAvatar} name={m.authorName} size={28} />}
              <div className={cx("max-w-[75%] rounded-2xl px-3.5 py-2 text-sm", m.direction === "outbound" ? "bg-brand-500 text-white" : "soft")}>
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                {(m.attachments ?? []).map((a: any, i: number) => a.url ? <a key={i} href={a.url} target="_blank" rel="noreferrer" className="mt-1 block text-xs underline">📎 {a.type} attachment</a> : <div key={i} className="mt-1 text-xs opacity-70">📎 {a.type}</div>)}
                <div className={cx("mt-1 text-[10px]", m.direction === "outbound" ? "text-white/70" : "muted")}>{new Date(m.createdAt).toLocaleString()}{m.direction === "outbound" && ` · ${m.authorName} · ${m.status}`}{m.aiAssisted && " · AI-assisted"}{m.error && ` · ${m.error}`}</div>
              </div>
            </div>
          ))}
          <div ref={end} />
        </div>
        {can.reply && (
          <div className="line border-t p-3">
            {sensitive && mode === "reply" && <div className="mb-2 flex items-center gap-1.5 text-xs text-amber-600"><ShieldAlert size={13} /> Sensitive topic (payment, legal or complaint). Review carefully before replying.</div>}
            {!canReply && <Notice tone="warn">Replying on {p.name} isn&apos;t supported by its API.</Notice>}
            {err && <div className="mb-2"><Notice tone="error">{err}</Notice></div>}
            {info && <div className="mb-2"><Notice tone="success">{info}</Notice></div>}
            <div className="mb-2 flex gap-1 text-xs">
              <button className={cx("btn py-1", mode === "reply" ? "soft font-medium" : "muted")} onClick={() => setMode("reply")}>Reply on {p.name}</button>
              <button className={cx("btn py-1", mode === "note" ? "bg-amber-500/15 font-medium" : "muted")} onClick={() => setMode("note")}><StickyNote size={12} /> Internal note</button>
            </div>
            <textarea className={cx("input min-h-[80px]", mode === "note" && "border-amber-500/40")} placeholder={mode === "note" ? "Only your team sees notes" : `Reply as ${t.account.displayName}…`} value={body}
              onChange={(e) => { setBody(e.target.value); if (!e.target.value) setAi(false); }} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") document.getElementById("send-btn")?.click(); }} />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <div className="relative"><button className="btn-ghost p-2" onClick={() => setShowEmoji(!showEmoji)} aria-label="Emoji"><Smile size={16} /></button>
                {showEmoji && <div className="panel absolute bottom-full left-0 z-10 mb-1 grid grid-cols-6 gap-1 p-2 shadow-lg">{EMOJI.map((e) => <button key={e} className="rounded p-1 text-lg hover:bg-[var(--soft)]" onClick={() => { setBody((b) => b + e); setShowEmoji(false); }}>{e}</button>)}</div>}</div>
              {saved.length > 0 && <select className="input w-40 py-1.5 text-xs" value="" onChange={(e) => { const s = saved.find((x) => x.id === e.target.value); if (s) setBody((b) => (b ? `${b}\n${s.body}` : s.body).replace(/\{name\}/g, t.contact?.displayName?.split(" ")[0] ?? "there")); }}><option value="">Saved replies…</option>{saved.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</select>}
              {body && mode === "reply" && <button className="btn-ghost p-2" title="Save as saved reply" onClick={() => { const title = prompt("Name this saved reply"); if (title) act(() => savedReplyAction({ title, body })); }}><BookmarkPlus size={15} /></button>}
              {can.ai && mode === "reply" && <>
                <button className="btn-secondary py-1.5 text-xs" disabled={aiBusy} onClick={() => suggest({})}><Sparkles size={13} /> {aiBusy ? "Thinking…" : "Suggest reply"}</button>
                {body && ["friendly", "professional", "shorter"].map((tone) => <button key={tone} className="btn-ghost py-1 text-xs" disabled={aiBusy} onClick={() => suggest({ draft: body, tone: tone === "shorter" ? "concise" : tone })}>{tone}</button>)}
              </>}
              <div className="flex-1" />
              {ai && mode === "reply" && <span className="chip bg-brand-500/10 text-brand-500">AI draft — review before sending</span>}
              <button id="send-btn" className={mode === "note" ? "btn bg-amber-500 text-black hover:bg-amber-600" : "btn-primary"} disabled={pending || !body.trim() || (mode === "reply" && !canReply)}
                onClick={() => start(async () => {
                  setErr(""); setInfo("");
                  const r = mode === "note" ? await noteAction(t.id, body) : await replyAction(t.id, body, ai);
                  if (!r.ok) setErr(r.error); else { setBody(""); setAi(false); if (mode === "reply" && (r.data as any)?.simulated) setInfo("Sent (simulated — demo account)."); reload(); }
                })}><Send size={14} /> {mode === "note" ? "Add note" : "Send"}</button>
            </div>
          </div>
        )}
      </div>
      <aside className="line hidden space-y-4 overflow-y-auto border-l p-4 xl:block">
        <div className="text-center"><Avatar src={t.contact?.avatarUrl} name={t.contact?.displayName ?? "?"} size={56} /><div className="mt-2 font-semibold">{t.contact?.displayName}</div>{t.contact?.username && <div className="muted text-xs">@{t.contact.username}</div>}
          {t.contact && <a href={`/contacts?id=${t.contact.id}`} className="mt-1 inline-block text-xs text-brand-500">Open contact</a>}</div>
        <div><label className="label">Assigned to</label>
          <select className="input py-1.5" disabled={!can.assign} value={t.assigneeId ?? ""} onChange={(e) => start(async () => { await assignAction(t.id, e.target.value || null); reload(); })}>
            <option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === me ? " (me)" : ""}</option>)}</select></div>
        <div><label className="label">Status</label>
          <select className="input py-1.5" disabled={!can.reply} value={t.status} onChange={(e) => start(async () => { await statusAction(t.id, e.target.value as "OPEN"); reload(); })}>
            {["OPEN", "PENDING", "RESOLVED", "ARCHIVED"].map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}</select></div>
        <div><label className="label">Tags</label><TagEditor tags={t.tags} disabled={!can.reply} onSave={(tags) => start(async () => { await flagsAction(t.id, { tags }); reload(); })} /></div>
        {t.contact && <div className="text-xs"><div className="label">Contact</div><div>Status: <b>{t.contact.status}</b></div><div className="muted">Last interaction {new Date(t.contact.lastInteractionAt).toLocaleString()}</div>{t.contact.notes && <div className="soft mt-1 rounded p-2">{t.contact.notes}</div>}</div>}
      </aside>
    </div>
  );
}

function TagEditor({ tags, onSave, disabled }: { tags: string[]; onSave: (t: string[]) => void; disabled: boolean }) {
  const [v, setV] = useState("");
  return (
    <div>
      <div className="mb-1 flex flex-wrap gap-1">{tags.map((t) => <button key={t} disabled={disabled} className="chip soft" onClick={() => onSave(tags.filter((x) => x !== t))}>{t} ✕</button>)}</div>
      {!disabled && <form onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onSave([...tags, v.trim()]); setV(""); } }}><input className="input py-1 text-xs" placeholder="Add tag + Enter" value={v} onChange={(e) => setV(e.target.value)} /></form>}
    </div>
  );
}
