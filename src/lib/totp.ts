import crypto from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(buf: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string) {
  const clean = s.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = 0, value = 0; const out: number[] = [];
  for (const c of clean) { const i = B32.indexOf(c); if (i < 0) throw new Error("Invalid base32"); value = (value << 5) | i; bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(crypto.randomBytes(20));

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) — compatible with Google Authenticator, 1Password, Authy, etc. */
export function totpAt(secret: string, step: number) {
  const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString();
  return code.padStart(6, "0");
}
export const currentStep = (now = Date.now()) => Math.floor(now / 30_000);

/** Returns the matched time-step (±1 step for clock drift) or null. Callers reject steps ≤ the last used one (replay protection). */
export function verifyTotp(secret: string, code: string, now = Date.now()): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const s = currentStep(now);
  for (const step of [s - 1, s, s + 1]) {
    const a = Buffer.from(totpAt(secret, step)), b = Buffer.from(c);
    if (crypto.timingSafeEqual(a, b)) return step;
  }
  return null;
}
export const otpauthUrl = (secret: string, account: string, issuer = "Orbit") =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

export function newRecoveryCodes(n = 10) {
  return Array.from({ length: n }, () => crypto.randomBytes(5).toString("hex").replace(/(.{5})/, "$1-"));
}
