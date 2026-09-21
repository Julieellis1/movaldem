# MOVALDEM Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the MOVALDEM Phase 1 Foundation — project scaffold, design system, PostgreSQL schema with seeders, better-auth authentication, data-driven RBAC, audit/settings/notification platform services, a cron-driven email queue, and the admin shell — so that a Super Admin can log in, create staff, and see a dashboard.

**Architecture:** Modular monolith (PRD ARC-01/02). `src/modules/{auth,platform}` own their tables and business logic; `app/api` handlers stay thin and delegate to services. better-auth handles authentication plumbing and is mapped onto the PRD's tables; our own `RbacService` reads roles/permissions as data. Notifications use the outbox pattern (write row in-transaction, process async via Vercel Cron).

**Tech Stack:** Next.js 15 (App Router, TypeScript strict), React 19, pnpm, Neon PostgreSQL, Drizzle ORM + drizzle-kit, better-auth + @better-auth/drizzle-adapter, Zod, Tailwind CSS v4, shadcn/ui, Material Symbols, next/font, Vitest, Playwright, Upstash Ratelimit, react-email, nodemailer.

**Spec:** `docs/superpowers/specs/2026-09-21-movaldem-phase1-foundation-design.md`

## Global Constraints

Copied verbatim from the spec — every task's requirements implicitly include these:

- **Timezone:** store all timestamps in UTC; display/compute periods in `Africa/Lagos` (WAT, UTC+1). Week keys are ISO 8601, Monday start, format `2026-W38`.
- **Currency:** NGN only in V1; money stored as integer **kobo** (₦1 = 100 kobo); format as `₦10,000.00`.
- **IDs:** UUID primary keys; public URLs use unique slugs (later phases).
- **Deletion:** content uses soft delete; payment/quiz-attempt/audit data is never hard-deleted.
- **Server authority:** auth, permissions, payments, timers and uploads are always validated server-side.
- **Privacy:** IP addresses are stored as salted hashes (env `IP_HASH_SALT`), never raw (PRV-05).
- **Language:** English; UI strings centralised for later translation.
- **Unspecified rules:** implement as a configurable setting with the documented default; record in `docs/ASSUMPTIONS.md`.
- **2FA is eliminated** (spec A1): no `totp_secret_enc`, no `auth.require_2fa_for_staff`.
- **Design source of truth:** `ui/DESIGN.md` ("Luminous Sanctuary"), dark-mode-first, no emoji UI.
- **Requirement IDs** (e.g. `SEC-01`, `PERM-01`) are referenced in commit messages and test names.
- **Tests are written with the feature, not afterwards.**

---

## File Structure

```
/
├── src/
│   ├── app/
│   │   ├── layout.tsx                    fonts + metadata + Toaster
│   │   ├── globals.css                   Luminous Sanctuary tokens (CSS vars)
│   │   ├── page.tsx                      temporary root (redirects to /admin or /login)
│   │   ├── (auth)/
│   │   │   ├── layout.tsx
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   ├── verify-email/page.tsx
│   │   │   ├── forgot-password/page.tsx
│   │   │   └── reset-password/page.tsx
│   │   ├── admin/
│   │   │   ├── layout.tsx                admin shell: sidebar + topbar + permission nav
│   │   │   ├── page.tsx                  dashboard
│   │   │   ├── users/page.tsx            members list
│   │   │   ├── users/[id]/page.tsx       member detail + actions
│   │   │   ├── users/staff/page.tsx      staff management (super_admin)
│   │   │   ├── users/roles/page.tsx      roles + permission matrix (super_admin)
│   │   │   ├── settings/page.tsx         grouped tabs
│   │   │   └── audit-logs/page.tsx
│   │   └── api/
│   │       ├── auth/[...all]/route.ts    better-auth handler
│   │       └── cron/process-notifications/route.ts
│   ├── components/
│   │   ├── ui/                           shadcn primitives (themed)
│   │   └── shared/
│   │       ├── data-table.tsx
│   │       ├── form-shell.tsx
│   │       ├── empty-state.tsx
│   │       ├── error-state.tsx
│   │       ├── loading-skeleton.tsx
│   │       └── sonner-toaster.tsx
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.config.ts            better-auth instance
│   │   │   ├── auth.service.ts           AuthService (flows + PRD rules)
│   │   │   ├── rbac.service.ts           permission union + can()
│   │   │   ├── permissions.ts            permission key catalogue (source of seed truth)
│   │   │   └── schemas.ts                Zod schemas for auth forms
│   │   └── platform/
│   │       ├── settings/settings.service.ts
│   │       ├── audit/audit.service.ts
│   │       └── notifications/
│   │           ├── notifications.service.ts
│   │           ├── email.adapter.ts
│   │           └── templates/{verify-email,password-reset,staff-invite}.tsx
│   ├── lib/
│   │   ├── env.ts                        Zod-validated env
│   │   ├── money.ts
│   │   ├── datetime.ts                   Africa/Lagos + ISO week keys
│   │   ├── ip-hash.ts
│   │   ├── crypto.ts                     AES-256-GCM helpers
│   │   ├── errors.ts
│   │   └── utils.ts                      cn()
│   ├── jobs/
│   │   └── notifications-worker.ts
│   └── db/
│       ├── client.ts                     drizzle + neon
│       └── schema.ts
├── drizzle/
│   ├── migrations/                       (generated)
│   └── seeders/
│       ├── roles.ts permissions.ts role-permissions.ts settings.ts index.ts
├── scripts/
│   └── create-superadmin.ts
├── tests/
│   ├── unit/  integration/  e2e/
├── .github/workflows/ci.yml
├── vercel.json
├── drizzle.config.ts
├── vitest.config.ts
├── playwright.config.ts
└── .env.example
```

**Responsibilities:** `db/schema.ts` is the single schema source; `modules/*/` own their tables and rules (no cross-module table access); `lib/` holds pure helpers (no DB); `components/shared/` holds the reusable UX catalogue; `jobs/` holds queue workers only.

---

## Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx`
- Test: `tests/unit/scaffold.test.ts`

**Interfaces:**
- Produces: a bootable Next.js 15 app at `src/app`, `pnpm dev` works.

- [ ] **Step 1: Create the app**

```bash
cd C:\Users\Teta\Desktop\portfolio\movaldem
pnpm create next-app@latest . --typescript --app --tailwind --eslint --src-dir --import-alias "@/*" --use-pnpm --no-turbopack
```

Accept defaults when prompted; this writes `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts` (v4 uses the PostCSS plugin — keep whatever the generator emits).

- [ ] **Step 2: Install dependencies**

```bash
pnpm add drizzle-orm @neondatabase/serverless better-auth @better-auth/drizzle-adapter zod \
  @upstash/ratelimit @upstash/redis react-email nodemailer @node-rs/argon2 \
  material-symbols class-variance-authority clsx tailwind-merge sonner
pnpm add -D drizzle-kit @types/nodemailer vitest @vitest/ui @playwright/test \
  prettier eslint-config-prettier
```

- [ ] **Step 3: Write `.gitignore`, `.env.example`, temporary root page**

`.gitignore` (append the essentials):
```gitignore
node_modules
.next
.env.local
.env.*.local
storage/
*.log
.vercel
playwright-report
test-results
```

`.env.example` (every var the phase needs):
```bash
DATABASE_URL=
APP_URL=http://localhost:3000
APP_SECRET=
PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=
STORAGE_DRIVER=local
STORAGE_BUCKET=
STORAGE_ENDPOINT=
STORAGE_KEY=
STORAGE_SECRET=
CDN_BASE_URL=
SMTP_URL=
MAIL_FROM=
IP_HASH_SALT=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
CRON_SECRET=
```

`src/app/page.tsx`:
```tsx
import { redirect } from "next/navigation";
export default function Home() { return redirect("/login"); }
```

- [ ] **Step 4: Smoke test**

Run: `pnpm dev` → open `http://localhost:3000` → expect redirect to `/login` (404 for now is fine; redirect is the assertion). Then:
```bash
git init && git add -A && git commit -m "chore: scaffold Next.js 15 app with deps (Phase 1 Task 1)"
```

---

## Task 2: Environment validation

**Files:**
- Create: `src/lib/env.ts`
- Test: `tests/unit/env.test.ts`

**Interfaces:**
- Produces: `env` — a typed, validated object (`env.DATABASE_URL`, `env.APP_SECRET`, …). Every module reads env through this, never `process.env` directly.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/env.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
describe("env", () => {
  const ORIG = { ...process.env };
  beforeEach(() => { process.env = { ...ORIG }; });
  afterEach(() => { process.env = ORIG; });

  it("parses a valid environment", async () => {
    process.env.DATABASE_URL = "postgres://u:p@host/db";
    process.env.APP_URL = "http://localhost:3000";
    process.env.APP_SECRET = "a".repeat(32);
    const { loadEnv } = await import("@/lib/env");
    expect(loadEnv().DATABASE_URL).toBe("postgres://u:p@host/db");
    expect(loadEnv().APP_URL).toBe("http://localhost:3000");
  });

  it("throws when a required var is missing", async () => {
    delete process.env.APP_SECRET;
    const { loadEnv } = await import("@/lib/env");
    expect(() => loadEnv()).toThrow(/APP_SECRET/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run tests/unit/env.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/env.ts
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_SECRET: z.string().min(32),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  PAYSTACK_PUBLIC_KEY: z.string().optional(),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_KEY: z.string().optional(),
  STORAGE_SECRET: z.string().optional(),
  CDN_BASE_URL: z.string().optional(),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  IP_HASH_SALT: z.string().min(16),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  CRON_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment: ${keys}`);
  }
  return parsed.data;
}

let cached: Env | null = null;
export function env(): Env {
  if (!cached) cached = loadEnv();
  return cached;
}
```

- [ ] **Step 4: Run tests**
Run: `pnpm vitest run tests/unit/env.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/env.ts tests/unit/env.test.ts
git commit -m "feat: zod-validated environment loader (SEC-11, Phase 1 Task 2)"
```

---

## Task 3: Design system — tokens, fonts, icons

**Files:**
- Create: `src/app/globals.css`, `src/lib/utils.ts`
- Modify: `src/app/layout.tsx`
- Test: `tests/unit/money.test.ts` is later; here: manual visual check + a tokens unit test.

**Interfaces:**
- Produces: CSS variables + Tailwind theme matching `ui/DESIGN.md`; `cn()` helper; fonts `--font-display` (Plus Jakarta Sans) and `--font-sans` (Inter); Material Symbols available as `<span class="material-symbols-outlined">`.

- [ ] **Step 1: Write tokens into `globals.css`**

```css
/* src/app/globals.css */
@import "tailwindcss";

@theme {
  --color-background: #12131a;
  --color-surface-base: #0d0d11;
  --color-surface-card: #13141b;
  --color-surface-elevated: #1b1d27;
  --color-surface-highlight: #242735;
  --color-surface-container-lowest: #0d0e15;
  --color-surface-container-low: #1a1b22;
  --color-surface-container: #1e1f26;
  --color-surface-container-high: #292931;
  --color-surface-container-highest: #34343c;
  --color-on-surface: #e3e1ec;
  --color-on-surface-variant: #cbc3d7;
  --color-primary: #d0bcff;
  --color-primary-container: #a078ff;
  --color-on-primary-container: #340080;
  --color-secondary: #ddb7ff;
  --color-secondary-container: #6f00be;
  --color-tertiary: #ffb95f;
  --color-tertiary-container: #ca8100;
  --color-on-tertiary: #472a00;
  --color-tertiary-fixed: #ffddb8;
  --color-error: #ffb4ab;
  --color-outline: #958ea0;
  --color-outline-variant: #494454;
  --color-text-primary: #ffffff;
  --color-text-secondary: #9ca3af;
  --color-text-muted: #6b7280;
  --color-border-subtle: rgba(255, 255, 255, 0.08);
  --color-border-glow: rgba(139, 92, 246, 0.35);
  --color-gold-glow: rgba(245, 158, 11, 0.25);

  --font-sans: var(--font-inter), system-ui, sans-serif;
  --font-display: var(--font-jakarta), system-ui, sans-serif;

  --text-display: 56px;
  --text-display--line-height: 64px;
  --text-headline-lg: 40px;
  --text-headline-lg--line-height: 48px;
  --text-headline-md: 28px;
  --text-headline-md--line-height: 36px;
  --text-headline-sm: 20px;
  --text-headline-sm--line-height: 28px;
  --text-title-md: 18px;
  --text-title-md--line-height: 24px;
  --text-body-lg: 18px;
  --text-body-lg--line-height: 28px;
  --text-body-md: 15px;
  --text-body-md--line-height: 24px;
  --text-body-sm: 13px;
  --text-body-sm--line-height: 20px;
  --text-label-lg: 14px;
  --text-label-sm: 11px;

  --radius: 1rem;
  --radius-md: 1.5rem;
  --radius-lg: 2rem;
  --radius-xl: 3rem;
}

:root { color-scheme: dark; }
html, body { background: var(--color-surface-base); color: var(--color-on-surface); }
```

- [ ] **Step 2: `cn()` helper**

```ts
// src/lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Fonts + icons in root layout**

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "material-symbols/index.css";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MOVALDEM",
  description: "Mountain of Victory at the Last Day Evangelical Ministry",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Verify**

Run: `pnpm dev`. Expect a dark page with no style errors in the console, and `next/font` CSS variables present on `<html>`. Manual check is the assertion here (visual system).

- [ ] **Step 5: Commit**
```bash
git add src/app/globals.css src/app/layout.tsx src/lib/utils.ts
git commit -m "feat: port Luminous Sanctuary design tokens, fonts, icons (spec D10)"
```

---

## Task 4: Drizzle client + Neon

**Files:**
- Create: `src/db/client.ts`, `drizzle.config.ts`
- Test: `tests/integration/db.test.ts`

**Interfaces:**
- Produces: `db` — a Drizzle instance (`db.select()…`) for all modules; `drizzle.config.ts` for the kit.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/db.test.ts
import { describe, it, expect } from "vitest";
import { db } from "@/db/client";

describe("db", () => {
  it("connects and returns a scalar", async () => {
    const rows = await db.execute<{ now: Date }>`select now() as now`;
    expect(rows.rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — Run: `pnpm vitest run tests/integration/db.test.ts` → FAIL (module missing / no DATABASE_URL).

- [ ] **Step 3: Implement**

```ts
// src/db/client.ts
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Neon HTTP driver: right choice on Vercel serverless (no persistent
// connection pool to exhaust); supports transactions via a single batched
// request.
const sql = neon(env().DATABASE_URL);
export const db = drizzle(sql, { schema });
export type DB = typeof db;
```

```ts
// drizzle.config.ts
import { defineConfig } from "drizzle-kit";
import { env } from "./src/lib/env";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: { url: env().DATABASE_URL },
  strict: true,
  verbose: true,
});
```

Add `pg` only if you later switch off the HTTP driver; the neon-http client needs no extra dependency.

- [ ] **Step 4: Run tests** — Run: `pnpm vitest run tests/integration/db.test.ts` (requires a reachable `DATABASE_URL`) → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/db/client.ts drizzle.config.ts tests/integration/db.test.ts
git commit -m "feat: drizzle + neon database client (Phase 1 Task 4)"
```

---

## Task 5: Database schema — identity, access, platform

**Files:**
- Create: `src/db/schema.ts`
- Test: `tests/integration/schema.test.ts`

**Interfaces:**
- Produces: Drizzle table objects `users`, `roles`, `permissions`, `rolePermissions`, `userRoles`, `authTokens`, `sessions`, `settings`, `auditLogs`, `notifications`, plus `pgEnum`s. better-auth maps onto `users`/`sessions`/`authTokens` (Task 9).

**Documented deviations from PRD 09** (record in `docs/ASSUMPTIONS.md`):
- **Passwords live in `account`, not `users.password_hash`** — better-auth stores credential hashes in the `account` table (`provider_id = "credential"`), so `users` has no `password_hash` column. The argon2id hash function is wired into better-auth (Task 9), satisfying SEC-01.
- The `account` and `verification` tables are better-auth-owned (email-verification and password-reset tokens). `auth_tokens` is ours and holds staff-invite tokens only.
- `users.image` (better-auth core field) is added; `avatar_media_id` is deferred to Phase 2.
- `sessions` gains `created_at`/`updated_at` (better-auth core fields).
- `users.consent_at` is nullable: consent is enforced by the registration Zod schema (PRV-02) and written immediately after sign-up, not at row creation.
- `users.totp_secret_enc` is **absent** (2FA eliminated, spec A1).

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/schema.test.ts
import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { users, roles, permissions, sessions, authTokens, settings, auditLogs, notifications } from "@/db/schema";
import { sql } from "drizzle-orm";

describe("schema", () => {
  it("all phase-1 tables exist", async () => {
    const names = [
      "users", "account", "verification", "roles", "permissions", "role_permissions", "user_roles",
      "auth_tokens", "sessions", "settings", "audit_logs", "notifications",
    ];
    const res = await db.execute<{ table_name: string }>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name = any(${names})`;
    const found = res.rows.map((r) => r.table_name);
    expect(found.sort()).toEqual([...names].sort());
  });

  it("users has no totp_secret_enc (2FA eliminated)", async () => {
    const res = await db.execute`
      select column_name from information_schema.columns
      where table_name = 'users' and column_name = 'totp_secret_enc'`;
    expect(res.rows.length).toBe(0);
  });

  it("users has no password_hash (credentials live in account)", async () => {
    const res = await db.execute`
      select column_name from information_schema.columns
      where table_name = 'users' and column_name = 'password_hash'`;
    expect(res.rows.length).toBe(0);
  });

  it("email is case-insensitive unique", async () => {
    const res = await db.execute<{ indexname: string }>`
      select indexname from pg_indexes where tablename = 'users' and indexname = 'users_email_unique'`;
    expect(res.rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — Run: `pnpm vitest run tests/integration/schema.test.ts` → FAIL.

- [ ] **Step 3: Implement the schema**

```ts
// src/db/schema.ts
import { pgTable, pgEnum, uuid, text, timestamp, boolean, integer, jsonb, primaryKey, index, uniqueIndex, pgPolicy } from "drizzle-orm/pg-core";
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
```

> **Fix before generating:** the `updated_at` line in `sessions` above is correct as written — use `{ withTimezone: true }` exactly as shown (no cast).

- [ ] **Step 4: Generate + run migration**

```bash
pnpm drizzle-kit generate    # writes drizzle/migrations/0000_*.sql
pnpm drizzle-kit migrate     # applies to the DATABASE_URL database
```

Also create the `citext` extension used for case-insensitive email by adding to the generated migration's top (or a dedicated `0001_citext.sql`):
```sql
CREATE EXTENSION IF NOT EXISTS citext;
```

Run: `pnpm vitest run tests/integration/schema.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/db/schema.ts drizzle/migrations tests/integration/schema.test.ts
git commit -m "feat: phase-1 schema — identity, access, platform tables (PRD 09, no 2FA per A1)"
```

---

## Task 6: `lib` utilities — money, datetime, ip-hash, crypto

**Files:**
- Create: `src/lib/money.ts`, `src/lib/datetime.ts`, `src/lib/ip-hash.ts`, `src/lib/crypto.ts`
- Test: `tests/unit/money.test.ts`, `tests/unit/datetime.test.ts`, `tests/unit/ip-hash.test.ts`, `tests/unit/crypto.test.ts`

**Interfaces:**
- Produces: `formatNaira(kobo): string`, `parseNairaToKobo(input): number`, `toLagosDate(utc): Date`, `isoWeekKey(utc): string`, `monthKey(utc)`, `yearKey(utc)`, `hashIp(ip): string`, `encryptSecret(plain)`/`decryptSecret(cipher)`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/money.test.ts
import { describe, it, expect } from "vitest";
import { formatNaira, parseNairaToKobo } from "@/lib/money";

describe("money", () => {
  it("formats kobo to naira", () => {
    expect(formatNaira(1000000)).toBe("₦10,000.00");
    expect(formatNaira(0)).toBe("₦0.00");
  });
  it("parses naira input to kobo", () => {
    expect(parseNairaToKobo("10000.00")).toBe(1000000);
    expect(parseNairaToKobo("10000")).toBe(1000000);
  });
  it("rejects negative and invalid input", () => {
    expect(() => parseNairaToKobo("-5")).toThrow();
    expect(() => parseNairaToKobo("abc")).toThrow();
  });
});
```

```ts
// tests/unit/datetime.test.ts
import { describe, it, expect } from "vitest";
import { isoWeekKey, monthKey, yearKey, toLagosDate } from "@/lib/datetime";

describe("datetime", () => {
  // 2026-09-21 is a Monday, in ISO week 2026-W39 (week starting Mon 2026-09-21)
  it("produces ISO week keys in Lagos time", () => {
    const utc = new Date("2026-09-21T00:00:00Z"); // 01:00 Lagos, still Mon
    expect(isoWeekKey(utc)).toBe("2026-W39");
  });
  it("respects Lagos offset for week boundaries", () => {
    const justBeforeMon = new Date("2026-09-20T22:30:00Z"); // 23:30 Sun in Lagos
    expect(isoWeekKey(justBeforeMon)).toBe("2026-W38");
  });
  it("produces month and year keys", () => {
    const d = new Date("2026-09-21T00:00:00Z");
    expect(monthKey(d)).toBe("2026-09");
    expect(yearKey(d)).toBe("2026");
  });
});
```

```ts
// tests/unit/ip-hash.test.ts
import { describe, it, expect } from "vitest";
import { hashIp } from "@/lib/ip-hash";
describe("hashIp", () => {
  it("is deterministic and salted", () => {
    process.env.IP_HASH_SALT = "0123456789abcdef0123456789abcdef";
    expect(hashIp("102.89.23.10")).toBe(hashIp("102.89.23.10"));
    expect(hashIp("102.89.23.10")).not.toBe(hashIp("102.89.23.11"));
  });
});
```

```ts
// tests/unit/crypto.test.ts
import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
describe("crypto", () => {
  it("round-trips a secret", () => {
    process.env.APP_SECRET = "a".repeat(32);
    const cipher = encryptSecret("sk_live_abcdef1234");
    expect(cipher).not.toContain("sk_live");
    expect(decryptSecret(cipher)).toBe("sk_live_abcdef1234");
  });
});
```

- [ ] **Step 2: Run tests to verify failure** — Run: `pnpm vitest run tests/unit/{money,datetime,ip-hash,crypto}.test.ts` → FAIL (modules missing).

- [ ] **Step 3: Implement**

```ts
// src/lib/money.ts
const NIGERIA_LOCALE = "en-NG";
export function formatNaira(kobo: number): string {
  if (!Number.isInteger(kobo)) throw new Error("Amount must be integer kobo");
  const naira = kobo / 100;
  return new Intl.NumberFormat(NIGERIA_LOCALE, {
    style: "currency", currency: "NGN", minimumFractionDigits: 2,
  }).format(naira);
}
export function parseNairaToKobo(input: string): number {
  const naira = Number(input.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(naira) || naira < 0) throw new Error("Invalid amount");
  return Math.round(naira * 100);
}
```

```ts
// src/lib/datetime.ts
export const LAGOS_TZ = "Africa/Lagos";
export function toLagosDate(utc: Date): Date {
  return new Date(utc.toLocaleString("en-US", { timeZone: LAGOS_TZ }));
}
export function isoWeekKey(utc: Date): string {
  const d = toLagosDate(utc);
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (tmp.getUTCDay() + 6) % 7; // Monday = 0
  tmp.setUTCDate(tmp.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      (tmp.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000) -
        ((firstThursday.getUTCDay() + 6) % 7) / 7,
    );
  const year = tmp.getUTCFullYear();
  return `${year}-W${String(week).padStart(2, "0")}`;
}
export function monthKey(utc: Date): string {
  const d = toLagosDate(utc);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function yearKey(utc: Date): string {
  return String(toLagosDate(utc).getFullYear());
}
```

```ts
// src/lib/ip-hash.ts
import { createHash } from "node:crypto";
import { env } from "@/lib/env";
export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`${env().IP_HASH_SALT}:${ip}`).digest("hex");
}
```

```ts
// src/lib/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "@/lib/env";
const ALGO = "aes-256-gcm";
function key() { return scryptSync(env().APP_SECRET, "movaldem-salt", 32); }
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv.toString("base64"), enc.toString("base64"), c.getAuthTag().toString("base64")].join(":");
}
export function decryptSecret(payload: string): string {
  const [ivB, encB, tagB] = payload.split(":");
  const d = createDecipheriv(ALGO, key(), Buffer.from(ivB, "base64"));
  d.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([d.update(Buffer.from(encB, "base64")), d.final()]).toString("utf8");
}
export function maskSecret(payload: string | null): string {
  if (!payload) return "";
  const plain = decryptSecret(payload);
  return `${plain.slice(0, 8)}••••${plain.slice(-4)}`;
}
```

- [ ] **Step 4: Run tests** — Run: `pnpm vitest run tests/unit/{money,datetime,ip-hash,crypto}.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib tests/unit
git commit -m "feat: money, datetime (Africa/Lagos + ISO weeks), ip-hash, crypto helpers (PRV-05, SEC-11)"
```

---

## Task 7: Permission catalogue + seeders + superadmin CLI

**Files:**
- Create: `src/modules/auth/permissions.ts`, `drizzle/seeders/roles.ts`, `drizzle/seeders/permissions.ts`, `drizzle/seeders/role-permissions.ts`, `drizzle/seeders/settings.ts`, `drizzle/seeders/index.ts`, `scripts/create-superadmin.ts`
- Modify: `package.json` (add scripts)
- Test: `tests/integration/seed.test.ts`

**Interfaces:**
- Produces: `PERMISSIONS` (array of `{key, description}`) — the single source of permission truth used by both the seeder and the RBAC service; `pnpm db:seed` and `pnpm db:create-superadmin` scripts.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/seed.test.ts
import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { roles, permissions, rolePermissions, settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { seed } from "../../drizzle/seeders";

describe("seed", () => {
  it("creates the 5 roles with the full permission matrix", async () => {
    await seed(db);
    const r = await db.select().from(roles);
    expect(r.map((x) => x.key).sort()).toEqual(
      ["admin", "content_manager", "member", "quiz_manager", "super_admin"].sort(),
    );
    const perms = await db.select().from(permissions);
    expect(perms.length).toBeGreaterThanOrEqual(50);
    // super_admin holds every permission
    const superRole = r.find((x) => x.key === "super_admin")!;
    const links = await db.select().from(rolePermissions).where(eq(rolePermissions.role_id, superRole.id));
    expect(links.length).toBe(perms.length);
    // member has no admin permissions
    const memberRole = r.find((x) => x.key === "member")!;
    const memberLinks = await db.select().from(rolePermissions).where(eq(rolePermissions.role_id, memberRole.id));
    expect(memberLinks.length).toBe(0);
  });
  it("seeds settings defaults and is idempotent", async () => {
    await seed(db);
    await seed(db);
    const s = await db.select().from(settings).where(eq(settings.key, "quiz.require_verified_email"));
    expect(s.length).toBe(1);
    expect(s[0].value).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `pnpm vitest run tests/integration/seed.test.ts` → FAIL.

- [ ] **Step 3: Implement the permission catalogue**

```ts
// src/modules/auth/permissions.ts
export const RESOURCES = [
  "sermons", "bible_studies", "sunday_school", "series", "events", "programmes",
  "gallery", "media", "pages", "quiz_categories", "questions", "quizzes",
  "quiz_imports", "attempts", "leaderboards", "quiz_reports", "projects",
  "transactions", "giving_reports", "members", "staff", "roles",
  "contact_messages", "settings", "paystack", "audit_logs",
] as const;
export type Resource = (typeof RESOURCES)[number];
export const ACTIONS = ["create", "read", "update", "delete", "publish", "export"] as const;
export type Action = (typeof ACTIONS)[number];
export type PermissionKey = `${Resource}.${Action}` | `${Resource}.reverify` | `${Resource}.cancel` | `${Resource}.recalculate` | `${Resource}.suspend` | `${Resource}.invite`;

export const PERMISSIONS: { key: PermissionKey; description: string }[] = [];
for (const r of RESOURCES) for (const a of ACTIONS) {
  if (r === "transactions" && a === "publish") continue;
  PERMISSIONS.push({ key: `${r}.${a}` as PermissionKey, description: `${a} ${r}` });
}
["transactions.reverify", "attempts.cancel", "leaderboards.recalculate", "members.suspend", "staff.invite"].forEach((k) =>
  PERMISSIONS.push({ key: k as PermissionKey, description: k }),
);
```

```ts
// drizzle/seeders/roles.ts
export const ROLE_KEYS = {
  member: "Member",
  content_manager: "Content Manager",
  quiz_manager: "Quiz Manager",
  admin: "Admin",
  super_admin: "Super Admin",
} as const;
export type RoleKey = keyof typeof ROLE_KEYS;
```

```ts
// drizzle/seeders/permissions.ts — derived from the catalogue
import { PERMISSIONS } from "@/modules/auth/permissions";
export const PERMISSION_SEED = PERMISSIONS;
```

```ts
// drizzle/seeders/role-permissions.ts
import type { RoleKey } from "./roles";

// Matrix per PRD 03 §2. `*` = all actions for that resource.
export const ROLE_MATRIX: Record<RoleKey, string[]> = {
  member: [],
  content_manager: [
    "sermons.*", "bible_studies.*", "sunday_school.*", "series.*", "events.*",
    "programmes.*", "gallery.create", "gallery.read", "gallery.update", "gallery.delete",
    "media.*", "pages.create", "pages.read", "pages.update",
  ],
  quiz_manager: [
    "media.create", "media.read", "media.update",
    "quiz_categories.*", "questions.*", "quizzes.*", "quiz_imports.*",
    "attempts.read", "attempts.cancel", "leaderboards.read", "leaderboards.recalculate",
    "quiz_reports.*", "settings.read", "settings.update",
  ],
  admin: [
    "sermons.*", "bible_studies.*", "sunday_school.*", "series.*", "events.*", "programmes.*",
    "gallery.*", "media.*", "pages.*",
    "quiz_categories.*", "questions.*", "quizzes.*", "quiz_imports.*",
    "attempts.read", "attempts.cancel", "leaderboards.read", "leaderboards.recalculate", "quiz_reports.*",
    "projects.*", "transactions.read", "transactions.export", "transactions.reverify",
    "giving_reports.*", "members.read", "members.update", "members.suspend",
    "contact_messages.read", "contact_messages.update", "contact_messages.delete",
    "settings.read", "settings.update",
  ],
  super_admin: ["*"],
};
```

```ts
// drizzle/seeders/settings.ts
export const SETTINGS_SEED: { key: string; value: unknown; is_secret: boolean }[] = [
  { key: "church.name", value: "Mountain of Victory at the Last Day Evangelical Ministry", is_secret: false },
  { key: "content.require_review", value: false, is_secret: false },
  { key: "content.items_per_page", value: 12, is_secret: false },
  { key: "quiz.require_verified_email", value: true, is_secret: false },
  { key: "quiz.grace_seconds", value: 5, is_secret: false },
  { key: "leaderboard.attempt_counting", value: "best_per_quiz", is_secret: false },
  { key: "leaderboard.min_attempts", value: 1, is_secret: false },
  { key: "leaderboard.default_display", value: "abbreviated", is_secret: false },
  { key: "leaderboard.force_abbreviated", value: false, is_secret: false },
  { key: "leaderboard.page_size", value: 50, is_secret: false },
  { key: "giving.min_amount", value: 10000, is_secret: false }, // kobo = ₦100
  { key: "giving.abandon_after_minutes", value: 60, is_secret: false },
  { key: "audit.retention_months", value: 24, is_secret: false },
  // NOTE: no auth.require_2fa_for_staff — 2FA eliminated (spec A1)
];
```

```ts
// drizzle/seeders/index.ts
import type { DB } from "@/db/client";
import { roles, permissions, rolePermissions, settings } from "@/db/schema";
import { PERMISSION_SEED } from "./permissions";
import { ROLE_KEYS } from "./roles";
import { ROLE_MATRIX } from "./role-permissions";
import { SETTINGS_SEED } from "./settings";

export async function seed(db: DB) {
  await db.transaction(async (tx) => {
    for (const [key, name] of Object.entries(ROLE_KEYS)) {
      await tx.insert(roles).values({ key, name, is_system: true }).onConflictDoNothing({ target: roles.key });
    }
    for (const p of PERMISSION_SEED) {
      await tx.insert(permissions).values(p).onConflictDoNothing({ target: permissions.key });
    }
    const allPerms = await tx.select().from(permissions);
    const byKey = new Map(allPerms.map((p) => [p.key, p.id]));
    const allRoles = await tx.select().from(roles);
    const byRoleKey = new Map(allRoles.map((r) => [r.key, r.id]));
    for (const [roleKey, patterns] of Object.entries(ROLE_MATRIX)) {
      const roleId = byRoleKey.get(roleKey)!;
      const keys = patterns.flatMap((pat) =>
        pat === "*" ? allPerms.map((p) => p.key)
          : pat.endsWith(".*") ? allPerms.filter((p) => p.key.startsWith(pat.slice(0, -1))).map((p) => p.key)
          : [pat],
      );
      for (const k of keys) {
        const pid = byKey.get(k);
        if (!pid) continue;
        await tx.insert(rolePermissions).values({ role_id: roleId, permission_id: pid }).onConflictDoNothing();
      }
    }
    for (const s of SETTINGS_SEED) {
      await tx.insert(settings).values(s).onConflictDoUpdate({
        target: settings.key, set: { value: s.value, is_secret: s.is_secret },
      });
    }
  });
}
```

File boundaries are clean: `roles.ts` exports `ROLE_KEYS` + `RoleKey` and imports nothing from the other seeders; `role-permissions.ts` imports only the `RoleKey` type; `index.ts` imports from all three plus `settings.ts`.

```ts
// scripts/create-superadmin.ts
import { auth } from "@/modules/auth/auth.config";
import { db } from "@/db/client";
import { users, userRoles, roles } from "@/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;
  const name = process.env.SUPERADMIN_NAME ?? "Super Admin";
  if (!email || !password) throw new Error("Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD");
  const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  if (existing.length) { console.log("Super admin already exists"); return; }
  // Create through better-auth so the credential hash lands in `account` correctly.
  const res = await auth.api.signUpEmail({
    body: { email: email.toLowerCase(), password, name },
  });
  await db.update(users)
    .set({ email_verified_at: new Date(), status: "active" })
    .where(eq(users.id, res.user.id));
  const [superRole] = await db.select().from(roles).where(eq(roles.key, "super_admin"));
  await db.insert(userRoles).values({ user_id: res.user.id, role_id: superRole.id });
  console.log(`Created super admin ${email}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

`package.json` scripts:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "e2e": "playwright test",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:seed": "tsx drizzle/seeders/index.ts",
  "db:create-superadmin": "tsx scripts/create-superadmin.ts"
}
```
Add `tsx` to devDeps: `pnpm add -D tsx`.

- [ ] **Step 4: Run tests**
```bash
pnpm vitest run tests/integration/seed.test.ts   # PASS
SUPERADMIN_EMAIL=admin@movaldem.org SUPERADMIN_PASSWORD=change-me-1234 pnpm db:create-superadmin
```

- [ ] **Step 5: Commit**
```bash
git add src/modules/auth/permissions.ts drizzle/seeders scripts package.json tests/integration/seed.test.ts
git commit -m "feat: seeders for roles, permission matrix, settings + superadmin CLI (PRD 03, 08; D5)"
```

---

## Task 8: Password hashing service

**Files:**
- Create: `src/modules/auth/password.ts`
- Test: `tests/unit/password.test.ts`

**Interfaces:**
- Produces: `hashPassword(plain): Promise<string>`, `verifyPassword(plain, hash): Promise<boolean>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/password.test.ts
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/modules/auth/password";
describe("password", () => {
  it("hashes and verifies", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(hash).not.toBe("correct-horse-battery");
    expect(await verifyPassword("correct-horse-battery", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run tests/unit/password.test.ts` → FAIL.

- [ ] **Step 3: Implement (argon2id, SEC-01)**

This module is consumed by `auth.config.ts` (Task 9) via `emailAndPassword.password: { hash, verify }` — better-auth then stores the resulting hash in the `account` table. `AuthService` never hashes passwords itself.

```ts
// src/modules/auth/password.ts
import { hash, verify } from "@node-rs/argon2";
export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, { algorithm: 2 /* argon2id */, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}
export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  return verify(hashed, plain);
}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/modules/auth/password.ts tests/unit/password.test.ts
git commit -m "feat: argon2id password hashing (SEC-01)"
```

---

## Task 9: better-auth configuration

**Files:**
- Create: `src/modules/auth/auth.config.ts`, `src/app/api/auth/[...all]/route.ts`
- Test: `tests/integration/auth-config.test.ts`

**Interfaces:**
- Produces: `auth` — the better-auth instance with `auth.handler`, `auth.api.*`. Consumes `db` (Task 4), `hashIp` (Task 6). Mapped onto PRD tables.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/auth-config.test.ts
import { describe, it, expect } from "vitest";
import { auth } from "@/modules/auth/auth.config";
describe("auth config", () => {
  it("maps onto PRD table names", () => {
    expect(auth.options.user?.modelName).toBe("users");
    expect(auth.options.user?.fields?.name).toBe("full_name");
    expect(auth.options.session?.modelName).toBe("sessions");
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/modules/auth/auth.config.ts
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
```

```ts
// src/app/api/auth/[...all]/route.ts
import { auth } from "@/modules/auth/auth.config";
export const { GET, POST } = auth.handler;
```

- [ ] **Step 4: Verify schema alignment + run tests**

```bash
pnpm dlx auth@latest generate --config src/modules/auth/auth.config.ts
```
The CLI prints the expected tables/columns; confirm they match `schema.ts` (it may emit an account table — not needed for email/password; do not add it). Run: `pnpm vitest run tests/integration/auth-config.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/modules/auth/auth.config.ts src/app/api tests/integration/auth-config.test.ts
git commit -m "feat: better-auth mapped onto PRD tables, argon2id, ip hashing (AUTH, PRV-05)"
```

---

## Task 10: `RbacService` — permission union and `can()`

**Files:**
- Create: `src/modules/auth/rbac.service.ts`, `src/lib/request-context.ts`
- Test: `tests/integration/rbac.test.ts`

**Interfaces:**
- Produces: `loadPermissions(userId): Promise<Set<string>>`, `can(perms, key): boolean`, `requirePermission(perms, key): void`, plus request-scoped caching.
- Consumes: `db`, `PERMISSIONS`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/rbac.test.ts
import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { seed } from "../../drizzle/seeders";
import { loadPermissions, can } from "@/modules/auth/rbac.service";
import { users, userRoles, roles } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("rbac", () => {
  it("unions permissions across a user's roles", async () => {
    await seed(db);
    const [u] = await db.insert(users).values({
      full_name: "Test", email: "rbac@test.org", consent_at: new Date(),
    }).returning();
    const [cm] = await db.select().from(roles).where(eq(roles.key, "content_manager"));
    const [sa] = await db.select().from(roles).where(eq(roles.key, "super_admin"));
    await db.insert(userRoles).values([{ user_id: u.id, role_id: cm.id }, { user_id: u.id, role_id: sa.id }]);
    const perms = await loadPermissions(u.id, db);
    expect(can(perms, "sermons.create")).toBe(true);
    expect(can(perms, "transactions.read")).toBe(true); // via super_admin
  });
  it("denies members admin actions", async () => {
    const [u2] = await db.insert(users).values({
      full_name: "M", email: "m@test.org", consent_at: new Date(),
    }).returning();
    const perms = await loadPermissions(u2.id, db);
    expect(can(perms, "sermons.create")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/request-context.ts
import { AsyncLocalStorage } from "node:async_hooks";
type Ctx = { userId?: string; permissions?: Set<string> };
export const requestCtx = new AsyncLocalStorage<Ctx>();
```

```ts
// src/modules/auth/rbac.service.ts
import { db as defaultDb, type DB } from "@/db/client";
import { userRoles, rolePermissions, permissions } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function loadPermissions(userId: string, db: DB = defaultDb): Promise<Set<string>> {
  const cached = requestCtx.getStore()?.permissions;
  if (cached) return cached;
  const rows = await db
    .select({ key: permissions.key })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.role_id, userRoles.role_id))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permission_id))
    .where(eq(userRoles.user_id, userId));
  const set = new Set(rows.map((r) => r.key));
  requestCtx.enterWith({ userId, permissions: set });
  return set;
}

export function can(perms: Set<string>, key: string): boolean {
  return perms.has(key);
}

export function requirePermission(perms: Set<string>, key: string): void {
  if (!can(perms, key)) {
    const err = new Error("Forbidden") as Error & { status?: number };
    err.status = 403;
    throw err;
  }
}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/modules/auth/rbac.service.ts src/lib/request-context.ts tests/integration/rbac.test.ts
git commit -m "feat: data-driven RBAC with request-scoped permission cache (PERM-01)"
```

---

## Task 11: `AuditService`

**Files:**
- Create: `src/modules/platform/audit/audit.service.ts`, `src/modules/platform/audit/redact.ts`
- Test: `tests/integration/audit.test.ts`

**Interfaces:**
- Produces: `auditLog(input)` — called inside the caller's transaction; `redactSecrets(changes)`.
- Consumes: a Drizzle transaction client (`tx`).

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/audit.test.ts
import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { auditLog } from "@/modules/platform/audit/audit.service";
import { redactSecrets } from "@/modules/platform/audit/redact";

describe("audit", () => {
  it("writes a row inside the caller transaction", async () => {
    const id = await db.transaction(async (tx) => {
      return auditLog(tx, { action: "user.suspend", entity_type: "users", entity_id: "u1", actor_role: "admin" });
    });
    const rows = await db.select().from(auditLogs);
    expect(rows.some((r) => r.id === id)).toBe(true);
  });
  it("redacts known secret fields", () => {
    const out = redactSecrets({ before: { paystack_secret_key: "sk_live_x", name: "Grace" } });
    expect(out.before.paystack_secret_key).toBe("[REDACTED]");
    expect(out.before.name).toBe("Grace");
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/modules/platform/audit/redact.ts
const SECRET_FIELDS = ["paystack_secret_key", "paystack_public_key", "password", "password_hash",
  "smtp_url", "storage_secret", "storage_key", "totp_secret", "app_secret", "token", "token_hash"];
export function redactSecrets(changes: unknown): unknown {
  if (!changes || typeof changes !== "object") return changes;
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).map(([k, val]) =>
          SECRET_FIELDS.includes(k) ? [k, "[REDACTED]"] : [k, walk(val)],
        ),
      );
    }
    return v;
  };
  return walk(changes);
}
```

```ts
// src/modules/platform/audit/audit.service.ts
import { auditLogs } from "@/db/schema";
import { redactSecrets } from "./redact";
import { hashIp } from "@/lib/ip-hash";

export type AuditInput = {
  actor_user_id?: string;
  actor_role?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  changes?: unknown;
  ip?: string | null;
  user_agent?: string | null;
};

// Deliberately no update()/delete() — append-only (AUD-02).
export async function auditLog(tx: Parameters<Parameters<import("@/db/client").DB["transaction"]>[0]>[0], input: AuditInput) {
  const [row] = await tx.insert(auditLogs).values({
    actor_user_id: input.actor_user_id,
    actor_role: input.actor_role,
    action: input.action,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    changes: redactSecrets(input.changes) as Record<string, unknown>,
    ip_hash: hashIp(input.ip),
    user_agent: input.user_agent,
  }).returning({ id: auditLogs.id });
  return row.id;
}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/modules/platform/audit tests/integration/audit.test.ts
git commit -m "feat: append-only transactional audit service with secret redaction (AUD-01/02, PRV-05)"
```

---

## Task 12: `SettingsService`

**Files:**
- Create: `src/modules/platform/settings/settings.service.ts`
- Test: `tests/integration/settings.test.ts`

**Interfaces:**
- Produces: `getSetting<T>(key, fallback?)`, `setSetting(key, value, opts)`, `getSecret(key)`, `maskSecretValue(key)`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/settings.test.ts
import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { getSetting, setSetting, getSecret } from "@/modules/platform/settings/settings.service";

describe("settings", () => {
  it("reads a seeded default", async () => {
    expect(await getSetting(db, "content.items_per_page")).toBe(12);
  });
  it("returns fallback for unknown keys", async () => {
    expect(await getSetting(db, "nope.x", "default")).toBe("default");
  });
  it("encrypts secrets at rest and never stores plaintext", async () => {
    await setSetting(db, "paystack.secret_key", "sk_live_abcdef", { isSecret: true, updatedBy: null });
    const cipher = await getSecret(db, "paystack.secret_key"); // returns plaintext
    expect(cipher).toBe("sk_live_abcdef");
    const raw = await db.execute<{ value: unknown }>`select value from settings where key = 'paystack.secret_key'`;
    expect(JSON.stringify(raw.rows[0].value)).not.toContain("sk_live_abcdef");
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/modules/platform/settings/settings.service.ts
import type { DB } from "@/db/client";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/crypto";

export async function getSetting<T>(db: DB, key: string, fallback?: T): Promise<T | undefined> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  if (!row) return fallback;
  return (row.is_secret ? decryptSecret(row.value as string) : row.value) as T;
}

export async function setSetting(
  db: DB, key: string, value: unknown,
  opts: { isSecret?: boolean; updatedBy?: string | null },
) {
  const stored = opts.isSecret ? encryptSecret(String(value)) : value;
  await db
    .insert(settings)
    .values({ key, value: stored as Record<string, unknown>, is_secret: !!opts.isSecret, updated_by: opts.updatedBy ?? null })
    .onConflictDoUpdate({ target: settings.key, set: { value: stored as Record<string, unknown>, is_secret: !!opts.isSecret, updated_by: opts.updatedBy ?? null, updated_at: new Date() } });
}

export async function getSecret(db: DB, key: string): Promise<string | null> {
  const v = await getSetting<string>(db, key);
  return v ?? null;
}

export async function maskSetting(db: DB, key: string): Promise<string> {
  const v = await getSecret(db, key);
  if (!v) return "";
  return maskSecret(encryptSecret(v));
}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/modules/platform/settings tests/integration/settings.test.ts
git commit -m "feat: settings service with AES-256-GCM secret encryption (SEC-11, PRD 08 §6)"
```

---

## Task 13: `NotificationService` + templates + SMTP adapter

**Files:**
- Create: `src/modules/platform/notifications/notifications.service.ts`, `src/modules/platform/notifications/email.adapter.ts`, `src/modules/platform/notifications/templates/verify-email.tsx`, `.../password-reset.tsx`, `.../staff-invite.tsx`
- Test: `tests/integration/notifications.test.ts`

**Interfaces:**
- Produces: `enqueueNotification(input)` (in-transaction outbox write), `sendEmail({ to, subject, html, text })`, template renderers.
- Consumes: `db`, `env().SMTP_URL`, `env().MAIL_FROM`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/notifications.test.ts
import { describe, it, expect } from "vitest";
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
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

```tsx
// src/modules/platform/notifications/templates/verify-email.tsx
import { render } from "@react-email/components";
import VerifyEmail from "./verify-email-template";

export function renderVerifyEmail(props: { url: string; name: string }) {
  const html = render(<VerifyEmail {...props} />);
  return { html, text: `Verify your email: ${props.url}` };
}
```

Create `verify-email-template.tsx` (and the two analogous templates) as simple branded dark-themed emails with the link, church name from settings, and a plaintext part. Keep them minimal: a heading, one paragraph, a pill-styled link, and the footer.

```ts
// src/modules/platform/notifications/email.adapter.ts
import nodemailer from "nodemailer";
import { env } from "@/lib/env";

let transporter: nodemailer.Transporter | null = null;
export function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport(env().SMTP_URL ?? { streamTransport: true, debug: false });
  }
  return transporter;
}

export async function sendEmail(input: { to: string; subject: string; html: string; text?: string }) {
  const info = await getTransporter().sendMail({
    from: env().MAIL_FROM ?? "MOVALDEM <no-reply@movaldem.org>",
    to: input.to, subject: input.subject, html: input.html, text: input.text,
  });
  return info.messageId;
}
```

```ts
// src/modules/platform/notifications/notifications.service.ts
import { notifications } from "@/db/schema";

export type NotificationInput = {
  type: string;
  recipient: string;
  payload: Record<string, unknown>;
};

// Outbox: caller includes this in its own transaction so the intent is never lost (REL-01).
export async function enqueueNotification(
  tx: Parameters<Parameters<import("@/db/client").DB["transaction"]>[0]>[0],
  input: NotificationInput,
) {
  const [row] = await tx.insert(notifications).values({
    channel: "email", type: input.type, recipient: input.recipient,
    payload: input.payload, status: "queued",
  }).returning({ id: notifications.id });
  return row.id;
}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/modules/platform/notifications tests/integration/notifications.test.ts
git commit -m "feat: notification outbox + react-email templates + SMTP adapter (NTF-01/02, REL-01)"
```

---

## Task 14: Notifications queue worker + Vercel Cron

**Files:**
- Create: `src/jobs/notifications-worker.ts`, `src/app/api/cron/process-notifications/route.ts`, `vercel.json`
- Test: `tests/integration/worker.test.ts`

**Interfaces:**
- Produces: `processNotificationQueue(db)` — claims and sends queued notifications idempotently; protected cron endpoint.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/worker.test.ts
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
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/jobs/notifications-worker.ts
import type { DB } from "@/db/client";
import { notifications } from "@/db/schema";
import { and, eq, lte, asc, sql } from "drizzle-orm";
import { renderVerifyEmail } from "@/modules/platform/notifications/templates/verify-email";
import { sendEmail } from "@/modules/platform/notifications/email.adapter";

const TEMPLATES = {
  verify_email: (p: Record<string, unknown>) => renderVerifyEmail({ url: String(p.url), name: String(p.name ?? "") }),
  // password_reset + staff_invite wired in their tasks
} as const;

export async function processNotificationQueue(
  db: DB,
  opts?: { max?: number; send?: (input: { to: string; subject: string; html: string; text?: string }) => Promise<string> },
) {
  const max = opts?.max ?? 25;
  const batch = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.status, "queued"), lte(notifications.created_at, new Date())))
    .orderBy(asc(notifications.created_at))
    .limit(max)
    .for("update skip locked"); // optimistic leasing — duplicate cron runs can't double-send

  let sent = 0;
  for (const row of batch) {
    try {
      const render = TEMPLATES[row.type as keyof typeof TEMPLATES];
      const { html, text } = render(row.payload as Record<string, unknown>);
      const messageId = opts?.send
        ? await opts.send({ to: row.recipient, subject: "MOVALDEM", html, text })
        : await sendEmail({ to: row.recipient, subject: "MOVALDEM", html, text });
      await db.update(notifications).set({ status: "sent", sent_at: new Date(), attempts: row.attempts + 1 })
        .where(and(eq(notifications.id, row.id), eq(notifications.status, "queued")));
      if (messageId) sent++;
    } catch (err) {
      await db.update(notifications).set({
        status: "failed", last_error: err instanceof Error ? err.message : String(err),
        attempts: row.attempts + 1,
      }).where(eq(notifications.id, row.id));
    }
  }
  return sent;
}
```

```ts
// src/app/api/cron/process-notifications/route.ts
import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { processNotificationQueue } from "@/jobs/notifications-worker";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env().CRON_SECRET}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sent = await processNotificationQueue(db);
  return NextResponse.json({ sent });
}
```

```json
// vercel.json
{
  "crons": [{ "path": "/api/cron/process-notifications", "schedule": "* * * * *" }]
}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/jobs src/app/api/cron vercel.json tests/integration/worker.test.ts
git commit -m "feat: idempotent notification queue worker behind Vercel Cron (REL-01/02)"
```

---

## Task 15: `AuthService` — registration and email verification

**Files:**
- Create: `src/modules/auth/auth.service.ts`, `src/modules/auth/schemas.ts`
- Test: `tests/integration/auth-register.test.ts`

**Interfaces:**
- Produces: `registerMember(input)`, `verifyEmail(token)`, `sendVerificationEmail(userId)`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/auth-register.test.ts
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
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/modules/auth/schemas.ts
import { z } from "zod";
const phoneNg = z.string().regex(/^(\+234|0)[789][01]\d{8}$/);
export const registerSchema = z.object({
  full_name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: phoneNg.optional(),
  password: z.string().min(8).max(128),
  confirmPassword: z.string(),
  church: z.string().optional(),
  age_range: z.string().optional(),
  gender: z.string().optional(),
  consent: z.literal(true, { errorMap: () => ({ message: "Consent is required" }) }),
}).refine((d) => d.password === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });
export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
export const forgotSchema = z.object({ email: z.string().email() });
export const resetSchema = z.object({ token: z.string(), password: z.string().min(8), confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"] });
```

```ts
// src/modules/auth/auth.service.ts
import { auth } from "./auth.config";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auditLog } from "@/modules/platform/audit/audit.service";
import { registerSchema } from "./schemas";

// Server-owned registration: validates consent/phone/password, creates the
// user + credential account through better-auth (which also queues the
// verification email via the auth.config callback), records consent and audit.
export async function registerMember(input: {
  full_name: string; email: string; phone?: string; password: string;
  church?: string; age_range?: string; gender?: string; consent: boolean;
}, ctx: { ip?: string | null; userAgent?: string | null; headers?: Headers } = {}) {
  const parsed = registerSchema.parse(input); // throws on consent / phone / password mismatch
  const email = parsed.email.toLowerCase().trim();
  const res = await auth.api.signUpEmail({
    body: {
      email, password: parsed.password, name: parsed.full_name,
      phone: parsed.phone, church: parsed.church, age_range: parsed.age_range, gender: parsed.gender,
    },
    headers: ctx.headers, // sets the session cookie when called from a route handler
  });
  const user = res.user;
  await db.update(users)
    .set({ consent_at: new Date(), status: "active" })
    .where(eq(users.id, user.id));
  await auditLog(db, {
    actor_user_id: user.id, action: "user.register", entity_type: "users", entity_id: user.id,
    ip: ctx.ip, user_agent: ctx.userAgent,
  });
  return { user, session: res.session };
}

// Email verification itself is handled by better-auth:
//   - token generation + validation live in the `verification` table
//   - email delivery is the auth.config `sendVerificationEmail` callback,
//     which enqueues our react-email template through the notifications outbox
// The public page (Task 19) only reads the ?error= / success state from the
// better-auth redirect; there is no hand-rolled verify endpoint.
```

Add a thin route `src/app/api/auth/register/route.ts` that accepts the form POST, calls `registerMember` with the request headers, and returns the result — this keeps consent, phone validation and audit in one server-owned place rather than calling better-auth's `/sign-up/email` directly from the client (ARC-02/04).

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/modules/auth/auth.service.ts src/modules/auth/schemas.ts tests/integration/auth-register.test.ts
git commit -m "feat: member registration with consent, phone validation, email verification (AUTH-01/02/03, PRV-02)"
```

---

## Task 16: `AuthService` — login, logout, password reset, suspension

**Files:**
- Modify: `src/modules/auth/auth.service.ts`
- Test: `tests/integration/auth-login.test.ts`

**Interfaces:**
- Produces: `loginMember(input, ctx)`, `logoutSession(headers)`, `requestPasswordReset(email)`, `resetPassword(input)`, `suspendUser(id)`, `restoreUser(id)`, `revokeAllSessions(userId)`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/auth-login.test.ts
import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { users, sessions, notifications } from "@/db/schema";
import { eq } from "drizzle-orm";
import { registerMember, loginMember, requestPasswordReset, resetPassword, suspendUser } from "@/modules/auth/auth.service";

async function makeUser(email: string) {
  return registerMember({ full_name: "T", email, password: "strong-pass-1", consent: true });
}
async function readResetToken(email: string) {
  const [mail] = await db.select().from(notifications)
    .where(eq(notifications.recipient, email));
  const url = String((mail.payload as { url: string }).url);
  return new URL(url).searchParams.get("token")!;
}

describe("login", () => {
  it("logs in and records last_login_at", async () => {
    const { user } = await makeUser("login@test.org");
    const res = await loginMember({ email: "login@test.org", password: "strong-pass-1" });
    expect(res.user.id).toBe(user.id);
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.last_login_at).toBeInstanceOf(Date);
  });
  it("rejects suspended users and revokes their sessions", async () => {
    const { user } = await makeUser("susp@test.org");
    await loginMember({ email: "susp@test.org", password: "strong-pass-1" });
    await suspendUser(user.id, { actorId: null, ip: null });
    await expect(loginMember({ email: "susp@test.org", password: "strong-pass-1" }))
      .rejects.toThrow(/suspended|deactivated/i);
    const rows = await db.select().from(sessions).where(eq(sessions.user_id, user.id));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.revoked_at)).toBe(true);
  });
  it("gives a generic outcome for unknown emails on password reset", async () => {
    await expect(requestPasswordReset("nobody@test.org")).resolves.not.toThrow();
  });
  it("resets a password via the emailed token and revokes other sessions", async () => {
    await makeUser("reset@test.org");
    const before = await loginMember({ email: "reset@test.org", password: "strong-pass-1" });
    await requestPasswordReset("reset@test.org");
    const token = await readResetToken("reset@test.org");
    await resetPassword({ token, newPassword: "new-strong-2" });
    await expect(loginMember({ email: "reset@test.org", password: "strong-pass-1" })).rejects.toThrow();
    expect(await loginMember({ email: "reset@test.org", password: "new-strong-2" })).toBeTruthy();
    // the pre-reset session was revoked
    const rows = await db.select().from(sessions).where(eq(sessions.user_id, before.user.id));
    expect(rows.every((r) => r.revoked_at)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement (append to `auth.service.ts`)**

```ts
export async function loginMember(input: { email: string; password: string }, ctx: { ip?: string | null; headers?: Headers } = {}) {
  const email = input.email.toLowerCase().trim();
  const [row] = await db.select().from(users).where(eq(users.email, email));
  if (row && row.status !== "active") {
    await revokeAllSessions(row.id);
    throw new Error("Account suspended or deactivated");
  }
  try {
    const res = await auth.api.signInEmail({ body: { email, password: input.password }, headers: ctx.headers });
    await db.update(users).set({ last_login_at: new Date() }).where(eq(users.id, res.user.id));
    return { user: res.user, session: res.session };
  } catch {
    throw new Error("Invalid email or password"); // generic — no user enumeration (SEC-06)
  }
}

export async function logoutSession(headers: Headers) {
  await auth.api.signOut({ headers });
}

export async function revokeAllSessions(userId: string) {
  await db.update(sessions).set({ revoked_at: new Date() })
    .where(and(eq(sessions.user_id, userId), isNull(sessions.revoked_at)));
}

// better-auth generates and validates the token in the `verification` table and
// calls our auth.config `sendResetPassword` callback (which enqueues the email)
// only when the email exists — a generic outcome either way (AUTH-05/SEC-09).
export async function requestPasswordReset(email: string) {
  await auth.api.requestPasswordReset({
    body: { email: email.toLowerCase().trim(), redirectTo: "/reset-password" },
  });
}

export async function resetPassword(input: { token: string; newPassword: string }) {
  await auth.api.resetPassword({ body: { token: input.token, newPassword: input.newPassword } });
  // revokeSessionsOnPasswordReset: true in auth.config invalidates other sessions (SEC-02)
  await auditLog(db, { action: "user.password_reset", entity_type: "users", changes: { via: "email_token" } });
}

export async function suspendUser(id: string, ctx: { actorId: string | null; ip: string | null }) {
  await db.transaction(async (tx) => {
    await tx.update(users).set({ status: "suspended", updated_at: new Date() }).where(eq(users.id, id));
    await auditLog(tx, { actor_user_id: ctx.actorId, action: "user.suspend", entity_type: "users", entity_id: id, ip: ctx.ip });
  });
  await revokeAllSessions(id);
}

export async function restoreUser(id: string, ctx: { actorId: string; ip: string | null }) {
  await db.transaction(async (tx) => {
    await tx.update(users).set({ status: "active", updated_at: new Date() }).where(eq(users.id, id));
    await auditLog(tx, { actor_user_id: ctx.actorId, action: "user.restore", entity_type: "users", entity_id: id, ip: ctx.ip });
  });
}
```

Add `isNull` to the `drizzle-orm` import at the top of the file, and import `sessions`, `and` alongside `eq`.

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/modules/auth/auth.service.ts tests/integration/auth-login.test.ts
git commit -m "feat: login, logout, password reset, suspension with session revocation (AUTH-04/05/06, SEC-06/09)"
```

---

## Task 17: Route-protection middleware

**Files:**
- Create: `src/middleware.ts`
- Test: `tests/e2e/route-guard.spec.ts` (Playwright)

**Interfaces:**
- Produces: Next middleware guarding `/admin/*` (staff + per-route permission) and member-only routes (later phases).

- [ ] **Step 1: Write the failing test**

```ts
// tests/e2e/route-guard.spec.ts
import { test, expect } from "@playwright/test";
test("visitor is redirected from /admin to /login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
});
```

- [ ] **Step 2: Run to verify failure** — `pnpm e2e tests/e2e/route-guard.spec.ts` → FAIL (no middleware; admin 404s instead of redirecting).

- [ ] **Step 3: Implement**

```ts
// src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/modules/auth/auth.config";

const ADMIN_PERMISSIONS: Record<string, string> = {
  "/admin/users": "members.read",
  "/admin/users/staff": "staff.read",
  "/admin/users/roles": "roles.read",
  "/admin/settings": "settings.read",
  "/admin/audit-logs": "audit_logs.read",
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/admin")) return NextResponse.next();

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }
  // Per-route permission check is also enforced server-side in each page (PERM-01).
  const required = Object.entries(ADMIN_PERMISSIONS).find(([p]) => pathname.startsWith(p))?.[1];
  if (required) {
    const { loadPermissions, can } = await import("@/modules/auth/rbac.service");
    const perms = await loadPermissions(session.user.id);
    if (!can(perms, required)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/middleware.ts tests/e2e/route-guard.spec.ts
git commit -m "feat: middleware route protection for /admin (SEC-07, PERM-01)"
```

---

## Task 18: shadcn/ui setup + shared primitives

**Files:**
- Create: `components.json`, `src/components/ui/*` (button, input, label, dialog, dropdown-menu, table, sonner, badge, select, form), `src/components/shared/{data-table,form-shell,empty-state,error-state,loading-skeleton,sonner-toaster}.tsx`
- Test: `tests/e2e/primitives.spec.ts`

**Interfaces:**
- Produces: the reusable UX catalogue used by every admin page. `DataTable<T>` accepts columns + a row-fetcher; `FormShell` wires Zod schemas to `react-hook-form` with inline errors.

- [ ] **Step 1: Install shadcn primitives**

```bash
pnpm dlx shadcn@latest init -d
pnpm dlx shadcn@latest add button input label dialog dropdown-menu table sonner badge select form
```
Confirm `components.json` uses `src/components/ui`, `@/components`, and the Tailwind v4 CSS-variable theme from `globals.css` (override `tailwind.config` only if the CLI writes a conflicting one).

- [ ] **Step 2: Implement shared primitives**

```tsx
// src/components/shared/data-table.tsx
"use client";
import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function DataTable<TData, TValue>({ columns, data }: { columns: ColumnDef<TData, TValue>[]; data: TData[] }) {
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });
  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((hg) => (
          <TableHead key={hg.id}>
            {hg.headers.map((h) => <span key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</span>)}
          </TableHead>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id}>
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```
`pnpm add @tanstack/react-table react-hook-form @hookform/resolvers`

```tsx
// src/components/shared/empty-state.tsx
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-card p-10 text-center">
      <p className="font-headline-sm text-headline-sm text-text-primary">{title}</p>
      {description && <p className="font-body-sm text-body-sm text-on-surface-variant">{description}</p>}
      {action}
    </div>
  );
}
```
Write `error-state.tsx` (retry button), `loading-skeleton.tsx` (Tailwind `animate-pulse` blocks), and `sonner-toaster.tsx` (thin wrapper over `sonner`'s `Toaster`, mounted in the root layout), following the same pattern. `FormShell` is a typed wrapper: takes a Zod schema and a submit handler, renders children with `react-hook-form` context, shows inline errors under fields, and disables submit while pending.

- [ ] **Step 3: Write the e2e test**

```ts
// tests/e2e/primitives.spec.ts
import { test, expect } from "@playwright/test";
test("empty state renders title and action", async ({ page }) => {
  await page.goto("/_primitives-preview"); // a temporary dev-only route you add for this test
  await expect(page.getByText("No items yet")).toBeVisible();
});
```
Add a temporary `src/app/_primitives-preview/page.tsx` rendering `<EmptyState title="No items yet" />`. Delete this route before the phase closes.

- [ ] **Step 4: Run tests** → PASS. Manually verify components render in the dark theme.

- [ ] **Step 5: Commit**
```bash
git add components.json src/components tests/e2e/primitives.spec.ts
git commit -m "feat: shadcn/ui on Luminous Sanctuary tokens + shared primitives (ADM-04/05, ARC-05)"
```

---

## Task 19: Public auth pages

**Files:**
- Create: `src/app/(auth)/layout.tsx`, `login/page.tsx`, `register/page.tsx`, `verify-email/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`
- Test: `tests/e2e/auth-flows.spec.ts`

**Interfaces:**
- Consumes: `loginMember`, `registerMember`, `verifyEmail`, `requestPasswordReset`, `resetPassword`, `registerSchema`/`loginSchema`/`resetSchema`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/e2e/auth-flows.spec.ts
import { test, expect } from "@playwright/test";
test("register then login", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel(/full name/i).fill("Grace Okafor");
  await page.getByLabel(/email/i).fill("grace@e2e.test");
  await page.getByLabel(/^password/i).fill("strong-pass-1");
  await page.getByLabel(/confirm password/i).fill("strong-pass-1");
  await page.getByLabel(/consent/i).check();
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/login|\/verify-email/);
});
test("register validation blocks missing consent", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page.getByText(/consent is required/i)).toBeVisible();
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

`login/page.tsx` and `register/page.tsx` are client components using `FormShell` with the matching Zod schema, calling `POST /api/auth/...` (better-auth's own endpoints) or thin app routes. Use the design system: pill inputs (`rounded-full bg-surface-elevated`), violet primary button, ambient glow behind a centered card on `surface-base`. All fields labelled; errors in `aria-live`; input preserved on failure (native inputs + `react-hook-form` defaults).

`verify-email/page.tsx` reads `?token=` and calls `verifyEmail`, showing pending → success / invalid states with `aria-live`. `forgot-password/page.tsx` posts the email and always shows "If that email exists, a reset link has been sent." `reset-password/page.tsx` reads `?token=`, renders password + confirm, calls `resetPassword`, then redirects to `/login`.

- [ ] **Step 4: Run tests** → PASS. Verify at 360px width in the Playwright UI mode.

- [ ] **Step 5: Commit**
```bash
git add "src/app/(auth)" tests/e2e/auth-flows.spec.ts
git commit -m "feat: public auth pages — login, register, verify, forgot/reset (AUTH-01..05, A11Y-04)"
```

---

## Task 20: Admin shell + navigation

**Files:**
- Create: `src/app/admin/layout.tsx`, `src/components/shared/admin-sidebar.tsx`, `src/components/shared/admin-topbar.tsx`, `src/lib/server-session.ts`
- Test: `tests/e2e/admin-shell.spec.ts`

**Interfaces:**
- Produces: `getCurrentSession()` server helper returning `{ user, permissions }`; admin layout that renders nav by permission.

- [ ] **Step 1: Write the failing test**

```ts
// tests/e2e/admin-shell.spec.ts
import { test, expect } from "@playwright/test";
test("staff sees permitted nav only", async ({ page }) => {
  await loginAsStaff(page, "content_manager"); // helper: seeds user + role, signs in
  await page.goto("/admin");
  await expect(page.getByRole("link", { name: /sermons/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /transactions/i })).toHaveCount(0);
});
test("admin is noindex", async ({ page }) => {
  await loginAsStaff(page, "admin");
  await page.goto("/admin");
  const meta = page.locator('meta[name="robots"]');
  await expect(meta).toHaveAttribute("content", /noindex/i);
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/server-session.ts
import { auth } from "@/modules/auth/auth.config";
import { loadPermissions } from "@/modules/auth/rbac.service";

export async function getCurrentSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const permissions = await loadPermissions(session.user.id);
  return { user: session.user, session, permissions };
}
```
(`headers` from `next/headers`.)

`admin/layout.tsx` is an async server component: calls `getCurrentSession()`; if null → `redirect("/login")`; renders `metadata = { robots: { index: false } }` (ADM-01, SEO-06), the sidebar/topbar, and `{children}`. `admin-sidebar.tsx` takes `permissions` and renders nav items filtered by `can(perms, key)` — Dashboard (always for staff), plus entries keyed to their permission. Items for modules not yet built (Sermons, Quizzes, Transactions) render disabled with a "Coming soon" tooltip so the shell looks complete; they activate in their phases.

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/app/admin/layout.tsx src/components/shared/admin-*.tsx src/lib/server-session.ts tests/e2e/admin-shell.spec.ts
git commit -m "feat: admin shell with permission-aware navigation (ADM-01/02, SEC-07)"
```

---

## Task 21: Admin dashboard + users/staff/roles pages

**Files:**
- Create: `src/app/admin/page.tsx`, `admin/users/page.tsx`, `admin/users/[id]/page.tsx`, `admin/users/staff/page.tsx`, `admin/users/roles/page.tsx`, plus `src/modules/platform/users/users.service.ts`
- Test: `tests/e2e/admin-users.spec.ts`

**Interfaces:**
- Produces: `listMembers(filters)`, `getMember(id)`, `inviteStaff(email, roleKey)`, `listStaff()`, `listRolesWithPermissions()`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/e2e/admin-users.spec.ts
import { test, expect } from "@playwright/test";
test("admin lists and suspends a member", async ({ page }) => {
  await loginAsStaff(page, "admin");
  await page.goto("/admin/users");
  await page.getByRole("textbox").fill("grace@e2e.test");
  await expect(page.getByText("Grace Okafor")).toBeVisible();
  await page.getByRole("button", { name: /suspend/i }).first().click();
  await expect(page.getByText(/suspended/i)).toBeVisible();
});
test("super admin can invite staff; admin cannot open the page", async ({ page }) => {
  await loginAsStaff(page, "super_admin");
  await page.goto("/admin/users/staff");
  await expect(page.getByRole("heading", { name: /staff/i })).toBeVisible();
  // content_manager has no staff.read
  await loginAsStaff(page, "content_manager");
  await page.goto("/admin/users/staff");
  await expect(page).not.toHaveURL(/\/admin\/users\/staff$/);
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

`users.service.ts`: `listMembers({ search, status, verified, page })` (paginated, indexed on `status` + lower(email)), `getMember(id)` with attempts/transactions counts stubbed to zero until later phases, `inviteStaff(email, roleKey, actorId)` (creates `staff_invite` token + enqueues notification + audit log), `listStaff()` (users with any staff role via `user_roles` join), `listRolesWithPermissions()`.

`admin/page.tsx`: foundation dashboard cards — registered members count with verified/unverified split, staff accounts count, recent registrations table, and a warnings panel (email failures count from `notifications` where `status='failed'`, last cron run). Content/giving/quiz cards are rendered as "available after Phase X" placeholders per the spec.

`users/page.tsx` + `users/[id]/page.tsx`: `DataTable` list with search/filters, detail page with profile + actions (suspend/restore, resend verification, trigger password reset, export CSV of the current filter — prefix cells starting with `=`,`+`,`-`,`@` per CSV-11 even though giving exports are the real target).

`users/staff/page.tsx` (super_admin only, `requirePermission(perms, "staff.invite")`): invite form (email + role select) and staff table with role assignment/removal. Enforce PERM-02: removing a `super_admin` role is rejected if it is the user's only super_admin role and they are the last active super admin. `users/roles/page.tsx`: roles with their permission keys; editing a role's permissions is allowed and audit-logged (USR-04).

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/app/admin src/modules/platform/users tests/e2e/admin-users.spec.ts
git commit -m "feat: admin dashboard, members, staff invites, roles (USR-01..04, PERM-02/03)"
```

---

## Task 22: Admin settings + audit logs pages

**Files:**
- Create: `src/app/admin/settings/page.tsx`, `admin/audit-logs/page.tsx`, `src/app/api/admin/settings/route.ts`
- Test: `tests/e2e/admin-settings.spec.ts`

**Interfaces:**
- Consumes: `getSetting`/`setSetting`/`maskSetting`, `auditLog`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/e2e/admin-settings.spec.ts
import { test, expect } from "@playwright/test";
test("settings tabs save a non-secret value", async ({ page }) => {
  await loginAsStaff(page, "admin");
  await page.goto("/admin/settings");
  await page.getByLabel(/church name/i).fill("MOVALDEM Test");
  await page.getByRole("button", { name: /save/i }).click();
  await expect(page.getByText(/saved/i)).toBeVisible();
});
test("secrets are write-only and masked", async ({ page }) => {
  await loginAsStaff(page, "super_admin");
  await page.goto("/admin/settings");
  await page.getByLabel(/smtp/i).fill("smtp://user:pass@mail");
  await page.getByRole("button", { name: /save/i }).click();
  await page.reload();
  await expect(page.getByLabel(/smtp/i)).toHaveValue(/••••/);
});
test("audit logs are read-only", async ({ page }) => {
  await loginAsStaff(page, "super_admin");
  await page.goto("/admin/audit-logs");
  await expect(page.getByText(/user\.register/)).toBeVisible();
  await expect(page.getByRole("button", { name: /delete/i })).toHaveCount(0);
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

`settings/page.tsx`: tabbed form (General, Branding, Content, SEO, Email, Storage, Security, Privacy) reading current values with `getSetting` and writing via `POST /api/admin/settings` which calls `requirePermission` for the group (`settings.update` for admin; super_admin for SMTP/storage/Paystack-adjacent secrets). Secret inputs render masked (`maskSetting`) and write-only: the field is `type="password"` and an empty submit means "unchanged". Every save audit-logs the change with `redactSecrets` applied (SEC-11, PRD 08 §6).

`audit-logs/page.tsx`: filters (actor, action, entity, date range) over `auditLogs` with `DataTable`, CSV export for super_admin only, and no edit/delete controls anywhere (AUD-01/02).

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/app/admin/settings src/app/admin/audit-logs src/app/api/admin/settings tests/e2e/admin-settings.spec.ts
git commit -m "feat: admin settings (write-only secrets) and read-only audit logs (PRD 08 §6, AUD-01/02)"
```

---

## Task 23: Rate limiting

**Files:**
- Create: `src/lib/ratelimit.ts`
- Modify: `src/modules/auth/auth.service.ts` (login, register, reset endpoints)
- Test: `tests/integration/ratelimit.test.ts`

**Interfaces:**
- Produces: `rateLimit(key, { limit, window })` returning `{ success }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/integration/ratelimit.test.ts
import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/ratelimit";
describe("rateLimit", () => {
  it("blocks after the limit", async () => {
    for (let i = 0; i < 5; i++) expect((await rateLimit(`test:${i % 1}`, { limit: 3, window: "60 s" })).success).toBe(i < 3);
  });
});
```
(Requires `UPSTASH_REDIS_REST_URL`/`TOKEN` in CI; skip with a local in-memory fallback when absent so local dev and CI-without-redis still pass.)

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/ratelimit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

let limiter: Ratelimit | null = null;
const memory = new Map<string, { count: number; reset: number }>();

export async function rateLimit(key: string, opts: { limit: number; window: `${number} s` | `${number} m` }) {
  if (env().UPSTASH_REDIS_REST_URL && env().UPSTASH_REDIS_REST_TOKEN) {
    if (!limiter) limiter = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(opts.limit, opts.window) });
    return limiter.limit(key);
  }
  // Local/CI fallback (single instance only)
  const now = Date.now();
  const win = parseInt(opts.window) * 1000;
  const cur = memory.get(key);
  if (!cur || cur.reset < now) { memory.set(key, { count: 1, reset: now + win }); return { success: true }; }
  cur.count++;
  return { success: cur.count <= opts.limit };
}
```
Wire into login (5 / minute per IP + per email), register (5 / hour per IP), forgot-password (3 / hour per email), and staff-invite (10 / hour per admin) — SEC-05/06.

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/ratelimit.ts tests/integration/ratelimit.test.ts
git commit -m "feat: rate limiting on auth endpoints with Upstash + local fallback (SEC-05/06)"
```

---

## Task 24: CI pipeline + Phase 1 acceptance e2e

**Files:**
- Create: `.github/workflows/ci.yml`, `tests/e2e/acceptance.spec.ts`, `tests/integration/setup.ts`
- Modify: `playwright.config.ts`, `vitest.config.ts`
- Test: the suite itself.

**Interfaces:**
- Produces: green CI running lint → typecheck → unit+integration → build → e2e against a migrated+seeded test database.

- [ ] **Step 1: Write the acceptance e2e**

```ts
// tests/e2e/acceptance.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Phase 1 acceptance stories", () => {
  test("S1: migrations+seeds yield 5 roles and one super admin", async () => {
    // asserted by tests/integration/seed.test.ts in the same CI run
  });
  test("S2: super admin logs in and sees the dashboard", async ({ page }) => {
    await loginAsStaff(page, "super_admin");
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
  });
  test("S3: super admin invites staff; invitee sets password", async ({ page, request }) => {
    await loginAsStaff(page, "super_admin");
    await page.goto("/admin/users/staff");
    await page.getByLabel(/email/i).fill("invited@e2e.test");
    await page.getByRole("button", { name: /invite/i }).click();
    const link = await readOutboxLink("invited@e2e.test"); // test helper reading the DB notifications row
    await page.goto(link);
    await page.getByLabel(/^password/i).fill("invited-pass-9");
    await page.getByLabel(/confirm/i).fill("invited-pass-9");
    await page.getByRole("button", { name: /set password/i }).click();
    await login(page, "invited@e2e.test", "invited-pass-9");
    await expect(page).toHaveURL(/\/admin/);
  });
  test("S5: suspended member cannot log in", async ({ page }) => { /* suspend via admin, assert login rejected */ });
  test("S6/S7: permission denial", async ({ page }) => { /* content_manager at /admin/users → denied */ });
});
```

- [ ] **Step 2: Run to verify failure** → FAIL.

- [ ] **Step 3: Implement CI**

```yaml
# .github/workflows/ci.yml
name: CI
on: { push: { branches: [main] }, pull_request: }
jobs:
  test:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: ${{ secrets.TEST_DATABASE_URL }}
      APP_SECRET: ${{ secrets.APP_SECRET }}
      IP_HASH_SALT: ${{ secrets.IP_HASH_SALT }}
      CRON_SECRET: ${{ secrets.CRON_SECRET }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm exec drizzle-kit migrate
      - run: pnpm db:seed
      - run: pnpm test
      - run: pnpm build
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm e2e
```

`vitest.config.ts`: alias `@` → `src`, include `tests/unit` + `tests/integration`, `setupFiles: ["./tests/integration/setup.ts"]` (runs migrations against the test branch and truncates between files).

- [ ] **Step 4: Run the whole suite locally** — `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e` → all green.

- [ ] **Step 5: Commit**
```bash
git add .github tests/e2e/acceptance.spec.ts tests/integration/setup.ts vitest.config.ts playwright.config.ts
git commit -m "ci: lint/typecheck/test/build/e2e pipeline + phase-1 acceptance stories (PRD 10 §5)"
```

---

## Task 25: Documentation and sign-off

**Files:**
- Create: `README.md`, `docs/ASSUMPTIONS.md`
- Test: none (documentation).

- [ ] **Step 1: Write `README.md`** — project overview, how to run (`pnpm install`, `.env.local` from `.env.example`, `pnpm db:migrate`, `pnpm db:seed`, `SUPERADMIN_* pnpm db:create-superadmin`, `pnpm dev`), scripts table, and where the PRD pack and spec live.

- [ ] **Step 2: Write `docs/ASSUMPTIONS.md`** — every deviation and default: A1–A9 from the spec (2FA eliminated, design system supersedes placeholder branding, Neon+Drizzle, better-auth with data-driven RBAC, Upstash, react-email/nodemailer, Vercel Cron, `avatar_media_id` deferred, superadmin CLI), plus: credentials live in better-auth's `account` table (no `users.password_hash`); better-auth owns the `verification` table for email-verify/password-reset tokens while `auth_tokens` holds staff invites only; `users.image` added as a better-auth core field; `sessions` gained `created_at`/`updated_at`; `users.consent_at` is nullable (enforced by the registration schema).

- [ ] **Step 3: Verify the Phase 1 exit criteria** — run through PRD 10 §2 for Phase 1: *Super Admin can log in, create staff, and see an empty dashboard. Permission checks tested. Migrations and seeds run from scratch.* Confirm green.

- [ ] **Step 4: Commit**
```bash
git add README.md docs/ASSUMPTIONS.md
git commit -m "docs: README + assumptions log for Phase 1 (PRD 10 rules 3, 9, 15)"
```

---

## Self-Review Notes

- **Spec coverage:** scaffold (§3) → Tasks 1–4; design system (§4) → Task 3 + 18; data model (§5) → Tasks 4–7; auth/RBAC (§6) → Tasks 8–10, 15–17, 19, 23; platform services (§7) → Tasks 11–14; admin shell (§8) → Tasks 18, 20–22; testing/DoD (§9) → Task 24 (plus per-task tests); docs (§10) → Task 25.
- **Type consistency:** `loadPermissions(userId, db?)` returns `Set<string>`; `can(perms, key)` / `requirePermission(perms, key)` used identically in middleware, `server-session.ts` and admin pages. `auditLog(tx, input)` and `enqueueNotification(tx, input)` always take the caller's transaction client. `getSetting<T>(db, key, fallback?)` / `setSetting(db, key, value, opts)` signatures are stable from Task 12 onward.
- **Known follow-ups (not placeholders — explicit Phase 2+ work):** password-reset and staff-invite templates are registered in the worker's `TEMPLATES` map in their own tasks; disabled admin nav items activate when their modules ship; giving/quiz settings tabs arrive with those modules.
