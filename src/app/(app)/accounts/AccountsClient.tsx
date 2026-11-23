"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Plug, Unplug, Trash2, ExternalLink, Info, Star } from "lucide-react";
import { Avatar, Card, DemoBadge, Empty, Notice, PlatformBadge, StatusBadge, cx } from "@/components/ui";
import type { PlatformDef } from "@/lib/platforms/registry";
import { addDemoAccount, connectTelegram, connectWhatsApp, disconnectAccount, removeAccount, syncAccount, updateAccount } from "../_actions/accounts";

type P = PlatformDef & { configured: boolean };
interface Acc { id: string; platform: string; displayName: string; username: string | null; avatarUrl: string | null; profileUrl: string | null; status: string; statusMessage: string | null;
  accountType: string; isDemo: boolean; isDefault: boolean; brandId: string | null; scopes: string[]; tokenExpiresAt: string | null; lastSyncedAt: string | null }

const CAP_LABELS: Record<string, string> = { publishText: "Text posts", publishImage: "Images", publishMulti: "Multi-image / carousel", publishVideo: "Video", publishLink: "Links",
  schedule: "Scheduling", dms: "Direct messages", comments: "Comments", mentions: "Mentions", analytics: "Analytics", altText: "Alt text" };

export function AccountsClient({ accounts, brands, platforms, demoMode, canConnect, canManage }: { accounts: Acc[]; brands: { id: string; name: string }[]; platforms: P[]; demoMode: boolean; canConnect: boolean; canManage: boolean; appUrl: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [modal, setModal] = useState<P | null>(null);
  const [details, setDetails] = useState<P | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, ok: (d: unknown) => string) => start(async () => {
    const r = await fn(); setMsg(r.ok ? { tone: "success", text: ok(r.data) } : { tone: "error", text: r.error! }); router.refresh();
  });
  const live = accounts.filter((a) => a.status !== "DISCONNECTED");
  const off = accounts.filter((a) => a.status === "DISCONNECTED");

  return (
    <div className="space-y-6">
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Card title={`Connected (${live.length})`} pad={false}>
        {live.length === 0 ? <Empty title="No accounts connected yet" /> : (
          <ul>
            {live.map((a) => {
              const p = platforms.find((x) => x.id === a.platform)!;
              return (
                <li key={a.id} className="line flex flex-wrap items-center gap-3 border-t px-4 py-3 first:border-t-0">
                  {a.avatarUrl ? <Avatar src={a.avatarUrl} name={a.displayName} size={40} platform={a.platform} /> : <PlatformBadge id={a.platform} size={40} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-medium">{a.displayName}{a.isDefault && <Star size={13} className="fill-[var(--accent-bright)] text-[var(--accent-bright)]" aria-label="Default" />}</div>
                    <div className="muted text-xs" title={a.lastSyncedAt ? `Synced ${new Date(a.lastSyncedAt).toLocaleString()}` : undefined}>{p.name}{a.username ? ` @${a.username.replace(/^@/, "")}` : ""}</div>
                    {a.statusMessage && a.status !== "CONNECTED" && <div className="mt-1 text-xs text-red-600 dark:text-red-400">{a.statusMessage}</div>}
                    {a.scopes.length > 0 && !a.isDemo && <details className="mt-1 text-xs"><summary className="muted cursor-pointer">{a.scopes.length} permissions</summary><div className="muted mt-1 break-words">{a.scopes.join(", ")}</div></details>}
                  </div>
                  <StatusBadge status={a.status} />
                  {canManage && brands.length > 1 && (
                    <select className="input w-40 py-1.5 text-xs" value={a.brandId ?? ""} onChange={(e) => run(() => updateAccount(a.id, { brandId: e.target.value || null }), () => "Brand updated")} aria-label="Brand">
                      <option value="">No brand</option>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  )}
                  <div className="flex items-center gap-1">
                    {a.profileUrl && <a className="btn-ghost p-2" href={a.profileUrl} target="_blank" rel="noreferrer" title="Open profile"><ExternalLink size={15} /></a>}
                    {canManage && <button className="btn-ghost p-2" title={a.isDefault ? "Unset default" : "Set as default publishing account"} disabled={pending} onClick={() => run(() => updateAccount(a.id, { isDefault: !a.isDefault }), () => "Updated")}><Star size={15} /></button>}
                    {canManage && !a.isDemo && p.caps.analytics.status !== "unavailable" && <button className="btn-ghost p-2" title="Sync now" disabled={pending} onClick={() => run(() => syncAccount(a.id), (n) => `Synced ${n} metrics`)}><RefreshCw size={15} /></button>}
                    {canConnect && a.status !== "CONNECTED" && !a.isDemo && (p.connect === "oauth" ? <a className="btn-primary py-1.5" href={`/api/oauth/${a.platform}/start`}>Reconnect</a> : <button className="btn-primary py-1.5" onClick={() => setModal(p)}>Reconnect</button>)}
                    {canManage && <button className="btn-ghost p-2 hover:!text-red-600" title="Disconnect & revoke" aria-label="Disconnect" disabled={pending} onClick={() => confirm(`Disconnect ${a.displayName}? Scheduled posts to it will be marked failed.`) && run(() => disconnectAccount(a.id), (r) => `Disconnected: ${r}`)}><Unplug size={15} /></button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {canConnect && (
        <Card title="Add an account">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {platforms.map((p) => (
              <div key={p.id} className="line rounded-xl border p-3">
                <div className="flex items-center gap-2"><PlatformBadge id={p.id} size={28} /><div className="font-medium">{p.name}</div>
                  <button className="btn-ghost ml-auto p-1.5" onClick={() => setDetails(p)} title="What's supported"><Info size={15} /></button></div>
                <div className="muted mt-2 min-h-[2.25rem] text-xs">{p.configured ? (p.id === "snapchat" ? "Partner access only" : "") : "Not set up on this server"}</div>
                <div className="mt-2 flex gap-2">
                  {p.configured && (p.connect === "oauth"
                    ? <a className="btn-primary flex-1 py-1.5" href={`/api/oauth/${p.id}/start`}><Plug size={14} /> Connect</a>
                    : <button className="btn-primary flex-1 py-1.5" onClick={() => setModal(p)}><Plug size={14} /> Connect</button>)}
                  {demoMode && <button className={cx("btn-secondary py-1.5", !p.configured && "flex-1")} disabled={pending} onClick={() => run(() => addDemoAccount(p.id), () => `Added a demo ${p.name} account`)}>Add demo</button>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {off.length > 0 && (
        <Card title="Disconnected" pad={false}>
          <ul>{off.map((a) => (
            <li key={a.id} className="line flex items-center gap-3 border-t px-4 py-2.5 first:border-t-0">
              <Avatar src={a.avatarUrl} name={a.displayName} size={28} platform={a.platform} /><div className="flex-1 text-sm">{a.displayName}</div>
              {canConnect && platforms.find((p) => p.id === a.platform)?.connect === "oauth" && <a className="btn-secondary py-1" href={`/api/oauth/${a.platform}/start`}>Reconnect</a>}
              {canManage && <button className="btn-ghost p-2 text-red-600 dark:text-red-400" title="Delete permanently (removes its post history)" onClick={() => confirm("Delete this account and its publishing history?") && run(() => removeAccount(a.id), () => "Removed")}><Trash2 size={15} /></button>}
            </li>))}</ul>
        </Card>
      )}

      {details && (
        <Modal onClose={() => setDetails(null)} title={`${details.name} — what Swipe can do`}>
          {details.accessNote && <p className="muted mb-3 text-sm">{details.accessNote}</p>}
          <table className="table w-full"><tbody>
            {Object.entries(details.caps).map(([k, c]) => (
              <tr key={k}><td className="w-40 font-medium">{CAP_LABELS[k]}</td><td><StatusBadge status={c.status} /></td><td className="muted text-xs">{c.note}</td></tr>
            ))}
          </tbody></table>
          <p className="muted mt-3 text-xs">Limits: {details.limits.text.toLocaleString()} characters{details.limits.title ? `, title ${details.limits.title}` : ""}{details.limits.images ? `, up to ${details.limits.images} images` : ""}{details.limits.maxVideoSec ? `, video ≤ ${details.limits.maxVideoSec}s` : ""}.</p>
        </Modal>
      )}
      {modal?.id === "telegram" && <TelegramModal onClose={() => setModal(null)} onDone={(t) => { setMsg({ tone: "success", text: t }); setModal(null); router.refresh(); }} />}
      {modal?.id === "whatsapp" && <WhatsAppModal onClose={() => setModal(null)} onDone={(t) => { setMsg({ tone: "success", text: t }); setModal(null); router.refresh(); }} />}
    </div>
  );
}

export function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={cx("panel relative max-h-[90vh] w-full overflow-y-auto p-5 shadow-xl", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{title}</h3><button className="btn-ghost p-1.5" onClick={onClose} aria-label="Close">✕</button></div>
        {children}
      </div>
    </div>
  );
}

function TelegramModal({ onClose, onDone }: { onClose: () => void; onDone: (t: string) => void }) {
  const [botToken, setToken] = useState(""); const [chat, setChat] = useState(""); const [err, setErr] = useState(""); const [pending, start] = useTransition();
  return (
    <Modal title="Connect Telegram" onClose={onClose}>
      <ol className="muted mb-3 list-decimal space-y-1 pl-5 text-sm"><li>Create a bot with <b>@BotFather</b> and copy its token.</li><li>Add the bot to your channel as an <b>administrator</b> with “Post messages”.</li><li>Enter the token and the channel username (e.g. <code>mychannel</code>) or numeric ID.</li></ol>
      <div className="space-y-2">
        <input className="input" placeholder="Bot token" value={botToken} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
        <input className="input" placeholder="Channel username or ID" value={chat} onChange={(e) => setChat(e.target.value)} />
        <p className="muted text-xs">The token is encrypted at rest and never sent back to your browser.</p>
        {err && <Notice tone="error">{err}</Notice>}
        <button className="btn-primary w-full" disabled={pending || !botToken || !chat} onClick={() => start(async () => { const r = await connectTelegram({ botToken, chat }); if (r.ok) onDone(`Connected ${r.data.name}. Webhook ${r.data.webhook}.`); else setErr(r.error); })}>{pending ? "Verifying…" : "Verify & connect"}</button>
      </div>
    </Modal>
  );
}

function WhatsAppModal({ onClose, onDone }: { onClose: () => void; onDone: (t: string) => void }) {
  const [token, setToken] = useState(""); const [phone, setPhone] = useState(""); const [waba, setWaba] = useState(""); const [err, setErr] = useState(""); const [pending, start] = useTransition();
  return (
    <Modal title="Connect WhatsApp Business" onClose={onClose}>
      <p className="muted mb-3 text-sm">In Meta Business Manager create a System User with <b>whatsapp_business_messaging</b>, generate a permanent token, and copy your phone number ID from the WhatsApp › API Setup page. Point the webhook to <code>/api/webhooks/meta</code>.</p>
      <div className="space-y-2">
        <input className="input" placeholder="System User access token" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
        <input className="input" placeholder="Phone number ID" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className="input" placeholder="WhatsApp Business Account ID (optional, to subscribe webhooks)" value={waba} onChange={(e) => setWaba(e.target.value)} />
        {err && <Notice tone="error">{err}</Notice>}
        <button className="btn-primary w-full" disabled={pending || !token || !phone} onClick={() => start(async () => { const r = await connectWhatsApp({ token, phoneNumberId: phone, wabaId: waba || undefined }); if (r.ok) onDone(`Connected ${r.data.name}.`); else setErr(r.error); })}>{pending ? "Verifying…" : "Verify & connect"}</button>
      </div>
    </Modal>
  );
}
