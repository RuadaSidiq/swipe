import { db } from "@/lib/db";
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    const backlog = await db.postTarget.count({ where: { status: { in: ["SCHEDULED", "QUEUED"] }, nextAttemptAt: { lt: new Date(Date.now() - 5 * 60_000) } } });
    return Response.json({ ok: true, db: "up", overduePublishes: backlog, workerHealthy: backlog === 0 });
  } catch { return Response.json({ ok: false, db: "down" }, { status: 503 }); }
}
