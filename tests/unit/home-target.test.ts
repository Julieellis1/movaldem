import { describe, it, expect } from "vitest";
import { resolveHomeTarget } from "@/modules/auth/home-target";

// Post-login landing: "/" must resolve per audience instead of bouncing
// everyone back to /login (staff sign-in looped login -> "/" -> login).
describe("resolveHomeTarget", () => {
  it("sends staff to the admin dashboard", () => {
    expect(resolveHomeTarget("staff")).toBe("/admin");
  });

  it("sends members to the public teaching index (placeholder until the Phase 3 homepage)", () => {
    expect(resolveHomeTarget("member")).toBe("/sermons");
  });

  it("sends guests to login", () => {
    expect(resolveHomeTarget("guest")).toBe("/login");
  });
});
