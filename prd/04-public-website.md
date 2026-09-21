# 04 — Public Website

**Depends on:** 00-README, 02-architecture-and-nfr
**Related:** 05 (content data), 06 (giving), 07 (quiz)

## 1. Sitemap and Routes

| Page | Route | Notes |
|------|-------|-------|
| Home | `/` | |
| About Us | `/about` | History, vision, mission, beliefs, branches, contact info |
| Leadership | `/leadership` | |
| Sermons (list / detail) | `/sermons`, `/sermons/[slug]` | |
| Bible Study | `/bible-study`, `/bible-study/[slug]` | |
| Sunday School | `/sunday-school`, `/sunday-school/[slug]` | Series/quarter grouping: `/sunday-school/series/[slug]` |
| Events | `/events`, `/events/[slug]` | Upcoming, past, featured |
| Programmes | `/programmes`, `/programmes/[slug]` | |
| Gallery | `/gallery`, `/gallery/[slug]` | Albums and images |
| Bible Quiz landing | `/quiz` | Public: intro, available quizzes, leaderboards |
| Quiz detail | `/quiz/[slug]` | Pre-quiz info; start requires login |
| Quiz rules | `/quiz/rules` | |
| Leaderboards | `/quiz/leaderboard?period=weekly\|monthly\|annual` | Public |
| Giving | `/give`, `/give/project/[slug]` | |
| Payment confirmation | `/give/confirmation` | Reads reference from the query string, verifies server-side |
| Receipt | `/give/receipt/[reference]?token=...` | Signed link or logged-in owner |
| Contact | `/contact` | |
| Search | `/search?q=` | |
| Privacy Policy | `/privacy` | |
| Terms of Use | `/terms` | |
| Auth | `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password` | |
| Member dashboard | `/dashboard`, `/dashboard/profile`, `/dashboard/history`, `/dashboard/results/[attemptId]` | Auth required, `noindex` |
| 404 / 500 | | Branded error pages |
| Sitemap / robots | `/sitemap.xml`, `/robots.txt` | Generated |

**Primary navigation (desktop):** Home, About, Sermons, Bible Study, Sunday School, Events, Programmes, Gallery, Bible Quiz, Contact, and a prominent **Give** button. On mobile, a collapsible menu with **Give** always reachable. Leadership sits under About. Login/Account link in the header.

## 2. Design Direction

The site should feel like a **serious, modern church ministry**, not a generic SaaS dashboard.

| Guideline | Detail |
|-----------|--------|
| Tone | Clean, professional, warm, spiritual without being visually excessive |
| Typography | Strong, highly legible; a serif or humanist display face for headings paired with a clear sans-serif for body. Base size 16 px minimum |
| Imagery | Real church photography over stock; excellent hero and gallery images |
| Layout | Generous whitespace, clear hierarchy, minimal unnecessary cards |
| Shape | Restrained corner radius; avoid over-rounded containers |
| Colour | Palette from MOVALDEM branding (placeholder until supplied). Avoid heavy gradients |
| Icons | Sparse, purposeful. **No emoji-based UI** |
| CTAs | Clear, high-contrast buttons with action labels |
| Audience | Must work equally for older members, young adults, teenagers, first-time visitors and mobile users |

Design tokens (colours, spacing, type scale) are defined once in a theme file and read from Settings where branding is editable.

## 3. Homepage (route `/`)

Sections in order. Each section is data-driven from the CMS and hidden if it has no content (with sensible empty states).

| # | Section | Content | CTA |
|---|---------|---------|-----|
| 1 | **Hero** | Church name, short ministry statement, slogan/motto, hero image | Primary: "Watch Sermons". Secondary: "Join Bible Quiz" or "Give Online" (configurable) |
| 2 | **About ministry** | Short introduction | "Learn More" → `/about` |
| 3 | **Featured sermon** | Title, preacher, date, category, thumbnail, icons/labels for available media | "View Sermon" |
| 4 | **Latest Bible study** | Latest published study | "View Study" |
| 5 | **Latest Sunday school** | Current/recent lesson | "View Lesson" |
| 6 | **Upcoming events** | Next events: title, date, time, venue, image, short description | "All Events" |
| 7 | **Bible quiz promo** | "Test Your Bible Knowledge. Challenge yourself with our weekly Bible quiz." | "Take Quiz" |
| 8 | **Giving** | "Support the Work of God" with buttons: Tithe, Offering, Give, Support a Project | Each pre-selects the giving type on `/give` |
| 9 | **Gallery preview** | Recent photographs | "View Gallery" |
| 10 | **Footer** | Logo, name, address, phone, email, social links, quick links, Giving, Privacy Policy, Terms, copyright | |

**WEB-01** The "featured" sermon is the one flagged `is_featured`. If none, fall back to the latest published.
**WEB-02** Only the media types that exist for a content item are shown (see `05`, MediaAvailability).

## 4. Listing Pages

| ID | Requirement |
|----|-------------|
| LST-01 | Paginated (default 12 per page, setting), sorted newest first. Pagination uses real URLs (`?page=2`) for SEO. |
| LST-02 | Only `published` content with `published_at <= now` is shown. |
| LST-03 | Each card: thumbnail, title, date, key metadata, media availability badges. |
| LST-04 | Empty states ("No sermons match your filters") with a reset-filters action. |
| LST-05 | Filters are reflected in the URL so filtered views are shareable. |

**Filters:**

| Content | Filters |
|---------|---------|
| Sermons | Preacher, date range/year, category, series |
| Bible studies | Teacher, date, topic (category), series |
| Sunday school | Quarter/series, lesson number, topic, date |
| Events | Upcoming/past, featured, month |
| Quiz | Category, difficulty, date |

## 5. Detail Pages

Each content detail page shows title, metadata, description, featured image, media section (MediaAvailability), share buttons, and related items (same series/category). Field lists are in `05`.

## 6. Global Search

| ID | Requirement |
|----|-------------|
| SRCH-01 | Searches published Sermons, Bible studies, Sunday school, Events and Programmes. |
| SRCH-02 | Each result shows title, type, date, relevant excerpt (highlighted match) and thumbnail. |
| SRCH-03 | Filter results by type. Paginated. |
| SRCH-04 | V1 implementation: database full-text search (weighted title > scripture reference/topic/preacher > description). |
| SRCH-05 | Handles empty query, no results (with suggestions), and special characters safely. |
| SRCH-06 | Search box in header (expanding on mobile). |

## 7. SEO

| ID | Requirement |
|----|-------------|
| SEO-01 | Every public page has SEO title, meta description, canonical URL, Open Graph title/description/image. Twitter/X card tags. |
| SEO-02 | Admin can override SEO fields per content item. Otherwise generated from title, excerpt and featured image. Site-wide defaults in Settings. |
| SEO-03 | Human-readable slugs, e.g. `/sermons/the-power-of-faith`. Slugs are unique per type. Changing a published slug creates a 301 redirect. |
| SEO-04 | Auto-generated `sitemap.xml` (published content only) and `robots.txt`. |
| SEO-05 | Structured data (JSON-LD): `Organization`/`Church` (site), `Event` (events), `AudioObject`/`VideoObject` (sermons with media), `BreadcrumbList`. |
| SEO-06 | `noindex` for admin, dashboard, quiz attempt pages, payment confirmation, receipts, search results. |
| SEO-07 | Pages are server-rendered or statically generated so crawlers and social scrapers get full HTML. |

## 8. Social Sharing

Share to WhatsApp, Facebook, X, Telegram, and Copy Link on: Sermons, Bible studies, Sunday school, Events, and Quiz pages (including results, without exposing private data). WhatsApp is the priority on mobile (use the Web Share API where available, falling back to links). Shared links must render correct Open Graph previews.

## 9. Contact Page

Fields: Name, Email, Phone (optional), Subject, Message. Server-side validation, honeypot plus rate limiting for spam control, optional CAPTCHA (setting). Success and failure messages. Submissions are stored and emailed to the configured recipient (see `08`, Contact Inbox). Also shows church address, phone, email, social links and an embedded map if configured.

## 10. About and Leadership

Editable through the CMS (see `05`): history, vision, mission, beliefs, leadership (name, title, photo, bio, sort order), branches (name, address, phone, service times), contact information.

## 11. Component Catalogue (reusable)

Build these once and reuse everywhere.

| Component | Used for |
|-----------|----------|
| `MediaAvailability` | Shows only the available media actions for Sermon, Bible study, Sunday school (see `05`) |
| `AudioPlayer`, `VideoPlayer`, `PdfViewer` | Media playback and viewing. Lazy, accessible, responsive |
| `ContentCard`, `ContentGrid`, `Pagination`, `FilterBar` | Listings |
| `ShareButtons` | Social sharing |
| `GivingForm`, `PaymentStatus` | Giving (see `06`) |
| `ProjectProgress` | Project target/raised/percentage |
| `QuizIntroCard`, `QuizTimer`, `QuizQuestion`, `QuestionNavigator`, `QuizResult` | Quiz (see `07`) |
| `Leaderboard` | Weekly/monthly/annual tables |
| `EmptyState`, `ErrorState`, `LoadingSkeleton`, `Toast` | Cross-cutting states |
| `Lightbox`, `ImageGrid` | Gallery |
| `SeoHead` | Metadata per page |

## 12. Cross-page UX Requirements

- Loading skeletons on data views, empty states on lists, friendly error states with retry.
- Success and failure toasts/notifications for form actions.
- Forms preserve input on validation failure.
- Works with keyboard only and with screen readers (see `02` A11Y).
- Tested on small phones (360 px wide), tablets and desktop.
