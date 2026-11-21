/** Plan catalogue. Prices/limits live here (and in Stripe price ids via env), so they can change without schema changes. */
export type PlanId = "free" | "starter" | "pro" | "agency";
export interface Plan {
  id: PlanId; name: string; monthly: number; annual: number; tagline: string;
  limits: { accounts: number; scheduledPosts: number; workspaces: number; members: number; aiRequestsPerMonth: number; automations: number; storageMb: number };
  features: { inbox: boolean; advancedAnalytics: boolean; aiReplies: boolean; approvals: boolean; multiBrand: boolean; reports: boolean; mediaLibrary: boolean };
  highlights: string[];
}
const INF = Number.MAX_SAFE_INTEGER;
export const PLANS: Record<PlanId, Plan> = {
  free: { id: "free", name: "Free", monthly: 0, annual: 0, tagline: "Get started",
    limits: { accounts: 3, scheduledPosts: 10, workspaces: 1, members: 1, aiRequestsPerMonth: 20, automations: 0, storageMb: 500 },
    features: { inbox: false, advancedAnalytics: false, aiReplies: false, approvals: false, multiBrand: false, reports: false, mediaLibrary: true },
    highlights: ["3 connected accounts", "10 scheduled posts", "Basic dashboard", "20 AI requests / month"] },
  starter: { id: "starter", name: "Starter", monthly: 19, annual: 190, tagline: "For creators",
    limits: { accounts: 8, scheduledPosts: 150, workspaces: 1, members: 2, aiRequestsPerMonth: 300, automations: 3, storageMb: 5_000 },
    features: { inbox: false, advancedAnalytics: false, aiReplies: false, approvals: false, multiBrand: false, reports: true, mediaLibrary: true },
    highlights: ["8 accounts", "150 scheduled posts", "Media library", "Basic analytics", "300 AI requests / month"] },
  pro: { id: "pro", name: "Professional", monthly: 59, annual: 590, tagline: "For growing businesses",
    limits: { accounts: 25, scheduledPosts: INF, workspaces: 3, members: 5, aiRequestsPerMonth: 2_000, automations: 20, storageMb: 50_000 },
    features: { inbox: true, advancedAnalytics: true, aiReplies: true, approvals: false, multiBrand: true, reports: true, mediaLibrary: true },
    highlights: ["25 accounts", "Unlimited scheduling", "Unified inbox", "AI reply assistant", "Multiple brands", "20 automations"] },
  agency: { id: "agency", name: "Agency", monthly: 199, annual: 1990, tagline: "For teams & agencies",
    limits: { accounts: 150, scheduledPosts: INF, workspaces: 50, members: 50, aiRequestsPerMonth: 15_000, automations: 200, storageMb: 500_000 },
    features: { inbox: true, advancedAnalytics: true, aiReplies: true, approvals: true, multiBrand: true, reports: true, mediaLibrary: true },
    highlights: ["150 accounts", "50 client workspaces", "Approval workflows", "Advanced permissions", "15k AI requests / month"] },
};
export const planOf = (id?: string | null): Plan => PLANS[(id as PlanId) ?? "free"] ?? PLANS.free;
export const isUnlimited = (n: number) => n >= INF;

export class PlanLimitError extends Error {
  constructor(message: string) { super(message); }
}
