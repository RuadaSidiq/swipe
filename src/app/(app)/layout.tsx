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
      {env.demoMode && <div className="no-print bg-fuchsia-600 px-4 py-1.5 text-center text-xs font-medium text-white">Demo mode is on — accounts marked DEMO are sandboxes: their publishing and replies are simulated and clearly labelled. Turn DEMO_MODE off in production.</div>}
      {plan.status === "trial_expired" && <div className="no-print bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-black">Your trial has ended and the workspace is on Free limits. <Link className="underline" href="/billing">Choose a plan</Link></div>}
      {plan.status === "past_due" && <div className="no-print bg-red-600 px-4 py-1.5 text-center text-xs font-medium text-white">Your last payment failed. <Link className="underline" href="/billing">Update billing</Link> to avoid interruption.</div>}
    </>
  );
  return (
    <Shell user={ctx.user} workspace={ctx.workspace} workspaces={workspaces.map((m) => m.workspace)} counts={{ inbox, notifications, approvals, accounts }} banners={banners}>
      {children}
    </Shell>
  );
}
