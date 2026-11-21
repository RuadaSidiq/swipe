import fs from "node:fs/promises";
import { api, PlatformError } from "../http";
import type { Adapter, AdapterAccount } from "../types";

const tok = (a: AdapterAccount) => { if (!a.accessToken) throw new PlatformError("Missing access token", { auth: true }); return a.accessToken; };
const bearer = (a: AdapterAccount) => ({ Authorization: `Bearer ${tok(a)}` });
const day = () => { const end = new Date(); return { periodStart: new Date(end.getTime() - 86400_000), periodEnd: end }; };
const basic = (id?: string, secret?: string) => "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── X ──
export const x: Adapter = {
  async publish(acc, input) {
    if (input.media.length) throw new PlatformError("X: media upload isn't supported by this adapter yet");
    const text = input.link && !input.body.includes(input.link) ? `${input.body} ${input.link}`.trim() : input.body;
    const r = await api("https://api.x.com/2/tweets", { method: "POST", headers: bearer(acc), json: { text } }, "X");
    return { externalId: r.data.id, url: `https://x.com/${acc.meta.username ?? "i"}/status/${r.data.id}` };
  },
  async metrics(acc) {
    const r = await api("https://api.x.com/2/users/me?user.fields=public_metrics", { headers: bearer(acc) }, "X");
    return [{ metric: "followers", value: r.data.public_metrics.followers_count, ...day(), source: "X API v2 /users/me public_metrics" }];
  },
  async refresh(acc) {
    const r = await api("https://api.x.com/2/oauth2/token", { method: "POST", headers: { Authorization: basic(process.env.X_CLIENT_ID, process.env.X_CLIENT_SECRET) },
      form: { grant_type: "refresh_token", refresh_token: acc.refreshToken ?? "", client_id: process.env.X_CLIENT_ID ?? "" } }, "X");
    return { accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: new Date(Date.now() + r.expires_in * 1000) };
  },
};

// ── LinkedIn (Posts API) ──
const LI_VERSION = "202410";
const liHeaders = (a: AdapterAccount) => ({ ...bearer(a), "LinkedIn-Version": LI_VERSION, "X-Restli-Protocol-Version": "2.0.0" });
export const linkedin: Adapter = {
  async publish(acc, input) {
    const author = acc.accountType === "org" ? `urn:li:organization:${acc.externalId}` : `urn:li:person:${acc.externalId}`;
    const post: Record<string, any> = { author, commentary: input.body.replace(/[(){}\[\]<>@|~_*]/g, (c) => `\\${c}`), visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false };
    const img = input.media.find((m) => m.kind === "image");
    if (img) {
      const init = await api("https://api.linkedin.com/rest/images?action=initializeUpload", { method: "POST", headers: liHeaders(acc), json: { initializeUploadRequest: { owner: author } } }, "LinkedIn");
      const bytes = await fs.readFile(img.filePath);
      const up = await fetch(init.value.uploadUrl, { method: "PUT", headers: { ...bearer(acc), "Content-Type": img.mimeType }, body: bytes });
      if (!up.ok) throw new PlatformError(`LinkedIn: image upload failed (HTTP ${up.status})`, { retryable: up.status >= 500 });
      post.content = { media: { id: init.value.image, altText: img.altText || undefined } };
    } else if (input.link) post.content = { article: { source: input.link, title: input.title || input.link } };
    const res = await fetch("https://api.linkedin.com/rest/posts", { method: "POST", headers: { ...liHeaders(acc), "Content-Type": "application/json" }, body: JSON.stringify(post) });
    if (!res.ok) {
      const body = await res.text();
      throw new PlatformError(`LinkedIn: ${body.slice(0, 300)} (HTTP ${res.status})`, { status: res.status, auth: res.status === 401, retryable: res.status >= 500 || res.status === 429 });
    }
    const id = res.headers.get("x-restli-id") ?? "";
    return { externalId: id, url: `https://www.linkedin.com/feed/update/${id}` };
  },
  async refresh(acc) {
    if (!acc.refreshToken) throw new PlatformError("LinkedIn token expired; reconnect the account", { auth: true });
    const r = await api("https://www.linkedin.com/oauth/v2/accessToken", { method: "POST", form: { grant_type: "refresh_token", refresh_token: acc.refreshToken,
      client_id: process.env.LINKEDIN_CLIENT_ID ?? "", client_secret: process.env.LINKEDIN_CLIENT_SECRET ?? "" } }, "LinkedIn");
    return { accessToken: r.access_token, refreshToken: r.refresh_token ?? acc.refreshToken, expiresAt: new Date(Date.now() + r.expires_in * 1000) };
  },
};

// ── YouTube (resumable upload) ──
export const youtube: Adapter = {
  async publish(acc, input) {
    const video = input.media.find((m) => m.kind === "video");
    if (!video) throw new PlatformError("YouTube requires a video");
    const meta = { snippet: { title: (input.title || input.body.split("\n")[0] || "Untitled").slice(0, 100), description: input.body.slice(0, 5000), categoryId: "22" },
      status: { privacyStatus: input.options.visibility ?? "private", selfDeclaredMadeForKids: false } };
    const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST", headers: { ...bearer(acc), "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": video.mimeType, "X-Upload-Content-Length": String(video.sizeBytes) },
      body: JSON.stringify(meta) });
    if (!init.ok) throw new PlatformError(`YouTube: ${(await init.text()).slice(0, 300)} (HTTP ${init.status})`, { status: init.status, auth: init.status === 401, retryable: init.status >= 500 });
    const location = init.headers.get("location");
    if (!location) throw new PlatformError("YouTube: no upload URL returned", { retryable: true });
    const bytes = await fs.readFile(video.filePath);
    const up = await fetch(location, { method: "PUT", headers: { "Content-Type": video.mimeType }, body: bytes, signal: AbortSignal.timeout(30 * 60_000) });
    const body = await up.json().catch(() => ({}));
    if (!up.ok) throw new PlatformError(`YouTube: upload failed (HTTP ${up.status})`, { retryable: up.status >= 500 });
    return { externalId: body.id, url: `https://youtu.be/${body.id}` };
  },
  async metrics(acc) {
    const r = await api("https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true", { headers: bearer(acc) }, "YouTube");
    const s = r.items?.[0]?.statistics ?? {}; const p = day(); const src = "YouTube Data API v3 channels.statistics (lifetime totals)";
    return [{ metric: "followers", value: Number(s.subscriberCount ?? 0), ...p, source: src }, { metric: "views", value: Number(s.viewCount ?? 0), ...p, source: src }];
  },
  async refresh(acc) {
    const r = await api("https://oauth2.googleapis.com/token", { method: "POST", form: { grant_type: "refresh_token", refresh_token: acc.refreshToken ?? "",
      client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "" } }, "Google");
    return { accessToken: r.access_token, refreshToken: acc.refreshToken, expiresAt: new Date(Date.now() + r.expires_in * 1000) };
  },
};

// ── TikTok Content Posting API ──
export const tiktok: Adapter = {
  async publish(acc, input) {
    const video = input.media.find((m) => m.kind === "video");
    if (!video) throw new PlatformError("TikTok requires a video");
    const r = await api("https://open.tiktokapis.com/v2/post/publish/video/init/", { method: "POST", headers: bearer(acc), json: {
      post_info: { title: input.body.slice(0, 2200), privacy_level: input.options.privacy ?? "SELF_ONLY", disable_comment: false, disable_duet: false, disable_stitch: false },
      source_info: { source: "PULL_FROM_URL", video_url: video.publicUrl } } }, "TikTok");
    const publishId = r.data?.publish_id;
    for (let i = 0; i < 30; i++) {
      await sleep(5000);
      const s = await api("https://open.tiktokapis.com/v2/post/publish/status/fetch/", { method: "POST", headers: bearer(acc), json: { publish_id: publishId } }, "TikTok");
      const st = s.data?.status;
      if (st === "PUBLISH_COMPLETE") return { externalId: s.data?.publicaly_available_post_id?.[0] ?? publishId };
      if (st === "FAILED") throw new PlatformError(`TikTok: ${s.data?.fail_reason ?? "publish failed"}`);
    }
    return { externalId: publishId, raw: { note: "Still processing on TikTok" } };
  },
  async metrics(acc) {
    const r = await api("https://open.tiktokapis.com/v2/user/info/?fields=follower_count,likes_count,video_count", { headers: bearer(acc) }, "TikTok");
    const u = r.data?.user ?? {}; const p = day(); const src = "TikTok Display API /v2/user/info (lifetime totals)";
    return [{ metric: "followers", value: u.follower_count ?? 0, ...p, source: src }, { metric: "likes", value: u.likes_count ?? 0, ...p, source: src }];
  },
  async refresh(acc) {
    const r = await api("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", form: { client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
      client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "", grant_type: "refresh_token", refresh_token: acc.refreshToken ?? "" } }, "TikTok");
    return { accessToken: r.access_token, refreshToken: r.refresh_token, expiresAt: new Date(Date.now() + r.expires_in * 1000), refreshExpiresAt: new Date(Date.now() + r.refresh_expires_in * 1000) };
  },
};

// ── Pinterest ──
export const pinterest: Adapter = {
  async publish(acc, input) {
    const img = input.media.find((m) => m.kind !== "video");
    if (!img) throw new PlatformError("Pinterest requires an image");
    const r = await api("https://api.pinterest.com/v5/pins", { method: "POST", headers: bearer(acc), json: {
      board_id: input.options.boardId, title: (input.title ?? "").slice(0, 100) || undefined, description: input.body.slice(0, 500), link: input.link || undefined,
      alt_text: img.altText || undefined, media_source: { source_type: "image_url", url: img.publicUrl } } }, "Pinterest");
    return { externalId: r.id, url: `https://www.pinterest.com/pin/${r.id}/` };
  },
  async metrics(acc) {
    const r = await api("https://api.pinterest.com/v5/user_account", { headers: bearer(acc) }, "Pinterest");
    return [{ metric: "followers", value: r.follower_count ?? 0, ...day(), source: "Pinterest API v5 /user_account" }];
  },
  async refresh(acc) {
    const r = await api("https://api.pinterest.com/v5/oauth/token", { method: "POST", headers: { Authorization: basic(process.env.PINTEREST_CLIENT_ID, process.env.PINTEREST_CLIENT_SECRET) },
      form: { grant_type: "refresh_token", refresh_token: acc.refreshToken ?? "" } }, "Pinterest");
    return { accessToken: r.access_token, refreshToken: r.refresh_token ?? acc.refreshToken, expiresAt: new Date(Date.now() + r.expires_in * 1000) };
  },
};

// ── Reddit ──
const redditUA = () => process.env.REDDIT_USER_AGENT || "web:orbit:0.1";
export const reddit: Adapter = {
  async publish(acc, input) {
    const sr = String(input.options.subreddit ?? "").replace(/^r\//, "");
    const form: Record<string, string> = { sr, title: (input.title ?? "").slice(0, 300), api_type: "json", resubmit: "true" };
    if (input.link) { form.kind = "link"; form.url = input.link; } else { form.kind = "self"; form.text = input.body; }
    const r = await api("https://oauth.reddit.com/api/submit", { method: "POST", headers: { ...bearer(acc), "User-Agent": redditUA() }, form }, "Reddit");
    const errs = r.json?.errors;
    if (errs?.length) throw new PlatformError(`Reddit: ${errs.map((e: string[]) => e.join(" ")).join("; ")}`);
    return { externalId: r.json.data.name, url: r.json.data.url };
  },
  async metrics(acc) {
    const r = await api("https://oauth.reddit.com/api/v1/me", { headers: { ...bearer(acc), "User-Agent": redditUA() } }, "Reddit");
    return [{ metric: "karma", value: r.total_karma ?? 0, ...day(), source: "Reddit API /api/v1/me total_karma" }];
  },
  async refresh(acc) {
    const r = await api("https://www.reddit.com/api/v1/access_token", { method: "POST", headers: { Authorization: basic(process.env.REDDIT_CLIENT_ID, process.env.REDDIT_CLIENT_SECRET), "User-Agent": redditUA() },
      form: { grant_type: "refresh_token", refresh_token: acc.refreshToken ?? "" } }, "Reddit");
    return { accessToken: r.access_token, refreshToken: acc.refreshToken, expiresAt: new Date(Date.now() + r.expires_in * 1000) };
  },
};

// ── Telegram Bot API ──
const tg = (a: AdapterAccount, method: string) => `https://api.telegram.org/bot${tok(a)}/${method}`;
export const telegram: Adapter = {
  async publish(acc, input) {
    const chat_id = acc.meta.chatId;
    const text = input.link && !input.body.includes(input.link) ? `${input.body}\n\n${input.link}`.trim() : input.body;
    let r: any;
    if (input.media.length === 0) r = await api(tg(acc, "sendMessage"), { method: "POST", json: { chat_id, text } }, "Telegram");
    else if (input.media.length === 1) {
      const m = input.media[0]; const isVid = m.kind === "video";
      const fd = new FormData();
      fd.set("chat_id", String(chat_id)); fd.set("caption", text.slice(0, 1024));
      fd.set(isVid ? "video" : "photo", new Blob([await fs.readFile(m.filePath)], { type: m.mimeType }), "upload");
      r = await api(tg(acc, isVid ? "sendVideo" : "sendPhoto"), { method: "POST", body: fd, timeoutMs: 120_000 }, "Telegram");
    } else {
      const fd = new FormData(); fd.set("chat_id", String(chat_id));
      const media = await Promise.all(input.media.map(async (m, i) => {
        fd.set(`f${i}`, new Blob([await fs.readFile(m.filePath)], { type: m.mimeType }), `f${i}`);
        return { type: m.kind === "video" ? "video" : "photo", media: `attach://f${i}`, ...(i === 0 ? { caption: text.slice(0, 1024) } : {}) };
      }));
      fd.set("media", JSON.stringify(media));
      r = await api(tg(acc, "sendMediaGroup"), { method: "POST", body: fd, timeoutMs: 120_000 }, "Telegram");
    }
    const msg = Array.isArray(r.result) ? r.result[0] : r.result;
    const uname = acc.meta.chatUsername as string | undefined;
    return { externalId: String(msg.message_id), url: uname ? `https://t.me/${uname}/${msg.message_id}` : undefined };
  },
  async reply(acc, input) {
    const r = await api(tg(acc, "sendMessage"), { method: "POST", json: { chat_id: input.recipientId ?? input.externalThreadId, text: input.body,
      ...(input.replyToExternalId ? { reply_parameters: { message_id: Number(input.replyToExternalId), allow_sending_without_reply: true } } : {}) } }, "Telegram");
    return { externalId: String(r.result.message_id) };
  },
  async metrics(acc) {
    const r = await api(tg(acc, `getChatMemberCount?chat_id=${encodeURIComponent(acc.meta.chatId)}`), {}, "Telegram");
    return [{ metric: "followers", value: r.result, ...day(), source: "Telegram Bot API getChatMemberCount" }];
  },
};
