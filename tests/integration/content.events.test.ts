import { describe, it, expect } from "vitest";
import { db } from "@/db/client";
import { auditLogs, events, programmes, redirects } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  archiveEvent,
  buildIcs,
  createEvent,
  listFeatured,
  listPast,
  listUpcoming,
  publishEvent,
  restoreEvent,
  scheduleEvent,
  softDeleteEvent,
  todayInLagos,
  unpublishEvent,
  updateEvent,
} from "@/modules/content/event.service";
import {
  addSession,
  createProgramme,
  getAgenda,
  publishProgramme,
  removeSession,
  reorderSessions,
  scheduleProgramme,
  updateSession,
} from "@/modules/content/programme.service";
import { runPublishScheduler } from "@/jobs/publish-scheduler";

function uid() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const admin = { role: "admin" as const, userId: null };
const cm = { role: "content_manager" as const, userId: null };

describe("events + programmes (05 §10-11)", () => {
  it("05 §10: end_date before start_date rejected", async () => {
    const today = todayInLagos();
    await expect(
      createEvent(
        {
          title: `Bad Range ${uid()}`,
          start_date: addDays(today, 10),
          end_date: addDays(today, 5),
        },
        admin,
      ),
    ).rejects.toThrow(/end_date/i);
  }, 60000);

  it("05 §10: same-day end_time <= start_time rejected", async () => {
    const today = todayInLagos();
    const day = addDays(today, 10);
    await expect(
      createEvent(
        {
          title: `Bad Time ${uid()}`,
          start_date: day,
          start_time: "10:00",
          end_time: "09:00",
        },
        admin,
      ),
    ).rejects.toThrow(/end_time/i);
    await expect(
      createEvent(
        {
          title: `Equal Time ${uid()}`,
          start_date: day,
          start_time: "10:00",
          end_time: "10:00",
        },
        admin,
      ),
    ).rejects.toThrow(/end_time/i);
  }, 60000);

  it("05 §11: session date outside programme range rejected", async () => {
    const today = todayInLagos();
    const prog = await createProgramme(
      {
        title: `Ranged Prog ${uid()}`,
        start_date: addDays(today, 30),
        end_date: addDays(today, 32),
      },
      admin,
    );
    await expect(
      addSession(
        prog.id,
        { title: "Too Late", date: addDays(today, 40), start_time: "10:00" },
        admin,
      ),
    ).rejects.toThrow(/range/i);
    await expect(
      addSession(
        prog.id,
        { title: "Too Early", date: addDays(today, 29) },
        admin,
      ),
    ).rejects.toThrow(/range/i);
  }, 60000);

  it("05 §10: upcoming/past/featured queries correct", async () => {
    const today = todayInLagos();
    const tag = uid();
    const past = await createEvent(
      { title: `Past Ev ${tag}`, start_date: addDays(today, -10) },
      admin,
    );
    await publishEvent(past.id, admin, { requireReview: false });
    const upcoming = await createEvent(
      { title: `Upcoming Ev ${tag}`, start_date: addDays(today, 10) },
      admin,
    );
    await publishEvent(upcoming.id, admin, { requireReview: false });
    const featured = await createEvent(
      {
        title: `Featured Ev ${tag}`,
        start_date: addDays(today, 5),
        is_featured: true,
      },
      admin,
    );
    await publishEvent(featured.id, admin, { requireReview: false });
    const draft = await createEvent(
      { title: `Draft Ev ${tag}`, start_date: addDays(today, 7) },
      admin,
    );

    const now = new Date();
    const upSlugs = (await listUpcoming(now)).map((r) => r.slug);
    expect(upSlugs).toContain(upcoming.slug);
    expect(upSlugs).toContain(featured.slug);
    expect(upSlugs).not.toContain(past.slug);
    expect(upSlugs).not.toContain(draft.slug);

    const pastSlugs = (await listPast(now)).map((r) => r.slug);
    expect(pastSlugs).toContain(past.slug);
    expect(pastSlugs).not.toContain(upcoming.slug);
    expect(pastSlugs).not.toContain(draft.slug);

    const featSlugs = (await listFeatured(now)).map((r) => r.slug);
    expect(featSlugs).toContain(featured.slug);
    expect(featSlugs).not.toContain(upcoming.slug);
    expect(featSlugs).not.toContain(past.slug);
  }, 60000);

  it("CMS-02: scheduled event + programme flip via scheduler; re-run no-op", async () => {
    const today = todayInLagos();
    const tag = uid();
    const ev = await createEvent(
      { title: `Sched Ev ${tag}`, start_date: addDays(today, 10) },
      admin,
    );
    const prog = await createProgramme(
      {
        title: `Sched Prog ${tag}`,
        start_date: addDays(today, 10),
        end_date: addDays(today, 12),
      },
      admin,
    );
    const future = new Date(Date.now() + 60 * 60 * 1000);
    await scheduleEvent(ev.id, future, admin, { requireReview: false });
    await scheduleProgramme(prog.id, future, admin, { requireReview: false });

    const afterDue = new Date(future.getTime() + 1000);
    const first = await runPublishScheduler(afterDue);
    expect(first.events).toBeGreaterThanOrEqual(1);
    expect(first.programmes).toBeGreaterThanOrEqual(1);

    const [evRow] = await db.select().from(events).where(eq(events.id, ev.id));
    const [progRow] = await db.select().from(programmes).where(eq(programmes.id, prog.id));
    expect(evRow.status).toBe("published");
    expect(progRow.status).toBe("published");

    const second = await runPublishScheduler(new Date());
    expect(second.events).toBe(0);
    expect(second.programmes).toBe(0);
  }, 60000);

  it("CMS-06: slug change on published event creates 301 redirect", async () => {
    const tag = uid();
    const row = await createEvent({ title: `Slug Ev ${tag}`, start_date: addDays(todayInLagos(), 10) }, admin);
    await publishEvent(row.id, admin, { requireReview: false });
    const updated = await updateEvent(row.id, { title: `Slug Ev Renamed ${tag}` }, admin);
    expect(updated.slug).not.toBe(row.slug);
    const found = await db
      .select()
      .from(redirects)
      .where(eq(redirects.from_path, `/events/${row.slug}`));
    expect(found.length).toBe(1);
    expect(found[0].to_path).toBe(`/events/${updated.slug}`);
    expect(found[0].status_code).toBe(301);
  }, 60000);

  it("05 §11: agenda grouped by day ascending; reorder persists", async () => {
    const today = todayInLagos();
    const d1 = addDays(today, 20);
    const d2 = addDays(today, 21);
    const prog = await createProgramme(
      { title: `Agenda Prog ${uid()}`, start_date: d1, end_date: d2 },
      admin,
    );
    const b = await addSession(
      prog.id,
      { title: "Day1 Second", date: d1, start_time: "11:00", sort_order: 1 },
      admin,
    );
    const a = await addSession(
      prog.id,
      { title: "Day1 First", date: d1, start_time: "09:00", sort_order: 0 },
      admin,
    );
    const c = await addSession(prog.id, { title: "Day2 Only", date: d2 }, admin);

    let agenda = await getAgenda(prog.id);
    expect(agenda.map((d) => d.date)).toEqual([d1, d2]);
    expect(agenda[0].sessions.map((s) => s.title)).toEqual(["Day1 First", "Day1 Second"]);

    await reorderSessions(prog.id, [b.id, a.id, c.id], admin);
    agenda = await getAgenda(prog.id);
    expect(agenda[0].sessions.map((s) => s.title)).toEqual(["Day1 Second", "Day1 First"]);

    // Session update outside the range is rejected; remove deletes.
    await expect(updateSession(c.id, { date: addDays(today, 50) }, admin)).rejects.toThrow(/range/i);
    await removeSession(c.id, admin);
    agenda = await getAgenda(prog.id);
    expect(agenda.map((d) => d.date)).toEqual([d1]);
  }, 60000);

  it("CMS-01/CMS-05: event lifecycle smoke (unpublish/archive/delete/restore)", async () => {
    const row = await createEvent(
      { title: `Life Ev ${uid()}`, start_date: addDays(todayInLagos(), 10) },
      admin,
    );
    const pub = await publishEvent(row.id, admin, { requireReview: false });
    expect(pub.status).toBe("published");
    const draft = await unpublishEvent(row.id, admin);
    expect(draft.status).toBe("draft");
    const repub = await publishEvent(row.id, admin, { requireReview: false });
    const arch = await archiveEvent(repub.id, admin);
    expect(arch.status).toBe("archived");
    const deleted = await softDeleteEvent(row.id, admin);
    expect(deleted.deleted_at).not.toBeNull();
    await expect(restoreEvent(row.id, cm)).rejects.toThrow(/admin/i);
    const restored = await restoreEvent(row.id, admin);
    expect(restored.deleted_at).toBeNull();
  }, 60000);

  it("CMS-08: event mutations audit-logged; buildIcs shape (05 §10)", async () => {
    const today = todayInLagos();
    const tag = uid();
    const row = await createEvent(
      {
        title: `ICS Ev ${tag}`,
        description: "An evening, of praise;",
        start_date: addDays(today, 10),
        start_time: "18:00",
        end_time: "20:00",
        venue: "Main Hall",
        address: "1 Church St",
      },
      admin,
    );
    await publishEvent(row.id, admin, { requireReview: false });
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entity_id, row.id));
    expect(logs.length).toBeGreaterThanOrEqual(2);
    expect(logs.some((l) => l.action === "event.create")).toBe(true);
    expect(logs.some((l) => l.action === "event.publish")).toBe(true);

    const ics = buildIcs(row);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain(`UID:${row.id}@movaldem`);
    // Floating Lagos local time: no trailing Z / TZID.
    expect(ics).toMatch(/DTSTART:\d{8}T180000\r\n/);
    expect(ics).toMatch(/DTEND:\d{8}T200000\r\n/);
    expect(ics).toContain(`SUMMARY:ICS Ev ${tag}`);
    // Comma/semicolon escaping per RFC 5545.
    expect(ics).toContain("DESCRIPTION:An evening\\, of praise\\;");
    expect(ics).toContain("LOCATION:Main Hall\\, 1 Church St");
    // Programme publish is audit-logged too (CMS-08).
    const prog = await createProgramme(
      {
        title: `ICS Prog ${tag}`,
        start_date: addDays(today, 10),
        end_date: addDays(today, 11),
      },
      admin,
    );
    await publishProgramme(prog.id, admin, { requireReview: false });
    const progLogs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entity_id, prog.id));
    expect(progLogs.some((l) => l.action === "programme.publish")).toBe(true);
  }, 60000);
});
