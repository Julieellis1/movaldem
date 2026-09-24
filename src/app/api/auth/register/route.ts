import { NextResponse } from "next/server";
import { registerMember } from "@/modules/auth/auth.service";
import { RateLimitError } from "@/lib/ratelimit";

// Thin route: keeps consent, phone validation and audit in one server-owned
// place rather than calling better-auth's /sign-up/email from the client
// (ARC-02/04). It just forwards the parsed body and the request headers so
// better-auth can set the session cookie.
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  if (!json || typeof json !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  try {
    const { user, session, setCookieHeaders } = await registerMember(json, {
      ip: req.headers.get("x-forwarded-for"),
      userAgent: req.headers.get("user-agent"),
      headers: req.headers,
    });
    const res = NextResponse.json({ user, session });
    setCookieHeaders?.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") res.headers.append("set-cookie", value);
    });
    return res;
  } catch (err) {
    // Surface the rate limit as a 429 with its generic message; every other
    // failure keeps the previous behaviour (validation errors bubble to Next).
    if (err instanceof RateLimitError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
