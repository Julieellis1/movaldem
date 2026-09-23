import { NextResponse } from "next/server";
import { registerMember } from "@/modules/auth/auth.service";

// Thin route: keeps consent, phone validation and audit in one server-owned
// place rather than calling better-auth's /sign-up/email from the client
// (ARC-02/04). It just forwards the parsed body and the request headers so
// better-auth can set the session cookie.
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  if (!json || typeof json !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
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
}
