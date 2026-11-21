import { NextResponse } from "next/server";
import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { pkce, randomToken } from "@/lib/crypto";
import { buildAuthorizeUrl, getProvider } from "@/lib/platforms/oauth";
import { PLATFORMS, isPlatformConfigured, type PlatformId } from "@/lib/platforms/registry";
import { enforceLimit } from "@/lib/billing";
import { env } from "@/lib/env";

export async function GET(_: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const back = (msg: string) => NextResponse.redirect(`${env.appUrl}/accounts?error=${encodeURIComponent(msg)}`);
  const ctx = await requireCtx();
  if (!ctx.can("accounts.connect")) return back("You don't have permission to connect accounts.");
  const p = PLATFORMS[platform as PlatformId];
  if (!p || !getProvider(p.id)) return back("This network doesn't connect through OAuth.");
  if (!isPlatformConfigured(p.id)) return back(`${p.name} isn't configured on this server yet (missing ${p.requiredEnv.join(", ")}).`);
  try { await enforceLimit(ctx.workspace.organizationId, "accounts"); } catch (e) { return back((e as Error).message); }
  const state = randomToken(24);
  const { verifier, challenge } = pkce();
  await db.oAuthState.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.oAuthState.create({ data: { id: state, workspaceId: ctx.workspace.id, userId: ctx.user.id, platform: p.id, codeVerifier: verifier, expiresAt: new Date(Date.now() + 10 * 60_000) } });
  return NextResponse.redirect(buildAuthorizeUrl(p.id, state, challenge));
}
