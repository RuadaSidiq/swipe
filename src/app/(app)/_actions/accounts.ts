"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { encrypt, hmac } from "@/lib/crypto";
import { api } from "@/lib/platforms/http";
import { GRAPH } from "@/lib/platforms/adapters/meta";
import { ADAPTERS } from "@/lib/platforms/adapters";
import { PLATFORMS, type PlatformId } from "@/lib/platforms/registry";
import { freshAccount, toAdapter } from "@/lib/accounts";
import { saveDiscovered } from "@/lib/connect";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { safe } from "./common";
import type { Prisma } from "@prisma/client";

export async function connectTelegram(input: { botToken: string; chat: string }) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("accounts.connect");
    const { botToken, chat } = z.object({ botToken: z.string().regex(/^\d+:[\w-]{30,}$/, "That doesn't look like a bot token from @BotFather."), chat: z.string().min(2) }).parse(input);
    const base = `https://api.telegram.org/bot${botToken}`;
    const me = await api(`${base}/getMe`, {}, "Telegram");
    const chatId = /^-?\d+$/.test(chat) ? chat : `@${chat.replace(/^@|^https?:\/\/t\.me\//g, "")}`;
    const info = await api(`${base}/getChat?chat_id=${encodeURIComponent(chatId)}`, {}, "Telegram");
    const member = await api(`${base}/getChatMember?chat_id=${encodeURIComponent(chatId)}&user_id=${me.result.id}`, {}, "Telegram");
    if (!["administrator", "creator"].includes(member.result.status)) throw new Error(`@${me.result.username} must be an administrator of ${info.result.title} with permission to post.`);
    const [acc] = await saveDiscovered(ctx.workspace.id, ctx.workspace.organizationId, ctx.user.id, "telegram", [{
      externalId: String(info.result.id), accountType: info.result.type === "channel" ? "channel" : "group", displayName: info.result.title, username: info.result.username,
      profileUrl: info.result.username ? `https://t.me/${info.result.username}` : undefined, accessToken: botToken, scopes: ["bot"],
      meta: { chatId: String(info.result.id), chatUsername: info.result.username, botUsername: me.result.username, botId: me.result.id } }]);
    // Bot DMs and discussion comments arrive via webhook. Telegram signs nothing, so we use a per-account secret header.
    let webhook = "not registered (APP_URL must be public HTTPS)";
    if (env.appUrl.startsWith("https://")) {
      await api(`${base}/setWebhook`, { method: "POST", json: { url: `${env.appUrl}/api/webhooks/telegram/${acc.id}`, secret_token: hmac(`tg:${acc.id}`), allowed_updates: ["message", "channel_post"] } }, "Telegram");
      webhook = "registered";
    }
    await db.socialAccount.update({ where: { id: acc.id }, data: { meta: { ...(acc.meta as object), webhook } as Prisma.InputJsonValue } });
    await audit(ctx, "account.connect", { targetType: "social_account", targetId: acc.id, detail: { platform: "telegram" } });
    revalidatePath("/accounts");
    return { name: acc.displayName, webhook };
  });
}

export async function connectWhatsApp(input: { token: string; phoneNumberId: string; wabaId?: string }) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("accounts.connect");
    const { token, phoneNumberId, wabaId } = z.object({ token: z.string().min(20), phoneNumberId: z.string().regex(/^\d+$/, "Phone number ID is numeric."), wabaId: z.string().optional() }).parse(input);
    const r = await api(`${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, { headers: { Authorization: `Bearer ${token}` } }, "WhatsApp");
    if (wabaId) { try { await api(`${GRAPH}/${wabaId}/subscribed_apps`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }, "WhatsApp"); } catch { /* user may subscribe in Meta UI */ } }
    const [acc] = await saveDiscovered(ctx.workspace.id, ctx.workspace.organizationId, ctx.user.id, "whatsapp", [{
      externalId: phoneNumberId, accountType: "business", displayName: r.verified_name ?? r.display_phone_number, username: r.display_phone_number, accessToken: token, scopes: ["whatsapp_business_messaging"],
      meta: { wabaId, quality: r.quality_rating } }]);
    await audit(ctx, "account.connect", { targetType: "social_account", targetId: acc.id, detail: { platform: "whatsapp" } });
    revalidatePath("/accounts");
    return { name: acc.displayName };
  });
}

export async function addDemoAccount(platformId: string) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("accounts.connect");
    if (!env.demoMode) throw new Error("Demo accounts are only available when DEMO_MODE is enabled.");
    const p = PLATFORMS[platformId as PlatformId];
    const n = await db.socialAccount.count({ where: { workspaceId: ctx.workspace.id, platform: p.id, isDemo: true } });
    await db.socialAccount.create({ data: { workspaceId: ctx.workspace.id, platform: p.id, externalId: `demo-${p.id}-${Date.now()}`, displayName: `Demo ${p.name}${n ? ` ${n + 1}` : ""}`,
      username: `demo_${p.id}`, isDemo: true, scopes: ["demo"], meta: p.id === "pinterest" ? { boards: [{ id: "demo-board", name: "Demo board" }] } : {} } });
    revalidatePath("/accounts");
    return true;
  });
}

async function revokeRemote(acc: Awaited<ReturnType<typeof db.socialAccount.findFirstOrThrow>>) {
  if (acc.isDemo || !acc.accessTokenEnc) return "no remote token";
  const a = toAdapter(acc);
  try {
    switch (acc.platform) {
      case "x": await api("https://api.x.com/2/oauth2/revoke", { method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString("base64") }, form: { token: a.accessToken!, token_type_hint: "access_token" } }, "X"); return "revoked";
      case "youtube": await api(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(a.refreshToken ?? a.accessToken!)}`, { method: "POST" }, "Google"); return "revoked";
      case "reddit": await api("https://www.reddit.com/api/v1/revoke_token", { method: "POST", headers: { Authorization: "Basic " + Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString("base64"), "User-Agent": process.env.REDDIT_USER_AGENT ?? "web:swipe" }, form: { token: a.refreshToken ?? a.accessToken!, token_type_hint: a.refreshToken ? "refresh_token" : "access_token" } }, "Reddit"); return "revoked";
      case "tiktok": await api("https://open.tiktokapis.com/v2/oauth/revoke/", { method: "POST", form: { client_key: process.env.TIKTOK_CLIENT_KEY ?? "", client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "", token: a.accessToken! } }, "TikTok"); return "revoked";
      case "telegram": await api(`https://api.telegram.org/bot${a.accessToken}/deleteWebhook`, { method: "POST" }, "Telegram"); return "webhook removed (bot token stays valid — revoke it in @BotFather if needed)";
      case "facebook": case "instagram": try { await api(`${GRAPH}/${acc.platform === "instagram" ? a.meta.pageId : acc.externalId}/subscribed_apps?access_token=${a.accessToken}`, { method: "DELETE" }, "Meta"); } catch { /* ignore */ }
        return "local tokens deleted; remove the app in Facebook settings › Business Integrations to fully revoke";
      default: return "local tokens deleted; revoke app access from the network's settings to fully revoke";
    }
  } catch (e) { return `remote revoke failed: ${(e as Error).message}; local tokens deleted anyway`; }
}

export async function disconnectAccount(accountId: string) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("accounts.manage");
    const acc = await db.socialAccount.findFirstOrThrow({ where: { id: accountId, workspaceId: ctx.workspace.id } });
    const result = await revokeRemote(acc);
    await db.socialAccount.update({ where: { id: acc.id }, data: { status: "DISCONNECTED", statusMessage: "Disconnected by user", accessTokenEnc: null, refreshTokenEnc: null, tokenExpiresAt: null } });
    await db.postTarget.updateMany({ where: { accountId, status: { in: ["SCHEDULED", "QUEUED"] } }, data: { status: "FAILED", error: "Account was disconnected", errorCode: "disconnected" } });
    await audit(ctx, "account.disconnect", { targetType: "social_account", targetId: acc.id, detail: { platform: acc.platform, result } });
    revalidatePath("/accounts");
    return result;
  });
}

export async function removeAccount(accountId: string) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("accounts.manage");
    const acc = await db.socialAccount.findFirstOrThrow({ where: { id: accountId, workspaceId: ctx.workspace.id } });
    if (acc.status !== "DISCONNECTED" && !acc.isDemo) await revokeRemote(acc);
    await db.socialAccount.delete({ where: { id: acc.id } });
    await audit(ctx, "account.remove", { targetType: "social_account", targetId: acc.id, detail: { platform: acc.platform, name: acc.displayName } });
    revalidatePath("/accounts");
    return true;
  });
}

export async function updateAccount(accountId: string, input: { brandId?: string | null; isDefault?: boolean; preferences?: Record<string, unknown> }) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("accounts.manage");
    const acc = await db.socialAccount.findFirstOrThrow({ where: { id: accountId, workspaceId: ctx.workspace.id } });
    if (input.brandId) await db.brand.findFirstOrThrow({ where: { id: input.brandId, workspaceId: ctx.workspace.id } });
    await db.socialAccount.update({ where: { id: acc.id }, data: { brandId: input.brandId === undefined ? undefined : input.brandId, isDefault: input.isDefault,
      preferences: input.preferences ? ({ ...(acc.preferences as object), ...input.preferences } as Prisma.InputJsonValue) : undefined } });
    revalidatePath("/accounts");
    return true;
  });
}

export async function syncAccount(accountId: string) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("accounts.manage");
    const acc = await db.socialAccount.findFirstOrThrow({ where: { id: accountId, workspaceId: ctx.workspace.id } });
    if (acc.isDemo) throw new Error("Demo accounts have no live data to sync.");
    const adapter = ADAPTERS[acc.platform as PlatformId];
    if (!adapter.metrics) throw new Error(`${PLATFORMS[acc.platform as PlatformId].name} analytics aren't available.`);
    const { acc: a } = await freshAccount(acc.id);
    const pts = await adapter.metrics(a);
    await db.metricSnapshot.createMany({ data: pts.map((p) => ({ accountId: acc.id, ...p })) });
    if (acc.platform === "pinterest") {
      const boards = await api("https://api.pinterest.com/v5/boards?page_size=100", { headers: { Authorization: `Bearer ${a.accessToken}` } }, "Pinterest");
      await db.socialAccount.update({ where: { id: acc.id }, data: { meta: { ...(acc.meta as object), boards: boards.items.map((b: { id: string; name: string }) => ({ id: b.id, name: b.name })) } } });
    }
    await db.socialAccount.update({ where: { id: acc.id }, data: { lastSyncedAt: new Date(), status: "CONNECTED", statusMessage: null } });
    revalidatePath("/accounts");
    return pts.length;
  });
}
