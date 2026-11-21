import fs from "node:fs/promises";
import path from "node:path";
import { hmac, safeEqual } from "./crypto";
import { env } from "./env";

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage. Uses S3-compatible storage (AWS S3, Cloudflare R2, MinIO…) when S3_BUCKET is set,
 * otherwise local disk (single-instance / development only).
 */
const ROOT = path.resolve(process.env.STORAGE_DIR ?? "./storage");
export const usesS3 = () => Boolean(process.env.S3_BUCKET);
let s3c: S3Client | null = null;
const s3 = () => (s3c ??= new S3Client({
  region: process.env.S3_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT || undefined, // e.g. https://<account>.r2.cloudflarestorage.com
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: process.env.S3_ACCESS_KEY_ID ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" } : undefined,
}));
const bucket = () => process.env.S3_BUCKET!;

export const storagePath = (key: string) => {
  const p = path.resolve(ROOT, key);
  if (!p.startsWith(ROOT + path.sep)) throw new Error("Invalid storage key");
  return p;
};
export async function putObject(key: string, data: Buffer, contentType?: string) {
  if (usesS3()) { await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: data, ContentType: contentType })); return; }
  const p = storagePath(key);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, data);
}
export async function getObject(key: string): Promise<Buffer> {
  if (usesS3()) {
    const r = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  return fs.readFile(storagePath(key));
}
export async function deleteObject(key: string) {
  if (usesS3()) { await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key })); return; }
  await fs.rm(storagePath(key), { force: true });
}
/** Presigned PUT so browsers upload straight to the bucket (bypasses serverless request-size limits). */
export async function presignedPut(key: string, contentType: string, ttlSec = 900) {
  return getSignedUrl(s3(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }), { expiresIn: ttlSec });
}
export async function headObject(key: string) {
  const h = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  return { size: Number(h.ContentLength ?? 0), etag: (h.ETag ?? "").replace(/"/g, "") };
}
/** Byte range of an object (inclusive end), used to inspect large uploads without downloading them. */
export async function getRange(key: string, start: number, end: number): Promise<Buffer> {
  const r = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: `bytes=${start}-${end}` }));
  return Buffer.from(await r.Body!.transformToByteArray());
}

/** Short-lived direct URL to the object (S3 only). */
export async function presignedGet(key: string, ttlSec = 3600) {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn: ttlSec });
}

/** Time-limited signed URL so social networks (Instagram, Threads, TikTok, Pinterest) can fetch media. */
export function signedMediaUrl(assetId: string, ttlSec = 6 * 3600) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  return `${env.appUrl}/api/media/public/${assetId}?exp=${exp}&sig=${hmac(`${assetId}.${exp}`)}`;
}
/** URL a network will download from. TikTok PULL_FROM_URL requires a verified domain, so prefer APP_URL (or MEDIA_PUBLIC_BASE_URL). */
export async function publicMediaUrl(assetId: string, key: string) {
  if (process.env.MEDIA_PUBLIC_BASE_URL) return `${process.env.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  return signedMediaUrl(assetId);
}
export function verifyMediaSig(assetId: string, exp: string, sig: string) {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(hmac(`${assetId}.${exp}`), sig);
}

export const ALLOWED_UPLOADS: Record<string, string> = {
  "image/jpeg": "image", "image/png": "image", "image/webp": "image", "image/gif": "gif",
  "video/mp4": "video", "video/quicktime": "video", "video/webm": "video", "application/pdf": "document",
};

/** Verify the real file type from magic bytes rather than trusting the browser-provided MIME. */
export function sniffMime(buf: Buffer): string | null {
  const h = buf.subarray(0, 16);
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return "image/jpeg";
  if (h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (h.subarray(0, 4).toString() === "RIFF" && h.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (h.subarray(0, 3).toString() === "GIF") return "image/gif";
  if (h.subarray(0, 4).toString() === "%PDF") return "application/pdf";
  if (h.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return "video/webm";
  if (h.subarray(4, 8).toString() === "ftyp") return h.subarray(8, 10).toString() === "qt" ? "video/quicktime" : "video/mp4";
  return null;
}

/** Reads width/height from PNG / JPEG / GIF / WEBP headers. */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  try {
    if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (buf.toString("ascii", 0, 3) === "GIF") return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    if (buf.toString("ascii", 0, 4) === "RIFF") {
      const fmt = buf.toString("ascii", 12, 16);
      if (fmt === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      if (fmt === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      if (fmt === "VP8L") { const b = buf.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) return null;
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        i += 2 + len;
      }
    }
  } catch { /* fallthrough */ }
  return null;
}

/** MP4/MOV duration from the mvhd atom (no ffmpeg dependency). */
export function mp4Duration(buf: Buffer): number | null {
  const idx = buf.indexOf("mvhd");
  if (idx < 0) return null;
  const v = buf[idx + 4];
  const scale = v === 1 ? buf.readUInt32BE(idx + 24) : buf.readUInt32BE(idx + 16);
  const dur = v === 1 ? Number(buf.readBigUInt64BE(idx + 28)) : buf.readUInt32BE(idx + 20);
  return scale ? dur / scale : null;
}
