import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/modules/auth/auth.service";

// better-auth only enqueues the email when the address exists; we always
// return the same generic body so the endpoint cannot be used to probe
// accounts (AUTH-05/SEC-09).
export async function POST(req: Request) {
  const { email } = await req.json();
  try {
    await requestPasswordReset(String(email ?? ""));
  } catch {
    // swallow — generic outcome either way
  }
  return NextResponse.json({ status: "sent" });
}
