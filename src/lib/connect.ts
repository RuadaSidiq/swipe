import { db } from "./db";
import { encrypt, encryptOpt } from "./crypto";
import type { DiscoveredAccount } from "./platforms/oauth";
import { enforceLimit } from "./billing";
import type { Prisma } from "@prisma/client";

/** Upserts discovered accounts. Re-connecting an existing account refreshes its tokens and clears auth errors. */
export async function saveDiscovered(workspaceId: string, organizationId: string, userId: string, platform: string, found: DiscoveredAccount[]) {
  const existing = await db.socialAccount.findMany({ where: { workspaceId, platform, externalId: { in: found.map((f) => f.externalId) } } });
  const newCount = found.filter((f) => !existing.some((e) => e.externalId === f.externalId && e.status !== "DISCONNECTED")).length;
  await enforceLimit(organizationId, "accounts", newCount);
  const brand = await db.brand.findFirst({ where: { workspaceId }, orderBy: [{ isDefault: "desc" }] });
  const saved = [];
  for (const f of found) {
    const prev = existing.find((e) => e.externalId === f.externalId);
    const data = {
      accountType: f.accountType, displayName: f.displayName, username: f.username, avatarUrl: f.avatarUrl, profileUrl: f.profileUrl, status: "CONNECTED" as const, statusMessage: null,
      scopes: f.scopes, accessTokenEnc: encrypt(f.accessToken), refreshTokenEnc: encryptOpt(f.refreshToken), tokenExpiresAt: f.expiresAt ?? null, refreshExpiresAt: f.refreshExpiresAt ?? null,
      meta: { ...((prev?.meta as object) ?? {}), ...(f.meta ?? {}) } as Prisma.InputJsonValue, connectedById: userId,
    };
    saved.push(await db.socialAccount.upsert({
      where: { workspaceId_platform_externalId: { workspaceId, platform, externalId: f.externalId } },
      create: { workspaceId, platform, externalId: f.externalId, brandId: brand?.id, ...data },
      update: data,
    }));
  }
  return saved;
}
