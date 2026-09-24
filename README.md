# MOVALDEM

A digital ministry hub for Mountain of Victory at the Last Day Evangelical
Ministry: public church website, CMS for teaching content, Paystack online
giving, and a Bible quiz platform with leaderboards.

This repository currently contains **Phase 1 (Foundation)** of a seven-phase
build: the scaffold, design system, database schema and seeders, authentication,
data-driven RBAC, audit/settings/notification platform services, a cron-driven
email queue, the admin shell, and a CI pipeline with acceptance tests. Later
phases add media and content (2), the public website (3), giving (4), quizzes
(5), leaderboards (6) and search/SEO/performance (7). The reusable spine built
here — `AuditService`, `SettingsService`, the notification outbox and worker,
`DataTable`/`FormShell`, RBAC — is what those phases build on.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4 ·
shadcn/ui · Neon PostgreSQL + Drizzle ORM · better-auth · Zod · react-email +
nodemailer · Upstash Ratelimit · Vitest · Playwright · Vercel Cron.

## Getting started

Requires Node.js 20+ and pnpm.

```bash
pnpm install
cp .env.example .env.local     # then fill in the required values
pnpm db:migrate                # apply migrations
pnpm db:seed                   # roles, permissions and settings defaults
pnpm dev
```

Open <http://localhost:3000>.

### Required environment variables

`DATABASE_URL`, `APP_SECRET` (32+ chars), `IP_HASH_SALT` (16+ chars) and
`CRON_SECRET` (16+ chars) are validated at boot by `src/lib/env.ts`; the app
refuses to start without them. Everything else in `.env.example` is optional in
Phase 1 and switches on the features that need it (Paystack and storage in Phase
4/2, SMTP for real email delivery, Upstash for distributed rate limiting).
`APP_URL` defaults to `http://localhost:3000`.

### Creating the first super admin

There are no hard-coded credentials. The seeder creates the five roles and the
permission matrix, but the first super admin is created explicitly:

```bash
SUPERADMIN_EMAIL=you@example.com \
SUPERADMIN_PASSWORD='a-strong-password' \
SUPERADMIN_NAME='Your Name' \
pnpm db:create-superadmin
```

The script is idempotent — it reports "already exists" and exits if that email
is already registered.

## Scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Start the dev server on :3000 |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm lint` | ESLint via `next lint` |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest unit + integration suite |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm e2e` | Playwright end-to-end suite (starts a server if needed) |
| `pnpm db:generate` | Generate a migration from the Drizzle schema |
| `pnpm db:migrate` | Apply pending migrations |
| `pnpm db:seed` | Seed roles, permissions and settings (idempotent) |
| `pnpm db:create-superadmin` | Create the first super admin from env values |

## Background jobs

Email is delivered through a table-backed outbox: services enqueue a
`notifications` row inside their own transaction, and a worker drains it. The
worker is exposed at `POST /api/cron/process-notifications` and requires
`Authorization: Bearer $CRON_SECRET`; `vercel.json` schedules it every minute.
Every step is idempotent, so duplicate cron invocations cannot double-send.

## Testing

```bash
pnpm test    # unit + integration (remote DB)
pnpm e2e     # Playwright; needs a running or auto-started server
```

Integration tests share one database, so `vitest.config.mjs` sets
`fileParallelism: false` — the queue worker drains all queued notifications, and
parallel files would delete each other's rows. Playwright specs warm their
routes before the test clock starts, because a cold `next dev` compile of a
single admin route can take a minute on a small machine.

CI (`.github/workflows/ci.yml`) runs lint → typecheck → migrate → seed → test →
build → e2e. It expects four repository secrets: `TEST_DATABASE_URL`,
`APP_SECRET`, `IP_HASH_SALT` and `CRON_SECRET`.

## Project layout

```
src/
  app/            routes: (auth) public auth pages, admin shell, api handlers
  components/     ui/ shadcn primitives, shared/ reusable UX, admin/ admin views
  db/             schema.ts (single source of truth) + Drizzle client
  jobs/           the notifications worker
  lib/            pure helpers (env, money, datetime, crypto, ratelimit)
  modules/
    auth/         auth.config, auth.service, rbac.service, permissions
    platform/     settings, audit, notifications
drizzle/          migrations + seeders
tests/            unit/ integration/ e2e/
docs/             ASSUMPTIONS.md and the Phase 1 spec + plan
```

`db/schema.ts` is the single schema source; `modules/*` own their tables and
rules; `lib/` holds pure helpers with no database access.

## Documentation

- `docs/ASSUMPTIONS.md` — every deviation, open question and conflict resolution.
- `docs/superpowers/specs/2026-09-21-movaldem-phase1-foundation-design.md` — the
  Phase 1 design spec.
- `docs/superpowers/plans/2026-09-21-movaldem-phase1-foundation.md` — the task-by-task
  implementation plan.

The full PRD pack (PRD 00–10) is referenced throughout by requirement ID — for
example `SEC-01`, `PERM-02`, `USR-04`, `AUD-01` — and is not vendored in this
repository. Commit messages and test names cite those IDs so each change can be
traced back to its requirement.
