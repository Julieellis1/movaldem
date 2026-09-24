import { auth } from "./auth.config";
import { db } from "@/db/client";
import { users, sessions } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { auditLog } from "@/modules/platform/audit/audit.service";
import { rateLimit, rateLimitKey, RateLimitError } from "@/lib/ratelimit";
import { registerSchema } from "./schemas";

// Server-owned registration: validates consent/phone/password, creates the
// user + credential account through better-auth (which also queues the
// verification email via the auth.config callback), records consent and audit.
export async function registerMember(input: {
  full_name: string; email: string; phone?: string; password: string;
  confirmPassword: string; church?: string; age_range?: string; gender?: string; consent: boolean;
}, ctx: { ip?: string | null; userAgent?: string | null; headers?: Headers } = {}) {
  const email = typeof input.email === "string" ? input.email.toLowerCase().trim() : "";
  // SEC-05: 5/hour per IP (or per email when the caller has no IP, e.g. server
  // actions / vitest) — checked before anything writes a user or queues mail.
  const ip = ctx.ip?.trim() || null;
  const key = ip ? rateLimitKey("register:ip", [ip]) : rateLimitKey("register:email", [email]);
  if (!(await rateLimit(key, { limit: 5, window: "60 m" })).success) throw new RateLimitError();
  const parsed = registerSchema.parse(input); // throws on consent / phone / password mismatch
  const parsedEmail = parsed.email.toLowerCase().trim();
  const res = await auth.api.signUpEmail({
    body: {
      email: parsedEmail, password: parsed.password, name: parsed.full_name,
      phone: parsed.phone, church: parsed.church, age_range: parsed.age_range, gender: parsed.gender,
    },
    headers: ctx.headers,
    returnHeaders: true, // Set-Cookie lives on headers — caller must forward it
  });
  const payload = res.response;
  const user = payload.user;
  await db.update(users)
    .set({ consent_at: new Date(), status: "active" })
    .where(eq(users.id, user.id));
  await auditLog(db, {
    actor_user_id: user.id, action: "user.register", entity_type: "users", entity_id: user.id,
    ip: ctx.ip, user_agent: ctx.userAgent,
  });
  // `session` is absent on better-auth's shouldSkipAutoSignIn variant.
  return {
    user,
    session: "session" in payload ? payload.session : null,
    setCookieHeaders: res.headers,
  };
}

// Email verification itself is handled by better-auth:
//   - token generation + validation live in the `verification` table
//   - email delivery is the auth.config `sendVerificationEmail` callback,
//     which enqueues our react-email template through the notifications outbox
// The public page (Task 19) only reads the ?error= / success state from the
// better-auth redirect; there is no hand-rolled verify endpoint.

export async function loginMember(
  input: { email: string; password: string },
  ctx: { ip?: string | null; headers?: Headers } = {},
) {
  const email = input.email.toLowerCase().trim();
  // SEC-06: 5/minute per IP *and* per email. The check runs before the user
  // lookup so a rate-limited response can never reveal whether the account
  // exists — a blocked unknown email answers identically to a blocked real
  // one. Callers without an IP (server actions, Playwright, vitest) keep the
  // per-email bucket only.
  const ip = ctx.ip?.trim() || null;
  const keys = [rateLimitKey("login:email", [email])];
  if (ip) keys.push(rateLimitKey("login:ip", [ip]));
  for (const key of keys) {
    if (!(await rateLimit(key, { limit: 5, window: "60 s" })).success) throw new RateLimitError();
  }
  const [row] = await db.select().from(users).where(eq(users.email, email));
  if (row && row.status !== "active") {
    await revokeAllSessions(row.id);
    throw new Error("Account suspended or deactivated");
  }
  try {
    const res = await auth.api.signInEmail({
      body: { email, password: input.password },
      headers: ctx.headers,
      returnHeaders: true, // Set-Cookie lives on headers — caller must forward it
    });
    await db.update(users)
      .set({ last_login_at: new Date() })
      .where(eq(users.id, res.response.user.id));
    // `session` is absent on better-auth's token-only sign-in variants.
    return {
      user: res.response.user,
      session: "session" in res.response ? res.response.session : null,
      setCookieHeaders: res.headers,
    };
  } catch {
    // generic — no user enumeration (SEC-06)
    throw new Error("Invalid email or password");
  }
}

export async function logoutSession(headers: Headers) {
  await auth.api.signOut({ headers });
}

export async function revokeAllSessions(userId: string) {
  await db.update(sessions)
    .set({ revoked_at: new Date() })
    .where(and(eq(sessions.user_id, userId), isNull(sessions.revoked_at)));
}

// better-auth generates and validates the token in the `verification` table and
// calls our auth.config `sendResetPassword` callback (which enqueues the email)
// only when the email exists — a generic outcome either way (AUTH-05/SEC-09).
export async function requestPasswordReset(email: string) {
  // SEC-05/09: 3/hour per email, checked first so a rate-limited call returns
  // before better-auth does any existence-dependent work — the caller always
  // observes the same generic outcome, never a signal the account exists.
  const normalized = email.toLowerCase().trim();
  if (!(await rateLimit(rateLimitKey("reset:email", [normalized]), { limit: 3, window: "60 m" })).success) {
    throw new RateLimitError();
  }
  await auth.api.requestPasswordReset({
    body: { email: normalized, redirectTo: "/reset-password" },
  });
}

export async function resetPassword(input: { token: string; newPassword: string }) {
  await auth.api.resetPassword({ body: { token: input.token, newPassword: input.newPassword } });
  // revokeSessionsOnPasswordReset: true in auth.config invalidates other
  // sessions (SEC-02)
  await auditLog(db, {
    action: "user.password_reset", entity_type: "users", changes: { via: "email_token" },
  });
}

export async function suspendUser(id: string, ctx: { actorId: string | null; ip: string | null }) {
  await db.transaction(async (tx) => {
    await tx.update(users)
      .set({ status: "suspended", updated_at: new Date() })
      .where(eq(users.id, id));
    await auditLog(tx, {
      actor_user_id: ctx.actorId, action: "user.suspend",
      entity_type: "users", entity_id: id, ip: ctx.ip,
    });
  });
  await revokeAllSessions(id);
}

export async function restoreUser(id: string, ctx: { actorId: string; ip: string | null }) {
  await db.transaction(async (tx) => {
    await tx.update(users)
      .set({ status: "active", updated_at: new Date() })
      .where(eq(users.id, id));
    await auditLog(tx, {
      actor_user_id: ctx.actorId, action: "user.restore",
      entity_type: "users", entity_id: id, ip: ctx.ip,
    });
  });
}
