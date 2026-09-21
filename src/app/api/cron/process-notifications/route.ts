import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { env } from "@/lib/env";
import { processNotificationQueue } from "@/jobs/notifications-worker";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env().CRON_SECRET}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sent = await processNotificationQueue(db);
  return NextResponse.json({ sent });
}
