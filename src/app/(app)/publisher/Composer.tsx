"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Wand2, X, Image as ImageIcon, Send, Clock, Save, AlertTriangle, CheckCircle2, Languages, Hash, ChevronDown, Repeat } from "lucide-react";
import { Avatar, Card, DemoBadge, Notice, PlatformBadge, cx } from "@/components/ui";
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
    if (action === "publish_now" && !confirm(`Publish now to ${targets.length} destination${targets.length > 1 ? "s" : ""}?`)) return;
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

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <Card title="Publish to" actions={<span className="muted text-xs">{targets.length} selected</span>}>
          {accounts.length === 0 ? <p className="muted text-sm">No connected accounts. <a className="text-brand-500" href="/accounts">Connect one</a> to start publishing.</p> : (
            <div className="flex flex-wrap gap-2">
              {grouped.map(([, list]) => list.map((a) => {
                const on = targets.some((t) => t.accountId === a.id);
                const disabled = a.status !== "CONNECTED";
                return (
                  <button key={a.id} type="button" disabled={disabled} onClick={() => toggleAccount(a)} title={disabled ? "Reconnect this account first" : a.displayName}
                    className={cx("flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition line", on ? "border-brand-500 bg-brand-500/10" : "opacity-70 hover:opacity-100", disabled && "cursor-not-allowed opacity-40")}>
                    {a.avatarUrl ? <Avatar src={a.avatarUrl} name={a.displayName} size={24} platform={a.platform} /> : <PlatformBadge id={a.platform} size={22} />}
                    <span className="max-w-[10rem] truncate">{a.displayName}</span>
                  </button>
                );
              }))}
            </div>
          )}
        </Card>

        <Card pad={false}>
          <div className="line flex gap-1 overflow-x-auto border-b px-2 pt-2">
            <button className={cx("rounded-t-lg px-3 py-2 text-sm", tab === "all" ? "soft font-medium" : "muted")} onClick={() => setTab("all")}>Original</button>
            {targets.map((t) => { const a = accounts.find((x) => x.id === t.accountId)!; const r = reports.find((x) => x.accountId === t.accountId); const bad = r?.issues.some((i) => i.level === "error");
              return (<button key={t.accountId} onClick={() => setTab(t.accountId)} className={cx("flex items-center gap-1.5 whitespace-nowrap rounded-t-lg px-3 py-2 text-sm", tab === t.accountId ? "soft font-medium" : "muted")}>
                <PlatformBadge id={a.platform} size={16} /> {a.displayName.slice(0, 18)} {t.customize && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" title="Customized" />}
                {bad ? <AlertTriangle size={13} className="text-red-600 dark:text-red-400" /> : r ? <CheckCircle2 size={13} className="text-emerald-700 dark:text-emerald-400" /> : null}</button>); })}
          </div>
          <div className="space-y-3 p-4">
            {tab === "all" || !activeTarget || !activeAcc ? (
              <>
                {platforms.some((p) => PLATFORMS[p].limits.title) && <input className="input" placeholder={`Title (used by ${platforms.filter((p) => PLATFORMS[p].limits.title).map((p) => PLATFORMS[p].name).join(", ")})`} value={title} onChange={(e) => setTitle(e.target.value)} />}
                <textarea ref={bodyRef} className="input min-h-[180px] resize-y leading-relaxed" placeholder="What do you want to share?" value={body} onChange={(e) => setBody(e.target.value)} />
                <CharCounters text={body} link={link} platforms={platforms} />
                <input className="input" placeholder="Link (optional)" value={link} onChange={(e) => setLink(e.target.value)} type="url" />
                <MediaStrip ids={mediaIds} byId={mediaById} onRemove={(id) => setMediaIds((m) => m.filter((x) => x !== id))} onMove={(from, to) => setMediaIds((m) => { const c = [...m]; const [x] = c.splice(from, 1); c.splice(to, 0, x); return c; })} onAdd={() => setPicker("base")} />
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm"><PlatformBadge id={activeAcc.platform} /> <b>{PLATFORMS[activeAcc.platform as PlatformId].name}</b> version for {activeAcc.displayName}</div>
                  <div className="flex gap-2">
                    <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={activeTarget.customize} onChange={(e) => patch(activeTarget.accountId, { customize: e.target.checked, body: activeTarget.body || body, title: activeTarget.title || title, link: activeTarget.link || link })} /> Customize text</label>
                    <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={activeTarget.useCustomMedia} onChange={(e) => patch(activeTarget.accountId, { useCustomMedia: e.target.checked, mediaIds: activeTarget.mediaIds.length ? activeTarget.mediaIds : mediaIds })} /> Custom media</label>
                    <button className="btn-ghost py-1 text-red-600 dark:text-red-400" onClick={() => { toggleAccount(activeAcc); setTab("all"); }}><X size={14} /> Remove</button>
                  </div>
                </div>
                {activeTarget.customize ? (
                  <>
                    {PLATFORMS[activeAcc.platform as PlatformId].limits.title && <input className="input" placeholder="Title" value={activeTarget.title} onChange={(e) => patch(activeTarget.accountId, { title: e.target.value })} />}
                    <textarea className="input min-h-[160px]" value={activeTarget.body} onChange={(e) => patch(activeTarget.accountId, { body: e.target.value })} />
                    <CharCounters text={activeTarget.body} link={activeTarget.link} platforms={[activeAcc.platform as PlatformId]} />
                    {aiEnabled && <div className="flex flex-wrap gap-2">
                      {(["shorter", "professional", "conversational"] as const).map((m) => <button key={m} className="btn-secondary py-1 text-xs" disabled={!!aiBusy} onClick={() => runAI(m, () => aiRewrite({ text: activeTarget.body, mode: m, platform: activeAcc.platform as PlatformId, brandId: brandId || null }), (d) => patch(activeTarget.accountId, { body: d }))}><Wand2 size={12} /> {m}</button>)}
                    </div>}
                    <input className="input" placeholder="Link" value={activeTarget.link} onChange={(e) => patch(activeTarget.accountId, { link: e.target.value })} />
                  </>
                ) : <p className="muted soft whitespace-pre-wrap rounded-lg p-3 text-sm">{body || "Uses the original text."}</p>}
                {activeTarget.useCustomMedia && <MediaStrip ids={activeTarget.mediaIds} byId={mediaById} onRemove={(id) => patch(activeTarget.accountId, { mediaIds: activeTarget.mediaIds.filter((x) => x !== id) })} onMove={() => {}} onAdd={() => setPicker(activeTarget.accountId)} />}
                <PlatformOptions acc={activeAcc} t={activeTarget} onChange={(options) => patch(activeTarget.accountId, { options: { ...activeTarget.options, ...options } })} />
              </>
            )}
          </div>
        </Card>

        {aiEnabled && (
          <Card title={<span className="flex items-center gap-2"><Sparkles size={15} className="text-brand-500" /> AI assistant</span>} actions={<button className="btn-ghost py-1 text-xs" onClick={() => setAiOpen(!aiOpen)}>{aiOpen ? "Hide" : "Show"} <ChevronDown size={13} /></button>}>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary py-1.5 text-sm" disabled={!!aiBusy || !body.trim() || platforms.length < 1} onClick={() => runAI("adapt", () => aiAdapt({ text: body, platforms, brandId: brandId || null }), (d: Record<string, { body: string; title?: string }>) =>
                setTargets((ts) => ts.map((t) => { const a = accounts.find((x) => x.id === t.accountId)!; const v = d[a.platform]; return v ? { ...t, customize: true, body: v.body, title: v.title ?? "" } : t; })))}>
                <Sparkles size={14} /> {aiBusy === "adapt" ? "Adapting…" : "Tailor for each network"}</button>
              {REWRITES.slice(0, 4).map(([m, l]) => <button key={m} className="btn-secondary py-1.5 text-sm" disabled={!!aiBusy || !body.trim()} onClick={() => runAI(m, () => aiRewrite({ text: body, mode: m, brandId: brandId || null }), setBody)}><Wand2 size={14} /> {aiBusy === m ? "Working…" : l}</button>)}
              <button className="btn-secondary py-1.5 text-sm" disabled={!!aiBusy || !body.trim()} onClick={() => runAI("hashtags", () => aiGenerate({ kind: "hashtags", topic: body, platforms, brandId: brandId || null }), (d) => setBody((b) => `${b.trim()}\n\n${d}`))}><Hash size={14} /> Hashtags</button>
              <button className="btn-secondary py-1.5 text-sm" disabled={!!aiBusy || !body.trim()} onClick={() => { const l = prompt("Translate into which language?", "Spanish"); if (l) runAI("translate", () => aiRewrite({ text: body, mode: "translate", language: l, brandId: brandId || null }), setBody); }}><Languages size={14} /> Translate</button>
            </div>
            {aiOpen && <AiGenerate busy={!!aiBusy} onRun={(kind, topic) => runAI("gen", () => aiGenerate({ kind, topic, platforms, brandId: brandId || null }), (d) => { setBody(d); setTab("all"); })} more={REWRITES.slice(4)} onRewrite={(m) => runAI(m, () => aiRewrite({ text: body, mode: m, brandId: brandId || null }), setBody)} />}
            <p className="muted mt-2 text-xs">Review AI text before publishing.</p>
          </Card>
        )}

        <Card title="Details">
          <div className="grid gap-3 sm:grid-cols-3">
            <label><span className="label">Campaign</span><select className="input" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}><option value="">None</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label><span className="label">Brand voice</span><select className="input" value={brandId} onChange={(e) => setBrandId(e.target.value)}><option value="">Default</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
            <label><span className="label">Tags</span><input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="launch, q3" /></label>
          </div>
        </Card>
      </div>

      <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
        <Card title="Schedule">
          <label className="label">Publish at ({timezone})</label>
          <input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} min={toLocalInput(new Date().toISOString())} />
          <div className="mt-2 flex items-center gap-2 text-sm">
            <Repeat size={14} className="muted" />
            <select className="input py-1.5" value={recurrence ? `${recurrence.freq}` : ""} onChange={(e) => setRecurrence(e.target.value ? { freq: e.target.value as "daily", interval: 1, count: recurrence?.count ?? 4 } : null)}>
              <option value="">Doesn&apos;t repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
            </select>
            {recurrence && <input type="number" min={2} max={52} className="input w-20 py-1.5" value={recurrence.count} onChange={(e) => setRecurrence({ ...recurrence, count: Number(e.target.value) })} title="Number of occurrences" />}
          </div>
          {needsApproval && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">This workspace requires approval — scheduling submits the post to an approver.</p>}
          <div className="mt-3 grid gap-2">
            {canSchedule && <button className="btn-primary" disabled={pending || !targets.length || !when || errors > 0} onClick={() => submit("schedule")}><Clock size={15} /> {needsApproval ? "Submit for approval" : initial.id && initial.status === "SCHEDULED" ? "Update schedule" : "Schedule"}</button>}
            {canPublish && !needsApproval && <button className="btn-secondary" disabled={pending || !targets.length || errors > 0} onClick={() => submit("publish_now")}><Send size={15} /> Publish now</button>}
            <button className="btn-ghost" disabled={pending} onClick={() => submit("draft")}><Save size={15} /> Save draft</button>
          </div>
          {touched && errors > 0 && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{errors} issue{errors > 1 ? "s" : ""} to fix</p>}
        </Card>
        {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
        {touched && reports.length > 0 && (
          <Card title="Checks">
            <ul className="space-y-2 text-sm">
              {reports.map((r) => (
                <li key={r.accountId}>
                  <div className="flex items-center gap-1.5 font-medium"><PlatformBadge id={r.platform} size={16} /> {r.accountName}
                    {r.issues.length === 0 && <CheckCircle2 size={14} className="text-emerald-700 dark:text-emerald-400" />}</div>
                  {r.issues.map((i, k) => <div key={k} className={cx("ml-6 text-xs", i.level === "error" ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-400")}>{i.level === "error" ? "✕" : "!"} {i.message}</div>)}
                </li>
              ))}
            </ul>
          </Card>
        )}
        {targets.length > 0 && (
          <Card title="Preview">
            <div className="space-y-4">
              {(tab === "all" ? targets : targets.filter((t) => t.accountId === tab)).map((t) => { const a = accounts.find((x) => x.id === t.accountId)!; const v = versionFor(t);
                return <Preview key={t.accountId} acc={a} body={v.body} title={v.title} link={v.link} media={v.mediaIds.map((id) => mediaById.get(id)).filter(Boolean) as Asset[]} />; })}
            </div>
          </Card>
        )}
      </div>

      {picker && (
        <Modal title="Add media" onClose={() => setPicker(null)} wide>
          <Uploader compact onUploaded={(a) => { setLibrary((l) => [a, ...l]); add(a.id); }} />
          <div className="mt-3 grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5">
            {library.filter((m) => m.kind !== "document").map((m) => {
              const cur = picker === "base" ? mediaIds : targets.find((t) => t.accountId === picker)?.mediaIds ?? [];
              return <button key={m.id} onClick={() => add(m.id)} className={cx("relative aspect-square overflow-hidden rounded-lg border line", cur.includes(m.id) && "ring-2 ring-brand-500")}><Thumb a={m} />{cur.includes(m.id) && <span className="absolute right-1 top-1 rounded-full bg-brand-500 px-1.5 text-xs text-white">{cur.indexOf(m.id) + 1}</span>}</button>;
            })}
          </div>
          <div className="mt-3 flex justify-end"><button className="btn-primary" onClick={() => setPicker(null)}>Done</button></div>
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
  if (!platforms.length) return <div className="muted text-xs">{[...text].length} characters</div>;
  return (
    <div className="flex flex-wrap gap-2">
      {platforms.map((p) => { const full = p === "facebook" || p === "linkedin" || p === "pinterest" || !link || text.includes(link) ? text : `${text} ${link}`; const n = countChars(p, full); const lim = PLATFORMS[p].limits.text; const over = n > lim;
        return <span key={p} className={cx("chip soft", over && "!bg-red-500/15 text-red-600")}><PlatformBadge id={p} size={12} /> {n.toLocaleString()}/{lim.toLocaleString()}</span>; })}
    </div>
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
