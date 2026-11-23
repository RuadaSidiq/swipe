import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { db } from "./db";
import { randomToken, sha256 } from "./crypto";
import { can, ForbiddenError, type Permission } from "./rbac";
import { env } from "./env";

const COOKIE = "swipe_session";
const TTL_DAYS = 14;

export async function hashPassword(pw: string) { return bcrypt.hash(pw, 12); }
export async function verifyPassword(pw: string, hash: string) { return bcrypt.compare(pw, hash); }

export function validatePassword(pw: string): string | null {
  if (pw.length < 10) return "Password must be at least 10 characters.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Password must include letters and numbers.";
  return null;
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

export async function createSession(userId: string, workspaceId?: string) {
  const token = randomToken(32);
  const h = await headers();
  await db.session.create({
    data: { tokenHash: sha256(token), userId, workspaceId, userAgent: h.get("user-agent")?.slice(0, 300), ip: await clientIp(),
      expiresAt: new Date(Date.now() + TTL_DAYS * 86400_000) },
  });
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: env.isProd, sameSite: "lax", path: "/", maxAge: TTL_DAYS * 86400 });
}

export async function destroySession() {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  c.delete(COOKIE);
}

export async function getSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || session.user.disabledAt) return null;
  // touch at most every 10 minutes
  if (!session.user.lastActiveAt || Date.now() - session.user.lastActiveAt.getTime() > 600_000) {
    await db.user.update({ where: { id: session.userId }, data: { lastActiveAt: new Date() } });
  }
  return session;
}

export async function requireUser() {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export interface Ctx {
  sessionId: string;
  user: { id: string; name: string; email: string; timezone: string; isPlatformAdmin: boolean };
  workspace: { id: string; name: string; slug: string; timezone: string; requireApproval: boolean; organizationId: string; isDemo: boolean };
  membershipId: string;
  role: Role;
  can: (p: Permission) => boolean;
  assert: (p: Permission) => void;
}

/** Resolves the signed-in user and active workspace. Every tenant-scoped query must use ctx.workspace.id. */
export async function requireCtx(): Promise<Ctx> {
  const s = await requireUser();
  const memberships = await db.membership.findMany({ where: { userId: s.userId }, include: { workspace: true }, orderBy: { createdAt: "asc" } });
  if (memberships.length === 0) redirect("/onboarding");
  const m = memberships.find((x) => x.workspaceId === s.workspaceId) ?? memberships[0];
  if (m.workspaceId !== s.workspaceId) await db.session.update({ where: { id: s.id }, data: { workspaceId: m.workspaceId } });
  const role = m.role;
  return {
    sessionId: s.id,
    user: { id: s.user.id, name: s.user.name, email: s.user.email, timezone: s.user.timezone, isPlatformAdmin: s.user.isPlatformAdmin },
    workspace: { id: m.workspace.id, name: m.workspace.name, slug: m.workspace.slug, timezone: m.workspace.timezone,
      requireApproval: m.workspace.requireApproval, organizationId: m.workspace.organizationId, isDemo: m.workspace.isDemo },
    membershipId: m.id,
    role,
    can: (p) => can(role, p),
    assert: (p) => { if (!can(role, p)) throw new ForbiddenError(p); },
  };
}

export async function requirePlatformAdmin() {
  const s = await requireUser();
  if (!s.user.isPlatformAdmin) redirect("/dashboard");
  return s;
}
