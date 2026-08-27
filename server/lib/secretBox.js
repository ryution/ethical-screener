// Encrypts secrets at rest — currently just the SnapTrade userSecret stored in the DB
// blob (see db.js). SnapTrade holdings are read-only (can't move money), but the
// userSecret is still a live credential that reads a real brokerage account, so it
// shouldn't sit in plaintext in a JSON file or a Postgres row.
//
// AES-256-GCM via Node's built-in crypto — no new dependency. Key comes from
// ENCRYPTION_KEY (64 hex chars = 32 bytes; generate with `openssl rand -hex 32`).
//
// FAIL-SOFT BY DESIGN, matching db.js: no key configured means dev/demo still runs,
// just without encryption — loud warning at boot, not a crash.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_HEX = process.env.ENCRYPTION_KEY;
const KEY = KEY_HEX && /^[0-9a-f]{64}$/i.test(KEY_HEX) ? Buffer.from(KEY_HEX, "hex") : null;

if (!KEY_HEX) {
  console.warn("⚠ no ENCRYPTION_KEY — secrets (SnapTrade userSecret) will be stored in plaintext. Generate one with `openssl rand -hex 32`.");
} else if (!KEY) {
  console.warn("⚠ ENCRYPTION_KEY is set but isn't 64 hex chars — ignoring it. Secrets will be stored in plaintext.");
}

const PREFIX = "enc:v1:";

/** Encrypt a string for storage. Passes through unchanged if no valid key is configured. */
export function encryptSecret(plaintext) {
  if (plaintext == null) return plaintext;
  if (!KEY) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

/** Reverse of encryptSecret. Passes through unchanged if the value isn't our format
 *  (e.g. plaintext written before a key was configured, or no key configured now). */
export function decryptSecret(value) {
  if (typeof value !== "string" || !value.startsWith(PREFIX)) return value;
  if (!KEY) return value; // can't decrypt without the key; caller will get ciphertext back
  const buf = Buffer.from(value.slice(PREFIX.length), "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
