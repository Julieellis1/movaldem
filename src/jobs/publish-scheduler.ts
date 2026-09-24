import { db, type DB } from "@/db/client";
import { sermons, bibleStudies, sundaySchoolLessons } from "@/db/schema";
import { and, eq, lte, isNull } from "drizzle-orm";

export type PublishSchedulerResult = {
  sermons: number;
  bibleStudies: number;
  lessons: number;
  total: number;
};

// CMS-02: flip due `scheduled` rows to `published`. Idempotent: the WHERE
// clause only matches status=scheduled, so a re-run finds nothing to do.
export async function runPublishScheduler(
  now: Date = new Date(),
  database: DB = db,
): Promise<PublishSchedulerResult> {
  const due = (table: { status: unknown; published_at: unknown; deleted_at: unknown }) =>
    and(
      eq(table.status as never, "scheduled" as never),
      lte(table.published_at as never, now as never),
      isNull(table.deleted_at as never),
    );

  const flip = async (
    table: typeof sermons | typeof bibleStudies | typeof sundaySchoolLessons,
  ) => {
    const rows = await database
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(table as any)
      .set({ status: "published" as never, updated_at: now })
      .where(due(table as never))
      .returning({ id: (table as { id: unknown }).id as never });
    return rows.length;
  };

  const [s, b, l] = await Promise.all([
    flip(sermons),
    flip(bibleStudies),
    flip(sundaySchoolLessons),
  ]);
  return { sermons: s, bibleStudies: b, lessons: l, total: s + b + l };
}
