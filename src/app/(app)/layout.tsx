import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getPlan } from "@/lib/billing";
import { Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  const ws = ctx.workspace.id;
  const [workspaces, inbox, notifications, approvals, accounts, plan] = await Promise.all([
    db.membership.findMany({ where: { userId: ctx.user.id }, include: { workspace: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
    ctx.can("inbox.view") ? db.conversation.count({ where: { workspaceId: ws, unread: true, status: { in: ["OPEN", "PENDING"] } } }) : 0,
    db.notification.count({ where: { userId: ctx.user.id, workspaceId: ws, readAt: null } }),
    ctx.can("posts.approve") ? db.post.count({ where: { workspaceId: ws, status: "PENDING_APPROVAL" } }) : 0,
    db.socialAccount.count({ where: { workspaceId: ws, status: { in: ["EXPIRED", "REVOKED", "ERROR"] } } }),
    getPlan(ctx.workspace.organizationId),
  ]);
  const banners = (
    <>
      {plan.status === "trial_expired" && <div className="no-print mx-4 rounded-lg bg-amber-400/20 px-4 py-2 text-sm md:mx-8">Trial ended. You&apos;re on Free limits. <Link className="font-medium underline" href="/billing">Choose a plan</Link></div>}
      {plan.status === "past_due" && <div className="no-print mx-4 rounded-lg bg-red-500/15 px-4 py-2 text-sm md:mx-8">Payment failed. <Link className="font-medium underline" href="/billing">Update billing</Link></div>}
    </>
  );
  return (
    <Shell user={ctx.user} workspace={ctx.workspace} workspaces={workspaces.map((m) => m.workspace)} counts={{ inbox, notifications, approvals, accounts }} demo={env.demoMode} banners={banners}>
      {children}
    </Shell>
  );
}
