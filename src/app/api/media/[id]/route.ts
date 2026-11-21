import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { storagePath } from "@/lib/storage";
import { stream } from "@/lib/mediaStream";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireCtx();
  const a = await db.mediaAsset.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!a) return new Response("Not found", { status: 404 });
  return stream(req, storagePath(a.storageKey), a.mimeType, a.sizeBytes, "private, max-age=3600");
}

