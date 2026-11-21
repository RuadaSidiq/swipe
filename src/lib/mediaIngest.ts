import path from "node:path";
import type { Ctx } from "./auth";
import { db } from "./db";
import { audit } from "./audit";
import { ALLOWED_UPLOADS, imageSize, mp4Duration, sniffMime } from "./storage";

export const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "application/pdf": "pdf" };
export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

/** Inspects the real bytes (type, dimensions, duration) and records the asset. `head`/`tail` are the start and end of the file. */
export async function recordAsset(ctx: Ctx, o: { key: string; filename: string; size: number; head: Buffer; tail?: Buffer; sha256: string; folderId?: string | null; campaignId?: string | null; tags?: string[] }) {
  const mime = sniffMime(o.head);
  if (!mime || !ALLOWED_UPLOADS[mime]) return { error: "Unsupported file. Upload JPEG, PNG, WEBP, GIF, MP4, MOV, WEBM or PDF." as const };
  const kind = ALLOWED_UPLOADS[mime];
  const dims = kind === "image" || kind === "gif" ? imageSize(o.head) : null;
  // MP4 keeps its duration in the moov atom, which can be at the start or the end of the file.
  const duration = kind === "video" && mime !== "video/webm" ? mp4Duration(o.head) ?? (o.tail ? mp4Duration(o.tail) : null) : null;
  if (o.folderId) await db.mediaFolder.findFirstOrThrow({ where: { id: o.folderId, workspaceId: ctx.workspace.id } });
  if (o.campaignId) await db.campaign.findFirstOrThrow({ where: { id: o.campaignId, workspaceId: ctx.workspace.id } });
  const asset = await db.mediaAsset.create({ data: {
    workspaceId: ctx.workspace.id, folderId: o.folderId || null, campaignId: o.campaignId || null, kind, filename: path.basename(o.filename).slice(0, 200) || `upload.${EXT[mime]}`,
    mimeType: mime, sizeBytes: o.size, width: dims?.width, height: dims?.height, durationSec: duration, storageKey: o.key, sha256: o.sha256, uploadedById: ctx.user.id,
    tags: (o.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean) } });
  await audit(ctx, "media.upload", { targetType: "media", targetId: asset.id, detail: { mime, size: o.size } });
  return { asset };
}
