import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { can, ForbiddenError } from "@/lib/rbac";
import type { Ctx } from "@/lib/auth";
import { approvePost, claimDueTargets, publishTarget, savePost, ValidationFailed } from "@/lib/publishing";

let wsId = "", orgId = "", accIg = "", accFb = "", ownerId = "", creatorId = "";
const ctxFor = (userId: string, role: Role, requireApproval = true): Ctx => ({
  sessionId: "s", membershipId: "m", role, user: { id: userId, name: role, email: `${role}@t`, timezone: "UTC", isPlatformAdmin: false },
  workspace: { id: wsId, name: "T", slug: "t", timezone: "UTC", requireApproval, organizationId: orgId, isDemo: true },
  can: (p) => can(role, p), assert: (p) => { if (!can(role, p)) throw new ForbiddenError(p); },
});

beforeAll(async () => {
  const org = await db.organization.create({ data: { name: "Test org", subscription: { create: { plan: "agency", status: "active" } } } });
  orgId = org.id;
  const ws = await db.workspace.create({ data: { organizationId: org.id, name: "Test", slug: `test-${Date.now()}`, requireApproval: true } });
  wsId = ws.id;
  ownerId = (await db.user.create({ data: { email: `o${Date.now()}@t.io`, name: "Owner", passwordHash: "x" } })).id;
  creatorId = (await db.user.create({ data: { email: `c${Date.now()}@t.io`, name: "Creator", passwordHash: "x" } })).id;
  await db.membership.createMany({ data: [{ userId: ownerId, workspaceId: wsId, role: "OWNER" }, { userId: creatorId, workspaceId: wsId, role: "CREATOR" }] });
  accIg = (await db.socialAccount.create({ data: { workspaceId: wsId, platform: "instagram", externalId: "t-ig", displayName: "IG", isDemo: true } })).id;
  accFb = (await db.socialAccount.create({ data: { workspaceId: wsId, platform: "facebook", externalId: "t-fb", displayName: "FB", isDemo: true } })).id;
});
afterAll(async () => {
  await db.organization.delete({ where: { id: orgId } });
  await db.user.deleteMany({ where: { id: { in: [ownerId, creatorId] } } });
});

describe("publishing workflow", () => {
  it("refuses to schedule invalid content and reports per-destination issues", async () => {
    const p = savePost(ctxFor(ownerId, "OWNER", false), { body: "text only", action: "publish_now", targets: [{ accountId: accIg }, { accountId: accFb }] });
    await expect(p).rejects.toBeInstanceOf(ValidationFailed);
    const err = (await p.catch((e) => e)) as ValidationFailed;
    expect(err.reports.find((r) => r.platform === "instagram")!.issues.some((i) => i.level === "error")).toBe(true);
    expect(err.reports.find((r) => r.platform === "facebook")!.issues.filter((i) => i.level === "error")).toEqual([]);
  });

  it("routes a creator's post through approval, then publishes each destination independently", async () => {
    const creator = ctxFor(creatorId, "CREATOR");
    const { post } = await savePost(creator, { body: "Hello world", action: "publish_now", targets: [{ accountId: accFb }] });
    expect(post.status).toBe("PENDING_APPROVAL");
    expect(await claimDueTargets(50).then((ids) => ids.length)).toBe(0); // nothing publishes before approval

    await expect(approvePost(creator, post.id)).rejects.toBeInstanceOf(ForbiddenError);
    await approvePost(ctxFor(ownerId, "OWNER"), post.id);
    expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe("SCHEDULED");

    // Two workers racing for the same rows must never both claim a target.
    const [a, b] = await Promise.all([claimDueTargets(50), claimDueTargets(50)]);
    const targetIds = (await db.postTarget.findMany({ where: { postId: post.id } })).map((t) => t.id);
    expect([...a, ...b].filter((id) => targetIds.includes(id)).length).toBeLessThanOrEqual(1); // ≤1: a running worker may have claimed it first
    expect(new Set([...a, ...b]).size).toBe(a.length + b.length);

    for (const id of targetIds) await publishTarget(id);
    const t = await db.postTarget.findFirstOrThrow({ where: { postId: post.id } });
    expect(t.status).toBe("PUBLISHED");
    expect(t.simulated).toBe(true); // demo account: clearly marked as simulated
    expect((await db.post.findUniqueOrThrow({ where: { id: post.id } })).status).toBe("PUBLISHED");
  });

  it("blocks support agents from creating posts", async () => {
    await expect(savePost(ctxFor(ownerId, "SUPPORT"), { body: "x", action: "draft" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("does not let one workspace target another workspace's accounts", async () => {
    const other = await db.socialAccount.findFirst({ where: { workspaceId: { not: wsId } } });
    if (!other) return;
    await expect(savePost(ctxFor(ownerId, "OWNER", false), { body: "x", action: "publish_now", targets: [{ accountId: other.id }] })).rejects.toBeInstanceOf(ValidationFailed);
  });
});
