import { describe, it, expect } from "vitest";
import { isoWeekKey, monthKey, yearKey, toLagosDate } from "@/lib/datetime";

describe("datetime", () => {
  // 2026-09-21 is a Monday, in ISO week 2026-W39 (week starting Mon 2026-09-21)
  it("produces ISO week keys in Lagos time", () => {
    const utc = new Date("2026-09-21T00:00:00Z"); // 01:00 Lagos, still Mon
    expect(isoWeekKey(utc)).toBe("2026-W39");
  });
  it("respects Lagos offset for week boundaries", () => {
    const justBeforeMon = new Date("2026-09-20T22:30:00Z"); // 23:30 Sun in Lagos
    expect(isoWeekKey(justBeforeMon)).toBe("2026-W38");
  });
  it("produces month and year keys", () => {
    const d = new Date("2026-09-21T00:00:00Z");
    expect(monthKey(d)).toBe("2026-09");
    expect(yearKey(d)).toBe("2026");
  });
});
