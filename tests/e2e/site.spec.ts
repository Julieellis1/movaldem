import { test, expect, type APIRequestContext } from "@playwright/test";
import { loginAsStaff } from "./helpers";

// Phase 3 public-site acceptance: PRD 10 Phase 3 exit — "public site navigable
// end-to-end with real content". Item 8 (e2e half) of
// docs/superpowers/plans/2026-09-26-phase3-events-programmes-gallery-site.md.
//
// CI-ONLY: do not run locally (`pnpm e2e` in CI after `pnpm db:seed`). Kept
// serial + generous timeouts like teaching-content.spec.ts — cold `next dev`
// compile is slow.
//
// Strategy:
// - Staff setup goes through the real backend the admin UI uses: /api/media
//   upload (PNG magic bytes, UPL-01), /api/events + .../status publish
//   (CMS-02), /api/programmes + sessions, /api/gallery + images + status
//   (publish Toggle guarded by gallery.update — no gallery.publish key),
//   /api/pages/[key] upsert, /api/leaders, /api/branches.
// - Visitor assertions are all real browser navigations of the public pages
//   (/, /events, /programmes, /gallery, /about, /leadership, /branches,
//   /contact) plus a direct /events/[slug]/ics GET (text/calendar).
// - Unique Date.now+random stamps everywhere; nothing is cleaned up.

const BASE = "http://localhost:3000";

// 1x1 transparent PNG (real PNG magic bytes, so UPL-01 sniffing passes).
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function stamp(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function datePlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function post(
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown>,
  expectedStatus: number,
  label: string,
): Promise<any> {
  const res = await request.post(path, { timeout: 180_000, data });
  expect(res.ok() || res.status() === expectedStatus, `${label} failed: ${res.status()} ${await res.text()}`).toBe(
    true,
  );
  expect(res.status(), `${label} status`).toBe(expectedStatus);
  return res.json();
}

async function uploadImage(
  request: APIRequestContext,
  name: string,
  title: string,
): Promise<{ id: string; public_url: string }> {
  const res = await request.post("/api/media", {
    timeout: 180_000,
    multipart: {
      file: { name, mimeType: "image/png", buffer: PNG_1X1 },
      title,
    },
  });
  expect(res.ok(), `upload ${name} failed: ${res.status()} ${await res.text()}`).toBe(true);
  const json = (await res.json()) as { row: { id: string; public_url: string } };
  return json.row;
}

async function createEvent(
  request: APIRequestContext,
  body: Record<string, unknown>,
): Promise<{ id: string; slug: string }> {
  const json = await post(request, "/api/events", body, 201, "create event");
  return json.row;
}

async function publishEvent(request: APIRequestContext, id: string): Promise<{ slug: string }> {
  const json = await post(request, `/api/events/${id}/status`, { action: "publish" }, 200, "publish event");
  return json.row;
}

async function createProgramme(
  request: APIRequestContext,
  body: Record<string, unknown>,
): Promise<{ id: string; slug: string }> {
  const json = await post(request, "/api/programmes", body, 201, "create programme");
  return json.row;
}

async function publishProgramme(request: APIRequestContext, id: string): Promise<{ slug: string }> {
  const json = await post(request, `/api/programmes/${id}/status`, { action: "publish" }, 200, "publish programme");
  return json.row;
}

async function addSession(
  request: APIRequestContext,
  programmeId: string,
  body: Record<string, unknown>,
): Promise<{ id: string }> {
  const json = await post(request, `/api/programmes/${programmeId}/sessions`, body, 201, "add session");
  return json.row;
}

async function createAlbum(
  request: APIRequestContext,
  body: Record<string, unknown>,
): Promise<{ id: string; slug: string }> {
  const json = await post(request, "/api/gallery", body, 201, "create album");
  return json.row;
}

async function addAlbumImages(
  request: APIRequestContext,
  albumId: string,
  mediaIds: string[],
): Promise<void> {
  await post(request, `/api/gallery/${albumId}/images`, { mediaIds }, 201, "add album images");
}

async function publishAlbum(request: APIRequestContext, id: string): Promise<{ slug: string }> {
  const json = await post(request, `/api/gallery/${id}/status`, { action: "publish" }, 200, "publish album");
  return json.row;
}

test.describe("Phase 3 public site (PRD 10 Phase 3 exit)", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(600_000);

  test("homepage renders sections with real content (PRD 04 §3)", async ({ page, browser }) => {
    await loginAsStaff(page, "content_manager");
    const s = stamp();
    const eventTitle = `E2E Site Event ${s}`;
    const albumTitle = `E2E Site Album ${s}`;
    const historyMarker = `E2E history marker ${s}`;

    await upsertPage(page.request, "about.history", `Our History ${s}`, `${historyMarker}. Our story continues.`);
    const event = await createEvent(page.request, {
      title: eventTitle,
      start_date: datePlus(30),
      start_time: "10:00",
      venue: `Main Auditorium ${s}`,
    });
    await publishEvent(page.request, event.id);

    const img = await uploadImage(page.request, `e2e-site-${s}.png`, `E2E Site Image ${s}`);
    const album = await createAlbum(page.request, { title: albumTitle });
    await addAlbumImages(page.request, album.id, [img.id]);
    await publishAlbum(page.request, album.id);

    const visitorCtx = await browser.newContext();
    const visitor = await visitorCtx.newPage();
    try {
      await visitor.goto("/");
      // Welcome hero (always rendered).
      await expect(visitor.getByRole("heading", { name: /welcome to/i }).first()).toBeAttached();
      await expect(visitor.getByRole("link", { name: /upcoming events/i }).first()).toBeVisible({
        timeout: 90_000,
      });
      // About teaser renders the CMS history copy.
      await expect(visitor.getByText(historyMarker).first()).toBeVisible({ timeout: 90_000 });
      // Upcoming Events section carries the published event through.
      await expect(visitor.getByRole("link", { name: eventTitle }).first()).toBeVisible({ timeout: 90_000 });
      // Gallery preview links to the album.
      await expect(visitor.getByRole("link", { name: albumTitle }).first()).toBeVisible({ timeout: 90_000 });
      // Static quiz/giving sections are always present (Phase 4+ unlocks them).
      await expect(visitor.getByRole("heading", { name: /bible quiz/i })).toBeVisible();
      await expect(visitor.getByRole("heading", { name: /support the work of god/i })).toBeVisible();
    } finally {
      await visitorCtx.close();
    }
  });

  test("events upcoming/past filters, detail and .ics download (05 §10; LST-01)", async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, "content_manager");
    const s = stamp();
    const upcomingTitle = `E2E Upcoming ${s}`;
    const pastTitle = `E2E Past ${s}`;
    const venue = `Revival Ground ${s}`;

    const upcoming = await createEvent(page.request, {
      title: upcomingTitle,
      start_date: datePlus(30),
      start_time: "09:00",
      end_time: "12:00",
      venue,
    });
    const published = await publishEvent(page.request, upcoming.id);
    const past = await createEvent(page.request, {
      title: pastTitle,
      start_date: datePlus(-60),
      venue,
    });
    await publishEvent(page.request, past.id);

    const visitorCtx = await browser.newContext();
    const visitor = await visitorCtx.newPage();
    try {
      // Default filter is upcoming: past event must not leak in.
      await visitor.goto("/events");
      await expect(visitor.getByRole("heading", { name: /^events$/i })).toBeVisible({ timeout: 90_000 });
      await expect(visitor.getByRole("link", { name: upcomingTitle }).first()).toBeVisible({ timeout: 90_000 });
      await expect(visitor.getByText(pastTitle)).toHaveCount(0);

      // Past filter is URL-synced (?filter=past).
      await visitor.goto("/events?filter=past");
      await expect(visitor.getByRole("link", { name: pastTitle }).first()).toBeVisible({ timeout: 90_000 });
      await expect(visitor.getByText(upcomingTitle)).toHaveCount(0);

      // Detail: title, venue, Add to calendar (.ics href).
      await visitor.goto(`/events/${published.slug}`);
      await expect(visitor.getByRole("heading", { name: upcomingTitle, exact: true })).toBeVisible({
        timeout: 90_000,
      });
      await expect(visitor.getByText(venue).first()).toBeVisible();
      const icsLink = visitor.getByRole("link", { name: /add to calendar/i });
      await expect(icsLink).toBeVisible();
      expect(await icsLink.getAttribute("href")).toBe(`/events/${published.slug}/ics`);
    } finally {
      await visitorCtx.close();
    }

    // .ics endpoint serves a real calendar payload (asserted outside the
    // browser context like the download-tracking check in teaching-content).
    const icsRes = await page.request.get(`/events/${published.slug}/ics`, { timeout: 180_000 });
    expect(icsRes.status()).toBe(200);
    expect(icsRes.headers()["content-type"]).toContain("text/calendar");
    const icsText = await icsRes.text();
    expect(icsText).toContain("BEGIN:VCALENDAR");
    expect(icsText).toContain(upcomingTitle);
  });

  test("programme agenda renders sessions grouped by day (05 §11)", async ({ page, browser }) => {
    await loginAsStaff(page, "content_manager");
    const s = stamp();
    const title = `E2E Convention ${s}`;
    const dayOne = `Opening Night ${s}`;
    const dayTwo = `Grand Finale ${s}`;
    const speaker = `E2E Speaker ${s}`;

    const programme = await createProgramme(page.request, {
      title,
      start_date: datePlus(7),
      end_date: datePlus(8),
      venue: `Convention Ground ${s}`,
    });
    await addSession(page.request, programme.id, {
      title: dayOne,
      date: datePlus(7),
      start_time: "18:00",
      end_time: "21:00",
      speaker,
    });
    await addSession(page.request, programme.id, {
      title: dayTwo,
      date: datePlus(8),
      start_time: "09:00",
      speaker,
    });
    const published = await publishProgramme(page.request, programme.id);

    const visitorCtx = await browser.newContext();
    const visitor = await visitorCtx.newPage();
    try {
      await visitor.goto("/programmes");
      await expect(visitor.getByRole("heading", { name: /^programmes$/i })).toBeVisible({ timeout: 90_000 });
      await expect(visitor.getByRole("link", { name: title }).first()).toBeVisible({ timeout: 90_000 });

      await visitor.goto(`/programmes/${published.slug}`);
      await expect(visitor.getByRole("heading", { name: title, exact: true })).toBeVisible({
        timeout: 90_000,
      });
      await expect(visitor.getByRole("heading", { name: /agenda/i })).toBeVisible();
      await expect(visitor.getByRole("heading", { name: dayOne }).first()).toBeVisible();
      await expect(visitor.getByRole("heading", { name: dayTwo }).first()).toBeVisible();
      await expect(visitor.getByText(`Speaker: ${speaker}`).first()).toBeVisible();
      await expect(visitor.getByText(/18:00.*21:00.*WAT/).first()).toBeVisible();
    } finally {
      await visitorCtx.close();
    }
  });

  test("gallery album renders images and the lightbox opens/closes (05 §12)", async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, "content_manager");
    const s = stamp();
    const albumTitle = `E2E Album ${s}`;

    const img1 = await uploadImage(page.request, `e2e-album-${s}-1.png`, `E2E Album Image One ${s}`);
    const img2 = await uploadImage(page.request, `e2e-album-${s}-2.png`, `E2E Album Image Two ${s}`);
    const album = await createAlbum(page.request, {
      title: albumTitle,
      description: `Photos from the E2E gathering ${s}.`,
    });
    await addAlbumImages(page.request, album.id, [img1.id, img2.id]);
    const published = await publishAlbum(page.request, album.id);

    const visitorCtx = await browser.newContext();
    const visitor = await visitorCtx.newPage();
    try {
      await visitor.goto("/gallery");
      await expect(visitor.getByRole("heading", { name: /^gallery$/i })).toBeVisible({ timeout: 90_000 });
      await expect(visitor.getByRole("link", { name: albumTitle }).first()).toBeVisible({ timeout: 90_000 });

      await visitor.goto(`/gallery/${published.slug}`);
      await expect(visitor.getByRole("heading", { name: albumTitle, exact: true })).toBeVisible({
        timeout: 90_000,
      });

      // Tiles are keyboard-operable buttons; clicking opens the lightbox.
      const firstTile = visitor.getByRole("button", { name: /open image 1 of 2/i });
      await expect(firstTile).toBeVisible({ timeout: 90_000 });
      await firstTile.click();
      const dialog = visitor.getByRole("dialog", { name: /image viewer/i });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("1 of 2")).toBeVisible();

      // Arrows navigate, Esc closes.
      await dialog.getByRole("button", { name: /next image/i }).click();
      await expect(dialog.getByText("2 of 2")).toBeVisible();
      await visitor.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    } finally {
      await visitorCtx.close();
    }
  });

  test("about, leadership and branches render CMS content (04 §10; 05 §13)", async ({
    page,
    browser,
  }) => {
    await loginAsStaff(page, "content_manager");
    const s = stamp();
    const visionMarker = `E2E vision marker ${s}`;
    const leaderName = `E2E Leader ${s}`;
    const branchName = `E2E Branch ${s}`;
    const branchAddress = `${s} Test Road, Lagos`;
    const serviceTimes = `Sundays 8am ${s}`;

    await upsertPage(
      page.request,
      "about.vision",
      `Our Vision ${s}`,
      `${visionMarker}. We exist to win souls.`,
    );
    await post(
      page.request,
      "/api/leaders",
      { name: leaderName, title: "General Overseer", bio: `Bio ${s}` },
      201,
      "create leader",
    );
    await post(
      page.request,
      "/api/branches",
      { name: branchName, address: branchAddress, service_times: serviceTimes },
      201,
      "create branch",
    );

    const visitorCtx = await browser.newContext();
    const visitor = await visitorCtx.newPage();
    try {
      await visitor.goto("/about");
      await expect(visitor.getByRole("heading", { name: /about us/i })).toBeVisible({ timeout: 90_000 });
      await expect(visitor.getByText(visionMarker).first()).toBeVisible({ timeout: 90_000 });
      await expect(visitor.getByRole("link", { name: /view all branches/i })).toBeVisible();
      await expect(visitor.getByRole("link", { name: /meet our leadership/i })).toBeVisible();

      await visitor.goto("/leadership");
      await expect(visitor.getByRole("heading", { name: /^leadership$/i })).toBeVisible({ timeout: 90_000 });
      await expect(visitor.getByRole("heading", { name: leaderName })).toBeVisible({ timeout: 90_000 });
      await expect(visitor.getByText("General Overseer").first()).toBeVisible();

      await visitor.goto("/branches");
      await expect(visitor.getByRole("heading", { name: /^branches$/i })).toBeVisible({ timeout: 90_000 });
      await expect(visitor.getByRole("heading", { name: branchName })).toBeVisible({ timeout: 90_000 });
      await expect(visitor.getByText(branchAddress).first()).toBeVisible();
      await expect(visitor.getByText(serviceTimes).first()).toBeVisible();
    } finally {
      await visitorCtx.close();
    }
  });

  test("contact submit shows success (PRD 04 §9)", async ({ browser }) => {
    const visitorCtx = await browser.newContext();
    const visitor = await visitorCtx.newPage();
    try {
      const s = stamp();
      await visitor.goto("/contact");
      await expect(visitor.getByRole("heading", { name: /contact us/i })).toBeVisible({ timeout: 90_000 });

      // Client-side validation fires first on an empty submit.
      await visitor.getByRole("button", { name: /send message/i }).click();
      await expect(visitor.getByText(/enter your name/i).first()).toBeVisible();

      await visitor.getByLabel("Name", { exact: true }).fill(`Grace Visitor ${s}`);
      await visitor.getByLabel("Email", { exact: true }).fill(`grace-${s}@example.com`);
      await visitor.getByLabel("Subject", { exact: true }).fill(`Service times ${s}`);
      await visitor.getByLabel("Message", { exact: true }).fill(`Please tell me about service times ${s}.`);
      await visitor.getByRole("button", { name: /send message/i }).click();
      await expect(visitor.getByText(/message sent/i).first()).toBeVisible({ timeout: 90_000 });
      await expect(visitor.getByText(/thank you for contacting us/i).first()).toBeVisible();
    } finally {
      await visitorCtx.close();
    }
  });
});

async function upsertPage(
  request: APIRequestContext,
  key: string,
  title: string,
  body: string,
): Promise<void> {
  const res = await request.put(`/api/pages/${key}`, {
    timeout: 180_000,
    data: { title, body },
  });
  expect(res.ok(), `upsert page ${key} failed: ${res.status()} ${await res.text()}`).toBe(true);
}
