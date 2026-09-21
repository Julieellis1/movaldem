import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/modules/auth/password";
describe("password", () => {
  it("hashes and verifies", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(hash).not.toBe("correct-horse-battery");
    expect(await verifyPassword("correct-horse-battery", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
