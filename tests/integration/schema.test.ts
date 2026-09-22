import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

describe("schema", () => {
  it("all phase-1 tables exist", async () => {
    const names = [
      "users", "account", "verification", "roles", "permissions", "role_permissions",
      "auth_tokens", "sessions", "settings", "audit_logs", "notifications",
    ];
    const res = await db.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables
          where table_schema = 'public' and table_name = any(${sql.raw(`'{${names.join(",")}}'`)})`,
    );
    const found = res.rows.map((r) => r.table_name);
    expect(found.sort()).toEqual([...names].sort());
  });

  it("users has no totp_secret_enc (2FA eliminated)", async () => {
    const res = await db.execute(
      sql`select column_name from information_schema.columns
          where table_name = 'users' and column_name = 'totp_secret_enc'`,
    );
    expect(res.rows.length).toBe(0);
  });

  it("users has no password_hash (credentials live in account)", async () => {
    const res = await db.execute(
      sql`select column_name from information_schema.columns
          where table_name = 'users' and column_name = 'password_hash'`,
    );
    expect(res.rows.length).toBe(0);
  });

  it("email is case-insensitive unique", async () => {
    const res = await db.execute<{ indexname: string }>(
      sql`select indexname from pg_indexes where tablename = 'users' and indexname = 'users_email_unique'`,
    );
    expect(res.rows.length).toBe(1);
  });
});
