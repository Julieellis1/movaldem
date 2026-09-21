import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
describe("crypto", () => {
  it("round-trips a secret", () => {
    process.env.APP_SECRET = "a".repeat(32);
    const cipher = encryptSecret("sk_live_abcdef1234");
    expect(cipher).not.toContain("sk_live");
    expect(decryptSecret(cipher)).toBe("sk_live_abcdef1234");
  });
});
