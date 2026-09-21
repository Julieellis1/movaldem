# 02 — Architecture and Non-Functional Requirements

**Depends on:** 00-README
**Audience:** Engineering, AI coding agent

## 1. Architectural Principles

| ID | Principle |
|----|-----------|
| ARC-01 | **Modular monolith.** Content, Giving and Quiz are separate modules with their own services and tables, connected through shared Auth, Database, Media, Settings and Admin layers. |
| ARC-02 | **Business logic lives in services**, not in UI components or controllers/route handlers. |
| ARC-03 | **One implementation per business rule:** one payment service, one scoring service, one leaderboard service, one media service. |
| ARC-04 | **Never trust the client.** Validate payments, quiz timing, scoring, permissions and uploads on the server. |
| ARC-05 | **Reusable UI components** for repeated patterns (see `04`, Component Catalogue). |
| ARC-06 | **Config over code.** Unspecified rules are settings with documented defaults. |
| ARC-07 | **Extensible.** Future modules (prayer requests, testimonies, devotionals, membership, live streaming) must be addable without changing core modules. |

## 2. Recommended Stack (default, overridable)

The AI IDE MAY choose a different stack if the project environment dictates one, but MUST keep the module boundaries and requirements in this pack.

| Layer | Default recommendation | Why |
|-------|------------------------|-----|
| Web framework | Next.js (TypeScript, App Router) or an equivalent SSR framework | SSR/static rendering for SEO and mobile performance; one codebase for UI and API |
| Database | PostgreSQL | Relational integrity for payments and quiz data; built-in full-text search |
| ORM/migrations | Prisma or Drizzle | Typed schema, migrations |
| Auth | Session-based auth (secure HTTP-only cookies), Argon2id or bcrypt hashing | Simple and secure for a first-party app |
| Storage | S3-compatible object storage (e.g. Cloudflare R2, AWS S3, Backblaze B2) behind a CDN; local disk in development | Keeps large media out of the DB |
| Video | External embed (YouTube unlisted / Vimeo) preferred; self-hosted MP4/WebM supported | Saves bandwidth and cost |
| Email | SMTP-compatible adapter (Resend, SendGrid, Zoho, etc.) | Provider-agnostic |
| Background jobs | Queue/cron runner (e.g. BullMQ, pg-boss, or platform cron) | Scheduled publishing, period rollover, payment reconciliation, attempt expiry |
| Validation | Schema validation library (e.g. Zod) shared across client and server | Single source of validation rules |
| Tests | Unit (Vitest/Jest), integration, e2e (Playwright) | See `10` |

## 3. Module Boundaries and Services

```text
Auth            AuthService, SessionService, PasswordService, RbacService
Content         ContentService (sermons/studies/lessons), SeriesService, EventService,
                ProgrammeService, GalleryService, PageService (About, Leadership)
Media           MediaService (upload, validate, attach, delete, signed URLs), DownloadService
Giving          PaymentService (only place that talks to Paystack), ProjectService,
                ReceiptService, GivingReportService
Quiz            QuizService, QuestionService, QuizImportService, QuizAttemptService,
                ScoringService, LeaderboardService, QuizReportService
Platform        SettingsService, AuditService, NotificationService (email now, channels later),
                SearchService, ContactService
Jobs            PublishScheduler, PeriodRollover, AttemptExpirer, PaymentReconciler,
                DownloadStatsAggregator
```

**Rules:**
- Only `PaymentService` calls Paystack. Only `ScoringService` computes scores. Only `LeaderboardService` writes leaderboard rows.
- Modules communicate through service interfaces or domain events (e.g. `payment.succeeded`, `quiz.attempt.submitted`), not by reaching into each other's tables.

## 4. Recommended Project Structure

Adapt to the chosen framework.

```text
/
├── src/
│   ├── app/ (or pages/)        Routes: public site, member dashboard, admin, API
│   ├── components/             Reusable UI (see 04)
│   ├── modules/
│   │   ├── auth/
│   │   ├── content/
│   │   ├── media/
│   │   ├── giving/
│   │   ├── quiz/
│   │   └── platform/           settings, audit, notifications, search, contact
│   ├── lib/                    shared helpers, validation schemas, money/date utils
│   └── jobs/
├── database/
│   ├── migrations/
│   └── seeders/                roles, permissions, default quiz categories, settings
├── storage/                    local dev uploads only (gitignored)
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
└── docs/                       this PRD pack
```

## 5. Configuration and Secrets

Secrets come from environment variables, never from source control.

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Database connection |
| `APP_URL` | Canonical site URL |
| `APP_SECRET` | Session signing and encryption of stored secrets |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_PUBLIC_KEY` | Paystack credentials (preferred source) |
| `STORAGE_DRIVER`, `STORAGE_BUCKET`, `STORAGE_ENDPOINT`, `STORAGE_KEY`, `STORAGE_SECRET`, `CDN_BASE_URL` | Media storage |
| `SMTP_URL` (or provider key) and `MAIL_FROM` | Email |
| `IP_HASH_SALT` | Salt for hashing IP addresses |

Seed data (required on first run): roles, permissions, default quiz categories, default settings, one Super Admin created from a one-time CLI command or environment values (never a hard-coded default password).

## 6. Security Requirements

| ID | Requirement |
|----|-------------|
| SEC-01 | Passwords hashed with Argon2id or bcrypt. Minimum length 8, blocklist of common passwords recommended. |
| SEC-02 | Secure, HTTP-only, SameSite cookies. Session rotation on login and privilege change. Session expiry and "log out everywhere" for staff. |
| SEC-03 | CSRF protection on all state-changing browser requests. |
| SEC-04 | Server-side input validation on every endpoint. Output escaping. Parameterised queries only. |
| SEC-05 | Rate limiting on login, registration, password reset, contact form, checkout initiation, quiz start and answer endpoints. |
| SEC-06 | Login lockout or exponential backoff after repeated failures. Generic error messages (no user enumeration). |
| SEC-07 | Authorization enforced server-side on every admin route and API. Hidden URLs are never a control. Deny by default. |
| SEC-08 | Admin area on `/admin` requires a staff role. Optional TOTP two-factor for staff (recommended for Super Admin). |
| SEC-09 | Password reset via single-use, expiring tokens (default 60 min), stored hashed. |
| SEC-10 | Security headers: CSP, HSTS, X-Content-Type-Options, Referrer-Policy, frame protections. HTTPS only. |
| SEC-11 | Secrets never sent to the browser or logged. Stored secrets are encrypted and shown masked. |
| SEC-12 | Dependency vulnerability scanning in CI. |
| SEC-13 | Payment webhooks verify signatures. See `06`. |

### File Upload Security

| ID | Requirement |
|----|-------------|
| UPL-01 | Validate by extension, declared MIME type, file size, and file signature (magic bytes) where possible. |
| UPL-02 | Allowlist only: images (JPG, PNG, WebP), PDF, audio (MP3, M4A), video (MP4, WebM). |
| UPL-03 | Reject executables and scripts (`.php`, `.exe`, `.sh`, `.bat`, `.js`, `.html`, `.svg` unless sanitised, etc.). |
| UPL-04 | Store files under generated names (UUID), not user-supplied paths. Never serve uploads from an executable directory. |
| UPL-05 | Size limits are settings. Defaults: image 5 MB, PDF 25 MB, audio 100 MB, video 500 MB. |
| UPL-06 | Large files use direct-to-storage (presigned or chunked) uploads with progress and resume where practical. |
| UPL-07 | Serve downloads with correct `Content-Type` and `Content-Disposition`. |

## 7. Privacy and Data Protection (Nigeria)

The platform collects names, emails, phone numbers, payment references and quiz activity. Design to align with the **Nigeria Data Protection Act (NDPA) 2023**; confirm details with a qualified adviser.

| ID | Requirement |
|----|-------------|
| PRV-01 | Privacy Policy and Terms of Use pages are required, linked in the footer and at registration/checkout. |
| PRV-02 | Explicit consent checkbox at registration. |
| PRV-03 | Collect only what is needed. Optional fields (church, age range, gender) are clearly optional. |
| PRV-04 | Store raw card data **never**. Card details are handled entirely by Paystack. |
| PRV-05 | IP addresses for download tracking and quiz attempts are stored as salted hashes unless a stronger need is documented. |
| PRV-06 | Users can request account deletion. Deletion anonymises personal fields but retains transaction and audit records as required. Quiz records are anonymised, not removed, to keep leaderboard history consistent. |
| PRV-07 | Leaderboard display names follow the user's privacy choice (see `07`). |

## 8. Performance

| ID | Requirement |
|----|-------------|
| PERF-01 | Target Core Web Vitals "good" on mid-range Android over 4G: LCP under 2.5 s, CLS under 0.1, INP under 200 ms for key public pages. |
| PERF-02 | Responsive images (`srcset`), WebP/AVIF where supported, lazy loading below the fold. |
| PERF-03 | SSR or static generation with revalidation for public content pages. |
| PERF-04 | Pagination on every list. Indexed queries on slug, status, published_at, foreign keys. |
| PERF-05 | CDN for media and static assets. HTTP range requests for audio/video streaming. Gzip/Brotli. |
| PERF-06 | Caching for public pages and leaderboard reads. Invalidate on publish or leaderboard update. |
| PERF-07 | Audio and video are never auto-loaded on page load (`preload="none"` or `metadata`). |

## 9. Accessibility

| ID | Requirement |
|----|-------------|
| A11Y-01 | Target WCAG 2.1 AA. |
| A11Y-02 | Semantic HTML landmarks, correct heading order. |
| A11Y-03 | Full keyboard navigation, visible focus states. |
| A11Y-04 | Labelled form fields, associated error messages, `aria-live` for async status (payment, quiz autosave, timer warnings). |
| A11Y-05 | Alt text required for content images (admin form prompts for it). |
| A11Y-06 | Minimum contrast 4.5:1 for body text. Text sized for older readers (base 16 px minimum). |
| A11Y-07 | Quiz timer announces milestones (e.g. 5 min, 1 min) to screen readers without spamming. |
| A11Y-08 | Audio/video players are keyboard operable. |

## 10. Reliability and Observability

| ID | Requirement |
|----|-------------|
| REL-01 | Payment records and quiz submissions must not be lost: write before responding, use transactions, retry idempotently. |
| REL-02 | All jobs are idempotent and safe to run twice. |
| REL-03 | Structured logging with request IDs. Errors reported to a monitoring service. |
| REL-04 | Health-check endpoint. Automated daily database backups with a tested restore. |
| REL-05 | Graceful error pages (404, 500) and user-friendly error states everywhere (see `10`, Definition of Done). |
