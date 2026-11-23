import { Sparkles, Mail, HardDrive, CreditCard } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
export const metadata = { title: "Integrations" };

/** Third-party services Swipe relies on, and whether each is set up on this server. Only on/off is shown, never keys. */
export default async function Integrations() {
  await requireCtx();
  const on = (...k: string[]) => k.every((x) => Boolean(process.env[x]));
  const items = [
    { icon: Sparkles, name: "AI (Anthropic)", what: "Powers Swipe AI: writing, replies, insights.", ok: on("ANTHROPIC_API_KEY") || on("ANTHROPIC_AUTH_TOKEN") },
    { icon: Mail, name: "Email (Resend)", what: "Sends invitations and email alerts.", ok: on("RESEND_API_KEY") },
    { icon: HardDrive, name: "Media storage (S3)", what: "Stores uploaded images and videos.", ok: on("S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY") },
    { icon: CreditCard, name: "Payments (Stripe)", what: "Handles plans, payments and invoices.", ok: on("STRIPE_SECRET_KEY") },
  ];
  return (
    <>
      <PageHeader title="Integrations" subtitle="Services connected to Swipe. Social networks are managed under Social accounts." />
      <div className="stagger grid gap-4 sm:grid-cols-2">
        {items.map((i) => (
          <section key={i.name} className="panel lift flex items-start gap-4 p-5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px]" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><i.icon size={20} /></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="section-title">{i.name}</h2>
                <span className={i.ok ? "chip bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400" : "chip soft muted"}>{i.ok ? "Connected" : "Not set up"}</span></div>
              <p className="muted mt-1 text-sm">{i.what}</p>
            </div>
          </section>
        ))}
      </div>
      <p className="muted mt-4 text-xs">These are set up by whoever runs your Swipe server, through its environment settings.</p>
    </>
  );
}
