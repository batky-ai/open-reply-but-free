import { describe, expect, it, vi } from "vitest";
import { runPollTick, type PollDeps } from "@/lib/ops/cron-poll";

function deps(overrides: Partial<PollDeps> = {}, pending: number[] = [0, 0]) {
  const store = new Map<string, string>();
  const order: string[] = [];
  const close = vi.fn(async () => { order.push("close"); });
  let t = 0;
  const d: PollDeps = {
    redis: {
      set: vi.fn(async (k: string, v: string) => (store.has(k) ? null : (store.set(k, v), "OK"))),
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      del: vi.fn(async (k: string) => Number(store.delete(k))),
    },
    heartbeat: vi.fn(async () => { order.push("heartbeat"); }),
    attachNextReels: vi.fn(async () => { order.push("attach"); }),
    reconcile: vi.fn(async () => { order.push("reconcile"); }),
    pendingJobs: vi.fn(async () => pending.shift() ?? 0),
    startWorker: vi.fn(() => { order.push("start"); return { close }; }),
    sleep: vi.fn(async (ms: number) => { t += ms; }),
    now: () => t,
    ...overrides,
  };
  return { d, store, order, close };
}

describe("runPollTick", () => {
  it("sweeps before starting the worker, drains, closes, and releases the lock", async () => {
    const { d, store, order, close } = deps({}, [3, 1, 0, 0]);
    const result = await runPollTick(d);
    expect(result).toMatchObject({ skipped: false, drained: true, remaining: 0, errors: [] });
    expect(order.slice(0, 5)).toEqual(["heartbeat", "attach", "reconcile", "start", "close"]);
    expect(close).toHaveBeenCalledOnce();
    expect(store.size).toBe(0);
  });

  it("does not treat a single empty check as drained", async () => {
    const { d } = deps({}, [0, 2, 0, 0]);
    await runPollTick(d);
    expect(d.pendingJobs).toHaveBeenCalledTimes(4);
  });

  it("skips entirely when another tick holds the lock", async () => {
    const { d, store } = deps();
    store.set("lock:cron:poll", "other-tick");
    expect(await runPollTick(d)).toEqual({ skipped: true });
    expect(d.reconcile).not.toHaveBeenCalled();
    expect(d.startWorker).not.toHaveBeenCalled();
    expect(store.get("lock:cron:poll")).toBe("other-tick");
  });

  it("stops at the budget and still closes the worker", async () => {
    const { d, close } = deps({ pendingJobs: vi.fn(async () => 5) });
    const result = await runPollTick(d, 10_000, 2_000);
    expect(result).toMatchObject({ drained: false, remaining: 5 });
    expect(close).toHaveBeenCalledOnce();
  });

  it("still drains queued jobs when the sweep fails, and reports the error", async () => {
    const { d } = deps({ reconcile: vi.fn(async () => { throw new Error("Composio 500"); }) });
    const result = await runPollTick(d);
    expect(d.startWorker).toHaveBeenCalledOnce();
    expect(result.errors).toEqual(["reconcile: Composio 500"]);
  });

  it("releases the lock even if the worker close throws", async () => {
    const { d, store } = deps({ startWorker: vi.fn(() => ({ close: async () => { throw new Error("boom"); } })) });
    await expect(runPollTick(d)).rejects.toThrow("boom");
    expect(store.size).toBe(0);
  });
});
