import { describe, it, expect } from "vitest";
import { hashIp } from "@/lib/ip-hash";
describe("hashIp", () => {
  it("is deterministic and salted", () => {
    process.env.IP_HASH_SALT = "0123456789abcdef0123456789abcdef";
    expect(hashIp("102.89.23.10")).toBe(hashIp("102.89.23.10"));
    expect(hashIp("102.89.23.10")).not.toBe(hashIp("102.89.23.11"));
  });
});
