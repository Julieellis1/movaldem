import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "@/lib/env";
const ALGO = "aes-256-gcm";
function key() { return scryptSync(env().APP_SECRET, "movaldem-salt", 32); }
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv.toString("base64"), enc.toString("base64"), c.getAuthTag().toString("base64")].join(":");
}
export function decryptSecret(payload: string): string {
  const [ivB, encB, tagB] = payload.split(":");
  const d = createDecipheriv(ALGO, key(), Buffer.from(ivB, "base64"));
  d.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([d.update(Buffer.from(encB, "base64")), d.final()]).toString("utf8");
}
export function maskSecret(payload: string | null): string {
  if (!payload) return "";
  const plain = decryptSecret(payload);
  return `${plain.slice(0, 8)}â€¢â€¢â€¢â€¢${plain.slice(-4)}`;
}
