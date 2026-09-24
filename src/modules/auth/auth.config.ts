import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";
import { hashIp } from "@/lib/ip-hash";
import { hashPassword, verifyPassword } from "./password";
import { enqueueNotification } from "@/modules/platform/notifications/notifications.service";

export const auth = betterAuth({
  baseURL: env().APP_URL,
  // Without an explicit secret better-auth falls back to a hard-coded default
  // and logs an error on every production build/page render. APP_SECRET is
  // already a validated 32+ char env var, so reuse it (SEC-01).
  secret: env().APP_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    // The schema-check and model resolution address tables by their *key* in
    // this object, but our schema exports use plural names (`accounts`,
    // `verifications`). Alias them to the singular model names better-auth
    // expects alongside the existing `user` mapping.
    schema: {
      ...schema,
      user: schema.users,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  advanced: { database: { generateId: false } }, // Postgres defaultRandom() supplies UUIDs
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // argon2id instead of the default scrypt (SEC-01).
    password: { hash: hashPassword, verify: ({ hash, password }) => verifyPassword(password, hash) },
    // better-auth generates and validates the reset token; we just deliver it.
    // Awaited (not fire-and-forget) because better-auth awaits this callback —
    // `void` here would race callers that read the queued row right after.
    sendResetPassword: async ({ user, url }) => {
      await db.transaction((tx) =>
        enqueueNotification(tx, {
          type: "password_reset",
          recipient: user.email,
          payload: { url, name: user.name },
        }),
      );
    },
    revokeSessionsOnPasswordReset: true, // SEC-02
  },
  emailVerification: {
    // Queue the verification email on sign-up so registration can enforce
    // AUTH-03 (members must verify before quiz access in Phase 5).
    sendOnSignUp: true,
    // better-auth generates and validates the token; we just deliver it.
    sendVerificationEmail: async ({ user, url }) => {
      await db.transaction((tx) =>
        enqueueNotification(tx, {
          type: "verify_email",
          recipient: user.email,
          payload: { url, name: user.name },
        }),
      );
    },
    autoSignInAfterVerification: true,
  },
  user: {
    modelName: "users",
    fields: {
      name: "full_name",
      emailVerified: "email_verified",
      image: "image",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    additionalFields: {
      phone: { type: "string", required: false, input: true },
      church: { type: "string", required: false, input: true },
      age_range: { type: "string", required: false, input: true },
      gender: { type: "string", required: false, input: true },
      status: { type: "string", required: false, defaultValue: "active", input: false, returned: true },
      leaderboard_display: { type: "string", required: false, defaultValue: "abbreviated", input: false },
    },
  },
  account: {
    modelName: "account",
    fields: {
      userId: "user_id",
      accountId: "account_id",
      providerId: "provider_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    modelName: "verification",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  session: {
    modelName: "sessions",
    fields: {
      token: "token_hash",
      userId: "user_id",
      expiresAt: "expires_at",
      ipAddress: "ip_hash",
      userAgent: "user_agent",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,     // rotate the session once per day (SEC-02)
  },
  // No `verification` mapping: better-auth owns the `verification` table for
  // email-verify and password-reset tokens. Our `auth_tokens` holds staff invites.
  databaseHooks: {
    user: {
      update: {
        // better-auth flips `email_verified` to true when the emailed link is
        // clicked; mirror it into the PRD-09 timestamp. Idempotent — the
        // conditional WHERE means only the first verification writes.
        after: async (user) => {
          if (!user.emailVerified) return;
          await db.update(users)
            .set({ email_verified_at: new Date() })
            .where(and(eq(users.id, user.id), isNull(users.email_verified_at)));
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          // Raw IP is hashed before it ever lands in the DB (PRV-05).
          return { data: { ...session, ipAddress: hashIp(session.ipAddress as string) } };
        },
      },
    },
  },
});
