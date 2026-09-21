import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notifications } from "@/db/schema";
import { enqueueNotification } from "@/modules/platform/notifications/notifications.service";
import { renderVerifyEmail } from "@/modules/platform/notifications/templates/verify-email";

describe("notifications", () => {
  it("enqueues a row in the caller transaction (outbox)", async () => {
    const id = await db.transaction(async (tx) =>
      enqueueNotification(tx, { type: "verify_email", recipient: "u@test.org", payload: { url: "https://x/verify?t=1" } }),
    );
    const [row] = await db.select().from(notifications).where(eq(notifications.id, id));
    expect(row.status).toBe("queued");
    expect(row.payload).toMatchObject({ url: "https://x/verify?t=1" });
  });
  it("renders the verify-email template to HTML containing the link", () => {
    const { html } = renderVerifyEmail({ url: "https://x/verify?t=abc", name: "Grace" });
    expect(html).toContain("https://x/verify?t=abc");
  });
});
