import { db } from "@/lib/db";
import { hmac, safeEqual } from "@/lib/crypto";
import { ingest } from "@/lib/inbox";

export async function POST(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const secret = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!safeEqual(secret, hmac(`tg:${accountId}`))) return new Response("Forbidden", { status: 403 });
  const acc = await db.socialAccount.findUnique({ where: { id: accountId } });
  if (!acc || acc.status !== "CONNECTED") return new Response("ok");
  const u = await req.json();
  const m = u.message;
  if (!m || m.from?.is_bot) return new Response("ok");
  const text = m.text ?? m.caption ?? (m.photo ? "[photo]" : m.video ? "[video]" : m.document ? "[file]" : m.sticker ? m.sticker.emoji ?? "[sticker]" : "[message]");
  const name = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") || m.from?.username || "Telegram user";
  const isPrivate = m.chat.type === "private";
  await ingest(acc, {
    kind: isPrivate ? "dm" : "comment",
    threadId: isPrivate ? String(m.chat.id) : String(m.chat.id),
    subject: isPrivate ? undefined : `${m.chat.title ?? "Discussion group"}`,
    externalId: String(m.message_id),
    author: { id: String(m.from?.id ?? m.chat.id), name, handle: m.from?.username },
    body: text,
    attachments: m.photo ? [{ type: "photo" }] : m.video ? [{ type: "video" }] : [],
    at: new Date(m.date * 1000),
  });
  return new Response("ok");
}
