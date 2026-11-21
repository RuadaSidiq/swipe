import { requireCtx } from "@/lib/auth";
import { getAnalytics } from "@/lib/analytics";
import { parseRange } from "@/lib/range";
import { fmtDate } from "@/lib/format";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Analytics report" };

export default async function Report({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requireCtx();
  if (!ctx.can("analytics.view")) return <p>Forbidden</p>;
  const sp = await searchParams; const { from, to } = parseRange(sp); const tz = ctx.user.timezone;
  const a = await getAnalytics(ctx.workspace.id, { from, to, platform: sp.platform, accountId: sp.account, campaignId: sp.campaign, brandId: sp.brand });
  return (
    <div className="text-sm">
      <div className="no-print mb-6 flex justify-end"><PrintButton /></div>
      <h1 className="text-2xl font-bold">{ctx.workspace.name} — Social performance report</h1>
      <p className="text-gray-600">{fmtDate(from, tz, "MMMM d, yyyy")} – {fmtDate(to, tz, "MMMM d, yyyy")} · generated {fmtDate(new Date(), tz)}</p>
      {a.usesDemo && <p className="mt-2 rounded border border-amber-400 bg-amber-50 p-2">Includes simulated demo-account data (marked “demo”).</p>}
      <h2 className="mt-6 border-b pb-1 text-lg font-semibold">Accounts</h2>
      <table className="mt-2 w-full"><thead><tr className="text-left text-gray-500"><th>Account</th><th>Network</th><th>Followers</th><th>Change</th><th>Source</th></tr></thead><tbody>
        {a.series.map((s) => <tr key={s.id} className="border-t"><td className="py-1">{s.displayName}{s.isDemo ? " (demo)" : ""}</td><td>{s.platform}</td><td>{s.latest?.toLocaleString() ?? "unavailable"}</td><td>{s.change ?? "—"}</td><td className="text-xs text-gray-500">{s.source ?? "—"}</td></tr>)}
      </tbody></table>
      <h2 className="mt-6 border-b pb-1 text-lg font-semibold">Publishing</h2>
      <p className="mt-2">{a.published} posts published; {a.withMetrics} with engagement data. Totals: {Object.entries(a.totals).map(([k, v]) => `${k} ${v.toLocaleString()}`).join(" · ") || "none available"}.</p>
      <h2 className="mt-6 border-b pb-1 text-lg font-semibold">Top posts</h2>
      <table className="mt-2 w-full"><tbody>{a.top.map((p) => <tr key={p.targetId} className="border-t align-top"><td className="py-1 pr-2">{p.text}</td><td>{p.platform}</td><td className="text-xs">{Object.entries(p.metrics).map(([k, v]) => `${k}: ${v}`).join(", ")}</td></tr>)}</tbody></table>
      <p className="mt-8 text-xs text-gray-500">Metrics are reported by each network&apos;s API as labelled; unavailable metrics are not estimated.</p>
    </div>
  );
}
