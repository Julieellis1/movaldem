// Phase 4 giving — PaymentService (PRD 06 §1-4, §7, §11).
//
// The ONLY Paystack caller (ARC-03): every checkout, webhook ingest,
// verify+transition and reconciliation flows through here. Money is integer
// kobo end-to-end; currency is always NGN (GIV-02).
//
// Conventions follow Phase 1-3 services: Zod server-side validation,
// transactional writes with audit rows, salted IP hashing (never raw IP),
// rate limits via `src/lib/ratelimit`, notifications via the outbox.
//
// Cross-service rule: this file MUST NOT import project.service (circular
// seam). Project raised increments happen through the `onPaymentSucceeded`
// callback, and refund reversals use a local guarded decrement — the route
// layer wires the real receipt/project effects.

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db, type DB } from "@/db/client";
import {
  givingProjects,
  paymentEvents,
  transactions,
} from "@/db/schema";
import { auditLog } from "@/modules/platform/audit/audit.service";
import { getSetting } from "@/modules/platform/settings/settings.service";
import { enqueueNotification } from "@/modules/platform/notifications/notifications.service";
import { RateLimitError, rateLimit, rateLimitKey } from "@/lib/ratelimit";
import { hashIp } from "@/lib/ip-hash";
import { formatNaira } from "@/lib/money";
import { env } from "@/lib/env";
import {
  PAYSTACK_SIGNATURE_HEADER,
  PaystackClient,
  PaystackError,
} from "./paystack.client";
import { lagosDateString } from "./project.service";

export type { PaystackClient };

// ---------------------------------------------------------------------------
// Errors / counters
// ---------------------------------------------------------------------------

export class PaymentValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "PaymentValidationError";
  }
}

export class WebhookSignatureError extends Error {
  readonly status = 401;
  constructor(message = "Invalid webhook signature (GIV-05)") {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

// Observability for GIV-05 (invalid signatures) and GIV-04 (mismatches).
// Routes/tests can read these; a metrics exporter can scrape them later.
export const paymentAlertCounters = {
  invalidSignature: 0,
  verificationMismatch: 0,
};

// ---------------------------------------------------------------------------
// Constants / schemas
// ---------------------------------------------------------------------------

export const GIVING_TYPES = ["tithe", "offering", "general", "project"] as const;
export type GivingType = (typeof GIVING_TYPES)[number];

export const CHECKOUT_RATE_LIMIT = { limit: 10, window: "60 m" } as const;
export const RECONCILE_VERIFY_AFTER_MINUTES = 10;

export const TRANSACTION_REF_RE = /^MVD-\d{8}-[0-9A-F]{6,}$/;

const NIGERIAN_PHONE_RE = /^(\+234\d{10}|0\d{10})$/;

const checkoutSchema = z.object({
  type: z.enum(GIVING_TYPES),
  projectId: z.string().uuid().nullish(),
  // Amount entered in naira (max 2dp); stored/sent as integer kobo.
  amountNaira: z.number(),
  name: z.string().trim().min(1, "name is required").max(200),
  email: z.string().trim().email("email must be a valid email address").max(320),
  phone: z.string().trim().max(30).nullish(),
  message: z.string().trim().max(500).nullish(),
  userId: z.string().uuid().nullish(),
  ip: z.string().max(200).nullish(),
  ipHash: z.string().max(128).nullish(),
});

export type CheckoutInput = z.input<typeof checkoutSchema>;
export type TransactionRow = typeof transactions.$inferSelect;

export type ServiceDeps = {
  database?: DB;
  paystack?: PaystackClient;
  /** Post-commit hook (receipt issue + email). Wired by routes; NOT in tx. */
  onPaymentSucceeded?: (row: TransactionRow) => Promise<void>;
};

function databaseOf(deps?: ServiceDeps): DB {
  return deps?.database ?? db;
}

function paystackOf(deps?: ServiceDeps): PaystackClient {
  if (deps?.paystack) return deps.paystack;
  const secret = env().PAYSTACK_SECRET_KEY;
  if (!secret) throw new PaystackError("Paystack secret key is not configured (GIV-13)");
  return new PaystackClient({ secretKey: secret });
}

export type TxHandle = Parameters<Parameters<DB["transaction"]>[0]>[0];

// GIV-01: server-generated unique reference `MVD-<yyyymmdd>-<random>`
// (Lagos calendar date per the global timezone rule).
export function generateTransactionReference(now: Date = new Date()): string {
  const day = lagosDateString(now).replace(/-/g, "");
  const random = randomBytes(6).toString("hex").toUpperCase();
  return `MVD-${day}-${random}`;
}

function nairaToKoboStrict(naira: number): number {
  if (!Number.isFinite(naira) || naira <= 0) {
    throw new PaymentValidationError("amount must be a positive number (NGN)");
  }
  const kobo = Math.round(naira * 100);
  if (!Number.isSafeInteger(kobo) || kobo <= 0) {
    throw new PaymentValidationError("amount must be a positive number (NGN)");
  }
  if (Math.abs(naira * 100 - kobo) > 1e-6) {
    throw new PaymentValidationError("amount supports at most 2 decimal places");
  }
  return kobo;
}

// ---------------------------------------------------------------------------
// createCheckout (GIV-01/02/12)
// ---------------------------------------------------------------------------

export async function createCheckout(
  rawInput: CheckoutInput,
  deps?: ServiceDeps,
): Promise<{ reference: string; authorizationUrl: string }> {
  const input = checkoutSchema.parse(rawInput);
  const database = databaseOf(deps);
  const tdb = database as DB;

  const amountKobo = nairaToKoboStrict(input.amountNaira);

  // Settings gates (plan Task 2 interface). Amount settings are integer
  // kobo (seed default giving.min_amount = 10000 = ₦100); the code fallback
  // matches that default when the setting is absent.
  const minKobo = (await getSetting<number>(tdb, "giving.min_amount", 10000)) ?? 10000;
  const maxKobo = await getSetting<number | null>(tdb, "giving.max_amount", null);
  const requirePhone =
    (await getSetting<boolean>(tdb, "giving.require_phone", false)) ?? false;
  if (!Number.isInteger(minKobo) || minKobo < 0) {
    throw new PaymentValidationError("giving.min_amount is misconfigured (GIV-02)");
  }
  if (amountKobo < minKobo) {
    throw new PaymentValidationError(
      `amount is below the minimum of ${formatNaira(minKobo)} (GIV-02)`,
    );
  }
  if (maxKobo !== null && maxKobo !== undefined) {
    if (!Number.isInteger(maxKobo) || maxKobo < 0) {
      throw new PaymentValidationError("giving.max_amount is misconfigured (GIV-02)");
    }
    if (amountKobo > maxKobo) {
      throw new PaymentValidationError(
        `amount is above the maximum of ${formatNaira(maxKobo)} (GIV-02)`,
      );
    }
  }

  if (requirePhone && !input.phone?.trim()) {
    throw new PaymentValidationError("phone is required (giving.require_phone)");
  }
  if (input.phone?.trim() && !NIGERIAN_PHONE_RE.test(input.phone.trim())) {
    throw new PaymentValidationError("phone must be a valid Nigerian number");
  }

  // Project gate: project_id present IFF type=project, and the project must
  // be active + in range (PRJ-02). Non-project gifts MUST NOT carry one.
  let projectId: string | null = null;
  if (input.type === "project") {
    if (!input.projectId) {
      throw new PaymentValidationError("project is required for project giving (PRJ-02)");
    }
    const [p] = await tdb
      .select()
      .from(givingProjects)
      .where(eq(givingProjects.id, input.projectId));
    if (!p || p.deleted_at) {
      throw new PaymentValidationError("selected project is not available (PRJ-02)");
    }
    if (p.status !== "active") {
      throw new PaymentValidationError("selected project is not accepting gifts (PRJ-02)");
    }
    const today = lagosDateString();
    if ((p.start_date && p.start_date > today) || (p.end_date && p.end_date < today)) {
      throw new PaymentValidationError("selected project is not accepting gifts (PRJ-02)");
    }
    projectId = p.id;
  } else if (input.projectId) {
    throw new PaymentValidationError("project applies to project giving only");
  }

  // GIV-12: rate-limit per IP and per email (two buckets so one bad actor
  // cannot be masked by the other dimension).
  const ipHash = input.ip ? hashIp(input.ip) : (input.ipHash ?? null);
  const emailKey = input.email.trim().toLowerCase();
  for (const key of [
    rateLimitKey("giving-checkout-ip", [ipHash ?? "anonymous"]),
    rateLimitKey("giving-checkout-email", [emailKey]),
  ]) {
    const { success } = await rateLimit(key, {
      limit: CHECKOUT_RATE_LIMIT.limit,
      window: CHECKOUT_RATE_LIMIT.window,
    });
    if (!success) throw new RateLimitError("Too many checkout attempts. Try again later.");
  }

  const reference = generateTransactionReference();
  const callbackUrl = `${env().APP_URL.replace(/\/+$/, "")}/give/confirmation?reference=${encodeURIComponent(reference)}`;

  // GIV-01: the pending row exists BEFORE any Paystack redirect.
  const [pending] = await tdb
    .insert(transactions)
    .values({
      reference,
      user_id: input.userId ?? null,
      name: input.name.trim(),
      email: emailKey,
      phone: input.phone?.trim() || null,
      message: input.message?.trim() || null,
      amount: amountKobo,
      currency: "NGN",
      type: input.type,
      project_id: projectId,
      status: "pending",
      ip_hash: ipHash,
    })
    .returning();

  const client = paystackOf(deps);
  let authorizationUrl: string;
  try {
    const init = await client.initializeTransaction({
      email: emailKey,
      amountKobo,
      reference,
      callbackUrl,
    });
    authorizationUrl = init.authorizationUrl;
    await tdb
      .update(transactions)
      .set({ paystack_reference: init.paystackReference, updated_at: new Date() })
      .where(eq(transactions.id, pending.id));
  } catch (e) {
    // Paystack outage on initialise: friendly error, transaction FAILED so
    // the user can retry with a fresh reference (06 §11 edge case).
    await tdb
      .update(transactions)
      .set({
        status: "failed",
        failure_reason: "Paystack initialisation failed; please retry",
        updated_at: new Date(),
      })
      .where(eq(transactions.id, pending.id));
    if (e instanceof PaystackError) {
      throw new PaystackError(
        "Could not start the payment. Please try again in a moment.",
      );
    }
    throw e;
  }

  await auditLog(tdb, {
    actor_user_id: input.userId ?? null,
    actor_role: input.userId ? "member" : "guest",
    action: "transaction.create",
    entity_type: "transactions",
    entity_id: pending.id,
    changes: { reference, amount: amountKobo, type: input.type },
    ip: input.ip ?? null,
  });

  return { reference, authorizationUrl };
}

// ---------------------------------------------------------------------------
// ingestWebhook — store FIRST, 200 fast (GIV-05/06/08)
// ---------------------------------------------------------------------------

export type IngestResult = {
  eventKey: string;
  duplicate: boolean;
  transactionId: string | null;
};

function rawHash(rawBody: string | Buffer): string {
  const s = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

export async function ingestWebhook(
  rawBody: string | Buffer,
  signature: string | null | undefined,
  deps?: ServiceDeps,
): Promise<IngestResult> {
  const database = databaseOf(deps);
  const client = paystackOf(deps);
  const valid = client.isSignatureValid(rawBody, signature);

  let parsed: { event?: string; data?: Record<string, unknown> } | null = null;
  try {
    parsed = JSON.parse(
      typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"),
    ) as { event?: string; data?: Record<string, unknown> };
  } catch {
    parsed = null;
  }

  const eventName = typeof parsed?.event === "string" ? parsed.event : "unknown";
  const data = (parsed?.data ?? {}) as Record<string, unknown>;
  const dataId = data.id !== undefined ? String(data.id) : rawHash(rawBody);
  const reference = typeof data.reference === "string" ? data.reference : null;
  const eventKey = `webhook:${eventName}:${dataId}`;

  let transactionId: string | null = null;
  if (reference) {
    const [tx] = await (database as DB)
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.reference, reference));
    transactionId = tx?.id ?? null;
  }

  // GIV-07: unique event_key — a replayed delivery inserts nothing.
  const inserted = await (database as DB)
    .insert(paymentEvents)
    .values({
      transaction_id: transactionId,
      source: "webhook",
      event_type: eventName,
      event_key: eventKey,
      payload: (parsed ?? { raw: "<unparseable>" }) as Record<string, unknown>,
      signature_valid: valid,
      processed: false,
      error: parsed ? null : "unparseable payload",
    })
    .onConflictDoNothing({ target: paymentEvents.event_key })
    .returning({ id: paymentEvents.id });
  const duplicate = inserted.length === 0;

  if (!valid) {
    // GIV-05: stored above (signature_valid=false) AND rejected + logged.
    paymentAlertCounters.invalidSignature += 1;
    await auditLog(database as DB, {
      actor_role: "paystack",
      action: "webhook.invalid_signature",
      entity_type: "payment_events",
      entity_id: eventKey,
      changes: { event: eventName },
    });
    throw new WebhookSignatureError();
  }

  return { eventKey, duplicate, transactionId };
}

// ---------------------------------------------------------------------------
// verifyAndTransition — shared by webhook / confirmation-poll / reverify
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["successful", "failed", "abandoned"],
  abandoned: ["successful"],
  successful: ["refunded"],
  failed: [],
  refunded: [],
};

function canTransition(from: string, to: string): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export type TransitionResult = {
  reference: string;
  status: string;
  /** True when this call actually flipped the status. */
  changed: boolean;
};

async function enqueueAdminAlert(
  tx: TxHandle,
  subject: string,
  body: Record<string, unknown>,
): Promise<void> {
  const tdb = tx as unknown as DB;
  const recipient =
    (await getSetting<string>(tdb, "giving.alert_email")) ??
    (await getSetting<string>(tdb, "contact.notify_email")) ??
    null;
  if (!recipient || !String(recipient).trim()) return;
  await enqueueNotification(tx, {
    type: "giving_alert",
    recipient: String(recipient).trim(),
    payload: { subject, ...body },
  });
}

async function flipStatus(
  tx: TxHandle,
  row: TransactionRow,
  to: TransactionRow["status"],
  patch: Partial<typeof transactions.$inferInsert>,
  action: string,
): Promise<TransactionRow> {
  if (!canTransition(row.status, to)) return row;
  const [updated] = await tx
    .update(transactions)
    .set({ ...patch, status: to, updated_at: new Date() })
    .where(and(eq(transactions.id, row.id), eq(transactions.status, row.status)))
    .returning();
  // Lost the race with a concurrent transition: re-read, caller no-ops.
  if (!updated) {
    const t = tx as unknown as DB;
    const [fresh] = await t.select().from(transactions).where(eq(transactions.id, row.id));
    return fresh ?? row;
  }
  await auditLog(tx, {
    actor_role: "system",
    action,
    entity_type: "transactions",
    entity_id: row.id,
    changes: { from: row.status, to, reference: row.reference },
  });
  return updated;
}

// GIV-03/04: success ONLY when Paystack says success AND reference + amount
// + currency all match the stored row. Mismatch → failed + admin alert.
export async function verifyAndTransition(
  reference: string,
  source: "webhook" | "verify" | "admin",
  deps?: ServiceDeps,
): Promise<TransitionResult> {
  const database = databaseOf(deps);
  const tdb = database as DB;
  const [row] = await tdb.select().from(transactions).where(eq(transactions.reference, reference));
  if (!row) {
    const err = new PaymentValidationError(`transaction not found: ${reference}`);
    throw err;
  }

  const client = paystackOf(deps);
  const verified = await client.verifyTransaction(reference);
  // Captured before the narrowing `if`s below so `changed` comparisons
  // don't trip TS2367 (comparing a narrowed literal with another status).
  const prevStatus = row.status as string;

  // GIV-08: every verification response is stored for audit. It is fully
  // handled inline here, so it lands already processed — the webhook event
  // that triggered this (if any) is marked separately by processWebhookEvent.
  await tdb.insert(paymentEvents).values({
    transaction_id: row.id,
    source,
    event_type: `verify:${verified.status}`,
    event_key: `verify:${reference}:${Date.now()}-${randomBytes(4).toString("hex")}`,
    payload: verified as unknown as Record<string, unknown>,
    signature_valid: true,
    processed: true,
  });

  const matches =
    verified.paystackReference === reference &&
    Number(verified.amountKobo) === row.amount &&
    verified.currency === "NGN";

  let changedRow: TransactionRow = row;
  let changed = false;

  if (verified.status === "success" && matches) {
    if (row.status === "pending" || row.status === "abandoned") {
      const paidAt = verified.paidAt ? new Date(verified.paidAt) : new Date();
      // Late success on an abandoned row is an allowed transition (GIV-11).
      const final = await (database as DB).transaction(async (tx) => {
        const t = tx as unknown as DB;
        const [current] = await t
          .select()
          .from(transactions)
          .where(eq(transactions.id, row.id));
        const flipped = await flipStatus(
          tx,
          current ?? row,
          "successful",
          {
            paid_at: Number.isNaN(paidAt.getTime()) ? new Date() : paidAt,
            paystack_reference: verified.paystackReference,
            payment_method: verified.channel ?? current?.payment_method ?? null,
            failure_reason: null,
          },
          "transaction.success",
        );
        // Project raised increment in the SAME transaction as the flip —
        // the guarded UPDATE above is the idempotency guard (GIV-07), so the
        // increment runs exactly once per payment (project.service seam note).
        if (flipped.status === "successful" && flipped.project_id && flipped.type === "project") {
          await tx
            .update(givingProjects)
            .set({
              amount_raised_cached: sql`${givingProjects.amount_raised_cached} + ${flipped.amount}`,
              updated_at: new Date(),
            })
            .where(eq(givingProjects.id, flipped.project_id));
        }
        return flipped;
      });
      changed = final.status === "successful" && prevStatus !== "successful";
      changedRow = final;
      if (changed) {
        // Receipt hook point (post-commit): routes wire issue+email here.
        await deps?.onPaymentSucceeded?.(final);
      }
    } else {
      changedRow = row; // already terminal — idempotent no-op (GIV-07)
    }
  } else if (verified.status === "success" && !matches) {
    // GIV-04: amount/reference/currency mismatch — NEVER successful.
    paymentAlertCounters.verificationMismatch += 1;
    if (row.status === "pending" || row.status === "abandoned") {
      changedRow = await (database as DB).transaction(async (tx) => {
        const t = tx as unknown as DB;
        const [current] = await t
          .select()
          .from(transactions)
          .where(eq(transactions.id, row.id));
        const flipped = await flipStatus(
          tx,
          current ?? row,
          "failed",
          { failure_reason: "Verification mismatch: amount/reference/currency (GIV-04)" },
          "transaction.failed",
        );
        await enqueueAdminAlert(tx, "Payment verification mismatch", {
          reference,
          expectedAmount: row.amount,
          paystackAmount: verified.amountKobo,
          paystackCurrency: verified.currency,
        });
        return flipped;
      });
      changed = changedRow.status === "failed" && prevStatus !== "failed";
    }
  } else if (verified.status === "failed") {
    if (row.status === "pending") {
      changedRow = await (database as DB).transaction(async (tx) => {
        const t = tx as unknown as DB;
        const [current] = await t
          .select()
          .from(transactions)
          .where(eq(transactions.id, row.id));
        return flipStatus(tx, current ?? row, "failed", {
          failure_reason: "Paystack reported failure",
          paystack_reference: verified.paystackReference,
        }, "transaction.failed");
      });
      changed = changedRow.status === "failed" && prevStatus !== "failed";
    }
  }
  // All other Paystack statuses (pending/ongoing/abandoned/...) leave the
  // row untouched here — the reconciler owns the pending→abandoned edge
  // (GIV-10), so a slow payer is never failed by a poll.

  return { reference, status: changedRow.status, changed };
}

// ---------------------------------------------------------------------------
// processWebhookEvent — idempotent async processing (GIV-06/07/09)
// ---------------------------------------------------------------------------

export async function processWebhookEvent(
  eventKey: string,
  deps?: ServiceDeps,
): Promise<{ eventKey: string; deduped: boolean; status: string | null }> {
  const database = databaseOf(deps);
  const tdb = database as DB;
  const [event] = await tdb
    .select()
    .from(paymentEvents)
    .where(eq(paymentEvents.event_key, eventKey));
  if (!event) throw new PaymentValidationError(`payment event not found: ${eventKey}`);
  if (event.processed) return { eventKey, deduped: true, status: null };

  const payload = event.payload as { event?: string; data?: Record<string, unknown> };
  const name = event.event_type;
  const data = (payload?.data ?? {}) as Record<string, unknown>;
  const reference = typeof data.reference === "string" ? data.reference : null;

  const mark = (error: string | null) =>
    tdb
      .update(paymentEvents)
      .set({ processed: true, error })
      .where(eq(paymentEvents.id, event.id));

  try {
    if (name === "charge.success" && reference) {
      // Server-to-server verify before ANY state change (GIV-03).
      const result = await verifyAndTransition(reference, "webhook", deps);
      await mark(null);
      return { eventKey, deduped: false, status: result.status };
    }
    if (name === "refund.processed" && reference) {
      // GIV-09/11: successful → refunded; raised reversed (refunded
      // excluded from totals, 06 §4). Same-tx flip + decrement.
      const [row] = await tdb
        .select()
        .from(transactions)
        .where(eq(transactions.reference, reference));
      if (row && row.status === "successful") {
        await tdb.transaction(async (tx) => {
          const flipped = await flipStatus(tx, row, "refunded", {}, "transaction.refunded");
          if (flipped.status === "refunded" && flipped.project_id && flipped.type === "project") {
            await tx
              .update(givingProjects)
              .set({
                amount_raised_cached: sql`GREATEST(0, ${givingProjects.amount_raised_cached} - ${flipped.amount})`,
                updated_at: new Date(),
              })
              .where(eq(givingProjects.id, flipped.project_id));
          }
        });
      }
      await mark(null);
      return { eventKey, deduped: false, status: "refunded" };
    }
    if (
      name === "refund.failed" ||
      name === "refund.pending" ||
      name === "refund.processing"
    ) {
      // GIV-09: recorded for audit; no state change.
      await mark(null);
      return { eventKey, deduped: false, status: null };
    }
    // Unknown events are stored and ignored (GIV-09).
    await mark(null);
    return { eventKey, deduped: false, status: null };
  } catch (e) {
    await mark(e instanceof Error ? e.message : String(e));
    throw e;
  }
}

// ---------------------------------------------------------------------------
// getPublicStatus — status ONLY, no personal data (confirmation polling)
// ---------------------------------------------------------------------------

export async function getPublicStatus(
  reference: string,
  deps?: ServiceDeps,
): Promise<{ status: string }> {
  const [row] = await (databaseOf(deps) as DB)
    .select({ status: transactions.status })
    .from(transactions)
    .where(eq(transactions.reference, reference));
  if (!row) throw new PaymentValidationError("transaction not found");
  return { status: row.status };
}

// Used by route layers to read the signature header name safely.
export { PAYSTACK_SIGNATURE_HEADER };
