import { Bell } from "lucide-react";
import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { Card, Empty, PageHeader, cx } from "@/components/ui";
import { MarkAllRead } from "./MarkAllRead";
export const metadata = { title: "Notifications" };
export default async function Notifications({ searchParams }: { searchParams: Promise<{ unread?: string }> }) {
  const ctx = await requireCtx(); const sp = await searchParams;
  const list = await db.notification.findMany({ where: { userId: ctx.user.id, workspaceId: ctx.workspace.id, ...(sp.unread ? { readAt: null } : {}) }, orderBy: { createdAt: "desc" }, take: 200 });
  return (<>
    <PageHeader title="Notifications" actions={<><Link href={sp.unread ? "/notifications" : "/notifications?unread=1"} className="btn-secondary">{sp.unread ? "Show all" : "Unread only"}</Link><MarkAllRead /></>} />
    <Card pad={false}>{list.length === 0 ? <Empty icon={<Bell size={22} />} title="You're all caught up" body="Alerts about posts, messages and your team show up here." /> : <ul className="flex flex-col gap-1.5 p-2">{list.map((n) => (
      <li key={n.id} className={cx("rounded-[14px] px-4 py-3 transition hover:bg-[var(--soft)]", !n.readAt && "bg-[var(--accent-soft)]")}>
        <div className="flex items-start gap-3">{!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />}
          <div className="min-w-0 flex-1">{n.href ? <Link href={n.href} className="font-medium hover:underline">{n.title}</Link> : <span className="font-medium">{n.title}</span>}
            {n.body && <div className="muted mt-0.5 line-clamp-2 text-sm">{n.body}</div>}<div className="muted mt-1 text-xs">{fmtDate(n.createdAt, ctx.user.timezone)}{n.emailedAt ? " · emailed" : ""}</div></div></div>
      </li>))}</ul>}</Card>
  </>);
}
