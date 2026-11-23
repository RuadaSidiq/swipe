import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { Notice, PageHeader } from "@/components/ui";
import { Assistant } from "./Assistant";
export const metadata = { title: "Swipe AI" };
export default async function AssistantPage() {
  const ctx = await requireCtx();
  if (!ctx.can("ai.use")) return <Notice tone="warn">Your role doesn&apos;t include the AI assistant.</Notice>;
  const [brands, accounts] = await Promise.all([db.brand.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true } }), db.socialAccount.findMany({ where: { workspaceId: ctx.workspace.id, status: "CONNECTED" }, select: { platform: true } })]);
  return (<><PageHeader title="Swipe AI" subtitle="Your AI social media manager. It knows your brand and your data." />
    {!env.aiConfigured && <div className="mb-4"><Notice tone="warn">Swipe AI isn&apos;t switched on yet. It starts working as soon as an Anthropic API key is added to the server.</Notice></div>}
    <Assistant offline={!env.aiConfigured} brands={brands} platforms={[...new Set(accounts.map((a) => a.platform))]} /></>);
}
