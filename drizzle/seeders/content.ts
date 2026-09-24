import type { DB } from "@/db/client";
import { contentCategories } from "@/db/schema";

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

export async function seedContentTables(tx: Tx) {
  await tx.insert(contentCategories)
    .values(CONTENT_CATEGORY_SEED)
    .onConflictDoNothing({ target: [contentCategories.type, contentCategories.slug] });
}
