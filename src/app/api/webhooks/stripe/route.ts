import type Stripe from "stripe";
import { db } from "@/lib/db";
import { stripe, stripeEnabled, syncSubscription } from "@/lib/stripe";
import { notifyWorkspace } from "@/lib/notify";

export async function POST(req: Request) {
  if (!stripeEnabled() || !process.env.STRIPE_WEBHOOK_SECRET) return new Response("Not configured", { status: 404 });
  let event: Stripe.Event;
  try { event = stripe().webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", process.env.STRIPE_WEBHOOK_SECRET); }
  catch { return new Response("Bad signature", { status: 400 }); }
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      if (s.subscription) await syncSubscription(await stripe().subscriptions.retrieve(String(s.subscription)));
      break;
    }
    case "customer.subscription.created": case "customer.subscription.updated": case "customer.subscription.deleted":
      await syncSubscription(event.data.object); break;
    case "invoice.paid": case "invoice.payment_failed": case "invoice.finalized": {
      const inv = event.data.object;
      const sub = await db.subscription.findFirst({ where: { stripeCustomerId: String(inv.customer) } });
      if (!sub) break;
      await db.invoice.upsert({ where: { stripeInvoiceId: inv.id! }, create: { organizationId: sub.organizationId, stripeInvoiceId: inv.id!, amountCents: inv.amount_due, currency: inv.currency, status: inv.status ?? "open",
        hostedUrl: inv.hosted_invoice_url, pdfUrl: inv.invoice_pdf, periodStart: new Date(inv.period_start * 1000), periodEnd: new Date(inv.period_end * 1000) },
        update: { status: inv.status ?? "open", hostedUrl: inv.hosted_invoice_url, pdfUrl: inv.invoice_pdf, amountCents: inv.amount_due } });
      if (event.type === "invoice.payment_failed") {
        await db.subscription.update({ where: { id: sub.id }, data: { status: "past_due" } });
        for (const w of await db.workspace.findMany({ where: { organizationId: sub.organizationId } })) await notifyWorkspace(w.id, { type: "integration_error", title: "Payment failed", body: "Update your payment method to keep your plan.", href: "/billing" }, ["billing.manage"]);
      }
      break;
    }
  }
  return new Response("ok");
}
