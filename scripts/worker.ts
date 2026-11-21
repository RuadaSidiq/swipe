/**
 * Long-running background worker for servers/containers (Railway, Fly, Docker, a VM).
 * On Vercel use the cron endpoint (/api/cron/tick) instead; both run the same jobs from src/lib/jobs.ts.
 */
import { db } from "../src/lib/db";
import { eventsTick, metricsTick, pollTick, postMetricsTick, publishTick, reminderTick, tokenTick } from "../src/lib/jobs";

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);
let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

async function main() {
  log("worker started");
  let tick = 0;
  while (!stopping) {
    try {
      const n = await publishTick();
      await eventsTick();
      if (tick % 4 === 0) await reminderTick();
      if (tick % 4 === 2) await pollTick();
      if (tick % 20 === 0) await tokenTick();
      if (tick % 40 === 0) await metricsTick();
      if (tick % 40 === 20) await postMetricsTick();
      tick++;
      if (n === 0) await new Promise((r) => setTimeout(r, 15_000));
    } catch (e) { log("tick error", (e as Error).message); await new Promise((r) => setTimeout(r, 15_000)); }
  }
  await db.$disconnect();
  log("worker stopped");
}
main();
