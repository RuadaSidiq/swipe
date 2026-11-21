"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { deleteObject } from "@/lib/storage";
import { audit } from "@/lib/audit";
import { safe } from "./common";

export async function listMedia(q?: { search?: string; folderId?: string | null; kind?: string }) {
  const ctx = await requireCtx();
  return db.mediaAsset.findMany({ where: { workspaceId: ctx.workspace.id,
    ...(q?.folderId ? { folderId: q.folderId } : {}), ...(q?.kind ? { kind: q.kind } : {}),
    ...(q?.search ? { OR: [{ filename: { contains: q.search, mode: "insensitive" } }, { tags: { has: q.search.toLowerCase() } }, { altText: { contains: q.search, mode: "insensitive" } }] } : {}) },
    orderBy: { createdAt: "desc" }, take: 200 });
}

export async function updateMedia(id: string, input: { altText?: string; tags?: string[]; folderId?: string | null; filename?: string }) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("media.manage");
    await db.mediaAsset.findFirstOrThrow({ where: { id, workspaceId: ctx.workspace.id } });
    if (input.folderId) await db.mediaFolder.findFirstOrThrow({ where: { id: input.folderId, workspaceId: ctx.workspace.id } });
    await db.mediaAsset.update({ where: { id }, data: { altText: input.altText?.slice(0, 1000), tags: input.tags?.map((t) => t.toLowerCase().trim()).filter(Boolean), folderId: input.folderId, filename: input.filename } });
    revalidatePath("/media");
    return true;
  });
}

export async function deleteMedia(id: string) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("media.manage");
    const a = await db.mediaAsset.findFirstOrThrow({ where: { id, workspaceId: ctx.workspace.id } });
    const used = await db.post.count({ where: { workspaceId: ctx.workspace.id, mediaIds: { has: id }, status: { in: ["SCHEDULED", "PENDING_APPROVAL", "PUBLISHING"] } } });
    if (used) throw new Error(`This file is used by ${used} scheduled post${used > 1 ? "s" : ""}. Remove it from them first.`);
    await db.mediaAsset.delete({ where: { id } });
    await deleteObject(a.storageKey);
    await audit(ctx, "media.delete", { targetType: "media", targetId: id });
    revalidatePath("/media");
    return true;
  });
}

export async function createFolder(name: string) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("media.manage");
    const f = await db.mediaFolder.create({ data: { workspaceId: ctx.workspace.id, name: name.trim().slice(0, 80) || "New folder" } });
    revalidatePath("/media");
    return f;
  });
}
