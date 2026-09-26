import { Button } from "@/components/ui/button";

// PRD 05 §10 events: "Add to calendar" (.ics download).
// Presentational only: plain anchor downloading the event's .ics href.

/** Pure href builder (unit-tested): /events/[slug]/ics */
export function icsHrefFor(slug: string): string {
  return `/events/${slug}/ics`;
}

export function AddToCalendarButton({
  href,
  label = "Add to calendar",
}: {
  /** The event's .ics URL — build with icsHrefFor(slug). */
  href: string;
  label?: string;
}) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={href} download aria-label={label}>
        {label}
      </a>
    </Button>
  );
}

export default AddToCalendarButton;
