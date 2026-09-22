import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/modules/auth/auth.config";

const ADMIN_PERMISSIONS: Record<string, string> = {
  "/admin/users": "members.read",
  "/admin/users/staff": "staff.read",
  "/admin/users/roles": "roles.read",
  "/admin/settings": "settings.read",
  "/admin/audit-logs": "audit_logs.read",
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/admin")) return NextResponse.next();

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }
  // Per-route permission check is also enforced server-side in each page (PERM-01).
  const required = Object.entries(ADMIN_PERMISSIONS).find(([p]) => pathname.startsWith(p))?.[1];
  if (required) {
    const { loadPermissions, can } = await import("@/modules/auth/rbac.service");
    const perms = await loadPermissions(session.user.id);
    if (!can(perms, required)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.next();
}

// Node.js runtime (not edge): auth.config pulls in @node-rs/argon2 (native)
// and node:crypto, which the edge runtime cannot load.
export const config = {
  runtime: "nodejs",
  matcher: ["/admin/:path*"],
};
