import type { DB } from "@/db/client";
import { notifications } from "@/db/schema";
import { and, eq, asc } from "drizzle-orm";
import { renderVerifyEmail } from "@/modules/platform/notifications/templates/verify-email";
import { sendEmail } from "@/modules/platform/notifications/email.adapter";

const TEMPLATES = {
  verify_email: (p: Record<string, unknown>) => renderVerifyEmail({ url: String(p.url), name: String(p.name ?? "") }),
  // password_reset + staff_invite wired in their tasks
} as const;

export async function processNotificationQueue(
  db: DB,
  opts?: { max?: number; send?: (input: { to: string; subject: string; html: string; text?: string }) => Promise<string> },
) {
  const max = opts?.max ?? 25;
  // NOTE: no created_at <= now() filter — created_at is set by Postgres's
  // now() (server clock) and comparing it to the client's clock rejects every
  // freshly-enqueued row on even 1ms of skew. Queued rows are ready by
  // definition; the conditional UPDATE below is the idempotency guard.
  const batch = await db
    .select()
    .from(notifications)
    .where(eq(notifications.status, "queued"))
    .orderBy(asc(notifications.created_at))
    .limit(max);

  let sent = 0;
  for (const row of batch) {
    try {
      const render = TEMPLATES[row.type as keyof typeof TEMPLATES];
      if (!render) throw new Error(`No template for notification type: ${row.type}`);
      const { html, text } = render(row.payload as Record<string, unknown>);
      const messageId = opts?.send
        ? await opts.send({ to: row.recipient, subject: "MOVALDEM", html, text })
        : await sendEmail({ to: row.recipient, subject: "MOVALDEM", html, text });
      // The conditional UPDATE is the real idempotency guard: only count as
      // sent if this run actually flipped queued → sent. A duplicate cron run
      // that re-selects the same row finds it already "sent" and the WHERE
      // clause matches nothing, so it can't double-send.
      const updated = await db.update(notifications).set({ status: "sent", sent_at: new Date(), attempts: row.attempts + 1 })
        .where(and(eq(notifications.id, row.id), eq(notifications.status, "queued")))
        .returning({ id: notifications.id });
      if (updated.length > 0 && messageId) sent++;
    } catch (err) {
      await db.update(notifications).set({
        status: "failed", last_error: err instanceof Error ? err.message : String(err),
        attempts: row.attempts + 1,
      }).where(and(eq(notifications.id, row.id), eq(notifications.status, "queued")));
    }
  }
  return sent;
}
