/**
 * Single source of truth for what Orbit can do on each network.
 * `status` values are shown verbatim in the UI so users never see a feature that silently doesn't work.
 *   implemented — wired to the official API in this codebase
 *   limited     — works, with restrictions spelled out in `note`
 *   unavailable — the network's API doesn't offer it, or Orbit hasn't built it yet (see note)
 */
export type PlatformId =
  | "instagram" | "facebook" | "tiktok" | "linkedin" | "youtube" | "x"
  | "pinterest" | "threads" | "snapchat" | "reddit" | "whatsapp" | "telegram";

export type CapStatus = "implemented" | "limited" | "unavailable";
export interface Cap { status: CapStatus; note?: string }

export interface PlatformDef {
  id: PlatformId;
  name: string;
  color: string;
  short: string;
  connect: "oauth" | "bot_token" | "system_user_token";
  /** env vars that must be present for connecting to be possible */
  requiredEnv: string[];
  accessNote?: string;
  limits: {
    text: number;           // max post text / caption characters
    title?: number;
    hashtags?: number;
    images: number;         // max images in one post (0 = none)
    videos: number;         // max videos (0 = none)
    mixedMedia: boolean;
    requiresMedia: boolean;
    imageTypes: string[];
    videoTypes: string[];
    maxImageMb: number;
    maxVideoMb: number;
    maxVideoSec?: number;
    minVideoSec?: number;
  };
  fields: Array<"title" | "link" | "board" | "subreddit" | "visibility" | "privacy" | "chatId" | "firstComment" | "thumbnail">;
  caps: {
    publishText: Cap; publishImage: Cap; publishMulti: Cap; publishVideo: Cap; publishLink: Cap;
    schedule: Cap; dms: Cap; comments: Cap; mentions: Cap; analytics: Cap; altText: Cap;
  };
}

const IMG = ["image/jpeg", "image/png"];
const IMGW = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VID = ["video/mp4", "video/quicktime"];
const S = (status: CapStatus, note?: string): Cap => ({ status, note });
const NO = (note: string) => S("unavailable", note);

export const PLATFORMS: Record<PlatformId, PlatformDef> = {
  instagram: {
    id: "instagram", name: "Instagram", color: "#E1306C", short: "IG", connect: "oauth", requiredEnv: ["META_APP_ID", "META_APP_SECRET"],
    accessNote: "Requires an Instagram Professional (Business or Creator) account linked to a Facebook Page. Personal accounts can't be managed through Meta's API.",
    limits: { text: 2200, hashtags: 30, images: 10, videos: 1, mixedMedia: true, requiresMedia: true, imageTypes: ["image/jpeg"], videoTypes: VID, maxImageMb: 8, maxVideoMb: 300, maxVideoSec: 900, minVideoSec: 3 },
    fields: ["firstComment"],
    caps: {
      publishText: NO("Instagram posts require at least one image or video."),
      publishImage: S("implemented", "JPEG only. Orbit serves media via signed URLs, so APP_URL must be publicly reachable."),
      publishMulti: S("implemented", "Carousels of up to 10 items."),
      publishVideo: S("implemented", "Published as a Reel."),
      publishLink: NO("Links in captions aren't clickable on Instagram."),
      schedule: S("implemented", "Orbit schedules and publishes at the chosen time."),
      dms: S("implemented", "Via Meta webhooks. Replies must be sent within Meta's 24-hour messaging window."),
      comments: S("implemented", "Via Meta webhooks; reply to comments from the inbox."),
      mentions: S("limited", "Caption @mentions arrive via webhook; story mentions aren't supported."),
      analytics: S("implemented", "Followers and media insights from the Instagram Graph API."),
      altText: S("limited", "Alt text is supported for single images only."),
    },
  },
  facebook: {
    id: "facebook", name: "Facebook", color: "#1877F2", short: "FB", connect: "oauth", requiredEnv: ["META_APP_ID", "META_APP_SECRET"],
    accessNote: "Manages Facebook Pages you administer. Posting to personal profiles and Groups isn't permitted by Meta's API.",
    limits: { text: 63206, images: 10, videos: 1, mixedMedia: false, requiresMedia: false, imageTypes: IMGW, videoTypes: VID, maxImageMb: 10, maxVideoMb: 1024 },
    fields: ["link"],
    caps: {
      publishText: S("implemented"), publishImage: S("implemented"), publishMulti: S("implemented", "Uploaded as unpublished photos, then attached to one post."),
      publishVideo: S("implemented"), publishLink: S("implemented"), schedule: S("implemented"),
      dms: S("implemented", "Messenger via webhooks, subject to the 24-hour messaging window."),
      comments: S("implemented", "Page post comments via webhooks."), mentions: S("limited", "Page mentions via webhook."),
      analytics: S("implemented", "Page followers and post insights."), altText: NO("Not exposed by the Pages API for feed photos."),
    },
  },
  tiktok: {
    id: "tiktok", name: "TikTok", color: "#000000", short: "TT", connect: "oauth", requiredEnv: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    accessNote: "Uses TikTok's Content Posting API. Until your app passes TikTok's audit, posts are restricted to private (SELF_ONLY) visibility. Media URLs must be on a domain verified with TikTok.",
    limits: { text: 2200, images: 0, videos: 1, mixedMedia: false, requiresMedia: true, imageTypes: [], videoTypes: VID, maxImageMb: 0, maxVideoMb: 4096, maxVideoSec: 600, minVideoSec: 3 },
    fields: ["privacy"],
    caps: {
      publishText: NO("TikTok requires a video."), publishImage: NO("Photo posts aren't supported by Orbit's TikTok adapter yet."),
      publishMulti: NO("Photo carousels aren't supported by Orbit's TikTok adapter yet."), publishVideo: S("limited", "Direct post via PULL_FROM_URL. Private-only until your app is audited."),
      publishLink: NO("Not supported by TikTok."), schedule: S("implemented", "Orbit schedules and publishes at the chosen time."),
      dms: NO("TikTok doesn't offer a DM API to third parties."), comments: NO("TikTok's comment API isn't generally available to third-party apps."),
      mentions: NO("Not available via API."), analytics: S("implemented", "Follower and video counts from the Display API."), altText: NO("Not supported."),
    },
  },
  linkedin: {
    id: "linkedin", name: "LinkedIn", color: "#0A66C2", short: "IN", connect: "oauth", requiredEnv: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    accessNote: "Personal profiles use 'Share on LinkedIn'. Company pages require LinkedIn's Community Management API approval for your app.",
    limits: { text: 3000, images: 1, videos: 0, mixedMedia: false, requiresMedia: false, imageTypes: IMG, videoTypes: [], maxImageMb: 8, maxVideoMb: 0 },
    fields: ["link"],
    caps: {
      publishText: S("implemented"), publishImage: S("implemented", "One image per post."), publishMulti: NO("Multi-image posts aren't supported by Orbit's LinkedIn adapter yet."),
      publishVideo: NO("Video upload isn't supported by Orbit's LinkedIn adapter yet."), publishLink: S("implemented", "Shared as an article."),
      schedule: S("implemented", "Orbit schedules and publishes at the chosen time."),
      dms: NO("LinkedIn doesn't provide a messaging API to third parties."),
      comments: S("limited", "Requires Community Management API approval; not ingested yet."), mentions: NO("Not available without partner access."),
      analytics: S("limited", "Profile analytics need partner access; only connection status is shown for member profiles."), altText: S("implemented"),
    },
  },
  youtube: {
    id: "youtube", name: "YouTube", color: "#FF0000", short: "YT", connect: "oauth", requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    accessNote: "Videos uploaded by unverified Google API projects are locked to private until your project passes Google's audit.",
    limits: { text: 5000, title: 100, images: 0, videos: 1, mixedMedia: false, requiresMedia: true, imageTypes: [], videoTypes: [...VID, "video/webm"], maxImageMb: 2, maxVideoMb: 10240 },
    fields: ["title", "visibility", "thumbnail"],
    caps: {
      publishText: NO("YouTube Community posts aren't available via API."), publishImage: NO("YouTube requires a video."), publishMulti: NO("Not supported."),
      publishVideo: S("implemented", "Resumable upload with title, description and visibility. Shorts are vertical videos under 3 minutes."),
      publishLink: NO("Add links to the description instead."), schedule: S("implemented", "Orbit uploads at the chosen time."),
      dms: NO("YouTube has no messaging."), comments: S("limited", "Comment ingestion is polled; not yet built."), mentions: NO("Not available via API."),
      analytics: S("implemented", "Subscribers and views from the Data API."), altText: NO("Not applicable."),
    },
  },
  x: {
    id: "x", name: "X (Twitter)", color: "#111111", short: "X", connect: "oauth", requiredEnv: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
    accessNote: "Posting requires an X API plan that includes write access. Read endpoints (mentions, metrics) need a paid tier.",
    limits: { text: 280, images: 4, videos: 1, mixedMedia: false, requiresMedia: false, imageTypes: IMGW, videoTypes: ["video/mp4"], maxImageMb: 5, maxVideoMb: 512, maxVideoSec: 140 },
    fields: [],
    caps: {
      publishText: S("implemented"), publishImage: NO("Media upload isn't supported by Orbit's X adapter yet. Text posts only."),
      publishMulti: NO("Not yet supported by Orbit's X adapter."), publishVideo: NO("Not yet supported by Orbit's X adapter."),
      publishLink: S("implemented", "Links count as 23 characters."), schedule: S("implemented", "Orbit schedules and publishes at the chosen time."),
      dms: S("limited", "Requires a paid X API tier; not ingested yet."), comments: S("limited", "Replies/mentions need a paid X API tier; not ingested yet."),
      mentions: S("limited", "Needs a paid X API tier."), analytics: S("implemented", "Follower counts from users/me (public_metrics)."), altText: NO("Requires media upload."),
    },
  },
  pinterest: {
    id: "pinterest", name: "Pinterest", color: "#E60023", short: "PI", connect: "oauth", requiredEnv: ["PINTEREST_CLIENT_ID", "PINTEREST_CLIENT_SECRET"],
    limits: { text: 500, title: 100, images: 1, videos: 0, mixedMedia: false, requiresMedia: true, imageTypes: IMGW, videoTypes: [], maxImageMb: 20, maxVideoMb: 0 },
    fields: ["title", "link", "board"],
    caps: {
      publishText: NO("Pins need an image."), publishImage: S("implemented", "Image pins to a chosen board, with title, description and destination link."),
      publishMulti: NO("Carousel pins aren't supported by Orbit's adapter yet."), publishVideo: NO("Video pins aren't supported by Orbit's adapter yet."),
      publishLink: S("implemented", "As the pin's destination link."), schedule: S("implemented", "Orbit schedules and publishes at the chosen time."),
      dms: NO("No messaging API."), comments: NO("No comment API."), mentions: NO("Not applicable."),
      analytics: S("implemented", "Follower count from user_account."), altText: S("implemented"),
    },
  },
  threads: {
    id: "threads", name: "Threads", color: "#101010", short: "TH", connect: "oauth", requiredEnv: ["META_APP_ID", "META_APP_SECRET"],
    limits: { text: 500, images: 10, videos: 1, mixedMedia: true, requiresMedia: false, imageTypes: IMG, videoTypes: VID, maxImageMb: 8, maxVideoMb: 1024, maxVideoSec: 300 },
    fields: [],
    caps: {
      publishText: S("implemented"), publishImage: S("implemented"), publishMulti: S("implemented", "Carousels of up to 10 items."), publishVideo: S("implemented"),
      publishLink: S("implemented", "Links in text generate a preview."), schedule: S("implemented", "Orbit schedules and publishes at the chosen time."),
      dms: NO("Threads has no messaging API."), comments: S("limited", "Reply ingestion requires the threads_read_replies permission; not ingested yet."),
      mentions: S("limited", "Not ingested yet."), analytics: S("implemented", "Followers from the Threads Insights API."), altText: NO("Not exposed by the Threads API."),
    },
  },
  snapchat: {
    id: "snapchat", name: "Snapchat", color: "#FFFC00", short: "SC", connect: "oauth", requiredEnv: ["SNAPCHAT_CLIENT_ID", "SNAPCHAT_CLIENT_SECRET"],
    accessNote: "Snapchat's Public Profile publishing API is available only to approved Snap partners. Orbit can't publish to Snapchat until your organisation is approved.",
    limits: { text: 250, images: 1, videos: 1, mixedMedia: false, requiresMedia: true, imageTypes: IMG, videoTypes: ["video/mp4"], maxImageMb: 5, maxVideoMb: 300, maxVideoSec: 60 },
    fields: [],
    caps: {
      publishText: NO("Snapchat requires media."), publishImage: NO("Partner-only API; not available."), publishMulti: NO("Not available."),
      publishVideo: NO("Partner-only API; not available."), publishLink: NO("Not available."), schedule: NO("Not available."),
      dms: NO("No messaging API."), comments: NO("No comment API."), mentions: NO("Not available."), analytics: NO("Partner-only."), altText: NO("Not available."),
    },
  },
  reddit: {
    id: "reddit", name: "Reddit", color: "#FF4500", short: "RD", connect: "oauth", requiredEnv: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET"],
    accessNote: "Every post goes to a specific subreddit and must follow that community's rules. Commercial use of the Reddit API needs Reddit's approval.",
    limits: { text: 40000, title: 300, images: 0, videos: 0, mixedMedia: false, requiresMedia: false, imageTypes: [], videoTypes: [], maxImageMb: 0, maxVideoMb: 0 },
    fields: ["title", "subreddit", "link"],
    caps: {
      publishText: S("implemented", "Self (text) posts to a subreddit."), publishImage: NO("Native image upload isn't supported by Orbit's adapter yet; share a link instead."),
      publishMulti: NO("Not supported."), publishVideo: NO("Not supported."), publishLink: S("implemented", "Link posts to a subreddit."),
      schedule: S("implemented", "Orbit schedules and publishes at the chosen time."),
      dms: S("limited", "Private messages aren't ingested yet."), comments: S("limited", "Comment ingestion isn't built yet."), mentions: S("limited", "Not ingested yet."),
      analytics: S("limited", "Karma only; Reddit doesn't expose post reach."), altText: NO("Not applicable."),
    },
  },
  whatsapp: {
    id: "whatsapp", name: "WhatsApp Business", color: "#25D366", short: "WA", connect: "system_user_token", requiredEnv: ["META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN"],
    accessNote: "Uses the WhatsApp Business Cloud API. Connect with a System User access token and your phone number ID. WhatsApp is a messaging channel, so there's no public feed to publish to.",
    limits: { text: 4096, images: 1, videos: 0, mixedMedia: false, requiresMedia: false, imageTypes: IMG, videoTypes: [], maxImageMb: 5, maxVideoMb: 0 },
    fields: [],
    caps: {
      publishText: NO("WhatsApp has no public feed. Broadcasts require pre-approved templates sent to opted-in contacts, which Orbit doesn't support yet."),
      publishImage: NO("No public feed."), publishMulti: NO("No public feed."), publishVideo: NO("No public feed."), publishLink: NO("No public feed."), schedule: NO("No public feed."),
      dms: S("implemented", "Inbound messages via webhook; free-form replies within the 24-hour customer service window."),
      comments: NO("Not applicable."), mentions: NO("Not applicable."), analytics: NO("Conversation analytics aren't built yet."), altText: NO("Not applicable."),
    },
  },
  telegram: {
    id: "telegram", name: "Telegram", color: "#229ED9", short: "TG", connect: "bot_token", requiredEnv: [],
    accessNote: "Create a bot with @BotFather, add it as an admin of your channel, then connect it here with the bot token and channel username or ID.",
    limits: { text: 4096, images: 10, videos: 1, mixedMedia: true, requiresMedia: false, imageTypes: IMGW, videoTypes: ["video/mp4"], maxImageMb: 10, maxVideoMb: 50 },
    fields: [],
    caps: {
      publishText: S("implemented"), publishImage: S("implemented", "Captions are limited to 1,024 characters."), publishMulti: S("implemented", "Sent as a media group (album)."),
      publishVideo: S("implemented", "Up to 50 MB through the Bot API."), publishLink: S("implemented"), schedule: S("implemented", "Orbit schedules and publishes at the chosen time."),
      dms: S("implemented", "Messages sent to your bot arrive via webhook."), comments: S("limited", "Channel comments arrive only if a linked discussion group includes the bot."),
      mentions: NO("Not applicable."), analytics: S("implemented", "Subscriber count via getChatMemberCount."), altText: NO("Not supported by Telegram."),
    },
  },
};

export const PLATFORM_LIST = Object.values(PLATFORMS);
export const platform = (id: string): PlatformDef => {
  const p = PLATFORMS[id as PlatformId];
  if (!p) throw new Error(`Unknown platform ${id}`);
  return p;
};
export const isPlatformConfigured = (id: PlatformId) => PLATFORMS[id].requiredEnv.every((k) => Boolean(process.env[k]));
export const canPublish = (p: PlatformDef) =>
  [p.caps.publishText, p.caps.publishImage, p.caps.publishVideo, p.caps.publishLink].some((c) => c.status !== "unavailable");

export const platformLabel = (p: string) => PLATFORMS[p as PlatformId]?.name ?? p;
