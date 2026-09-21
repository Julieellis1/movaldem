import { describe, it, expect } from "vitest";
import { auth } from "@/modules/auth/auth.config";
describe("auth config", () => {
  it("maps onto PRD table names", () => {
    expect(auth.options.user?.modelName).toBe("users");
    expect(auth.options.user?.fields?.name).toBe("full_name");
    expect(auth.options.session?.modelName).toBe("sessions");
  });
});
