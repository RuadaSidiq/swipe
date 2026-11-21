import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { PageHeader, Notice } from "@/components/ui";
import { canPublish as platformCanPublish, PLATFORMS, type PlatformId } from "@/lib/platforms/registry";
import { Composer, type Initial } from "./Composer";

export const metadata = { title: "Publisher" };

export default async function PublisherPage({ searchParams }: { searchParams: Promise<{ id?: string; date?: string; campaign?: string; media?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  if (!ctx.can("posts.create") && !ctx.can("posts.edit")) return <Notice tone="warn">Your role can&apos;t create posts.</Notice>;
  const ws = ctx.workspace.id;
  const [accountsRaw, media, campaigns, brands, post] = await Promise.all([
    db.socialAccount.findMany({ where: { workspaceId: ws, status: { not: "DISCONNECTED" } }, select: { id: true, platform: true, displayName: true, username: true, avatarUrl: true, isDemo: true, isDefault: true, status: true, brandId: true, meta: true }, orderBy: [{ platform: "asc" }] }),
    db.mediaAsset.findMany({ where: { workspaceId: ws }, orderBy: { createdAt: "desc" }, take: 300 }),
    db.campaign.findMany({ where: { workspaceId: ws, status: { not: "completed" } }, select: { id: true, name: true } }),
    db.brand.findMany({ where: { workspaceId: ws }, select: { id: true, name: true } }),
    sp.id ? db.post.findFirst({ where: { id: sp.id, workspaceId: ws }, include: { targets: true } }) : null,
  ]);
  const accounts = accountsRaw.filter((a) => platformCanPublish(PLATFORMS[a.platform as PlatformId]));
  if (sp.id && !post) return <Notice tone="error">Post not found.</Notice>;
  if (post && ["PUBLISHED", "PUBLISHING"].includes(post.status)) return <Notice tone="warn">Published posts can&apos;t be edited. Duplicate it instead.</Notice>;
  const initial: Initial = post ? {
    id: post.id, title: post.title, body: post.body, link: post.link ?? "", mediaIds: post.mediaIds, campaignId: post.campaignId ?? "", brandId: post.brandId ?? "", tags: post.tags,
    scheduledAt: post.scheduledAt?.toISOString() ?? "", status: post.status, recurrence: post.recurrence as Initial["recurrence"],
    targets: post.targets.filter((t) => t.status !== "PUBLISHED").map((t) => ({ accountId: t.accountId, customize: t.body !== null || t.title !== null, body: t.body ?? "", title: t.title ?? "", link: t.link ?? "",
      useCustomMedia: t.useCustomMedia, mediaIds: t.mediaIds, options: (t.options ?? {}) as Record<string, unknown> })),
  } : {
    title: "", body: "", link: "", mediaIds: sp.media ? [sp.media] : [], campaignId: sp.campaign ?? "", brandId: "", tags: [], scheduledAt: sp.date ?? "",
    targets: accounts.filter((a) => a.isDefault && a.status === "CONNECTED").map((a) => ({ accountId: a.id, customize: false, body: "", title: "", link: "", useCustomMedia: false, mediaIds: [], options: {} })),
  };
  return (
    <>
      <PageHeader title={post ? "Edit post" : "Create post"} />
      
      <Composer accounts={JSON.parse(JSON.stringify(accounts))} media={JSON.parse(JSON.stringify(media))} campaigns={campaigns} brands={brands} initial={initial}
        canPublish={ctx.can("posts.publish")} canSchedule={ctx.can("posts.schedule") || (ctx.workspace.requireApproval && ctx.can("posts.create"))}
        needsApproval={ctx.workspace.requireApproval && !ctx.can("posts.approve")} aiEnabled={env.aiConfigured && ctx.can("ai.use")} timezone={ctx.user.timezone || ctx.workspace.timezone} />
    </>
  );
}
