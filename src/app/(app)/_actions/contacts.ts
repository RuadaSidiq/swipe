"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireCtx } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { safe } from "./common";

export async function updateContact(id: string, input: unknown) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("contacts.manage");
    const d = z.object({ status: z.enum(["contact", "lead", "customer", "vip", "blocked"]).optional(), tags: z.array(z.string()).optional(), notes: z.string().max(10000).optional(), assigneeUserId: z.string().nullable().optional() }).parse(input);
    await db.contact.findFirstOrThrow({ where: { id, workspaceId: ctx.workspace.id } });
    if (d.assigneeUserId) await db.membership.findFirstOrThrow({ where: { userId: d.assigneeUserId, workspaceId: ctx.workspace.id } });
    await db.contact.update({ where: { id }, data: { ...d, tags: d.tags?.map((t) => t.trim().toLowerCase()).filter(Boolean) } });
    revalidatePath("/contacts"); return true;
  });
}
/** Privacy: erase a contact's personal data and message history held by Orbit. */
export async function eraseContact(id: string) {
  return safe(async () => {
    const ctx = await requireCtx(); ctx.assert("contacts.manage");
    const c = await db.contact.findFirstOrThrow({ where: { id, workspaceId: ctx.workspace.id } });
    await db.$transaction([db.conversation.deleteMany({ where: { contactId: id } }), db.contact.delete({ where: { id } })]);
    await audit(ctx, "contact.erase", { targetType: "contact", targetId: id, detail: { platform: c.platform } });
    revalidatePath("/contacts"); return true;
  });
}
