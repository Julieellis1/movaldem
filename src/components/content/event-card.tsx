import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// PRD 05 §10 events; PRD 04 §11 catalogue (listing cards), LST-03.
// Presentational only: no db imports, no fetch.

export type EventCardData = {
  slug: string;
  title: string;
  /** YYYY-MM-DD wall-clock date, interpreted in Africa/Lagos. */
  start_date: string;
  /** YYYY-MM-DD; omit for single-day events. */
  end_date?: string | null;
  /** "HH:MM" wall-clock, Africa/Lagos. */
  start_time?: string | null;
  /** "HH:MM" wall-clock, Africa/Lagos. */
  end_time?: string | null;
  venue?: string | null;
  address?: string | null;
  is_featured?: boolean;
  /** True when the event has ended; drives upcoming/past styling. */
  isPast?: boolean;
  thumbnailUrl?: string | null;
  thumbnailAlt?: string;
};

const LAGOS_TZ = "Africa/Lagos";

/** Parse a YYYY-MM-DD + optional HH:MM wall-clock time as a Lagos instant. */
export function lagosInstant(date: string, time?: string | null): Date {
  const t = time ?? "00:00";
  return new Date(`${date}T${t}:00+01:00`);
}

/** Lagos-formatted date/time label, e.g. "Sat, 21 Sep 2026, 10:00 AM WAT". */
export function formatEventDateTime(event: Pick<EventCardData, "start_date" | "end_date" | "start_time" | "end_time">): string {
  const start = lagosInstant(event.start_date, event.start_time);
  const dateFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: LAGOS_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat("en-NG", {
    timeZone: LAGOS_TZ,
    hour: "numeric",
    minute: "2-digit",
  });
  let label = dateFmt.format(start);
  if (event.start_time) label += `, ${timeFmt.format(start)} WAT`;
  const endDate = event.end_date && event.end_date !== event.start_date ? event.end_date : null;
  if (endDate) {
    label += ` – ${dateFmt.format(lagosInstant(endDate, event.end_time))}`;
    if (event.end_time) label += `, ${timeFmt.format(lagosInstant(endDate, event.end_time))} WAT`;
  } else if (event.end_time && event.start_time) {
    label += ` – ${timeFmt.format(lagosInstant(event.start_date, event.end_time))} WAT`;
  }
  return label;
}

export function EventCard({ event, className }: { event: EventCardData; className?: string }) {
  const href = `/events/${event.slug}`;
  const venue = event.venue ?? event.address ?? null;
  return (
    <article
      aria-label={event.title}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-surface-card",
        event.isPast && "opacity-75",
        className,
      )}
    >
      <Link
        href={href}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
        aria-label={event.title}
        tabIndex={-1}
        aria-hidden={false}
      >
        {event.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.thumbnailUrl}
            alt={event.thumbnailAlt ?? ""}
            loading="lazy"
            className="aspect-video w-full object-cover"
          />
        ) : (
          <div className="aspect-video w-full bg-surface-elevated" aria-hidden="true" />
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {event.is_featured && <Badge>Featured</Badge>}
          <Badge variant={event.isPast ? "outline" : "secondary"}>
            {event.isPast ? "Past" : "Upcoming"}
          </Badge>
        </div>
        <p className="text-xs text-on-surface-variant">
          <time dateTime={event.start_date}>{formatEventDateTime(event)}</time>
        </p>
        <h3 className="font-headline-sm text-headline-sm text-text-primary">
          <Link
            href={href}
            className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
          >
            {event.title}
          </Link>
        </h3>
        {venue && (
          <p className="font-body-sm text-body-sm text-on-surface-variant">{venue}</p>
        )}
      </div>
    </article>
  );
}

export default EventCard;
