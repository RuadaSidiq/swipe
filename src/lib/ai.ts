import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { env } from "./env";
import { enforceLimit, incrementUsage } from "./billing";
import { PLATFORMS, type PlatformId } from "./platforms/registry";

let client: Anthropic | null = null;
const anthropic = () => (client ??= new Anthropic());

export class AiUnavailableError extends Error {
  constructor() { super("AI isn't configured. Set ANTHROPIC_API_KEY on the server to enable the assistant."); }
}

type Effort = "low" | "medium" | "high";

interface CallOpts { workspaceId: string; userId: string; feature: string; system: string; prompt: string; maxTokens?: number; effort?: Effort; schema?: Record<string, unknown> }

/** All AI calls go through here: plan limits, usage metering and refusal handling live in one place. */
async function call({ workspaceId, userId, feature, system, prompt, maxTokens = 4000, effort = "low", schema }: CallOpts): Promise<string> {
  if (!env.aiConfigured) throw new AiUnavailableError();
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  await enforceLimit(ws.organizationId, "aiRequestsPerMonth");
  const res = await anthropic().beta.messages.create({
    model: env.aiModel,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    output_config: { effort, ...(schema ? { format: { type: "json_schema", schema } } : {}) },
    messages: [{ role: "user", content: prompt }],
  });
  await incrementUsage(ws.organizationId, "ai_requests");
  await db.aiUsage.create({ data: { workspaceId, userId: userId || "system", feature, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, model: res.model } });
  if (res.stop_reason === "refusal") throw new Error("The AI declined this request. Try rephrasing it.");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  if (!text) throw new Error("The AI returned an empty response. Please try again.");
  return text;
}

async function brandContext(workspaceId: string, brandId?: string | null) {
  const brand = brandId
    ? await db.brand.findFirst({ where: { id: brandId, workspaceId } })
    : await db.brand.findFirst({ where: { workspaceId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  if (!brand) return "No brand profile has been set up. Write in a clear, friendly, professional voice.";
  const f = (label: string, v: string) => (v.trim() ? `${label}: ${v.trim()}` : "");
  return [
    `You are writing for the brand "${brand.name}". Use only this brand's identity; never borrow details from other brands.`,
    f("About", brand.description), f("Audience", brand.audience), f("Tone of voice", brand.tone), f("Products/services", brand.products),
    f("Guidelines", brand.guidelines), f("Never use these words", brand.bannedWords), f("Preferred hashtags", brand.defaultHashtags),
    brand.examples.trim() ? `Approved example posts (match their style, don't copy them):\n${brand.examples.trim()}` : "",
  ].filter(Boolean).join("\n");
}

const BASE = `You are Swipe's social media assistant, used by marketers and support teams.
Write content that is ready to paste: no preamble like "Here's a caption", no surrounding quotes, no markdown headings unless asked.
Never invent facts, prices, statistics, discounts, dates or claims that weren't provided. If information is missing, write around it or use a clear [placeholder].`;

const platformRules = (ids: PlatformId[]) => ids.map((id) => {
  const p = PLATFORMS[id];
  return `- ${p.name}: max ${p.limits.text} characters${p.limits.title ? `, title max ${p.limits.title}` : ""}${p.limits.hashtags ? `, max ${p.limits.hashtags} hashtags` : ""}.`;
}).join("\n");

// ───────── Content generation & rewriting ─────────

export const GENERATE_KINDS = {
  caption: "a social media caption", marketing: "a marketing post", announcement: "a product announcement", promo: "a promotional post",
  educational: "an educational post", script: "a short-form video script (hook, beats, CTA, with timings)", video_description: "a video description",
  youtube_title: "5 YouTube title options, one per line", hashtags: "a list of 10–20 relevant hashtags on one line", campaign_ideas: "8 campaign ideas, each with a one-line concept",
  linkedin: "a professional LinkedIn post", thread: "a thread of 4–7 short posts, separated by a line containing only ---", bio: "3 social media bio options, one per paragraph",
  cta: "5 call-to-action options, one per line", engagement: "a community engagement post (question or prompt)",
} as const;

export async function generateContent(o: { workspaceId: string; userId: string; kind: keyof typeof GENERATE_KINDS; topic: string; platforms?: PlatformId[]; brandId?: string | null; language?: string }) {
  const sys = `${BASE}\n\n${await brandContext(o.workspaceId, o.brandId)}`;
  const plat = o.platforms?.length ? `\nTarget platforms and their limits:\n${platformRules(o.platforms)}\nStay within the strictest limit.` : "";
  return call({ ...o, feature: `generate.${o.kind}`, system: sys, prompt: `Write ${GENERATE_KINDS[o.kind]} about:\n${o.topic}${plat}${o.language ? `\nWrite in ${o.language}.` : ""}` });
}

export const REWRITE_MODES = {
  rewrite: "Rewrite it with fresh wording, same meaning.", shorter: "Make it noticeably shorter.", longer: "Expand it with more useful detail (no invented facts).",
  professional: "Make it more professional.", conversational: "Make it more conversational.", persuasive: "Make it more persuasive.", friendly: "Make it warmer and friendlier.",
  hooks: "Suggest 5 alternative opening hooks, one per line.", improve: "Improve it for engagement: clearer hook, tighter body, clearer call to action.",
} as const;

export async function rewriteContent(o: { workspaceId: string; userId: string; text: string; mode: keyof typeof REWRITE_MODES | "translate" | "audience"; language?: string; audience?: string; platform?: PlatformId; brandId?: string | null }) {
  const sys = `${BASE}\n\n${await brandContext(o.workspaceId, o.brandId)}`;
  const instruction = o.mode === "translate" ? `Translate it into ${o.language ?? "Spanish"}, keeping tone, emojis, hashtags and links.` : o.mode === "audience" ? `Adapt it for this audience: ${o.audience}.` : REWRITE_MODES[o.mode];
  const lim = o.platform ? `\nIt's for ${PLATFORMS[o.platform].name} (max ${PLATFORMS[o.platform].limits.text} characters).` : "";
  return call({ ...o, feature: `rewrite.${o.mode}`, system: sys, prompt: `${instruction}${lim}\n\n<content>\n${o.text}\n</content>` });
}

/** Produces a tailored version per destination network, honouring each network's limits. */
export async function adaptForPlatforms(o: { workspaceId: string; userId: string; text: string; platforms: PlatformId[]; brandId?: string | null }): Promise<Record<string, { body: string; title?: string }>> {
  const sys = `${BASE}\n\n${await brandContext(o.workspaceId, o.brandId)}`;
  const schema = { type: "object", additionalProperties: false, required: ["versions"], properties: { versions: { type: "array", items: {
    type: "object", additionalProperties: false, required: ["platform", "body", "title"], properties: { platform: { type: "string", enum: o.platforms }, body: { type: "string" }, title: { type: "string" } } } } } };
  const out = await call({ ...o, feature: "adapt", system: sys, schema, maxTokens: 8000, effort: "medium",
    prompt: `Adapt this post for each platform below, following each platform's conventions (e.g. hashtags on Instagram, concise on X, professional on LinkedIn, title + description on YouTube/Pinterest/Reddit). Set title to "" where the platform has no title.\n${platformRules(o.platforms)}\n\n<post>\n${o.text}\n</post>` });
  const parsed = JSON.parse(out) as { versions: { platform: string; body: string; title: string }[] };
  return Object.fromEntries(parsed.versions.map((v) => [v.platform, { body: v.body, title: v.title || undefined }]));
}

export async function articleToPosts(o: { workspaceId: string; userId: string; article: string; count: number; platforms: PlatformId[]; brandId?: string | null }): Promise<string[]> {
  const sys = `${BASE}\n\n${await brandContext(o.workspaceId, o.brandId)}`;
  const schema = { type: "object", additionalProperties: false, required: ["posts"], properties: { posts: { type: "array", items: { type: "string" } } } };
  const out = await call({ ...o, feature: "repurpose", system: sys, schema, maxTokens: 8000, effort: "medium",
    prompt: `Turn this article into ${o.count} distinct standalone social posts, each highlighting a different point.\n${platformRules(o.platforms)}\n\n<article>\n${o.article.slice(0, 60000)}\n</article>` });
  return (JSON.parse(out) as { posts: string[] }).posts;
}

// ───────── Replies ─────────

const SENSITIVE = /\b(refund|charge(d)?back|lawyer|legal|sue|lawsuit|fraud|scam|stolen|hack(ed)?|password|credit card|bank|invoice|payment|overcharged|complain(t)?|furious|unacceptable|discriminat|harass|suicid|self[- ]harm|emergency|injur|allerg|medical|police)\b/i;
export const isSensitive = (text: string) => SENSITIVE.test(text);

export async function suggestReply(workspaceId: string, userId: string | null, conversationId: string, o: { tone?: string; instruction?: string; draft?: string } = {}) {
  const c = await db.conversation.findFirstOrThrow({ where: { id: conversationId, workspaceId }, include: { messages: { orderBy: { createdAt: "asc" }, take: 40 }, account: true } });
  const history = c.messages.map((m) => `${m.direction === "inbound" ? `Customer (${m.authorName})` : "Us"}: ${m.body}`).join("\n");
  const p = PLATFORMS[c.account.platform as PlatformId];
  const sensitive = c.messages.some((m) => m.direction === "inbound" && isSensitive(m.body));
  const sys = `${BASE}\n\n${await brandContext(workspaceId, c.account.brandId)}\n\nYou draft replies for a human agent to review. Reply on behalf of the brand in ${p.name} (${c.kind === "dm" ? "private message" : "public comment"}).
Keep it ${c.kind === "dm" ? "helpful and personal" : "short and public-appropriate; move account-specific details to DMs"}. Never promise refunds, compensation, timelines or policies that aren't stated in the brand guidelines.
${sensitive ? "This conversation touches a sensitive topic (money, legal, safety or a complaint). Be empathetic, acknowledge the issue, avoid admitting liability, and offer to move to a private channel or human follow-up." : ""}`;
  const task = o.draft ? `Rewrite this draft reply${o.tone ? ` to be more ${o.tone}` : ""}${o.instruction ? ` (${o.instruction})` : ""}:\n${o.draft}` : `Write the next reply${o.tone ? ` in a ${o.tone} tone` : ""}.${o.instruction ? ` Extra instruction: ${o.instruction}` : ""}`;
  return call({ workspaceId, userId: userId ?? "", feature: "reply", system: sys, prompt: `<conversation>\n${history}\n</conversation>\n\n${task}\nReturn only the reply text.`, maxTokens: 2000 });
}

// ───────── Analysis ─────────

export async function explainAnalytics(o: { workspaceId: string; userId: string; summary: string }) {
  return call({ ...o, feature: "analytics.explain", effort: "medium", maxTokens: 3000,
    system: `${BASE}\nYou explain social analytics to a busy business owner. Use only the numbers provided. Each metric lists its source and period; if a metric is missing, say it isn't available rather than estimating. Give 3–5 short insights then 3 concrete recommendations. Plain text with short bullet points.`,
    prompt: `<analytics>\n${o.summary}\n</analytics>` });
}

export async function reviewContent(o: { workspaceId: string; userId: string; posts: string; brandId?: string | null }) {
  return call({ ...o, feature: "content.review", effort: "medium", maxTokens: 4000,
    system: `${BASE}\n\n${await brandContext(o.workspaceId, o.brandId)}\nYou review a brand's recent and planned posts. Point out: weak captions, unclear CTAs, repetitive content, inconsistency with the brand voice, content gaps, and alternative hooks. Be specific, quote the post you mean. Use any performance numbers given; don't invent any.`,
    prompt: `<posts>\n${o.posts}\n</posts>` });
}

export async function chat(o: { workspaceId: string; userId: string; message: string; context: string; brandId?: string | null }) {
  return call({ ...o, feature: "assistant.chat", effort: "medium", maxTokens: 6000,
    system: `${BASE}\n\n${await brandContext(o.workspaceId, o.brandId)}\nYou're a social media strategist inside Swipe. You can see a snapshot of the workspace below. Answer the user's question practically. Use markdown lists where helpful.\n\n<workspace_snapshot>\n${o.context}\n</workspace_snapshot>`,
    prompt: o.message });
}

/** Creates DRAFT posts for a campaign — a human still schedules them. Returns how many were created. */
export async function generateCalendar(workspaceId: string, userId: string, campaignId: string) {
  const camp = await db.campaign.findFirstOrThrow({ where: { id: campaignId, workspaceId }, include: { accounts: { include: { account: true } } } });
  const owner = userId || (await db.membership.findFirst({ where: { workspaceId, role: "OWNER" } }))?.userId || "";
  const start = camp.startDate ?? new Date(); const end = camp.endDate ?? new Date(start.getTime() + 14 * 86400_000);
  const plats = [...new Set(camp.accounts.map((a) => a.account.platform as PlatformId))];
  const schema = { type: "object", additionalProperties: false, required: ["posts"], properties: { posts: { type: "array", items: { type: "object", additionalProperties: false,
    required: ["date", "time", "theme", "body"], properties: { date: { type: "string", description: "YYYY-MM-DD" }, time: { type: "string", description: "HH:MM 24h" }, theme: { type: "string" }, body: { type: "string" } } } } } };
  const out = await call({ workspaceId, userId: owner, feature: "campaign.calendar", schema, effort: "medium", maxTokens: 12000,
    system: `${BASE}\n\n${await brandContext(workspaceId, camp.brandId)}`,
    prompt: `Plan a content calendar for the campaign "${camp.name}".\nDescription: ${camp.description || "(none)"}\nGoals: ${camp.goals || "(none)"}\nDates: ${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}\nPlatforms: ${plats.map((p) => PLATFORMS[p].name).join(", ") || "general"}\n${plats.length ? platformRules(plats) : ""}\nSuggest 6–12 posts spread across the dates with varied themes (teaser, value, social proof, CTA, recap).` });
  const posts = (JSON.parse(out) as { posts: { date: string; time: string; theme: string; body: string }[] }).posts;
  for (const p of posts) {
    const when = new Date(`${p.date}T${p.time}:00Z`);
    await db.post.create({ data: { workspaceId, campaignId, brandId: camp.brandId, title: p.theme, body: p.body, status: "DRAFT", scheduledAt: isNaN(when.getTime()) ? null : when,
      createdById: owner, aiGenerated: true, tags: ["ai-calendar"], targets: { create: camp.accounts.map((a) => ({ accountId: a.accountId })) } } });
  }
  return posts.length;
}
