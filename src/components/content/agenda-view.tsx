import { EmptyState } from "@/components/shared/empty-state";

// PRD 05 §11 programmes: public page shows an agenda grouped by day.
// Presentational only: no db imports, no fetch.

export type ProgrammeSessionData = {
  id: string;
  title: string;
  /** YYYY-MM-DD wall-clock date, interpreted in Africa/Lagos. */
  date: string;
  /** "HH:MM" wall-clock, Africa/Lagos. */
  start_time?: string | null;
  end_time?: string | null;
  speaker?: string | null;
  description?: string | null;
  sort_order?: number | null;
};

export type SessionDayGroup = {
  date: string;
  sessions: ProgrammeSessionData[];
};

/**
 * Group sessions by day, days ascending; sessions within a day ordered by
 * sort_order then start_time then title. Pure helper (unit-tested).
 */
export function groupSessionsByDay(sessions: ProgrammeSessionData[]): SessionDayGroup[] {
  const byDay = new Map<string, ProgrammeSessionData[]>();
  for (const s of sessions) {
    const list = byDay.get(s.date) ?? [];
    list.push(s);
    byDay.set(s.date, list);
  }
  const days = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, list]) => ({
      date,
      sessions: [...list].sort((a, b) => {
        const order = (a.sort_order ?? 0) - (b.sort_order ?? 0);
        if (order !== 0) return order;
        const ta = a.start_time ?? "";
        const tb = b.start_time ?? "";
        if (ta !== tb) return ta < tb ? -1 : 1;
        return a.title.localeCompare(b.title);
      }),
    }));
  return days;
}

function formatDayHeading(date: string): string {
  const d = new Date(`${date}T00:00:00+01:00`);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function formatTimeRange(s: Pick<ProgrammeSessionData, "start_time" | "end_time">): string | null {
  if (s.start_time && s.end_time) return `${s.start_time} – ${s.end_time} WAT`;
  if (s.start_time) return `${s.start_time} WAT`;
  return null;
}

export function AgendaView({ sessions }: { sessions: ProgrammeSessionData[] }) {
  const days = groupSessionsByDay(sessions);
  if (days.length === 0) {
    return (
      <EmptyState
        title="No sessions scheduled yet"
        description="The programme agenda will appear here once sessions are published."
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {days.map((day) => (
        <section key={day.date} aria-labelledby={`agenda-day-${day.date}`}>
          <h2
            id={`agenda-day-${day.date}`}
            className="font-headline-sm text-headline-sm text-text-primary"
          >
            <time dateTime={day.date}>{formatDayHeading(day.date)}</time>
          </h2>
          <ol className="mt-3 flex flex-col gap-3">
            {day.sessions.map((s) => {
              const time = formatTimeRange(s);
              return (
                <li
                  key={s.id}
                  className="rounded-xl border border-border-subtle bg-surface-card p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-body text-body font-semibold text-text-primary">
                      {s.title}
                    </h3>
                    {time && (
                      <p className="text-xs text-on-surface-variant">
                        <time>{time}</time>
                      </p>
                    )}
                  </div>
                  {s.speaker && (
                    <p className="mt-1 text-sm text-on-surface-variant">
                      Speaker: {s.speaker}
                    </p>
                  )}
                  {s.description && (
                    <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
                      {s.description}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

export default AgendaView;
