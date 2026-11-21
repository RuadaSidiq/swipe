import { db } from "./db";
import { randomToken } from "./crypto";

export const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_-]+/g, "-").slice(0, 40) || "workspace";

export async function uniqueSlug(name: string) {
  const base = slugify(name);
  for (let i = 0; i < 5; i++) {
    const s = i === 0 ? base : `${base}-${randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    if (!(await db.workspace.findUnique({ where: { slug: s } }))) return s;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** New organisation with a 14-day Professional trial, one workspace, owner membership and a default brand. */
export async function createOrganizationWithWorkspace(userId: string, orgName: string, wsName: string, timezone: string) {
  return db.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: orgName, subscription: { create: { plan: "pro", status: "trialing", trialEndsAt: new Date(Date.now() + 14 * 86400_000) } } } });
    const ws = await tx.workspace.create({ data: { organizationId: org.id, name: wsName, slug: await uniqueSlug(wsName), timezone } });
    await tx.membership.create({ data: { userId, workspaceId: ws.id, role: "OWNER" } });
    await tx.brand.create({ data: { workspaceId: ws.id, name: wsName, isDefault: true } });
    return ws;
  });
}
