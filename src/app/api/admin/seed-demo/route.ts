import { z } from "zod";
import { db } from "@/lib/db";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { seedDemo } from "@/lib/demoSeed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One-time demo seeding for hosted environments without shell access to the database.
 * Requires CRON_SECRET, DEMO_MODE=true and an empty user table; does nothing otherwise.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  if (!env.demoMode) return Response.json({ error: "DEMO_MODE is off." }, { status: 400 });
  if ((await db.user.count()) > 0) return Response.json({ error: "Database already has users; refusing to seed." }, { status: 409 });
  const p = z.object({ email: z.string().email(), password: z.string().min(12) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "Provide email and a password of 12+ characters." }, { status: 400 });
  await seedDemo(db, p.data.email, p.data.password);
  return Response.json({ ok: true });
}
