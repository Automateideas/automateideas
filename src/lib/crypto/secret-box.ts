import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Encrypts secrets kept in the database (e.g. a company's WhatsApp access
// token) with AES-256-GCM. The key is APP_ENCRYPTION_KEY: 32 random bytes,
// base64 (make one with: openssl rand -base64 32). It is separate from the
// login secret, so rotating one never breaks the other.
//
// Format: "v1.<iv>.<tag>.<ciphertext>", each part base64url.

function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error("APP_ENCRYPTION_KEY is not set.");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes, base64 (openssl rand -base64 32).");
  return k;
}

export const encryptionConfigured = () => {
  try {
    key();
    return true;
  } catch {
    return false;
  }
};

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function open(sealed: string): string {
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !body) throw new Error("Not a sealed value.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}
