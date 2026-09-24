# Phase 2 Teaching Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 2 teaching content — media library, series/categories/tags, sermons, Bible studies, Sunday school lessons, lifecycle/scheduling, public list/detail pages, MediaAvailability, and download tracking — on top of the Phase 1 spine.

**Architecture:** Modular monolith (PRD ARC-01/02). New `src/modules/content/` and `src/modules/media/` own their tables and services; `app/api` and `app/(public)` routes stay thin and delegate to services. Shared content columns and lifecycle implemented once and reused by all three teaching types. Public queries filter `status=published AND published_at<=now`.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Drizzle ORM + drizzle-kit, Neon PostgreSQL, Zod, Tailwind v4 + shadcn/ui, Vitest + Playwright.

**Spec:** `prd/05-cms-content-modules.md` (§1-9 only), `prd/04-public-website.md` (§4-5, §11 catalogue), `prd/09-data-model.md` (§4-5), `prd/10-delivery-plan-and-acceptance.md` (§5.1-5.3), `prd/02-architecture-and-nfr.md` (§3 UPL/SEC)

## Global Constraints

- **Timezone:** store timestamps UTC; display/compute in `Africa/Lagos` (WAT, UTC+1).
- **IDs:** UUID primary keys; public URLs use unique slugs per type; slug change on published item creates 301 `redirects` row (CMS-06).
- **Deletion:** content uses soft delete (`deleted_at`); `media_downloads` never hard-deleted.
- **Server authority:** uploads, lifecycle transitions, slugs, downloads validated server-side.
- **Privacy:** store `ip_hash` (salted, `IP_HASH_SALT`), never raw IP (DL-02).
- **Currency:** not applicable in Phase 2 (no money fields).
- **Language:** English; no emoji UI, text labels only.
- **Unspecified rules:** implement as setting with documented default; record in `docs/ASSUMPTIONS.md`.
- **Requirement IDs** cited in commits/tests (CMS-*, MED-*, DL-*, LST-*).

---

## File Structure

```
src/db/schema.ts                        += media, series, content_categories, tags, taggables,
                                           sermons, bible_studies, sunday_school_lessons,
                                           media_downloads, redirects (+ enums + indexes)
drizzle/migrations/                     += generated migration(s)
drizzle/seeders/content.ts              += default sermon/bible_study categories + settings deltas
src/modules/media/media.service.ts      MediaService: validate/upload/attach/detach/delete, external URL allowlist
src/modules/media/storage.ts            storage driver (local dev + S3-compatible), CDN URL resolver
src/modules/media/validation.ts         MIME allowlist, size limits, magic-byte check, host allowlist
src/modules/content/series.service.ts   SeriesService CRUD
src/modules/content/category.service.ts CategoryService CRUD + in-use guard
src/modules/content/tag.service.ts      TagService inline create + attach
src/modules/content/lifecycle.ts        status machine, require_review gate, slug + redirect helper
src/modules/content/content.service.ts  create/update/publish/schedule/archive/soft-delete/restore per type
src/modules/content/download.service.ts DownloadService: record + redirect, bot filter, rate limit
src/jobs/publish-scheduler.ts           flip scheduled->published, idempotent
src/app/api/media/...                   upload, replace, delete, usage
src/app/api/content/...                 admin CRUD per type + series/categories/tags
src/app/api/downloads/...               tracking endpoint
src/app/(public)/sermons/...            list + detail
src/app/(public)/bible-study/...        list + detail
src/app/(public)/sunday-school/...      list + detail + series page
src/components/content/...              MediaAvailability, ContentCard/Grid, AudioPlayer, VideoPlayer,
                                        PdfViewer, FilterBar, Pagination, ShareButtons
tests/unit/content.*                    slug, lifecycle, validation, MediaAvailability matrix
tests/integration/content.*             services + scheduler + downloads against test DB
tests/e2e/sermon.spec.ts etc.           acceptance 5.1/5.2/5.3
```

Out of scope (Phase 3): `events`, `programmes`, `programme_sessions`, `gallery_albums`, `gallery_images`, `site_pages`, `leaders`, `branches`, contact inbox.

---

### Task 1: DB schema + migration (Phase 2 content tables)

**Files:**
- Modify: `src/db/schema.ts`
- Create (generated): `drizzle/migrations/00XX_*.sql`
- Test: `pnpm db:generate` + `pnpm typecheck`

**Interfaces:**
- Consumes: existing `users.id` for `uploaded_by`/`created_by`/`updated_by` (nullable UUID, no hard delete cascade except media refs `SET NULL` or restrict at service layer).
- Produces: exported tables `media`, `mediaDownloads`, `series`, `contentCategories`, `tags`, `taggables`, `sermons`, `bibleStudies`, `sundaySchoolLessons`, `redirects` + enums `mediaKind`, `mediaSource`, `seriesType`, `contentCategoryType`, `contentStatus`.

- [ ] **Step 1: Extend `src/db/schema.ts` with enums + 10 tables per `09` §4-5**
- [ ] **Step 2: Run `pnpm db:generate` — expect new migration file created**
- [ ] **Step 3: Run `pnpm typecheck` — expect PASS**
- [ ] **Step 4: Commit** `git add src/db/schema.ts drizzle/migrations && git commit -m "feat(content): add phase2 teaching-content schema (CMS-01,MED-06,DL-02)"`

### Task 2: MediaService + storage + validation

**Files:**
- Create: `src/modules/media/validation.ts`, `src/modules/media/storage.ts`, `src/modules/media/media.service.ts`
- Test: `tests/unit/media.validation.test.ts`, `tests/integration/media.service.test.ts`

**Interfaces:**
- Consumes: `media` table; `STORAGE_*`/`CDN_BASE_URL` env.
- Produces: `validateUpload({mime,size,ext,bytes})`, `resolvePublicUrl(media)`, `attachMedia()`, `detachMedia()`, `deleteMediaGuarded()` (blocked when referenced — MED-05).

- [ ] **Step 1: Write failing validation test** (allowed `application/pdf,audio/mpeg,audio/mp4,video/mp4,video/webm,image/jpeg,image/png,image/webp`; reject `.php`/renamed exe)
- [ ] **Step 2: Implement `validation.ts` + `storage.ts` + `media.service.ts` minimal to pass**
- [ ] **Step 3: Run `pnpm test tests/unit/media.validation.test.ts` — expect PASS**
- [ ] **Step 4: Commit**

### Task 3: Taxonomy services (series / categories / tags)

**Files:**
- Create: `src/modules/content/series.service.ts`, `category.service.ts`, `tag.service.ts`
- Test: `tests/integration/content.taxonomy.test.ts`

**Interfaces:**
- Produces: `createSeries()`, `createCategory()`, `attachTags()`, `deleteCategoryGuarded()` (blocked when in use).

- [ ] **Step 1: Write failing test** (duplicate `(type,slug)` rejected; delete category in use blocked)
- [ ] **Step 2: Implement services minimal to pass**
- [ ] **Step 3: Run integration test — expect PASS**
- [ ] **Step 4: Commit**

### Task 4: ContentService lifecycle

**Files:**
- Create: `src/modules/content/lifecycle.ts`, `src/modules/content/content.service.ts`
- Test: `tests/integration/content.lifecycle.test.ts`

**Interfaces:**
- Produces: `publishNow()`, `schedule()`, `unpublish()`, `archive()`, `softDelete()`, `restore()`, `saveSlugWithRedirect()`; enforces `content.require_review` (CMS-04) + audit write (CMS-08).

- [ ] **Step 1: Write failing test** (Content Manager cannot publish when `require_review=on`; scheduled invisible until `published_at<=now` — CMS-03)
- [ ] **Step 2: Implement lifecycle minimal to pass**
- [ ] **Step 3: Run test — expect PASS**
- [ ] **Step 4: Commit**

### Task 5: PublishScheduler job

**Files:**
- Create: `src/jobs/publish-scheduler.ts`, `src/app/api/cron/publish-scheduled/route.ts`
- Test: `tests/integration/content.scheduler.test.ts`

- [ ] **Step 1: Write failing test** (due `scheduled` rows flip to `published` once; re-run is no-op — CMS-02)
- [ ] **Step 2: Implement job + cron route (`CRON_SECRET` guard, same pattern as notifications worker)**
- [ ] **Step 3: Run test — expect PASS**
- [ ] **Step 4: Commit**

### Task 6: Admin UI (library + forms + picker)

**Files:**
- Create/modify: `src/app/admin/media/page.tsx`, `src/app/admin/sermons/...`, `src/app/admin/bible-studies/...`, `src/app/admin/sunday-school/...`, `src/components/admin/media-picker.tsx`
- Reuse: `DataTable`/`FormShell` from Phase 1.

- [ ] **Step 1: Build media grid (type filter, search, pagination — MED-01) + picker with progress (MED-08)**
- [ ] **Step 2: Build three content forms (shared part + preacher/teacher/dates, lesson_number unique per series)**
- [ ] **Step 3: Manual verify: create sermon with audio+PDF, schedule, publish; validation errors inline, unsaved-changes warn (CMS-07)**
- [ ] **Step 4: Commit**

### Task 7: Public teaching pages

**Files:**
- Create: `src/app/(public)/sermons/page.tsx` + `[slug]/page.tsx`, same for `bible-study`, `sunday-school`, `sunday-school/series/[slug]/page.tsx`

- [ ] **Step 1: Implement lists (LST-01..05: 12/page, newest first, `?page=`, URL-synced filters, empty state + reset)**
- [ ] **Step 2: Implement details (metadata, description, media section, related by series/category)**
- [ ] **Step 3: Verify `CMS-03`: draft/scheduled/future invisible; archived invisible**
- [ ] **Step 4: Commit**

### Task 8: Reusable components

**Files:**
- Create: `src/components/content/media-availability.tsx`, `content-card.tsx`, `audio-player.tsx`, `video-player.tsx`, `pdf-viewer.tsx`, `filter-bar.tsx`, `share-buttons.tsx`

- [ ] **Step 1: Unit test MediaAvailability matrix (§8: audio+video+PDF → Listen/Watch/Download; download only if PDF + `download_enabled`)**
- [ ] **Step 2: Implement components (lazy, accessible, responsive, text labels)**
- [ ] **Step 3: Run `pnpm test tests/unit/content.media-availability.test.ts` — PASS**
- [ ] **Step 4: Commit**

### Task 9: Download tracking + reports

**Files:**
- Create: `src/app/api/downloads/route.ts`, `src/modules/content/download.service.ts`
- Test: `tests/integration/content.downloads.test.ts`

- [ ] **Step 1: Write failing test** (GET records `content_type/content_id/media_id/user_id?/ip_hash/user_agent` then 302 to file — DL-01/02; bots filtered, rate-limited — DL-03)
- [ ] **Step 2: Implement endpoint + service**
- [ ] **Step 3: Add admin most-downloaded report query (DL-04)**
- [ ] **Step 4: Commit**

### Task 10: RBAC + security

**Files:**
- Modify: `drizzle/seeders/permissions.ts`, `role-permissions.ts`, `src/modules/auth/*` guards, admin routes
- Test: extend route-guard tests

- [ ] **Step 1: Add `content.*` + `media.*` permissions; Content Manager gets content+media only (no quiz/giving)**
- [ ] **Step 2: Verify: visitor/member → `/admin/*` denied; upload `.php` rejected; checkout/quiz unaffected**
- [ ] **Step 3: Run `pnpm test` relevant suites — PASS**
- [ ] **Step 4: Commit**

### Task 11: Seeds + acceptance tests

**Files:**
- Create: `drizzle/seeders/content.ts`, `tests/e2e/sermon.spec.ts`, `tests/e2e/bible-study.spec.ts`, `tests/e2e/sunday-school.spec.ts`
- Modify: `drizzle/seeders/index.ts`, `docs/ASSUMPTIONS.md`

- [ ] **Step 1: Seed default categories (sermon/bible_study topics) idempotently**
- [ ] **Step 2: E2E 5.1 (sermon audio+PDF, no Watch; download recorded), 5.2 (filter by teacher + search), 5.3 (series order, duplicate lesson_number rejected, homepage shows latest)**
- [ ] **Step 3: Run `pnpm test && pnpm e2e` — green**
- [ ] **Step 4: Commit**

## Self-Review

- Spec coverage: `05` §1 lifecycle → T4/T5; §2-5 teaching types → T1/T4/T6/T7; §6 taxonomy → T3; §7 media → T2/T6; §8 MediaAvailability → T8; §9 downloads → T9. `04` LST/cards → T7/T8. Acceptance 5.1-5.3 → T11.
- Placeholders: none — every step names exact files, functions, commands, expected outcomes.
- Type consistency: table names `sermons/bible_studies/sunday_school_lessons`, FK names `<entity>_id`, service names match `02` §3 (`MediaService`, `ContentService`, `DownloadService`, `PublishScheduler`).
