import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { users, sessions, notifications } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { registerMember, loginMember, requestPasswordReset, resetPassword, suspendUser } from "@/modules/auth/auth.service";

// Unique per process so repeated runs don't collide on the case-insensitive
// unique email index.
const s = process.pid.toString(36);

async function makeUser(email: string) {
  return registerMember({
    // plan snippet used "T" — registerSchema requires min(2) chars.
    full_name: "Test User", email, password: "strong-pass-1",
    confirmPassword: "strong-pass-1", consent: true,
  });
}
async function readResetToken(email: string) {
  // Registration already queued a verify_email; only the reset mail carries
  // the token we need. better-auth puts the token in the URL *path*
  // (`/reset-password/<token>?callbackURL=...`), not a query param.
  const [mail] = await db.select().from(notifications)
    .where(and(eq(notifications.recipient, email), eq(notifications.type, "password_reset")));
  const url = new URL(String((mail.payload as { url: string }).url));
  return url.pathname.split("/").filter(Boolean).pop()!;
}

describe("login", () => {
  it("logs in and records last_login_at", async () => {
    const email = `login-${s}@test.org`;
    const { user } = await makeUser(email);
    const res = await loginMember({ email, password: "strong-pass-1" });
    expect(res.user.id).toBe(user.id);
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.last_login_at).toBeInstanceOf(Date);
  }, 30000);
  it("rejects suspended users and revokes their sessions", async () => {
    const email = `susp-${s}@test.org`;
    const { user } = await makeUser(email);
    await loginMember({ email, password: "strong-pass-1" });
    await suspendUser(user.id, { actorId: null, ip: null });
    await expect(loginMember({ email, password: "strong-pass-1" }))
      .rejects.toThrow(/suspended|deactivated/i);
    const rows = await db.select().from(sessions).where(eq(sessions.user_id, user.id));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.revoked_at)).toBe(true);
  }, 30000);
  it("gives a generic outcome for unknown emails on password reset", async () => {
    await expect(requestPasswordReset(`nobody-${s}@test.org`)).resolves.not.toThrow();
  }, 30000);
  it("resets a password via the emailed token and revokes other sessions", async () => {
    const email = `reset-${s}@test.org`;
    await makeUser(email);
    const before = await loginMember({ email, password: "strong-pass-1" });
    const preIds = new Set(
      (await db.select({ id: sessions.id }).from(sessions)
        .where(eq(sessions.user_id, before.user.id))).map((r) => r.id),
    );
    await requestPasswordReset(email);
    const token = await readResetToken(email);
    await resetPassword({ token, newPassword: "new-strong-2" });
    await expect(loginMember({ email, password: "strong-pass-1" })).rejects.toThrow();
    // No pre-reset session may survive as active: better-auth's
    // revokeSessionsOnPasswordReset deletes them; a custom revoke would mark
    // revoked_at instead — either satisfies SEC-02.
    const survivors = (await db.select().from(sessions)
      .where(eq(sessions.user_id, before.user.id))).filter((r) => preIds.has(r.id));
    expect(survivors.every((r) => r.revoked_at)).toBe(true);
    expect(await loginMember({ email, password: "new-strong-2" })).toBeTruthy();
  }, 30000);
});
