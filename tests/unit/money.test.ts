import { describe, it, expect } from "vitest";
import { formatNaira, parseNairaToKobo } from "@/lib/money";

describe("money", () => {
  it("formats kobo to naira", () => {
    expect(formatNaira(1000000)).toBe("\u20A610,000.00");
    expect(formatNaira(0)).toBe("\u20A60.00");
  });
  it("parses naira input to kobo", () => {
    expect(parseNairaToKobo("10000.00")).toBe(1000000);
    expect(parseNairaToKobo("10000")).toBe(1000000);
  });
  it("rejects negative and invalid input", () => {
    expect(() => parseNairaToKobo("-5")).toThrow();
    expect(() => parseNairaToKobo("abc")).toThrow();
  });
});
