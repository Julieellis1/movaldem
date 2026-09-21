# 07 — Bible Quiz Platform

**Depends on:** 00-README, 02, 03, 09
**Related:** 04 (UI components), 08 (reports)

## 1. Overview

Registered members take timed, multiple-choice Bible quizzes and compete on weekly, monthly and annual leaderboards. The quiz engine is separate from the presentation layer and built from services:

```text
QuizService, QuestionService, QuizImportService,
QuizAttemptService, ScoringService, LeaderboardService, QuizReportService
```

Quiz kinds: General, Category, Weekly, Monthly, Annual, Special.

## 2. Categories

Categories are **hierarchical** (`parent_id`). A quiz on a parent category includes questions from all descendants.

**Default seed categories:**

```text
Old Testament
  Pentateuch
  Historical Books
  Poetry
  Major Prophets
  Minor Prophets
New Testament
  Gospels
  Acts
  Pauline Epistles
  General Epistles
  Revelation
Bible Characters
Bible Geography
General Bible Knowledge
```

| ID | Requirement |
|----|-------------|
| QUIZ-01 | Admin/Quiz Manager can create, rename, reorder, nest, deactivate categories. Custom categories allowed. |
| QUIZ-02 | A question belongs to exactly one category (usually the most specific). |
| QUIZ-03 | Deleting a category in use is blocked. Offer deactivate or reassign. |
| QUIZ-04 | Names are unique among siblings. Slugs are globally unique. |

## 3. Quiz Definition

| Field | Type | Notes |
|-------|------|-------|
| `title`, `slug`, `description`, `instructions` | text | Instructions shown before start |
| `kind` | enum | `general`, `category`, `weekly`, `monthly`, `annual`, `special` |
| `category_id` | FK, nullable | Required for `category` kind. `general` draws from all |
| `include_subcategories` | bool | Default true |
| `question_selection` | enum | `fixed` (admin picks questions via `quiz_questions`) or `random_pool` (draw N from category/pool at attempt start) |
| `number_of_questions` | int | Required |
| `duration_minutes` | int | Required, 1–240 |
| `pass_mark_percent` | int | 0–100 (default 50) |
| `negative_marks` | decimal | Per wrong answer, default 0 |
| `randomize_questions` | bool | Default true |
| `randomize_options` | bool | Default true |
| `max_attempts` | int, nullable | `1`, `3`, or null = unlimited. Weekly/monthly/annual default to 1 |
| `review_policy` | enum | `immediate`, `after_close`, `never`. Default `after_close` (behaves as `immediate` when the quiz has no `end_at`) |
| `leaderboard_eligible` | bool | Default true for weekly/monthly/annual/special, false for practice quizzes |
| `start_at`, `end_at` | datetime, nullable | Availability window |
| `status` | enum | `draft`, `scheduled`, `active`, `completed`, `archived` |

| ID | Requirement |
|----|-------------|
| QUIZ-10 | A quiz cannot be activated unless enough active questions exist for `number_of_questions`. |
| QUIZ-11 | `scheduled` → `active` at `start_at`; `active` → `completed` at `end_at` (background job). |
| QUIZ-12 | A quiz with attempts cannot be deleted, only archived. Editing questions, marks or duration on a quiz with attempts requires a confirmation and is audit-logged (past results are protected by snapshots, see QUIZ-45). |
| QUIZ-13 | Each quiz with `kind` weekly/monthly/annual is linked to the corresponding period through attempt submission time (see leaderboards). |

## 4. Questions

**V1 question type: multiple choice** with exactly four options (A–D) and one correct answer. The schema stores options in a child table so other types can be added later.

| Field | Notes |
|-------|-------|
| `text` | Required |
| Options A–D | Required, non-empty, distinct |
| `correct_option` | A, B, C or D |
| `explanation` | Optional, shown in review |
| `category_id` | Required |
| `difficulty` | `easy`, `medium`, `hard` |
| `marks` | Positive number, default 1 |
| Bible reference | Optional: `ref_book`, `ref_chapter`, `ref_verse_start`, `ref_verse_end`, plus a generated display string (e.g. "Genesis 6:14") |
| `status` | `draft`, `active`, `archived` |

Example: "Who built the ark?" A. Moses, B. Noah, C. Abraham, D. David. Correct: B. Reference: Genesis 6:14.

| ID | Requirement |
|----|-------------|
| QUIZ-20 | Admin CRUD for questions with search and filters (category, difficulty, status, text). Bulk archive. |
| QUIZ-21 | Questions used in attempts cannot be hard-deleted. Archive only. |
| QUIZ-22 | Duplicate detection on create/import: normalised text (case/whitespace/punctuation-insensitive) in the same category is flagged. |
| QUIZ-23 | Book is validated against the 66-book list. Chapter/verse validated as positive integers. |

## 5. CSV Import

Location: Admin → Quiz → CSV Import. Provide a downloadable **template CSV**.

**Columns:**

```csv
question,option_a,option_b,option_c,option_d,correct_answer,category,difficulty,reference,marks,explanation
Who built the ark?,Moses,Noah,Abraham,David,B,Old Testament,Easy,Genesis 6:14,1,God told Noah to build an ark of gopher wood.
```

Required: `question`, `option_a..d`, `correct_answer`, `category`, `difficulty`. Optional: `reference`, `marks` (default 1), `explanation`.

**Flow (two-step, nothing is imported until confirmed):**

```text
Upload -> Parse to staging -> Validate every row -> Preview + error summary
       -> Admin confirms -> Insert valid rows -> Result summary
```

| ID | Requirement |
|----|-------------|
| CSV-01 | Accept UTF-8 CSV (tolerate BOM). Reject other file types. Max file size 2 MB and 1,000 rows per import (both settings). |
| CSV-02 | Validate headers: all required headers present, unknown headers warned, case-insensitive. |
| CSV-03 | Validate each row: non-empty question and four options; `correct_answer` is A/B/C/D (case-insensitive); `category` matches an existing category by name or slug (or full path like "Old Testament > Pentateuch"); `difficulty` is easy/medium/hard; `marks` positive number; `reference` parseable (warn if not, store raw). |
| CSV-04 | Options must be distinct within the row. Duplicate questions are flagged as warnings (skipped by default). |
| CSV-05 | Unknown categories are **errors**. Optionally allow Admin to auto-create missing categories via an explicit checkbox before confirmation. |
| CSV-06 | Preview shows counts (total, valid, invalid, duplicates) and the first N valid rows, plus every invalid row with row number, field and message. |
| CSV-07 | Admin chooses **Import valid rows only** (explicit confirmation) or **Cancel**. Invalid rows are never silently imported. |
| CSV-08 | Error report downloadable as CSV (row number, field, message, original row). |
| CSV-09 | Optional: attach imported questions to a chosen quiz (fixed selection). |
| CSV-10 | Importing runs in a transaction per batch, is idempotent per confirmed batch (double-click safe), and records `quiz_import_batches` with counts, uploader and timestamps. |
| CSV-11 | Protect exports from CSV/formula injection (prefix cells starting with `=`, `+`, `-`, `@`). |

Example result:

```text
Import completed with errors.
Total rows: 100  |  Valid: 96  |  Invalid: 4
Row 17: Invalid correct_answer
Row 31: Missing question
Row 64: Unknown category
Row 88: Missing option_d
```

## 6. Attempt Lifecycle

```text
        start                      submit (manual)
[none] ---------> in_progress ----------------------> submitted
                      |  time runs out (server)
                      +---------------------------> expired  (auto-submitted, scored)
                      |  admin action
                      +---------------------------> cancelled (excluded from results/leaderboards)
```

| ID | Requirement |
|----|-------------|
| QUIZ-30 | Starting requires: logged-in member; verified email (if `quiz.require_verified_email`); quiz `active` and inside its window; attempts remaining under `max_attempts`; no other `in_progress` attempt for this quiz. |
| QUIZ-31 | Only **one `in_progress` attempt per user per quiz**, enforced by a partial unique index. |
| QUIZ-32 | On start the server sets `started_at`, `expires_at = started_at + duration`, selects the questions, applies randomisation, and **persists** the question order and option order in `quiz_attempt_questions`. Refresh never reshuffles. |
| QUIZ-33 | **Server-side timer.** The client shows a countdown derived from server `expires_at` and server time offset. The client never decides expiry. |
| QUIZ-34 | Answers are saved server-side as the user selects them (and on navigation, plus periodic sync). Saving after `expires_at + grace` (default 5 s) is rejected. |
| QUIZ-35 | Refresh, tab close or network drop: the user can resume the same attempt with saved answers and the correct remaining time. |
| QUIZ-36 | When time expires, a job (and any next request touching the attempt) auto-submits it as `expired` using saved answers. |
| QUIZ-37 | Submit is **idempotent**. Double submission returns the same result. Answers cannot change after submission. |
| QUIZ-38 | Result and correct answers are never sent to the client until the attempt is submitted/expired. Correct answers are not included in the question payload during the attempt. |
| QUIZ-39 | Recorded per attempt: start/end times, IP hash and user agent (privacy-aligned), submission type (manual/auto). |
| QUIZ-40 | Admin can cancel an attempt with a reason (audit-logged). Cancelled attempts are excluded from stats and leaderboards, which are recalculated. |

**Anti-cheating (reasonable, non-invasive):** server-side timer, single active attempt, randomised order, persisted attempt state, duplicate-submission prevention, immutable answers after submission, no correct answers in the client payload, rate limiting, delayed review for competitive quizzes (`review_policy`). No webcam, screen recording or invasive surveillance. Tab-switch counts MAY be recorded as informational metadata only.

## 7. Scoring (single source: `ScoringService`)

| Rule | Definition |
|------|------------|
| Correct | Adds `question.marks` (snapshotted at attempt start) |
| Wrong | Subtracts `quiz.negative_marks` (default 0) |
| Unanswered | 0 |
| Attempt score | `max(0, sum)` |
| Max score | Sum of marks of all questions in the attempt |
| Percentage | `score / max_score × 100` (2 decimals) |
| Passed | `percentage >= pass_mark_percent` |
| Accuracy | `correct_count / questions_in_attempt × 100` |
| Time used | `submitted_at − started_at` (capped at duration) |

**QUIZ-45 Immutability:** at attempt start, store a **snapshot** (question text, options as shown, correct option, marks, explanation, reference) in `quiz_attempt_questions`. Later edits or archiving of the question bank do not alter past results.

**Result screen:**

```text
Quiz Completed

Score: 27/30    90%    Passed
Correct: 27   Wrong: 3   Unanswered: 0   Time used: 12:43
```

Optional review (per `review_policy`): question, your answer, correct answer, Bible reference, explanation.

## 8. Quiz UI Behaviour

| Stage | Requirements |
|-------|--------------|
| Pre-quiz | Title, category, number of questions, duration, attempts remaining, instructions, **Start Quiz** (login prompt for visitors) |
| During | "Question 7 of 30", time remaining (server-synced, colour/announcement warnings at 5 min and 1 min), Next, Previous, jump navigator, selected-answer indicator, flag for review, Submit with confirmation showing unanswered count, autosave indicator |
| Desktop layout | Question area (left) and question navigator (right) |
| Mobile layout | Single question, options, Next/Previous, navigator collapsed into a bottom sheet or drawer |
| Resume | Banner on `/quiz` and dashboard for any in-progress attempt |
| Errors | Offline/poor connection banner. Answers queue locally and retry (server still authoritative). Clear message if time expired |

## 9. Leaderboards

### 9.1 Periods

| Type | Key format | Boundaries (Africa/Lagos) |
|------|-----------|---------------------------|
| Weekly | `2026-W38` | Monday 00:00 to Sunday 23:59:59, ISO week |
| Monthly | `2026-09` | First to last day of month |
| Annual | `2026` | 1 Jan to 31 Dec |

**QUIZ-50** A `quiz_periods` row exists per period (created on demand or by job), with `starts_at`, `ends_at`, `status` (`open`, `closed`).
**QUIZ-51** An attempt belongs to the period(s) containing its `submitted_at` (Lagos time). One attempt feeds the weekly, monthly and annual leaderboards at once.
**QUIZ-52** When a period closes, its leaderboard is **finalised as a frozen snapshot**. Historical results and past leaderboards are **never deleted or reset**. "Reset" means a new period starts with an empty board.
**QUIZ-53** Admin can view past periods and trigger a recalculation of an **open** period (audit-logged). Closed periods are read-only except by explicit Super Admin correction (audit-logged).

### 9.2 Counting rules (defaults, configurable in settings)

| Setting | Default | Meaning |
|---------|---------|---------|
| `leaderboard.attempt_counting` | `best_per_quiz` | For each leaderboard-eligible quiz, only the participant's best attempt in the period counts (highest points; ties broken by fastest time). Alternatives: `first_per_quiz`, `all_attempts` |
| Points | Sum of counted attempt scores | |
| `leaderboard.min_attempts` | 1 | Minimum counted attempts to appear |

### 9.3 Ranking algorithm (explicit)

Sort by, in order:
1. **Total points** (descending)
2. **Accuracy %** across counted attempts (descending)
3. **Total correct answers** (descending)
4. **Average completion time** across counted attempts (ascending)
5. **Earliest time the participant reached that score** (ascending), final deterministic tiebreak

Participants that still tie after all five share the same rank (standard competition ranking, 1-2-2-4).

### 9.4 Storage and updates

- `leaderboard_entries` stores per period and participant: `rank`, `total_points`, `accuracy`, `correct_answers`, `questions_answered`, `quizzes_taken`, `avg_time_seconds`, `updated_at`, `finalized`.
- `LeaderboardService` updates the affected entries on each submission (recompute for that user, then re-rank the period), so reads are cheap and rankings are stored, not only recalculated. A nightly job verifies consistency.
- V1 boards are **overall**. The schema includes an optional `category_id` scope for later category boards.

### 9.5 Display

Columns: Rank, Participant, Score (points), Accuracy, Questions, Time. Tabs for Weekly, Monthly, Annual, with a period selector for past periods. Logged-in member sees their own rank highlighted and pinned, even outside the top page. Top 3 visually emphasised. Paginated (default 50).

### 9.6 Privacy

| Setting | Detail |
|---------|--------|
| User choice | `full` ("Thompson Adebiyi") or `abbreviated` ("Thompson A."), default `abbreviated` |
| Admin control | `leaderboard.force_abbreviated` (default off) overrides users to abbreviated. `leaderboard.default_display` sets the default for new users |
| Never shown | Email, phone, church (unless the user opts in later) |
| Deleted accounts | Shown as "Former participant" |

## 10. Member Dashboard

| Section | Content |
|---------|---------|
| Summary | Quizzes taken, average score, best score, current rank (weekly/monthly/annual), total correct answers |
| Profile | Name, photo, phone, church, age range, gender, leaderboard display mode, change password |
| History | Table of attempts: quiz, date, score, percentage, time, status. Link to result/review |
| Stats | Total quizzes, questions answered, correct, incorrect, average, best |

## 11. Quiz Reports (admin, see `08` for UI)

Total participants, total attempts, average/highest/lowest score, most popular categories, per-quiz stats. **Question analytics:** attempts, correct %, incorrect %, unanswered %, and lists of hardest and easiest questions (minimum attempt threshold configurable, default 10). Filters by date, category, difficulty, quiz. Export CSV.

## 12. API Summary

| Method and path | Auth | Purpose |
|-----------------|------|---------|
| `GET /api/quizzes`, `GET /api/quizzes/[slug]` | Public | List/detail (no questions) |
| `POST /api/quizzes/[id]/attempts` | Member | Start or resume attempt |
| `GET /api/attempts/[id]` | Owner | Current state: ordered questions (without answers), saved answers, `expires_at`, `server_now` |
| `PUT /api/attempts/[id]/answers` | Owner | Save answer(s) (idempotent) |
| `POST /api/attempts/[id]/submit` | Owner | Submit (idempotent) |
| `GET /api/attempts/[id]/result` | Owner | Result and review (respecting `review_policy`) |
| `GET /api/leaderboards?type=&period=` | Public | Leaderboard page |
| Admin: `/api/admin/quiz-categories`, `/questions`, `/quizzes`, `/quiz-imports`, `/attempts`, `/leaderboards`, `/quiz-reports` | Permissions | Management |

## 13. Jobs

| Job | Frequency | Purpose |
|-----|-----------|---------|
| `AttemptExpirer` | Every minute | Auto-submit expired in-progress attempts |
| `QuizScheduler` | Every minute | Activate/complete quizzes by window |
| `PeriodRollover` | Hourly (and at boundaries) | Create new periods, close finished ones, finalise snapshots |
| `LeaderboardVerifier` | Nightly | Recompute open periods and compare to stored ranks |
