import type { DB } from "@/db/client";
import { notifications } from "@/db/schema";
import { and, eq, lte, asc, sql } from "drizzle-orm";
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
  const batch = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.status, "queued"), lte(notifications.created_at, new Date())))
    .orderBy(asc(notifications.created_at))
    .limit(max)
    .for("update skip locked"); // optimistic leasing — duplicate cron runs can't double-send

  let sent = 0;
  for (const row of batch) {
    try {
      const render = TEMPLATES[row.type as keyof typeof TEMPLATES];
      const { html, text } = render(row.payload as Record<string, unknown>);
      const messageId = opts?.send
        ? await opts.send({ to: row.recipient, subject: "MOVALDEM", html, text })
        : await sendEmail({ to: row.recipient, subject: "MOVALDEM", html, text });
      await db.update(notifications).set({ status: "sent", sent_at: new Date(), attempts: row.attempts + 1 })
        .where(and(eq(notifications.id, row.id), eq(notifications.status, "queued")));
      if (messageId) sent++;
    } catch (err) {
      await db.update(notifications).set({
        status: "failed", last_error: err instanceof Error ? err.message : String(err),
        attempts: row.attempts + 1,
      }).where(eq(notifications.id, row.id));
    }
  }
  return sent;
}
