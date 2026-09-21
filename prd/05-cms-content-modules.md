# 05 — CMS and Content Modules

**Depends on:** 00-README, 02, 03, 09
**Related:** 04 (public rendering), 08 (admin UI)

## 1. Content Lifecycle (applies to all content types)

```text
Draft -> Review -> Published -> Archived
            ^          |
            +----------+   (unpublish returns to Draft)
Scheduled: Draft/Review + future published_at -> auto-Published
```

| ID | Requirement |
|----|-------------|
| CMS-01 | Statuses: `draft`, `review`, `scheduled`, `published`, `archived`. |
| CMS-02 | "Publish now" sets `published_at = now`. "Schedule" sets a future `published_at`. A scheduler job flips scheduled items to published when due (idempotent). |
| CMS-03 | Public queries only return `status = published AND published_at <= now`. |
| CMS-04 | `content.require_review` setting (default off) controls whether Content Managers can publish (see `03`). |
| CMS-05 | Soft delete. Deleted items are removed from public view and can be restored by Admin/Super Admin. |
| CMS-06 | Slugs auto-generated from title, editable, unique per type. Slug change on a published item creates a redirect. |
| CMS-07 | Admin edit forms show validation errors inline, autosave-draft is optional, and warn on unsaved changes. |
| CMS-08 | Every create/update/publish/delete is audit-logged. |

## 2. Shared Fields for Teaching Content

Sermons, Bible studies and Sunday school lessons share a common structure. Implement once (shared schema/mixin and shared admin form parts), then extend.

| Field | Type | Notes |
|-------|------|-------|
| `id`, `title`, `slug` | | Title required, slug unique |
| `description` | rich text | Sanitised HTML |
| `featured_image_id` | FK media | Optional, with alt text |
| `audio_media_id` | FK media | Optional |
| `video_media_id` | FK media | Optional. Uploaded file or external URL |
| `document_media_id` | FK media | Optional PDF |
| `download_enabled` | bool | Controls the PDF (and optionally audio) download button |
| `series_id` | FK series | Optional |
| `category_id` | FK content_categories | Optional. Tags via `taggables` |
| `is_featured` | bool | |
| `status`, `published_at`, `scheduled_for` | | See lifecycle |
| SEO fields | | `seo_title`, `seo_description`, `og_image_id` (optional overrides) |
| `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at` | | |

**Media rules:**
- **CMS-10** A content item may have any combination of audio, video and PDF (zero to three).
- **CMS-11** Video is **one** of: uploaded video file, or an external URL (YouTube, Vimeo, Facebook). Not both. Validate URL host against an allowlist and convert to a safe embed URL.
- **CMS-12** A content item with no media is valid (text-only).
- **CMS-13** Attaching, replacing and removing media is done from the content form via the media picker (see section 7).

## 3. Sermons

Adds to shared fields:

| Field | Notes |
|-------|-------|
| `preacher` | Required. Free text in V1, with autocomplete from previous preachers |
| `sermon_date` | Required |
| `scripture_reference` | Free text (e.g. "Genesis 6:14"). Optional structured book/chapter/verse |
| `category_id` (type = sermon) | e.g. Faith, Healing, Prayer |
| Tags | Many |

**Sermon detail page:** title, preacher, date, scripture, description, featured image, and a media section:

```text
Listen to Audio   (embedded audio player, if audio exists)
Watch Video       (embedded video player, if video exists)
Download PDF      (PDF viewer or download button, if PDF exists and downloads enabled)
```

Filters: preacher, date, category, series (see `04`).

## 4. Bible Studies

Independent from Sermons (own list, routes, filters).

Adds to shared fields: `teacher` (required), `study_date` (required), `scripture_reference`, `topic` (via category type = bible_study), optional `lesson_number`, `series_id`.

## 5. Sunday School

Adds to shared fields:

| Field | Notes |
|-------|-------|
| `lesson_number` | Integer. Unique within a series |
| `lesson_date` | Required |
| `topic` | Required |
| `memory_verse` | Text |
| `introduction` | Rich text |
| `teacher` | Optional |
| `series_id` | Required in the admin form (a quarter is a series) |

**Series (quarters):** a `series` of `type = sunday_school` has `title`, `slug`, `description`, `start_date`, `end_date`, `cover_image_id`, `sort_order`. Example:

```text
Sunday School
  2026 First Quarter (series)
    Lesson 1
    Lesson 2
    Lesson 3
    Lesson 4
```

Public series page lists lessons in order with previous/next navigation. The homepage "Latest Sunday School" picks the latest published lesson (by `lesson_date`).

## 6. Series, Categories and Tags

| Entity | Rules |
|--------|-------|
| `series` | Typed (`sermon`, `bible_study`, `sunday_school`). Title, slug, description, cover image, optional date range. Admin CRUD. |
| `content_categories` | Typed by content (`sermon`, `bible_study`). Name, slug, sort order, active flag. Admin CRUD. Cannot delete a category in use (archive/reassign). |
| `tags` and `taggables` | Free-form tags shared across content types. Created inline while editing content. |

## 7. Media Library

| ID | Requirement |
|----|-------------|
| MED-01 | Central library of all uploaded and external-link media. Grid/list view with type filter, search by name, pagination. |
| MED-02 | Supported: images (JPG, PNG, WebP), PDF, audio (MP3, M4A), video (MP4, WebM), external video URLs. |
| MED-03 | Allowed MIME types: `application/pdf`, `audio/mpeg`, `audio/mp4`, `video/mp4`, `video/webm`, `image/jpeg`, `image/png`, `image/webp`. Full validation in `02` UPL-01..07. |
| MED-04 | Admin can: upload, replace file (keeps ID and URL references), delete, copy URL, view where a media item is used, edit alt text/title. |
| MED-05 | Deleting media that is attached to content is blocked, or requires detaching first (show usage list). |
| MED-06 | Metadata stored: original filename, generated storage key, MIME type, size, duration (audio/video where detectable), width/height (images), `source` (`uploaded` or `external_url`), uploader, timestamps. |
| MED-07 | Image derivatives (thumbnail, medium, large, WebP) generated on upload or on demand. |
| MED-08 | Media picker component inside content forms: choose existing or upload new, with progress indicator. |
| MED-09 | Files served from the CDN/storage URL, never through the application database. |

## 8. MediaAvailability Component

A reusable component used on Sermon, Bible study and Sunday school cards and detail pages. It reads which media exist and renders only those actions.

| Available media | Rendered actions |
|-----------------|------------------|
| Audio + Video + PDF | Listen, Watch, Download PDF |
| Audio + PDF | Listen, Download PDF |
| Audio only | Listen |
| Video only | Watch |
| None | Nothing (component renders null) |

Rules: the Download action appears only if a PDF exists **and** `download_enabled` is true; otherwise a PDF can be view-only or hidden per setting. On cards show compact labelled badges ("Audio", "Video", "PDF"); on detail pages show full-size buttons. Uses text labels, not emoji.

## 9. Downloads and Tracking

| ID | Requirement |
|----|-------------|
| DL-01 | Downloads go through a tracking endpoint that records the event then redirects to the file (or streams it). |
| DL-02 | Record: `content_type`, `content_id`, `media_id`, `user_id` (nullable), `ip_hash`, `user_agent`, `downloaded_at`. |
| DL-03 | Basic bot filtering and per-IP rate limiting to avoid inflated counts. |
| DL-04 | Admin reports: most downloaded sermons, most downloaded Bible studies, most downloaded Sunday school lessons, by period. |
| DL-05 | Audio/video plays are not tracked in V1 (optional later). |

## 10. Events

| Field | Notes |
|-------|-------|
| `title`, `slug`, `description` (rich text) | Required title |
| `featured_image_id` | Optional |
| `start_date`, `end_date` | End optional (single-day) |
| `start_time`, `end_time` | Optional. Interpreted in Africa/Lagos |
| `venue`, `address` | |
| `organizer`, `contact_phone` | |
| `is_featured` | |
| `registration_enabled`, `registration_url` | External registration link in V1 (no built-in registration) |
| `programme_id` | Optional link to a parent programme |
| `status`, `published_at` | Lifecycle above |
| SEO fields | |

Validation: `end_date >= start_date`; if same day, `end_time > start_time`. Views: upcoming (ascending), past (descending), featured. Structured data `Event` JSON-LD. "Add to calendar" (.ics download) SHOULD be provided.

## 11. Programmes

A programme is a multi-session ministry occasion (Annual Convention, Revival, Youth Programme, Workers' Conference). It is different from a single event.

**Programme fields:** `title`, `slug`, `description`, `start_date`, `end_date`, `venue`, `featured_image_id`, `status`, `published_at`, SEO.

**Programme session fields:** `programme_id`, `title`, `date`, `start_time`, `end_time`, `speaker`, `description`, `sort_order`.

```text
Annual Convention
  Opening Service
  Morning Session
  Afternoon Bible Study
  Evening Revival
  Closing Service
```

Validation: session dates fall within the programme date range. Admin form supports adding, reordering and removing sessions inline. Public page shows an agenda grouped by day.

## 12. Gallery

```text
Gallery Album
  Gallery Images
```

| Entity | Fields |
|--------|--------|
| Album | `title`, `slug`, `description`, `cover_image_id`, `event_id` (optional), `album_date`, `status` |
| Image | `album_id`, `media_id`, `caption`, `alt_text`, `sort_order` |

Admin: create album, bulk upload images (multi-select, drag and drop, progress), reorder (drag to sort), set cover, edit captions, delete. Public: responsive grid, lightbox (keyboard: arrows, Esc), lazy loading, responsive image sizes, album pagination.

## 13. About, Leadership and Branches (Church Information)

Editable in admin without code changes.

| Entity | Fields |
|--------|--------|
| `site_pages` (key-based, e.g. `about.history`, `about.vision`, `about.mission`, `about.beliefs`) | title, rich-text body, updated_by |
| `leaders` | name, title/office, bio, photo, sort order, is_visible |
| `branches` | name, address, phone, email, service times, map link, sort order, is_visible |
| Contact info | Church name, address, phone, email, social links (in Settings, see `08`) |
