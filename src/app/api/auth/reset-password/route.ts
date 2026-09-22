import { NextResponse } from "next/server";
import { resetPassword } from "@/modules/auth/auth.service";

export async function POST(req: Request) {
  const { token, newPassword } = await req.json();
  try {
    await resetPassword({ token: String(token ?? ""), newPassword: String(newPassword ?? "") });
    return NextResponse.json({ status: "ok" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid or expired link" },
      { status: 400 },
    );
  }
}
