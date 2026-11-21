import { runAllJobs } from "@/lib/jobs";
import { safeEqual } from "@/lib/crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Serverless replacement for the long-running worker. Vercel Cron calls this with
 * `Authorization: Bearer $CRON_SECRET`; any other scheduler can do the same.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  const result = await runAllJobs(50_000);
  return Response.json({ ok: true, ...result });
}
export const POST = GET;
