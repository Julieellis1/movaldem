import { NextResponse } from "next/server";
import { auth } from "@/modules/auth/auth.config";

// Server-owned sign-out (mirrors /api/auth/login): the browser-facing
// better-auth /sign-out endpoint behind [...all] is subject to origin checks
// against APP_URL, so logout silently fails whenever APP_URL doesn't match
// the deployment URL and the session survives refresh. Calling
// auth.api.signOut server-side has no origin dependency, and the
// cookie-clearing headers are forwarded explicitly. This static route wins
// over the [...all] catch-all for this exact path.
export async function POST(req: Request) {
  try {
    const res = await auth.api.signOut({ headers: req.headers, returnHeaders: true });
    const out = NextResponse.json({ success: true });
    res.headers?.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") out.headers.append("set-cookie", value);
    });
    return out;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sign-out failed" },
      { status: 400 },
    );
  }
}
