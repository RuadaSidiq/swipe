import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/lib/auth";
import { hmac, safeEqual } from "@/lib/crypto";
import { deleteObject, getRange, headObject, usesS3 } from "@/lib/storage";
import { MAX_UPLOAD_BYTES, recordAsset } from "@/lib/mediaIngest";

/** Step 2 of a direct upload: verifies the uploaded object's real type, then records it. Rejected files are deleted. */
export async function POST(req: Request) {
  const ctx = await requireCtx();
  if (!usesS3()) return NextResponse.json({ error: "Direct uploads aren't enabled." }, { status: 400 });
  const p = z.object({ key: z.string(), exp: z.number(), token: z.string(), filename: z.string().max(300), folderId: z.string().nullable().optional(), campaignId: z.string().nullable().optional() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const d = p.data;
  if (d.exp < Date.now() / 1000 - 3600 || !safeEqual(d.token, hmac(`upload:${ctx.user.id}:${ctx.workspace.id}:${d.key}:${d.exp}`)))
    return NextResponse.json({ error: "Upload link expired. Please try again." }, { status: 403 });
  let head;
  try { head = await headObject(d.key); } catch { return NextResponse.json({ error: "The file didn't finish uploading. Please try again." }, { status: 400 }); }
  if (head.size > MAX_UPLOAD_BYTES) { await deleteObject(d.key); return NextResponse.json({ error: "Files must be 512 MB or smaller." }, { status: 413 }); }
  const first = await getRange(d.key, 0, Math.min(head.size, 4 * 1024 * 1024) - 1);
  const last = head.size > first.length ? await getRange(d.key, Math.max(0, head.size - 4 * 1024 * 1024), head.size - 1) : undefined;
  try {
    const r = await recordAsset(ctx, { key: d.key, filename: d.filename, size: head.size, head: first, tail: last, sha256: `etag:${head.etag}`, folderId: d.folderId, campaignId: d.campaignId });
    if ("error" in r) { await deleteObject(d.key); return NextResponse.json({ error: r.error }, { status: 415 }); }
    return NextResponse.json({ asset: r.asset });
  } catch (e) { await deleteObject(d.key); throw e; }
}
