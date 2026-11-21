"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { approveAction, commentAction, deleteAction, duplicateAction, requestChangesAction, retryAction, unscheduleAction } from "../../_actions/posts";
import { Notice } from "@/components/ui";

export function PostActions({ post, can }: { post: { id: string; status: string; scheduledAt: string | null }; can: { edit: boolean; approve: boolean; schedule: boolean; del: boolean; create: boolean } }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [err, setErr] = useState("");
  const go = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, after?: (d: unknown) => void) => start(async () => { const r = await fn(); if (!r.ok) setErr(r.error!); else { setErr(""); after ? after(r.data) : router.refresh(); } });
  const editable = !["PUBLISHED", "PUBLISHING"].includes(post.status);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {err && <Notice tone="error">{err}</Notice>}
      {post.status === "PENDING_APPROVAL" && can.approve && <>
        <button className="btn-primary" disabled={pending} onClick={() => go(() => approveAction(post.id))}>Approve</button>
        <button className="btn-secondary" disabled={pending} onClick={() => { const n = prompt("What should be changed?"); if (n) go(() => requestChangesAction(post.id, n)); }}>Request changes</button>
      </>}
      {editable && can.edit && <Link href={`/publisher?id=${post.id}`} className="btn-secondary">Edit</Link>}
      {post.status === "SCHEDULED" && can.schedule && <button className="btn-secondary" disabled={pending} onClick={() => go(() => unscheduleAction(post.id))}>Unschedule</button>}
      {can.create && <button className="btn-secondary" disabled={pending} onClick={() => go(() => duplicateAction(post.id), (id) => router.push(`/publisher?id=${id}`))}>Duplicate</button>}
      {can.del && post.status !== "PUBLISHING" && <button className="btn-ghost text-red-500" disabled={pending} onClick={() => confirm(post.status === "PUBLISHED" ? "Delete this post from Orbit? (It stays live on the networks.)" : "Delete this post?") && go(() => deleteAction(post.id), () => router.push("/posts"))}>Delete</button>}
    </div>
  );
}

export function TargetRetry({ id }: { id: string }) {
  const router = useRouter(); const [pending, start] = useTransition();
  return <button className="btn-primary py-1 text-xs" disabled={pending} onClick={() => start(async () => { const r = await retryAction(id); if (!r.ok) alert(r.error); router.refresh(); })}>{pending ? "Queuing…" : "Retry"}</button>;
}

export function CommentBox({ postId }: { postId: string }) {
  const router = useRouter(); const [body, setBody] = useState(""); const [pending, start] = useTransition();
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (body.trim()) start(async () => { await commentAction(postId, body); setBody(""); router.refresh(); }); }}>
      <textarea className="input" rows={3} placeholder="Leave an internal comment…" value={body} onChange={(e) => setBody(e.target.value)} />
      <button className="btn-secondary mt-2 w-full" disabled={pending || !body.trim()}>Comment</button>
    </form>
  );
}
