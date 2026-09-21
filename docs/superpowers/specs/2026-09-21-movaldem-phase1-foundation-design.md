# MOVALDEM Phase 1 — Foundation: Design Spec

**Date:** 2026-09-21
**Status:** Approved — all sections reviewed with stakeholder
**Project:** MOVALDEM Digital Ministry Platform (Mountain of Victory at the Last Day Evangelical Ministry)
**Phase:** 1 of 7 (Foundation)
**Sources:** PRD pack `prd/00-README.md` … `prd/10-delivery-plan-and-acceptance.md`, UI design system `ui/DESIGN.md` + `ui/code.html`

---

## 1. Context and Decisions Summary

MOVALDEM is a digital ministry hub: public church website, CMS for teaching content, Paystack online giving, and a Bible quiz platform with leaderboards. The full PRD pack decomposes delivery into 7 phases; this spec covers **Phase 1 (Foundation)** only — the base every later phase stands on. Later phases each get their own spec → plan → build cycle.

Stakeholder decisions made during brainstorming (these override the PRD where they differ, and are recorded in `docs/ASSUMPTIONS.md`):

| # | Decision | Detail |
|---|---|---|
| D1 | Stack | Next.js 15 (App Router, TypeScript strict) + PostgreSQL (PRD default). |
| D2 | Database / ORM | **Neon** serverless PostgreSQL + **Drizzle ORM** with `drizzle-kit`. Pure Postgres, so the PRD's full-text search, partial indexes and JSON snapshots work unmodified. |
| D3 | Auth library | **better-auth** for authentication plumbing, wrapped in our own `AuthService`. Its `access`/`admin` RBAC plugins are **not** used — the PRD requires roles/permissions as data in tables (PRD 03), so our own `RbacService` reads them. |
| D4 | **2FA eliminated** | Two-factor authentication is removed entirely, not deferred: requirement AUTH-08 is dropped, `users.totp_secret_enc` and the `auth.require_2fa_for_staff` setting are not implemented. |
| D5 | Roles | All 5 PRD roles seeded (member, content_manager, quiz_manager, admin, super_admin) with the full permission matrix. RBAC is data-driven, so extra roles cost nothing; separation of duties protects donor data and Paystack access. Roles are assigned only when the person exists. |
| D6 | Runtime / hosting | **Vercel** for the app; Neon for dev + prod databases; media storage decided in Phase 2 (local disk in dev). Background jobs via **Vercel Cron** over a table-backed queue. |
| D7 | UI foundation | **Tailwind CSS v4 + shadcn/ui**, themed with the supplied `ui/DESIGN.md` design system ("Luminous Sanctuary"), dark-mode-first. |
| D8 | Rate limiting | **Upstash Ratelimit** (Vercel-native, works across instances; adds `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` env vars). |
| D9 | Email | **react-email** templates + **nodemailer** SMTP adapter (PRD's provider-agnostic SMTP choice; resolves open question Q8). |
| D10 | Design source of truth | `ui/DESIGN.md` + `ui/code.html` supersede the PRD's "placeholder branding" (resolves open question Q1). Gradient usage in the template relaxes PRD 04's "avoid heavy gradients" — the supplied branding wins. |

Architecture style: **modular monolith** (PRD ARC-01/02) — `src/modules/{auth,platform,…}` with business logic in services; `app/api` handlers stay thin and delegate.

---

## 2. Phase 1 Scope

**In scope:**

- Project scaffold, tooling, CI, environment configuration
- Database schema, migrations, and seeders for identity, access, and platform tables
- Authentication: member registration, email verification, login, password reset, logout, staff invite
- RBAC: data-driven roles/permissions, server-side enforcement, middleware, permission-aware admin navigation
- Audit logging service (append-only, transactional)
- Settings service (grouped, encrypted secrets, write-only in UI)
- Notification service + email adapter with a table-backed queue processed by a cron worker
- Admin shell: layout, permission-aware navigation, dashboard (foundation cards only), users management, staff management, roles viewer, settings, audit logs
- Public auth pages (login, register, verify-email, forgot-password, reset-password)
- The design system ported from `ui/` into Tailwind v4 + `next/font` + Material Symbols
- Test suite: unit, integration (real test database), e2e (Playwright), security checks

**Out of scope for Phase 1** (arrive in later phases; module *boundaries* may be created, but no tables or features):

- Public website pages, homepage, About/Leadership (Phase 3)
- Content types: sermons, Bible studies, Sunday school, series, categories, tags (Phase 2)
- Media library and uploads (Phase 2)
- Events, programmes, gallery (Phase 3)
- Giving, Paystack, projects, receipts (Phase 4)
- Quiz engine, categories/questions, attempts, leaderboards (Phases 5–6)
- Global search, sitemap/robots/JSON-LD, sharing, performance pass (Phase 7)
- 2FA (eliminated entirely — D4)

**Phase 1 exit criteria** (PRD 10 §2): *Super Admin can log in, create staff, and see an empty dashboard. Permission checks tested. Migrations and seeds run from scratch.*

---

## 3. Project Structure and Tooling

```text
/
├── src/
│   ├── app/
│   │   ├── (auth)/         login, register, verify-email, forgot/reset-password
│   │   ├── admin/          admin shell (Phase 1)
│   │   ├── api/            route handlers (auth, cron, webhooks later)
│   │   ├── layout.tsx
│   │   └── globals.css     design tokens as CSS variables
│   ├── components/
│   │   ├── ui/             shadcn primitives themed to Luminous Sanctuary
│   │   └── shared/         EmptyState, ErrorState, LoadingSkeleton, Toast, FormShell, DataTable
│   ├── modules/
│   │   ├── auth/           auth.config.ts (better-auth), AuthService, RbacService
│   │   └── platform/       settings, audit, notifications
│   ├── lib/                money, date/time (Africa/Lagos), validation (Zod), errors, ip-hash
│   ├── jobs/               cron worker + queue processing
│   └── db/                 schema.ts, client (drizzle), migrations dir link
├── drizzle/
│   ├── migrations/
│   └── seeders/            roles, permissions, role_permissions, settings defaults
├── tests/                  unit | integration | e2e
├── docs/                   PRD pack (symlink/copy), ASSUMPTIONS.md, this spec
├── .env.example
├── vercel.json             cron schedule + CRON_SECRET
└── package.json            pnpm
```

**Tooling:** pnpm; Next.js 15 + React 19; TypeScript strict; Drizzle + drizzle-kit; better-auth; Zod (validation shared client/server); Tailwind v4; shadcn/ui; Material Symbols; next/font; Vitest; Playwright; ESLint + Prettier; GitHub Actions CI (install → lint → typecheck → test → build) + `pnpm audit` / Dependabot (SEC-12).

**Environment variables** (validated with a Zod schema at boot — fail fast if a required var is missing; PRD 02 §5):

`DATABASE_URL`, `APP_URL`, `APP_SECRET`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY`, `STORAGE_DRIVER`, `STORAGE_BUCKET`, `STORAGE_ENDPOINT`, `STORAGE_KEY`, `STORAGE_SECRET`, `CDN_BASE_URL`, `SMTP_URL`, `MAIL_FROM`, `IP_HASH_SALT`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `CRON_SECRET`. Local dev uses `.env.local`; no secret is ever committed.

**Discipline:** only `modules/*/` own tables and business rules (ARC-01); one implementation per business rule (ARC-03); `app/api` handlers validate input, check permission, and delegate to a service (ARC-02); the client is never trusted for any control (ARC-04).

---

## 4. Design System (from `ui/`)

`ui/DESIGN.md` ("Luminous Sanctuary") and its reference implementation `ui/code.html` are the visual source of truth.

- **Tokens → Tailwind v4 theme** as CSS variables, verbatim from `DESIGN.md`: surfaces `surface-base #0D0D11`, `surface-card #13141B`, `surface-elevated #1B1D27`, `surface-highlight #242735`; primary `#8B5CF6`; secondary `#A855F7`; tertiary/gold `#F59E0B` (reserved for giving CTAs, live indicators, quiz achievements); `border-subtle`, `border-glow`, `gold-glow`; text `#FFFFFF` / `#9CA3AF` / `#6B7280`.
- **Type scale utilities**: `text-display`, `text-headline-lg/md/sm`, `text-title-md`, `text-body-lg/md/sm`, `text-label-lg/sm` with matching `font-*` families — display/title/label in **Plus Jakarta Sans**, body in **Inter**.
- **Fonts self-hosted via `next/font`** (performance + privacy vs. the template's Google CDN).
- **Icons: Material Symbols Outlined** via the `material-symbols` package — no emoji-based UI (PRD D20).
- **Geometry**: pill buttons/chips/inputs (`rounded-full`), `rounded-xl` cards, ambient glow layers, glassmorphic sticky bars (`backdrop-filter: blur(16px)`). Dark-mode-first.
- **shadcn/ui on these tokens**: shadcn supplies functional primitives (data table, form, dialog, dropdown, toast, command palette); the tokens supply the look. This keeps the admin from reading as a generic SaaS dashboard.
- **Accessibility check (A11Y-06):** `on-surface-variant` and `text-muted` against dark surfaces must be verified at 4.5:1 contrast during implementation; adjust token usage (not the palette) if any pairing fails.

---

## 5. Data Model (Phase 1 tables only)

Conventions (PRD 09 §1): UUID PKs with `defaultRandom()`; `timestamptz` in UTC; soft delete via `deleted_at` where marked; money as integer kobo (no money columns in Phase 1, but `lib/money.ts` ships now); every FK indexed; Postgres `pgEnum` for status fields.

| Group | Table | Notes |
|---|---|---|
| Identity | `users` (SD) | PRD 09 fields **except `totp_secret_enc`** (D4) and `avatar_media_id` (deferred to Phase 2 when `media` exists). Email case-insensitive via `citext` extension + unique index. Fields: `full_name`, `email`, `phone` (E.164), `password_hash`, `email_verified_at`, `status` (`active`/`suspended`/`deactivated`), `church?`, `age_range?`, `gender?`, `leaderboard_display` (`full`/`abbreviated`, default `abbreviated`), `consent_at`, `last_login_at`, timestamps, `deleted_at`. |
| Access | `roles` | `key` unique, `name`, `description`, `is_system`. Seed: member, content_manager, quiz_manager, admin, super_admin. |
| Access | `permissions` | `key` unique, `resource.action`, `description`. Full matrix per PRD 03 §2 across resources: sermons, bible_studies, sunday_school+series, events, programmes+sessions, gallery, media, pages, quiz_categories, questions, quizzes, quiz_imports, attempts, leaderboards, quiz_reports, projects, transactions, giving_reports, members, staff, roles, contact_messages, settings, paystack-credentials, audit_logs. |
| Access | `role_permissions` | (`role_id`, `permission_id`) composite PK. |
| Access | `user_roles` | (`user_id`, `role_id`) composite PK + `assigned_by`, `assigned_at`. Effective permissions = union across a user's roles. |
| Tokens | `auth_tokens` | `type` (`email_verify`/`password_reset`/`staff_invite`), `token_hash`, `expires_at`, `used_at?`. |
| Sessions | `sessions` | `token_hash`, **`ip_hash`** (never raw IP — PRV-05), `user_agent`, `expires_at`, `revoked_at?`. |
| Platform | `settings` | `key` unique, `value` jsonb, `is_secret` (value encrypted at rest with `APP_SECRET`, AES-256-GCM), `updated_by`, `updated_at`. |
| Platform | `audit_logs` | `actor_user_id?`, `actor_role?`, `action`, `entity_type`, `entity_id?`, `changes` (jsonb, secrets redacted), `ip_hash`, `user_agent`, `created_at`. Append-only. |
| Platform | `notifications` | `channel` (`email`), `type`, `recipient`, `payload` jsonb, `status` (`queued`/`sent`/`failed`), `attempts`, `last_error?`, `created_at`, `sent_at?`. Doubles as the email queue. |

**better-auth mapping:** its Drizzle adapter is pointed at our tables with field names mapped (`name`→`full_name`, `emailVerified`→`email_verified_at`). It owns two tables of its own: `account` (credential password hashes — so `users` carries **no** `password_hash`) and `verification` (email-verify and password-reset tokens). Our `auth_tokens` table therefore holds staff-invite tokens only. Raw IP is hashed before it reaches better-auth's session field. Password hashing configured to **argon2id** (SEC-01). No OAuth/social tables — V1 is email/password only. Its `access`/`admin` RBAC plugins are **not** used, because the PRD requires roles/permissions as *data in tables* — our own `RbacService` reads them instead.

**Migrations & seeders:** `drizzle-kit generate` + `drizzle-kit migrate`; schema lives in `src/db/schema.ts`. Seeders create the 5 roles, the full permission key set, role-permission links per PRD 03 §2, Phase-1 settings defaults (PRD 08 §6, minus the 2FA setting), and **exactly one Super Admin** created only by a documented CLI script (`pnpm db:create-superadmin`) reading env values — never a hard-coded password.

**Test database:** a dedicated Neon dev branch; CI runs migrations + seeders from scratch.

---

## 6. Authentication and RBAC

better-auth handles plumbing (password hashing, session cookies, verification tokens); `AuthService` enforces the PRD's rules; `RbacService` handles authorization from our own tables.

### 6.1 `modules/auth/AuthService`

| Flow | Rules enforced |
|---|---|
| Register (member) | `full_name`, email, phone, password + confirm required; consent checkbox required (PRV-02, AUTH-01); email case-insensitive unique; phone validated Nigerian (`+234…` / `0…`) and normalised to E.164 (AUTH-02); argon2id, min length 8, common-password blocklist (SEC-01); queues verification email. |
| Verify email | Single-use hashed token; sets `email_verified_at`; `quiz.require_verified_email` gates quiz start in Phase 5 (AUTH-03). |
| Login | Email + password; suspended/deactivated rejected (AUTH-06); generic "invalid credentials" — no user enumeration (SEC-06); session rotation on login (SEC-02); staff redirected to `/admin` (AUTH-04). |
| Forgot / reset password | Generic response whether or not the email exists (AUTH-05, SEC-09); token hashed with 60-min default expiry; on successful reset, all other sessions for the user are revoked. |
| Staff invite | Super Admin only; `staff_invite` token; forced password set on first login (AUTH-07). |
| Profile / change password | Owner-only (AUTH-09); password change revokes other sessions. |
| Suspend / restore | Admin+; invalidates all existing sessions (AUTH-06); audit-logged. |
| Account deletion request | Anonymises personal fields; retains transaction and audit records; quiz records anonymised not removed (PRV-06). |

### 6.2 Security cross-cutting

- Cookies: HTTP-only, `SameSite=lax`, `Secure` (SEC-02).
- CSRF (SEC-03): Origin-header verification on state-changing routes + better-auth's CSRF token for form submissions.
- Rate limiting (SEC-05/06): Upstash Ratelimit on login, register, password-reset and future endpoints; exponential backoff / lockout after repeated login failures; generic errors.
- Sessions: expiry configurable; "log out everywhere" available for staff; session rotation on login and on privilege change.
- Passwords never logged; secrets never sent to the browser (SEC-11).

### 6.3 `modules/auth/RbacService`

- Loads a user's roles → permissions once per request (union) and caches for the request lifetime.
- `can(action)` / `requirePermission(action)` server helpers used in **every** route handler and admin page — deny by default; hidden URLs are never a control (PERM-01).
- Next.js middleware guards `/admin/*` (staff role + per-route permission) and member-only routes.
- Admin navigation items render from the same permission set as the server checks (ADM-02), so UI and server cannot drift.
- Guard rails: a user cannot remove their own last `super_admin` role — at least one active Super Admin always exists (PERM-02); role and permission changes are audit-logged (PERM-03).

### 6.4 Public auth pages

`src/app/(auth)/`: login, register, verify-email, forgot-password, reset-password — built on the Luminous Sanctuary system, mobile-first, fully accessible (labelled fields, associated error messages, `aria-live` for async status), input preserved on validation failure.

---

## 7. Platform Services and Jobs

### 7.1 `SettingsService` (`modules/platform/settings`)

Typed `get<T>(key)` / `set(key, value)` over the `settings` table with seeded defaults as fallback, so reads never crash on a missing key. Secrets (`is_secret`) are encrypted at rest with `APP_SECRET` (AES-256-GCM) and exposed in the UI only ever masked (`sk_live_••••1234`) and write-only (PRD 08 §6, SEC-11). Edits are permission-gated — quiz/leaderboard keys → quiz_manager; general keys → admin; Paystack/storage/SMTP credentials → super_admin only — and audit-logged with secret *values* never recorded (only "changed").

### 7.2 `AuditService` (`modules/platform/audit`)

Single `log()` writing append-only rows; **no update or delete method exists anywhere in the codebase** (AUD-02). It is called **within the same DB transaction** as the business action, so audit records commit or roll back atomically with the thing they describe. `changes` stores before/after JSON with known secret fields auto-redacted. Retention default 24 months as a setting (AUD-03).

### 7.3 `NotificationService` (`modules/platform/notifications`)

Channel-based (`email` in V1; SMS/WhatsApp/push plug in later without changing callers — PRD 08 §7). Uses the **outbox pattern**: services enqueue a `notifications` row (status `queued`) as part of their own transaction, so "send the receipt" can never be lost if the request dies (REL-01). Templates rendered with **react-email** (typed, branded, HTML + plaintext, settings-driven header/footer — NTF-02); delivered through a nodemailer SMTP adapter. Phase 1 templates: verify-email, password-reset, staff-invite, test-email.

### 7.4 Jobs (`src/jobs/`)

The `notifications` table *is* the Phase 1 queue. A worker endpoint `/api/cron/process-notifications` is hit by **Vercel Cron** (every minute, authenticated with a `CRON_SECRET` bearer). It claims queued rows with optimistic leasing (so duplicate cron invocations cannot double-send), sends with bounded retries/backoff, and marks `sent` / `failed` + `last_error` + `attempts`. Every job is idempotent and safe to run twice (REL-02). Phases 4+ reuse this exact queue+worker pattern for the publish scheduler, attempt expirer, period rollover and payment reconciler.

**Decoupling:** audit is a direct in-transaction call (integrity); notifications are outbox (resilience). A typed domain-event emitter (`user.registered`, `payment.succeeded`, …) is introduced only when a second module needs to react to the first — no speculative plumbing.

---

## 8. Admin Shell

`/admin` is `noindex` (ADM-01, SEO-06), guarded by middleware for a staff role plus the route's specific permission. Navigation items render per the user's permissions (ADM-02). Layout: collapsible sidebar (drawer on mobile), top bar with user menu, responsive and usable on phone/tablet for common tasks (ADM-03).

Reusable patterns built once here and reused by every later phase:

| Pattern | Primitives |
|---|---|
| Lists (ADM-04) | `DataTable` — search, filters, sort, pagination, bulk actions where sensible, status badges; plus `EmptyState`, `LoadingSkeleton`, `ErrorState` |
| Forms (ADM-05) | `FormShell` — Zod-driven inline validation, unsaved-changes warning, success/failure toasts, audit logging |
| Feedback | `Toast` system for all form actions |

### Phase 1 admin pages

| Route | Scope |
|---|---|
| `/admin` | Role-aware dashboard. Foundation cards only: registered members (verified/unverified split), staff accounts, recent registrations, system warnings (email failures, jobs not running). Content / giving / quiz summary cards activate as those modules land. Quick actions wired as their features arrive. |
| `/admin/users` | Members: search (name, email, phone), filters (status, verified, registration date), detail page, suspend/restore, resend verification, trigger password-reset email, CSV export (USR-01/02). |
| `/admin/users/staff` | Super Admin only: invite staff, assign/remove roles, disable, force password reset (USR-03). |
| `/admin/users/roles` | Super Admin only: view roles and their permission assignments; editing role permissions is allowed and audit-logged (USR-04). System roles cannot be deleted. |
| `/admin/settings` | Grouped tabs shipping now: General, Branding, Content, SEO, Email, Storage, Security, Privacy. Giving / Paystack / Quiz / Leaderboard tabs arrive with their modules. Content and SEO keys persist now but have no functional effect until Phases 2–3 ship their modules. Secrets write-only; changes audit-logged. |
| `/admin/audit-logs` | Read-only, filterable (actor, action, entity, date range), CSV export for Super Admin (AUD-01/02). |

---

## 9. Testing, Acceptance and Definition of Done

### 9.1 Test strategy (tests written with the feature, PRD 10 rule 8)

| Level | Phase 1 coverage |
|---|---|
| **Unit** (Vitest) | money (naira↔kobo, `₦10,000.00` formatting); date/time (ISO week keys like `2026-W38`, week/month/year boundaries in `Africa/Lagos`, UTC storage); phone E.164 normalisation; password policy + blocklist; permission-union computation; settings default fallback; secret redaction; email validation; slug/ID helpers. |
| **Integration** (Vitest + real Neon test branch) | register → verify → login → reset end-to-end; suspension invalidates sessions; RBAC enforced on every admin route; **migrations + seeders run from scratch**; notification queue enqueue → send → `sent` with double-run idempotency; settings encryption round-trip; audit append-only (no update/delete paths exist). |
| **E2E** (Playwright, mobile 360px + desktop) | Super Admin login → dashboard → invite staff → staff sets password → sees only permitted nav; member registration + email verification; visitor denied at `/admin`; content_manager denied at `/admin/users`. |
| **Security** | auth-bypass on `/admin`; IDOR attempts on member data; repeated-login rate limiting; CSRF on state-changing endpoints. |

### 9.2 Phase 1 acceptance stories (Given/When/Then)

1. **Foundation:** Given a fresh database, when migrations and seeders run, then the 5 roles, the full permission matrix, and Phase-1 settings defaults exist, and exactly one Super Admin exists with credentials from environment variables.
2. **Super Admin login:** Given valid Super Admin credentials, when logging in, then the user is redirected to `/admin` and sees the foundation dashboard.
3. **Staff invite:** Given a Super Admin, when inviting a staff member by email with a role, then an invitation email is queued and sent, and the invitee can set a password and lands on `/admin` seeing only their role's navigation.
4. **Member registration:** Given a visitor, when registering and clicking the emailed verification link, then `email_verified_at` is set and they can log in.
5. **Suspension:** Given a suspended member with an active session, when they next act, then their session is revoked and login is rejected.
6. **Permission denial:** Given a content_manager, when navigating to `/admin/users`, then access is denied (redirect or 403).
7. **Visitor denial:** Given an unauthenticated visitor, when requesting any `/admin` route, then they are redirected to login.
8. **Queue idempotency:** Given queued notifications, when the cron worker runs twice, then each notification is sent exactly once.

### 9.3 Definition of Done (every Phase 1 feature)

Follows the PRD's 15-point checklist (PRD 10 §3). Items specifically flagged for Phase 1: mobile responsiveness verified at 360px, tablet and desktop; accessibility (keyboard navigation, labelled fields, associated errors, and **4.5:1 contrast verified on the dark theme**); audit logging on all admin actions; error/empty/loading states on every data view; success/failure toasts on form actions; and documentation updated (README, environment variables, `docs/ASSUMPTIONS.md`).

### 9.4 CI

GitHub Actions: install → lint → typecheck → unit + integration tests → build. `pnpm audit` and Dependabot for dependency vulnerability scanning (SEC-12).

---

## 10. Deviations and Open Assumptions

Recorded in `docs/ASSUMPTIONS.md` (PRD 10 rules 3 and 9):

| ID | Item |
|---|---|
| A1 | **2FA eliminated** (D4): AUTH-08 dropped; `users.totp_secret_enc` and `auth.require_2fa_for_staff` not implemented. Open question Q9 is resolved as "no 2FA". |
| A2 | `ui/` design system supersedes placeholder branding (resolves Q1). Gradient usage per template relaxes PRD 04's "avoid heavy gradients". |
| A3 | Neon PostgreSQL + Drizzle ORM chosen (PRD's recommended default stack). |
| A4 | better-auth used for authentication plumbing, wrapped in `AuthService`; its RBAC plugins unused because the PRD requires data-driven roles/permissions. |
| A5 | Upstash Ratelimit for rate limiting (adds two env vars). |
| A6 | react-email + nodemailer as the SMTP adapter (resolves Q8). |
| A7 | Vercel Cron over a table-backed queue for background jobs. |
| A8 | `avatar_media_id` deferred to Phase 2 (no `media` table in Phase 1). |
| A9 | `super_admin` created via `pnpm db:create-superadmin` from env values — no hard-coded credentials. |

Open PRD questions still standing with their defaults (none blocks Phase 1): Q2 leaders/branches seeded empty; Q3 hosting settled by D6; Q4 video hosting decided in Phase 2; Q6 min gift ₦100 configurable (Phase 4); Q7 minors/age-range (Phase 5); Q10 no leaderboard prizes (Phase 6); Q11 donors never shown publicly (Phase 4); Q12 Paystack test mode until live keys confirmed (Phase 4).

---

## 11. Phase 2 Preview (not in scope, for boundary awareness)

Phase 2 adds the `media` module (uploads, validation, CDN), then `content` (sermons, Bible studies, Sunday school, series, categories, tags) with lifecycle, scheduling, public list/detail pages and download tracking. It will reuse `DataTable`/`FormShell`, `AuditService`, `SettingsService`, the media picker, and the `MediaAvailability` component. The `giving` and `quiz` modules follow in Phases 4–6 and must remain independent of `content` internals (ARC-01).
