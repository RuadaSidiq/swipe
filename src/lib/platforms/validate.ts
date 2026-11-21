import { platform, type PlatformId } from "./registry";

export interface MediaInfo { id: string; kind: string; mimeType: string; sizeBytes: number; durationSec?: number | null; width?: number | null; height?: number | null; altText?: string }
export interface DraftVersion { body: string; title?: string | null; link?: string | null; media: MediaInfo[]; options?: Record<string, unknown> }
export interface Issue { level: "error" | "warning"; message: string }

/** X counts every URL as 23 chars. */
export function countChars(platformId: PlatformId, text: string) {
  if (platformId === "x") return text.replace(/https?:\/\/\S+/g, "x".repeat(23)).length;
  return [...text].length;
}

export function validateVersion(platformId: PlatformId, v: DraftVersion): Issue[] {
  const p = platform(platformId);
  const L = p.limits;
  const out: Issue[] = [];
  const err = (message: string) => out.push({ level: "error", message });
  const warn = (message: string) => out.push({ level: "warning", message });
  const images = v.media.filter((m) => m.kind === "image" || m.kind === "gif");
  const videos = v.media.filter((m) => m.kind === "video");
  const text = [v.body, p.id === "facebook" || p.id === "linkedin" || p.id === "pinterest" ? "" : v.link && !v.body.includes(v.link) ? v.link : ""].filter(Boolean).join(" ");

  if (p.caps.publishText.status === "unavailable" && p.caps.publishImage.status === "unavailable" && p.caps.publishVideo.status === "unavailable")
    err(`${p.name}: publishing isn't available. ${p.caps.publishVideo.note ?? p.caps.publishText.note ?? ""}`);

  const len = countChars(platformId, text);
  const limit = p.id === "telegram" && v.media.length > 0 ? 1024 : L.text;
  if (len > limit) err(`${p.name}: text is ${len} characters; the limit is ${limit}.`);
  if (!v.body.trim() && v.media.length === 0 && !v.link) err(`${p.name}: add some text, media or a link.`);

  if (L.hashtags) { const n = (v.body.match(/#[\p{L}\p{N}_]+/gu) ?? []).length; if (n > L.hashtags) err(`${p.name}: ${n} hashtags; the maximum is ${L.hashtags}.`); }
  if (L.title) {
    const t = (v.title ?? "").trim();
    if ((p.id === "youtube" || p.id === "reddit") && !t) err(`${p.name}: a title is required.`);
    if (t.length > L.title) err(`${p.name}: title is ${t.length} characters; the limit is ${L.title}.`);
  }
  if (L.requiresMedia && v.media.length === 0) err(`${p.name}: at least one ${L.images ? "image or video" : "video"} is required.`);
  if (images.length && p.caps.publishImage.status === "unavailable") err(`${p.name}: images can't be published. ${p.caps.publishImage.note ?? ""}`);
  if (videos.length && p.caps.publishVideo.status === "unavailable") err(`${p.name}: video can't be published. ${p.caps.publishVideo.note ?? ""}`);
  if (images.length > 1 && p.caps.publishMulti.status === "unavailable") err(`${p.name}: only one image per post. ${p.caps.publishMulti.note ?? ""}`);
  if (images.length > L.images && L.images > 0) err(`${p.name}: ${images.length} images; the maximum is ${L.images}.`);
  if (videos.length > Math.max(L.videos, 0) && L.videos >= 0 && p.caps.publishVideo.status !== "unavailable") err(`${p.name}: only ${L.videos} video per post.`);
  if (!L.mixedMedia && images.length && videos.length) err(`${p.name}: can't mix images and video in one post.`);

  for (const m of v.media) {
    const isVid = m.kind === "video";
    const allowed = isVid ? L.videoTypes : L.imageTypes;
    if (allowed.length && !allowed.includes(m.mimeType)) err(`${p.name}: ${m.mimeType} isn't accepted (use ${allowed.map((t) => t.split("/")[1]).join(", ")}).`);
    const maxMb = isVid ? L.maxVideoMb : L.maxImageMb;
    if (maxMb && m.sizeBytes > maxMb * 1e6) err(`${p.name}: a file is ${(m.sizeBytes / 1e6).toFixed(1)} MB; the limit is ${maxMb} MB.`);
    if (isVid && m.durationSec) {
      if (L.maxVideoSec && m.durationSec > L.maxVideoSec) err(`${p.name}: video is ${Math.round(m.durationSec)}s; the limit is ${L.maxVideoSec}s.`);
      if (L.minVideoSec && m.durationSec < L.minVideoSec) err(`${p.name}: video must be at least ${L.minVideoSec}s.`);
    }
    if (!isVid && p.id === "instagram" && m.width && m.height) {
      const r = m.width / m.height;
      if (r < 0.8 || r > 1.91) err(`Instagram: image aspect ratio ${r.toFixed(2)} is outside 4:5–1.91:1. Crop it before publishing.`);
    }
    if (!isVid && !m.altText && p.caps.altText.status !== "unavailable") warn(`${p.name}: an image has no alt text.`);
  }
  if (p.id === "pinterest" && !v.options?.boardId) err("Pinterest: choose a board.");
  if (p.id === "reddit" && !v.options?.subreddit) err("Reddit: choose a subreddit.");
  if (p.id === "tiktok") warn("TikTok: posts are private (SELF_ONLY) until your TikTok app passes audit.");
  if (p.id === "x" && v.media.length) err("X: Orbit's X adapter publishes text only for now. Remove the media for this destination.");
  if (p.id === "linkedin" && /#\w+/.test(v.body) && (v.body.match(/#/g) ?? []).length > 5) warn("LinkedIn: more than 5 hashtags tends to reduce reach.");
  return out;
}
