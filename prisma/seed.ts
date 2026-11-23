/**
 * Seeds a clearly-labelled DEMO workspace (run: npm run db:seed). Logic lives in src/lib/demoSeed.ts,
 * which the deployed site can also run once via POST /api/admin/seed-demo.
 */
import { PrismaClient } from "@prisma/client";
import { seedDemo } from "../src/lib/demoSeed";

const db = new PrismaClient();
const email = process.env.SEED_EMAIL ?? "demo@swipe.local";
const password = process.env.SEED_PASSWORD ?? "swipe-demo-2026";
seedDemo(db, email, password)
  .then((done) => console.log(done ? `Seeded demo workspace. Sign in with ${email} / ${password}` : `Seed user ${email} already exists — skipping.`))
  .finally(() => db.$disconnect());
