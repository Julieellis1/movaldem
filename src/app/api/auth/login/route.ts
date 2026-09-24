import { NextResponse } from "next/server";
import { loginMember } from "@/modules/auth/auth.service";
import { RateLimitError } from "@/lib/ratelimit";

// Thin route: suspension check, last-login stamp and generic error (SEC-06)
// stay server-owned instead of hitting better-auth's sign-in from the client.
export async function POST(req: Request) {
  const json = await req.json();
  try {
    const { user, session, setCookieHeaders } = await loginMember(json, {
      ip: req.headers.get("x-forwarded-for"),
      headers: req.headers,
    });
    const res = NextResponse.json({ user, session });
    setCookieHeaders?.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") res.headers.append("set-cookie", value);
    });
    return res;
  } catch (err) {
    // A rate-limited sign-in must answer 429 with the same generic message,
    // never be masked into a 401 that implies the account exists (SEC-06).
    const status = err instanceof RateLimitError ? err.status : 401;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid email or password" },
      { status },
    );
  }
}
