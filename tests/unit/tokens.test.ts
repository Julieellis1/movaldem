import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("tokens", () => {
  it("cn is a function", () => {
    expect(typeof cn).toBe("function");
  });
});
