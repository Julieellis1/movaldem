# Assumptions and Deviations

Rules the PRD or Phase 1 spec left unspecified or that conflicted with library
behaviour. Each entry records the conflict, the chosen (safest) resolution, and
where it is implemented. Requirement IDs follow the PRD pack.

## A2: `users` carries both a boolean and a timestamp for email verification

**Conflict:** PRD 09 and the Phase 1 design spec require `email_verified_at`
(timestamp) and map better-auth's `emailVerified` field onto it. better-auth
1.7 declares `emailVerified` as `type: "boolean"` (`@better-auth/core`
`get-tables.mjs`), so on sign-up it writes `false` into the mapped column and
the insert fails with `value.toISOString is not a function`. A timestamp
column cannot store the boolean, and better-auth always writes the field
(required, not input).

**Resolution:** keep both, with one writer each.

- `email_verified` (boolean, default `false`, NOT NULL) — owned by better-auth;
  mapped as `emailVerified` in `auth.config.ts`. This is its internal state.
- `email_verified_at` (timestamp, nullable) — the PRD-09 record of *when*
  verification happened, written exactly once by the
  `databaseHooks.user.update.after` hook in `auth.config.ts` when
  `emailVerified` flips true (conditional `WHERE email_verified_at IS NULL`,
  so it is idempotent).

Consumers that gate on "has verified" (e.g. `quiz.require_verified_email`,
AUTH-03, Phase 5) should read `email_verified_at`, matching spec §153; the
boolean is an implementation detail of the auth library.

## A3: `verification` table has an `updated_at` column

**Conflict:** PRD 09 does not define the `account` or `verification` tables —
they are better-auth-owned implementation tables (Phase 1 spec, better-auth
mapping section). better-auth's `verification` model includes `updatedAt`.

**Resolution:** add nullable `verification.updated_at`. No PRD deviation; the
column fills a table the PRD intentionally does not specify. Migration
`0001_luxuriant_blazing_skull.sql`.

## A4: verification email is sent on sign-up explicitly

**Conflict:** AUTH-01/03 require that registration queues a verification
email, but better-auth only does so when `emailVerification.sendOnSignUp` (or
`emailAndPassword.requireEmailVerification`) is set; both default to off.

**Resolution:** `emailVerification.sendOnSignUp: true` in `auth.config.ts`.
The `sendVerificationEmail` callback awaits the outbox insert (better-auth
awaits this callback via `runInBackgroundOrAwait`), so the queued row is
visible to callers the moment sign-up returns.
