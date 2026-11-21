import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCtx } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { Avatar, Card, DemoBadge, Notice, PageHeader, PlatformBadge, StatusBadge } from "@/components/ui";
import { Thumb } from "@/components/media";
import { PLATFORMS, type PlatformId } from "@/lib/platforms/registry";
import { PostActions, TargetRetry, CommentBox } from "./PostActions";

export default async function PostDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const ctx = await requireCtx();
  const { id } = await params; const { saved } = await searchParams;
  const post = await db.post.findFirst({ where: { id, workspaceId: ctx.workspace.id }, include: {
    targets: { include: { account: { select: { id: true, platform: true, displayName: true, avatarUrl: true, isDemo: true, status: true } }, attemptsLog: { orderBy: { createdAt: "desc" }, take: 10 }, metrics: { orderBy: { collectedAt: "desc" } } } },
    comments: { orderBy: { createdAt: "asc" } }, campaign: true, brand: true } });
  if (!post) notFound();
  const media = await db.mediaAsset.findMany({ where: { id: { in: [...post.mediaIds, ...post.targets.flatMap((t) => t.mediaIds)] }, workspaceId: ctx.workspace.id } });
  const author = await db.user.findUnique({ where: { id: post.createdById }, select: { name: true } });
  const tz = ctx.user.timezone;
  const savedMsg: Record<string, string> = { DRAFT: "Draft saved.", SCHEDULED: "Scheduled. The publishing worker will send it at the chosen time and report each destination's result here.", PENDING_APPROVAL: "Submitted for approval. Approvers have been notified.", NOW: "Queued for immediate publishing. Each destination's result appears below within a few seconds (refresh to update)." };
  return (
    <>
      <PageHeader title={post.title || "Post"} subtitle={<>By {author?.name ?? "Unknown"} · created {fmtDate(post.createdAt, tz)}{post.campaign && <> · campaign <Link className="text-brand-500" href={`/campaigns/${post.campaign.id}`}>{post.campaign.name}</Link></>}</>}
        actions={<PostActions post={{ id: post.id, status: post.status, scheduledAt: post.scheduledAt?.toISOString() ?? null }} can={{ edit: ctx.can("posts.edit"), approve: ctx.can("posts.approve"), schedule: ctx.can("posts.schedule"), del: ctx.can("posts.delete"), create: ctx.can("posts.create") }} />} />
      {saved && savedMsg[saved] && <div className="mb-4"><Notice tone="success">{savedMsg[saved]}</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card title={<span className="flex items-center gap-2">Status <StatusBadge status={post.status} /></span>} actions={<span className="muted text-xs">{post.publishedAt ? `Published ${fmtDate(post.publishedAt, tz)}` : post.scheduledAt ? `Scheduled for ${fmtDate(post.scheduledAt, tz)}` : "Not scheduled"}</span>} pad={false}>
            <ul>{post.targets.map((t) => {
              const p = PLATFORMS[t.account.platform as PlatformId];
              const totals = t.metrics.reduce<Record<string, { v: number; src: string }>>((a, m) => (a[m.metric] ? a : { ...a, [m.metric]: { v: m.value, src: m.source } }), {});
              return (
                <li key={t.id} className="line border-t px-4 py-3 first:border-t-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar src={t.account.avatarUrl} name={t.account.displayName} size={32} platform={t.account.platform} />
                    <div className="min-w-0 flex-1"><div className="flex items-center gap-2 font-medium">{t.account.displayName} {t.account.isDemo && <DemoBadge />}</div><div className="muted text-xs">{p.name}{t.publishedAt ? ` · ${fmtDate(t.publishedAt, tz)}` : ""}{t.attempts > 0 ? ` · ${t.attempts} attempt${t.attempts > 1 ? "s" : ""}` : ""}</div></div>
                    <StatusBadge status={t.status} simulated={t.simulated} />
                    {t.externalUrl && <a href={t.externalUrl} target="_blank" rel="noreferrer" className="btn-secondary py-1 text-xs">View on {p.name}</a>}
                    {t.status === "FAILED" && ctx.can("posts.publish") && <TargetRetry id={t.id} />}
                  </div>
                  {t.error && <div className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600">{t.error}</div>}
                  {t.simulated && <div className="muted mt-2 text-xs">Demo account — publishing was simulated. Nothing was sent to {p.name}.</div>}
                  {Object.keys(totals).length > 0 && <div className="mt-2 flex flex-wrap gap-3 text-xs">{Object.entries(totals).map(([k, m]) => <span key={k} title={m.src}><b>{m.v.toLocaleString()}</b> <span className="muted">{k}</span></span>)}</div>}
                  {(t.body || t.title) && <details className="mt-2 text-xs"><summary className="muted cursor-pointer">Customized version</summary><div className="soft mt-1 whitespace-pre-wrap rounded p-2">{t.title && <b>{t.title}{"\n"}</b>}{t.body}</div></details>}
                  {t.attemptsLog.length > 0 && <details className="mt-1 text-xs"><summary className="muted cursor-pointer">Publishing log</summary><ul className="mt-1 space-y-0.5">{t.attemptsLog.map((a) => <li key={a.id} className={a.ok ? "text-emerald-600" : "text-red-500"}>{fmtDate(a.createdAt, tz, "MMM d HH:mm:ss")} — {a.message}</li>)}</ul></details>}
                </li>);
            })}{post.targets.length === 0 && <li className="muted p-4 text-sm">No destinations selected.</li>}</ul>
          </Card>
          <Card title="Content">
            <div className="whitespace-pre-wrap text-sm">{post.body || <span className="muted italic">No text</span>}</div>
            {post.link && <a href={post.link} className="mt-2 block truncate text-sm text-brand-500" target="_blank" rel="noreferrer">{post.link}</a>}
            {post.mediaIds.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{post.mediaIds.map((m) => { const a = media.find((x) => x.id === m); return a ? <div key={m} className="h-24 w-24 overflow-hidden rounded-lg"><Thumb a={a} /></div> : null; })}</div>}
            {post.tags.length > 0 && <div className="mt-3 flex gap-1">{post.tags.map((t) => <span key={t} className="chip soft">#{t}</span>)}</div>}
          </Card>
        </div>
        <Card title="Review & comments">
          <ul className="mb-3 space-y-3">{post.comments.map((c) => (
            <li key={c.id} className="text-sm"><div className="flex items-center gap-2"><b>{c.userName}</b>{c.kind !== "comment" && <span className={`chip ${c.kind === "approval" ? "bg-emerald-500/15 text-emerald-600" : c.kind === "changes_requested" ? "bg-orange-500/15 text-orange-600" : "soft"}`}>{c.kind.replace("_", " ")}</span>}<span className="muted text-xs">{fmtDate(c.createdAt, tz, "MMM d HH:mm")}</span></div><div className="mt-0.5 whitespace-pre-wrap">{c.body}</div></li>))}
            {post.comments.length === 0 && <li className="muted text-sm">No comments yet. Use internal comments to collaborate before publishing.</li>}</ul>
          <CommentBox postId={post.id} />
        </Card>
      </div>
    </>
  );
}
