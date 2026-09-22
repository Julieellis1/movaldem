import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { users, notifications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { registerMember } from "@/modules/auth/auth.service";

// Unique per process so repeated runs don't collide on the case-insensitive
// unique email index.
const s = process.pid.toString(36);
const email = `grace-${s}@test.org`;

describe("registration", () => {
  it("creates a member with consent and queues a verification email", async () => {
    const { user } = await registerMember({
      full_name: "Grace Okafor", email, phone: "+2348012345678",
      password: "strong-pass-1", confirmPassword: "strong-pass-1", consent: true,
    }, { ip: "102.89.1.1" });
    expect(user.email).toBe(email);
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.status).toBe("active");
    expect(row.consent_at).toBeInstanceOf(Date);
    const mails = await db.select().from(notifications)
      .where(eq(notifications.recipient, email));
    expect(mails.some((m) => m.type === "verify_email" && m.status === "queued")).toBe(true);
  }, 30000);
  it("requires the consent checkbox", async () => {
    await expect(registerMember({
      full_name: "X", email: `x-${s}@test.org`, password: "strong-pass-1",
      confirmPassword: "strong-pass-1", consent: false,
    })).rejects.toThrow(/consent/i);
  });
  it("normalises phone and rejects bad numbers", async () => {
    await expect(registerMember({
      full_name: "Y", email: `y-${s}@test.org`, phone: "123", password: "strong-pass-1",
      confirmPassword: "strong-pass-1", consent: true,
    })).rejects.toThrow(/phone/i);
  });
});
