import { NextResponse } from "next/server";
import { loginMember } from "@/modules/auth/auth.service";

// Thin route: suspension check, last-login stamp and generic error (SEC-06)
// stay server-owned instead of hitting better-auth's sign-in from the client.
export async function POST(req: Request) {
  const json = await req.json();
  try {
    const { user, session } = await loginMember(json, {
      ip: req.headers.get("x-forwarded-for"),
      headers: req.headers,
    });
    return NextResponse.json({ user, session });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid email or password" },
      { status: 401 },
    );
  }
}
