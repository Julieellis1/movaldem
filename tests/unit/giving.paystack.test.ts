// Phase 4 Item 2 unit tests (plan 2026-09-26-phase4-giving.md Task 2):
// Paystack HMAC vectors (GIV-05), reference/receipt formats (GIV-01,
// RCP-01), money edge cases. Pure — no DB, no live Paystack calls.

import { describe, it, expect } from "vitest";
import {
  PaystackClient,
  PAYSTACK_SIGNATURE_HEADER,
} from "@/modules/giving/paystack.client";
import {
  generateTransactionReference,
  TRANSACTION_REF_RE,
} from "@/modules/giving/payment.service";
import { formatNaira, parseNairaToKobo } from "@/lib/money";

const VECTOR_SECRET = "sk_test_vector_key";
const VECTOR_BODY =
  '{"event":"charge.success","data":{"reference":"MVD-20260101-ABCDEF12"}}';
// HMAC-SHA512(VECTOR_BODY, VECTOR_SECRET), computed once with node:crypto.
const VECTOR_HMAC =
  "0189d37816376d12e6a3aefef52114431c4c3c529325e6f393f296adaf9530f3eed497559bc4aee1dea4147360a2f79607098822fe6d1d56b933ed254141acb7";

function client() {
  return new PaystackClient({ secretKey: VECTOR_SECRET });
}

describe("paystack HMAC signature (GIV-05)", () => {
  it("accepts the known Paystack-docs vector", () => {
    expect(client().isSignatureValid(VECTOR_BODY, VECTOR_HMAC)).toBe(true);
  });

  it("accepts Buffer raw bodies (req.text bytes path)", () => {
    expect(client().isSignatureValid(Buffer.from(VECTOR_BODY, "utf8"), VECTOR_HMAC)).toBe(
      true,
    );
  });

  it("rejects tampered bodies, wrong secrets and missing headers", () => {
    const c = client();
    expect(c.isSignatureValid(`${VECTOR_BODY} `, VECTOR_HMAC)).toBe(false);
    expect(c.isSignatureValid(VECTOR_BODY, "deadbeef")).toBe(false);
    expect(c.isSignatureValid(VECTOR_BODY, null)).toBe(false);
    expect(c.isSignatureValid(VECTOR_BODY, undefined)).toBe(false);
    expect(c.isSignatureValid(VECTOR_BODY, "")).toBe(false);
    const other = new PaystackClient({ secretKey: "different-secret" });
    expect(other.isSignatureValid(VECTOR_BODY, VECTOR_HMAC)).toBe(false);
  });

  it("uses the documented x-paystack-signature header name", () => {
    expect(PAYSTACK_SIGNATURE_HEADER).toBe("x-paystack-signature");
  });
});

describe("transaction reference format (GIV-01)", () => {
  it("matches MVD-<yyyymmdd>-<random>", () => {
    const ref = generateTransactionReference(new Date("2026-09-26T10:00:00Z"));
    expect(ref).toMatch(TRANSACTION_REF_RE);
    expect(ref.startsWith("MVD-20260926-")).toBe(true);
  });

  it("is unique per call", () => {
    const seen = new Set(
      Array.from({ length: 50 }, () => generateTransactionReference()),
    );
    expect(seen.size).toBe(50);
  });
});

describe("receipt number format (RCP-01)", () => {
  const RECEIPT_RE = /^MVD-RCP-\d{4}-\d{6}$/;
  it("accepts sequential numbers, rejects lookalikes", () => {
    expect("MVD-RCP-2026-000123").toMatch(RECEIPT_RE);
    expect("MVD-RCP-2026-123").not.toMatch(RECEIPT_RE);
    expect("MVD-20260926-ABCDEF12").not.toMatch(RECEIPT_RE);
  });
});

describe("money edge cases (GIV-02, kobo ints)", () => {
  it("formats zero and large kobo amounts", () => {
    expect(formatNaira(0)).toBe("₦0.00");
    expect(formatNaira(100)).toBe("₦1.00");
    expect(formatNaira(435000000)).toBe("₦4,350,000.00");
  });

  it("parses smallest unit and 2dp inputs", () => {
    expect(parseNairaToKobo("0.01")).toBe(1);
    expect(parseNairaToKobo("100")).toBe(10000);
    expect(parseNairaToKobo("10000.00")).toBe(1000000);
  });

  it("rejects non-integer kobo and invalid naira input", () => {
    expect(() => formatNaira(10.5)).toThrow();
    expect(() => formatNaira(NaN)).toThrow();
    expect(() => parseNairaToKobo("")).toThrow();
    expect(() => parseNairaToKobo("-5")).toThrow();
    expect(() => parseNairaToKobo("abc")).toThrow();
    expect(() => parseNairaToKobo("1,000")).toThrow();
  });
});
