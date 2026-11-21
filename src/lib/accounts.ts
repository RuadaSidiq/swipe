import { db } from "./db";
import { decryptOpt, encrypt, encryptOpt } from "./crypto";
import type { AdapterAccount } from "./platforms/types";
import type { PlatformId } from "./platforms/registry";
import { ADAPTERS } from "./platforms/adapters";
import { PlatformError } from "./platforms/http";
import { notifyWorkspace } from "./notify";
import type { SocialAccount } from "@prisma/client";

/** Public-safe projection: never includes token fields. */
export const accountSelect = {
  id: true, platform: true, displayName: true, username: true, avatarUrl: true, profileUrl: true, status: true, statusMessage: true,
  accountType: true, isDemo: true, isDefault: true, brandId: true, scopes: true, tokenExpiresAt: true, lastSyncedAt: true, createdAt: true, meta: true, preferences: true,
} as const;

export function toAdapter(a: SocialAccount): AdapterAccount {
  return { id: a.id, platform: a.platform as PlatformId, externalId: a.externalId, accountType: a.accountType,
    accessToken: decryptOpt(a.accessTokenEnc), refreshToken: decryptOpt(a.refreshTokenEnc), meta: (a.meta ?? {}) as Record<string, any> };
}

export async function markAuthProblem(a: SocialAccount, message: string) {
  if (a.status === "EXPIRED" || a.status === "REVOKED") return;
  await db.socialAccount.update({ where: { id: a.id }, data: { status: "EXPIRED", statusMessage: message } });
  await notifyWorkspace(a.workspaceId, { type: "account_auth", title: `Reconnect ${a.displayName}`, body: message, href: "/accounts" }, ["accounts.manage"]);
}

/** Returns an adapter account with a valid access token, refreshing it when close to expiry. */
export async function freshAccount(accountId: string): Promise<{ row: SocialAccount; acc: AdapterAccount }> {
  let row = await db.socialAccount.findUniqueOrThrow({ where: { id: accountId } });
  const adapter = ADAPTERS[row.platform as PlatformId];
  const soon = row.tokenExpiresAt && row.tokenExpiresAt.getTime() - Date.now() < 10 * 60_000;
  if (!row.isDemo && soon && adapter.refresh) {
    try {
      const t = await adapter.refresh(toAdapter(row));
      row = await db.socialAccount.update({ where: { id: row.id }, data: {
        accessTokenEnc: encrypt(t.accessToken), refreshTokenEnc: t.refreshToken === undefined ? row.refreshTokenEnc : encryptOpt(t.refreshToken),
        tokenExpiresAt: t.expiresAt ?? null, refreshExpiresAt: t.refreshExpiresAt ?? row.refreshExpiresAt, status: "CONNECTED", statusMessage: null } });
    } catch (e) {
      const msg = e instanceof PlatformError ? e.message : "Token refresh failed";
      if (!(e instanceof PlatformError) || !e.retryable) await markAuthProblem(row, `${msg}. Reconnect the account to keep publishing.`);
      throw e;
    }
  }
  return { row, acc: toAdapter(row) };
}
