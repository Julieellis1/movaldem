import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The dotenv fallback is driven by a mocked fs so the assertions hold on a
// developer machine (which has a .env.local) and in CI (which does not).
const fsMock = vi.hoisted(() => ({ readFileSync: vi.fn() }));
vi.mock("node:fs", () => ({ readFileSync: fsMock.readFileSync }));

const ORIG = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIG };
  fsMock.readFileSync.mockReset();
  fsMock.readFileSync.mockImplementation(() => {
    throw new Error("ENOENT");
  });
});
afterEach(() => {
  process.env = ORIG;
});

describe("env", () => {
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

  it("falls back to .env.local for non-Next entry points", async () => {
    // `pnpm db:seed` and `pnpm db:create-superadmin` run under plain Node,
    // which does not read .env.local the way Next.js does.
    const secret = "b".repeat(32);
    fsMock.readFileSync.mockReturnValue(`APP_SECRET=${secret}\n`);
    delete process.env.APP_SECRET;
    const { loadEnv } = await import("@/lib/env");
    expect(loadEnv().APP_SECRET).toBe(secret);
  });

  it("never overrides a variable already set in the process env", async () => {
    process.env.APP_SECRET = "c".repeat(32);
    fsMock.readFileSync.mockReturnValue("APP_SECRET=should-not-win\n");
    const { loadEnv } = await import("@/lib/env");
    expect(loadEnv().APP_SECRET).toBe("c".repeat(32));
  });
});
