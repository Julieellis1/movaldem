import { createHmac, timingSafeEqual } from "node:crypto";
import { desc, eq, like } from "drizzle-orm";
import { db, type DB } from "@/db/client";
import { givingProjects, transactions } from "@/db/schema";
import { getSetting } from "@/modules/platform/settings/settings.service";
import { enqueueNotification } from "@/modules/platform/notifications/notifications.service";
import { env } from "@/lib/env";
import { formatNaira } from "@/lib/money";
import PDFDocument from "pdfkit";

// Phase 4 giving receipts (PRD 06 §6: RCP-01..RCP-06).
//
// - Numbers are unique + sequential per year: `MVD-RCP-YYYY-NNNNNN`
//   (RCP-01), issued under a DB transaction with a re-read; the unique
//   constraint on `transactions.receipt_number` is the backstop against
//   concurrent issuers (retried below).
// - `receipt_sent_at` is set by the email-sending path, never here.
// - Email goes through the Phase 1 notification outbox (`giving_receipt`).
// - Guests access receipts via HMAC expiring links (RCP-04).

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export type ReceiptPayload = {
  churchName: string;
  donorName: string;
  donorEmail: string;
  amountKobo: number;
  amountFormatted: string;
  givingType: string;
  projectName: string | null;
  reference: string;
  paystackReference: string | null;
  paymentMethod: string | null;
  status: string;
  /** Africa/Lagos wall-clock string with WAT suffix (RCP-02). */
  watDatetime: string;
  receiptNumber: string;
};

const RECEIPT_RE = /^MVD-RCP-(\d{4})-(\d{6})$/;

function lagosYear(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
  }).format(d);
}

export function formatWat(d: Date): string {
  const s = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${s} WAT`;
}

function nextReceiptNumber(last: string | null, year: string): string {
  let seq = 0;
  if (last) {
    const m = RECEIPT_RE.exec(last);
    if (m && m[1] === year) seq = Number(m[2]);
  }
  return `MVD-RCP-${year}-${String(seq + 1).padStart(6, "0")}`;
}

// RCP-01: sequential `MVD-RCP-YYYY-NNNNNN` under a transaction (re-read
// inside, max(existing)+1 for the year). Idempotent: a row that already has
// a number gets it back. Only successful transactions get receipts.
// Sets `receipt_number` ONLY — `receipt_sent_at` belongs to the email path.
export async function issueReceipt(
  txId: string,
  database: DB = db,
): Promise<string> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await database.transaction(async (tx) => {
        const t = tx as unknown as DB;
        const [row] = await t
          .select()
          .from(transactions)
          .where(eq(transactions.id, txId));
        if (!row) throw new Error(`transactions not found: ${txId} (RCP-01)`);
        if (row.receipt_number) return row.receipt_number;
        if (row.status !== "successful") {
          throw new Error(
            `receipts are issued for successful transactions only (RCP-01, status=${row.status})`,
          );
        }
        const year = lagosYear(row.paid_at ?? row.created_at);
        const prefix = `MVD-RCP-${year}-`;
        const [last] = await t
          .select({ receipt_number: transactions.receipt_number })
          .from(transactions)
          .where(like(transactions.receipt_number, `${prefix}%`))
          .orderBy(desc(transactions.receipt_number))
          .limit(1);
        const number = nextReceiptNumber(last?.receipt_number ?? null, year);
        await tx
          .update(transactions)
          .set({ receipt_number: number, updated_at: new Date() })
          .where(eq(transactions.id, txId));
        return number;
      });
    } catch (e) {
      lastError = e;
      // Concurrent issuer won the same sequence: re-read (idempotent if our
      // row already has a number, else take the next sequence).
      if (
        (e as { code?: string }).code === "23505" &&
        String((e as Error).message ?? "").includes("receipt")
      ) {
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

// RCP-02: receipt contents — church name (from `church.name` setting), donor,
// amount, type (+ project), references, WAT datetime, status, method.
export async function receiptPayload(
  txId: string,
  database: DB = db,
): Promise<ReceiptPayload> {
  const [row] = await database
    .select()
    .from(transactions)
    .where(eq(transactions.id, txId));
  if (!row) throw new Error(`transactions not found: ${txId} (RCP-02)`);
  if (!row.receipt_number) {
    throw new Error(`transaction has no receipt number yet (RCP-01): ${txId}`);
  }
  let projectName: string | null = null;
  if (row.project_id) {
    const [p] = await database
      .select({ title: givingProjects.title })
      .from(givingProjects)
      .where(eq(givingProjects.id, row.project_id));
    projectName = p?.title ?? null;
  }
  const churchName =
    (await getSetting<string>(database, "church.name", "MOVALDEM")) ??
    "MOVALDEM";
  return {
    churchName,
    donorName: row.name,
    donorEmail: row.email,
    amountKobo: row.amount,
    amountFormatted: formatNaira(row.amount),
    givingType: row.type,
    projectName,
    reference: row.reference,
    paystackReference: row.paystack_reference,
    paymentMethod: row.payment_method,
    status: row.status,
    watDatetime: formatWat(row.paid_at ?? row.created_at),
    receiptNumber: row.receipt_number,
  };
}

// RCP-02/RCP-04: simple branded PDF (pdfkit). A4-ish single page.
export async function receiptPdfBuffer(
  payload: ReceiptPayload,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 56 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    try {
      doc.fontSize(20).font("Helvetica-Bold").text(payload.churchName);
      doc.moveDown(0.25);
      doc.fontSize(13).font("Helvetica").text("Giving Receipt");
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor("#555").text(payload.receiptNumber);
      doc.fillColor("#000");
      doc.moveDown(1);
      const rows: Array<[string, string]> = [
        ["Donor", payload.donorName],
        ["Amount", payload.amountFormatted],
        [
          "Giving type",
          payload.projectName
            ? `${payload.givingType} — ${payload.projectName}`
            : payload.givingType,
        ],
        ["Transaction reference", payload.reference],
        ["Paystack reference", payload.paystackReference ?? "—"],
        ["Date and time", payload.watDatetime],
        ["Payment status", payload.status],
        ["Payment method", payload.paymentMethod ?? "—"],
      ];
      for (const [label, value] of rows) {
        doc.font("Helvetica-Bold").text(label, { continued: true });
        doc.font("Helvetica").text(`  ${value}`);
        doc.moveDown(0.4);
      }
      doc.moveDown(1);
      // RCP-06: informational acknowledgement, not a tax document.
      doc
        .fontSize(9)
        .fillColor("#555")
        .text(
          "This receipt is an informational acknowledgement of your gift. It is not a tax document unless MOVALDEM configures otherwise.",
        );
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

export function renderReceiptEmail(
  payload: ReceiptPayload,
  receiptUrl: string,
): { subject: string; html: string } {
  const subject = `Your giving receipt ${payload.receiptNumber} — ${payload.churchName}`;
  const typeLine = payload.projectName
    ? `${payload.givingType} — ${payload.projectName}`
    : payload.givingType;
  const html = [
    `<p>Dear ${escapeHtml(payload.donorName)},</p>`,
    `<p>Thank you for your gift of <strong>${escapeHtml(payload.amountFormatted)}</strong> (${escapeHtml(typeLine)}).</p>`,
    `<p>Receipt <strong>${escapeHtml(payload.receiptNumber)}</strong><br/>`,
    `Reference ${escapeHtml(payload.reference)}<br/>`,
    `Date ${escapeHtml(payload.watDatetime)}</p>`,
    `<p><a href="${escapeHtml(receiptUrl)}">View / print your receipt (PDF)</a></p>`,
    `<p>${escapeHtml(payload.churchName)}</p>`,
  ].join("\n");
  return { subject, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Seam for `PaymentService`'s success path AND the admin resend action:
// enqueue the `giving_receipt` email inside the caller's transaction (outbox
// pattern — never lost). Link-only: the notifications outbox has no
// attachment column, so the PDF travels via the signed receipt link
// (deviation from RCP-03's PDF-attachment SHOULD, recorded in summary).
export async function enqueueReceiptEmail(
  tx: Tx,
  txId: string,
  opts?: { baseUrl?: string; secret?: string },
): Promise<string> {
  const tdb = tx as unknown as DB;
  const [row] = await tdb
    .select()
    .from(transactions)
    .where(eq(transactions.id, txId));
  if (!row) throw new Error(`transactions not found: ${txId} (RCP-03)`);
  if (!row.receipt_number) {
    throw new Error(
      `issue a receipt number before enqueueing the email (RCP-01): ${txId}`,
    );
  }
  const payload = await receiptPayload(txId, tdb);
  const receiptUrl = createSignedReceiptUrl(row.reference, opts?.secret, {
    baseUrl: opts?.baseUrl,
  });
  const { subject, html } = renderReceiptEmail(payload, receiptUrl);
  return enqueueNotification(tx, {
    type: "giving_receipt",
    recipient: row.email,
    payload: {
      subject,
      html,
      receiptUrl,
      reference: row.reference,
      receiptNumber: row.receipt_number,
    },
  });
}

// RCP-05: admin resend — issues a number if missing, then re-enqueues via
// the outbox (email failures retry through the NTF-01 worker path).
export async function resendReceipt(
  txId: string,
  database: DB = db,
  opts?: { baseUrl?: string; secret?: string },
): Promise<{ notificationId: string; receiptNumber: string }> {
  const receiptNumber = await issueReceipt(txId, database);
  const notificationId = await database.transaction(async (tx) =>
    enqueueReceiptEmail(tx, txId, opts),
  );
  return { notificationId, receiptNumber };
}

// RCP-04: HMAC expiring guest links. Signed value covers
// `<reference>.<exp>`; default TTL 7 days. Override `secret` in tests;
// production uses APP_SECRET.
export function createSignedReceiptUrl(
  reference: string,
  secret?: string,
  opts?: { expiresInSeconds?: number; baseUrl?: string },
): string {
  const key = secret ?? env().APP_SECRET;
  const exp =
    Math.floor(Date.now() / 1000) + (opts?.expiresInSeconds ?? 7 * 24 * 3600);
  const sig = createHmac("sha256", key)
    .update(`${reference}.${exp}`)
    .digest("hex");
  const base = (opts?.baseUrl ?? env().APP_URL).replace(/\/+$/, "");
  return `${base}/give/receipt/${encodeURIComponent(reference)}?exp=${exp}&sig=${sig}`;
}

// Returns the reference when valid; throws on expired / tampered / malformed.
export function verifySignedReceiptUrl(url: string, secret?: string): string {
  const key = secret ?? env().APP_SECRET;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("invalid receipt link (RCP-04)");
  }
  const segments = parsed.pathname.split("/").filter(Boolean);
  const reference = segments.length
    ? decodeURIComponent(segments[segments.length - 1])
    : "";
  const expRaw = parsed.searchParams.get("exp");
  const sig = parsed.searchParams.get("sig");
  if (!reference || !expRaw || !sig) {
    throw new Error("invalid receipt link (RCP-04)");
  }
  const exp = Number(expRaw);
  if (!Number.isInteger(exp)) throw new Error("invalid receipt link (RCP-04)");
  if (exp * 1000 < Date.now()) throw new Error("receipt link expired (RCP-04)");
  const expected = createHmac("sha256", key)
    .update(`${reference}.${exp}`)
    .digest("hex");
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("receipt link signature mismatch (RCP-04)");
  }
  return reference;
}
