/**
 * One worker tick inside a Vercel function.
 *
 * Upstream OpenReply needs an always-on worker process (worker/dm-worker.ts).
 * On Vercel there is none, so a 5 minute cron does the same work and exits:
 * sweep comments, then run a BullMQ worker until the ready queue is empty or
 * the time budget is spent. Delayed jobs (backoff, rate-limit requeue) are left
 * in Redis and picked up by a later tick. Duplicate-send protection does not
 * depend on this loop: the Composio transport's durable receipt does that.
 */
import { randomUUID } from "node:crypto";
import os from "node:os";

const LOCK_KEY = "lock:cron:poll";
const LOCK_TTL_SECONDS = 290;

export interface PollDeps {
  redis: {
    set(key: string, value: string, ex: "EX", ttl: number, nx: "NX"): Promise<string | null>;
    get(key: string): Promise<string | null>;
    del(key: string): Promise<number>;
  };
  heartbeat(): Promise<void>;
  attachNextReels(): Promise<unknown>;
  reconcile(): Promise<void>;
  pendingJobs(): Promise<number>;
  startWorker(): { close(): Promise<void> };
  sleep(ms: number): Promise<void>;
  now(): number;
}

export interface PollResult {
  skipped: boolean;
  drained?: boolean;
  remaining?: number;
  errors?: string[];
}

const message = (error: unknown) => (error instanceof Error ? error.message : "Unknown error");

export async function runPollTick(deps: PollDeps, budgetMs = 240_000, settleMs = 2_000): Promise<PollResult> {
  const token = randomUUID();
  if ((await deps.redis.set(LOCK_KEY, token, "EX", LOCK_TTL_SECONDS, "NX")) !== "OK") return { skipped: true };
  const errors: string[] = [];
  const deadline = deps.now() + budgetMs;
  let remaining = 0;
  let drained = false;
  try {
    await deps.heartbeat().catch((e) => { errors.push(`heartbeat: ${message(e)}`); });
    await deps.attachNextReels().catch((e) => { errors.push(`attach-next-reel: ${message(e)}`); });
    await deps.reconcile().catch((e) => { errors.push(`reconcile: ${message(e)}`); });

    const worker = deps.startWorker();
    try {
      // Empty on two consecutive checks, so a job enqueued by a job that just
      // finished (e.g. a follow-up) is not mistaken for an idle queue.
      let emptyChecks = 0;
      while (deps.now() < deadline) {
        remaining = await deps.pendingJobs();
        emptyChecks = remaining === 0 ? emptyChecks + 1 : 0;
        if (emptyChecks >= 2) { drained = true; break; }
        await deps.sleep(settleMs);
      }
    } finally {
      // close() waits for in-flight jobs, so no send is cut off mid-request.
      await worker.close();
    }
    await deps.heartbeat().catch(() => {});
  } finally {
    if ((await deps.redis.get(LOCK_KEY)) === token) await deps.redis.del(LOCK_KEY);
  }
  return { skipped: false, drained, remaining, errors };
}

export async function defaultPollDeps(): Promise<PollDeps> {
  const [{ getRedisConnection, getDMQueue }, { createDMWorker }, { recordWorkerHeartbeat }, { reconcileComments }, { attachPendingNextReels }] =
    await Promise.all([
      import("@/lib/queue/client"),
      import("@/lib/queue/dm-worker"),
      import("@/lib/ops/worker-health"),
      import("@/lib/polling/comment-reconciler"),
      import("@/lib/automation/attach-next-reel"),
    ]);
  const startedAt = new Date().toISOString();
  return {
    redis: getRedisConnection(),
    heartbeat: () => recordWorkerHeartbeat({ pid: process.pid, hostname: os.hostname(), startedAt }),
    attachNextReels: attachPendingNextReels,
    reconcile: reconcileComments,
    pendingJobs: async () => {
      const counts = await getDMQueue().getJobCounts("waiting", "active", "prioritized");
      return (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.prioritized ?? 0);
    },
    startWorker: createDMWorker,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: Date.now,
  };
}
