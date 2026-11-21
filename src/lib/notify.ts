import { db } from "./db";
import { can, type Permission } from "./rbac";
import { env } from "./env";

export const NOTIFICATION_TYPES: Record<string, { label: string; defaultEmail: boolean }> = {
  message: { label: "New messages", defaultEmail: false },
  comment: { label: "New comments", defaultEmail: false },
  mention: { label: "New mentions", defaultEmail: false },
  publish_success: { label: "Post published", defaultEmail: false },
  publish_failed: { label: "Publishing failures", defaultEmail: true },
  schedule_reminder: { label: "Scheduled post reminders", defaultEmail: false },
  account_auth: { label: "Account authorization problems", defaultEmail: true },
  integration_error: { label: "Integration errors", defaultEmail: true },
  assignment: { label: "Team assignments", defaultEmail: true },
  approval: { label: "Pending approvals", defaultEmail: true },
  automation: { label: "Automation alerts", defaultEmail: false },
};

interface N { type: string; title: string; body?: string; href?: string }

export async function notifyUsers(workspaceId: string, userIds: string[], n: N) {
  if (!userIds.length) return;
  const prefs = await db.notificationPreference.findMany({ where: { userId: { in: userIds }, type: n.type } });
  const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } });
  for (const u of users) {
    const p = prefs.find((x) => x.userId === u.id);
    const inApp = p?.inApp ?? true;
    const email = p?.email ?? NOTIFICATION_TYPES[n.type]?.defaultEmail ?? false;
    if (inApp || email) {
      const row = await db.notification.create({ data: { workspaceId, userId: u.id, type: n.type, title: n.title, body: n.body ?? "", href: n.href, readAt: inApp ? null : new Date() } });
      if (email) void sendEmail(u.email, n.title, `${n.body ?? ""}\n\n${n.href ? env.appUrl + n.href : env.appUrl}`).then(async (ok) => { if (ok) await db.notification.update({ where: { id: row.id }, data: { emailedAt: new Date() } }); });
    }
  }
}

/** Notify every member of a workspace holding any of the given permissions. */
export async function notifyWorkspace(workspaceId: string, n: N, perms: Permission[] = []) {
  const members = await db.membership.findMany({ where: { workspaceId } });
  const ids = members.filter((m) => perms.length === 0 || perms.some((p) => can(m.role, p))).map((m) => m.userId);
  await notifyUsers(workspaceId, ids, n);
}

export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) { if (!env.isProd) console.info(`[email:dev] to=${to} subject=${subject}`); return false; }
  try {
    const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Orbit <onboarding@resend.dev>", to, subject, text }) });
    return r.ok;
  } catch { return false; }
}
