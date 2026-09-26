import type { DB } from "@/db/client";
import { contentCategories, sitePages } from "@/db/schema";

type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

type CategorySeed = typeof contentCategories.$inferInsert;

// Default sermon / bible_study topics (PRD 05 §6; plan Phase 2 Task 11).
// Real sermons/lessons are created by staff — this seeds categories only.
export const CONTENT_CATEGORY_SEED: CategorySeed[] = [
  { type: "sermon", name: "Faith", slug: "faith", sort_order: 0, is_active: true },
  { type: "sermon", name: "Prayer", slug: "prayer", sort_order: 1, is_active: true },
  { type: "sermon", name: "Healing", slug: "healing", sort_order: 2, is_active: true },
  { type: "sermon", name: "Grace", slug: "grace", sort_order: 3, is_active: true },
  { type: "sermon", name: "Repentance", slug: "repentance", sort_order: 4, is_active: true },
  { type: "sermon", name: "Holy Spirit", slug: "holy-spirit", sort_order: 5, is_active: true },
  { type: "sermon", name: "Family", slug: "family", sort_order: 6, is_active: true },
  { type: "sermon", name: "Thanksgiving", slug: "thanksgiving", sort_order: 7, is_active: true },
  { type: "bible_study", name: "Genesis Foundations", slug: "genesis-foundations", sort_order: 0, is_active: true },
  { type: "bible_study", name: "Gospel of John", slug: "gospel-of-john", sort_order: 1, is_active: true },
  { type: "bible_study", name: "Romans", slug: "romans", sort_order: 2, is_active: true },
  { type: "bible_study", name: "Psalms", slug: "psalms", sort_order: 3, is_active: true },
  { type: "bible_study", name: "Acts of the Apostles", slug: "acts-of-the-apostles", sort_order: 4, is_active: true },
  { type: "bible_study", name: "Christian Living", slug: "christian-living", sort_order: 5, is_active: true },
];

type SitePageSeed = typeof sitePages.$inferInsert;

// Default church-info pages (PRD 05 §13; plan Phase 3 Task 8). Placeholder
// copy is always marked [Placeholder] so the public site never presents seed
// text as real church content.
export const SITE_PAGE_SEED: SitePageSeed[] = [
  { key: "about.history", title: "Our History", body: "[Placeholder] The history of the church will be published here." },
  { key: "about.vision", title: "Our Vision", body: "[Placeholder] The vision of the church will be published here." },
  { key: "about.mission", title: "Our Mission", body: "[Placeholder] The mission of the church will be published here." },
  { key: "about.beliefs", title: "What We Believe", body: "[Placeholder] The beliefs of the church will be published here." },
];

export async function seedContentTables(tx: Tx) {
  await tx.insert(contentCategories)
    .values(CONTENT_CATEGORY_SEED)
    .onConflictDoNothing({ target: [contentCategories.type, contentCategories.slug] });

  // Default church-info pages (PRD 05 §13; plan Phase 3 Task 8). Idempotent:
  // onConflictDoNothing keeps staff-edited copy on every re-seed. No demo
  // events/albums here — real items are created by staff.
  await tx.insert(sitePages)
    .values(SITE_PAGE_SEED)
    .onConflictDoNothing({ target: [sitePages.key] });
}
