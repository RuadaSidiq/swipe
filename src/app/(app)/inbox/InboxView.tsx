"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, CheckCircle2, Flag, MailOpen, Sparkles, Send, StickyNote, Smile, BookmarkPlus, ChevronLeft, ShieldAlert, MessageCircle, PanelRight } from "lucide-react";
import { Avatar, DemoBadge, Empty, Notice, PlatformBadge, StatusBadge, cx } from "@/components/ui";
import { PLATFORMS, PLATFORM_LIST, type PlatformId } from "@/lib/platforms/registry";
import { MultiSelect, type MultiOption } from "@/components/MultiSelect";
import { assignAction, flagsAction, noteAction, openConversation, replyAction, savedReplyAction, statusAction } from "../_actions/inbox";
import { aiReply } from "../_actions/ai";

interface ConvRow { id: string; kind: string; status: string; priority: boolean; unread: boolean; awaitingReply: boolean; tags: string[]; lastMessageAt: string; lastMessagePreview: string; subject: string | null; isDemo: boolean;
  contact: { displayName: string; avatarUrl: string | null; username: string | null } | null; account: { platform: string; displayName: string; isDemo: boolean }; assignee: { id: string; user: { name: string } } | null; assigneeId: string | null }
const FOLDERS = [["open", "All open"], ["unread", "Unread"], ["read", "Read"], ["awaiting", "Awaiting reply"], ["mine", "Assigned to me"], ["unassigned", "Unassigned"], ["priority", "Priority"], ["pending", "Pending"], ["resolved", "Resolved"], ["archived", "Archived"]] as const;
const TYPES = [["", "All types"], ["dm", "Direct messages"], ["comment", "Comments"], ["mention", "Mentions"]] as const;
const EMOJI = ["🙂", "😊", "🙏", "👍", "❤️", "🎉", "🔥", "✅", "👋", "😅", "🙌", "💯"];
const SENSITIVE = /\b(refund|chargeback|lawyer|legal|sue|fraud|scam|stolen|hack|password|credit card|bank|payment|overcharged|complain|unacceptable|harass|emergency|injur|medical)\w*/i;
const ago = (iso: string) => { const s = (Date.now() - new Date(iso).getTime()) / 1000; return s < 60 ? "now" : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; };

const STATUS_OPTIONS: MultiOption[] = [
  { value: "unread", label: "Unread", group: "Status" }, { value: "read", label: "Read", group: "Status" },
  { value: "awaiting", label: "Waiting for reply", group: "Status" }, { value: "mine", label: "Assigned to me", group: "Status" },
  { value: "unassigned", label: "Unassigned", group: "Status" }, { value: "flagged", label: "Flagged", group: "Status" },
  { value: "done", label: "Done", group: "Status" }, { value: "archived", label: "Archived", group: "Status" },
  { value: "dm", label: "Messages", group: "Type" }, { value: "comment", label: "Comments", group: "Type" }, { value: "mention", label: "Mentions", group: "Type" },
];

export function InboxView({ convs, members, saved, me, filters, channels, openId, can, unreadCount }: {
  convs: ConvRow[]; members: { id: string; name: string }[]; saved: { id: string; title: string; body: string }[]; me: string; unreadCount: number;
  filters: { status: string[]; platforms: string[]; q: string }; channels: string[]; openId?: string; can: { reply: boolean; assign: boolean; ai: boolean };
}) {
  const router = useRouter(); const params = useSearchParams();
  const [active, setActive] = useState<string | undefined>(openId);
  const [thread, setThread] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState(filters.q);
  const setParam = (k: string, v: string) => { const p = new URLSearchParams(params.toString()); if (v) p.set(k, v); else p.delete(k); p.delete("c"); router.push(`/inbox?${p}`); };
  const channelOptions: MultiOption[] = [...new Set([...channels, ...filters.platforms])].map((p) => ({ value: p, label: PLATFORMS[p as PlatformId]?.name ?? p, icon: <PlatformBadge id={p} size={18} /> }));

  const load = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setLoading(true);
    const r = await openConversation(id); setLoading(false);
    if (r.ok) setThread(r.data);
  }, []);
  useEffect(() => { if (active) load(active); }, [active, load]);
  useEffect(() => { const h = setInterval(() => { router.refresh(); if (active) load(active, true); }, 20_000); return () => clearInterval(h); }, [active, load, router]);

  return (
    <div className="panel grid h-[calc(100dvh-210px)] min-h-[480px] overflow-hidden lg:h-[calc(100dvh-180px)] lg:grid-cols-[360px_1fr]">
      <section className={cx("flex min-h-0 flex-col border-r", active && "hidden lg:flex")} style={{ borderColor: "var(--line)" }} aria-label="Conversations">
        <div className="flex flex-col gap-3 border-b p-4" style={{ borderColor: "var(--line)" }}>
          <div className="flex items-center justify-between">
            <h1 className="font-display text-xl font-semibold">Inbox</h1>
            {unreadCount > 0 && <span className="muted text-xs">{unreadCount} unread</span>}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); setParam("q", q); }}><input className="input py-2" placeholder="Search messages" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search messages" /></form>
          <div className="flex gap-2">
            <MultiSelect label="Show" allLabel="All" options={STATUS_OPTIONS} value={filters.status} onChange={(v) => setParam("s", v.join(","))} />
            <MultiSelect label="From" allLabel="All" options={channelOptions} value={filters.platforms} onChange={(v) => setParam("p", v.join(","))}
              renderSummary={(sel) => <span className="flex items-center gap-1">{sel.slice(0, 4).map((o) => <PlatformBadge key={o.value} id={o.value} size={16} />)}{sel.length > 4 && <span className="text-xs">+{sel.length - 4}</span>}</span>} />
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto p-2">
          {convs.length === 0 && <Empty title="No conversations" body={!filters.status.length && !filters.platforms.length && !filters.q ? "New messages and comments will show up here." : "Try a different filter."} />}
          {convs.map((c) => (
            <li key={c.id}>
              <button onClick={() => { setActive(c.id); router.replace(`/inbox?${new URLSearchParams({ ...Object.fromEntries(params), c: c.id })}`, { scroll: false }); }}
                className={cx("flex w-full gap-3 rounded-xl px-3 py-3 text-left transition", active === c.id ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--soft)]")}>
                <Avatar src={c.contact?.avatarUrl} name={c.contact?.displayName ?? "?"} size={40} platform={c.account.platform} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cx("truncate text-sm", c.unread ? "font-semibold" : "font-medium")}>{c.contact?.displayName ?? "Unknown"}</span>
                    {c.priority && <Flag size={12} className="shrink-0 fill-red-500 text-red-500" aria-label="Priority" />}
                    <span className="muted ml-auto shrink-0 text-[11.5px]">{ago(c.lastMessageAt)}</span>
                  </div>
                  <div className={cx("mt-0.5 line-clamp-2 text-[13px] leading-snug", !c.unread && "muted")}>{c.lastMessagePreview}</div>
                  <div className="muted mt-1 flex items-center gap-1.5 text-[11.5px]">
                    <span>{c.kind === "dm" ? "Message" : c.kind === "mention" ? "Mention" : "Comment"}</span>
                    {c.awaitingReply && c.status !== "RESOLVED" && <span className="font-medium text-amber-700 dark:text-amber-400">· Needs reply</span>}
                    {c.assignee && <span>· {c.assignee.user.name.split(" ")[0]}</span>}
                  </div>
                </div>
                {c.unread && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: "var(--accent-bright)" }} aria-label="Unread" />}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className={cx("flex min-h-0 flex-col", !active && "hidden lg:flex")} aria-label="Conversation">
        {!active ? <div className="flex flex-1 items-center justify-center"><Empty icon={<MessageCircle size={22} />} title="Pick a conversation" body="Select a message on the left to read and reply." /></div>
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
  const [showEmoji, setShowEmoji] = useState(false); const [search, setSearch] = useState(""); const [details, setDetails] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView(); }, [t.messages.length]);
  const canReply = p.caps.dms.status !== "unavailable" || p.caps.comments.status !== "unavailable";
  const sensitive = t.messages.some((m: any) => m.direction === "inbound" && SENSITIVE.test(m.body));
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) setErr(r.error!); else { setErr(""); reload(); } });
  const suggest = async (o: { tone?: string; draft?: string }) => { setAiBusy(true); setErr(""); const r = await aiReply({ conversationId: t.id, ...o }); setAiBusy(false); if (r.ok) { setBody(r.data); setAi(true); } else setErr(r.error); };
  const messages = search ? t.messages.filter((m: any) => m.body.toLowerCase().includes(search.toLowerCase())) : t.messages;
  const timeline = [...messages.map((m: any) => ({ ...m, _t: "m" })), ...t.notes.map((n: any) => ({ ...n, _t: "n" }))].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div className={cx("relative grid min-h-0 flex-1", details && "xl:grid-cols-[1fr_290px]")}>
      <div className="flex min-h-0 flex-col">
        <div className="line flex flex-wrap items-center gap-2 border-b px-5 py-3.5">
          <button className="btn-ghost p-1.5 lg:hidden" onClick={onBack} aria-label="Back"><ChevronLeft size={16} /></button>
          <Avatar src={t.contact?.avatarUrl} name={t.contact?.displayName ?? "?"} size={40} platform={t.account.platform} />
          <div className="min-w-0 flex-1"><div className="truncate font-semibold">{t.contact?.displayName ?? "Unknown"}</div>
            <div className="muted text-xs">{p.name.replace(" (Twitter)", "")} {t.kind === "dm" ? "message" : t.kind} to {t.account.displayName}</div></div>
          {can.reply && <>
            <button className="btn-ghost p-2" title={t.priority ? "Remove priority" : "Mark priority"} onClick={() => act(() => flagsAction(t.id, { priority: !t.priority }))}><Flag size={15} className={t.priority ? "fill-red-500 text-red-600 dark:text-red-400" : ""} /></button>
            <button className="btn-ghost p-2" title="Mark unread" onClick={() => act(() => flagsAction(t.id, { unread: true }))}><MailOpen size={15} /></button>
            {t.status !== "RESOLVED" ? <button className="btn-secondary py-1.5" onClick={() => act(() => statusAction(t.id, "RESOLVED"))}><CheckCircle2 size={15} /> Mark done</button> : <button className="btn-secondary py-1" onClick={() => act(() => statusAction(t.id, "OPEN"))}>Reopen</button>}
            <button className="btn-ghost p-2" title="Archive" aria-label="Archive" onClick={() => act(() => statusAction(t.id, "ARCHIVED"))}><Archive size={15} /></button>
          </>}
          <button className={cx("btn-ghost p-2", details && "bg-[var(--soft)] text-[var(--text)]")} title="Details" aria-label="Contact details" aria-pressed={details} onClick={() => setDetails(!details)}><PanelRight size={16} /></button>
        </div>
        {t.subject && <div className="soft line border-b px-4 py-2 text-xs"><span className="muted">On post:</span> {t.subject}</div>}
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
          {timeline.map((m: any) => m._t === "n" ? (
            <div key={m.id} className="mx-auto max-w-lg rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs"><div className="font-semibold"><StickyNote size={11} className="mr-1 inline" />Internal note · {m.userName}</div><div className="mt-0.5 whitespace-pre-wrap">{m.body}</div></div>
          ) : (
            <div key={m.id} className={cx("flex gap-2", m.direction === "outbound" && "flex-row-reverse")}>
              {m.direction === "inbound" && <Avatar src={m.authorAvatar} name={m.authorName} size={28} />}
              <div className={cx("max-w-[75%] rounded-2xl px-3.5 py-2 text-sm", m.direction === "outbound" ? "bg-[var(--accent)] text-white" : "soft")}>
                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                {(m.attachments ?? []).map((a: any, i: number) => a.url ? <a key={i} href={a.url} target="_blank" rel="noreferrer" className="mt-1 block text-xs underline">📎 {a.type} attachment</a> : <div key={i} className="mt-1 text-xs opacity-70">📎 {a.type}</div>)}
                <div className={cx("mt-1 text-[10px]", m.direction === "outbound" ? "text-white/70" : "muted")}>{new Date(m.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}{m.direction === "outbound" && ` · ${m.authorName.split(" ")[0]}${m.status === "failed" ? " · failed" : ""}`}{m.aiAssisted && " · AI-assisted"}{m.error && ` · ${m.error}`}</div>
              </div>
            </div>
          ))}
          <div ref={end} />
        </div>
        {can.reply && (
          <div className="line border-t p-3">
            {sensitive && mode === "reply" && <div className="mb-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400"><ShieldAlert size={13} /> Sensitive topic (payment, legal or complaint). Review carefully before replying.</div>}
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
      {details && <aside className="line absolute inset-y-0 right-0 z-10 w-[290px] space-y-4 overflow-y-auto border-l p-5 shadow-xl xl:static xl:shadow-none" style={{ background: "var(--panel)" }}>
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
      </aside>}
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
