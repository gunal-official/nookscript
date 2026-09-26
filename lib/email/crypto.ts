/**
 * Token cryptography for email mailbox connections (future-list item
 * "Gmail/Outlook"). OAuth refresh/access tokens live in the DB ONLY as
 * AES-256-GCM ciphertext; the key is server env (EMAIL_TOKEN_ENCRYPTION_KEY
 * = 64 hex chars = 32 bytes) and never touches the database.
 *
 * Zero dependencies (node:crypto only — the house billing pattern).
 * Payload format: `v1.<iv>.<ciphertext>.<authTag>` (base64url parts).
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const VERSION = "v1";
const KEY_RE = /^[0-9a-fA-F]{64}$/;

/** True when a usable 32-byte hex key is configured. */
export function hasTokenKey(keyHex: string | undefined): boolean {
  return KEY_RE.test(keyHex ?? "");
}

function keyFromHex(keyHex: string): Buffer {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error(
      "EMAIL_TOKEN_ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)."
    );
  }
  return key;
}

/** Encrypt a token string for storage. */
export function tokenEncrypt(plain: string, keyHex: string): string {
  const key = keyFromHex(keyHex);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    ct.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

/** Decrypt a token payload produced by tokenEncrypt. Throws on a wrong
 *  key, a tampered ciphertext, or an unrecognized format. */
export function tokenDecrypt(payload: string, keyHex: string): string {
  const key = keyFromHex(keyHex);
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Unrecognized token payload format.");
  }
  const [, ivB64, ctB64, tagB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64url")),
    decipher.final(),
  ]);
  return pt.toString("utf8");
}
