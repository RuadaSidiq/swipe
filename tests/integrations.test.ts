import { afterEach, describe, expect, it, vi } from "vitest";
import { base32Encode, totpAt, verifyTotp } from "@/lib/totp";
import { ADAPTERS } from "@/lib/platforms/adapters";
import type { AdapterAccount } from "@/lib/platforms/types";

describe("TOTP", () => {
  it("matches the RFC 6238 SHA-1 test vector", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(totpAt(secret, Math.floor(59 / 30))).toBe("287082");          // 94287082 → last 6 digits
    expect(totpAt(secret, Math.floor(1111111109 / 30))).toBe("081804");  // 07081804
  });
  it("accepts ±1 step and rejects others", () => {
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    const now = 1_700_000_000_000; const step = Math.floor(now / 30_000);
    expect(verifyTotp(secret, totpAt(secret, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step + 3), now)).toBeNull();
    expect(verifyTotp(secret, "abc", now)).toBeNull();
  });
});

const acc = (platform: string, extra: Partial<AdapterAccount> = {}): AdapterAccount => ({ id: "a", platform: platform as never, externalId: "me", accountType: "profile", accessToken: "tok", refreshToken: null, meta: { username: "acme" }, ...extra });
type Call = { url: string; init: RequestInit };
function mockFetch(handler: (url: string, init: RequestInit) => unknown) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => { calls.push({ url, init }); const body = handler(url, init); return new Response(JSON.stringify(body), { status: 200 }); });
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe("X adapter", () => {
  it("uploads images then attaches their ids to the post", async () => {
    const calls = mockFetch((url) => url.includes("/2/media/upload") ? { data: { id: "m1" } } : url.includes("/media/metadata") ? {} : { data: { id: "t1" } });
    const r = await ADAPTERS.x.publish!(acc("x"), { body: "hi", media: [{ id: "1", kind: "image", mimeType: "image/png", publicUrl: "", sizeBytes: 3, altText: "alt", read: async () => Buffer.from("png") }], options: {} });
    expect(r).toEqual({ externalId: "t1", url: "https://x.com/acme/status/t1" });
    const up = JSON.parse(String(calls[0].init.body));
    expect(up).toEqual({ media: Buffer.from("png").toString("base64"), media_category: "tweet_image" });
    expect(JSON.parse(String(calls.at(-1)!.init.body))).toEqual({ text: "hi", media: { media_ids: ["m1"] } });
  });
  it("maps mentions and advances the since_id cursor", async () => {
    mockFetch(() => ({ data: [{ id: "9", text: "@acme hello", author_id: "u1", conversation_id: "9", created_at: "2026-11-20T10:00:00Z", in_reply_to_user_id: "me" }],
      includes: { users: [{ id: "u1", name: "Jo", username: "jo" }] }, meta: { newest_id: "9" } }));
    const r = await ADAPTERS.x.poll!(acc("x"), "5");
    expect(r.cursor).toBe("9");
    expect(r.items[0]).toMatchObject({ kind: "reply", externalId: "9", author: { name: "Jo", handle: "jo" }, body: "@acme hello" });
  });
});

describe("Reddit polling", () => {
  it("maps PMs and comment replies, then marks them read", async () => {
    const calls = mockFetch((url) => url.includes("/message/unread") ? { data: { children: [
      { kind: "t4", data: { name: "t4_a", author: "bob", body: "hello", subject: "Q", created_utc: 1700000000 } },
      { kind: "t1", data: { name: "t1_b", author: "amy", body: "nice post", link_title: "Launch", type: "post_reply", created_utc: 1700000001 } }] } } : {});
    const r = await ADAPTERS.reddit.poll!(acc("reddit"), null);
    expect(r.items.map((i) => i.kind)).toEqual(["dm", "comment"]);
    expect(calls.at(-1)!.url).toContain("/api/read_message");
    expect(String(calls.at(-1)!.init.body)).toContain("t4_a%2Ct1_b");
  });
});

describe("YouTube polling", () => {
  it("returns only comments newer than the cursor, including replies", async () => {
    mockFetch(() => ({ items: [{ snippet: { videoId: "v", topLevelComment: { id: "c1", snippet: { publishedAt: "2026-11-20T10:00:00Z", authorDisplayName: "Old", textDisplay: "old" } } },
      replies: { comments: [{ id: "c1.r", snippet: { publishedAt: "2026-11-21T10:00:00Z", authorDisplayName: "New", textDisplay: "new reply", authorChannelId: { value: "x" } } }] } }] }));
    const r = await ADAPTERS.youtube.poll!(acc("youtube"), "2026-11-21T00:00:00Z");
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ threadId: "c1", externalId: "c1.r", body: "new reply" });
    expect(r.cursor).toBe("2026-11-21T10:00:00.000Z");
  });
});
