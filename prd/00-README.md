# MOVALDEM Digital Ministry Platform — PRD Pack

**Organization:** Mountain of Victory at the Last Day Evangelical Ministry (MOVALDEM)
**Product:** Church website + digital ministry + online giving (Paystack) + Bible quiz platform
**Primary locale:** Nigeria (English, NGN, Africa/Lagos timezone)

This pack replaces the single long PRD. Each file covers one concern so an AI coding agent (or a human) can load only what it needs for the task at hand.

## 1. Document Index

| # | File | Purpose |
|---|------|---------|
| 00 | `00-README.md` | Index, conventions, decisions log, open questions |
| 01 | `01-product-overview.md` | Vision, goals, users, scope (V1 vs future) |
| 02 | `02-architecture-and-nfr.md` | Stack, module boundaries, security, performance, accessibility, config |
| 03 | `03-roles-permissions-audit.md` | Roles, permission matrix, authentication, audit logging |
| 04 | `04-public-website.md` | Sitemap, routes, design direction, page specs, search, SEO, sharing |
| 05 | `05-cms-content-modules.md` | Sermons, Bible studies, Sunday school, media, events, programmes, gallery |
| 06 | `06-giving-payments.md` | Paystack giving, projects, verification, receipts |
| 07 | `07-bible-quiz.md` | Quiz engine, CSV import, scoring, leaderboards |
| 08 | `08-admin-dashboard-reports-settings.md` | Admin UI, reports, settings, contact inbox, emails |
| 09 | `09-data-model.md` | All entities, fields, relationships |
| 10 | `10-delivery-plan-and-acceptance.md` | Build phases, Definition of Done, acceptance tests, AI agent rules |

## 2. Reading Order and Context Loading (for the AI IDE)

Always load `00`, `02` and `09` first. Then load the documents for the current phase.

| Phase | Work | Load these documents |
|-------|------|----------------------|
| 1 | Setup, auth, database, admin shell | 02, 03, 08 (admin shell only), 09 |
| 2 | CMS: sermons, Bible study, Sunday school, media | 05, 04 (listing and detail pages), 09 |
| 3 | Events, programmes, gallery | 05, 04, 09 |
| 4 | Giving, projects, receipts | 06, 08 (reports), 09 |
| 5 | Quiz engine, CSV import, attempts, scoring | 07, 09 |
| 6 | Leaderboards, quiz analytics | 07, 08 (reports), 09 |
| 7 | SEO, search, performance, security, testing | 02, 04, 10 |

## 3. Conventions

**Requirement keywords.** MUST = mandatory for V1. SHOULD = expected unless there is a good reason not to. MAY = optional. Requirements marked **[Future]** are out of scope for V1.

**Requirement IDs.** Every requirement has an ID (`CMS-03`, `GIV-12`, `QUIZ-27`). Reference them in commits, tests and task lists.

**Global rules (apply everywhere):**

| Topic | Rule |
|-------|------|
| Timezone | Store all timestamps in UTC. Display and compute periods in `Africa/Lagos` (WAT, UTC+1). |
| Currency | NGN only in V1. Store money as **integer kobo** (₦1 = 100 kobo). Format as `₦10,000.00` in the UI. |
| Weeks | ISO 8601 weeks, Monday start. Week key format `2026-W38`. |
| IDs | UUID (or equivalent) primary keys. Public URLs use unique slugs. |
| Deletion | Content uses soft delete. Payment, quiz-attempt and audit data is never hard-deleted. |
| Server authority | Payments, quiz timers, scoring, permissions and uploads are always validated server-side. |
| Unspecified rules | Do not invent business rules. Implement as a configurable setting with the documented default (see `08`, Settings). |
| Language | English in V1. Keep UI strings centralised to allow later translation (Yoruba, Igbo, Hausa, Pidgin are plausible future locales). |

## 4. Decisions Log (what changed from the original draft)

The original PRD was a single document with gaps and inconsistencies. These were resolved as follows. Change any of them by editing this table and the referenced document.

| # | Issue in original | Resolution | Where |
|---|-------------------|------------|-------|
| D1 | "Custom Post Type" is WordPress terminology, but the stack is undefined. | Reworded to framework-neutral "content types". A default stack is recommended but overridable. | 02, 05 |
| D2 | Content had separate `audio_url`, `video_url`, `pdf_url`, `external_video_url` fields, while the relationships section said "Sermon → Media". | Content references `media` records (uploaded or external URL). One media model, one upload/validation path. | 05, 09 |
| D3 | Quiz categories overlapped (Old Testament vs Pentateuch, Historical Books, etc.) with no hierarchy. | Categories are hierarchical (`parent_id`). A category quiz includes descendants. | 07, 09 |
| D4 | Scoring conflict: "correct = question marks" vs quiz setting `positive_marks = 1`. | Correct answer awards `question.marks` (default 1). Quiz has only `negative_marks` (default 0). `positive_marks` removed. | 07 |
| D5 | Leaderboard "total points" ranking was undefined (best attempt? all attempts?). | Defined: best attempt per quiz per period, summed. Configurable. Explicit tie-breakers. | 07 |
| D6 | Attempt status `expired` was undefined. | `expired` = auto-submitted at timeout and scored normally. `cancelled` = admin-voided and excluded. | 07 |
| D7 | Quiz-to-question relationship missing (no pivot for fixed quizzes, no place to persist randomisation). | Added `quiz_questions` and `quiz_attempt_questions` (persisted order and snapshot). | 07, 09 |
| D8 | Randomisation and attempt-limit settings were described but absent from quiz fields. | Added to the `quizzes` entity. | 07, 09 |
| D9 | Sermon series and Bible-study series were filters with no entity. | Added shared `series` entity for sermons, Bible studies and Sunday school. | 05, 09 |
| D10 | Only Super Admin and Admin were described in "Target Users", but four roles appear later. | Unified into one role list with a permission matrix. | 03 |
| D11 | Content workflow (Draft → Review → Published) didn't say who reviews. | `content.require_review` setting (default off). When on, Content Managers cannot publish. | 03, 05 |
| D12 | Paystack secret key managed from admin settings. | Environment variable is preferred. If stored in the DB, encrypted at rest, write-only in the UI. Only Super Admin can change it. | 06, 08 |
| D13 | Payment amounts had no unit. | Kobo integers. Server checks amount and currency against Paystack's verify response. | 06 |
| D14 | Giving form listed Phone as a field without saying whether required. | Name, email, amount, type required. Phone and message optional (configurable). | 06 |
| D15 | Refunds appear as a status but no process defined. | V1 records refund status (from webhook or manual admin flag). Refunds are initiated in the Paystack dashboard. | 06 |
| D16 | "Visitor can register for quizzes" conflicts with "registered users take quizzes". | Visitors can browse the quiz landing page. Taking a quiz requires an account (email verification configurable). | 01, 07 |
| D17 | Download tracking stored raw IP addresses. | Store salted hash of IP (privacy, NDPA-aligned). | 05, 02 |
| D18 | Non-functional and security items were scattered and repeated. | Consolidated in `02`. | 02 |
| D19 | Duplicated sections (media availability, giving component, services) mentioned in several places. | Each defined once and cross-referenced. | 04, 05, 06 |
| D20 | UI direction said "avoid emoji" but examples used symbols. | Examples now use text labels. Icons are optional and sparse. | 04 |
| D21 | Conversational preface ("Absolutely...") and stray formatting. | Removed. | all |

## 5. Open Questions (need a MOVALDEM answer before or during build)

Defaults are used where an answer is missing. None blocks Phase 1.

| # | Question | Default assumed |
|---|----------|-----------------|
| Q1 | Church slogan/motto, logo, brand colours, fonts | Placeholders, configurable in Settings |
| Q2 | Who are the leaders (names, photos, bios) and branches? | Managed in CMS; seeded empty |
| Q3 | Preferred hosting, database and storage provider? | See recommended stack in `02` |
| Q4 | Where will videos be hosted (YouTube/Vimeo/self-hosted)? | External embed URL preferred to save bandwidth |
| Q5 | Are offline gifts (cash/transfer to church account) to be counted in project totals? | No. Project totals = verified Paystack transactions only |
| Q6 | Minimum and maximum single online gift? | Min ₦100, max unset, both configurable |
| Q7 | Are minors (under 18) allowed to register for quizzes? Parental consent needed? | Allowed with age-range field; confirm against NDPA guidance |
| Q8 | Email provider (SMTP/Resend/SendGrid/Zoho)? | SMTP-compatible adapter |
| Q9 | Is admin two-factor authentication required? | Optional in V1, strongly recommended for Super Admin |
| Q10 | Prizes or rewards for leaderboard winners? | None. Leaderboards are informational only |
| Q11 | Should tithe donors be able to give anonymously on public project pages? | Not shown publicly. Donor names are never displayed on project pages in V1 |
| Q12 | Paystack account: business verified, live keys available? | Test mode until confirmed |
