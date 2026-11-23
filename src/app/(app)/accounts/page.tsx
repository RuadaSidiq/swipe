import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { accountSelect } from "@/lib/accounts";
import { PLATFORM_LIST, isPlatformConfigured } from "@/lib/platforms/registry";
import { getPlan, usage } from "@/lib/billing";
import { isUnlimited } from "@/lib/plans";
import { env } from "@/lib/env";
import { PageHeader, Notice } from "@/components/ui";
import { AccountsClient } from "./AccountsClient";

export const metadata = { title: "Accounts" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string; platform?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  const [accounts, brands, { plan }, u] = await Promise.all([
    db.socialAccount.findMany({ where: { workspaceId: ctx.workspace.id }, select: accountSelect, orderBy: [{ platform: "asc" }, { createdAt: "asc" }] }),
    db.brand.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true } }),
    getPlan(ctx.workspace.organizationId), usage(ctx.workspace.organizationId),
  ]);
  const platforms = PLATFORM_LIST.map((p) => ({ ...p, configured: isPlatformConfigured(p.id) }));
  return (
    <>
      <PageHeader title="Social accounts" subtitle="Connect the accounts Swipe posts to and replies from." />
      <div className="mb-4 space-y-2">
        {sp.connected && <Notice tone="success">Connected {sp.connected} account{sp.connected === "1" ? "" : "s"}.</Notice>}
        {sp.error && <Notice tone="error">{sp.error}</Notice>}
      </div>
      <AccountsClient accounts={JSON.parse(JSON.stringify(accounts))} brands={brands} platforms={platforms} demoMode={env.demoMode}
        canConnect={ctx.can("accounts.connect")} canManage={ctx.can("accounts.manage")} appUrl={env.appUrl} />
    </>
  );
}
