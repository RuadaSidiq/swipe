/**
 * Seeds a clearly-labelled DEMO workspace so the product can be explored without connecting real accounts.
 * Every demo account is isDemo=true and every demo metric has source "Demo sample data (simulated)".
 * Run: npm run db:seed   (requires DEMO_MODE=true to be useful)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { addDays, addHours, subDays, subHours } from "date-fns";

const db = new PrismaClient();
const SRC = "Demo sample data (simulated)";

async function main() {
  const email = process.env.SEED_EMAIL ?? "demo@orbit.local";
  const password = process.env.SEED_PASSWORD ?? "orbit-demo-2026";
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) { console.log(`Seed user ${email} already exists — skipping.`); return; }

  const user = await db.user.create({ data: { email, name: "Dana Demo", passwordHash: await bcrypt.hash(password, 12), timezone: "UTC", isPlatformAdmin: true } });
  const colleague = await db.user.create({ data: { email: "sam@orbit.local", name: "Sam Support", passwordHash: await bcrypt.hash(password, 12) } });
  const org = await db.organization.create({ data: { name: "Acme Coffee Co. (Demo)", subscription: { create: { plan: "agency", status: "active" } } } });
  const ws = await db.workspace.create({ data: { organizationId: org.id, name: "Acme Coffee (Demo)", slug: "acme-coffee-demo", isDemo: true, timezone: "UTC" } });
  const owner = await db.membership.create({ data: { userId: user.id, workspaceId: ws.id, role: "OWNER" } });
  const support = await db.membership.create({ data: { userId: colleague.id, workspaceId: ws.id, role: "SUPPORT" } });
  const brand = await db.brand.create({ data: { workspaceId: ws.id, name: "Acme Coffee", isDefault: true, description: "Independent specialty coffee roaster with 3 cafés and an online shop.",
    audience: "Coffee lovers aged 22–45, remote workers, home baristas.", tone: "Warm, playful, knowledgeable — never snobby. Short sentences. Light emoji use.",
    products: "Single-origin beans, House Blend, cold brew cans, monthly subscription box, barista workshops.", guidelines: "Always credit farmers by region. No claims about health benefits. Use 'cafés' not 'shops'.",
    bannedWords: "cheap, basic", defaultHashtags: "#AcmeCoffee #SpecialtyCoffee", examples: "Monday called. It wants a flat white. ☕️ Our Ethiopian Guji is back on the bar this week.\n\nCold brew season is officially open. 12 hours of patience, zero bitterness." } });

  const defs = [
    ["instagram", "Acme Coffee", "acmecoffee", 12480], ["facebook", "Acme Coffee Co.", null, 8320], ["linkedin", "Acme Coffee Co.", null, 2140], ["x", "Acme Coffee", "acme_coffee", 5610],
    ["tiktok", "Acme Coffee", "acmecoffee", 20450], ["youtube", "Acme Coffee TV", "@acmecoffeetv", 3120], ["threads", "Acme Coffee", "acmecoffee", 1890], ["telegram", "Acme Coffee News", "acmecoffeenews", 940],
    ["whatsapp", "Acme Coffee Support", "+1 555 0100", null], ["pinterest", "Acme Coffee", "acmecoffee", 1230],
  ] as const;
  const accounts: Record<string, string> = {};
  for (const [platform, name, username, followers] of defs) {
    const a = await db.socialAccount.create({ data: { workspaceId: ws.id, brandId: brand.id, platform, externalId: `demo-${platform}`, displayName: name, username, isDemo: true, scopes: ["demo"],
      isDefault: ["instagram", "facebook", "linkedin"].includes(platform), accountType: platform === "facebook" ? "page" : platform === "youtube" ? "channel" : "profile",
      meta: platform === "pinterest" ? { boards: [{ id: "demo-board", name: "Latte art" }] } : {}, lastSyncedAt: new Date() } });
    accounts[platform] = a.id;
    if (followers) {
      let v = followers * 0.93;
      for (let d = 60; d >= 0; d--) {
        v += followers * (0.0008 + Math.random() * 0.0018) * (platform === "tiktok" ? 1.6 : 1);
        await db.metricSnapshot.create({ data: { accountId: a.id, metric: "followers", value: Math.round(v), periodStart: subDays(new Date(), d + 1), periodEnd: subDays(new Date(), d), source: SRC } });
      }
    }
  }

  const campaign = await db.campaign.create({ data: { workspaceId: ws.id, brandId: brand.id, name: "Cold Brew Launch", description: "Launch of our new canned cold brew across all cafés and online.", goals: "2,000 cans sold in the first month; grow Instagram by 5%.",
    color: "#1baf7a", status: "active", startDate: subDays(new Date(), 7), endDate: addDays(new Date(), 21), memberIds: [owner.id, support.id],
    accounts: { create: ["instagram", "facebook", "tiktok", "x"].map((p) => ({ accountId: accounts[p] })) } } });

  const posts: { body: string; title?: string; status: "PUBLISHED" | "SCHEDULED" | "DRAFT" | "PENDING_APPROVAL" | "FAILED"; at: Date; plats: string[]; camp?: boolean }[] = [
    { body: "Cold brew season is officially open. 12 hours of patience, zero bitterness. 🧊☕️ Grab a can at any Acme café. #AcmeCoffee #ColdBrew", status: "PUBLISHED", at: subDays(new Date(), 6), plats: ["instagram", "facebook", "threads"], camp: true },
    { body: "We're hiring baristas for our new Riverside café! Love coffee and people? Apply via the link in bio.", status: "PUBLISHED", at: subDays(new Date(), 4), plats: ["linkedin", "facebook"] },
    { body: "Behind the scenes: how we roast our Ethiopian Guji. 🔥", title: "How we roast Ethiopian Guji", status: "PUBLISHED", at: subDays(new Date(), 3), plats: ["youtube", "tiktok"], camp: true },
    { body: "Cold brew, but make it fizzy. Our sparkling cold brew lands Friday. 🫧", status: "PUBLISHED", at: subDays(new Date(), 2), plats: ["x", "instagram"], camp: true },
    { body: "Weekend workshop: latte art for beginners. 8 spots left!", status: "FAILED", at: subDays(new Date(), 1), plats: ["x"] },
    { body: "New single-origin drop: Colombia Huila. Notes of red apple and panela. Available online tomorrow.", status: "SCHEDULED", at: addHours(new Date(), 20), plats: ["instagram", "facebook", "x", "threads"] },
    { body: "Cold brew giveaway! Tag a friend who needs caffeine. 3 winners announced Monday. 🎉", status: "SCHEDULED", at: addDays(new Date(), 3), plats: ["instagram", "tiktok"], camp: true },
    { body: "Why we pay farmers above Fair Trade prices — a thread on sourcing.", status: "PENDING_APPROVAL", at: addDays(new Date(), 5), plats: ["linkedin", "x"] },
    { body: "Ideas for our 5th anniversary post…", status: "DRAFT", at: addDays(new Date(), 9), plats: ["instagram"] },
    { body: "Cold brew recipe card for home baristas. Save this!", title: "Cold brew at home", status: "SCHEDULED", at: addDays(new Date(), 6), plats: ["pinterest", "telegram"], camp: true },
  ];
  for (const p of posts) {
    const post = await db.post.create({ data: { workspaceId: ws.id, brandId: brand.id, campaignId: p.camp ? campaign.id : null, body: p.body, title: p.title ?? "", status: p.status, scheduledAt: p.at,
      publishedAt: p.status === "PUBLISHED" ? p.at : null, createdById: user.id, approvedById: p.status === "PUBLISHED" ? user.id : null } });
    for (const pl of p.plats) {
      const tStatus = p.status === "PUBLISHED" ? "PUBLISHED" : p.status === "FAILED" ? "FAILED" : p.status === "SCHEDULED" ? "SCHEDULED" : "DRAFT";
      const t = await db.postTarget.create({ data: { postId: post.id, accountId: accounts[pl], status: tStatus, scheduledAt: p.at, nextAttemptAt: tStatus === "SCHEDULED" ? p.at : null, simulated: tStatus === "PUBLISHED",
        externalId: tStatus === "PUBLISHED" ? `demo_${post.id}_${pl}` : null, publishedAt: tStatus === "PUBLISHED" ? p.at : null,
        error: tStatus === "FAILED" ? "X: You are not permitted to perform this action. Your API plan may not include write access. (HTTP 403)" : null, errorCode: tStatus === "FAILED" ? "403" : null, attempts: tStatus === "FAILED" ? 1 : 0 } });
      if (tStatus === "PUBLISHED") {
        const base = { instagram: 600, facebook: 220, threads: 90, linkedin: 140, youtube: 300, tiktok: 1500, x: 120 }[pl] ?? 100;
        const m = { likes: Math.round(base * (0.6 + Math.random())), comments: Math.round(base * 0.06 * (0.5 + Math.random())), shares: Math.round(base * 0.04 * (0.5 + Math.random())), views: Math.round(base * 14 * (0.7 + Math.random())) };
        for (const [metric, value] of Object.entries(m)) await db.metricSnapshot.create({ data: { accountId: accounts[pl], targetId: t.id, metric, value, periodStart: p.at, periodEnd: new Date(), source: SRC } });
        await db.publishAttempt.create({ data: { targetId: t.id, ok: true, message: "Simulated publish (demo account) — nothing was sent to the network" } });
      }
      if (tStatus === "FAILED") await db.publishAttempt.create({ data: { targetId: t.id, ok: false, message: "X: You are not permitted to perform this action. (HTTP 403)" } });
    }
    if (p.status === "PENDING_APPROVAL") await db.postComment.create({ data: { postId: post.id, userId: user.id, userName: user.name, body: "Submitted for approval", kind: "submitted" } });
  }

  const convs = [
    ["instagram", "dm", "Maya R.", "maya.r", ["Hi! Do you ship the House Blend to Canada?", "And is there a subscription option?"], false],
    ["facebook", "comment", "Tom Becker", null, ["The new cold brew is amazing 😍 when is it coming to the Downtown café?"], false],
    ["whatsapp", "dm", "Priya S.", "+15550123", ["Hello, I was charged twice for my subscription this month. Can you help me get a refund?"], true],
    ["telegram", "dm", "Alex", "alexbrews", ["Will the barista workshop be recorded?"], false],
    ["instagram", "comment", "coffee_nerd_88", "coffee_nerd_88", ["What's the roast date on the Guji bags?"], false],
    ["instagram", "mention", "Lena K.", "lenak", ["You were mentioned in a post caption."], false],
  ] as const;
  for (const [pl, kind, name, handle, msgs, priority] of convs) {
    const contact = await db.contact.create({ data: { workspaceId: ws.id, platform: pl, externalId: `demo-${pl}-${name}`, displayName: name, username: handle, status: priority ? "customer" : "contact", lastInteractionAt: subHours(new Date(), 2) } });
    const c = await db.conversation.create({ data: { workspaceId: ws.id, accountId: accounts[pl], contactId: contact.id, kind, externalThreadId: `demo-thread-${pl}-${name}`, isDemo: true, priority,
      tags: priority ? ["billing"] : [], lastMessagePreview: msgs.at(-1)!, lastMessageAt: subHours(new Date(), msgs.length), subject: kind === "comment" ? "Cold brew season is officially open…" : null,
      assigneeId: priority ? support.id : null } });
    for (let i = 0; i < msgs.length; i++) await db.message.create({ data: { conversationId: c.id, direction: "inbound", externalId: `demo-msg-${c.id}-${i}`, authorName: name, authorHandle: handle, body: msgs[i], createdAt: subHours(new Date(), msgs.length - i + 1) } });
  }
  await db.savedReply.createMany({ data: [
    { workspaceId: ws.id, title: "Shipping info", body: "Hi {name}! We ship within the US and Canada — orders over $40 ship free. 📦" },
    { workspaceId: ws.id, title: "Move to DM", body: "Thanks {name}! We've sent you a direct message so we can sort this out privately." },
  ] });
  await db.automation.create({ data: { workspaceId: ws.id, name: "Flag billing complaints", trigger: "message.received", createdById: user.id,
    conditions: [{ field: "text", op: "contains", value: "refund, charged, billing" }], actions: [{ type: "set_priority" }, { type: "add_tag", tag: "billing" }, { type: "notify", target: "managers", message: "Billing issue in inbox" }] } });
  await db.postingSlot.createMany({ data: [1, 3, 5].flatMap((d) => [{ workspaceId: ws.id, weekday: d, minuteOfDay: 9 * 60 }, { workspaceId: ws.id, weekday: d, minuteOfDay: 17 * 60 + 30 }]) });
  await db.featureFlag.createMany({ data: [{ key: "ai_assistant", enabled: true, description: "AI writing and reply tools" }, { key: "new_calendar", enabled: true, description: "Calendar drag & drop" }], skipDuplicates: true });
  await db.notification.create({ data: { workspaceId: ws.id, userId: user.id, type: "publish_failed", title: "Failed to publish to Acme Coffee", body: "X: Your API plan may not include write access.", href: "/posts?status=FAILED" } });
  console.log(`Seeded demo workspace. Sign in with ${email} / ${password}`);
}
main().finally(() => db.$disconnect());
