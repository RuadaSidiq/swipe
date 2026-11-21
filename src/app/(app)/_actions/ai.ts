"use server";
import { requireCtx } from "@/lib/auth";
import { adaptForPlatforms, articleToPosts, chat, explainAnalytics, generateContent, reviewContent, rewriteContent, suggestReply, GENERATE_KINDS, REWRITE_MODES } from "@/lib/ai";
import { rateLimit } from "@/lib/ratelimit";
import { requireFeature } from "@/lib/billing";
import type { PlatformId } from "@/lib/platforms/registry";
import { db } from "@/lib/db";
import { safe } from "./common";

async function aiCtx() {
  const ctx = await requireCtx(); ctx.assert("ai.use");
  if (!(await rateLimit(`ai:${ctx.user.id}`, 40, 60)).ok) throw new Error("You're sending AI requests too quickly. Wait a moment.");
  return ctx;
}
const base = (ctx: Awaited<ReturnType<typeof requireCtx>>) => ({ workspaceId: ctx.workspace.id, userId: ctx.user.id });

export async function aiGenerate(i: { kind: keyof typeof GENERATE_KINDS; topic: string; platforms?: PlatformId[]; brandId?: string | null; language?: string }) {
  return safe(async () => { const ctx = await aiCtx(); return generateContent({ ...base(ctx), ...i }); });
}
export async function aiRewrite(i: { text: string; mode: keyof typeof REWRITE_MODES | "translate" | "audience"; language?: string; audience?: string; platform?: PlatformId; brandId?: string | null }) {
  return safe(async () => { const ctx = await aiCtx(); return rewriteContent({ ...base(ctx), ...i }); });
}
export async function aiAdapt(i: { text: string; platforms: PlatformId[]; brandId?: string | null }) {
  return safe(async () => { const ctx = await aiCtx(); return adaptForPlatforms({ ...base(ctx), ...i }); });
}
export async function aiRepurpose(i: { article: string; count: number; platforms: PlatformId[]; brandId?: string | null }) {
  return safe(async () => { const ctx = await aiCtx(); return articleToPosts({ ...base(ctx), ...i, count: Math.min(10, Math.max(1, i.count)) }); });
}
export async function aiReply(i: { conversationId: string; tone?: string; instruction?: string; draft?: string }) {
  return safe(async () => {
    const ctx = await aiCtx(); ctx.assert("inbox.reply");
    await requireFeature(ctx.workspace.organizationId, "aiReplies");
    return suggestReply(ctx.workspace.id, ctx.user.id, i.conversationId, i);
  });
}
export async function aiExplain(summary: string) { return safe(async () => { const ctx = await aiCtx(); return explainAnalytics({ ...base(ctx), summary }); }); }
export async function aiReview(brandId?: string | null) {
  return safe(async () => {
    const ctx = await aiCtx();
    const posts = await db.post.findMany({ where: { workspaceId: ctx.workspace.id, ...(brandId ? { brandId } : {}) }, orderBy: { updatedAt: "desc" }, take: 25, include: { targets: { include: { account: { select: { platform: true } }, metrics: true } } } });
    if (!posts.length) throw new Error("There are no posts to review yet.");
    const text = posts.map((p, i) => {
      const m = p.targets.flatMap((t) => t.metrics).reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.metric]: (acc[x.metric] ?? 0) + x.value }), {});
      return `#${i + 1} [${p.status}] ${p.targets.map((t) => t.account.platform).join(",")}${Object.keys(m).length ? ` metrics: ${JSON.stringify(m)}` : " (no metrics available)"}\n${p.body}`;
    }).join("\n\n");
    return reviewContent({ ...base(ctx), posts: text, brandId });
  });
}
export async function aiChat(message: string, history: { role: "user" | "assistant"; content: string }[]) {
  return safe(async () => {
    const ctx = await aiCtx();
    const ws = ctx.workspace.id;
    const [accounts, upcoming, recent, campaigns] = await Promise.all([
      db.socialAccount.findMany({ where: { workspaceId: ws, status: "CONNECTED" }, select: { platform: true, displayName: true, isDemo: true } }),
      db.post.findMany({ where: { workspaceId: ws, status: "SCHEDULED" }, orderBy: { scheduledAt: "asc" }, take: 15, select: { body: true, scheduledAt: true } }),
      db.post.findMany({ where: { workspaceId: ws, status: { in: ["PUBLISHED", "PARTIAL"] } }, orderBy: { publishedAt: "desc" }, take: 10, select: { body: true, publishedAt: true } }),
      db.campaign.findMany({ where: { workspaceId: ws }, take: 10, select: { name: true, status: true, startDate: true, endDate: true } }),
    ]);
    const context = [`Today: ${new Date().toISOString().slice(0, 10)}`,
      `Accounts: ${accounts.map((a) => `${a.platform}:${a.displayName}${a.isDemo ? " (demo)" : ""}`).join("; ") || "none"}`,
      `Upcoming: ${upcoming.map((p) => `${p.scheduledAt?.toISOString().slice(0, 16)} ${p.body.slice(0, 80)}`).join(" | ") || "none"}`,
      `Recently published: ${recent.map((p) => p.body.slice(0, 80)).join(" | ") || "none"}`,
      `Campaigns: ${campaigns.map((c) => `${c.name} (${c.status})`).join("; ") || "none"}`].join("\n");
    const convo = history.slice(-10).map((h) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`).join("\n\n");
    return chat({ ...base(ctx), message: convo ? `Earlier in this chat:\n${convo}\n\nUser: ${message}` : message, context });
  });
}
