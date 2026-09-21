import { notifications } from "@/db/schema";

export type NotificationInput = {
  type: string;
  recipient: string;
  payload: Record<string, unknown>;
};

// Outbox: caller includes this in its own transaction so the intent is never lost (REL-01).
export async function enqueueNotification(
  tx: Parameters<Parameters<import("@/db/client").DB["transaction"]>[0]>[0],
  input: NotificationInput,
) {
  const [row] = await tx
    .insert(notifications)
    .values({
      channel: "email",
      type: input.type,
      recipient: input.recipient,
      payload: input.payload,
      status: "queued",
    })
    .returning({ id: notifications.id });
  return row.id;
}
