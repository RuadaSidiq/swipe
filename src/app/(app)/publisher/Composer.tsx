"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Wand2, X, Image as ImageIcon, Send, Clock, Save, AlertTriangle, CheckCircle2, Languages, Hash, ChevronDown, Repeat, Link as LinkIcon } from "lucide-react";
import { Avatar, Notice, PlatformBadge, cx } from "@/components/ui";
import { Thumb, Uploader, type Asset } from "@/components/media";
import { Modal } from "../accounts/AccountsClient";
import { PLATFORMS, type PlatformId } from "@/lib/platforms/registry";
import { countChars } from "@/lib/platforms/validate";
import { savePostAction, validateAction } from "../_actions/posts";
import { aiAdapt, aiGenerate, aiRewrite } from "../_actions/ai";

interface Acc { id: string; platform: string; displayName: string; username: string | null; avatarUrl: string | null; isDemo: boolean; isDefault: boolean; status: string; brandId: string | null; meta: Record<string, any> }
interface TargetState { accountId: string; customize: boolean; body: string; title: string; link: string; useCustomMedia: boolean; mediaIds: string[]; options: Record<string, any> }
interface Report { accountId: string; platform: string; accountName: string; issues: { level: "error" | "warning"; message: string }[] }
export interface Initial { id?: string; title: string; body: string; link: string; mediaIds: string[]; campaignId: string; brandId: string; tags: string[]; scheduledAt: string; targets: TargetState[]; status?: string; recurrence?: { freq: "daily" | "weekly" | "monthly"; interval: number; count: number } | null }

const REWRITES = [["improve", "Improve for engagement"], ["shorter", "Make shorter"], ["longer", "Make longer"], ["professional", "More professional"], ["conversational", "More conversational"],
  ["persuasive", "More persuasive"], ["friendly", "Friendlier"], ["rewrite", "Rewrite"], ["hooks", "Suggest hooks"]] as const;

function toLocalInput(iso: string) { if (!iso) return ""; const d = new Date(iso); const off = d.getTimezoneOffset(); return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16); }

export function Composer({ accounts, media: initialMedia, campaigns, brands, initial, canPublish, canSchedule, needsApproval, aiEnabled, timezone }: {
  accounts: Acc[]; media: Asset[]; campaigns: { id: string; name: string }[]; brands: { id: string; name: string }[]; initial: Initial;
  canPublish: boolean; canSchedule: boolean; needsApproval: boolean; aiEnabled: boolean; timezone: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [link, setLink] = useState(initial.link);
  const [mediaIds, setMediaIds] = useState(initial.mediaIds);
  const [library, setLibrary] = useState(initialMedia);
  const [targets, setTargets] = useState<TargetState[]>(initial.targets);
  const [campaignId, setCampaignId] = useState(initial.campaignId);
  const [brandId, setBrandId] = useState(initial.brandId);
  const [tags, setTags] = useState(initial.tags.join(", "));
  const [when, setWhen] = useState(toLocalInput(initial.scheduledAt));
  const [recurrence, setRecurrence] = useState(initial.recurrence ?? null);
  const [tab, setTab] = useState<string>("all");
  const [reports, setReports] = useState<Report[]>([]);
  const [msg, setMsg] = useState<{ tone: "error" | "success" | "warn"; text: string } | null>(null);
  const [picker, setPicker] = useState<null | "base" | string>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState("");
  const [pending, start] = useTransition();
  const [aiGenerated, setAiGenerated] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // Content handed over from the AI assistant page
  useEffect(() => { try { const d = sessionStorage.getItem("orbit-draft"); if (d && !initial.id) { setBody(d); setAiGenerated(true); sessionStorage.removeItem("orbit-draft"); } } catch { /* storage unavailable */ } }, [initial.id]);

  const selected = targets.map((t) => accounts.find((a) => a.id === t.accountId)).filter(Boolean) as Acc[];
  const platforms = [...new Set(selected.map((a) => a.platform as PlatformId))];
  const mediaById = useMemo(() => new Map(library.map((m) => [m.id, m])), [library]);

  const payload = (action: string) => ({
    id: initial.id, title, body, link: link || null, mediaIds, campaignId: campaignId || null, brandId: brandId || null, tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
    action, scheduledAt: when ? new Date(when).toISOString() : null, timezone, recurrence, aiGenerated,
    targets: targets.map((t) => ({ accountId: t.accountId, body: t.customize ? t.body : null, title: t.customize ? t.title || null : null, link: t.customize ? t.link || null : null,
      mediaIds: t.useCustomMedia ? t.mediaIds : [], useCustomMedia: t.useCustomMedia, options: t.options })),
  });

  // Live server-side validation (debounced)
  useEffect(() => {
    if (!targets.length) { setReports([]); return; }
    const h = setTimeout(async () => { const r = await validateAction(payload("draft")); if (r.ok) setReports(r.data as Report[]); }, 450);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, body, link, mediaIds, targets]);

  const toggleAccount = (a: Acc) => setTargets((ts) => ts.some((t) => t.accountId === a.id) ? ts.filter((t) => t.accountId !== a.id)
    : [...ts, { accountId: a.id, customize: false, body: "", title: "", link: "", useCustomMedia: false, mediaIds: [], options: a.platform === "youtube" ? { visibility: "private" } : a.platform === "tiktok" ? { privacy: "SELF_ONLY" } : {} }]);
  const patch = (id: string, p: Partial<TargetState>) => setTargets((ts) => ts.map((t) => (t.accountId === id ? { ...t, ...p } : t)));
  const errors = reports.reduce((n, r) => n + r.issues.filter((i) => i.level === "error").length, 0);
  const touched = Boolean(body.trim() || mediaIds.length || link || targets.some((t) => t.customize || t.useCustomMedia)) || Boolean(msg);

  const submit = (action: "draft" | "schedule" | "publish_now") => start(async () => {
    setMsg(null);
    if (action === "publish_now" && !needsApproval && !confirm(`Publish now to ${targets.length} destination${targets.length > 1 ? "s" : ""}?`)) return;
    const r = await savePostAction(payload(action));
    if (!r.ok) { setMsg({ tone: "error", text: r.error }); if (r.details) setReports(r.details as Report[]); return; }
    const st = (r.data as { status: string }).status;
    router.push(`/posts/${(r.data as { id: string }).id}?saved=${action === "publish_now" && st === "SCHEDULED" ? "NOW" : st}`);
  });

  const runAI = async (label: string, fn: () => Promise<{ ok: boolean; data?: any; error?: string }>, apply: (d: any) => void) => {
    setAiBusy(label); setMsg(null);
    const r = await fn(); setAiBusy("");
    if (r.ok) { apply(r.data); setAiGenerated(true); } else setMsg({ tone: "error", text: r.error! });
  };

  const activeTarget = targets.find((t) => t.accountId === tab);
  const activeAcc = accounts.find((a) => a.id === tab);
  const versionFor = (t: TargetState) => ({ body: t.customize ? t.body : body, title: t.customize ? t.title || title : title, link: t.customize ? t.link || link : link, mediaIds: t.useCustomMedia ? t.mediaIds : mediaIds });

  const grouped = useMemo(() => {
    const g = new Map<string, Acc[]>();
    for (const a of accounts) g.set(a.platform, [...(g.get(a.platform) ?? []), a]);
    return [...g.entries()];
  }, [accounts]);

  const [mode, setMode] = useState<"now" | "later">(initial.scheduledAt ? "later" : "now");
  const [showLink, setShowLink] = useState(Boolean(initial.link));
  const [aiMenu, setAiMenu] = useState(false);
  const previewAcc = activeAcc ?? selected[0];
  const previewT = previewAcc ? targets.find((t) => t.accountId === previewAcc.id) : undefined;
  const primaryAction: "schedule" | "publish_now" = mode === "later" ? "schedule" : "publish_now";
  const primaryLabel = needsApproval ? "Submit for approval" : mode === "later" ? "Schedule post" : "Publish now";
  const canPrimary = needsApproval ? canSchedule : mode === "later" ? canSchedule : canPublish;
  const errorList = reports.flatMap((r) => r.issues.filter((i) => i.level === "error").map((i) => ({ ...i, platform: r.platform })));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] font-semibold">{initial.id ? "Edit post" : "Create post"}</h1>
        <button className="btn-ghost" disabled={pending} onClick={() => submit("draft")}><Save size={16} /> Save draft</button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="panel p-6">
            <div className="mb-3 flex items-center justify-between"><h2 className="section-title">Post to</h2><a href="/accounts" className="text-sm font-medium text-[var(--accent)]">Add account</a></div>
            {accounts.length === 0 ? <p className="muted text-sm">Connect an account to start posting.</p> : (
              <div className="flex flex-wrap gap-2">
                {grouped.map(([, list]) => list.map((a) => {
                  const on = targets.some((t) => t.accountId === a.id);
                  const disabled = a.status !== "CONNECTED";
                  return (
                    <button key={a.id} type="button" disabled={disabled} onClick={() => toggleAccount(a)} aria-pressed={on} title={disabled ? "Reconnect this account first" : a.displayName}
                      className={cx("flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-sm font-medium transition", on ? "border-[var(--accent-bright)] bg-[var(--accent-soft)]" : "border-[var(--line-strong)] hover:bg-[var(--soft)]", disabled && "cursor-not-allowed opacity-40")}>
                      <PlatformBadge id={a.platform} size={24} />
                      <span className="max-w-[9rem] truncate">{a.displayName}</span>
                      {on && <CheckCircle2 size={15} className="text-[var(--accent)]" />}
                    </button>
                  );
                }))}
              </div>
            )}
          </section>

          <section className="panel overflow-hidden">
            {targets.length > 0 && (
              <div className="flex gap-1 overflow-x-auto px-4 pt-4" role="tablist" aria-label="Customise per network">
                <button role="tab" aria-selected={tab === "all"} className="tab-link whitespace-nowrap" data-active={tab === "all"} onClick={() => setTab("all")}>All networks</button>
                {targets.map((t) => { const a = accounts.find((x) => x.id === t.accountId)!; const bad = touched && reports.find((x) => x.accountId === t.accountId)?.issues.some((i) => i.level === "error");
                  return (
                    <button key={t.accountId} role="tab" aria-selected={tab === t.accountId} className="tab-link whitespace-nowrap" data-active={tab === t.accountId} onClick={() => setTab(t.accountId)}>
                      <PlatformBadge id={a.platform} size={18} /> {PLATFORMS[a.platform as PlatformId].name.replace(" (Twitter)", "")}
                      {t.customize && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-bright)]" title="Customised" />}
                      {bad && <AlertTriangle size={13} className="text-red-600" aria-label="Has issues" />}
                    </button>); })}
              </div>
            )}

            <div className="flex flex-col gap-3 p-6 pt-4">
              {tab === "all" || !activeTarget || !activeAcc ? (
                <>
                  {platforms.some((p) => PLATFORMS[p].limits.title) && <input className="input" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />}
                  <textarea ref={bodyRef} className="input min-h-[200px] resize-y border-0 px-0 text-[15px] leading-relaxed shadow-none focus:shadow-none" placeholder="What do you want to share?" value={body} onChange={(e) => setBody(e.target.value)} aria-label="Post text" />
                  {mediaIds.length > 0 && <MediaStrip ids={mediaIds} byId={mediaById} onRemove={(id) => setMediaIds((m) => m.filter((x) => x !== id))} onMove={(from, to) => setMediaIds((m) => { const c = [...m]; const [x] = c.splice(from, 1); c.splice(to, 0, x); return c; })} onAdd={() => setPicker("base")} />}
                  {showLink && <input className="input" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} type="url" aria-label="Link" />}
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex items-center gap-2"><input type="checkbox" className="accent-[var(--accent)]" checked={activeTarget.customize} onChange={(e) => patch(activeTarget.accountId, { customize: e.target.checked, body: activeTarget.body || body, title: activeTarget.title || title, link: activeTarget.link || link })} /> Custom text for {PLATFORMS[activeAcc.platform as PlatformId].name.replace(" (Twitter)", "")}</label>
                    <label className="flex items-center gap-2"><input type="checkbox" className="accent-[var(--accent)]" checked={activeTarget.useCustomMedia} onChange={(e) => patch(activeTarget.accountId, { useCustomMedia: e.target.checked, mediaIds: activeTarget.mediaIds.length ? activeTarget.mediaIds : mediaIds })} /> Custom media</label>
                    <button className="btn-ghost ml-auto px-2 py-1 text-red-600" onClick={() => { toggleAccount(activeAcc); setTab("all"); }}><X size={14} /> Remove</button>
                  </div>
                  {activeTarget.customize ? (
                    <>
                      {PLATFORMS[activeAcc.platform as PlatformId].limits.title && <input className="input" placeholder="Title" value={activeTarget.title} onChange={(e) => patch(activeTarget.accountId, { title: e.target.value })} />}
                      <textarea className="input min-h-[180px] text-[15px] leading-relaxed" value={activeTarget.body} onChange={(e) => patch(activeTarget.accountId, { body: e.target.value })} aria-label="Custom text" />
                      <input className="input" placeholder="Link (optional)" value={activeTarget.link} onChange={(e) => patch(activeTarget.accountId, { link: e.target.value })} />
                    </>
                  ) : <p className="soft muted whitespace-pre-wrap rounded-xl p-4 text-sm">{body || "Uses the text from All networks."}</p>}
                  {activeTarget.useCustomMedia && <MediaStrip ids={activeTarget.mediaIds} byId={mediaById} onRemove={(id) => patch(activeTarget.accountId, { mediaIds: activeTarget.mediaIds.filter((x) => x !== id) })} onMove={() => {}} onAdd={() => setPicker(activeTarget.accountId)} />}
                  <PlatformOptions acc={activeAcc} t={activeTarget} onChange={(options) => patch(activeTarget.accountId, { options: { ...activeTarget.options, ...options } })} />
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1 border-t px-4 py-3" style={{ borderColor: "var(--line)" }}>
              <button className="btn-ghost px-3 py-2" onClick={() => setPicker(tab === "all" || !activeTarget ? "base" : activeTarget.accountId)}><ImageIcon size={17} /> Media</button>
              {tab === "all" && <button className={cx("btn-ghost px-3 py-2", showLink && "text-[var(--accent)]")} onClick={() => setShowLink(!showLink)}><LinkIcon size={17} /> Link</button>}
              {aiEnabled && (
                <div className="relative">
                  <button className="btn-ghost px-3 py-2" disabled={!!aiBusy} onClick={() => setAiMenu(!aiMenu)} aria-expanded={aiMenu}><Sparkles size={17} /> {aiBusy ? "Writing…" : "AI"} <ChevronDown size={14} /></button>
                  {aiMenu && (
                    <div className="panel absolute bottom-full left-0 z-20 mb-2 w-60 p-1.5" onClick={() => setAiMenu(false)}>
                      <button className="tab-link w-full" disabled={!body.trim() || platforms.length < 1} onClick={() => runAI("adapt", () => aiAdapt({ text: body, platforms, brandId: brandId || null }), (d: Record<string, { body: string; title?: string }>) =>
                        setTargets((ts) => ts.map((t) => { const a = accounts.find((x) => x.id === t.accountId)!; const v = d[a.platform]; return v ? { ...t, customize: true, body: v.body, title: v.title ?? "" } : t; })))}><Sparkles size={14} /> Tailor for each network</button>
                      {REWRITES.slice(0, 3).map(([m, l]) => <button key={m} className="tab-link w-full" disabled={!body.trim()} onClick={() => runAI(m, () => aiRewrite({ text: body, mode: m, brandId: brandId || null }), setBody)}><Wand2 size={14} /> {l}</button>)}
                      <button className="tab-link w-full" disabled={!body.trim()} onClick={() => runAI("hashtags", () => aiGenerate({ kind: "hashtags", topic: body, platforms, brandId: brandId || null }), (d) => setBody((b) => `${b.trim()}\n\n${d}`))}><Hash size={14} /> Add hashtags</button>
                      <button className="tab-link w-full" disabled={!body.trim()} onClick={() => { const l = window.prompt("Translate into which language?", "French"); if (l) runAI("translate", () => aiRewrite({ text: body, mode: "translate", language: l, brandId: brandId || null }), setBody); }}><Languages size={14} /> Translate</button>
                      <button className="tab-link w-full" onClick={() => setAiOpen(true)}><Sparkles size={14} /> Write from a topic</button>
                    </div>
                  )}
                </div>
              )}
              <div className="ml-auto"><CharCounters text={tab === "all" || !activeTarget?.customize ? body : activeTarget.body} link={link} platforms={tab === "all" || !activeAcc ? platforms : [activeAcc.platform as PlatformId]} /></div>
            </div>
            {aiOpen && aiEnabled && <div className="border-t px-6 pb-5" style={{ borderColor: "var(--line)" }}><AiGenerate busy={!!aiBusy} onRun={(kind, topic) => runAI("gen", () => aiGenerate({ kind, topic, platforms, brandId: brandId || null }), (d) => { setBody(d); setTab("all"); setAiOpen(false); })} more={REWRITES.slice(3)} onRewrite={(m) => runAI(m, () => aiRewrite({ text: body, mode: m, brandId: brandId || null }), setBody)} /></div>}
          </section>

          <details className="panel group px-6 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">More options <ChevronDown size={16} className="muted transition group-open:rotate-180" /></summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label><span className="label">Campaign</span><select className="input" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}><option value="">None</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label><span className="label">Brand voice</span><select className="input" value={brandId} onChange={(e) => setBrandId(e.target.value)}><option value="">Default</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
              <label><span className="label">Tags</span><input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="launch, summer" /></label>
            </div>
          </details>
        </div>

        <div className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
          <section className="panel p-6">
            <h2 className="section-title mb-3">When</h2>
            <div className="soft mb-4 grid grid-cols-2 gap-1 rounded-xl p-1" role="radiogroup" aria-label="When to publish">
              {(["now", "later"] as const).map((m) => <button key={m} role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cx("rounded-lg py-2 text-sm font-medium transition", mode === m ? "bg-[var(--panel)] shadow-sm" : "muted")}>{m === "now" ? "Now" : "Later"}</button>)}
            </div>
            {mode === "later" && (
              <div className="mb-4 flex flex-col gap-2">
                <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} min={toLocalInput(new Date().toISOString())} aria-label={`Date and time (${timezone})`} />
                <div className="flex items-center gap-2">
                  <Repeat size={15} className="muted shrink-0" />
                  <select className="input py-2" value={recurrence ? recurrence.freq : ""} onChange={(e) => setRecurrence(e.target.value ? { freq: e.target.value as "daily", interval: 1, count: recurrence?.count ?? 4 } : null)} aria-label="Repeat">
                    <option value="">Doesn&apos;t repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                  </select>
                  {recurrence && <input type="number" min={2} max={52} className="input w-20 py-2" value={recurrence.count} onChange={(e) => setRecurrence({ ...recurrence, count: Number(e.target.value) })} aria-label="Times" />}
                </div>
                <span className="muted text-xs">{timezone}</span>
              </div>
            )}
            <button className="btn-primary w-full py-3" disabled={pending || !canPrimary || !targets.length || (mode === "later" && !when) || errors > 0} onClick={() => submit(primaryAction)}>
              {mode === "later" ? <Clock size={16} /> : <Send size={16} />} {pending ? "Saving…" : primaryLabel}
            </button>
            {!targets.length && <p className="muted mt-2 text-center text-xs">Choose at least one account</p>}
            {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
            {touched && errorList.length > 0 && (
              <ul className="mt-4 flex flex-col gap-2 text-[13px]">
                {errorList.slice(0, 5).map((e, i) => <li key={i} className="flex gap-2 text-red-700 dark:text-red-400"><PlatformBadge id={e.platform} size={16} className="mt-0.5" /><span>{e.message.replace(/^[^:]+:\s*/, "")}</span></li>)}
                {errorList.length > 5 && <li className="muted">+{errorList.length - 5} more</li>}
              </ul>
            )}
          </section>

          {selected.length > 0 && previewAcc && (
            <section className="panel p-6">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="section-title">Preview</h2>
                {selected.length > 1 && <select className="input w-auto py-1.5 text-xs" value={previewAcc.id} onChange={(e) => setTab(e.target.value)} aria-label="Preview network">{selected.map((a) => <option key={a.id} value={a.id}>{PLATFORMS[a.platform as PlatformId].name}</option>)}</select>}
              </div>
              {previewT && (() => { const v = versionFor(previewT); return <Preview acc={previewAcc} body={v.body} title={v.title} link={v.link} media={v.mediaIds.map((id) => mediaById.get(id)).filter(Boolean) as Asset[]} />; })()}
            </section>
          )}
        </div>
      </div>

      {picker && (
        <Modal title="Add media" onClose={() => setPicker(null)} wide>
          <Uploader compact onUploaded={(a) => { setLibrary((l) => [a, ...l]); add(a.id); }} />
          <div className="mt-3 grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
            {library.filter((m) => m.kind !== "document").map((m) => {
              const cur = picker === "base" ? mediaIds : targets.find((t) => t.accountId === picker)?.mediaIds ?? [];
              return <button key={m.id} onClick={() => add(m.id)} className={cx("relative aspect-square overflow-hidden rounded-xl", cur.includes(m.id) && "ring-2 ring-[var(--accent-bright)]")}><Thumb a={m} />{cur.includes(m.id) && <span className="absolute right-1 top-1 rounded-full bg-[var(--accent)] px-1.5 text-xs text-white">{cur.indexOf(m.id) + 1}</span>}</button>;
            })}
          </div>
          <div className="mt-4 flex justify-end"><button className="btn-primary" onClick={() => setPicker(null)}>Done</button></div>
        </Modal>
      )}
    </div>
  );

  function add(id: string) {
    if (picker === "base") setMediaIds((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
    else if (picker) { const t = targets.find((x) => x.accountId === picker); if (t) patch(picker, { mediaIds: t.mediaIds.includes(id) ? t.mediaIds.filter((x) => x !== id) : [...t.mediaIds, id] }); }
  }
}

function CharCounters({ text, link, platforms }: { text: string; link: string; platforms: PlatformId[] }) {
  // Show only the network closest to its limit; the full list is in each network tab.
  if (!platforms.length) return <span className="muted text-xs tabular-nums">{[...text].length}</span>;
  const rows = platforms.map((p) => { const full = p === "facebook" || p === "linkedin" || p === "pinterest" || !link || text.includes(link) ? text : `${text} ${link}`; const n = countChars(p, full); const lim = PLATFORMS[p].limits.text; return { p, n, lim, left: lim - n }; });
  const tight = rows.sort((a, b) => a.left - b.left)[0];
  return (
    <span className={cx("flex items-center gap-1.5 text-xs tabular-nums", tight.left < 0 ? "font-semibold text-red-600 dark:text-red-400" : "muted")} title={rows.map((r) => `${PLATFORMS[r.p].name}: ${r.n}/${r.lim}`).join("\n")}>
      <PlatformBadge id={tight.p} size={14} /> {tight.n.toLocaleString()} / {tight.lim.toLocaleString()}
    </span>
  );
}

function MediaStrip({ ids, byId, onRemove, onAdd, onMove }: { ids: string[]; byId: Map<string, Asset>; onRemove: (id: string) => void; onAdd: () => void; onMove: (from: number, to: number) => void }) {
  const [drag, setDrag] = useState<number | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id, i) => { const m = byId.get(id); if (!m) return null; return (
        <div key={id} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => { if (drag !== null && drag !== i) onMove(drag, i); setDrag(null); }}
          className="group relative h-20 w-20 cursor-move overflow-hidden rounded-lg border line"><Thumb a={m} />
          <button className="absolute right-1 top-1 hidden rounded-full bg-black/70 p-0.5 text-white group-hover:block" onClick={() => onRemove(id)} aria-label="Remove"><X size={12} /></button>
          {!m.altText && m.kind !== "video" && <span className="absolute bottom-1 left-1 rounded bg-amber-500 px-1 text-[9px] font-bold text-black" title="No alt text">ALT</span>}
        </div>); })}
      <button className="line flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-xs" onClick={onAdd}><ImageIcon size={18} className="muted" /> Add media</button>
    </div>
  );
}

function PlatformOptions({ acc, t, onChange }: { acc: Acc; t: TargetState; onChange: (o: Record<string, any>) => void }) {
  const p = PLATFORMS[acc.platform as PlatformId];
  const o = t.options;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {p.fields.includes("board") && <label><span className="label">Pinterest board</span><select className="input" value={o.boardId ?? ""} onChange={(e) => onChange({ boardId: e.target.value })}><option value="">Choose a board…</option>{(acc.meta.boards ?? []).map((b: { id: string; name: string }) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>{!(acc.meta.boards ?? []).length && <span className="muted text-xs">No boards found — sync the account.</span>}</label>}
      {p.fields.includes("subreddit") && <label><span className="label">Subreddit</span><input className="input" placeholder="e.g. smallbusiness" value={o.subreddit ?? ""} onChange={(e) => onChange({ subreddit: e.target.value.replace(/^r\//, "") })} /><span className="muted text-xs">Check the community&apos;s self-promotion rules first.</span></label>}
      {p.fields.includes("visibility") && <label><span className="label">YouTube visibility</span><select className="input" value={o.visibility ?? "private"} onChange={(e) => onChange({ visibility: e.target.value })}><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label>}
      {p.fields.includes("privacy") && <label><span className="label">TikTok privacy</span><select className="input" value={o.privacy ?? "SELF_ONLY"} onChange={(e) => onChange({ privacy: e.target.value })}><option value="SELF_ONLY">Only me (required until audited)</option><option value="MUTUAL_FOLLOW_FRIENDS">Friends</option><option value="PUBLIC_TO_EVERYONE">Everyone</option></select></label>}
      {p.fields.includes("firstComment") && <label className="sm:col-span-2"><span className="label">First comment (optional)</span><input className="input" value={o.firstComment ?? ""} onChange={(e) => onChange({ firstComment: e.target.value })} placeholder="Posted as a comment right after publishing" /></label>}
    </div>
  );
}

function AiGenerate({ busy, onRun, more, onRewrite }: { busy: boolean; onRun: (k: any, topic: string) => void; more: readonly (readonly [string, string])[]; onRewrite: (m: any) => void }) {
  const [kind, setKind] = useState("caption"); const [topic, setTopic] = useState("");
  return (
    <div className="mt-3 space-y-2 border-t pt-3 line">
      <div className="flex flex-wrap gap-2">
        <select className="input w-52" value={kind} onChange={(e) => setKind(e.target.value)}>
          {[["caption", "Caption"], ["marketing", "Marketing post"], ["announcement", "Product announcement"], ["promo", "Promotion"], ["educational", "Educational post"], ["linkedin", "LinkedIn post"],
            ["script", "Short video script"], ["video_description", "Video description"], ["youtube_title", "YouTube titles"], ["thread", "Thread"], ["engagement", "Engagement post"], ["cta", "Calls to action"], ["bio", "Profile bio"]]
            .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input className="input flex-1" placeholder="Topic, product, offer or key message…" value={topic} onChange={(e) => setTopic(e.target.value)} />
        <button className="btn-primary" disabled={busy || !topic.trim()} onClick={() => onRun(kind, topic)}><Sparkles size={14} /> Generate</button>
      </div>
      <div className="flex flex-wrap gap-2">{more.map(([m, l]) => <button key={m} className="btn-ghost py-1 text-xs" disabled={busy} onClick={() => onRewrite(m)}>{l}</button>)}</div>
    </div>
  );
}

function Preview({ acc, body, title, link, media }: { acc: Acc; body: string; title?: string; link?: string; media: Asset[] }) {
  const p = PLATFORMS[acc.platform as PlatformId];
  const first = media[0];
  const handle = acc.username ? `@${acc.username.replace(/^@/, "")}` : acc.displayName;
  const visualFirst = ["instagram", "pinterest", "tiktok", "youtube"].includes(p.id);
  const mediaEl = first && (
    <div className={cx("relative overflow-hidden rounded-lg bg-black", p.id === "tiktok" ? "aspect-[9/16] max-h-80" : p.id === "youtube" ? "aspect-video" : p.id === "instagram" ? "aspect-square" : "aspect-video")}>
      <Thumb a={first} className="object-cover" />{media.length > 1 && <span className="absolute right-2 top-2 rounded-full bg-black/70 px-2 text-xs text-white">1/{media.length}</span>}
    </div>
  );
  return (
    <div className="line rounded-xl border p-3">
      <div className="mb-2 flex items-center gap-2"><Avatar src={acc.avatarUrl} name={acc.displayName} size={28} platform={acc.platform} /><div className="min-w-0"><div className="truncate text-sm font-semibold">{acc.displayName}</div><div className="muted truncate text-[11px]">{p.name} · {handle}</div></div></div>
      {visualFirst && mediaEl}
      {title && (p.limits.title) && <div className="mt-2 text-sm font-semibold">{title}</div>}
      <div className={cx("mt-1.5 whitespace-pre-wrap break-words text-sm", p.id === "instagram" && "text-[13px]")}>{(body || "").slice(0, 600)}{body.length > 600 && "… more"}</div>
      {!visualFirst && mediaEl && <div className="mt-2">{mediaEl}</div>}
      {link && !media.length && ["facebook", "linkedin", "x", "threads", "telegram", "reddit"].includes(p.id) && <div className="soft mt-2 truncate rounded-lg px-3 py-2 text-xs">🔗 {link}</div>}
      {p.id === "pinterest" && link && <div className="muted mt-1 truncate text-xs">→ {link}</div>}
      
    </div>
  );
}
