"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Folder, FolderPlus, Trash2 } from "lucide-react";
import { Card, Empty, Notice, cx } from "@/components/ui";
import { Thumb, Uploader, fmtBytes, type Asset } from "@/components/media";
import { createFolder, deleteMedia, updateMedia } from "../_actions/media";
import { PLATFORM_LIST } from "@/lib/platforms/registry";

function compat(a: Asset) {
  return PLATFORM_LIST.filter((p) => p.caps.publishImage.status !== "unavailable" || p.caps.publishVideo.status !== "unavailable").map((p) => {
    const vid = a.kind === "video";
    const types = vid ? p.limits.videoTypes : p.limits.imageTypes;
    const cap = vid ? p.caps.publishVideo : p.caps.publishImage;
    const maxMb = vid ? p.limits.maxVideoMb : p.limits.maxImageMb;
    let why = "";
    if (cap.status === "unavailable") why = vid ? "no video" : "no images";
    else if (!types.includes(a.mimeType)) why = `${a.mimeType.split("/")[1]} not accepted`;
    else if (maxMb && a.sizeBytes > maxMb * 1e6) why = `over ${maxMb} MB`;
    else if (vid && a.durationSec && p.limits.maxVideoSec && a.durationSec > p.limits.maxVideoSec) why = `over ${p.limits.maxVideoSec}s`;
    else if (!vid && p.id === "instagram" && a.width && a.height && (a.width / a.height < 0.8 || a.width / a.height > 1.91)) why = "aspect ratio outside 4:5–1.91:1";
    return { p, ok: !why, why };
  });
}

export function MediaLibrary({ initial, folders, canManage }: { initial: Asset[]; folders: { id: string; name: string }[]; canManage: boolean }) {
  const router = useRouter();
  const [assets, setAssets] = useState(initial);
  const [folder, setFolder] = useState<string | null>(null);
  const [q, setQ] = useState(""); const [kind, setKind] = useState("");
  const [sel, setSel] = useState<Asset | null>(null);
  const [err, setErr] = useState(""); const [pending, start] = useTransition();
  const shown = useMemo(() => assets.filter((a) => (!folder || a.folderId === folder) && (!kind || a.kind === kind) &&
    (!q || a.filename.toLowerCase().includes(q.toLowerCase()) || a.tags.some((t) => t.includes(q.toLowerCase())) || a.altText.toLowerCase().includes(q.toLowerCase()))), [assets, folder, q, kind]);

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <div className="space-y-3">
        <Card pad={false}><div className="p-2">
          <button className="nav-link w-full" data-active={!folder} onClick={() => setFolder(null)}><Folder size={15} /> All files <span className="muted ml-auto text-xs">{assets.length}</span></button>
          {folders.map((f) => <button key={f.id} className="nav-link w-full" data-active={folder === f.id} onClick={() => setFolder(f.id)}><Folder size={15} /> <span className="truncate">{f.name}</span><span className="muted ml-auto text-xs">{assets.filter((a) => a.folderId === f.id).length}</span></button>)}
          {canManage && <button className="nav-link w-full text-brand-500" onClick={() => { const n = prompt("Folder name"); if (n) start(async () => { await createFolder(n); router.refresh(); }); }}><FolderPlus size={15} /> New folder</button>}
        </div></Card>
        {canManage && <Uploader folderId={folder} onUploaded={(a) => setAssets((x) => [a, ...x])} />}
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <input className="input max-w-xs" placeholder="Search name, tag or alt text" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input w-36" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">All types</option><option value="image">Images</option><option value="gif">GIFs</option><option value="video">Videos</option><option value="document">Documents</option></select>
        </div>
        {err && <Notice tone="error">{err}</Notice>}
        {shown.length === 0 ? <Card><Empty title="No media here yet" body="Upload images, videos, logos and campaign assets to reuse them across posts." /></Card> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {shown.map((a) => (
              <button key={a.id} onClick={() => setSel(a)} className={cx("panel group overflow-hidden text-left", sel?.id === a.id && "ring-2 ring-brand-500")}>
                <div className="aspect-square overflow-hidden"><Thumb a={a} /></div>
                <div className="p-2"><div className="truncate text-xs font-medium">{a.filename}</div><div className="muted text-[11px]">{fmtBytes(a.sizeBytes)}{a.width ? ` · ${a.width}×${a.height}` : ""}{a.durationSec ? ` · ${Math.round(a.durationSec)}s` : ""}</div></div>
              </button>
            ))}
          </div>
        )}
      </div>
      {sel && (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-sm overflow-y-auto border-l p-4 shadow-xl line" style={{ background: "var(--panel)" }}>
          <div className="mb-3 flex items-center justify-between"><h3 className="truncate font-semibold">{sel.filename}</h3><button className="btn-ghost p-1.5" onClick={() => setSel(null)} aria-label="Close">✕</button></div>
          <div className="soft mb-3 aspect-video overflow-hidden rounded-lg">{sel.kind === "video" ? <video src={`/api/media/${sel.id}`} controls className="h-full w-full" /> : <Thumb a={sel} className="object-contain" />}</div>
          <dl className="muted mb-3 grid grid-cols-2 gap-1 text-xs"><dt>Type</dt><dd>{sel.mimeType}</dd><dt>Size</dt><dd>{fmtBytes(sel.sizeBytes)}</dd>{sel.width && <><dt>Dimensions</dt><dd>{sel.width}×{sel.height}</dd></>}{sel.durationSec && <><dt>Duration</dt><dd>{sel.durationSec.toFixed(1)}s</dd></>}<dt>Uploaded</dt><dd>{new Date(sel.createdAt).toLocaleDateString()}</dd></dl>
          {canManage && (
            <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); start(async () => {
              const r = await updateMedia(sel.id, { altText: String(f.get("alt")), tags: String(f.get("tags")).split(","), folderId: String(f.get("folder")) || null });
              if (!r.ok) setErr(r.error); else { setAssets((x) => x.map((a) => a.id === sel.id ? { ...a, altText: String(f.get("alt")), tags: String(f.get("tags")).split(",").map((t) => t.trim().toLowerCase()).filter(Boolean), folderId: String(f.get("folder")) || null } : a)); }
            }); }}>
              <label className="label">Alt text (describes the image for screen readers)</label><textarea name="alt" className="input" rows={2} defaultValue={sel.altText} key={`a${sel.id}`} />
              <label className="label">Tags (comma separated)</label><input name="tags" className="input" defaultValue={sel.tags.join(", ")} key={`t${sel.id}`} />
              <label className="label">Folder</label><select name="folder" className="input" defaultValue={sel.folderId ?? ""} key={`f${sel.id}`}><option value="">None</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
              <div className="flex gap-2"><button className="btn-primary flex-1" disabled={pending}>Save</button>
                <button type="button" className="btn-secondary text-red-500" disabled={pending} onClick={() => confirm("Delete this file?") && start(async () => { const r = await deleteMedia(sel.id); if (r.ok) { setAssets((x) => x.filter((a) => a.id !== sel.id)); setSel(null); } else setErr(r.error); })}><Trash2 size={15} /></button></div>
            </form>
          )}
          <h4 className="mb-1 mt-4 text-xs font-semibold">Network compatibility</h4>
          <ul className="space-y-1 text-xs">{compat(sel).map(({ p, ok, why }) => <li key={p.id} className="flex justify-between"><span>{p.name}</span><span className={ok ? "text-emerald-500" : "text-red-500"}>{ok ? "✓ OK" : why}</span></li>)}</ul>
        </div>
      )}
    </div>
  );
}
