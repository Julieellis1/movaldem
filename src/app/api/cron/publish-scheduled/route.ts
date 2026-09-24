import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { runPublishScheduler } from "@/jobs/publish-scheduler";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${env().CRON_SECRET}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await runPublishScheduler(new Date());
  return NextResponse.json(result);
}
