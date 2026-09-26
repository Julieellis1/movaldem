// Phase 4 Item 2 integration tests (plan 2026-09-26-phase4-giving.md Task 2;
// PRD 06 §3 GIV-01..12, §4, §11 edge cases).
//
// Paystack HTTP is mocked via injected `fetchImpl` — NEVER live calls.
// The database is the real Neon test DB (shared-suite pattern, unique rows).

import { describe, it, expect, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  givingProjects,
  notifications,
  paymentEvents,
  settings,
  transactions,
} from "@/db/schema";
import { PaystackClient, signPayload } from "@/modules/giving/paystack.client";
import {
  createCheckout,
  getPublicStatus,
  ingestWebhook,
  processWebhookEvent,
  verifyAndTransition,
  paymentAlertCounters,
  PaymentValidationError,
  TRANSACTION_REF_RE,
} from "@/modules/giving/payment.service";
import { reconcilePayments } from "@/jobs/payment-reconciler";
import {
  createProject,
  setProjectStatus,
} from "@/modules/giving/project.service";
import { setSetting } from "@/modules/platform/settings/settings.service";

const TEST_SECRET = `sk_test_giving_${Date.now()}`;

function uid() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

function email() {
  return `giver-${uid()}@test.org`;
}

type VerifyState = { status: string; amountKobo?: number; currency?: string };

// Mocked Paystack HTTP (injected fetch — the live API is never touched).
function mockPaystack(opts?: {
  verify?: VerifyState | ((ref: string) => VerifyState);
  initFail?: boolean;
}) {
  const seen: string[] = [];
  const fetchImpl = async (url: string, init?: RequestInit): Promise<Response> => {
    seen.push(url);
    if (url.endsWith("/transaction/initialize")) {
      if (opts?.initFail) {
        return Response.json(
          { status: false, message: "Service unavailable" },
          { status: 502 },
        );
      }
      const body = JSON.parse(String(init?.body)) as { reference: string };
      return Response.json({
        status: true,
        message: "Authorization URL created",
        data: {
          authorization_url: `https://checkout.paystack.com/${body.reference}`,
          access_code: "access_test_code",
          reference: body.reference,
        },
      });
    }
    const m = url.match(/\/transaction\/verify\/(.+)$/);
    if (m) {
      const ref = decodeURIComponent(m[1]);
      const v =
        typeof opts?.verify === "function" ? opts.verify(ref) : (opts?.verify ?? { status: "pending" });
      return Response.json({
        status: true,
        message: "Verification successful",
        data: {
          status: v.status,
          reference: ref,
          amount: v.amountKobo ?? 0,
          currency: v.currency ?? "NGN",
          channel: "card",
          paid_at: new Date().toISOString(),
        },
      });
    }
    throw new Error(`unexpected Paystack URL in test: ${url}`);
  };
  return {
    fetchImpl,
    seen,
    client: () => new PaystackClient({ secretKey: TEST_SECRET, fetchImpl }),
  };
}

function signedChargeSuccess(reference: string, paystackId = 900000 + Math.floor(Math.random() * 89999)) {
  const raw = JSON.stringify({
    event: "charge.success",
    data: { id: paystackId, reference },
  });
  return { raw, sig: signPayload(raw, TEST_SECRET) };
}

async function makeActiveProject() {
  const p = await createProject(
    { title: `Giving E2E Project ${uid()}`, target_naira: 100000 },
    { role: "admin", userId: null },
  );
  return setProjectStatus(p.id, "active", { role: "admin", userId: null });
}

async function txByRef(reference: string) {
  const [row] = await db.select().from(transactions).where(eq(transactions.reference, reference));
  return row;
}

afterAll(async () => {
  await db.delete(settings).where(eq(settings.key, "giving.alert_email"));
});

describe("giving payments journeys (GIV, mocked Paystack)", () => {
  it("GIV-01/02: checkout creates pending tx then webhook→successful with raised increment", async () => {
    const project = await makeActiveProject();
    const mock = mockPaystack({ verify: { status: "success", amountKobo: 500000 } });
    const em = email();
    let hooks = 0;

    const out = await createCheckout(
      {
        type: "project",
        projectId: project.id,
        amountNaira: 5000,
        name: "Ada Donor",
        email: em,
        ip: null,
      },
      { paystack: mock.client() },
    );
    expect(out.reference).toMatch(TRANSACTION_REF_RE);
    expect(out.authorizationUrl).toContain(out.reference);

    const pending = await txByRef(out.reference);
    expect(pending.status).toBe("pending");
    expect(pending.amount).toBe(500000); // GIV-02: kobo int
    expect(pending.currency).toBe("NGN");

    const { raw, sig } = signedChargeSuccess(out.reference);
    const ingested = await ingestWebhook(raw, sig, { paystack: mock.client() });
    expect(ingested.duplicate).toBe(false);

    const processed = await processWebhookEvent(ingested.eventKey, {
      paystack: mock.client(),
      onPaymentSucceeded: async () => {
        hooks += 1;
      },
    });
    expect(processed.status).toBe("successful");

    const done = await txByRef(out.reference);
    expect(done.status).toBe("successful");
    expect(done.paid_at).not.toBeNull();
    expect(done.payment_method).toBe("card");
    expect(hooks).toBe(1);

    const [proj] = await db
      .select({ raised: givingProjects.amount_raised_cached })
      .from(givingProjects)
      .where(eq(givingProjects.id, project.id));
    expect(proj.raised).toBe(500000);
  }, 30000);

  it("GIV-07: replayed webhook has a single effect (no double count/email)", async () => {
    const project = await makeActiveProject();
    const mock = mockPaystack({ verify: { status: "success", amountKobo: 250000 } });
    let hooks = 0;
    const deps = {
      paystack: mock.client(),
      onPaymentSucceeded: async () => {
        hooks += 1;
      },
    };

    const out = await createCheckout(
      {
        type: "project",
        projectId: project.id,
        amountNaira: 2500,
        name: "Replay Donor",
        email: email(),
        ip: null,
      },
      deps,
    );
    const { raw, sig } = signedChargeSuccess(out.reference, 910000 + Math.floor(Math.random() * 8999));
    const first = await ingestWebhook(raw, sig, deps);
    const second = await ingestWebhook(raw, sig, deps);
    expect(second.duplicate).toBe(true);
    expect(second.eventKey).toBe(first.eventKey);

    await processWebhookEvent(first.eventKey, deps);
    const replay = await processWebhookEvent(first.eventKey, deps);
    expect(replay.deduped).toBe(true);

    const [proj] = await db
      .select({ raised: givingProjects.amount_raised_cached })
      .from(givingProjects)
      .where(eq(givingProjects.id, project.id));
    expect(proj.raised).toBe(250000);
    expect(hooks).toBe(1);
  }, 30000);

  it("GIV-04: amount mismatch → failed + admin alert, never successful", async () => {
    await setSetting(db, "giving.alert_email", `alerts-${uid()}@test.org`, {});
    const mock = mockPaystack({ verify: { status: "success", amountKobo: 499900 } });

    const out = await createCheckout(
      {
        type: "offering",
        amountNaira: 5000,
        name: "Mismatch Donor",
        email: email(),
        ip: null,
      },
      { paystack: mock.client() },
    );
    const result = await verifyAndTransition(out.reference, "verify", {
      paystack: mock.client(),
    });
    expect(result.status).toBe("failed");
    expect(result.changed).toBe(true);

    const row = await txByRef(out.reference);
    expect(row.status).toBe("failed");
    expect(row.failure_reason).toMatch(/mismatch/i);

    const alerts = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, "giving_alert"));
    expect(alerts.some((a) => String((a.payload as { reference?: string }).reference) === out.reference)).toBe(
      true,
    );
  }, 30000);

  it("GIV-03: frontend return alone never marks success; pending verify leaves pending", async () => {
    const mock = mockPaystack({ verify: { status: "pending", amountKobo: 100000 } });
    const out = await createCheckout(
      {
        type: "tithe",
        amountNaira: 1000,
        name: "Polling Donor",
        email: email(),
        ip: null,
      },
      { paystack: mock.client() },
    );
    // Confirmation page polls this — status only, no personal data.
    const pub = await getPublicStatus(out.reference);
    expect(pub).toEqual({ status: "pending" });

    const result = await verifyAndTransition(out.reference, "verify", {
      paystack: mock.client(),
    });
    expect(result.status).toBe("pending");
    expect(result.changed).toBe(false);
    expect(mock.seen.some((u) => u.includes("/transaction/verify/"))).toBe(true);
    expect((await txByRef(out.reference)).status).toBe("pending");
  }, 30000);

  it("GIV-05: invalid signature → 401 + stored invalid event + alert counter", async () => {
    const before = paymentAlertCounters.invalidSignature;
    const eventId = 920000 + Math.floor(Math.random() * 8999);
    const { raw } = signedChargeSuccess("MVD-20990101-FFFFFF00", eventId);
    await expect(
      ingestWebhook(raw, "not-the-real-signature", {
        paystack: new PaystackClient({ secretKey: TEST_SECRET, fetchImpl: mockPaystack().fetchImpl }),
      }),
    ).rejects.toMatchObject({ status: 401, name: "WebhookSignatureError" });
    expect(paymentAlertCounters.invalidSignature).toBe(before + 1);

    const [stored] = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.event_key, `webhook:charge.success:${eventId}`));
    expect(stored.signature_valid).toBe(false);
    expect(stored.processed).toBe(false);
  }, 30000);

  it("GIV-10/11: pending→abandoned after horizon, then late success allowed", async () => {
    const old = new Date(Date.now() - 2 * 3600_000);
    const reference = `MVD-TEST-${uid()}`.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    const [inserted] = await db
      .insert(transactions)
      .values({
        reference,
        name: "Late Donor",
        email: email(),
        amount: 200000,
        currency: "NGN",
        type: "general",
        status: "pending",
        created_at: old,
      })
      .returning();

    // Paystack reports no payment → past abandon horizon → abandoned.
    const noPay = mockPaystack({ verify: { status: "abandoned", amountKobo: 200000 } });
    const run1 = await reconcilePayments(new Date(), db, { paystack: noPay.client() });
    expect(run1.abandoned).toBeGreaterThanOrEqual(1);
    expect((await txByRef(reference)).status).toBe("abandoned");

    // Idempotent re-run: nothing left to do for this row.
    const run2 = await reconcilePayments(new Date(), db, { paystack: noPay.client() });
    const [still] = await db
      .select({ status: transactions.status })
      .from(transactions)
      .where(eq(transactions.id, inserted.id));
    expect(still.status).toBe("abandoned");

    // Late payment arrives (webhook verify): abandoned→successful (GIV-11).
    const late = mockPaystack({ verify: { status: "success", amountKobo: 200000 } });
    const out = await verifyAndTransition(reference, "webhook", {
      paystack: late.client(),
    });
    expect(out.status).toBe("successful");
    expect(out.changed).toBe(true);
    void run2;
  }, 30000);

  it("checkout validation: project iff type=project, min amount, email (400s)", async () => {
    const mock = mockPaystack();
    const base = {
      amountNaira: 1000,
      name: "Validator",
      email: email(),
      ip: null,
    } as const;

    await expect(
      createCheckout({ ...base, type: "project" }, { paystack: mock.client() }),
    ).rejects.toBeInstanceOf(PaymentValidationError);

    const project = await makeActiveProject();
    await expect(
      createCheckout(
        { ...base, type: "offering", projectId: project.id },
        { paystack: mock.client() },
      ),
    ).rejects.toBeInstanceOf(PaymentValidationError);

    await expect(
      createCheckout({ ...base, type: "tithe", amountNaira: 50 }, { paystack: mock.client() }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      createCheckout({ ...base, type: "tithe", email: "not-an-email" }, { paystack: mock.client() }),
    ).rejects.toThrow();

    await expect(
      createCheckout({ ...base, type: "closed" as never }, { paystack: mock.client() }),
    ).rejects.toThrow();

    // Closed project rejects gifts (PRJ-02 via checkout).
    await setProjectStatus(project.id, "closed", { role: "admin", userId: null });
    await expect(
      createCheckout(
        { ...base, type: "project", projectId: project.id, email: email() },
        { paystack: mock.client() },
      ),
    ).rejects.toBeInstanceOf(PaymentValidationError);
  }, 30000);

  it("Paystack outage on initialise → friendly error, tx failed (retryable)", async () => {
    const mock = mockPaystack({ initFail: true });
    const em = email();
    await expect(
      createCheckout(
        { type: "general", amountNaira: 1500, name: "Outage Donor", email: em, ip: null },
        { paystack: mock.client() },
      ),
    ).rejects.toThrow(/try again/i);
    const [row] = await db.select().from(transactions).where(eq(transactions.email, em));
    expect(row.status).toBe("failed");
  }, 30000);

  it("getPublicStatus exposes status only — no personal data", async () => {
    const mock = mockPaystack();
    const out = await createCheckout(
      {
        type: "general",
        amountNaira: 2000,
        name: "Private Donor",
        email: email(),
        ip: null,
      },
      { paystack: mock.client() },
    );
    const pub = await getPublicStatus(out.reference);
    expect(Object.keys(pub)).toEqual(["status"]);
    expect(JSON.stringify(pub)).not.toContain("Private Donor");
    await expect(getPublicStatus("MVD-20990101-NOTREAL")).rejects.toBeInstanceOf(
      PaymentValidationError,
    );
  }, 30000);
});
