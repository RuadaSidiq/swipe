"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Modal } from "../../accounts/AccountsClient";
import { CampaignForm, type CampaignInit } from "@/components/CampaignForm";
import { campaignCalendar, deleteCampaign } from "../../_actions/campaigns";

export function CampaignTools({ init, accounts, members, brands, aiEnabled }: { init: CampaignInit; aiEnabled: boolean; accounts: { id: string; platform: string; displayName: string }[]; members: { id: string; name: string }[]; brands: { id: string; name: string }[] }) {
  const router = useRouter(); const [edit, setEdit] = useState(false); const [pending, start] = useTransition(); const [msg, setMsg] = useState("");
  return (<>
    {aiEnabled && <button className="btn-secondary" disabled={pending} onClick={() => start(async () => { const r = await campaignCalendar(init.id!); setMsg(r.ok ? `Created ${r.data} draft posts — review and schedule them.` : r.error); router.refresh(); })}><Sparkles size={15} /> {pending ? "Planning…" : "AI content calendar"}</button>}
    <button className="btn-secondary" onClick={() => setEdit(true)}>Edit</button>
    <button className="btn-ghost text-red-600 dark:text-red-400" onClick={() => confirm("Delete this campaign? Its posts are kept but unlinked.") && start(async () => { await deleteCampaign(init.id!); router.push("/campaigns"); })}>Delete</button>
    {msg && <span className="text-xs">{msg}</span>}
    {edit && <Modal title="Edit campaign" onClose={() => setEdit(false)} wide><CampaignForm init={init} accounts={accounts} members={members} brands={brands} onDone={() => setEdit(false)} /></Modal>}
  </>);
}
