import { createHash } from "node:crypto";
import { env } from "@/lib/env";
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`${env().IP_HASH_SALT}:${ip}`).digest("hex");
}
