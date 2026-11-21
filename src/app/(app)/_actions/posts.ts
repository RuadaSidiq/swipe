"use server";
import { revalidatePath } from "next/cache";
import { requireCtx } from "@/lib/auth";
import { approvePost, cancelPost, deletePost, duplicatePost, requestChanges, reschedulePost, retryTarget, savePost, validatePost, postInput } from "@/lib/publishing";
import { db } from "@/lib/db";
import { safe } from "./common";

const refresh = () => { revalidatePath("/posts"); revalidatePath("/calendar"); revalidatePath("/dashboard"); };

export async function savePostAction(input: unknown) {
  return safe(async () => { const ctx = await requireCtx(); const r = await savePost(ctx, input); refresh(); return { id: r.post.id, status: r.post.status }; });
}
export async function validateAction(input: unknown) {
  return safe(async () => { const ctx = await requireCtx(); const i = postInput.partial({ action: true }).parse(input); return validatePost(ctx.workspace.id, { body: i.body ?? "", title: i.title ?? "", link: i.link, mediaIds: i.mediaIds ?? [], targets: i.targets ?? [] }); });
}
export async function approveAction(id: string, note?: string) { return safe(async () => { await approvePost(await requireCtx(), id, note); refresh(); return true; }); }
export async function requestChangesAction(id: string, note: string) { return safe(async () => { await requestChanges(await requireCtx(), id, note); refresh(); return true; }); }
export async function rescheduleAction(id: string, iso: string) { return safe(async () => { await reschedulePost(await requireCtx(), id, new Date(iso)); refresh(); return true; }); }
export async function unscheduleAction(id: string) { return safe(async () => { await cancelPost(await requireCtx(), id); refresh(); return true; }); }
export async function deleteAction(id: string) { return safe(async () => { await deletePost(await requireCtx(), id); refresh(); return true; }); }
export async function duplicateAction(id: string) { return safe(async () => { const p = await duplicatePost(await requireCtx(), id); refresh(); return p.id; }); }
export async function retryAction(targetId: string) { return safe(async () => { await retryTarget(await requireCtx(), targetId); refresh(); return true; }); }
export async function commentAction(postId: string, body: string) {
  return safe(async () => {
    const ctx = await requireCtx();
    await db.post.findFirstOrThrow({ where: { id: postId, workspaceId: ctx.workspace.id } });
    await db.postComment.create({ data: { postId, userId: ctx.user.id, userName: ctx.user.name, body: body.slice(0, 4000) } });
    revalidatePath(`/posts/${postId}`);
    return true;
  });
}
