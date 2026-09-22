import { pgTable, pgEnum, uuid, text, timestamp, boolean, integer, jsonb, primaryKey, index,
  uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userStatus = pgEnum("user_status", ["active", "suspended", "deactivated"]);
export const leaderboardDisplay = pgEnum("leaderboard_display", ["full", "abbreviated"]);
export const authTokenType = pgEnum("auth_token_type", ["email_verify", "password_reset", "staff_invite"]);
export const notificationChannel = pgEnum("notification_channel", ["email"]);
export const notificationStatus = pgEnum("notification_status", ["queued", "sent", "failed"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  full_name: text("full_name").notNull(),
  email: text("email").notNull(),
  image: text("image"),
  phone: text("phone"),
  // No password_hash: better-auth stores credentials in the `account` table
  // (providerId = "credential") — see auth.config.ts in Task 9.
  // `email_verified` is better-auth's boolean state (its emailVerified field is
  // typed boolean, so it cannot write a timestamp); `email_verified_at` is our
  // PRD-09 record of *when*, set by the auth.config user.update.after hook.
  email_verified: boolean("email_verified").notNull().default(false),
  email_verified_at: timestamp("email_verified_at", { withTimezone: true }),
  status: userStatus("status").notNull().default("active"),
  church: text("church"),
  age_range: text("age_range"),
  gender: text("gender"),
  leaderboard_display: leaderboardDisplay("leaderboard_display").notNull().default("abbreviated"),
  consent_at: timestamp("consent_at", { withTimezone: true }),
  last_login_at: timestamp("last_login_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deleted_at: timestamp("deleted_at", { withTimezone: true }),
}, (t) => ({
  emailIdx: uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
  statusIdx: index("users_status_idx").on(t.status),
}));

// better-auth-owned: holds credential password hashes (providerId = "credential").
export const accounts = pgTable("account", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  account_id: text("account_id").notNull(),
  provider_id: text("provider_id").notNull(),
  password: text("password"),
  access_token: text("access_token"),
  refresh_token: text("refresh_token"),
  access_token_expires_at: timestamp("access_token_expires_at", { withTimezone: true }),
  refresh_token_expires_at: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  id_token: text("id_token"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index("account_user_idx").on(t.user_id),
  providerIdx: uniqueIndex("account_provider_account_idx").on(t.provider_id, t.account_id),
}));

// better-auth-owned: email-verification and password-reset tokens.
export const verifications = pgTable("verification", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }),
}, (t) => ({
  identifierIdx: index("verification_identifier_idx").on(t.identifier),
}));

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  is_system: boolean("is_system").notNull().default(false),
});

export const permissions = pgTable("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  description: text("description"),
});

export const rolePermissions = pgTable("role_permissions", {
  role_id: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  permission_id: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
}, (t) => ({ pk: primaryKey({ columns: [t.role_id, t.permission_id] }) }));

export const userRoles = pgTable("user_roles", {
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role_id: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  assigned_by: uuid("assigned_by"),
  assigned_at: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.user_id, t.role_id] }),
  userIdx: index("user_roles_user_idx").on(t.user_id),
}));

export const authTokens = pgTable("auth_tokens", {
  // Holds staff-invite tokens only. Email-verification and password-reset
  // tokens are managed by better-auth in the `verification` table above.
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  identifier: text("identifier").notNull(),
  type: authTokenType("type").notNull(), // always "staff_invite" in practice
  token_hash: text("token_hash").notNull(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  used_at: timestamp("used_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index("auth_tokens_user_idx").on(t.user_id),
}));

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token_hash: text("token_hash").notNull(),
  ip_hash: text("ip_hash"),
  user_agent: text("user_agent"),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  revoked_at: timestamp("revoked_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index("sessions_user_idx").on(t.user_id),
}));

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  is_secret: boolean("is_secret").notNull().default(false),
  updated_by: uuid("updated_by"),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actor_user_id: uuid("actor_user_id"),
  actor_role: text("actor_role"),
  action: text("action").notNull(),
  entity_type: text("entity_type").notNull(),
  entity_id: text("entity_id"),
  changes: jsonb("changes"),
  ip_hash: text("ip_hash"),
  user_agent: text("user_agent"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  actionIdx: index("audit_logs_action_idx").on(t.action),
  entityIdx: index("audit_logs_entity_idx").on(t.entity_type, t.entity_id),
  actorIdx: index("audit_logs_actor_idx").on(t.actor_user_id),
}));

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  channel: notificationChannel("channel").notNull().default("email"),
  type: text("type").notNull(),
  recipient: text("recipient").notNull(),
  payload: jsonb("payload").notNull(),
  status: notificationStatus("status").notNull().default("queued"),
  attempts: integer("attempts").notNull().default(0),
  last_error: text("last_error"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sent_at: timestamp("sent_at", { withTimezone: true }),
}, (t) => ({
  statusIdx: index("notifications_status_idx").on(t.status, t.created_at),
}));
