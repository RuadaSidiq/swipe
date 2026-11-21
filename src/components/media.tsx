"use client";
import { useRef, useState } from "react";
import { Upload, Film, FileText } from "lucide-react";
import { cx } from "./ui";

export interface Asset { id: string; kind: string; filename: string; mimeType: string; sizeBytes: number; width: number | null; height: number | null; durationSec: number | null; altText: string; tags: string[]; folderId: string | null; createdAt: string | Date }

export function Thumb({ a, className }: { a: Pick<Asset, "id" | "kind" | "filename">; className?: string }) {
  if (a.kind === "image" || a.kind === "gif") return <img src={`/api/media/${a.id}`} alt={a.filename} loading="lazy" className={cx("h-full w-full object-cover", className)} />;
  if (a.kind === "video") return <div className={cx("relative h-full w-full bg-black", className)}><video src={`/api/media/${a.id}#t=0.5`} preload="metadata" muted className="h-full w-full object-cover" /><Film size={16} className="absolute bottom-1.5 left-1.5 text-white" /></div>;
  return <div className={cx("soft flex h-full w-full items-center justify-center", className)}><FileText /></div>;
}

export const fmtBytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);

/** XHR upload so we can show real progress. */
export function uploadFile(file: File, opts: { folderId?: string | null; campaignId?: string; onProgress?: (pct: number) => void }): Promise<Asset> {
  return new Promise((resolve, reject) => {
    const fd = new FormData(); fd.set("file", file);
    if (opts.folderId) fd.set("folderId", opts.folderId);
    if (opts.campaignId) fd.set("campaignId", opts.campaignId);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/media/upload");
    xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => { try { const r = JSON.parse(xhr.responseText); if (xhr.status < 300) resolve(r.asset); else reject(new Error(r.error ?? "Upload failed")); } catch { reject(new Error(`Upload failed (HTTP ${xhr.status})`)); } };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(fd);
  });
}

export function Uploader({ onUploaded, folderId, campaignId, compact }: { onUploaded: (a: Asset) => void; folderId?: string | null; campaignId?: string; compact?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<{ name: string; pct: number; error?: string }[]>([]);
  const [drag, setDrag] = useState(false);
  const handle = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) {
      const idx = jobs.length;
      setJobs((j) => [...j, { name: f.name, pct: 0 }]);
      try {
        const a = await uploadFile(f, { folderId, campaignId, onProgress: (pct) => setJobs((j) => j.map((x, i) => (i === idx ? { ...x, pct } : x))) });
        setJobs((j) => j.filter((x) => x.name !== f.name));
        onUploaded(a);
      } catch (e) { setJobs((j) => j.map((x) => (x.name === f.name ? { ...x, error: (e as Error).message } : x))); }
    }
  };
  return (
    <div>
      <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}
        onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && input.current?.click()}
        className={cx("line flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition", compact ? "p-3" : "p-8", drag && "border-brand-500 bg-brand-500/5")}>
        <Upload size={compact ? 16 : 22} className="muted" />
        <div className="mt-1 text-sm font-medium">{compact ? "Upload" : "Drop files or click to upload"}</div>
        {!compact && <div className="muted text-xs">JPEG, PNG, WEBP, GIF, MP4, MOV, WEBM, PDF · up to 512 MB</div>}
        <input ref={input} type="file" multiple hidden accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,application/pdf" onChange={(e) => { handle(e.target.files); e.target.value = ""; }} />
      </div>
      {jobs.map((j) => (
        <div key={j.name} className="mt-2 text-xs">
          <div className="flex justify-between"><span className="truncate">{j.name}</span><span className={j.error ? "text-red-500" : "muted"}>{j.error ?? `${j.pct}%`}</span></div>
          {!j.error && <div className="soft mt-1 h-1.5 overflow-hidden rounded-full"><div className="h-full bg-brand-500 transition-all" style={{ width: `${j.pct}%` }} /></div>}
        </div>
      ))}
    </div>
  );
}
