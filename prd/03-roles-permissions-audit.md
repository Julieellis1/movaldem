# 03 — Roles, Permissions, Authentication and Audit

**Depends on:** 00-README, 02-architecture-and-nfr
**Audience:** Engineering (auth/RBAC), QA

## 1. Roles

| Role key | Type | Summary |
|----------|------|---------|
| `visitor` | Implicit | Not logged in. |
| `member` | Public account | Registered quiz user. |
| `content_manager` | Staff | Sermons, Bible studies, Sunday school, events, programmes, gallery, media. |
| `quiz_manager` | Staff | Quizzes, questions, categories, leaderboards, quiz reports, CSV import. |
| `admin` | Staff | All content and quiz management, users (members), contact inbox, giving reports and transactions (read). |
| `super_admin` | Staff | Everything, including staff/roles, Paystack and system settings, audit logs. |

A user MAY hold more than one role (`user_roles`). Effective permissions are the union. Roles and permissions are data (tables), so new roles can be added without code changes. Permission keys follow `resource.action`.

## 2. Permission Matrix

Legend: **C** create, **R** read, **U** update, **D** delete, **P** publish/unpublish, **X** export, **–** none. Members and visitors only act on their own data (see section 3).

| Resource | content_manager | quiz_manager | admin | super_admin |
|----------|:---:|:---:|:---:|:---:|
| Sermons | CRUDP\* | – | CRUDP | CRUDP |
| Bible studies | CRUDP\* | – | CRUDP | CRUDP |
| Sunday school and series | CRUDP\* | – | CRUDP | CRUDP |
| Events | CRUDP\* | – | CRUDP | CRUDP |
| Programmes and sessions | CRUDP\* | – | CRUDP | CRUDP |
| Gallery albums and images | CRUD | – | CRUD | CRUD |
| Media library | CRUD | CRUD (quiz-related images) | CRUD | CRUD |
| About, leadership, branches | CRU | – | CRU | CRUD |
| Quiz categories | – | CRUD | CRUD | CRUD |
| Questions | – | CRUD | CRUD | CRUD |
| Quizzes | – | CRUDP | CRUDP | CRUDP |
| CSV question import | – | Yes | Yes | Yes |
| Quiz attempts | – | R, cancel | R, cancel | R, cancel |
| Leaderboards | – | R, recalculate | R, recalculate | R, recalculate |
| Quiz reports | – | R, X | R, X | R, X |
| Giving projects | – | – | CRUD | CRUD |
| Transactions | – | – | R, X | R, X, re-verify |
| Giving reports | – | – | R, X | R, X |
| Members (users) | – | R (limited) | R, U (suspend/restore) | CRUD |
| Staff accounts and roles | – | – | – | CRUD |
| Contact messages | – | – | R, U, D | R, U, D |
| Site settings (general, SEO, email, quiz, leaderboard) | – | Quiz/leaderboard only | R, U | R, U |
| Paystack and storage credentials | – | – | – | R (masked), U |
| Audit logs | – | – | R (own scope, optional) | R, X |

\* When the `content.require_review` setting is **on**, Content Managers can move content only up to `review`. Publishing then requires Admin or Super Admin. When **off** (default), Content Managers can publish directly.

**PERM-01** Every admin route and API MUST check permissions server-side using the keys in the seed data. The UI hides controls the user cannot use, but hiding is never the control.
**PERM-02** Super Admin cannot remove their own last Super Admin role. There must always be at least one active Super Admin.
**PERM-03** Role and permission changes are audit-logged.

## 3. Ownership Rules for Public Accounts

| Rule | Detail |
|------|--------|
| A member can read and update only their own profile, attempts, results and transactions (linked by `user_id`). |
| A member can read public leaderboards but only sees others' display names according to those users' privacy choices. |
| Guest givers have no account. Their receipt is accessed by a signed, expiring link (see `06`). |

## 4. Authentication Requirements

| ID | Requirement |
|----|-------------|
| AUTH-01 | Registration for members: full name, email, phone, password, confirm password. Optional: church, age range, gender. Consent checkbox required. |
| AUTH-02 | Email is unique (case-insensitive). Phone is validated as a Nigerian number (`+234XXXXXXXXXX` or `0XXXXXXXXXX`) but stored normalised to E.164. International numbers MAY be allowed by a setting. |
| AUTH-03 | Email verification via single-use expiring link. Setting `quiz.require_verified_email` (default **on**) controls whether unverified users can start quizzes. |
| AUTH-04 | Login with email + password. Staff and members use the same login; staff are redirected to `/admin` when appropriate. |
| AUTH-05 | Password reset with expiring single-use token. Generic response whether or not the email exists. |
| AUTH-06 | Suspended or deactivated accounts cannot log in. Existing sessions are invalidated on suspension. |
| AUTH-07 | Staff accounts are created by a Super Admin (invite by email with forced password set). Members cannot self-assign roles. |
| AUTH-08 | Optional TOTP two-factor for staff. Setting `auth.require_2fa_for_staff` (default off). |
| AUTH-09 | Members can update profile, change password, and choose leaderboard display mode (full name or abbreviated). |
| AUTH-10 | Members can request account deletion (see `02` PRV-06). |

## 5. Audit Logging

Important administrative and security-relevant actions MUST be recorded, append-only.

**Record fields:** `id`, `actor_user_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `changes` (before/after JSON, secrets redacted), `ip_hash` (or IP where justified), `user_agent`, `created_at`.

**Actions that MUST be logged (minimum):**

| Area | Actions |
|------|---------|
| Content | create, update, publish, unpublish, schedule, archive, delete (sermons, Bible studies, Sunday school, events, programmes, gallery, pages) |
| Media | upload, replace, delete |
| Quiz | create/update/publish/archive quiz, delete question, category changes, CSV import (file name, row counts), attempt cancelled, leaderboard recalculated |
| Giving | project create/update/status change/target change, transaction re-verify, manual refund flag |
| Users | staff account create/disable, role change, member suspend/restore |
| Settings | any change (secrets logged as "changed", never values), Paystack mode switch |
| Security | failed-login lockouts, password resets completed, 2FA changes |

**AUD-01** Audit logs are read-only in the UI (filter by actor, action, entity, date range; export CSV for Super Admin).
**AUD-02** Audit logs are never deletable through the application.
**AUD-03** Retention default: 24 months (setting).
