import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notifications, transactions } from "@/db/schema";
import {
  applySuccessfulPayment,
  createProject,
  getActiveProject,
  getProjectProgress,
  incrementRaised,
  reverseRefundedPayment,
  setProjectStatus,
} from "@/modules/giving/project.service";
import {
  createSignedReceiptUrl,
  issueReceipt,
  receiptPayload,
  receiptPdfBuffer,
  resendReceipt,
  verifySignedReceiptUrl,
} from "@/modules/giving/receipt.service";

// Phase 4 Item 3 (plan 2026-09-26-phase4-giving.md Task 3; PRD 06 §5-6):
// PRJ-01/02/04, RCP-01/02/04/05 across the 5.5 journey slice
// (successful gift raises project progress; receipt issued + viewable).

function uid() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

const admin = { role: "admin" as const, userId: null };

async function makeActiveProject(targetNaira: number) {
  const p = await createProject(
    { title: `Building Project ${uid()}`, target_naira: targetNaira },
    admin,
  );
  return setProjectStatus(p.id, "active", admin);
}

function txRef() {
  return `MVD-TEST-${uid()}`;
}

async function insertTx(opts: {
  projectId?: string | null;
  amount: number;
  status: "pending" | "successful" | "failed" | "abandoned" | "refunded";
  type?: "tithe" | "offering" | "general" | "project";
}) {
  const [row] = await db
    .insert(transactions)
    .values({
      reference: txRef(),
      name: "Test Donor",
      email: `donor-${uid()}@test.org`,
      amount: opts.amount,
      currency: "NGN",
      type: opts.type ?? "project",
      project_id: opts.projectId ?? null,
      status: opts.status,
      paid_at: opts.status === "successful" ? new Date() : null,
    })
    .returning();
  return row;
}

describe("giving projects + receipts (PRJ/RCP, 5.5 journey)", () => {
  it("PRJ-02/5.5: successful +₦5,000 project gift raises progress", async () => {
    const p = await makeActiveProject(100000);
    const tx = await insertTx({
      projectId: p.id,
      amount: 500000,
      status: "successful",
    });
    // PaymentService seam: increment inside the status-flip transaction.
    await db.transaction(async (t) => {
      await incrementRaised(t, p.id, tx.amount);
    });
    const progress = await getProjectProgress(p.id);
    expect(progress.raisedKobo).toBe(500000);
    expect(progress.targetKobo).toBe(10000000);
    expect(progress.percent1dp).toBe(5);
  }, 30000);

  it("failed/abandoned rows never raise progress (PRD 06 §4)", async () => {
    const p = await makeActiveProject(50000);
    const failed = await insertTx({
      projectId: p.id,
      amount: 250000,
      status: "failed",
    });
    const abandoned = await insertTx({
      projectId: p.id,
      amount: 250000,
      status: "abandoned",
    });
    await db.transaction(async (t) => {
      await applySuccessfulPayment(t, failed);
      await applySuccessfulPayment(t, abandoned);
    });
    const progress = await getProjectProgress(p.id);
    expect(progress.raisedKobo).toBe(0);
    expect(progress.percent1dp).toBe(0);
  }, 30000);

  it("refunded amounts are excluded after reversal (PRD 06 §4)", async () => {
    const p = await makeActiveProject(50000);
    const tx = await insertTx({
      projectId: p.id,
      amount: 500000,
      status: "successful",
    });
    await db.transaction(async (t) => {
      await incrementRaised(t, p.id, tx.amount);
    });
    expect((await getProjectProgress(p.id)).raisedKobo).toBe(500000);
    await db.transaction(async (t) => {
      await reverseRefundedPayment(t, p.id, tx.amount);
    });
    const progress = await getProjectProgress(p.id);
    expect(progress.raisedKobo).toBe(0);
  }, 30000);

  it("PRJ-02: closed project gate rejects gifts; active accepts", async () => {
    const p = await makeActiveProject(20000);
    const visible = await getActiveProject(p.slug);
    expect(visible?.id).toBe(p.id);
    await setProjectStatus(p.id, "closed", admin);
    expect(await getActiveProject(p.slug)).toBeNull();
  }, 30000);

  it("PRJ-02: project outside its date range is not active", async () => {
    const p = await createProject(
      {
        title: `Future Project ${uid()}`,
        target_naira: 10000,
        start_date: "2099-01-01",
      },
      admin,
    );
    await setProjectStatus(p.id, "active", admin);
    expect(await getActiveProject(p.slug)).toBeNull();
  }, 30000);

  it("RCP-01: receipt numbers unique + sequential across two issues", async () => {
    const p = await makeActiveProject(20000);
    const a = await insertTx({
      projectId: p.id,
      amount: 10000,
      status: "successful",
    });
    const b = await insertTx({
      projectId: p.id,
      amount: 20000,
      status: "successful",
    });
    const numA = await issueReceipt(a.id);
    const numB = await issueReceipt(b.id);
    expect(numA).toMatch(/^MVD-RCP-\d{4}-\d{6}$/);
    expect(numB).toMatch(/^MVD-RCP-\d{4}-\d{6}$/);
    expect(numA).not.toBe(numB);
    const seqA = Number(numA.slice(-6));
    const seqB = Number(numB.slice(-6));
    // Same calendar year (Lagos): strictly sequential.
    expect(seqB).toBe(seqA + 1);
    // Idempotent re-issue returns the same number.
    expect(await issueReceipt(a.id)).toBe(numA);
  }, 30000);

  it("PRJ-01: percent to 1dp; bar caps at 100 over target", async () => {
    const p = await makeActiveProject(100000);
    await db.transaction(async (t) => {
      await incrementRaised(t, p.id, 4350000);
    });
    const partial = await getProjectProgress(p.slug);
    expect(partial.percent1dp).toBe(43.5);
    expect(partial.barPercent).toBe(43.5);
    await db.transaction(async (t) => {
      await incrementRaised(t, p.id, 10000000);
    });
    const over = await getProjectProgress(p.id);
    expect(over.raisedKobo).toBe(14350000);
    expect(over.percent1dp).toBe(143.5);
    expect(over.barPercent).toBe(100);
  }, 30000);

  it("RCP-02: payload carries church/donor/amount/references/WAT fields", async () => {
    const p = await makeActiveProject(20000);
    const tx = await insertTx({
      projectId: p.id,
      amount: 500000,
      status: "successful",
    });
    const num = await issueReceipt(tx.id);
    const payload = await receiptPayload(tx.id);
    expect(payload.receiptNumber).toBe(num);
    expect(payload.donorName).toBe("Test Donor");
    expect(payload.amountKobo).toBe(500000);
    expect(payload.amountFormatted).toContain("5,000");
    expect(payload.givingType).toBe("project");
    expect(payload.projectName).not.toBeNull();
    expect(payload.reference).toBe(tx.reference);
    expect(payload.watDatetime).toMatch(/WAT$/);
    expect(payload.churchName.length).toBeGreaterThan(0);
    const pdf = await receiptPdfBuffer(payload);
    expect(pdf.length).toBeGreaterThan(500);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  }, 30000);

  it("RCP-04: signed URL verifies; expired + tampered rejected", async () => {
    const ref = txRef();
    const secret = `test-secret-${uid()}`;
    const url = createSignedReceiptUrl(ref, secret, { baseUrl: "http://localhost:3000" });
    expect(verifySignedReceiptUrl(url, secret)).toBe(ref);

    const expired = createSignedReceiptUrl(ref, secret, {
      baseUrl: "http://localhost:3000",
      expiresInSeconds: -10,
    });
    expect(() => verifySignedReceiptUrl(expired, secret)).toThrow(/expired/i);

    const tampered = url.replace(/sig=[0-9a-f]+/, "sig=deadbeef");
    expect(() => verifySignedReceiptUrl(tampered, secret)).toThrow(
      /mismatch|invalid/i,
    );
    expect(() => verifySignedReceiptUrl(url, `wrong-${secret}`)).toThrow(
      /mismatch|invalid/i,
    );
  }, 30000);

  it("RCP-05: resend enqueues a giving_receipt outbox row", async () => {
    const p = await makeActiveProject(20000);
    const tx = await insertTx({
      projectId: p.id,
      amount: 15000,
      status: "successful",
    });
    const { notificationId, receiptNumber } = await resendReceipt(tx.id);
    expect(receiptNumber).toMatch(/^MVD-RCP-\d{4}-\d{6}$/);
    const [row] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId));
    expect(row.type).toBe("giving_receipt");
    expect(row.status).toBe("queued");
    expect(row.recipient).toBe(tx.email);
    expect(String((row.payload as { receiptNumber?: string }).receiptNumber)).toBe(
      receiptNumber,
    );
  }, 30000);
});
