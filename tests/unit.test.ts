import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/crypto";
import { countChars, validateVersion } from "@/lib/platforms/validate";
import { can } from "@/lib/rbac";
import { matches } from "@/lib/automation";
import { imageSize, sniffMime, signedMediaUrl, verifyMediaSig } from "@/lib/storage";
import { PLATFORM_LIST } from "@/lib/platforms/registry";

const img = { id: "m1", kind: "image", mimeType: "image/jpeg", sizeBytes: 200_000, width: 1080, height: 1080, altText: "a cup" };

describe("token encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("secret-token"), b = encrypt("secret-token");
    expect(a).not.toEqual(b);
    expect(decrypt(a)).toBe("secret-token");
  });
  it("rejects tampered ciphertext", () => {
    const parts = encrypt("secret").split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });
});

describe("platform validation", () => {
  it("counts X links as 23 chars", () => expect(countChars("x", "hi https://example.com/a/very/long/path/that/is/long")).toBe(26));
  it("blocks over-length X posts", () => expect(validateVersion("x", { body: "a".repeat(281), media: [] }).some((i) => i.level === "error")).toBe(true));
  it("requires media on Instagram", () => expect(validateVersion("instagram", { body: "hello", media: [] }).map((i) => i.message).join()).toMatch(/at least one/));
  it("accepts a valid Instagram image post", () => expect(validateVersion("instagram", { body: "hello", media: [img] }).filter((i) => i.level === "error")).toEqual([]));
  it("rejects bad Instagram aspect ratios", () => expect(validateVersion("instagram", { body: "x", media: [{ ...img, width: 3000, height: 1000 }] }).some((i) => /aspect/.test(i.message))).toBe(true));
  it("requires a Pinterest board and a Reddit subreddit/title", () => {
    expect(validateVersion("pinterest", { body: "x", media: [img], options: {} }).some((i) => /board/.test(i.message))).toBe(true);
    expect(validateVersion("reddit", { body: "x", media: [], options: {} }).filter((i) => i.level === "error").length).toBeGreaterThanOrEqual(2);
  });
  it("never lets Snapchat or WhatsApp pretend to publish", () => {
    expect(validateVersion("snapchat", { body: "x", media: [img] }).some((i) => i.level === "error")).toBe(true);
    expect(validateVersion("whatsapp", { body: "x", media: [] }).some((i) => i.level === "error")).toBe(true);
  });
  it("Telegram caption limit drops to 1024 with media", () => expect(validateVersion("telegram", { body: "a".repeat(1500), media: [img] }).some((i) => /1024/.test(i.message))).toBe(true));
  it("defines all 12 networks", () => expect(PLATFORM_LIST.length).toBe(12));
});

describe("RBAC", () => {
  it("enforces role boundaries", () => {
    expect(can("OWNER", "billing.manage")).toBe(true);
    expect(can("ADMIN", "billing.manage")).toBe(false);
    expect(can("CREATOR", "posts.publish")).toBe(false);
    expect(can("SUPPORT", "inbox.reply")).toBe(true);
    expect(can("SUPPORT", "posts.create")).toBe(false);
    expect(can("ANALYST", "analytics.view")).toBe(true);
    expect(can("APPROVER", "posts.approve")).toBe(true);
  });
});

describe("automation conditions", () => {
  it("matches any comma-separated keyword case-insensitively", () => {
    expect(matches([{ field: "text", op: "contains", value: "refund, Broken" }], { text: "My cup arrived BROKEN" })).toBe(true);
    expect(matches([{ field: "text", op: "not_contains", value: "refund" }], { text: "refund now" })).toBe(false);
    expect(matches([{ field: "platform", op: "equals", value: "instagram" }, { field: "text", op: "contains", value: "price" }], { platform: "instagram", text: "price?" })).toBe(true);
  });
});

describe("media handling", () => {
  it("sniffs real types and reads PNG dimensions", () => {
    const png = Buffer.alloc(32); Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png); png.writeUInt32BE(640, 16); png.writeUInt32BE(480, 20);
    expect(sniffMime(png)).toBe("image/png");
    expect(imageSize(png)).toEqual({ width: 640, height: 480 });
    expect(sniffMime(Buffer.from("<html><script>"))).toBeNull();
  });
  it("signs and verifies expiring media URLs", () => {
    const u = new URL(signedMediaUrl("asset1"));
    expect(verifyMediaSig("asset1", u.searchParams.get("exp")!, u.searchParams.get("sig")!)).toBe(true);
    expect(verifyMediaSig("asset2", u.searchParams.get("exp")!, u.searchParams.get("sig")!)).toBe(false);
    expect(verifyMediaSig("asset1", String(Math.floor(Date.now() / 1000) - 10), u.searchParams.get("sig")!)).toBe(false);
  });
});
