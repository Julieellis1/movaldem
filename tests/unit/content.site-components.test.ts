import { describe, it, expect } from "vitest";
import { groupSessionsByDay } from "@/components/content/agenda-view";
import { icsHrefFor } from "@/components/content/add-to-calendar-button";
import {
  nextIndex,
  prevIndex,
  lightboxKeyAction,
} from "@/components/content/lightbox";
import { CONTACT_HONEYPOT_FIELD } from "@/components/content/contact-form";

// Phase 3 Task 5: reusable site components (UI only).
// PRD 05 §10 events, §11 programmes, §12 gallery; PRD 04 §9 contact, §11 catalogue.

describe("groupSessionsByDay (05 §11 programmes agenda)", () => {
  it("[05-§11] groups sessions by day in ascending date order", () => {
    const groups = groupSessionsByDay([
      { id: "b", title: "Evening Revival", date: "2026-12-06", sort_order: 1 },
      { id: "a", title: "Opening Service", date: "2026-12-05", sort_order: 0 },
      { id: "c", title: "Closing Service", date: "2026-12-07", sort_order: 0 },
    ]);
    expect(groups.map((g) => g.date)).toEqual([
      "2026-12-05",
      "2026-12-06",
      "2026-12-07",
    ]);
  });

  it("[05-§11] orders sessions within a day by sort_order then start_time", () => {
    const groups = groupSessionsByDay([
      { id: "2", title: "Second", date: "2026-12-05", start_time: "18:00", sort_order: 1 },
      { id: "1", title: "First", date: "2026-12-05", start_time: "09:00", sort_order: 0 },
      { id: "3", title: "Third", date: "2026-12-05", start_time: "09:00", sort_order: 1 },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].sessions.map((s) => s.id)).toEqual(["1", "3", "2"]);
  });

  it("[05-§11] empty programme returns no groups (AgendaView renders null state)", () => {
    expect(groupSessionsByDay([])).toEqual([]);
  });
});

describe("icsHrefFor (05 §10 events Add to calendar)", () => {
  it("[05-§10] builds the /events/[slug]/ics href", () => {
    expect(icsHrefFor("christmas-carol-2026")).toBe("/events/christmas-carol-2026/ics");
  });
});

describe("lightbox index helpers (05 §12 gallery)", () => {
  it("[05-§12] nextIndex advances and wraps to the first image", () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(2, 3)).toBe(0);
  });

  it("[05-§12] prevIndex goes back and wraps to the last image", () => {
    expect(prevIndex(1, 3)).toBe(0);
    expect(prevIndex(0, 3)).toBe(2);
  });

  it("[05-§12] empty image list stays at index 0", () => {
    expect(nextIndex(0, 0)).toBe(0);
    expect(prevIndex(0, 0)).toBe(0);
  });

  it("[05-§12] keyboard map: arrows navigate, Esc closes", () => {
    expect(lightboxKeyAction("ArrowRight")).toBe("next");
    expect(lightboxKeyAction("ArrowLeft")).toBe("prev");
    expect(lightboxKeyAction("Escape")).toBe("close");
    expect(lightboxKeyAction("Enter")).toBeNull();
  });
});

describe("contact honeypot (04 §9 contact spam control)", () => {
  it("[04-§9] exports the honeypot field name for the future /api/contact route", () => {
    expect(CONTACT_HONEYPOT_FIELD).toBe("company_website");
    expect(typeof CONTACT_HONEYPOT_FIELD).toBe("string");
    expect(CONTACT_HONEYPOT_FIELD.length).toBeGreaterThan(0);
  });
});
