import crypto from "node:crypto";
import { db } from "@/lib/db";
import { ingest, type Inbound } from "@/lib/inbox";
import { safeEqual } from "@/lib/crypto";

/** Meta webhook verification handshake. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const token = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (token && u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === token) return new Response(u.searchParams.get("hub.challenge") ?? "");
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.META_APP_SECRET;
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  if (!secret || !safeEqual(`sha256=${crypto.createHmac("sha256", secret).update(raw).digest("hex")}`, sig)) return new Response("Invalid signature", { status: 401 });
  const body = JSON.parse(raw);
  try {
    for (const entry of body.entry ?? []) {
      if (body.object === "page") await handlePage(entry);
      else if (body.object === "instagram") await handleInstagram(entry);
      else if (body.object === "whatsapp_business_account") await handleWhatsApp(entry);
    }
  } catch (e) { console.error("meta webhook", e); }
  return new Response("EVENT_RECEIVED"); // always 200 so Meta doesn't disable the subscription
}

const accountsFor = (platform: string, externalId: string) => db.socialAccount.findMany({ where: { platform, externalId, status: "CONNECTED" } });

async function handlePage(entry: any) {
  const accs = await accountsFor("facebook", String(entry.id));
  for (const acc of accs) {
    for (const m of entry.messaging ?? []) {
      if (!m.message || m.message.is_echo) continue;
      await ingest(acc, { kind: "dm", threadId: m.sender.id, externalId: m.message.mid, author: { id: m.sender.id, name: await fbName(acc, m.sender.id) }, body: m.message.text ?? "",
        attachments: (m.message.attachments ?? []).map((a: any) => ({ type: a.type, url: a.payload?.url })), at: new Date(m.timestamp) });
    }
    for (const ch of entry.changes ?? []) {
      const v = ch.value;
      if (ch.field !== "feed" || v.item !== "comment" || v.verb !== "add" || v.from?.id === entry.id) continue;
      await ingest(acc, { kind: "comment", threadId: v.parent_id && v.parent_id !== v.post_id ? v.parent_id : v.comment_id, subject: `Post ${v.post_id}`, externalId: v.comment_id,
        author: { id: v.from.id, name: v.from.name ?? "Facebook user" }, body: v.message ?? "", at: v.created_time ? new Date(v.created_time * 1000) : undefined });
    }
  }
}

async function handleInstagram(entry: any) {
  const accs = await accountsFor("instagram", String(entry.id));
  for (const acc of accs) {
    for (const m of entry.messaging ?? []) {
      if (!m.message || m.message.is_echo) continue;
      await ingest(acc, { kind: "dm", threadId: m.sender.id, externalId: m.message.mid, author: { id: m.sender.id, name: m.sender.username ?? "Instagram user" }, body: m.message.text ?? "",
        attachments: (m.message.attachments ?? []).map((a: any) => ({ type: a.type, url: a.payload?.url })), at: new Date(m.timestamp) });
    }
    for (const ch of entry.changes ?? []) {
      const v = ch.value;
      if (ch.field === "comments" && v.from?.id !== entry.id)
        await ingest(acc, { kind: "comment", threadId: v.parent_id ?? v.id, subject: `Media ${v.media?.id ?? ""}`, externalId: v.id, author: { id: v.from?.id ?? "unknown", name: v.from?.username ?? "Instagram user", handle: v.from?.username }, body: v.text ?? "" });
      if (ch.field === "mentions")
        await ingest(acc, { kind: "mention", threadId: v.comment_id ?? v.media_id, externalId: v.comment_id ?? v.media_id, author: { id: `mention-${v.media_id}`, name: "Instagram mention" }, body: v.comment_id ? "You were mentioned in a comment." : "You were mentioned in a post caption." });
    }
  }
}

async function handleWhatsApp(entry: any) {
  for (const ch of entry.changes ?? []) {
    const v = ch.value;
    if (!v?.messages?.length) continue;
    const accs = await accountsFor("whatsapp", String(v.metadata?.phone_number_id));
    for (const acc of accs) for (const m of v.messages) {
      const contact = (v.contacts ?? []).find((c: any) => c.wa_id === m.from);
      const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m[m.type]?.caption ?? `[${m.type} message]`;
      await ingest(acc, { kind: "dm", threadId: m.from, externalId: m.id, author: { id: m.from, name: contact?.profile?.name ?? `+${m.from}`, handle: `+${m.from}` }, body: text,
        attachments: ["image", "video", "audio", "document"].includes(m.type) ? [{ type: m.type }] : [], at: new Date(Number(m.timestamp) * 1000) });
    }
  }
}

async function fbName(acc: { accessTokenEnc: string | null }, psid: string) {
  try {
    const { decrypt } = await import("@/lib/crypto");
    if (!acc.accessTokenEnc) return "Messenger user";
    const r = await fetch(`https://graph.facebook.com/v21.0/${psid}?fields=name&access_token=${decrypt(acc.accessTokenEnc)}`);
    return (await r.json()).name ?? "Messenger user";
  } catch { return "Messenger user"; }
}
