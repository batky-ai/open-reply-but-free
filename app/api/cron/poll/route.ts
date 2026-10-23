import { NextRequest, NextResponse, after } from "next/server";
import { defaultPollDeps, runPollTick } from "@/lib/ops/cron-poll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The drain budget is 240s; the rest is headroom for the sweep and close().
// 300s is also the most Vercel Hobby allows.
export const maxDuration = 300;

/**
 * Replaces the always-on worker. Call it every 5 minutes: from cron-job.org on
 * Vercel Hobby (whose own crons run once a day), or from vercel.json on Pro.
 *
 * It answers straight away and runs the tick after the response, because
 * cron-job.org drops a request after 30 seconds and a tick can take minutes.
 * Results land in Activity and the function log, not in this response.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  after(async () => {
    const result = await runPollTick(await defaultPollDeps());
    if (result.errors?.length) console.error("[cron/poll]", result.errors.join("; "));
    console.log("[cron/poll]", JSON.stringify({ skipped: result.skipped, drained: result.drained, remaining: result.remaining }));
  });
  return NextResponse.json({ success: true, data: { started: true } });
}
