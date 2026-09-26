# Phase 4 Giving & Paystack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 4 giving — Paystack checkout, webhook + server verification, idempotent payment pipeline, reconciliation job, fundraising projects, receipts (view/email/PDF), admin transactions/projects/reports — on the Phase 1 spine (outbox, audit, settings, RBAC).

**Architecture:** Modular monolith (ARC-01/02). New `src/modules/giving/` owns its tables; ONLY `PaymentService` talks to Paystack (ARC-03), via an injectable HTTP client so tests never hit the live API. Money is integer kobo end-to-end. Webhook handling is store-first (persist `payment_events` raw, 200 fast) then process async. Receipt email goes through the Phase 1 notification outbox.

**Tech Stack:** Next.js 15 App Router, React 19, TS strict, Drizzle + Neon, Zod, Tailwind v4 + shadcn/ui, Vitest + Playwright. New deps allowed where justified: `pdfkit` (+ `@types/pdfkit`) for receipt PDFs; `exceljs` for .xlsx exports — or record an ASSUMPTIONS.md deviation if you deliberately scope exports to CSV+PDF.

**Spec:** `prd/06-giving-payments.md` (all sections), `prd/09-data-model.md` (§6), `prd/08-admin-dashboard-reports-settings.md` (§5.1, §6 Giving/Paystack rows, §7 emails), `prd/10-delivery-plan-and-acceptance.md` (§5.4/5.5), `prd/02-architecture-and-nfr.md` (§3 Giving services, §5 Paystack env, SEC-04/05/13)

## Global Constraints

- **Currency:** NGN only; money stored as integer **kobo** (₦1 = 100 kobo); UI formats `₦10,000.00`.
- **Timezone:** store UTC; display/compute periods in `Africa/Lagos`.
- **IDs:** UUID PKs; transaction `reference` server-generated unique (`MVD-<yyyymmdd>-<random>`); receipt numbers `MVD-RCP-YYYY-NNNNNN` unique sequential.
- **Deletion:** transactions/payment_events/audit never hard-deleted; projects soft-deleted.
- **Server authority:** reference, amount, verification, webhooks, slugs all server-side; frontend redirect NEVER marks success (GIV-03).
- **Privacy:** `ip_hash` salted, never raw IP. Donor names never shown publicly (PRJ-03).
- **Secrets:** Paystack keys from env preferred, never logged/sent to browser; admin Paystack UI is Super Admin only, write-only masked.
- **Requirement IDs** cited in commits/tests (GIV-*, PRJ-*, RCP-*, RPT-*).

---

## File Structure

```
src/db/schema.ts                        += givingProjectStatus enum; giving_projects,
                                           transactions, payment_events
src/lib/money.ts                        nairaToKobo/koboToNaira/formatNaira (skip if exists)
src/modules/giving/paystack.client.ts   PaystackClient (init transaction, verify, HMAC check) — injectable fetch
src/modules/giving/payment.service.ts   PaymentService ONLY Paystack caller: checkout, webhook ingest,
                                           verify+transition, reconciliation, idempotency
src/modules/giving/project.service.ts   ProjectService CRUD + raised/progress + accept-gift gate
src/modules/giving/receipt.service.ts   ReceiptService numbers, receipt payload, PDF builder, resend
src/jobs/payment-reconciler.ts          reconcile pending>10min, abandon after giving.abandon_after_minutes
src/app/api/giving/checkout/route.ts    public rate-limited checkout
src/app/api/giving/status/route.ts      public status-by-reference (no personal data)
src/app/api/giving/receipt/[reference]/route.ts  signed-token/owner receipt view + ?format=pdf
src/app/api/webhooks/paystack/route.ts  raw-body HMAC-SHA512 vs x-paystack-signature, store-first
src/app/api/cron/reconcile-payments/route.ts  CRON_SECRET-guarded reconciler (external scheduler, Hobby)
src/app/api/admin/transactions/...      list/detail/export/reverify/resend
src/app/api/admin/projects/...          CRUD
src/app/(public)/give/...               /give, /give/project/[slug], /give/confirmation, /give/receipt/[reference]
src/app/admin/giving/...                transactions, projects, reports pages
src/components/giving/...               GivingForm, PaymentStatus, ProjectProgress, ReceiptView
drizzle/seeders/giving.ts               giving.* settings defaults (no demo transactions)
tests/unit/giving.*                     money, HMAC vectors, reference/receipt formats, progress math
tests/integration/giving.*             checkout/verify/webhook/reconcile/project flows (mocked Paystack HTTP)
tests/e2e/giving.spec.ts               5.4/5.5 journeys in Paystack test mode (CI-only, do not run locally)
```

Paystack API drift rule (06 preamble): check current Paystack docs for init/verify endpoints, webhook event names, and the signature header BEFORE coding; behaviour requirements here win over endpoint details.

---

### Task 1: DB schema + migration + money helpers

**Files:**
- Modify: `src/db/schema.ts`
- Create (generated): `drizzle/migrations/00XX_*.sql`
- Create if missing: `src/lib/money.ts`
- Test: `pnpm db:generate` + `pnpm typecheck`

**Interfaces:**
- Consumes: `users.id` (nullable donor link), `media.id` (project image).
- Produces: `givingProjects` (status `draft|active|completed|closed`, `target_amount` + `amount_raised_cached` kobo ints), `transactions` (all 09 §6 columns; `reference` unique; `receipt_number` unique nullable), `paymentEvents` (`event_key` unique, `signature_valid`, `processed`). `nairaToKobo` (rounds half-up to int, rejects >2dp/NaN/negative), `koboToNaira`, `formatNaira` (`₦10,000.00`).

- [ ] **Step 1: Append 3 tables + status enum per `09` §6 (exact columns/indexes)**
- [ ] **Step 2: Add `src/lib/money.ts` if no equivalent exists (check `src/lib/` first)**
- [ ] **Step 3: Run `pnpm db:generate` — expect new migration file**
- [ ] **Step 4: Run `pnpm typecheck` — expect PASS**
- [ ] **Step 5: Commit** `git add src/db/schema.ts src/lib/money.ts drizzle/migrations && git commit -m "feat(phase4): giving schema + money helpers (09-§6)"`

### Task 2: Paystack client + PaymentService + reconciliation

**Files:**
- Create: `src/modules/giving/paystack.client.ts`, `src/modules/giving/payment.service.ts`, `src/jobs/payment-reconciler.ts`, `src/app/api/giving/checkout/route.ts`, `src/app/api/giving/status/route.ts`, `src/app/api/webhooks/paystack/route.ts`, `src/app/api/cron/reconcile-payments/route.ts`
- Test: `tests/unit/giving.paystack.test.ts`, `tests/integration/giving.payments.test.ts`

**Interfaces:**
- Consumes: settings (`giving.min_amount` default ₦100 → kobo, `giving.max_amount?`, `giving.require_phone` default off, `giving.abandon_after_minutes` default 60), secrets (Paystack keys), outbox, audit.
- Produces: `createCheckout(input)` → `{ reference, authorizationUrl }` (GIV-01/02/12); `ingestWebhook(rawBody, signature)` → 200 fast, stores payment_events (GIV-05/06/08); `verifyAndTransition(reference)` (GIV-03/04: success only if Paystack status=success AND reference+amount+currency match; mismatch → failed + admin alert); `reconcilePayments(now)` (GIV-10/11 transitions); `getPublicStatus(reference)` (status only). Reference `MVD-<yyyymmdd>-<random>`; event_key idempotency (GIV-07); `abandoned→successful` late-payment path kept.

- [ ] **Step 1: Write failing tests** (HMAC vector from Paystack docs; bad signature → 401+logged; replayed webhook → single effect; amount mismatch → failed not successful; frontend-callback-only → stays pending; mock Paystack HTTP via injected fetch — NEVER live calls in tests)
- [ ] **Step 2: Implement client + service + job + 4 routes minimal to pass**
- [ ] **Step 3: Run tests — expect PASS**
- [ ] **Step 4: Commit**

### Task 3: Projects + receipts

**Files:**
- Create: `src/modules/giving/project.service.ts`, `src/modules/giving/receipt.service.ts`
- Test: `tests/integration/giving.projects.test.ts`

**Interfaces:**
- Produces: `createProject/updateProject/setProjectStatus` (target>0 kobo, audit-logged PRJ-04), `getActiveProject(slug)` (PRJ-02 gate), `recordSuccessfulPayment` effects (project `amount_raised_cached` += amount ONLY for successful; refunded excluded), `getProgress` ({raised,target,percent1dp,cappedBar}), `issueReceipt(txId)` (sequential `MVD-RCP-YYYY-NNNNNN` under transaction lock), `receiptPayload`, `receiptPdfBuffer` (RCP-02 fields, WAT time), `resendReceipt` (NTF-01 retry path), `signedReceiptUrl` (HMAC expiring guest link, RCP-04).

- [ ] **Step 1: Write failing tests** (successful +₦5,000 raises progress; failed/abandoned don't; refunded excluded; closed project rejects gifts; receipt numbers unique sequential; percentage 1dp, bar caps at 100 — 5.5 journey)
- [ ] **Step 2: Implement minimal to pass**
- [ ] **Step 3: Run test — expect PASS**
- [ ] **Step 4: Commit**

### Task 4: Public giving UI

**Files:**
- Create: `src/app/give/page.tsx`, `src/app/give/project/[slug]/page.tsx`, `src/app/give/confirmation/page.tsx`, `src/app/give/receipt/[reference]/page.tsx`, `src/components/giving/giving-form.tsx`, `payment-status.tsx`, `project-progress.tsx`, `receipt-view.tsx`
- Reuse: header/footer chrome, ShareButtons NOT needed, ContentCard patterns for project cards.

- [ ] **Step 1: GivingForm (4 modes, project selector for active only, NGN validation vs settings, prefills for members, guest allowed) → posts `/api/giving/checkout` → Paystack URL**
- [ ] **Step 2: Confirmation page polls `status` endpoint (pending/success/failed/abandoned + next steps, live region)**
- [ ] **Step 3: Receipt view (view/print/PDF link, signed guest token, owner-or-token gate) + project pages (target/raised/percent, no donor names PRJ-03)**
- [ ] **Step 4: Typecheck + Commit**

### Task 5: Admin transactions + projects + reports

**Files:**
- Create: `src/app/admin/giving/transactions/...`, `src/app/admin/giving/projects/...`, `src/app/admin/giving/reports/...`, `src/app/api/admin/transactions/...` (list/detail/export/reverify/resend), `src/app/api/admin/projects/...`
- Reuse: DataTable/FormShell, admin-shell nav (add Giving group), permission helper.

- [ ] **Step 1: Transactions list (status/type/project/date/amount filters, search name/email/reference, sortable, detail with payment_events history) + CSV export (RPT-02 header, audit-logged) + Excel/PDF or recorded deviation**
- [ ] **Step 2: Reverify (Super Admin) + resend receipt (Admin) actions**
- [ ] **Step 3: Projects CRUD + giving reports (totals/by-type/avg/status/trend, period switch, RPT-01 successful-only)**
- [ ] **Step 4: Typecheck + Commit**

### Task 6: Settings + RBAC + seeds + acceptance

**Files:**
- Modify: `drizzle/seeders/giving.ts` (new: giving.* defaults), `drizzle/seeders/index.ts`, settings UI group if a Giving/Paystack tab pattern exists (read settings page first; Paystack keys Super Admin write-only masked)
- Modify: `src/components/shared/admin-sidebar.tsx` (Giving nav group, permission-gated)
- Create: `tests/integration/giving.guards.test.ts`, `tests/e2e/giving.spec.ts` (5.4/5.5 in Paystack TEST mode; CI-only, never run locally)

- [ ] **Step 1: Guard tests red→green (member denied, quiz/content managers blocked from giving pages, admin cannot edit Paystack creds — 5.8 slice)**
- [ ] **Step 2: Seed giving settings, run `pnpm db:seed` (coordinator step if scope forbids)**
- [ ] **Step 3: Write e2e spec (Paystack test mode; document required TEST keys as CI secrets)**
- [ ] **Step 4: Full `pnpm test` green + Commit**

## Self-Review

- Spec coverage: `06` §1 types → T2/T4; §2 form → T2/T4; §3 server flow GIV-01..13 → T2; §4 statuses → T1/T2; §5 projects PRJ-01..05 → T3/T4/T5; §6 receipts RCP-01..06 → T3/T4/T5; §7 security → T2/T6; §8 GivingForm/PaymentStatus → T4; §9 API table → T2/T3/T4/T5; §10 admin tx → T5; §11 edge cases → T2/T3. `08` §5.1/RPT → T5; §6 Giving/Paystack settings → T6; §7 emails → T2/T3. Acceptance 5.4/5.5/5.8-slice → T6.
- Placeholders: none — exact files, functions, formats, commands.
- Type consistency: `givingProjects`/`transactions`/`paymentEvents` exports; kobo ints everywhere; references `MVD-…`, receipts `MVD-RCP-…`; event_key unique for idempotency; `project_id` present IFF type=project (09 rule 2).
