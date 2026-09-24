import { NextResponse } from "next/server";
import { and, desc, ilike, isNull, eq, or, sql } from "drizzle-orm";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { media } from "@/db/schema";
import { createMediaRecord } from "@/modules/media/media.service";
import { saveUpload, buildStorageKey } from "@/modules/media/storage";
import { mimeToKind, validateUpload } from "@/modules/media/validation";

function forbidden(err: unknown) {
  if ((err as { status?: number }).status === 403) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

// MED-01: central library query — kind filter, name search, pagination.
export async function GET(req: Request) {
  const { permissions } = await getCurrentSession();
  try {
    requirePermission(permissions, "media.read");
  } catch (err) {
    return forbidden(err) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind")?.trim() || "";
  const q = url.searchParams.get("q")?.trim() || "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("per_page") ?? 24) || 24));

  const filters = [isNull(media.deleted_at)];
  if (kind) filters.push(eq(media.kind, kind as "image"));
  if (q) filters.push(or(ilike(media.title, `%${q}%`), ilike(media.original_filename, `%${q}%`))!);

  const where = and(...filters);
  const [countRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(media)
    .where(where);
  const rows = await db
    .select()
    .from(media)
    .where(where)
    .orderBy(desc(media.created_at))
    .limit(perPage)
    .offset((page - 1) * perPage);

  return NextResponse.json({ rows, total: countRow?.c ?? 0, page, perPage });
}

// MED-02/03/04: multipart file upload OR JSON external-video creation.
// Thin route: validates server-side via the service, then delegates.
export async function POST(req: Request) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "media.create");
  } catch (err) {
    return forbidden(err) ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await req.json()) as {
        source?: string;
        externalUrl?: string;
        title?: string;
        altText?: string;
      };
      if (body.source !== "external_url" || !body.externalUrl) {
        return NextResponse.json({ error: "JSON uploads require source=external_url and externalUrl (CMS-11)" }, { status: 400 });
      }
      const row = await createMediaRecord({
        kind: "external_video",
        source: "external_url",
        externalUrl: body.externalUrl,
        title: body.title ?? null,
        altText: body.altText ?? null,
        uploadedBy: user.id,
      });
      return NextResponse.json({ row }, { status: 201 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    const title = typeof form.get("title") === "string" ? (form.get("title") as string) : null;
    const altText = typeof form.get("altText") === "string" ? (form.get("altText") as string) : null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const filename = file.name || "upload";

    const check = validateUpload({
      filename,
      mimeType: file.type,
      sizeBytes: file.size,
      bytes,
    });
    if (!check.ok) {
      return NextResponse.json({ error: check.error, code: check.code }, { status: 400 });
    }
    const storageKey = buildStorageKey(filename);
    const saved = await saveUpload({ bytes, filename, storageKey });
    const row = await createMediaRecord({
      kind: mimeToKind(check.mimeType),
      source: "uploaded",
      title: title || filename,
      altText,
      originalFilename: filename,
      mimeType: check.mimeType,
      sizeBytes: file.size,
      storageKey: saved.storageKey,
      uploadedBy: user.id,
      bytes,
    });
    return NextResponse.json({ row }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 });
  }
}
