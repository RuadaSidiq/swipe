import { requireCtx } from "@/lib/auth";
import { getAnalytics } from "@/lib/analytics";
import { parseRange } from "@/lib/range";
import { requireFeature } from "@/lib/billing";

const esc = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replace(/"/g, '""')}"` : s; };

export async function GET(req: Request) {
  const ctx = await requireCtx();
  if (!ctx.can("analytics.view")) return new Response("Forbidden", { status: 403 });
  try { await requireFeature(ctx.workspace.organizationId, "reports"); } catch (e) { return new Response((e as Error).message, { status: 402 }); }
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const { from, to } = parseRange(sp);
  const a = await getAnalytics(ctx.workspace.id, { from, to, platform: sp.platform, accountId: sp.account, campaignId: sp.campaign, brandId: sp.brand });
  const rows: unknown[][] = [["section", "platform", "account", "item", "published_at", "metric", "value", "source", "period_start", "period_end", "demo"]];
  for (const s of a.series) for (const p of s.points) rows.push(["account", s.platform, s.displayName, "", "", "followers", p.value, s.source, p.date, p.date, s.isDemo]);
  for (const p of a.posts) for (const [k, v] of Object.entries(p.metrics)) rows.push(["post", p.platform, p.account, p.text, p.publishedAt?.toISOString(), k, v, p.sources.join("; "), p.publishedAt?.toISOString(), to.toISOString(), p.isDemo]);
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="orbit-analytics-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv"` } });
}
