"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { clientIp, createSession, destroySession, hashPassword, validatePassword, verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";
import { createOrganizationWithWorkspace } from "@/lib/workspace";
import { env } from "@/lib/env";
import { randomToken, sha256, decrypt } from "@/lib/crypto";
import { cookies } from "next/headers";
import { verifyTotp } from "@/lib/totp";

export type FormState = { error?: string } | undefined;

export async function signup(_: FormState, fd: FormData): Promise<FormState> {
  const ip = await clientIp();
  if (!(await rateLimit(`signup:${ip}`, 10, 3600)).ok) return { error: "Too many sign-ups from this network. Try again later." };
  const parsed = z.object({ name: z.string().trim().min(1).max(80), email: z.string().trim().toLowerCase().email(), password: z.string(), company: z.string().trim().max(80).optional(),
    timezone: z.string().default("UTC"), invite: z.string().optional() }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Please fill in your name, a valid email and a password." };
  const { name, email, password, company, timezone, invite } = parsed.data;
  const pwErr = validatePassword(password);
  if (pwErr) return { error: pwErr };
  if (await db.user.findUnique({ where: { email } })) return { error: "An account with this email already exists. Sign in instead." };
  const user = await db.user.create({ data: { name, email, passwordHash: await hashPassword(password), timezone, isPlatformAdmin: env.adminEmails.includes(email) } });
  await audit(null, "user.signup", { targetType: "user", targetId: user.id, ip });
  if (invite) {
    await createSession(user.id);
    redirect(`/invite/${invite}`);
  }
  const ws = await createOrganizationWithWorkspace(user.id, company || `${name}'s organization`, company || "My workspace", timezone);
  await createSession(user.id, ws.id);
  redirect("/dashboard?welcome=1");
}

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const ip = await clientIp();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const next = String(fd.get("next") ?? "");
  if (!(await rateLimit(`login:${ip}`, 30, 900)).ok || !(await rateLimit(`login:${email}`, 10, 900)).ok) return { error: "Too many attempts. Wait 15 minutes and try again." };
  const user = await db.user.findUnique({ where: { email } });
  if (user?.lockedUntil && user.lockedUntil > new Date()) return { error: "This account is temporarily locked after repeated failed sign-ins. Try again later." };
  if (!user || !(await verifyPassword(password, user.passwordHash)) || user.disabledAt) {
    if (user) {
      const fails = user.failedLogins + 1;
      await db.user.update({ where: { id: user.id }, data: { failedLogins: fails, lockedUntil: fails >= 8 ? new Date(Date.now() + 15 * 60_000) : null } });
      await audit(null, "user.login_failed", { targetType: "user", targetId: user.id, ip });
    }
    return { error: "Incorrect email or password." };
  }
  await db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, isPlatformAdmin: user.isPlatformAdmin || env.adminEmails.includes(email) } });
  if (user.totpEnabledAt) {
    // Password is right, but a second factor is required before a session exists.
    const token = randomToken(32);
    await db.pendingLogin.deleteMany({ where: { OR: [{ userId: user.id }, { expiresAt: { lt: new Date() } }] } });
    await db.pendingLogin.create({ data: { id: sha256(token), userId: user.id, next: next.startsWith("/") && !next.startsWith("//") ? next : null, expiresAt: new Date(Date.now() + 5 * 60_000) } });
    (await cookies()).set("orbit_2fa", token, { httpOnly: true, secure: env.isProd, sameSite: "lax", path: "/", maxAge: 300 });
    redirect("/login/2fa");
  }
  await createSession(user.id);
  await audit(null, "user.login", { targetType: "user", targetId: user.id, ip });
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function acceptInvite(token: string) {
  const { requireUser } = await import("@/lib/auth");
  const s = await requireUser();
  const inv = await db.invite.findUnique({ where: { tokenHash: sha256(token) } });
  if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new Error("This invitation is invalid or has expired.");
  if (inv.email.toLowerCase() !== s.user.email.toLowerCase()) throw new Error(`This invitation was sent to ${inv.email}. Sign in with that email to accept it.`);
  await db.$transaction([
    db.membership.upsert({ where: { userId_workspaceId: { userId: s.userId, workspaceId: inv.workspaceId } }, create: { userId: s.userId, workspaceId: inv.workspaceId, role: inv.role }, update: {} }),
    db.invite.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } }),
    db.session.update({ where: { id: s.id }, data: { workspaceId: inv.workspaceId } }),
  ]);
  await audit({ user: { id: s.user.id, name: s.user.name } as never, workspace: { id: inv.workspaceId } as never }, "team.invite_accepted", { targetType: "invite", targetId: inv.id });
  redirect("/dashboard");
}

export async function createFirstWorkspace(fd: FormData) {
  const { requireUser } = await import("@/lib/auth");
  const s = await requireUser();
  const name = String(fd.get("name") ?? "").trim() || "My workspace";
  const ws = await createOrganizationWithWorkspace(s.userId, name, name, String(fd.get("timezone") ?? "UTC"));
  await db.session.update({ where: { id: s.id }, data: { workspaceId: ws.id } });
  redirect("/dashboard?welcome=1");
}

export async function verifySecondFactor(_: FormState, fd: FormData): Promise<FormState> {
  const c = await cookies();
  const token = c.get("orbit_2fa")?.value;
  const pending = token ? await db.pendingLogin.findUnique({ where: { id: sha256(token) } }) : null;
  if (!pending || pending.expiresAt < new Date()) return { error: "Your sign-in expired. Please sign in again." };
  if (pending.attempts >= 5) { await db.pendingLogin.delete({ where: { id: pending.id } }); return { error: "Too many incorrect codes. Please sign in again." }; }
  const user = await db.user.findUniqueOrThrow({ where: { id: pending.userId } });
  const code = String(fd.get("code") ?? "").trim();
  let ok = false;
  if (/^\d{6}$/.test(code.replace(/\s/g, "")) && user.totpSecretEnc) {
    const step = verifyTotp(decrypt(user.totpSecretEnc), code);
    if (step !== null && step > (user.totpLastStep ?? -1)) { ok = true; await db.user.update({ where: { id: user.id }, data: { totpLastStep: step } }); }
  } else if (code) {
    const h = sha256(code.toLowerCase());
    if (user.recoveryCodes.includes(h)) { ok = true; await db.user.update({ where: { id: user.id }, data: { recoveryCodes: user.recoveryCodes.filter((x) => x !== h) } }); await audit(null, "user.recovery_code_used", { targetType: "user", targetId: user.id }); }
  }
  if (!ok) { await db.pendingLogin.update({ where: { id: pending.id }, data: { attempts: { increment: 1 } } }); return { error: "That code isn't valid. Check your authenticator app and try again." }; }
  await db.pendingLogin.delete({ where: { id: pending.id } });
  c.delete("orbit_2fa");
  await createSession(user.id);
  await audit(null, "user.login", { targetType: "user", targetId: user.id, ip: await clientIp(), detail: { mfa: true } });
  redirect(pending.next ?? "/dashboard");
}
