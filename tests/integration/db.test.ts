import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
describe("db", () => {
  it("connects and returns a scalar", async () => {
    const rows = await db.execute<{ now: Date }>("select now() as now");
    expect(rows.rows.length).toBe(1);
  });
});
