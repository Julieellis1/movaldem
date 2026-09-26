# Phase 3 Events, Programmes, Gallery & Site Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 3 — events, programmes with sessions, gallery albums, church information pages (About/leadership/branches), the data-driven homepage, and the contact form with admin inbox — on the Phase 1 spine and Phase 2 media/lifecycle patterns.

**Architecture:** Modular monolith (PRD ARC-01/02). New `src/modules/content/` services (`EventService`, `ProgrammeService`, `GalleryService`, `PageService`, `ContactService`) reuse Phase 2's `contentStatus` lifecycle, `MediaService`, `AuditService`, and `PublishScheduler` (extended to the new types). Public reads filter `status=published AND published_at<=now` (albums: `status=published`). `app/api` + `app/(public)` routes stay thin.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript strict, Drizzle ORM + drizzle-kit, Neon PostgreSQL, Zod, Tailwind v4 + shadcn/ui, Vitest + Playwright.

**Spec:** `prd/05-cms-content-modules.md` (§10-13 only), `prd/04-public-website.md` (§1 sitemap, §3 homepage, §9 contact, §10 about, §11 catalogue), `prd/09-data-model.md` (§4 media refs, §5 events/programmes/gallery/site tables), `prd/10-delivery-plan-and-acceptance.md` (§2 Phase 3 row), `prd/02-architecture-and-nfr.md` (§3 services/jobs), `prd/08-admin-dashboard-reports-settings.md` (§1 menu, §4 contact inbox)

## Global Constraints

- **Timezone:** store timestamps UTC; event/programme dates+times interpreted in `Africa/Lagos` (WAT, UTC+1).
- **IDs:** UUID primary keys; public URLs use unique slugs per type; slug change on published item creates 301 `redirects` row (CMS-06).
- **Deletion:** content uses soft delete (`deleted_at`); `contact_messages` soft-deleted, never hard-deleted from UI.
- **Server authority:** lifecycle transitions, slugs, uploads, session dates, contact spam checks validated server-side.
- **Privacy:** store `ip_hash` (salted, `IP_HASH_SALT`), never raw IP.
- **Language:** English; no emoji UI, text labels only.
- **Unspecified rules:** implement as setting with documented default; record in `docs/ASSUMPTIONS.md`.
- **Requirement IDs** cited in commits/tests (CMS-*, LST-*, WEB-*).

---

## File Structure

```
src/db/schema.ts                        += contactMessageStatus enum; events, programmes,
                                           programme_sessions, gallery_albums, gallery_images,
                                           site_pages, leaders, branches, contact_messages
drizzle/migrations/                     += generated migration(s)
drizzle/seeders/content.ts              += site_pages defaults (about.history/vision/mission/beliefs)
src/modules/content/event.service.ts    EventService CRUD + upcoming/past/featured queries
src/modules/content/programme.service.ts ProgrammeService + inline session CRUD/reorder
src/modules/content/gallery.service.ts  GalleryService: albums, bulk add, reorder, cover
src/modules/content/page.service.ts     PageService: site_pages upsert, leaders/branches CRUD
src/modules/content/contact.service.ts  ContactService: validate+honeypot+ratelimit, store, notify
src/jobs/publish-scheduler.ts           += flip due events/programmes/albums (idempotent)
src/app/api/events/...                  admin CRUD
src/app/api/programmes/...              admin CRUD + sessions sub-routes
src/app/api/gallery/...                 admin albums + images (bulk, reorder, cover)
src/app/api/pages|leaders|branches/...  admin CMS info CRUD
src/app/api/contact/route.ts            public POST (rate-limited, honeypot)
src/app/(public)/events/...             list (upcoming/past/featured) + detail + .ics
src/app/(public)/programmes/...         list + agenda detail
src/app/(public)/gallery/...            album list + album detail (lightbox)
src/app/about|leadership|...            about, leadership, branches pages
src/app/page.tsx                        homepage: all 10 PRD 04 §3 sections (replaces dispatcher? NO — keeps dispatcher, renders sections)
src/app/contact/page.tsx                contact form + info + map embed
src/components/content/...              EventCard, AgendaView, ImageGrid, Lightbox, AddToCalendarButton, ContactForm
src/components/site/...                 HomepageSections (hero, about-teaser, featured-sermon, quiz-promo, giving, gallery-preview, footer data)
tests/unit|integration/content.*        lifecycle reuse, validation, agenda grouping, .ics builder
tests/e2e/site.spec.ts                  public navigation end-to-end (runs in CI, not locally)
```

Homepage note: `src/app/page.tsx` is currently the role dispatcher (C14). Phase 3 keeps dispatching staff→/admin but renders the public homepage for members/guests instead of redirecting them. Staff keeps /admin landing.

Out of scope (Phases 4-7): giving, quiz, leaderboards, search/SEO hardening (basic metadata only), live streaming.

---

### Task 1: DB schema + migration (Phase 3 site tables)

**Files:**
- Modify: `src/db/schema.ts`
- Create (generated): `drizzle/migrations/00XX_*.sql`
- Test: `pnpm db:generate` + `pnpm typecheck`

**Interfaces:**
- Consumes: `media.id` (covers/images), `programmes.id` (event link), `users.id` (created_by).
- Produces: `events`, `programmes`, `programmeSessions`, `galleryAlbums`, `galleryImages`, `sitePages`, `leaders`, `branches`, `contactMessages` + `contactMessageStatus` enum. Reuses `contentStatus` for events/programmes/albums.

- [ ] **Step 1: Append enums + 9 tables per `09` §5 (times as `text` HH:MM with Lagos interpretation; `sitePages.key` text PK)**
- [ ] **Step 2: Run `pnpm db:generate` — expect new migration file created**
- [ ] **Step 3: Run `pnpm typecheck` — expect PASS**
- [ ] **Step 4: Commit** `git add src/db/schema.ts drizzle/migrations && git commit -m "feat(phase3): add events/programmes/gallery/site schema (05-§10..13)"`

### Task 2: EventService + ProgrammeService + scheduler extension

**Files:**
- Create: `src/modules/content/event.service.ts`, `src/modules/content/programme.service.ts`
- Modify: `src/jobs/publish-scheduler.ts` (add 3 tables), `src/app/api/cron/publish-scheduled/route.ts` (unchanged shape)
- Test: `tests/integration/content.events.test.ts`

**Interfaces:**
- Consumes: Phase 2 `lifecycle.ts` (status machine, slugs+redirects), `AuditService`.
- Produces: `createEvent/updateEvent/publishEvent/scheduleEvent`, `listUpcoming/listPast/listFeatured`, `createProgramme + addSession/reorderSessions/removeSession`, `buildIcs(event)` (VCALENDAR with Africa/Lagos floating time), extended `runPublishScheduler()` covering events/programmes/albums.

- [ ] **Step 1: Write failing test** (end<start rejected; session outside programme range rejected; upcoming excludes past; scheduled flips on job run)
- [ ] **Step 2: Implement services + scheduler extension minimal to pass**
- [ ] **Step 3: Run integration test — expect PASS**
- [ ] **Step 4: Commit**

### Task 3: GalleryService

**Files:**
- Create: `src/modules/content/gallery.service.ts`
- Test: `tests/integration/content.gallery.test.ts`

**Interfaces:**
- Produces: `createAlbum`, `addImages(albumId, mediaIds[])` (bulk, sort_order append), `reorderImages(albumId, orderedIds[])`, `setCover`, `deleteImage`, `deleteAlbumGuarded` (cover/media refs handled; media rows themselves never deleted here — MED-05).

- [ ] **Step 1: Write failing test** (bulk add orders; reorder persists; cover set; delete image keeps media row)
- [ ] **Step 2: Implement minimal to pass**
- [ ] **Step 3: Run test — expect PASS**
- [ ] **Step 4: Commit**

### Task 4: PageService + ContactService + inbox queries

**Files:**
- Create: `src/modules/content/page.service.ts`, `src/modules/content/contact.service.ts`
- Test: `tests/integration/content.pages.test.ts`

**Interfaces:**
- Produces: `upsertSitePage(key,title,body)`, leader/branch CRUD + `listVisibleLeaders/Branches` (is_visible, sort_order), `submitContact(input)` (honeypot field must be empty, rate-limited per IP, stores row + enqueues notification email to `contact.notify_email` setting), `listContactMessages` + `setContactStatus`.

- [ ] **Step 1: Write failing test** (honeypot-filled rejected with fake success; rate-limited 429; leaders sorted visible-only)
- [ ] **Step 2: Implement minimal to pass**
- [ ] **Step 3: Run test — expect PASS**
- [ ] **Step 4: Commit**

### Task 5: Reusable components (UI only)

**Files:**
- Create: `src/components/content/event-card.tsx`, `agenda-view.tsx`, `image-grid.tsx`, `lightbox.tsx`, `add-to-calendar-button.tsx` (downloads .ics href), `contact-form.tsx`
- Test: `tests/unit/content.site-components.test.ts` (agenda day grouping, .ics href builder, lightbox keyboard map — pure parts)

- [ ] **Step 1: Write failing test** (sessions group by day ascending; empty programme renders null state)
- [ ] **Step 2: Implement (lazy images, keyboard: arrows/Esc, text labels, 360px-first)**
- [ ] **Step 3: Run test — expect PASS**
- [ ] **Step 4: Commit**

### Task 6: Admin UI

**Files:**
- Create: `src/app/admin/events/...`, `src/app/admin/programmes/...` (inline session editor), `src/app/admin/gallery/...` (bulk upload via media picker, drag reorder, cover, captions), `src/app/admin/pages/...` (site pages editor, leaders, branches), `src/app/admin/contact/...` (inbox: new/read/archived, mailto reply)
- Create: `src/app/api/events|programmes|gallery|pages|leaders|branches|contact/...` thin guarded routes
- Reuse: `DataTable`/`FormShell`, `media-picker.tsx`, `content-form.tsx` patterns.

- [ ] **Step 1: Build events + programmes admin (session inline add/reorder/remove, range validation surfacing)**
- [ ] **Step 2: Build gallery admin (bulk select, progress, reorder, cover, captions)**
- [ ] **Step 3: Build pages/leaders/branches editors + contact inbox**
- [ ] **Step 4: Manual verify as content_manager + Commit**

### Task 7: Public pages + homepage + contact

**Files:**
- Create: `src/app/events/page.tsx` + `[slug]/page.tsx` + `[slug]/ics/route.ts`, `src/app/programmes/...`, `src/app/gallery/...`, `src/app/about/page.tsx`, `src/app/leadership/page.tsx`, `src/app/branches/page.tsx` (or under /about per nav), `src/app/contact/page.tsx`
- Modify: `src/app/page.tsx` (keep staff→/admin dispatch; render homepage sections for member/guest)
- Reuse: Task 5 components + Phase 2 cards/players/share.

- [ ] **Step 1: Events/programmes/gallery public routes (LST-01..05 patterns, Event JSON-LD, .ics download)**
- [ ] **Step 2: About/leadership/branches from CMS data**
- [ ] **Step 3: Homepage 10 sections (each hidden when empty) + contact form with success/failure states**
- [ ] **Step 4: Commit**

### Task 8: RBAC guards + seeds + acceptance

**Files:**
- Modify: `src/app/admin/*` guards use existing keys (`events.*`, `programmes.*`, `gallery.*`, `media.*`, `pages.*`, `contact_messages.*` — all in matrix already; add none).
- Modify: `drizzle/seeders/content.ts` (site_pages defaults), `drizzle/seeders/index.ts`
- Create: `tests/e2e/site.spec.ts` (public navigation end-to-end; CI-only)
- Test: `tests/integration/content.guards.test.ts` (visitor/member denied /admin; content_manager blocked from quiz/giving pages)

- [ ] **Step 1: Guard tests red→green**
- [ ] **Step 2: Seed site_pages defaults, run `pnpm db:seed`**
- [ ] **Step 3: Write e2e spec (do not run locally; CI runs `pnpm e2e`)**
- [ ] **Step 4: Full `pnpm test` green + Commit**

## Self-Review

- Spec coverage: `05` §10 events → T1/T2/T6/T7; §11 programmes → T1/T2/T6/T7; §12 gallery → T1/T3/T6/T7; §13 pages → T1/T4/T6/T7. `04` §3 homepage → T7; §9 contact → T4/T6/T7; §10 about → T4/T7; §11 catalogue → T5. `08` menu/inbox → T6/T8. Scheduler → T2. RBAC → T8.
- Placeholders: none — exact files, functions, commands, expectations.
- Type consistency: table names match `09` §5 (`events`, `programmes`, `programme_sessions`, `gallery_albums`, `gallery_images`, `site_pages`, `leaders`, `branches`, `contact_messages`); service names match `02` §3 (`EventService→event.service.ts`, `ProgrammeService`, `GalleryService`, `PageService`, `ContactService`); times stored as `text` HH:MM (documented deviation, Lagos interpretation).
