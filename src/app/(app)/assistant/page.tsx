import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { Card, Empty, Notice, PageHeader } from "@/components/ui";
import { Sparkles } from "lucide-react";
import { Assistant } from "./Assistant";
export const metadata = { title: "AI assistant" };
export default async function AssistantPage() {
  const ctx = await requireCtx();
  if (!ctx.can("ai.use")) return <Notice tone="warn">Your role doesn&apos;t include the AI assistant.</Notice>;
  const [brands, accounts] = await Promise.all([db.brand.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true } }), db.socialAccount.findMany({ where: { workspaceId: ctx.workspace.id, status: "CONNECTED" }, select: { platform: true } })]);
  return (<><PageHeader title="AI assistant" />
    {!env.aiConfigured ? <Card><Empty icon={<Sparkles size={22} />} title="AI isn't set up yet" body="Add an Anthropic API key in your hosting settings to write, rewrite and plan posts with AI." /></Card> : <Assistant brands={brands} platforms={[...new Set(accounts.map((a) => a.platform))]} />}</>);
}
