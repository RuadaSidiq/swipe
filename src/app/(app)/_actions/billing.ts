"use server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { priceId, stripe, stripeEnabled } from "@/lib/stripe";
import { env } from "@/lib/env";
import { audit } from "@/lib/audit";
import type { PlanId } from "@/lib/plans";
import { safe } from "./common";

async function customer(orgId: string, email: string, name: string) {
  const sub = await db.subscription.upsert({ where: { organizationId: orgId }, create: { organizationId: orgId }, update: {} });
  if (sub.stripeCustomerId) return sub.stripeCustomerId;
  const c = await stripe().customers.create({ email, name, metadata: { organizationId: orgId } });
  await db.subscription.update({ where: { organizationId: orgId }, data: { stripeCustomerId: c.id } });
  return c.id;
}

export async function checkout(plan: PlanId, interval: "month" | "year") {
  const ctx = await requireCtx(); ctx.assert("billing.manage");
  if (!stripeEnabled()) throw new Error("Billing isn't configured on this server.");
  const price = priceId(plan, interval);
  if (!price) throw new Error(`No Stripe price configured for ${plan}/${interval}.`);
  const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.workspace.organizationId }, include: { subscription: true } });
  const cust = await customer(org.id, ctx.user.email, org.name);
  if (org.subscription?.stripeSubscriptionId && org.subscription.status !== "canceled") {
    // Existing subscribers change plans in the portal (handles proration).
    const p = await stripe().billingPortal.sessions.create({ customer: cust, return_url: `${env.appUrl}/billing` });
    redirect(p.url);
  }
  const s = await stripe().checkout.sessions.create({ mode: "subscription", customer: cust, line_items: [{ price, quantity: 1 }], allow_promotion_codes: true,
    subscription_data: { metadata: { organizationId: org.id } }, metadata: { organizationId: org.id }, success_url: `${env.appUrl}/billing?success=1`, cancel_url: `${env.appUrl}/billing` });
  await audit(ctx, "billing.checkout", { detail: { plan, interval } });
  redirect(s.url!);
}

export async function portal() {
  const ctx = await requireCtx(); ctx.assert("billing.manage");
  if (!stripeEnabled()) throw new Error("Billing isn't configured on this server.");
  const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.workspace.organizationId } });
  const p = await stripe().billingPortal.sessions.create({ customer: await customer(org.id, ctx.user.email, org.name), return_url: `${env.appUrl}/billing` });
  redirect(p.url);
}

export async function setCancel(cancel: boolean) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("billing.manage");
    const sub = await db.subscription.findUniqueOrThrow({ where: { organizationId: ctx.workspace.organizationId } });
    if (!sub.stripeSubscriptionId || !stripeEnabled()) throw new Error("No paid subscription to change.");
    await stripe().subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: cancel });
    await db.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: cancel } });
    await audit(ctx, cancel ? "billing.cancel" : "billing.resume");
    return true;
  });
}
