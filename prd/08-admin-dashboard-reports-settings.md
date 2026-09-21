# 08 — Admin Dashboard, Reports, Settings and Notifications

**Depends on:** 00-README, 03 (permissions), 09
**Related:** 05, 06, 07

## 1. Admin Shell

| ID | Requirement |
|----|-------------|
| ADM-01 | Admin lives under `/admin`, requires a staff role, and is `noindex`. |
| ADM-02 | Navigation items are shown per the user's permissions (see `03`). |
| ADM-03 | Responsive: usable on tablet and phone for common tasks (publish, review contacts, check transactions). |
| ADM-04 | Standard list pattern: search, filters, sort, pagination, bulk actions where sensible, status badges, empty and loading states. |
| ADM-05 | Standard form pattern: inline validation, unsaved-changes warning, success/failure toasts, audit logging. |

**Menu structure:**

```text
Dashboard

Content
  Sermons
  Bible Studies
  Sunday School (Lessons, Series)
Events
Programmes
Gallery

Quiz
  Quizzes
  Questions
  Categories
  Attempts
  Leaderboards
  CSV Import
  Reports

Giving
  Transactions
  Projects
  Reports

Users (Members, Staff)
Contact Messages
Media Library
Pages (About, Leadership, Branches)

Settings
Audit Logs
```

## 2. Dashboard

Summary cards (role-aware; hide what the role cannot access):

| Card | Definition |
|------|------------|
| Total sermons / Bible studies / Sunday school lessons | Published counts (with drafts count) |
| Upcoming events | Events with start date ≥ today |
| Registered users | Members with verified/unverified split |
| Quiz participants | Distinct users with ≥1 submitted attempt |
| Total quiz attempts | Submitted + expired |
| Successful donations | Count of `successful` transactions |
| Total giving | Sum of `successful` amounts (NGN), with period switch (today, week, month, year) |
| Active projects | Projects with status `active` |

Also: recent activity (latest transactions, latest registrations, unread contact messages), pending review items, top downloads, quick actions (New sermon, New quiz, Import questions). Warnings shown when relevant: Paystack in test mode, webhook not received recently, email failures, jobs not running.

## 3. Users Management

| ID | Requirement |
|----|-------------|
| USR-01 | Members list: search (name, email, phone), filters (status, verified, registered date), detail page with profile, attempts summary and transactions (Admin/Super Admin). |
| USR-02 | Actions: suspend, restore, resend verification email, trigger password reset email, export CSV (Admin+). Suspension invalidates sessions. |
| USR-03 | Staff management (Super Admin only): invite staff, assign/remove roles, disable, force password reset. |
| USR-04 | Roles page (Super Admin): view roles and their permissions. Editing role permissions is allowed but logged. System roles cannot be deleted. |

## 4. Contact Inbox

Fields captured: name, email, phone, subject, message, received_at, IP hash. Statuses: `new`, `read`, `archived`. Actions: view, mark read/unread, archive, delete (Admin+), reply via mailto link. Email notification to the configured recipient on new message. Unread count badge in the menu.

## 5. Reports

All reports use `Africa/Lagos` for date boundaries, respect permissions, paginate on screen, and support export.

### 5.1 Giving Reports (Admin, Super Admin)

| Measure | Notes |
|---------|-------|
| Total giving | Sum of successful transactions |
| By type | Tithe, Offering, General, Project (and per project) |
| Counts and average gift | |
| Status breakdown | Successful, failed, abandoned, refunded |
| Trend | By day/week/month |
| Filters | Today, This week, This month, This year, Custom range; type; project; status |
| Export | CSV, Excel (.xlsx), PDF |

**RPT-01** Reports count only `successful` transactions in totals. Refunded amounts are shown separately.
**RPT-02** Exports include a header with generated date/time, filters applied and the generating admin. Financial exports are audit-logged.

### 5.2 Quiz Reports (Quiz Manager, Admin, Super Admin)

Total participants, total attempts, average/highest/lowest score, most popular categories, question analytics (attempts, correct %, incorrect %), hardest/easiest questions, per-quiz summary, participation over time. Export CSV. See `07` section 11.

### 5.3 Content Reports (Content Manager, Admin, Super Admin)

Most downloaded sermons, Bible studies and Sunday school lessons (by period), content published per month, drafts pending review.

## 6. Settings

Grouped tabs. Secrets are **write-only**: shown masked (e.g. `sk_live_••••1234`) after saving, replaceable but never revealed. Changes are audit-logged (values of secrets are never logged).

| Group | Settings (key → default) | Who can edit |
|-------|--------------------------|--------------|
| **General** | Church name, logo, favicon, address, phone, email, social links, service times, map link | Admin, Super Admin |
| **Branding** | Primary/secondary colours, slogan/motto, hero image and text | Admin, Super Admin |
| **Content** | `content.require_review` → off; `content.items_per_page` → 12; download button policy | Admin, Super Admin |
| **SEO** | Site title template, default meta description, default Open Graph image, Google Analytics/Search Console IDs | Admin, Super Admin |
| **Giving** | `giving.min_amount` → ₦100; `giving.max_amount` → unset; `giving.require_phone` → off; `giving.abandon_after_minutes` → 60; receipt footer text | Admin (non-secret), Super Admin |
| **Paystack** | Secret key, public key (env preferred), mode indicator, webhook URL (read-only, copyable) | Super Admin only |
| **Quiz** | `quiz.require_verified_email` → on; default pass mark; default duration; grace seconds → 5; import limits (2 MB / 1,000 rows); min attempts for question analytics → 10 | Quiz Manager, Admin, Super Admin |
| **Leaderboard** | `leaderboard.attempt_counting` → best_per_quiz; `leaderboard.min_attempts` → 1; `leaderboard.default_display` → abbreviated; `leaderboard.force_abbreviated` → off; `leaderboard.page_size` → 50 | Quiz Manager, Admin, Super Admin |
| **Email** | Sender name/address, SMTP/provider credentials, contact recipient, test-email button | Super Admin |
| **Storage** | Driver, bucket, CDN base URL, credentials (env preferred), upload size limits | Super Admin |
| **Security** | `auth.require_2fa_for_staff` → off; session lifetime; password policy | Super Admin |
| **Privacy** | Audit-log retention (24 months); account deletion policy text | Super Admin |

## 7. Notifications and Emails

`NotificationService` is channel-based (email in V1). Future channels (SMS, WhatsApp, web push) plug in without changing callers.

| Email | Trigger | Recipient |
|-------|---------|-----------|
| Verify email | Registration | Member |
| Password reset | Request | Member/Staff |
| Staff invitation | Staff created | Staff |
| Giving receipt | Payment successful | Donor |
| Payment failed/pending notice (optional) | Failure | Donor |
| Contact form notification | New message | Configured recipient |
| Quiz result summary (optional) | Attempt submitted | Member (setting, default off) |
| Admin alert | Verification mismatch, repeated webhook signature failure | Super Admin |

**NTF-01** Emails are sent asynchronously with retry and logged (`notifications` table with status, attempts, error).
**NTF-02** Templates are HTML plus plain text, branded, mobile-friendly, stored in code with settings-driven header/footer.
**Future events (design for, do not build):** new sermon, new Sunday school lesson, new Bible study, quiz available, event reminder.

## 8. Audit Logs UI

Super Admin sees filterable, exportable logs (see `03` section 5). Admin may see a limited view of content and quiz actions if enabled.
