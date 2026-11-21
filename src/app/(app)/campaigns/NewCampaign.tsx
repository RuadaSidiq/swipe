"use client";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "../accounts/AccountsClient";
import { CampaignForm } from "@/components/CampaignForm";
export function NewCampaign(p: { accounts: { id: string; platform: string; displayName: string }[]; members: { id: string; name: string }[]; brands: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  return (<><button className="btn-primary" onClick={() => setOpen(true)}><Plus size={15} /> New campaign</button>
    {open && <Modal title="New campaign" onClose={() => setOpen(false)} wide><CampaignForm {...p} onDone={() => setOpen(false)} init={{ name: "", description: "", goals: "", color: "#6d5efc", status: "planning", startDate: "", endDate: "", brandId: "", accountIds: [], memberIds: [] }} /></Modal>}</>);
}
