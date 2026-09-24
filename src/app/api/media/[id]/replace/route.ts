import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { replaceFile } from "@/modules/media/media.service";

// MED-04: replace the file behind a media row (same ID, references keep working).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { user, permissions } = await getCurrentSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    requirePermission(permissions, "media.update");
  } catch (err) {
    if ((err as { status?: number }).status === 403) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  try {
    const row = await replaceFile(id, {
      filename: file.name || "upload",
      mimeType: file.type,
      sizeBytes: file.size,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    return NextResponse.json({ row });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Replace failed";
    const status = /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
