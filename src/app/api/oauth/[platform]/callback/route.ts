import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProvider, redirectUri } from "@/lib/platforms/oauth";
import { PLATFORMS, type PlatformId } from "@/lib/platforms/registry";
import { saveDiscovered } from "@/lib/connect";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";

export async function GET(req: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(`${env.appUrl}/accounts?${q}`);
  const err = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (err) return back(`error=${encodeURIComponent(`Connection cancelled or denied: ${err}`)}`);
  const stateId = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const session = await getSession();
  const state = await db.oAuthState.findUnique({ where: { id: stateId } });
  if (state) await db.oAuthState.delete({ where: { id: stateId } }); // single use
  if (!session || !state || state.userId !== session.userId || state.platform !== platform || state.expiresAt < new Date() || !code)
    return back(`error=${encodeURIComponent("The sign-in link expired or was invalid. Please try connecting again.")}`);
  const p = PLATFORMS[platform as PlatformId];
  const ws = await db.workspace.findUniqueOrThrow({ where: { id: state.workspaceId } });
  try {
    const found = await getProvider(p.id)!.exchange(code, redirectUri(p.id), state.codeVerifier ?? undefined);
    const saved = await saveDiscovered(ws.id, ws.organizationId, session.userId, p.id, found);
    await audit({ user: { id: session.user.id, name: session.user.name } as never, workspace: { id: ws.id } as never }, "account.connect", { targetType: "social_account", detail: { platform: p.id, accounts: saved.map((s) => s.displayName) } });
    return back(`connected=${saved.length}&platform=${p.id}`);
  } catch (e) {
    return back(`error=${encodeURIComponent(`${p.name}: ${(e as Error).message}`)}`);
  }
}
