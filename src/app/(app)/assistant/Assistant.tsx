"use client";
import { useState } from "react";
import Link from "next/link";
import { Sparkles, Send, Copy, PenSquare } from "lucide-react";
import { Card, Notice, PlatformBadge, cx } from "@/components/ui";
import { PLATFORM_LIST, type PlatformId } from "@/lib/platforms/registry";
import { aiChat, aiGenerate, aiRepurpose, aiReview, aiRewrite } from "../_actions/ai";

const TOOLS = [["chat", "Chat"], ["generate", "Generate"], ["rewrite", "Rewrite & translate"], ["repurpose", "Article → posts"], ["review", "Review my content"]] as const;
const KINDS = [["caption", "Caption"], ["marketing", "Marketing post"], ["announcement", "Product announcement"], ["promo", "Promotional post"], ["educational", "Educational post"], ["script", "Short-form video script"], ["video_description", "Video description"],
  ["youtube_title", "YouTube titles"], ["hashtags", "Hashtags"], ["campaign_ideas", "Campaign ideas"], ["linkedin", "LinkedIn post"], ["thread", "Thread"], ["bio", "Social bio"], ["cta", "Calls to action"], ["engagement", "Community engagement post"]] as const;
const MODES = [["rewrite", "Rewrite"], ["shorter", "Shorter"], ["longer", "Longer"], ["professional", "Professional"], ["conversational", "Conversational"], ["persuasive", "Persuasive"], ["friendly", "Friendly"], ["improve", "Improve engagement"], ["hooks", "Alternative hooks"], ["translate", "Translate"], ["audience", "Adapt for audience"]] as const;

export function Assistant({ brands, platforms, offline }: { brands: { id: string; name: string }[]; platforms: string[]; offline?: boolean }) {
  const [tool, setTool] = useState<(typeof TOOLS)[number][0]>("chat");
  const [brandId, setBrandId] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [out, setOut] = useState<string | string[] | null>(null);
  const [chat, setChat] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [msg, setMsg] = useState("");
  const [kind, setKind] = useState("caption"); const [topic, setTopic] = useState(""); const [plats, setPlats] = useState<string[]>(platforms.slice(0, 3));
  const [text, setText] = useState(""); const [mode, setMode] = useState("rewrite"); const [lang, setLang] = useState("Spanish"); const [aud, setAud] = useState("");
  const [count, setCount] = useState(5);
  const run = async (fn: () => Promise<{ ok: boolean; data?: any; error?: string }>) => { if (offline) { setErr("Swipe AI isn't switched on yet."); return; } setBusy(true); setErr(""); const r = await fn(); setBusy(false); if (r.ok) setOut(r.data); else setErr(r.error!); };
  const bid = brandId || null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <div className="clay-inset flex flex-wrap gap-1 rounded-[14px] p-1">{TOOLS.map(([k, l]) => <button key={k} className="seg" data-active={tool === k} onClick={() => { setTool(k); setOut(null); setErr(""); }}>{l}</button>)}</div>
        {tool === "chat" && (
          <Card pad={false}>
            <div className="max-h-[55vh] min-h-[300px] space-y-3 overflow-y-auto p-4">
              {chat.length === 0 && (
                <div className="flex flex-col items-center px-4 py-8 text-center">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl text-white" style={{ background: "linear-gradient(160deg,#1FC48D,#00875A)", boxShadow: "0 12px 24px -10px rgba(0,135,90,.6), inset 0 1px 0 rgba(255,255,255,.35)" }}><Sparkles size={24} /></span>
                  <div className="mt-4 font-display text-lg font-semibold">How can I help today?</div>
                  <div className="muted mt-1 max-w-sm text-sm">Ask about your performance, plan content, or get ideas. I use your brand voice and real data.</div>
                  <div className="mt-5 flex max-w-lg flex-wrap justify-center gap-2">
                    {["What should we post this week?", "Which posts did best last month, and why?", "Write 3 captions for our new product", "Plan a 2-week campaign"].map((q) => <button key={q} type="button" className="tile px-3 py-2 text-[13px]" onClick={() => setMsg(q)}>{q}</button>)}
                  </div>
                </div>
              )}
              {chat.map((m, i) => <div key={i} className={cx("max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm", m.role === "user" ? "ml-auto bg-brand-500 text-white" : "soft")}>{m.content}
                {m.role === "assistant" && <div className="mt-1 flex gap-2"><CopyBtn text={m.content} /><Link className="text-xs opacity-70 hover:underline" href={`/publisher`} onClick={() => sessionStorage.setItem("swipe-draft", m.content)}>Use in post</Link></div>}</div>)}
              {busy && <div className="muted text-sm">Thinking…</div>}
            </div>
            <form className="line flex gap-2 border-t p-3" onSubmit={async (e) => { e.preventDefault(); if (!msg.trim()) return; if (offline) { setErr("Swipe AI isn't switched on yet."); return; } const m = msg; setMsg(""); const hist = chat; setChat([...hist, { role: "user", content: m }]); setBusy(true); setErr("");
              const r = await aiChat(m, hist); setBusy(false); if (r.ok) setChat((c) => [...c, { role: "assistant", content: r.data }]); else setErr(r.error); }}>
              <input className="input" placeholder="Ask the assistant…" value={msg} onChange={(e) => setMsg(e.target.value)} />
              <button className="btn-primary" disabled={busy}><Send size={15} /></button>
            </form>
          </Card>
        )}
        {tool === "generate" && (
          <Card title="Generate content">
            <div className="space-y-3">
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <textarea className="input" rows={3} placeholder="What's it about? Include product names, offers, dates — the AI won't invent facts." value={topic} onChange={(e) => setTopic(e.target.value)} />
              <PlatformPicker value={plats} onChange={setPlats} />
              <button className="btn-primary" disabled={busy || !topic.trim()} onClick={() => run(() => aiGenerate({ kind: kind as "caption", topic, platforms: plats as PlatformId[], brandId: bid }))}><Sparkles size={15} /> {busy ? "Generating…" : "Generate"}</button>
            </div>
          </Card>
        )}
        {tool === "rewrite" && (
          <Card title="Rewrite, adapt or translate">
            <div className="space-y-3">
              <textarea className="input" rows={6} placeholder="Paste a post or caption" value={text} onChange={(e) => setText(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <select className="input w-52" value={mode} onChange={(e) => setMode(e.target.value)}>{MODES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                {mode === "translate" && <input className="input w-40" value={lang} onChange={(e) => setLang(e.target.value)} placeholder="Language" />}
                {mode === "audience" && <input className="input flex-1" value={aud} onChange={(e) => setAud(e.target.value)} placeholder="e.g. Gen Z students, CFOs" />}
                <button className="btn-primary" disabled={busy || !text.trim()} onClick={() => run(() => aiRewrite({ text, mode: mode as "rewrite", language: lang, audience: aud, brandId: bid }))}><Sparkles size={15} /> {busy ? "Working…" : "Run"}</button>
              </div>
            </div>
          </Card>
        )}
        {tool === "repurpose" && (
          <Card title="Turn an article into posts">
            <div className="space-y-3">
              <textarea className="input" rows={10} placeholder="Paste your blog post, newsletter or transcript" value={text} onChange={(e) => setText(e.target.value)} />
              <PlatformPicker value={plats} onChange={setPlats} />
              <div className="flex items-center gap-2"><label className="text-sm">Posts</label><input type="number" min={1} max={10} className="input w-20" value={count} onChange={(e) => setCount(Number(e.target.value))} />
                <button className="btn-primary" disabled={busy || text.trim().length < 100 || !plats.length} onClick={() => run(() => aiRepurpose({ article: text, count, platforms: plats as PlatformId[], brandId: bid }))}><Sparkles size={15} /> {busy ? "Working…" : "Create posts"}</button></div>
            </div>
          </Card>
        )}
        {tool === "review" && (
          <Card title="Review my content">
            <p className="muted mb-3 text-sm">Get feedback on your 25 latest posts and drafts.</p>
            <button className="btn-primary" disabled={busy} onClick={() => run(() => aiReview(bid))}><Sparkles size={15} /> {busy ? "Reviewing…" : "Run review"}</button>
          </Card>
        )}
        {err && <Notice tone="error">{err}</Notice>}
        {out && tool !== "chat" && (
          <Card title="Result" actions={<span className="muted text-xs">Review and edit before publishing</span>}>
            {Array.isArray(out) ? <div className="space-y-3">{out.map((o, i) => <div key={i} className="soft rounded-lg p-3 text-sm"><div className="whitespace-pre-wrap">{o}</div><div className="mt-2 flex gap-3"><CopyBtn text={o} /><UseBtn text={o} /></div></div>)}</div>
              : <div><div className="whitespace-pre-wrap text-sm leading-relaxed">{out}</div><div className="mt-3 flex gap-3"><CopyBtn text={out} />{tool !== "review" && <UseBtn text={out} />}</div></div>}
          </Card>
        )}
      </div>
      <Card title="Brand voice">
        <select className="input" value={brandId} onChange={(e) => setBrandId(e.target.value)}><option value="">Default brand</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <p className="muted mt-2 text-xs">Each brand keeps its own tone, audience, products and examples. Edit them in <Link href="/settings/brand" className="text-brand-500">Settings → Brand</Link>.</p>
      </Card>
    </div>
  );
}
function PlatformPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return <div className="flex flex-wrap gap-1.5">{PLATFORM_LIST.filter((p) => p.caps.publishText.status !== "unavailable" || p.caps.publishVideo.status !== "unavailable").map((p) => (
    <button key={p.id} type="button" onClick={() => onChange(value.includes(p.id) ? value.filter((x) => x !== p.id) : [...value, p.id])} className={cx("chip border py-1 line", value.includes(p.id) ? "border-brand-500 bg-brand-500/10" : "opacity-60")}><PlatformBadge id={p.id} size={14} /> {p.name}</button>))}</div>;
}
function CopyBtn({ text }: { text: string }) { const [ok, setOk] = useState(false); return <button className="flex items-center gap-1 text-xs opacity-70 hover:opacity-100" onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1500); }}><Copy size={12} /> {ok ? "Copied" : "Copy"}</button>; }
function UseBtn({ text }: { text: string }) { return <Link className="flex items-center gap-1 text-xs text-brand-500" href="/publisher" onClick={() => sessionStorage.setItem("swipe-draft", text)}><PenSquare size={12} /> Use in a post</Link>; }
