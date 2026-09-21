# 09 — Data Model

**Depends on:** 00-README (global conventions), all module documents
**Audience:** Engineering (schema, migrations), AI coding agent

## 1. Conventions

- Primary keys: UUID (`id`). Foreign keys named `<entity>_id`.
- Timestamps in UTC: `created_at`, `updated_at`; soft delete via `deleted_at` where marked (SD).
- Money: integer **kobo**. Currency column `currency` = `NGN`.
- Enums implemented as DB enums or constrained text.
- Every foreign key is indexed. Slugs have unique indexes (per type where noted).
- Types: `str` text, `int`, `bool`, `ts` timestamp, `date`, `time`, `json`, `dec` decimal, `fk` foreign key.
- Nullable fields are marked `?`.

## 2. Entity Overview

```text
users ─┬─ user_roles ── roles ── role_permissions ── permissions
       ├─ quiz_attempts ── quiz_attempt_questions
       │        └─ quiz_answers
       ├─ leaderboard_entries ── quiz_periods
       └─ transactions ── payment_events
                 └─ giving_projects

media ── (referenced by sermons, bible_studies, sunday_school_lessons,
          events, programmes, gallery_images, giving_projects, series, leaders)

series ── sermons | bible_studies | sunday_school_lessons
content_categories ── sermons | bible_studies
tags ── taggables (polymorphic)

programmes ── programme_sessions        events ── (optional programme_id)
gallery_albums ── gallery_images

quiz_categories (tree) ── questions ── question_options
quizzes ── quiz_questions ── questions
quizzes ── quiz_attempts
quiz_import_batches ── quiz_import_rows

settings, audit_logs, notifications, contact_messages, site_pages, leaders, branches, redirects
```

## 3. Identity and Access

**users** (SD)
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | |
| full_name | str | |
| email | str | Unique, case-insensitive |
| phone | str? | E.164 |
| password_hash | str | |
| email_verified_at | ts? | |
| status | enum | `active`, `suspended`, `deactivated` |
| church | str? | Optional |
| age_range | str? | Configurable list |
| gender | str? | Optional |
| avatar_media_id | fk? | |
| leaderboard_display | enum | `full`, `abbreviated` (default `abbreviated`) |
| consent_at | ts | Registration consent |
| totp_secret_enc | str? | If 2FA enabled |
| last_login_at | ts? | |

**roles**: `id`, `key` (unique), `name`, `description`, `is_system`.
**permissions**: `id`, `key` (unique, `resource.action`), `description`.
**role_permissions**: `role_id`, `permission_id` (PK pair).
**user_roles**: `user_id`, `role_id` (PK pair), `assigned_by`, `assigned_at`.
**auth_tokens**: `id`, `user_id`, `type` (`email_verify`, `password_reset`, `staff_invite`), `token_hash`, `expires_at`, `used_at?`.
**sessions**: `id`, `user_id`, `token_hash`, `ip_hash`, `user_agent`, `expires_at`, `revoked_at?`.

## 4. Media

**media**
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | |
| kind | enum | `image`, `audio`, `video`, `document`, `external_video` |
| source | enum | `uploaded`, `external_url` |
| title | str? | |
| alt_text | str? | Images |
| original_filename | str? | |
| storage_key | str? | Uploaded files |
| external_url | str? | External video/link (validated host) |
| public_url | str | Resolved CDN/storage URL |
| mime_type | str? | |
| size_bytes | int? | |
| duration_seconds | int? | |
| width, height | int? | |
| uploaded_by | fk | |
| created_at | ts | |
| deleted_at | ts? | SD |

**media_downloads**: `id`, `content_type`, `content_id`, `media_id`, `user_id?`, `ip_hash`, `user_agent`, `downloaded_at`. Index on (`content_type`, `content_id`) and `downloaded_at`.

## 5. Content

**series**: `id`, `type` (`sermon`, `bible_study`, `sunday_school`), `title`, `slug`, `description`, `cover_media_id?`, `start_date?`, `end_date?`, `sort_order`, timestamps. Unique (`type`, `slug`).
**content_categories**: `id`, `type` (`sermon`, `bible_study`), `name`, `slug`, `sort_order`, `is_active`. Unique (`type`, `slug`).
**tags**: `id`, `name`, `slug` (unique). **taggables**: `tag_id`, `taggable_type`, `taggable_id`.

**Shared columns** for `sermons`, `bible_studies`, `sunday_school_lessons` (SD):

`id`, `title`, `slug` (unique), `description`, `featured_media_id?`, `audio_media_id?`, `video_media_id?`, `document_media_id?`, `download_enabled`, `series_id?`, `category_id?`, `is_featured`, `status` (`draft`,`review`,`scheduled`,`published`,`archived`), `published_at?`, `seo_title?`, `seo_description?`, `og_media_id?`, `created_by`, `updated_by`, timestamps, `deleted_at?`. Add full-text search vector (title, description, preacher/teacher, scripture, topic).

| Table | Extra columns |
|-------|---------------|
| **sermons** | `preacher`, `sermon_date`, `scripture_reference?` |
| **bible_studies** | `teacher`, `study_date`, `scripture_reference?`, `lesson_number?` |
| **sunday_school_lessons** | `lesson_number`, `lesson_date`, `topic`, `memory_verse?`, `introduction?`, `teacher?`, `series_id` required. Unique (`series_id`, `lesson_number`) |

**events** (SD): `id`, `title`, `slug`, `description`, `featured_media_id?`, `start_date`, `end_date?`, `start_time?`, `end_time?`, `venue?`, `address?`, `organizer?`, `contact_phone?`, `is_featured`, `registration_enabled`, `registration_url?`, `programme_id?`, `status`, `published_at?`, SEO fields, timestamps.
**programmes** (SD): `id`, `title`, `slug`, `description`, `start_date`, `end_date`, `venue?`, `featured_media_id?`, `status`, `published_at?`, SEO fields, timestamps.
**programme_sessions**: `id`, `programme_id`, `title`, `date`, `start_time?`, `end_time?`, `speaker?`, `description?`, `sort_order`.
**gallery_albums** (SD): `id`, `title`, `slug`, `description?`, `cover_media_id?`, `event_id?`, `album_date?`, `status`, timestamps.
**gallery_images**: `id`, `album_id`, `media_id`, `caption?`, `alt_text?`, `sort_order`.
**site_pages**: `key` (unique), `title`, `body`, `updated_by`, `updated_at`.
**leaders**: `id`, `name`, `title`, `bio?`, `photo_media_id?`, `sort_order`, `is_visible`.
**branches**: `id`, `name`, `address`, `phone?`, `email?`, `service_times?`, `map_url?`, `sort_order`, `is_visible`.
**redirects**: `from_path` (unique), `to_path`, `status_code` (301).
**contact_messages**: `id`, `name`, `email`, `phone?`, `subject`, `message`, `status` (`new`,`read`,`archived`), `ip_hash`, `created_at`, `deleted_at?`.

## 6. Giving

**giving_projects** (SD): `id`, `title`, `slug`, `description`, `featured_media_id?`, `target_amount` (kobo), `amount_raised_cached` (kobo, derived), `start_date?`, `end_date?`, `status` (`draft`,`active`,`completed`,`closed`), timestamps.

**transactions** (never hard-deleted)
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | |
| reference | str | Unique. Server-generated |
| paystack_reference | str? | From Paystack |
| user_id | fk? | Null for guests |
| name, email, phone? | str | |
| message | str? | |
| amount | int | Kobo |
| currency | str | `NGN` |
| type | enum | `tithe`, `offering`, `general`, `project` |
| project_id | fk? | Required if type = `project` |
| status | enum | `pending`, `successful`, `failed`, `abandoned`, `refunded` |
| payment_method | str? | e.g. card, bank_transfer, ussd |
| failure_reason | str? | |
| receipt_number | str? | Unique |
| receipt_sent_at | ts? | |
| paid_at | ts? | |
| ip_hash | str? | |
| created_at, updated_at | ts | |

Indexes: `reference` (unique), (`status`, `created_at`), `project_id`, `user_id`, `email`.

**payment_events**: `id`, `transaction_id?`, `source` (`webhook`, `verify`, `admin`), `event_type`, `event_key` (unique, for idempotency), `payload` (json), `signature_valid` (bool), `processed` (bool), `error?`, `received_at`.

## 7. Quiz

**quiz_categories**: `id`, `parent_id?`, `name`, `slug` (unique), `sort_order`, `is_active`. Unique (`parent_id`, `name`).

**questions** (SD): `id`, `category_id`, `text`, `text_normalized` (for duplicate detection), `difficulty` (`easy`,`medium`,`hard`), `marks` (dec, default 1), `explanation?`, `ref_book?`, `ref_chapter?`, `ref_verse_start?`, `ref_verse_end?`, `ref_display?`, `status` (`draft`,`active`,`archived`), `type` (`multiple_choice`), `import_batch_id?`, `created_by`, timestamps.
**question_options**: `id`, `question_id`, `label` (`A`–`D`), `text`, `is_correct`, `sort_order`. Constraint: exactly one correct option per multiple-choice question.

**quizzes** (SD): `id`, `title`, `slug`, `description?`, `instructions?`, `kind`, `category_id?`, `include_subcategories`, `question_selection` (`fixed`,`random_pool`), `number_of_questions`, `duration_minutes`, `pass_mark_percent`, `negative_marks` (dec), `randomize_questions`, `randomize_options`, `max_attempts?`, `review_policy`, `leaderboard_eligible`, `start_at?`, `end_at?`, `status`, `created_by`, timestamps.
**quiz_questions** (fixed selection): `quiz_id`, `question_id`, `sort_order`. PK (`quiz_id`, `question_id`).

**quiz_attempts** (never hard-deleted)
| Field | Type | Notes |
|-------|------|-------|
| id | uuid | |
| quiz_id, user_id | fk | |
| attempt_number | int | 1-based per user per quiz |
| status | enum | `in_progress`, `submitted`, `expired`, `cancelled` |
| submission_type | enum? | `manual`, `auto_timeout`, `admin` |
| started_at | ts | |
| expires_at | ts | Server-computed |
| submitted_at | ts? | |
| score, max_score | dec? | |
| percentage | dec? | |
| correct_count, wrong_count, unanswered_count | int? | |
| time_taken_seconds | int? | |
| passed | bool? | |
| cancelled_reason | str? | |
| ip_hash, user_agent | | |

Constraints: **partial unique index** on (`user_id`, `quiz_id`) where `status = 'in_progress'`. Index on (`quiz_id`, `status`), (`user_id`, `submitted_at`), `submitted_at`.

**quiz_attempt_questions**: `id`, `attempt_id`, `question_id`, `position`, `option_order` (json array of option ids), `marks` (snapshot), `snapshot` (json: text, options as shown, correct option label, explanation, reference). Unique (`attempt_id`, `position`).
**quiz_answers**: `id`, `attempt_id`, `question_id`, `selected_option_id?`, `is_correct?`, `marks_awarded?`, `answered_at`, `updated_at`. Unique (`attempt_id`, `question_id`).

**quiz_periods**: `id`, `type` (`weekly`,`monthly`,`annual`), `key` (`2026-W38`, `2026-09`, `2026`), `starts_at`, `ends_at`, `status` (`open`,`closed`), `closed_at?`. Unique (`type`, `key`).
**leaderboard_entries**: `id`, `period_id`, `category_id?` (null = overall, reserved for later), `user_id`, `rank`, `total_points` (dec), `accuracy` (dec), `correct_answers`, `questions_answered`, `quizzes_taken`, `avg_time_seconds`, `best_reached_at`, `finalized` (bool), `updated_at`. Unique (`period_id`, `category_id`, `user_id`). Index (`period_id`, `rank`).

**quiz_import_batches**: `id`, `uploaded_by`, `file_name`, `status` (`parsed`, `confirmed`, `cancelled`, `completed`), `total_rows`, `valid_rows`, `invalid_rows`, `duplicate_rows`, `imported_rows`, `target_quiz_id?`, `auto_create_categories`, `confirmed_at?`, `created_at`.
**quiz_import_rows**: `id`, `batch_id`, `row_number`, `raw` (json), `status` (`valid`,`invalid`,`duplicate`), `errors` (json), `question_id?`.

## 8. Platform

**settings**: `key` (unique), `value` (json), `is_secret` (bool, value encrypted), `updated_by`, `updated_at`.
**audit_logs**: `id`, `actor_user_id?`, `actor_role?`, `action`, `entity_type`, `entity_id?`, `changes` (json), `ip_hash`, `user_agent`, `created_at`. Append-only (no update/delete in application code).
**notifications**: `id`, `channel` (`email`), `type`, `recipient`, `payload` (json), `status` (`queued`,`sent`,`failed`), `attempts`, `last_error?`, `created_at`, `sent_at?`.

## 9. Key Integrity Rules

1. `transactions.reference` unique. `payment_events.event_key` unique.
2. A `project` transaction must have `project_id`. Other types must not.
3. Exactly one `in_progress` attempt per user per quiz (partial unique index).
4. `quiz_answers` unique per attempt and question. Updates rejected once attempt is not `in_progress`.
5. Leaderboard entries of `finalized = true` periods are immutable except by audited Super Admin correction.
6. Media cannot be deleted while referenced.
7. Questions, quizzes and categories referenced by attempts cannot be hard-deleted.
8. At least one active `super_admin` always exists.
