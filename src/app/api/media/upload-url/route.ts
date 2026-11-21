import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/lib/auth";
import { hmac, randomToken } from "@/lib/crypto";
import { presignedPut, usesS3 } from "@/lib/storage";
import { enforceLimit } from "@/lib/billing";
import { rateLimit } from "@/lib/ratelimit";
import { EXT, MAX_UPLOAD_BYTES } from "@/lib/mediaIngest";

/** Step 1 of a direct upload: returns a short-lived presigned PUT URL. With local-disk storage, tells the client to post the file to /api/media/upload instead. */
export async function POST(req: Request) {
  const ctx = await requireCtx();
  if (!ctx.can("media.manage") && !ctx.can("posts.create")) return NextResponse.json({ error: "You don't have permission to upload media." }, { status: 403 });
  if (!usesS3()) {
    // Serverless hosts (Vercel) have no persistent disk, so local storage would silently lose files.
    if (process.env.VERCEL) return NextResponse.json({ error: "Media uploads aren't available yet: cloud storage (S3/R2) hasn't been configured for this site." }, { status: 503 });
    return NextResponse.json({ mode: "direct" });
  }
  if (!(await rateLimit(`upload:${ctx.user.id}`, 120, 3600)).ok) return NextResponse.json({ error: "Upload limit reached. Try again later." }, { status: 429 });
  const parsed = z.object({ size: z.number().int().positive(), contentType: z.string() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  const { size, contentType } = parsed.data;
  if (size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Files must be 512 MB or smaller." }, { status: 413 });
  const ext = EXT[contentType];
  if (!ext) return NextResponse.json({ error: "Unsupported file. Upload JPEG, PNG, WEBP, GIF, MP4, MOV, WEBM or PDF." }, { status: 415 });
  try { await enforceLimit(ctx.workspace.organizationId, "storageMb", Math.ceil(size / 1e6)); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 402 }); }
  const key = `${ctx.workspace.id}/${new Date().toISOString().slice(0, 7)}/${randomToken(12)}.${ext}`;
  const exp = Math.floor(Date.now() / 1000) + 900;
  return NextResponse.json({ mode: "s3", url: await presignedPut(key, contentType), key, exp, token: hmac(`upload:${ctx.user.id}:${ctx.workspace.id}:${key}:${exp}`) });
}
