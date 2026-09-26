import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import {
  CONTACT_STATUSES,
  listContactMessages,
  submitContact,
} from "@/modules/content/contact.service";
import { CONTACT_HONEYPOT_FIELD } from "@/components/content/contact-form";
import { RateLimitError } from "@/lib/ratelimit";

// PRD 08 §4 contact inbox (guarded GET) + PRD 04 §9 public submission (open POST).
// The inbox is visible to admin/super_admin only — content_manager holds no
// contact_messages.* keys, so the read gate below excludes them.

// Admin inbox list. `?status=new|read|archived` filters; response includes
// `unread` (count of status=new) for the sidebar badge.
export async function GET(req: Request) {
  const { permissions } = await getCurrentSession();
  try {
    requirePermission(permissions, "contact_messages.read");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status")?.trim() || "";
  const status = statusParam
    ? CONTACT_STATUSES.find((s) => s === statusParam)
    : undefined;
  if (statusParam && !status) {
    return NextResponse.json(
      { error: "status must be one of new, read, archived" },
      { status: 400 },
    );
  }
  const [rows, unreadRows] = await Promise.all([
    listContactMessages(status ? { status } : undefined),
    status === "new" ? [] : listContactMessages({ status: "new" }),
  ]);
  const unread = status === "new" ? rows.length : unreadRows.length;
  return NextResponse.json({ rows, total: rows.length, unread });
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || null;
}

// PUBLIC: accepts JSON {name,email,phone?,subject,message,[honeypot]} and
// delegates to ContactService.submitContact. Honeypot spam gets a fake
// success (same shape, nothing stored); rate-limited callers get 429;
// validation failures get 400.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  try {
    const result = await submitContact({
      name: body.name as string,
      email: body.email as string,
      phone: (body.phone as string | undefined) ?? undefined,
      subject: body.subject as string,
      message: body.message as string,
      honeypot: (body[CONTACT_HONEYPOT_FIELD] as string | undefined) ?? null,
      ip: clientIp(req),
    });
    // Spam renders the same success UI (fake success — nothing stored).
    void result.spam;
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Check the highlighted fields and try again." }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Could not send message";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
