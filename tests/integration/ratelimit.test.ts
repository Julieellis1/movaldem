import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/ratelimit";
describe("rateLimit", () => {
  it("blocks after the limit", async () => {
    for (let i = 0; i < 5; i++) expect((await rateLimit(`test:${i % 1}`, { limit: 3, window: "60 s" })).success).toBe(i < 3);
  });
});
