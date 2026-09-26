// ContactService (PRD 04 §9 contact page; PRD 08 §4 contact inbox).
// Server-only: validates + spam-checks public submissions, stores them in
// `contact_messages` and enqueues a notification email via the Phase 1
// notification outbox (NTF-01). Reuses the `src/lib/ratelimit` pattern with an
// exported CONTACT_RATE_LIMIT constant (SEC-05) and salted IP hashing
// (`IP_HASH_SALT`) — raw IPs are never stored.

import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, type DB } from "@/db/client";
import { contactMessages } from "@/db/schema";
import { auditLog } from "@/modules/platform/audit/audit.service";
import { getSetting } from "@/modules/platform/settings/settings.service";
import { enqueueNotification } from "@/modules/platform/notifications/notifications.service";
import { RateLimitError, rateLimit, rateLimitKey } from "@/lib/ratelimit";
import { hashIp } from "@/lib/ip-hash";

// SEC-05: max contact submissions per IP per hour, enforced via
// `src/lib/ratelimit` (Upstash sliding window in prod, in-memory fallback).
export const CONTACT_RATE_LIMIT = { limit: 5, window: "60 m" } as const;

// 08 §6 (Email group): recipient of the new-message notification.
export const CONTACT_NOTIFY_SETTING = "contact.notify_email";

export type ContactStatus = "new" | "read" | "archived";
export const CONTACT_STATUSES: readonly ContactStatus[] = ["new", "read", "archived"];

export type Actor = {
  role?: string | null;
  userId?: string | null;
};

export type ContactMessageRow = typeof contactMessages.$inferSelect;

const submitContactSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  email: z.string().trim().email("email must be a valid email address").max(320),
  phone: z.string().trim().max(50).nullish(),
  subject: z.string().trim().min(1, "subject is required").max(300),
  message: z.string().trim().min(1, "message is required").max(10000),
  // 04-§9: honeypot spam trap. Real forms leave it empty; bots fill it.
  honeypot: z.string().max(2000).nullish(),
  // Raw client IP (hashed with IP_HASH_SALT before storage — never raw).
  ip: z.string().max(200).nullish(),
  // Pre-hashed IP for callers that already hashed (e.g. route middleware).
  ipHash: z.string().max(128).nullish(),
});

export type SubmitContactInput = z.infer<typeof submitContactSchema>;

export type SubmitContactResult = {
  /** Null for honeypot spam (fake success — nothing stored). */
  id: string | null;
  /** True when a notification email was enqueued to the configured recipient. */
  notified: boolean;
  /** True for honeypot spam. Routes map this to the same success UI. */
  spam: boolean;
};

// 04-§9: validate, honeypot-check, rate-limit, store + notify.
export async function submitContact(rawInput: SubmitContactInput): Promise<SubmitContactResult> {
  const input = submitContactSchema.parse(rawInput);

  // Honeypot first: bots get a fake success without storing anything and
  // without consuming rate-limit budget (04-§9).
  if (input.honeypot && input.honeypot.trim().length > 0) {
    return { id: null, notified: false, spam: true };
  }

  // Salted hash for storage + budgeting; the raw IP never leaves this function.
  const ipHash = input.ip ? hashIp(input.ip) : (input.ipHash ?? null);

  // SEC-05: per-IP budget. Throws RateLimitError (429) when exhausted, and the
  // throw happens before any write, so blocked attempts store zero rows.
  const key = rateLimitKey("contact", [ipHash ?? "anonymous"]);
  const { success } = await rateLimit(key, {
    limit: CONTACT_RATE_LIMIT.limit,
    window: CONTACT_RATE_LIMIT.window,
  });
  if (!success) {
    throw new RateLimitError("Too many messages. Try again later.");
  }

  // Store + enqueue atomically (outbox: NTF-01). If no recipient is
  // configured, the message is still stored and `notified` reports false.
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(contactMessages)
      .values({
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        subject: input.subject,
        message: input.message,
        status: "new",
        ip_hash: ipHash,
      })
      .returning({ id: contactMessages.id });

    const notifyEmail = await getSetting<string>(tx as unknown as DB, CONTACT_NOTIFY_SETTING);
    let notified = false;
    if (typeof notifyEmail === "string" && notifyEmail.trim().length > 0) {
      await enqueueNotification(tx, {
        type: "contact_notification",
        recipient: notifyEmail.trim(),
        payload: {
          contactMessageId: row.id,
          name: input.name,
          email: input.email,
          subject: input.subject,
        },
      });
      notified = true;
    }
    return { id: row.id, notified };
  });
  return { ...result, spam: false };
}

// 08-§4: inbox query. Soft-deleted rows are excluded; newest first.
export async function listContactMessages(filter?: {
  status?: ContactStatus;
}): Promise<ContactMessageRow[]> {
  const statusCheck = filter?.status
    ? z.enum(CONTACT_STATUSES).parse(filter.status)
    : undefined;
  const conditions = [isNull(contactMessages.deleted_at)];
  if (statusCheck) conditions.push(eq(contactMessages.status, statusCheck));
  return db
    .select()
    .from(contactMessages)
    .where(and(...conditions))
    .orderBy(desc(contactMessages.created_at));
}

// 08-§4: mark read/unread (back to new) or archive. Audit-logged (CMS-08).
export async function setContactStatus(
  id: string,
  status: ContactStatus,
  actor: Actor = {},
): Promise<ContactMessageRow> {
  const next = z.enum(CONTACT_STATUSES).parse(status);
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(contactMessages).where(eq(contactMessages.id, id));
    if (!current) throw new Error(`contact message not found: ${id}`);
    const [row] = await tx
      .update(contactMessages)
      .set({ status: next })
      .where(eq(contactMessages.id, id))
      .returning();
    await auditLog(tx, {
      actor_user_id: actor.userId ?? null,
      actor_role: actor.role ?? null,
      action: "contact_message.status",
      entity_type: "contact_messages",
      entity_id: id,
      changes: { from: current.status, to: next },
    });
    return row;
  });
}

function isAdminRole(role: string | null | undefined): boolean {
  const r = (role ?? "").toLowerCase();
  return r === "admin" || r === "super_admin";
}

// 08-§4: delete (Admin+ only). Soft delete — the row is kept with
// `deleted_at` set, never hard-deleted from the UI. Audit-logged.
export async function deleteContactMessage(id: string, actor: Actor = {}): Promise<void> {
  if (!isAdminRole(actor.role)) {
    throw new Error("Only Admin or Super Admin can delete contact messages (08-§4)");
  }
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(contactMessages).where(eq(contactMessages.id, id));
    if (!current) throw new Error(`contact message not found: ${id}`);
    await tx
      .update(contactMessages)
      .set({ deleted_at: new Date() })
      .where(eq(contactMessages.id, id));
    await auditLog(tx, {
      actor_user_id: actor.userId ?? null,
      actor_role: actor.role ?? null,
      action: "contact_message.delete",
      entity_type: "contact_messages",
      entity_id: id,
    });
  });
}
