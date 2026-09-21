import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { notifications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { enqueueNotification } from "@/modules/platform/notifications/notifications.service";
import { processNotificationQueue } from "@/jobs/notifications-worker";

describe("queue worker", () => {
  it("sends queued notifications exactly once across double runs", async () => {
    const id = await db.transaction((tx) =>
      enqueueNotification(tx, { type: "verify_email", recipient: "w@test.org", payload: { url: "https://x" } }),
    );
    let sent = 0;
    sent += await processNotificationQueue(db, { max: 10, send: async () => "fake-id" });
    sent += await processNotificationQueue(db, { max: 10, send: async () => "fake-id" });
    expect(sent).toBe(1);
    const [row] = await db.select().from(notifications).where(eq(notifications.id, id));
    expect(row.status).toBe("sent");
    expect(row.attempts).toBe(1);
  });
  it("records failure and retries later", async () => {
    const id = await db.transaction((tx) =>
      enqueueNotification(tx, { type: "verify_email", recipient: "f@test.org", payload: {} }),
    );
    await processNotificationQueue(db, { max: 10, send: async () => { throw new Error("smtp down"); } });
    const [row] = await db.select().from(notifications).where(eq(notifications.id, id));
    expect(row.status).toBe("failed");
    expect(row.last_error).toContain("smtp down");
  });
});
