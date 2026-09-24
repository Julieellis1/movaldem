import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { getUsage } from "@/modules/media/media.service";

// MED-04: where a media item is used (shown before delete / replace).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { permissions } = await getCurrentSession();
  try {
    requirePermission(permissions, "media.read");
  } catch (err) {
    if ((err as { status?: number }).status === 403) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const usage = await getUsage(id);
  return NextResponse.json({ usage });
}
