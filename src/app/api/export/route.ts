import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

/** Full workspace data export (JSON). Tokens and secrets are never included. */
export async function GET() {
  const ctx = await requireCtx();
  if (ctx.role !== "OWNER" && ctx.role !== "ADMIN") return new Response("Forbidden", { status: 403 });
  const w = ctx.workspace.id;
  const [workspace, brands, accounts, posts, campaigns, media, conversations, contacts, automations, members] = await Promise.all([
    db.workspace.findUnique({ where: { id: w } }), db.brand.findMany({ where: { workspaceId: w } }),
    db.socialAccount.findMany({ where: { workspaceId: w }, select: { id: true, platform: true, externalId: true, displayName: true, username: true, status: true, scopes: true, createdAt: true } }),
    db.post.findMany({ where: { workspaceId: w }, include: { targets: { select: { accountId: true, status: true, externalId: true, externalUrl: true, publishedAt: true, error: true, body: true, title: true } }, comments: true } }),
    db.campaign.findMany({ where: { workspaceId: w } }), db.mediaAsset.findMany({ where: { workspaceId: w }, select: { id: true, filename: true, mimeType: true, sizeBytes: true, tags: true, altText: true, createdAt: true } }),
    db.conversation.findMany({ where: { workspaceId: w }, include: { messages: true, notes: true } }), db.contact.findMany({ where: { workspaceId: w } }), db.automation.findMany({ where: { workspaceId: w } }),
    db.membership.findMany({ where: { workspaceId: w }, select: { role: true, user: { select: { name: true, email: true } } } }),
  ]);
  await audit(ctx, "workspace.export");
  return new Response(JSON.stringify({ exportedAt: new Date(), workspace, members, brands, accounts, posts, campaigns, media, conversations, contacts, automations }, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="swipe-${workspace?.slug}-export.json"` } });
}
