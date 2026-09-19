import { NextRequest, NextResponse } from "next/server";
import { defaultPollDeps, runPollTick } from "@/lib/ops/cron-poll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The drain budget is 240s; the rest is headroom for the sweep and close().
export const maxDuration = 300;

/** Replaces the always-on worker on Vercel. Scheduled every 5 minutes in vercel.json. */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  const result = await runPollTick(await defaultPollDeps());
  if (result.errors?.length) console.error("[cron/poll]", result.errors.join("; "));
  return NextResponse.json({ success: true, data: result });
}
