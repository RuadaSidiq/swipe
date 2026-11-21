import Stripe from "stripe";
import { db } from "./db";
import type { PlanId } from "./plans";

export const stripeEnabled = () => Boolean(process.env.STRIPE_SECRET_KEY);
let s: Stripe | null = null;
export const stripe = () => (s ??= new Stripe(process.env.STRIPE_SECRET_KEY!));

export function priceId(plan: PlanId, interval: "month" | "year") {
  return process.env[`STRIPE_PRICE_${plan === "pro" ? "PRO" : plan.toUpperCase()}_${interval === "month" ? "MONTHLY" : "ANNUAL"}`];
}
export function planFromPrice(price: string): { plan: PlanId; interval: "month" | "year" } | null {
  for (const plan of ["starter", "pro", "agency"] as PlanId[]) for (const interval of ["month", "year"] as const) if (priceId(plan, interval) === price) return { plan, interval };
  return null;
}

/** Mirrors a Stripe subscription into our DB (source of truth for plan enforcement). */
export async function syncSubscription(sub: Stripe.Subscription) {
  const orgId = sub.metadata.organizationId;
  const item = sub.items.data[0];
  const mapped = item ? planFromPrice(item.price.id) : null;
  const periodEnd = (item as unknown as { current_period_end?: number })?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  const status = sub.status === "trialing" ? "trialing" : sub.status === "active" ? "active" : sub.status === "past_due" || sub.status === "unpaid" ? "past_due" : sub.status === "canceled" || sub.status === "incomplete_expired" ? "canceled" : sub.status;
  const where = orgId ? { organizationId: orgId } : { stripeSubscriptionId: sub.id };
  await db.subscription.updateMany({ where, data: {
    plan: status === "canceled" ? "free" : mapped?.plan ?? undefined, interval: mapped?.interval, status, stripeSubscriptionId: sub.id,
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id, cancelAtPeriodEnd: sub.cancel_at_period_end,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null, trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null } });
}
