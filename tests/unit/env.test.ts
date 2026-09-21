// tests/unit/env.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
describe("env", () => {
  const ORIG = { ...process.env };
  beforeEach(() => { process.env = { ...ORIG }; });
  afterEach(() => { process.env = ORIG; });

  it("parses a valid environment", async () => {
    process.env.DATABASE_URL = "postgres://u:p@host/db";
    process.env.APP_URL = "http://localhost:3000";
    process.env.APP_SECRET = "a".repeat(32);
    const { loadEnv } = await import("@/lib/env");
    expect(loadEnv().DATABASE_URL).toBe("postgres://u:p@host/db");
    expect(loadEnv().APP_URL).toBe("http://localhost:3000");
  });

  it("throws when a required var is missing", async () => {
    delete process.env.APP_SECRET;
    const { loadEnv } = await import("@/lib/env");
    expect(() => loadEnv()).toThrow(/APP_SECRET/);
  });
});
