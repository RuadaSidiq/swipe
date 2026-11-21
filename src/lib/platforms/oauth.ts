import { api, PlatformError } from "./http";
import { GRAPH } from "./adapters/meta";
import type { PlatformId } from "./registry";
import { env } from "../env";

export interface DiscoveredAccount {
  externalId: string; accountType: string; displayName: string; username?: string; avatarUrl?: string; profileUrl?: string;
  accessToken: string; refreshToken?: string | null; expiresAt?: Date | null; refreshExpiresAt?: Date | null; scopes: string[]; meta?: Record<string, unknown>;
}

interface OAuthProvider {
  authorizeUrl: string; scopes: string[]; scopeSep?: string; pkce?: boolean; clientIdParam?: string;
  clientId: () => string | undefined; extra?: Record<string, string>;
  exchange: (code: string, redirectUri: string, verifier?: string) => Promise<DiscoveredAccount[]>;
}

export const redirectUri = (p: PlatformId) => `${env.appUrl}/api/oauth/${p}/callback`;
const basic = (id?: string, secret?: string) => "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
const exp = (sec?: number) => (sec ? new Date(Date.now() + sec * 1000) : null);

// ── Meta (Facebook Pages + Instagram) ──
const META_FB_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "pages_manage_metadata", "pages_messaging", "pages_read_user_content", "pages_manage_engagement", "read_insights", "business_management"];
const META_IG_SCOPES = ["instagram_basic", "instagram_content_publish", "instagram_manage_comments", "instagram_manage_messages", "instagram_manage_insights", "pages_show_list", "pages_read_engagement", "business_management"];

async function metaUserToken(code: string, redirect: string) {
  const short = await api(`${GRAPH}/oauth/access_token?` + new URLSearchParams({ client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, redirect_uri: redirect, code }), {}, "Meta");
  const long = await api(`${GRAPH}/oauth/access_token?` + new URLSearchParams({ grant_type: "fb_exchange_token", client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, fb_exchange_token: short.access_token }), {}, "Meta");
  return long.access_token as string;
}
async function metaPages(userToken: string) {
  const r = await api(`${GRAPH}/me/accounts?fields=id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url},tasks&limit=100&access_token=${userToken}`, {}, "Meta");
  return (r.data ?? []) as any[];
}
async function subscribePage(pageId: string, pageToken: string) {
  try { await api(`${GRAPH}/${pageId}/subscribed_apps`, { method: "POST", form: { subscribed_fields: "messages,feed,mention", access_token: pageToken } }, "Meta"); } catch { /* webhooks optional */ }
}

const PROVIDERS: Partial<Record<PlatformId, OAuthProvider>> = {
  facebook: {
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth", scopes: META_FB_SCOPES, scopeSep: ",", clientId: () => process.env.META_APP_ID,
    async exchange(code, redirect) {
      const ut = await metaUserToken(code, redirect);
      const pages = await metaPages(ut);
      if (!pages.length) throw new PlatformError("No Facebook Pages found. You need to be an admin of at least one Page.");
      return Promise.all(pages.map(async (p) => {
        await subscribePage(p.id, p.access_token);
        return { externalId: p.id, accountType: "page", displayName: p.name, avatarUrl: p.picture?.data?.url, profileUrl: `https://facebook.com/${p.id}`,
          accessToken: p.access_token, scopes: META_FB_SCOPES, meta: { tasks: p.tasks } };
      }));
    },
  },
  instagram: {
    authorizeUrl: "https://www.facebook.com/v21.0/dialog/oauth", scopes: META_IG_SCOPES, scopeSep: ",", clientId: () => process.env.META_APP_ID,
    async exchange(code, redirect) {
      const ut = await metaUserToken(code, redirect);
      const pages = (await metaPages(ut)).filter((p) => p.instagram_business_account);
      if (!pages.length) throw new PlatformError("No Instagram Professional accounts found. Link your Instagram Business/Creator account to a Facebook Page first.");
      return Promise.all(pages.map(async (p) => {
        await subscribePage(p.id, p.access_token);
        const ig = p.instagram_business_account;
        return { externalId: ig.id, accountType: "business", displayName: ig.name || ig.username, username: ig.username, avatarUrl: ig.profile_picture_url,
          profileUrl: `https://instagram.com/${ig.username}`, accessToken: p.access_token, scopes: META_IG_SCOPES, meta: { pageId: p.id, pageName: p.name } };
      }));
    },
  },
  threads: {
    authorizeUrl: "https://threads.net/oauth/authorize", scopes: ["threads_basic", "threads_content_publish", "threads_manage_insights", "threads_read_replies"], scopeSep: ",",
    clientId: () => process.env.META_APP_ID,
    async exchange(code, redirect) {
      const s = await api("https://graph.threads.net/oauth/access_token", { method: "POST", form: { client_id: process.env.META_APP_ID!, client_secret: process.env.META_APP_SECRET!, grant_type: "authorization_code", redirect_uri: redirect, code } }, "Threads");
      const l = await api(`https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${process.env.META_APP_SECRET}&access_token=${s.access_token}`, {}, "Threads");
      const me = await api(`https://graph.threads.net/v1.0/me?fields=id,username,name,threads_profile_picture_url&access_token=${l.access_token}`, {}, "Threads");
      return [{ externalId: me.id, accountType: "profile", displayName: me.name || me.username, username: me.username, avatarUrl: me.threads_profile_picture_url,
        profileUrl: `https://threads.net/@${me.username}`, accessToken: l.access_token, expiresAt: exp(l.expires_in), scopes: PROVIDERS.threads!.scopes }];
    },
  },
  linkedin: {
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization", scopes: ["openid", "profile", "email", "w_member_social"], clientId: () => process.env.LINKEDIN_CLIENT_ID,
    async exchange(code, redirect) {
      const t = await api("https://www.linkedin.com/oauth/v2/accessToken", { method: "POST", form: { grant_type: "authorization_code", code, redirect_uri: redirect, client_id: process.env.LINKEDIN_CLIENT_ID!, client_secret: process.env.LINKEDIN_CLIENT_SECRET! } }, "LinkedIn");
      const me = await api("https://api.linkedin.com/v2/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } }, "LinkedIn");
      return [{ externalId: me.sub, accountType: "profile", displayName: me.name, avatarUrl: me.picture, accessToken: t.access_token, refreshToken: t.refresh_token,
        expiresAt: exp(t.expires_in), refreshExpiresAt: exp(t.refresh_token_expires_in), scopes: String(t.scope ?? "").split(/[ ,]/).filter(Boolean) }];
    },
  },
  x: {
    authorizeUrl: "https://x.com/i/oauth2/authorize", scopes: ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"], pkce: true, clientId: () => process.env.X_CLIENT_ID,
    async exchange(code, redirect, verifier) {
      const t = await api("https://api.x.com/2/oauth2/token", { method: "POST", headers: { Authorization: basic(process.env.X_CLIENT_ID, process.env.X_CLIENT_SECRET) },
        form: { grant_type: "authorization_code", code, redirect_uri: redirect, code_verifier: verifier!, client_id: process.env.X_CLIENT_ID! } }, "X");
      const me = await api("https://api.x.com/2/users/me?user.fields=profile_image_url", { headers: { Authorization: `Bearer ${t.access_token}` } }, "X");
      return [{ externalId: me.data.id, accountType: "profile", displayName: me.data.name, username: me.data.username, avatarUrl: me.data.profile_image_url,
        profileUrl: `https://x.com/${me.data.username}`, accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: exp(t.expires_in),
        scopes: String(t.scope ?? "").split(" "), meta: { username: me.data.username } }];
    },
  },
  youtube: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth", clientId: () => process.env.GOOGLE_CLIENT_ID,
    scopes: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/youtube.force-ssl"], extra: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
    async exchange(code, redirect) {
      const t = await api("https://oauth2.googleapis.com/token", { method: "POST", form: { grant_type: "authorization_code", code, redirect_uri: redirect, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET! } }, "Google");
      const ch = await api("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${t.access_token}` } }, "YouTube");
      if (!ch.items?.length) throw new PlatformError("This Google account has no YouTube channel.");
      return ch.items.map((c: any) => ({ externalId: c.id, accountType: "channel", displayName: c.snippet.title, username: c.snippet.customUrl, avatarUrl: c.snippet.thumbnails?.default?.url,
        profileUrl: `https://youtube.com/channel/${c.id}`, accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: exp(t.expires_in), scopes: String(t.scope).split(" ") }));
    },
  },
  tiktok: {
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/", scopes: ["user.info.basic", "user.info.stats", "video.publish", "video.upload"], scopeSep: ",", clientIdParam: "client_key",
    clientId: () => process.env.TIKTOK_CLIENT_KEY, pkce: true,
    async exchange(code, redirect, verifier) {
      const t = await api("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", form: { client_key: process.env.TIKTOK_CLIENT_KEY!, client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        code, grant_type: "authorization_code", redirect_uri: redirect, code_verifier: verifier ?? "" } }, "TikTok");
      const me = await api("https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name,username", { headers: { Authorization: `Bearer ${t.access_token}` } }, "TikTok");
      const u = me.data.user;
      return [{ externalId: u.open_id, accountType: "profile", displayName: u.display_name, username: u.username, avatarUrl: u.avatar_url, profileUrl: u.username ? `https://tiktok.com/@${u.username}` : undefined,
        accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: exp(t.expires_in), refreshExpiresAt: exp(t.refresh_expires_in), scopes: String(t.scope).split(",") }];
    },
  },
  pinterest: {
    authorizeUrl: "https://www.pinterest.com/oauth/", scopes: ["boards:read", "pins:read", "pins:write", "user_accounts:read"], scopeSep: ",", clientId: () => process.env.PINTEREST_CLIENT_ID,
    async exchange(code, redirect) {
      const t = await api("https://api.pinterest.com/v5/oauth/token", { method: "POST", headers: { Authorization: basic(process.env.PINTEREST_CLIENT_ID, process.env.PINTEREST_CLIENT_SECRET) },
        form: { grant_type: "authorization_code", code, redirect_uri: redirect } }, "Pinterest");
      const h = { Authorization: `Bearer ${t.access_token}` };
      const me = await api("https://api.pinterest.com/v5/user_account", { headers: h }, "Pinterest");
      const boards = await api("https://api.pinterest.com/v5/boards?page_size=100", { headers: h }, "Pinterest");
      return [{ externalId: me.username, accountType: me.account_type === "BUSINESS" ? "business" : "profile", displayName: me.business_name || me.username, username: me.username,
        avatarUrl: me.profile_image, profileUrl: `https://pinterest.com/${me.username}`, accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: exp(t.expires_in),
        refreshExpiresAt: exp(t.refresh_token_expires_in), scopes: String(t.scope).split(","), meta: { boards: (boards.items ?? []).map((b: any) => ({ id: b.id, name: b.name })) } }];
    },
  },
  reddit: {
    authorizeUrl: "https://www.reddit.com/api/v1/authorize", scopes: ["identity", "submit", "read", "mysubreddits", "privatemessages"], clientId: () => process.env.REDDIT_CLIENT_ID,
    extra: { duration: "permanent" },
    async exchange(code, redirect) {
      const ua = process.env.REDDIT_USER_AGENT || "web:orbit:0.1";
      const t = await api("https://www.reddit.com/api/v1/access_token", { method: "POST", headers: { Authorization: basic(process.env.REDDIT_CLIENT_ID, process.env.REDDIT_CLIENT_SECRET), "User-Agent": ua },
        form: { grant_type: "authorization_code", code, redirect_uri: redirect } }, "Reddit");
      const me = await api("https://oauth.reddit.com/api/v1/me", { headers: { Authorization: `Bearer ${t.access_token}`, "User-Agent": ua } }, "Reddit");
      return [{ externalId: me.id, accountType: "profile", displayName: `u/${me.name}`, username: me.name, avatarUrl: me.icon_img?.split("?")[0], profileUrl: `https://reddit.com/user/${me.name}`,
        accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: exp(t.expires_in), scopes: String(t.scope).split(" ") }];
    },
  },
  snapchat: {
    authorizeUrl: "https://accounts.snapchat.com/login/oauth2/authorize", scopes: ["https://auth.snapchat.com/oauth2/api/user.display_name", "https://auth.snapchat.com/oauth2/api/user.bitmoji.avatar"],
    clientId: () => process.env.SNAPCHAT_CLIENT_ID,
    async exchange(code, redirect) {
      const t = await api("https://accounts.snapchat.com/login/oauth2/access_token", { method: "POST", form: { grant_type: "authorization_code", code, redirect_uri: redirect, client_id: process.env.SNAPCHAT_CLIENT_ID!, client_secret: process.env.SNAPCHAT_CLIENT_SECRET! } }, "Snapchat");
      const me = await api("https://kit.snapchat.com/v1/me", { method: "POST", headers: { Authorization: `Bearer ${t.access_token}` }, json: { query: "{me{displayName externalId bitmoji{avatar}}}" } }, "Snapchat");
      const u = me.data?.me ?? {};
      return [{ externalId: u.externalId ?? "snap", accountType: "profile", displayName: u.displayName ?? "Snapchat", avatarUrl: u.bitmoji?.avatar, accessToken: t.access_token,
        refreshToken: t.refresh_token, expiresAt: exp(t.expires_in), scopes: PROVIDERS.snapchat!.scopes }];
    },
  },
};

export function getProvider(p: PlatformId) { return PROVIDERS[p]; }

export function buildAuthorizeUrl(p: PlatformId, state: string, codeChallenge?: string) {
  const prov = PROVIDERS[p];
  if (!prov) throw new Error(`${p} doesn't use OAuth`);
  const params = new URLSearchParams({ [prov.clientIdParam ?? "client_id"]: prov.clientId() ?? "", redirect_uri: redirectUri(p), response_type: "code",
    scope: prov.scopes.join(prov.scopeSep ?? " "), state, ...(prov.extra ?? {}) });
  if (prov.pkce && codeChallenge) { params.set("code_challenge", codeChallenge); params.set("code_challenge_method", "S256"); }
  return `${prov.authorizeUrl}?${params}`;
}
