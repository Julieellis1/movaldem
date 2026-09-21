import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { users, notifications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { registerMember } from "@/modules/auth/auth.service";

describe("registration", () => {
  it("creates a member with consent and queues a verification email", async () => {
    const { user } = await registerMember({
      full_name: "Grace Okafor", email: "grace@test.org", phone: "+2348012345678",
      password: "strong-pass-1", consent: true,
    }, { ip: "102.89.1.1" });
    expect(user.email).toBe("grace@test.org");
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.status).toBe("active");
    expect(row.consent_at).toBeInstanceOf(Date);
    const mails = await db.select().from(notifications)
      .where(eq(notifications.recipient, "grace@test.org"));
    expect(mails.some((m) => m.type === "verify_email" && m.status === "queued")).toBe(true);
  });
  it("requires the consent checkbox", async () => {
    await expect(registerMember({
      full_name: "X", email: "x@test.org", password: "strong-pass-1", consent: false,
    })).rejects.toThrow(/consent/i);
  });
  it("normalises phone and rejects bad numbers", async () => {
    await expect(registerMember({
      full_name: "Y", email: "y@test.org", phone: "123", password: "strong-pass-1", consent: true,
    })).rejects.toThrow(/phone/i);
  });
});
