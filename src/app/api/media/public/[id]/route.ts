import { db } from "@/lib/db";
import { presignedGet, storagePath, usesS3, verifyMediaSig } from "@/lib/storage";
import { stream } from "@/lib/mediaStream";

/** Signed, expiring URL that social networks fetch media from when publishing. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = new URL(req.url);
  if (!verifyMediaSig(id, u.searchParams.get("exp") ?? "", u.searchParams.get("sig") ?? "")) return new Response("Link expired", { status: 403 });
  const a = await db.mediaAsset.findUnique({ where: { id } });
  if (!a) return new Response("Not found", { status: 404 });
  if (usesS3()) return Response.redirect(await presignedGet(a.storageKey, 6 * 3600), 302);
  return stream(req, storagePath(a.storageKey), a.mimeType, a.sizeBytes, "public, max-age=3600");
}
