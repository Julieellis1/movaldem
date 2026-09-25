# Assumptions and Deviations

Two kinds of entry live here:

1. **Stack and product decisions (A1–A9)** — the choices the Phase 1 design spec
   made on the PRD's behalf, or where it deliberately overruled the PRD.
2. **Implementation conflicts (C1+)** — places where library behaviour fought the
   PRD or the schema, and what was chosen instead. Each records the conflict, the
   resolution, and where it is implemented.

Requirement IDs (PRD 00–10) are cited throughout; the full PRD pack is not
vendored in this repository.

---

## Part 1 — Stack and product decisions (from the Phase 1 spec §10)

| ID | Decision |
|---|---|
| A1 | **2FA eliminated.** AUTH-08 is dropped: no `users.totp_secret_enc`, no `auth.require_2fa_for_staff`. Open question Q9 is resolved as "no 2FA". |
| A2 | **`ui/` design system supersedes placeholder branding** (resolves Q1). The "Luminous Sanctuary" tokens relax PRD 04's "avoid heavy gradients" for the hero areas. |
| A3 | **Neon PostgreSQL + Drizzle ORM**, the PRD's recommended default stack. |
| A4 | **better-auth for authentication plumbing**, wrapped in our own `AuthService`. Its RBAC plugins are deliberately unused: the PRD requires roles and permissions to be data-driven rows, not library config. |
| A5 | **Upstash Ratelimit** for distributed rate limiting, with a single-process in-memory fallback for local dev and CI without Redis (adds two optional env vars). |
| A6 | **react-email + nodemailer** as the SMTP adapter (resolves Q8). |
| A7 | **Vercel Cron over a table-backed queue** for background jobs. The `notifications` table *is* the queue; later phases reuse the same worker pattern for the publish scheduler, attempt expirer, period rollover and payment reconciler. |
| A8 | **`avatar_media_id` deferred to Phase 2** — there is no `media` table in Phase 1 to reference. |
| A9 | **The first super admin is created by a CLI script** from `SUPERADMIN_*` env values (`pnpm db:create-superadmin`). No credentials are hard-coded or seeded. |

### Open PRD questions still standing (defaults applied, none blocking Phase 1)

Q2 leaders/branches seeded empty · Q3 hosting settled by D6 (Vercel + Neon) ·
Q4 video hosting decided in Phase 2 · Q6 minimum gift ₦100 is configurable
(Phase 4) · Q7 minors/age-range handling (Phase 5) · Q10 no leaderboard prizes
(Phase 6) · Q11 donors are never shown publicly (Phase 4) · Q12 Paystack stays
in test mode until live keys are confirmed (Phase 4).

---

## Part 2 — Implementation conflicts and resolutions

### C1: `users` carries both a boolean and a timestamp for email verification

**Conflict:** PRD 09 and the spec require `email_verified_at` (a timestamp) and
map better-auth's `emailVerified` onto it. better-auth 1.7 declares
`emailVerified` as `type: "boolean"`, so on sign-up it writes `false` into the
mapped column and the insert fails with `value.toISOString is not a function`.
A timestamp column cannot hold a boolean, and better-auth always writes the
field.

**Resolution:** keep both, with one writer each.

- `email_verified` (boolean, default `false`, NOT NULL) — owned by better-auth,
  mapped as `emailVerified` in `auth.config.ts`. Its internal state.
- `email_verified_at` (timestamp, nullable) — the PRD-09 record of *when*
  verification happened, written once by the
  `databaseHooks.user.update.after` hook when `emailVerified` flips true. The
  conditional `WHERE email_verified_at IS NULL` makes it idempotent.

Consumers gating on "has verified" (for example `quiz.require_verified_email`,
AUTH-03) should read `email_verified_at`, matching the spec; the boolean is an
implementation detail of the auth library.

### C2: The `verification` table has an `updated_at` column

**Conflict:** PRD 09 does not define the `account` or `verification` tables —
they are better-auth-owned. better-auth's `verification` model includes
`updatedAt`, which the PRD's shape has no place for.

**Resolution:** add a nullable `verification.updated_at`. No PRD deviation; the
column fills a table the PRD intentionally does not specify.

### C3: The verification email is queued on sign-up explicitly

**Conflict:** AUTH-01/03 require registration to queue a verification email, but
better-auth only does so when `emailVerification.sendOnSignUp` (or
`emailAndPassword.requireEmailVerification`) is set; both default to off.

**Resolution:** `emailVerification.sendOnSignUp: true`. The
`sendVerificationEmail` callback *awaits* the outbox insert rather than firing
it in the background, so the queued row is visible the moment sign-up returns.

### C4: `/admin` middleware runs on the Node.js runtime, not edge

**Conflict:** Next.js middleware defaults to the edge runtime, but
`src/middleware.ts` needs `auth.api.getSession`, whose config pulls in
`@node-rs/argon2` (a native binary) and `node:crypto` (IP hashing). Edge cannot
load either, and the middleware crashes on every request.

**Resolution:** `config.runtime: "nodejs"` on the middleware. Session lookup,
RBAC imports and audit hashing then run in-process with no edge restrictions.

### C5: Credentials live in better-auth's `account` table, not `users`

**Conflict:** PRD 09 lists a `password_hash` on `users`.

**Resolution:** no such column. better-auth owns credential hashes in its
`account` table (`provider_id = "credential"`), so hashes are written and
verified in one place with argon2id. Anyone reading the schema should not look
for `password_hash` on `users`.

### C6: better-auth owns the `verification` table; `auth_tokens` holds staff invites only

**Conflict:** the PRD expects single-use tokens for email verification and
password reset as well as staff invites.

**Resolution:** better-auth generates, expires and validates email-verify and
password-reset tokens in its `verification` table. Our `auth_tokens` table
carries *only* `staff_invite` tokens, which better-auth knows nothing about. The
`authTokenType` enum still lists all three values for migration compatibility,
but only `staff_invite` is written in practice.

### C7: `users.image` added, and `sessions` gained timestamps

**Conflict:** neither field appears in PRD 09.

**Resolution:** both are better-auth core fields that cannot be omitted —
`user.image` is a core better-auth column, and `session.createdAt` /
`updatedAt` are required by its session model. No behaviour depends on them
beyond persistence.

### C8: `users.consent_at` is nullable

**Conflict:** registration requires explicit consent (AUTH-04), which suggests a
`NOT NULL` column.

**Resolution:** nullable at the database level, enforced by
`registerSchema.consent` at the application boundary and written by
`registerMember` on every successful registration. Rows created by the
super-admin CLI or by a future import path legitimately have no consent record.

### C9: better-auth signs with `APP_SECRET`

**Conflict:** better-auth expects `BETTER_AUTH_SECRET` or a `secret` option, and
logs an error on every production build when it falls back to its hard-coded
default. We already validate a 32+ character `APP_SECRET`.

**Resolution:** pass `secret: env().APP_SECRET` in `auth.config.ts`. One secret,
already validated at boot, and no silent default in production.

### C10: Email templates cannot statically import `react-dom/server`

**Conflict:** the react-email templates render through
`renderToStaticMarkup`, but a module in the App Router's server layer that
imports `react-dom/server` fails the production build with *"You're importing a
component that imports react-dom/server"*. The cron route pulls the templates in
through the worker.

**Resolution:** `templates/render.ts` resolves `react-dom/server` at call time
through a Node `createRequire`, keeping it out of the webpack module graph. The
react-email components and their typed props are unchanged; only the resolution
of the renderer moved.

### C11: A staff invite provisions the account before the token is accepted

**Conflict:** PRD 09's `auth_tokens.user_id` is nullable, implying an invite
exists before any user does. But the role to grant has nowhere to live — there is
no role column on `auth_tokens`, and reading it back from a queued notification
would be fragile.

**Resolution:** `inviteStaff` creates the user (if the email is new) and assigns
the role in the same transaction as the token and the queued email, so the
invitee appears in the staff table immediately and cannot be granted a different
role than the one invited to. Accepting the invite only proves mailbox control
and sets a password: the credential row is inserted and the token is marked used
atomically, so a replayed link inserts nothing.

### C12: Rate-limit keys omit the IP component when no IP is available

**Conflict:** SEC-05/06 specify limits per IP, but server actions, Playwright
requests and vitest call the services with no `x-forwarded-for`. Keying those
callers on an empty IP would put every one of them in a single shared bucket
and lock out the test suite.

**Resolution:** when the IP is absent the key is built from the identifier
(email, or actor id for staff invites) alone. Vercel always sets
`x-forwarded-for` for real requests, so production keeps full per-IP protection;
only IP-less callers fall back, and they are still per-identifier limited.

### C13: Forbidden admin page loads redirect instead of returning JSON 403

**Conflict:** the middleware originally answered a permission failure with
`NextResponse.json({ error: "Forbidden" }, { status: 403 })`. For a *page*
navigation that leaves the browser sitting on the forbidden URL, rendering raw
JSON where the app should be.

**Resolution:** redirect to `/admin?forbidden=<path>` so the user lands back in
the shell. Route permissions are matched most-specific-first, because
`pathname.startsWith("/admin/users")` is also true for `/admin/users/staff` and
would otherwise shadow the staff and roles rules.

### C14: Post-login landing for staff vs members

**Conflict:** the login form pushes `redirect ?? "/"` after a successful
sign-in, but `/` unconditionally redirected to `/login` (Phase 1 placeholder
for the Phase 3 homepage) — so every staff sign-in looped back to the login
page with a success toast. No role-aware landing existed, and the member
dashboard only arrives in Phase 5.

**Resolution:** `/` dispatches by audience (`src/modules/auth/home-target.ts`):
staff roles (`super_admin`, `admin`, `content_manager`, `quiz_manager`) go to
`/admin`; authenticated members go to `/sermons` as a placeholder home until
the Phase 3 homepage; guests go to `/login`. Staff membership is checked by
explicit role keys, not permission count, so future member permissions cannot
promote anyone by accident.

### C15: Background jobs run on an external scheduler, not Vercel Cron

**Conflict:** the email outbox worker needs ~1-minute cadence and the publish
scheduler ~5-minute cadence, but the Vercel Hobby plan rejects any cron
schedule running more than once per day ("Hobby accounts are limited to daily
cron jobs").

**Resolution:** `vercel.json` ships an empty `crons` array so Hobby deploys
pass. Both endpoints are triggered by cron-job.org (free tier) with
`Authorization: Bearer $CRON_SECRET`:
`POST /api/cron/process-notifications` every minute,
`POST /api/cron/publish-scheduled` every 5 minutes.
Re-introduce native Vercel Crons only if the project moves to Pro.
