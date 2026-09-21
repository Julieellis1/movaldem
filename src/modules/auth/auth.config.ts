import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";
import { hashIp } from "@/lib/ip-hash";
import { hashPassword, verifyPassword } from "./password";
import { enqueueNotification } from "@/modules/platform/notifications/notifications.service";

export const auth = betterAuth({
  baseURL: env().APP_URL,
  database: drizzleAdapter(db, { provider: "pg", schema: { ...schema, user: schema.users } }),
  advanced: { database: { generateId: false } }, // Postgres defaultRandom() supplies UUIDs
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // argon2id instead of the default scrypt (SEC-01).
    password: { hash: hashPassword, verify: verifyPassword },
    // better-auth generates and validates the reset token; we just deliver it.
    sendResetPassword: async ({ user, url }) => {
      void db.transaction((tx) =>
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
    // better-auth generates and validates the token; we just deliver it.
    sendVerificationEmail: async ({ user, url }) => {
      void db.transaction((tx) =>
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
      emailVerified: "email_verified_at",
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
