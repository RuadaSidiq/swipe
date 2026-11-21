import { NextResponse } from "next/server";
import { requireCtx } from "@/lib/auth";
import { sha256, randomToken } from "@/lib/crypto";
import { ALLOWED_UPLOADS, deleteObject, putObject, sniffMime } from "@/lib/storage";
import { EXT, recordAsset } from "@/lib/mediaIngest";
import { enforceLimit } from "@/lib/billing";
import { rateLimit } from "@/lib/ratelimit";

const MAX_BYTES = 512 * 1024 * 1024;

export async function POST(req: Request) {
  const ctx = await requireCtx();
  if (!ctx.can("media.manage") && !ctx.can("posts.create")) return NextResponse.json({ error: "You don't have permission to upload media." }, { status: 403 });
  if (!(await rateLimit(`upload:${ctx.user.id}`, 120, 3600)).ok) return NextResponse.json({ error: "Upload limit reached. Try again later." }, { status: 429 });
  if (process.env.VERCEL && !process.env.S3_BUCKET) return NextResponse.json({ error: "Media uploads aren't available yet: cloud storage (S3/R2) hasn't been configured for this site." }, { status: 503 });
  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Files must be 512 MB or smaller." }, { status: 413 });
  try { await enforceLimit(ctx.workspace.organizationId, "storageMb", Math.ceil(file.size / 1e6)); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 402 }); }
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime || !ALLOWED_UPLOADS[mime]) return NextResponse.json({ error: "Unsupported file. Upload JPEG, PNG, WEBP, GIF, MP4, MOV, WEBM or PDF." }, { status: 415 });
  const key = `${ctx.workspace.id}/${new Date().toISOString().slice(0, 7)}/${randomToken(12)}.${EXT[mime]}`;
  await putObject(key, buf, mime);
  const r = await recordAsset(ctx, { key, filename: file.name, size: buf.length, head: buf, sha256: sha256(buf), folderId: String(fd.get("folderId") ?? "") || null,
    campaignId: String(fd.get("campaignId") ?? "") || null, tags: String(fd.get("tags") ?? "").split(",") });
  if ("error" in r) { await deleteObject(key); return NextResponse.json({ error: r.error }, { status: 415 }); }
  const asset = r.asset;
  return NextResponse.json({ asset });
}
