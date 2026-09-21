# 06 — Giving and Payments (Paystack)

**Depends on:** 00-README, 02, 03, 09
**Related:** 04 (giving UI), 08 (reports, settings)

> Paystack API details (endpoints, event names, signature header) change over time. The implementing agent MUST check the current Paystack documentation before coding and follow it where it differs from this file. The behavioural requirements below stay the same.

## 1. Giving Types

| Type key | Label | Notes |
|----------|-------|-------|
| `tithe` | Tithe | |
| `offering` | Offering | |
| `general` | General Giving | |
| `project` | Support a Project | Requires `project_id` of an active project |

## 2. Giving Flow (user view)

1. User opens `/give` (or clicks Tithe / Offering / Give / Support a Project on the homepage, which pre-selects the type).
2. Chooses giving type. If `project`, a project selector appears (only active projects).
3. Enters details:

| Field | Required | Validation |
|-------|----------|------------|
| Giving type | Yes | One of the keys above |
| Project | Only for `project` | Must be active and within its date range |
| Amount (NGN) | Yes | Positive number, max 2 decimals, within `giving.min_amount` (default ₦100) and optional `giving.max_amount` |
| Full name | Yes | |
| Email | Yes | Valid email. Paystack needs it. Receipt is sent here |
| Phone | No (setting `giving.require_phone`, default off) | Nigerian format |
| Message | No | Max 500 characters |

4. Clicks **Proceed to Payment**. The server creates a pending transaction and returns the Paystack checkout URL (or access code for the inline popup). The user completes payment on Paystack.
5. User returns to `/give/confirmation?reference=...`. The page shows a pending state and polls the server, which has verified the transaction with Paystack. It then shows success, failure or abandoned with clear next steps (retry, contact).
6. On success: receipt shown (view, print, download PDF) and emailed.

Logged-in members have name, email and phone prefilled and their transactions linked to `user_id`. Guest giving is allowed.

## 3. Server Flow (source of truth)

```text
Browser --(1) POST /api/giving/checkout--> Server
Server  creates Transaction(status=pending, reference=MVD-...)
Server  --(2) Paystack: initialize transaction--> Paystack
Server  <-- authorization_url / access_code
Browser --(3) pays on Paystack checkout-->
Paystack --(4a) redirect to /give/confirmation?reference=...--> Browser
Paystack --(4b) webhook POST /api/webhooks/paystack--> Server
Server  --(5) verify with Paystack (server-to-server)--> Paystack
Server  updates Transaction, records PaymentEvent, sends receipt
```

| ID | Requirement |
|----|-------------|
| GIV-01 | The transaction is created **before** redirecting to Paystack, with a server-generated unique `reference` (e.g. `MVD-<yyyymmdd>-<random>`). The client never chooses the reference or amount after creation. |
| GIV-02 | Amount is sent to Paystack in **kobo** (integer). Currency is `NGN`. |
| GIV-03 | The frontend callback/redirect **never** marks a payment successful. Only the server does, after verification. |
| GIV-04 | Verification checks all of: Paystack status is `success`; `reference` matches; `amount` equals the stored amount; `currency` equals `NGN`. Mismatch = flag transaction `failed` with reason and alert Admin. Never mark successful. |
| GIV-05 | Webhook endpoint reads the **raw request body**, computes HMAC-SHA512 with the Paystack secret key, and compares to the `x-paystack-signature` header using a constant-time comparison. Invalid signatures are rejected (HTTP 401/400) and logged. |
| GIV-06 | Webhook responds HTTP 200 quickly. Heavy work (email, receipt) happens asynchronously. |
| GIV-07 | Idempotency: processing the same event or reference twice never double-counts, double-emails or double-updates. Enforce with a unique constraint on `transactions.reference` and a unique key on stored events; check current status before transition. |
| GIV-08 | Every webhook and verification response is stored in `payment_events` (raw payload, event type, signature valid flag, processed flag, received_at) for audit. |
| GIV-09 | Handled webhook events: successful charge, and refund events (refund processed/failed). Unknown events are stored and ignored. |
| GIV-10 | **Reconciliation job:** every 10 minutes, verify transactions that are `pending` and older than 10 minutes (default). Mark `abandoned` once Paystack reports no payment and the transaction is older than `giving.abandon_after_minutes` (default 60). Protects against lost webhooks. |
| GIV-11 | Status transitions allowed: `pending` → `successful` \| `failed` \| `abandoned`; `abandoned` → `successful` (late payment); `successful` → `refunded`. No other transitions. Each is logged. |
| GIV-12 | Rate-limit checkout creation per IP and per email. |
| GIV-13 | Test/live mode is determined by the configured keys. The admin UI shows a clear "Test mode" banner when test keys are active. |

## 4. Transaction Statuses

| Status | Meaning |
|--------|---------|
| `pending` | Created, awaiting payment result |
| `successful` | Verified by server with Paystack |
| `failed` | Payment failed or verification mismatch |
| `abandoned` | User never completed payment |
| `refunded` | Refund recorded (V1: recorded from webhook or by Admin flag; refunds themselves are issued from the Paystack dashboard) |

Only `successful` transactions count in totals and project progress. Refunded amounts are shown separately and excluded from "raised".

## 5. Projects (Fundraising)

Admins create projects such as Church Building Project, Youth Conference, Mission Outreach, Sound Equipment.

| Field | Notes |
|-------|-------|
| `title`, `slug`, `description` (rich text) | |
| `featured_image_id` | |
| `target_amount` (kobo) | Required, positive |
| `start_date`, `end_date` | End optional |
| `status` | `draft`, `active`, `completed`, `closed` |
| `amount_raised` | **Derived**: sum of `successful` transactions for the project. May be cached (materialised on payment success and periodic recompute) but is never manually edited |

Public project card and page:

```text
Church Building Project

Target: ₦10,000,000
Raised: ₦4,350,000
43.5%
[Support This Project]
```

| ID | Requirement |
|----|-------------|
| PRJ-01 | Percentage = raised / target, shown to 1 decimal. Progress bar caps visually at 100% while the numeric amount may exceed target. |
| PRJ-02 | Only `active` projects within their date range accept gifts. Otherwise the project is shown as closed with a message. |
| PRJ-03 | Donor names are **not** shown publicly in V1 (see Q11 in `00`). |
| PRJ-04 | Changing target, status or dates is audit-logged. |
| PRJ-05 | Offline gifts are not included in totals (see Q5 in `00`). If needed later, add a clearly labelled, audit-logged manual adjustment entity. |

## 6. Receipts

| ID | Requirement |
|----|-------------|
| RCP-01 | A receipt is generated for each successful transaction with a unique sequential number, e.g. `MVD-RCP-2026-000123`. |
| RCP-02 | Contents: church name and logo, "Giving Receipt", donor name, amount, giving type (and project name), transaction reference, Paystack reference, date and time (WAT), payment status, payment method (if provided). |
| RCP-03 | Emailed to the donor on success (HTML email with a link, and PDF attachment SHOULD be provided). |
| RCP-04 | Viewable, printable and downloadable (PDF). Guests access via a signed, expiring link. Members see receipts in their dashboard. |
| RCP-05 | Resend receipt action for Admin. Email failures are retried and logged. |
| RCP-06 | Receipts are informational acknowledgements. They are not tax documents unless MOVALDEM configures otherwise. |

## 7. Payment Security Summary

- Secret key only on the server, from environment variable (preferred) or encrypted setting. Never in client bundles, logs, or API responses.
- Public key may be exposed if the inline popup is used.
- Webhook signature validation (GIV-05), server-side verification (GIV-03/04), idempotency (GIV-07), audit records (GIV-08).
- Card data never touches MOVALDEM servers.
- All giving endpoints over HTTPS only.

## 8. Reusable Giving Component

`GivingForm` supports modes `tithe`, `offering`, `general`, `project`, and accepts an initial type and initial project. It calls one shared client (`/api/giving/checkout`). Paystack logic exists in one place, `PaymentService`. Never duplicate it across pages. `PaymentStatus` renders pending, success, failed and abandoned states with accessible live-region updates.

## 9. API Summary

| Method and path | Auth | Purpose |
|-----------------|------|---------|
| `POST /api/giving/checkout` | Public (rate-limited) | Validate, create transaction, initialise with Paystack, return checkout URL |
| `GET /api/giving/status?reference=` | Public (reference is unguessable) | Returns status only (no personal data) |
| `POST /api/webhooks/paystack` | Signature | Receive Paystack events |
| `GET /api/giving/receipt/[reference]` | Signed token or owner | Receipt view / PDF |
| `GET /api/admin/transactions` | `transactions.read` | List, filter, export |
| `POST /api/admin/transactions/[id]/reverify` | Super Admin | Force verification with Paystack |
| `POST /api/admin/transactions/[id]/resend-receipt` | Admin | Resend receipt |
| Admin CRUD `/api/admin/projects` | `projects.*` | Project management |

## 10. Admin Transactions (see also `08`)

List with filters (status, type, project, date range, amount range, search by name/email/reference), sortable columns, detail view (donor, amounts, Paystack references, event history from `payment_events`), export CSV/Excel/PDF.

## 11. Edge Cases to Handle

- User closes the tab after paying: webhook and reconciliation still complete the transaction.
- Webhook arrives before the user returns: confirmation page simply shows success.
- Duplicate webhook or duplicate click: no duplicate effects.
- Paystack outage on initialise: friendly error, transaction marked `failed`, user can retry.
- Amount tampering attempt: rejected server-side, logged.
- Project closes between checkout and payment: payment is still recorded against the project.
