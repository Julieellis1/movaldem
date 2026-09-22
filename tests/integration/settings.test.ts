import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { getSetting, setSetting, getSecret } from "@/modules/platform/settings/settings.service";

describe("settings", () => {
  it("reads a seeded default", async () => {
    expect(await getSetting(db, "content.items_per_page")).toBe(12);
  });
  it("returns fallback for unknown keys", async () => {
    expect(await getSetting(db, "nope.x", "default")).toBe("default");
  });
  it("encrypts secrets at rest and never stores plaintext", async () => {
    await setSetting(db, "paystack.secret_key", "sk_live_abcdef", { isSecret: true, updatedBy: null });
    const cipher = await getSecret(db, "paystack.secret_key"); // returns plaintext
    expect(cipher).toBe("sk_live_abcdef");
    const raw = await db.execute<{ value: unknown }>("select value from settings where key = 'paystack.secret_key'");
    expect(JSON.stringify(raw.rows[0].value)).not.toContain("sk_live_abcdef");
  });
});
