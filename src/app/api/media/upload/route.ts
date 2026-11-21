import { NextResponse } from "next/server";
import path from "node:path";
import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { sha256, randomToken } from "@/lib/crypto";
import { ALLOWED_UPLOADS, imageSize, mp4Duration, putObject, sniffMime } from "@/lib/storage";
import { enforceLimit } from "@/lib/billing";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

const MAX_BYTES = 512 * 1024 * 1024;

export async function POST(req: Request) {
  const ctx = await requireCtx();
  if (!ctx.can("media.manage") && !ctx.can("posts.create")) return NextResponse.json({ error: "You don't have permission to upload media." }, { status: 403 });
  if (!(await rateLimit(`upload:${ctx.user.id}`, 120, 3600)).ok) return NextResponse.json({ error: "Upload limit reached. Try again later." }, { status: 429 });
  const fd = await req.formData();
  const file = fd.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Files must be 512 MB or smaller." }, { status: 413 });
  try { await enforceLimit(ctx.workspace.organizationId, "storageMb", Math.ceil(file.size / 1e6)); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 402 }); }
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime || !ALLOWED_UPLOADS[mime]) return NextResponse.json({ error: "Unsupported file. Upload JPEG, PNG, WEBP, GIF, MP4, MOV, WEBM or PDF." }, { status: 415 });
  const kind = ALLOWED_UPLOADS[mime];
  const dims = kind === "image" || kind === "gif" ? imageSize(buf) : null;
  const duration = kind === "video" && mime !== "video/webm" ? mp4Duration(buf) : null;
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "application/pdf": "pdf" }[mime];
  const key = `${ctx.workspace.id}/${new Date().toISOString().slice(0, 7)}/${randomToken(12)}.${ext}`;
  await putObject(key, buf, mime);
  const folderId = String(fd.get("folderId") ?? "") || null;
  if (folderId) await db.mediaFolder.findFirstOrThrow({ where: { id: folderId, workspaceId: ctx.workspace.id } });
  const asset = await db.mediaAsset.create({ data: {
    workspaceId: ctx.workspace.id, folderId, kind, filename: path.basename(file.name).slice(0, 200) || `upload.${ext}`, mimeType: mime, sizeBytes: buf.length,
    width: dims?.width, height: dims?.height, durationSec: duration, storageKey: key, sha256: sha256(buf), uploadedById: ctx.user.id,
    tags: String(fd.get("tags") ?? "").split(",").map((t) => t.trim()).filter(Boolean), campaignId: String(fd.get("campaignId") ?? "") || null } });
  await audit(ctx, "media.upload", { targetType: "media", targetId: asset.id, detail: { mime, size: buf.length } });
  return NextResponse.json({ asset });
}
