import { db } from "./db";
import { planOf, PlanLimitError, isUnlimited, type Plan } from "./plans";

export async function getPlan(organizationId: string): Promise<{ plan: Plan; status: string; trialEndsAt: Date | null }> {
  const sub = await db.subscription.findUnique({ where: { organizationId } });
  if (!sub) return { plan: planOf("free"), status: "active", trialEndsAt: null };
  // An expired trial or cancelled subscription falls back to Free limits.
  const trialExpired = sub.status === "trialing" && sub.trialEndsAt && sub.trialEndsAt < new Date();
  const inactive = sub.status === "canceled" || trialExpired;
  return { plan: planOf(inactive ? "free" : sub.plan), status: trialExpired ? "trial_expired" : sub.status, trialEndsAt: sub.trialEndsAt };
}

const period = () => new Date().toISOString().slice(0, 7);

export async function usage(organizationId: string) {
  const [accounts, scheduled, workspaces, ai, automations, storage] = await Promise.all([
    db.socialAccount.count({ where: { workspace: { organizationId }, status: { not: "DISCONNECTED" }, isDemo: false } }),
    db.postTarget.count({ where: { post: { workspace: { organizationId } }, status: { in: ["SCHEDULED", "QUEUED"] } } }),
    db.workspace.count({ where: { organizationId } }),
    db.usageCounter.findUnique({ where: { organizationId_metric_period: { organizationId, metric: "ai_requests", period: period() } } }),
    db.automation.count({ where: { workspace: { organizationId }, enabled: true } }),
    db.mediaAsset.aggregate({ where: { workspace: { organizationId } }, _sum: { sizeBytes: true } }),
  ]);
  return { accounts, scheduledPosts: scheduled, workspaces, aiRequests: ai?.value ?? 0, automations, storageMb: Math.round((storage._sum.sizeBytes ?? 0) / 1e6) };
}

type LimitKey = "accounts" | "scheduledPosts" | "workspaces" | "aiRequestsPerMonth" | "automations" | "storageMb" | "members";

export async function enforceLimit(organizationId: string, key: LimitKey, adding = 1) {
  const { plan } = await getPlan(organizationId);
  const limit = plan.limits[key];
  if (isUnlimited(limit)) return;
  const u = await usage(organizationId);
  const current = key === "aiRequestsPerMonth" ? u.aiRequests : key === "members"
    ? await db.membership.count({ where: { workspace: { organizationId } } }) : (u as Record<string, number>)[key];
  if (current + adding > limit) {
    const label = { accounts: "connected accounts", scheduledPosts: "scheduled posts", workspaces: "workspaces", aiRequestsPerMonth: "AI requests this month",
      automations: "active automations", storageMb: "MB of media storage", members: "team members" }[key];
    throw new PlanLimitError(`Your ${plan.name} plan allows ${limit} ${label}. Upgrade your plan in Billing to add more.`);
  }
}

export async function requireFeature(organizationId: string, feature: keyof Plan["features"]) {
  const { plan } = await getPlan(organizationId);
  if (!plan.features[feature]) throw new PlanLimitError(`This feature isn't included in the ${plan.name} plan. Upgrade in Billing to unlock it.`);
}

export async function incrementUsage(organizationId: string, metric: string, by = 1) {
  await db.usageCounter.upsert({
    where: { organizationId_metric_period: { organizationId, metric, period: period() } },
    create: { organizationId, metric, period: period(), value: by },
    update: { value: { increment: by } },
  });
}
