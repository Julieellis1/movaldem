import { buildIcs, getEventBySlug } from "@/modules/content/event.service";
import { isPubliclyVisible } from "@/modules/content/lifecycle";

// PRD 05 §10: "Add to calendar" (.ics download). GET returns the buildIcs
// output as a text/calendar download. Unpublished/missing events → 404.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params;
  const row = await getEventBySlug(slug);
  if (!row || !isPubliclyVisible(row)) {
    return new Response("Event not found", { status: 404 });
  }
  const ics = buildIcs({
    id: row.id,
    title: row.title,
    description: row.description,
    start_date: row.start_date,
    end_date: row.end_date,
    start_time: row.start_time,
    end_time: row.end_time,
    venue: row.venue,
    address: row.address,
  });
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${row.slug}.ics"`,
    },
  });
}
