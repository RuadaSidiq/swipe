"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, Card, Notice, PlatformBadge, StatusBadge } from "@/components/ui";
import { eraseContact, updateContact } from "../_actions/contacts";

export function ContactPanel({ c, members, canEdit }: { c: any; members: { id: string; name: string }[]; canEdit: boolean }) {
  const router = useRouter(); const [pending, start] = useTransition(); const [msg, setMsg] = useState("");
  return (
    <Card title="Contact">
      <div className="mb-4 flex items-center gap-3"><Avatar src={c.avatarUrl} name={c.displayName} size={48} platform={c.platform} /><div><div className="font-semibold">{c.displayName}</div><div className="muted text-xs">{c.username ? `@${c.username} · ` : ""}{c.platform}</div></div></div>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); start(async () => {
        const r = await updateContact(c.id, { status: f.get("status"), tags: String(f.get("tags")).split(","), notes: String(f.get("notes")), assigneeUserId: String(f.get("assignee")) || null });
        setMsg(r.ok ? "Saved" : r.error); router.refresh(); }); }}>
        <label className="block"><span className="label">Status</span><select name="status" className="input" defaultValue={c.status} disabled={!canEdit}>{["contact", "lead", "customer", "vip", "blocked"].map((s) => <option key={s} value={s}>{s === "vip" ? "VIP" : s[0].toUpperCase() + s.slice(1)}</option>)}</select></label>
        <label className="block"><span className="label">Tags</span><input name="tags" className="input" defaultValue={c.tags.join(", ")} disabled={!canEdit} /></label>
        <label className="block"><span className="label">Owner</span><select name="assignee" className="input" defaultValue={c.assigneeUserId ?? ""} disabled={!canEdit}><option value="">Unassigned</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label className="block"><span className="label">Internal notes</span><textarea name="notes" rows={4} className="input" defaultValue={c.notes} disabled={!canEdit} /></label>
        {canEdit && <button className="btn-primary w-full" disabled={pending}>Save</button>}
        {msg && <Notice tone={msg === "Saved" ? "success" : "error"}>{msg}</Notice>}
      </form>
      <div className="label mt-4">Conversation history</div>
      <ul className="space-y-1.5">{c.conversations.map((v: any) => <li key={v.id}><Link href={`/inbox?c=${v.id}`} className="flex items-center gap-2 text-sm hover:underline"><PlatformBadge id={v.account.platform} size={14} /><span className="flex-1 truncate">{v.lastMessagePreview}</span><StatusBadge status={v.status} /></Link></li>)}</ul>
      {canEdit && <button className="btn-ghost mt-4 w-full text-xs text-red-600 dark:text-red-400" disabled={pending} onClick={() => confirm("Erase this contact and all of their conversations from Swipe? This can't be undone.") && start(async () => { await eraseContact(c.id); router.push("/contacts"); })}>Erase contact data (privacy request)</button>}
    </Card>
  );
}
