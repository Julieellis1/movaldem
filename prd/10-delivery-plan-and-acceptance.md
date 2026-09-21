# 10 — Delivery Plan, Definition of Done and Acceptance Tests

**Depends on:** all previous documents
**Audience:** AI coding agent, QA, project owner

## 1. Instructions for the AI Coding Agent

1. **Build in phases, not in one pass.** Finish and verify each phase before starting the next (section 2).
2. **Load only the documents listed for the phase** (see `00`, section 2). Read `00`, `02` and `09` every time.
3. **Do not invent business rules.** If a rule is missing, implement it as a configurable setting with a documented default and note it in `docs/ASSUMPTIONS.md`.
4. **One implementation per business rule.** One `PaymentService`, one `ScoringService`, one `LeaderboardService`, one media/upload path.
5. **Keep components reusable** (catalogue in `04`, section 11).
6. **Never trust client data.** Server-validate payments, quiz timers, submissions, permissions and uploads.
7. **Reference requirement IDs** (e.g. `GIV-04`, `QUIZ-33`) in commit messages, test names and PR descriptions.
8. **Write tests with the feature**, not afterwards.
9. **When the PRD conflicts with itself or with reality** (e.g. Paystack docs differ), stop, choose the safest option, document it in `docs/ASSUMPTIONS.md`, and continue.
10. **Seed data** (roles, permissions, categories, settings) is part of the deliverable.

## 2. Build Phases

| Phase | Scope | Documents | Exit criteria |
|-------|-------|-----------|---------------|
| **1. Foundation** | Project setup, CI, env config, database and migrations, seeders, auth (register, login, verify email, reset), RBAC, audit logging, admin shell and settings framework, email adapter | 02, 03, 08, 09 | Super Admin can log in, create staff, and see an empty dashboard. Permission checks tested. Migrations and seeds run from scratch |
| **2. Teaching content** | Media library and uploads, series/categories/tags, sermons, Bible studies, Sunday school, lifecycle and scheduling, public list/detail pages, MediaAvailability, downloads and tracking | 05, 04, 09 | Sermon acceptance test (section 5.1) passes. Upload validation tests pass |
| **3. Events, programmes, gallery, site pages** | Events, programmes with sessions, gallery, About/leadership/branches, homepage, contact form and inbox | 05, 04, 08 | Public site navigable end-to-end with real content |
| **4. Giving** | PaymentService, checkout, webhook, verification, reconciliation job, projects, receipts, admin transactions, giving reports | 06, 08, 09 | Payment and project acceptance tests pass in Paystack test mode. Idempotency and signature tests pass |
| **5. Quiz engine** | Categories, questions, CSV import, quizzes, attempts (server timer, autosave, resume, expiry), scoring, results, member dashboard | 07, 09 | Quiz acceptance test passes. Timer, resume and double-submit tests pass |
| **6. Leaderboards and analytics** | Periods, leaderboard service, rollover job, privacy display, quiz reports, question analytics | 07, 08, 09 | Leaderboard acceptance test passes. Period-close snapshot preserved |
| **7. Hardening** | Global search, SEO (sitemap, robots, JSON-LD, Open Graph), sharing, performance pass, accessibility audit, security review, e2e suite, docs | 02, 04, 10 | All acceptance tests green. Lighthouse/Web Vitals targets met on key pages. Security checklist complete |

## 3. Definition of Done (every feature)

A feature is done only when all of these are true:

1. Database schema and migrations implemented.
2. Backend service/API implemented with server-side validation.
3. Admin functionality implemented (where the feature is managed).
4. Public/member-facing functionality implemented.
5. Authentication and authorization enforced and tested.
6. Error states handled, with user-friendly messages.
7. Loading states implemented.
8. Empty states implemented.
9. Success/failure notifications shown.
10. Mobile responsiveness verified at 360 px, tablet and desktop widths.
11. Accessibility checks pass (keyboard, labels, contrast, focus).
12. Security considerations addressed (see `02`).
13. Audit logging added for admin actions.
14. Unit and integration tests written and passing. Critical paths covered by e2e.
15. Documentation updated (README, `docs/`, environment variables, assumptions).

## 4. Test Strategy

| Level | Focus |
|-------|-------|
| Unit | Scoring calculations (including negative marks, floor at zero), leaderboard ranking and tie-breaks, period key generation (ISO weeks, year boundaries, Lagos timezone), CSV row validation, money conversion (naira ↔ kobo), signature verification, slug generation, permission checks |
| Integration | Services with a real test database: payment state transitions and idempotency, attempt lifecycle, period rollover, media validation, RBAC on every admin route |
| E2E | Critical journeys in section 5, on mobile and desktop viewports |
| Security | Auth bypass on admin routes, IDOR on attempts/receipts, upload of disallowed files, webhook with bad signature, amount tampering, rate limits |
| Non-functional | Lighthouse on key pages, load test on quiz submission and leaderboard reads |

## 5. Acceptance Tests (critical journeys)

### 5.1 Sermon
```text
Given an Admin or Content Manager is logged in
When they create a sermon with audio and PDF (no video), then publish it
Then a visitor sees it in /sermons and on its detail page
And only "Listen" and "Download PDF" are shown (no "Watch")
And the visitor can play the audio and download the PDF
And the download is recorded in media_downloads
```
Variants: scheduled publish appears only at the scheduled time. Draft is never public. With `require_review` on, a Content Manager cannot publish.

### 5.2 Bible Study
```text
Admin creates a Bible study, uploads audio and PDF, publishes
Visitor finds it via list, filter by teacher, and search, and accesses the media
```

### 5.3 Sunday School
```text
Admin creates a series "2026 First Quarter"
Admin creates Lesson 1 assigned to the series, publishes
Visitor sees the lesson on its page, on the series page in order, and on the homepage
Duplicate lesson number within the same series is rejected
```

### 5.4 Payment
```text
Visitor selects Tithe and enters ₦10,000, name and email
Server creates a pending transaction and sends 1,000,000 kobo to Paystack
Visitor pays in Paystack test mode
Paystack webhook arrives with a valid signature
Server verifies with Paystack (status, amount, currency, reference)
Transaction becomes successful, receipt number assigned, receipt emailed
Confirmation page shows success and a receipt link
```
Negative cases: invalid webhook signature is rejected and logged; replayed webhook causes no duplicate effects; amount mismatch flags the transaction and does not mark it successful; closing the tab before return still results in success via webhook/reconciliation; frontend redirect alone never changes status.

### 5.5 Project Giving
```text
Admin creates a project with a ₦10,000,000 target and activates it
Visitor gives ₦5,000 to the project and payment succeeds
Project raised amount increases by ₦5,000 and percentage updates
A failed or abandoned transaction does not change the raised amount
A refunded transaction is excluded from the raised amount
A closed project does not accept new gifts
```

### 5.6 Quiz
```text
Admin creates a category and uploads a CSV (with a few invalid rows)
System validates and shows a preview and an error summary
Admin downloads the error report, confirms "import valid rows only"
Only valid questions are imported; invalid rows are not
Admin creates and activates a quiz (30 questions, 15 minutes)
Member starts the quiz: attempt created, expires_at set server-side, order persisted
Member answers, refreshes the browser, resumes with the same order and remaining time
Member submits: score computed by ScoringService, result saved, cannot change answers
Second concurrent start for the same quiz is blocked
Exceeding max_attempts is blocked
```
Timer cases: letting time run out auto-submits with saved answers and status `expired`; answers after expiry (beyond grace) are rejected; tampering with the client clock has no effect.

### 5.7 Leaderboard
```text
Member completes a leaderboard-eligible quiz on a date within 2026-W38 and September 2026
Weekly, monthly and annual leaderboards all update
Ranking follows: points, accuracy, correct answers, average time, earliest reached
Ties share a rank
When week 2026-W38 ends, its leaderboard is frozen; W39 starts empty; W38 history is still viewable
A member with "abbreviated" privacy appears as "Thompson A."
A cancelled attempt is removed from the boards after recalculation
```

### 5.8 Security and Access
```text
Visitor or member requesting any /admin route is denied (redirect/403)
Content Manager cannot open quiz or giving admin pages by URL
Quiz Manager cannot open transactions
Admin cannot edit Paystack credentials
Member A cannot view Member B's attempt or receipt
Uploading a .php or renamed executable is rejected
Rate limits trigger on repeated login and checkout attempts
```

### 5.9 CSV Import Edge Cases
```text
Missing header, unknown category, bad correct_answer, missing option, duplicate question,
over-size file, wrong file type, BOM/UTF-8 characters, quoted commas
Double-click on Confirm imports each row only once
```

## 6. Release Checklist (before go-live)

- Paystack live keys set via environment, webhook URL configured in Paystack dashboard, test transaction completed in live mode with a small amount.
- Super Admin account created, default/test accounts removed, staff invited.
- Privacy Policy and Terms of Use content added.
- Email domain configured (SPF/DKIM) and receipts confirmed delivered to major providers.
- Backups scheduled and a restore rehearsed. Monitoring and error reporting on.
- Sitemap submitted to Google Search Console. Social preview tested on WhatsApp.
- Load and security checks completed. All acceptance tests green.
- Content seeded: About, leadership, branches, initial sermons, quiz categories and first quiz.
