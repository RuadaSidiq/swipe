import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { Notice, PageHeader } from "@/components/ui";
import { Assistant } from "./Assistant";
export const metadata = { title: "AI assistant" };
export default async function AssistantPage() {
  const ctx = await requireCtx();
  if (!ctx.can("ai.use")) return <Notice tone="warn">Your role doesn&apos;t include the AI assistant.</Notice>;
  const [brands, accounts] = await Promise.all([db.brand.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true } }), db.socialAccount.findMany({ where: { workspaceId: ctx.workspace.id, status: "CONNECTED" }, select: { platform: true } })]);
  return (<><PageHeader title="AI assistant" />
    {!env.aiConfigured ? <Notice tone="warn">AI isn&apos;t configured. Set <code>ANTHROPIC_API_KEY</code> on the server.</Notice> : <Assistant brands={brands} platforms={[...new Set(accounts.map((a) => a.platform))]} />}</>);
}
