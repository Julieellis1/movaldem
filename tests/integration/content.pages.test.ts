import { describe, it, expect } from "vitest";
import { eq, and } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditLogs,
  contactMessages,
  notifications,
} from "@/db/schema";
import {
  upsertSitePage,
  getSitePage,
  createLeader,
  setLeaderVisibility,
  reorderLeaders,
  listVisibleLeaders,
  createBranch,
  listVisibleBranches,
} from "@/modules/content/page.service";
import {
  CONTACT_RATE_LIMIT,
  submitContact,
  listContactMessages,
  setContactStatus,
  deleteContactMessage,
} from "@/modules/content/contact.service";
import { setSetting } from "@/modules/platform/settings/settings.service";

function uid() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

const admin = { role: "admin" as const, userId: null };

describe("site pages + leaders + branches (PRD 05 §13; CMS-08)", () => {
  it("05-§13: upsertSitePage rejects unknown keys", async () => {
    await expect(
      upsertSitePage("about.unknown", "Nope", "body", admin),
    ).rejects.toThrow(/unknown|invalid/i);
  }, 30000);

  it("05-§13: upsertSitePage round-trips a known key", async () => {
    const row = await upsertSitePage("about.vision", `Vision ${uid()}`, "Our vision body", admin);
    expect(row.key).toBe("about.vision");
    const fetched = await getSitePage("about.vision");
    expect(fetched?.title).toBe(row.title);
  }, 30000);

  it("05-§13/CMS-08: leaders list returns visible only, ordered by sort_order", async () => {
    const tag = uid();
    const b = await createLeader({ name: `B ${tag}`, title: "Pastor", sort_order: 20 }, admin);
    const a = await createLeader({ name: `A ${tag}`, title: "Elder", sort_order: 10 }, admin);
    const hidden = await createLeader({ name: `Hidden ${tag}`, title: "Deacon", sort_order: 0 }, admin);
    await setLeaderVisibility(hidden.leader.id, false, admin);

    const visible = await listVisibleLeaders();
    const mine = visible.filter((l) => l.name.endsWith(tag));
    expect(mine.map((l) => l.name)).toEqual([`A ${tag}`, `B ${tag}`]);

    // Reorder persists.
    await reorderLeaders([b.leader.id, a.leader.id], admin);
    const reordered = (await listVisibleLeaders()).filter((l) => l.name.endsWith(tag));
    expect(reordered.map((l) => l.name)).toEqual([`B ${tag}`, `A ${tag}`]);

    // Every mutation writes an audit log row (CMS-08).
    const audits = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entity_type, "leaders"));
    expect(audits.some((r) => r.entity_id === a.leader.id)).toBe(true);
  }, 30000);

  it("05-§13: branches list returns visible only, ordered by sort_order", async () => {
    const tag = uid();
    await createBranch({ name: `Branch B ${tag}`, address: "1 Road", sort_order: 2 }, admin);
    await createBranch({ name: `Branch A ${tag}`, address: "2 Road", sort_order: 1 }, admin);
    const visible = await listVisibleBranches();
    const mine = visible.filter((b) => b.name.endsWith(tag));
    expect(mine.map((b) => b.name)).toEqual([`Branch A ${tag}`, `Branch B ${tag}`]);
  }, 30000);
});

describe("contact form + inbox (PRD 04 §9; PRD 08 §4; SEC-05; NTF-01)", () => {
  it("04-§9: honeypot-filled submit returns fake success and stores zero rows", async () => {
    const marker = `Honeypot ${uid()}`;
    const before = await db
      .select()
      .from(contactMessages)
      .where(eq(contactMessages.subject, marker));
    expect(before.length).toBe(0);

    const res = await submitContact({
      name: "Spammer",
      email: "spam@example.com",
      subject: marker,
      message: "buy now",
      honeypot: "i am a bot",
      ip: `198.51.100.9-${uid()}`,
    });
    // Fake success: caller sees ok, but nothing was stored (04-§9).
    expect(res.spam).toBe(true);
    expect(res.id).toBeNull();

    const after = await db
      .select()
      .from(contactMessages)
      .where(eq(contactMessages.subject, marker));
    expect(after.length).toBe(0);
  }, 30000);

  it("SEC-05: rate-limited submit throws 429 and stores zero rows", async () => {
    const ip = `203.0.113.77-${uid()}`;
    const marker = `Rate ${uid()}`;
    for (let i = 0; i < CONTACT_RATE_LIMIT.limit; i++) {
      await submitContact({
        name: "Visitor",
        email: `visitor${i}@example.com`,
        subject: `${marker} ${i}`,
        message: "hello",
        ip,
      });
    }
    const before = await db
      .select()
      .from(contactMessages)
      .where(eq(contactMessages.subject, `${marker} blocked`));

    const err = await submitContact({
      name: "Visitor",
      email: "blocked@example.com",
      subject: `${marker} blocked`,
      message: "hello again",
      ip,
    }).catch((e) => e);
    expect(err?.status).toBe(429);

    const after = await db
      .select()
      .from(contactMessages)
      .where(eq(contactMessages.subject, `${marker} blocked`));
    expect(after.length).toBe(before.length);
    expect(after.length).toBe(0);
  }, 60000);

  it("04-§9/08-§4/NTF-01: valid submit stores row + enqueues notification", async () => {
    const marker = `Hello ${uid()}`;
    const notifyEmail = `inbox-${uid()}@example.org`;
    await setSetting(db, "contact.notify_email", notifyEmail, { updatedBy: null });
    const rawIp = `192.0.2.44-${uid()}`;

    const res = await submitContact({
      name: "Grace Member",
      email: "grace@example.com",
      subject: marker,
      message: "Please tell me about service times.",
      ip: rawIp,
    });
    expect(res.spam).toBe(false);
    expect(res.notified).toBe(true);
    expect(res.id).not.toBeNull();

    // Row stored with status new + salted ip_hash (never the raw IP).
    const [row] = await db
      .select()
      .from(contactMessages)
      .where(eq(contactMessages.id, res.id!));
    expect(row.status).toBe("new");
    expect(row.ip_hash).not.toBeNull();
    expect(row.ip_hash).not.toContain("192.0.2");
    expect(row.ip_hash).toMatch(/^[a-f0-9]{64}$/);

    // Notification enqueued to the configured recipient in the same outbox (NTF-01).
    const queued = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.type, "contact_notification"),
          eq(notifications.recipient, notifyEmail),
        ),
      );
    expect(queued.some((n) => (n.payload as { contactMessageId?: string })?.contactMessageId === res.id)).toBe(true);

    // Inbox queries + status transitions (08-§4).
    const inbox = await listContactMessages({ status: "new" });
    expect(inbox.some((m) => m.id === res.id)).toBe(true);
    const read = await setContactStatus(res.id!, "read", admin);
    expect(read.status).toBe("read");

    // Admin soft-delete keeps the row but hides it from the inbox (08-§4).
    await deleteContactMessage(res.id!, admin);
    const [deleted] = await db
      .select()
      .from(contactMessages)
      .where(eq(contactMessages.id, res.id!));
    expect(deleted.deleted_at).not.toBeNull();
    const inboxAfter = await listContactMessages({});
    expect(inboxAfter.some((m) => m.id === res.id)).toBe(false);
  }, 60000);
});
