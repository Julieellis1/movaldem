import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  ne,
  or,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db/client";
import {
  bibleStudies,
  contentCategories,
  media,
  redirects,
  series,
  sermons,
  sundaySchoolLessons,
} from "@/db/schema";
import { LAGOS_TZ } from "@/lib/datetime";
import { env } from "@/lib/env";
import { isPubliclyVisible } from "./lifecycle";

// Phase 2 Item 7 public teaching pages (PRD 04 §4-5, 05 §3-5).
// Thin public query layer over Drizzle: every public read filters
// status=published AND published_at<=now AND deleted_at IS NULL in SQL
// (CMS-03/LST-02) AND re-checks each row with the service visibility
// helper `isPubliclyVisible`. Homepage hooks (WEB-01/02) live here for
// Phase 3 homepage use. No auth required.

export const PUBLIC_PAGE_SIZE = 12;

type MediaRow = typeof media.$inferSelect;
type SeriesRow = typeof series.$inferSelect;
type CategoryRow = typeof contentCategories.$inferSelect;

export type FilterOption = { value: string; label: string };

export type MediaUrls = {
  thumbnailUrl: string | null;
  thumbnailAlt: string;
  audioUrl: string | null;
  videoUrl: string | null;
  videoEmbedUrl: string | null;
  pdfUrl: string | null;
  /** DL-01: the Download action must hit the tracking endpoint, never the raw
   *  file URL, so the download is recorded in media_downloads. Null when there
   *  is no document to download. */
  downloadUrl: string | null;
};

export type DownloadContentType = "sermon" | "bible_study" | "sunday_school";

/** DL-01: build the tracked-download URL for a document. */
export function downloadUrlFor(
  content: DownloadContentType,
  contentId: string | null | undefined,
  mediaId: string | null | undefined,
): string | null {
  if (!contentId || !mediaId) return null;
  const params = new URLSearchParams({ content, id: contentId, media: mediaId });
  return `/api/downloads?${params.toString()}`;
}

export type TaxonomyRef = { id: string; title: string; slug: string } | null;
export type CategoryRef = { id: string; name: string; slug: string } | null;

function trimOrNull(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function toMediaUrls(
  m: {
    featured: MediaRow | null;
    audio: MediaRow | null;
    video: MediaRow | null;
    document: MediaRow | null;
  },
  tracking?: { content: DownloadContentType; id: string },
): MediaUrls {
  const audioUrl = m.audio ? trimOrNull(m.audio.public_url) : null;
  const pdfUrl = m.document ? trimOrNull(m.document.public_url) : null;
  const downloadUrl = tracking
    ? downloadUrlFor(tracking.content, tracking.id, m.document?.id)
    : null;
  let videoUrl: string | null = null;
  let videoEmbedUrl: string | null = null;
  if (m.video) {
    if (m.video.source === "external_url") {
      videoEmbedUrl = trimOrNull(m.video.external_url) ?? trimOrNull(m.video.public_url);
    } else {
      videoUrl = trimOrNull(m.video.public_url);
    }
  }
  return {
    thumbnailUrl: m.featured ? trimOrNull(m.featured.public_url) : null,
    thumbnailAlt: m.featured?.alt_text?.trim() || m.featured?.title?.trim() || "",
    audioUrl,
    videoUrl,
    videoEmbedUrl,
    pdfUrl,
    downloadUrl,
  };
}

async function getMediaMap(ids: Array<string | null | undefined>): Promise<Map<string, MediaRow>> {
  const unique = [...new Set(ids.filter((v): v is string => typeof v === "string" && v.length > 0))];
  if (unique.length === 0) return new Map();
  const rows = await db.select().from(media).where(inArray(media.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}

async function getSeriesMap(ids: Array<string | null | undefined>): Promise<Map<string, SeriesRow>> {
  const unique = [...new Set(ids.filter((v): v is string => typeof v === "string" && v.length > 0))];
  if (unique.length === 0) return new Map();
  const rows = await db.select().from(series).where(inArray(series.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}

async function getCategoryMap(
  ids: Array<string | null | undefined>,
): Promise<Map<string, CategoryRow>> {
  const unique = [...new Set(ids.filter((v): v is string => typeof v === "string" && v.length > 0))];
  if (unique.length === 0) return new Map();
  const rows = await db.select().from(contentCategories).where(inArray(contentCategories.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}

function seriesRef(s: SeriesRow | undefined): TaxonomyRef {
  return s ? { id: s.id, title: s.title, slug: s.slug } : null;
}

function categoryRef(c: CategoryRow | undefined): CategoryRef {
  return c ? { id: c.id, name: c.name, slug: c.slug } : null;
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: LAGOS_TZ,
});

// Timestamps stored UTC, displayed in Africa/Lagos (global constraint).
export function formatLagosDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return dateFormatter.format(d);
}

export function excerptOf(html: string | null | undefined, max = 160): string {
  const text = (html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function canonicalUrl(path: string): string {
  const base = env().APP_URL.replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export function parsePage(raw: string | string[] | undefined): number {
  const n = Number.parseInt(Array.isArray(raw) ? raw[0] : (raw ?? "1"), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function parseYear(raw: string | string[] | undefined): string | undefined {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return v && /^\d{4}$/.test(v) ? v : undefined;
}

function cleanParam(raw: string | string[] | undefined): string | undefined {
  const v = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return v ? v : undefined;
}

// CMS-06/SEO-03: a published slug change leaves a 301 redirects row.
export async function findRedirect(fromPath: string): Promise<string | null> {
  const [row] = await db.select().from(redirects).where(eq(redirects.from_path, fromPath));
  return row?.to_path ?? null;
}

// ---------------------------------------------------------------------------
// Sermons
// ---------------------------------------------------------------------------

export type SermonItem = MediaUrls & {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  preacher: string;
  sermonDate: string;
  dateLabel: string;
  scriptureReference: string | null;
  downloadEnabled: boolean;
  isFeatured: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  series: TaxonomyRef;
  category: CategoryRef;
  href: string;
};

export type SermonFilters = {
  preacher?: string;
  year?: string;
  category?: string;
  series?: string;
  page?: number;
};

export type SermonFilterOptions = {
  preachers: FilterOption[];
  years: FilterOption[];
  categories: FilterOption[];
  series: FilterOption[];
};

async function hydrateSermons(
  rows: Array<typeof sermons.$inferSelect>,
): Promise<SermonItem[]> {
  const mediaMap = await getMediaMap(
    rows.flatMap((r) => [r.featured_media_id, r.audio_media_id, r.video_media_id, r.document_media_id]),
  );
  const seriesMap = await getSeriesMap(rows.map((r) => r.series_id));
  const categoryMap = await getCategoryMap(rows.map((r) => r.category_id));
  return rows.map((r) => ({
    ...toMediaUrls(
      {
        featured: mediaMap.get(r.featured_media_id ?? "") ?? null,
        audio: mediaMap.get(r.audio_media_id ?? "") ?? null,
        video: mediaMap.get(r.video_media_id ?? "") ?? null,
        document: mediaMap.get(r.document_media_id ?? "") ?? null,
      },
      { content: "sermon", id: r.id },
    ),
    id: r.id,
    title: r.title,
    slug: r.slug,
    description: r.description,
    preacher: r.preacher,
    sermonDate: r.sermon_date,
    dateLabel: formatLagosDate(r.sermon_date),
    scriptureReference: r.scripture_reference,
    downloadEnabled: r.download_enabled,
    isFeatured: r.is_featured,
    seoTitle: r.seo_title,
    seoDescription: r.seo_description,
    series: seriesRef(seriesMap.get(r.series_id ?? "")),
    category: categoryRef(categoryMap.get(r.category_id ?? "")),
    href: `/sermons/${r.slug}`,
  }));
}

function sermonVisible(now: Date): SQL {
  return and(
    eq(sermons.status, "published"),
    lte(sermons.published_at, now),
    isNull(sermons.deleted_at),
  ) as SQL;
}

export async function getSermonFilterOptions(now: Date = new Date()): Promise<SermonFilterOptions> {
  const where = sermonVisible(now);
  const [preacherRows, dateRows, cats, seriesRows] = await Promise.all([
    db.selectDistinct({ preacher: sermons.preacher }).from(sermons).where(where),
    db.selectDistinct({ d: sermons.sermon_date }).from(sermons).where(where),
    db
      .select()
      .from(contentCategories)
      .where(and(eq(contentCategories.type, "sermon"), eq(contentCategories.is_active, true))),
    db.select().from(series).where(eq(series.type, "sermon")),
  ]);
  const years = [...new Set(dateRows.map((r) => r.d.slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))].sort(
    (a, b) => b.localeCompare(a),
  );
  return {
    preachers: preacherRows
      .map((r) => r.preacher.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .map((p) => ({ value: p, label: p })),
    years: years.map((y) => ({ value: y, label: y })),
    categories: [...cats]
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((c) => ({ value: c.slug, label: c.name })),
    series: [...seriesRows]
      .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
      .map((s) => ({ value: s.slug, label: s.title })),
  };
}

export type SermonListResult = {
  items: SermonItem[];
  total: number;
  totalPages: number;
  page: number;
  options: SermonFilterOptions;
};

export async function listSermons(filters: SermonFilters): Promise<SermonListResult> {
  const now = new Date();
  const options = await getSermonFilterOptions(now);
  const conditions: SQL[] = [sermonVisible(now)];
  if (filters.preacher) conditions.push(eq(sermons.preacher, filters.preacher) as SQL);
  if (filters.year && /^\d{4}$/.test(filters.year)) {
    conditions.push(gte(sermons.sermon_date, `${filters.year}-01-01`) as SQL);
    conditions.push(lte(sermons.sermon_date, `${filters.year}-12-31`) as SQL);
  }
  if (filters.category) {
    const [cat] = await db
      .select({ id: contentCategories.id })
      .from(contentCategories)
      .where(and(eq(contentCategories.type, "sermon"), eq(contentCategories.slug, filters.category)));
    if (!cat) return { items: [], total: 0, totalPages: 1, page: 1, options };
    conditions.push(eq(sermons.category_id, cat.id) as SQL);
  }
  if (filters.series) {
    const [s] = await db
      .select({ id: series.id })
      .from(series)
      .where(and(eq(series.type, "sermon"), eq(series.slug, filters.series)));
    if (!s) return { items: [], total: 0, totalPages: 1, page: 1, options };
    conditions.push(eq(sermons.series_id, s.id) as SQL);
  }
  const where = and(...conditions) as SQL;
  const [{ c: total }] = await db.select({ c: count() }).from(sermons).where(where);
  const totalPages = Math.max(1, Math.ceil(total / PUBLIC_PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);
  const rows = await db
    .select()
    .from(sermons)
    .where(where)
    .orderBy(desc(sermons.sermon_date), desc(sermons.published_at))
    .limit(PUBLIC_PAGE_SIZE)
    .offset((page - 1) * PUBLIC_PAGE_SIZE);
  const items = await hydrateSermons(rows.filter((r) => isPubliclyVisible(r, now)));
  return { items, total, totalPages, page, options };
}

export type SermonDetail = SermonItem & { related: SermonItem[] };

export async function getSermonBySlug(slug: string): Promise<SermonDetail | null> {
  const now = new Date();
  const [row] = await db.select().from(sermons).where(eq(sermons.slug, slug));
  if (!row || !isPubliclyVisible(row, now)) return null;
  const [item] = await hydrateSermons([row]);
  const related: Array<typeof sermons.$inferSelect> = [];
  if (row.series_id) {
    const sameSeries = await db
      .select()
      .from(sermons)
      .where(and(sermonVisible(now), eq(sermons.series_id, row.series_id), ne(sermons.id, row.id)))
      .orderBy(desc(sermons.sermon_date))
      .limit(3);
    related.push(...sameSeries.filter((r) => isPubliclyVisible(r, now)));
  }
  if (related.length < 3 && row.category_id) {
    const exclude = new Set([row.id, ...related.map((r) => r.id)]);
    const sameCategory = await db
      .select()
      .from(sermons)
      .where(and(sermonVisible(now), eq(sermons.category_id, row.category_id)))
      .orderBy(desc(sermons.sermon_date))
      .limit(6);
    for (const r of sameCategory) {
      if (related.length >= 3) break;
      if (!exclude.has(r.id) && isPubliclyVisible(r, now)) related.push(r);
    }
  }
  return { ...item, related: await hydrateSermons(related.slice(0, 3)) };
}

// WEB-01: featured sermon flagged is_featured, else latest published.
export async function getFeaturedSermon(): Promise<SermonItem | null> {
  const now = new Date();
  const rows = await db
    .select()
    .from(sermons)
    .where(sermonVisible(now))
    .orderBy(desc(sermons.is_featured), desc(sermons.sermon_date), desc(sermons.published_at))
    .limit(5);
  const first = rows.find((r) => isPubliclyVisible(r, now));
  if (!first) return null;
  const [item] = await hydrateSermons([first]);
  return item;
}

// ---------------------------------------------------------------------------
// Bible studies
// ---------------------------------------------------------------------------

export type BibleStudyItem = MediaUrls & {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  teacher: string;
  studyDate: string;
  dateLabel: string;
  scriptureReference: string | null;
  downloadEnabled: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  series: TaxonomyRef;
  category: CategoryRef;
  href: string;
};

export type BibleStudyFilters = {
  teacher?: string;
  year?: string;
  category?: string;
  series?: string;
  page?: number;
};

export type BibleStudyFilterOptions = {
  teachers: FilterOption[];
  years: FilterOption[];
  categories: FilterOption[];
  series: FilterOption[];
};

async function hydrateBibleStudies(
  rows: Array<typeof bibleStudies.$inferSelect>,
): Promise<BibleStudyItem[]> {
  const mediaMap = await getMediaMap(
    rows.flatMap((r) => [r.featured_media_id, r.audio_media_id, r.video_media_id, r.document_media_id]),
  );
  const seriesMap = await getSeriesMap(rows.map((r) => r.series_id));
  const categoryMap = await getCategoryMap(rows.map((r) => r.category_id));
  return rows.map((r) => ({
    ...toMediaUrls(
      {
        featured: mediaMap.get(r.featured_media_id ?? "") ?? null,
        audio: mediaMap.get(r.audio_media_id ?? "") ?? null,
        video: mediaMap.get(r.video_media_id ?? "") ?? null,
        document: mediaMap.get(r.document_media_id ?? "") ?? null,
      },
      { content: "bible_study", id: r.id },
    ),
    id: r.id,
    title: r.title,
    slug: r.slug,
    description: r.description,
    teacher: r.teacher,
    studyDate: r.study_date,
    dateLabel: formatLagosDate(r.study_date),
    scriptureReference: r.scripture_reference,
    downloadEnabled: r.download_enabled,
    seoTitle: r.seo_title,
    seoDescription: r.seo_description,
    series: seriesRef(seriesMap.get(r.series_id ?? "")),
    category: categoryRef(categoryMap.get(r.category_id ?? "")),
    href: `/bible-study/${r.slug}`,
  }));
}

function studyVisible(now: Date): SQL {
  return and(
    eq(bibleStudies.status, "published"),
    lte(bibleStudies.published_at, now),
    isNull(bibleStudies.deleted_at),
  ) as SQL;
}

export async function getBibleStudyFilterOptions(now: Date = new Date()): Promise<BibleStudyFilterOptions> {
  const where = studyVisible(now);
  const [teacherRows, dateRows, cats, seriesRows] = await Promise.all([
    db.selectDistinct({ teacher: bibleStudies.teacher }).from(bibleStudies).where(where),
    db.selectDistinct({ d: bibleStudies.study_date }).from(bibleStudies).where(where),
    db
      .select()
      .from(contentCategories)
      .where(and(eq(contentCategories.type, "bible_study"), eq(contentCategories.is_active, true))),
    db.select().from(series).where(eq(series.type, "bible_study")),
  ]);
  const years = [...new Set(dateRows.map((r) => r.d.slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))].sort(
    (a, b) => b.localeCompare(a),
  );
  return {
    teachers: teacherRows
      .map((r) => r.teacher.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .map((t) => ({ value: t, label: t })),
    years: years.map((y) => ({ value: y, label: y })),
    categories: [...cats]
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((c) => ({ value: c.slug, label: c.name })),
    series: [...seriesRows]
      .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
      .map((s) => ({ value: s.slug, label: s.title })),
  };
}

export type BibleStudyListResult = {
  items: BibleStudyItem[];
  total: number;
  totalPages: number;
  page: number;
  options: BibleStudyFilterOptions;
};

export async function listBibleStudies(filters: BibleStudyFilters): Promise<BibleStudyListResult> {
  const now = new Date();
  const options = await getBibleStudyFilterOptions(now);
  const conditions: SQL[] = [studyVisible(now)];
  if (filters.teacher) conditions.push(eq(bibleStudies.teacher, filters.teacher) as SQL);
  if (filters.year && /^\d{4}$/.test(filters.year)) {
    conditions.push(gte(bibleStudies.study_date, `${filters.year}-01-01`) as SQL);
    conditions.push(lte(bibleStudies.study_date, `${filters.year}-12-31`) as SQL);
  }
  if (filters.category) {
    const [cat] = await db
      .select({ id: contentCategories.id })
      .from(contentCategories)
      .where(and(eq(contentCategories.type, "bible_study"), eq(contentCategories.slug, filters.category)));
    if (!cat) return { items: [], total: 0, totalPages: 1, page: 1, options };
    conditions.push(eq(bibleStudies.category_id, cat.id) as SQL);
  }
  if (filters.series) {
    const [s] = await db
      .select({ id: series.id })
      .from(series)
      .where(and(eq(series.type, "bible_study"), eq(series.slug, filters.series)));
    if (!s) return { items: [], total: 0, totalPages: 1, page: 1, options };
    conditions.push(eq(bibleStudies.series_id, s.id) as SQL);
  }
  const where = and(...conditions) as SQL;
  const [{ c: total }] = await db.select({ c: count() }).from(bibleStudies).where(where);
  const totalPages = Math.max(1, Math.ceil(total / PUBLIC_PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);
  const rows = await db
    .select()
    .from(bibleStudies)
    .where(where)
    .orderBy(desc(bibleStudies.study_date), desc(bibleStudies.published_at))
    .limit(PUBLIC_PAGE_SIZE)
    .offset((page - 1) * PUBLIC_PAGE_SIZE);
  const items = await hydrateBibleStudies(rows.filter((r) => isPubliclyVisible(r, now)));
  return { items, total, totalPages, page, options };
}

export type BibleStudyDetail = BibleStudyItem & { related: BibleStudyItem[] };

export async function getBibleStudyBySlug(slug: string): Promise<BibleStudyDetail | null> {
  const now = new Date();
  const [row] = await db.select().from(bibleStudies).where(eq(bibleStudies.slug, slug));
  if (!row || !isPubliclyVisible(row, now)) return null;
  const [item] = await hydrateBibleStudies([row]);
  const related: Array<typeof bibleStudies.$inferSelect> = [];
  if (row.series_id) {
    const sameSeries = await db
      .select()
      .from(bibleStudies)
      .where(and(studyVisible(now), eq(bibleStudies.series_id, row.series_id), ne(bibleStudies.id, row.id)))
      .orderBy(desc(bibleStudies.study_date))
      .limit(3);
    related.push(...sameSeries.filter((r) => isPubliclyVisible(r, now)));
  }
  if (related.length < 3 && row.category_id) {
    const exclude = new Set([row.id, ...related.map((r) => r.id)]);
    const sameCategory = await db
      .select()
      .from(bibleStudies)
      .where(and(studyVisible(now), eq(bibleStudies.category_id, row.category_id)))
      .orderBy(desc(bibleStudies.study_date))
      .limit(6);
    for (const r of sameCategory) {
      if (related.length >= 3) break;
      if (!exclude.has(r.id) && isPubliclyVisible(r, now)) related.push(r);
    }
  }
  return { ...item, related: await hydrateBibleStudies(related.slice(0, 3)) };
}

// WEB-02 homepage hook: latest published Bible study.
export async function getLatestBibleStudy(): Promise<BibleStudyItem | null> {
  const now = new Date();
  const rows = await db
    .select()
    .from(bibleStudies)
    .where(studyVisible(now))
    .orderBy(desc(bibleStudies.study_date), desc(bibleStudies.published_at))
    .limit(3);
  const first = rows.find((r) => isPubliclyVisible(r, now));
  if (!first) return null;
  const [item] = await hydrateBibleStudies([first]);
  return item;
}

// ---------------------------------------------------------------------------
// Sunday school lessons
// ---------------------------------------------------------------------------

export type SundaySchoolLessonItem = MediaUrls & {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  lessonNumber: number;
  lessonDate: string;
  dateLabel: string;
  topic: string;
  memoryVerse: string | null;
  introduction: string | null;
  teacher: string | null;
  downloadEnabled: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  series: TaxonomyRef;
  href: string;
};

export type SundaySchoolFilters = {
  series?: string;
  teacher?: string;
  year?: string;
  lesson?: number;
  topic?: string;
  page?: number;
};

export type SundaySchoolFilterOptions = {
  series: FilterOption[];
  teachers: FilterOption[];
  years: FilterOption[];
};

async function hydrateLessons(
  rows: Array<typeof sundaySchoolLessons.$inferSelect>,
): Promise<SundaySchoolLessonItem[]> {
  const mediaMap = await getMediaMap(
    rows.flatMap((r) => [r.featured_media_id, r.audio_media_id, r.video_media_id, r.document_media_id]),
  );
  const seriesMap = await getSeriesMap(rows.map((r) => r.series_id));
  return rows.map((r) => ({
    ...toMediaUrls(
      {
        featured: mediaMap.get(r.featured_media_id ?? "") ?? null,
        audio: mediaMap.get(r.audio_media_id ?? "") ?? null,
        video: mediaMap.get(r.video_media_id ?? "") ?? null,
        document: mediaMap.get(r.document_media_id ?? "") ?? null,
      },
      { content: "sunday_school", id: r.id },
    ),
    id: r.id,
    title: r.title,
    slug: r.slug,
    description: r.description,
    lessonNumber: r.lesson_number,
    lessonDate: r.lesson_date,
    dateLabel: formatLagosDate(r.lesson_date),
    topic: r.topic,
    memoryVerse: r.memory_verse,
    introduction: r.introduction,
    teacher: r.teacher,
    downloadEnabled: r.download_enabled,
    seoTitle: r.seo_title,
    seoDescription: r.seo_description,
    series: seriesRef(seriesMap.get(r.series_id)),
    href: `/sunday-school/${r.slug}`,
  }));
}

function lessonVisible(now: Date): SQL {
  return and(
    eq(sundaySchoolLessons.status, "published"),
    lte(sundaySchoolLessons.published_at, now),
    isNull(sundaySchoolLessons.deleted_at),
  ) as SQL;
}

export async function getSundaySchoolFilterOptions(
  now: Date = new Date(),
): Promise<SundaySchoolFilterOptions> {
  const where = lessonVisible(now);
  const [seriesRows, teacherRows, dateRows] = await Promise.all([
    db.select().from(series).where(eq(series.type, "sunday_school")),
    db.selectDistinct({ teacher: sundaySchoolLessons.teacher }).from(sundaySchoolLessons).where(where),
    db.selectDistinct({ d: sundaySchoolLessons.lesson_date }).from(sundaySchoolLessons).where(where),
  ]);
  const years = [...new Set(dateRows.map((r) => r.d.slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))].sort(
    (a, b) => b.localeCompare(a),
  );
  return {
    series: [...seriesRows]
      .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
      .map((s) => ({ value: s.slug, label: s.title })),
    teachers: teacherRows
      .map((r) => (r.teacher ?? "").trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
      .map((t) => ({ value: t, label: t })),
    years: years.map((y) => ({ value: y, label: y })),
  };
}

export type SundaySchoolListResult = {
  items: SundaySchoolLessonItem[];
  total: number;
  totalPages: number;
  page: number;
  options: SundaySchoolFilterOptions;
};

export async function listSundaySchoolLessons(
  filters: SundaySchoolFilters,
): Promise<SundaySchoolListResult> {
  const now = new Date();
  const options = await getSundaySchoolFilterOptions(now);
  const conditions: SQL[] = [lessonVisible(now)];
  if (filters.series) {
    const [s] = await db
      .select({ id: series.id })
      .from(series)
      .where(and(eq(series.type, "sunday_school"), eq(series.slug, filters.series)));
    if (!s) return { items: [], total: 0, totalPages: 1, page: 1, options };
    conditions.push(eq(sundaySchoolLessons.series_id, s.id) as SQL);
  }
  if (filters.teacher) conditions.push(eq(sundaySchoolLessons.teacher, filters.teacher) as SQL);
  if (filters.year && /^\d{4}$/.test(filters.year)) {
    conditions.push(gte(sundaySchoolLessons.lesson_date, `${filters.year}-01-01`) as SQL);
    conditions.push(lte(sundaySchoolLessons.lesson_date, `${filters.year}-12-31`) as SQL);
  }
  if (filters.lesson !== undefined) {
    conditions.push(eq(sundaySchoolLessons.lesson_number, filters.lesson) as SQL);
  }
  if (filters.topic) {
    const q = `%${filters.topic.replace(/[%_\\]/g, "")}%`;
    conditions.push(or(ilike(sundaySchoolLessons.topic, q), ilike(sundaySchoolLessons.title, q)) as SQL);
  }
  const where = and(...conditions) as SQL;
  const [{ c: total }] = await db.select({ c: count() }).from(sundaySchoolLessons).where(where);
  const totalPages = Math.max(1, Math.ceil(total / PUBLIC_PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);
  const rows = await db
    .select()
    .from(sundaySchoolLessons)
    .where(where)
    .orderBy(desc(sundaySchoolLessons.lesson_date), desc(sundaySchoolLessons.lesson_number))
    .limit(PUBLIC_PAGE_SIZE)
    .offset((page - 1) * PUBLIC_PAGE_SIZE);
  const items = await hydrateLessons(rows.filter((r) => isPubliclyVisible(r, now)));
  return { items, total, totalPages, page, options };
}

export type SundaySchoolLessonDetail = SundaySchoolLessonItem & {
  related: SundaySchoolLessonItem[];
  prev: SundaySchoolLessonItem | null;
  next: SundaySchoolLessonItem | null;
};

export async function getSundaySchoolLessonBySlug(slug: string): Promise<SundaySchoolLessonDetail | null> {
  const now = new Date();
  const [row] = await db.select().from(sundaySchoolLessons).where(eq(sundaySchoolLessons.slug, slug));
  if (!row || !isPubliclyVisible(row, now)) return null;
  const [item] = await hydrateLessons([row]);
  const [prevRows, nextRows] = await Promise.all([
    db
      .select()
      .from(sundaySchoolLessons)
      .where(
        and(
          lessonVisible(now),
          eq(sundaySchoolLessons.series_id, row.series_id),
          lte(sundaySchoolLessons.lesson_number, row.lesson_number - 1),
        ),
      )
      .orderBy(desc(sundaySchoolLessons.lesson_number))
      .limit(3),
    db
      .select()
      .from(sundaySchoolLessons)
      .where(
        and(
          lessonVisible(now),
          eq(sundaySchoolLessons.series_id, row.series_id),
          gte(sundaySchoolLessons.lesson_number, row.lesson_number + 1),
        ),
      )
      .orderBy(asc(sundaySchoolLessons.lesson_number))
      .limit(3),
  ]);
  const prevRow = prevRows.find((r) => isPubliclyVisible(r, now)) ?? null;
  const nextRow = nextRows.find((r) => isPubliclyVisible(r, now)) ?? null;
  const [prev, next] = await Promise.all([
    prevRow ? hydrateLessons([prevRow]).then((r) => r[0]) : Promise.resolve(null),
    nextRow ? hydrateLessons([nextRow]).then((r) => r[0]) : Promise.resolve(null),
  ]);
  const siblings = await db
    .select()
    .from(sundaySchoolLessons)
    .where(
      and(lessonVisible(now), eq(sundaySchoolLessons.series_id, row.series_id), ne(sundaySchoolLessons.id, row.id)),
    )
    .orderBy(asc(sundaySchoolLessons.lesson_number))
    .limit(3);
  return {
    ...item,
    prev,
    next,
    related: await hydrateLessons(siblings.filter((r) => isPubliclyVisible(r, now))),
  };
}

export type SundaySchoolSeriesPage = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  coverUrl: string | null;
  lessons: SundaySchoolLessonItem[];
};

export async function getSundaySchoolSeriesBySlug(slug: string): Promise<SundaySchoolSeriesPage | null> {
  const now = new Date();
  const [s] = await db
    .select()
    .from(series)
    .where(and(eq(series.type, "sunday_school"), eq(series.slug, slug)));
  if (!s) return null;
  const rows = await db
    .select()
    .from(sundaySchoolLessons)
    .where(and(lessonVisible(now), eq(sundaySchoolLessons.series_id, s.id)))
    .orderBy(asc(sundaySchoolLessons.lesson_number));
  const lessons = await hydrateLessons(rows.filter((r) => isPubliclyVisible(r, now)));
  let coverUrl: string | null = null;
  if (s.cover_media_id) {
    const mediaMap = await getMediaMap([s.cover_media_id]);
    coverUrl = trimOrNull(mediaMap.get(s.cover_media_id)?.public_url);
  }
  return {
    id: s.id,
    title: s.title,
    slug: s.slug,
    description: s.description,
    startDate: s.start_date,
    endDate: s.end_date,
    coverUrl,
    lessons,
  };
}

// WEB-02 homepage hook: latest published Sunday school lesson by lesson_date.
export async function getLatestSundaySchoolLesson(): Promise<SundaySchoolLessonItem | null> {
  const now = new Date();
  const rows = await db
    .select()
    .from(sundaySchoolLessons)
    .where(lessonVisible(now))
    .orderBy(desc(sundaySchoolLessons.lesson_date), desc(sundaySchoolLessons.lesson_number))
    .limit(3);
  const first = rows.find((r) => isPubliclyVisible(r, now));
  if (!first) return null;
  const [item] = await hydrateLessons([first]);
  return item;
}

export function firstParam(raw: string | string[] | undefined): string | undefined {
  return cleanParam(raw);
}

export function parseLessonNumber(raw: string | string[] | undefined): number | undefined {
  const v = cleanParam(raw);
  if (!v) return undefined;
  const n = Number.parseInt(v.replace(/^lesson\s*/i, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}
