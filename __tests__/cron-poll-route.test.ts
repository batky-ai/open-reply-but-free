import { afterEach, describe, expect, it, vi } from "vitest";

const run = vi.hoisted(() => vi.fn(async () => ({ skipped: false, drained: true, remaining: 0, errors: [] })));
const scheduled = vi.hoisted(() => [] as Array<() => Promise<void>>);
vi.mock("@/lib/ops/cron-poll", () => ({ runPollTick: run, defaultPollDeps: vi.fn(async () => ({})) }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<void>) => { scheduled.push(task); },
}));
import { NextRequest } from "next/server";
import { GET } from "@/app/api/cron/poll/route";

const req = (auth?: string) => new NextRequest("https://replies.example/api/cron/poll", auth ? { headers: { authorization: auth } } : {});

afterEach(() => { vi.unstubAllEnvs(); run.mockClear(); scheduled.length = 0; });

describe("GET /api/cron/poll", () => {
  it("rejects a missing or wrong bearer", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-value");
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(scheduled).toHaveLength(0);
  });

  it("fails closed when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    expect((await GET(req("Bearer undefined"))).status).toBe(401);
    expect((await GET(req("Bearer "))).status).toBe(401);
    expect(scheduled).toHaveLength(0);
  });

  it("answers before the tick runs, then runs one tick", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-value");
    const res = await GET(req("Bearer cron-secret-value"));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ started: true });
    expect(run).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    await scheduled[0]();
    expect(run).toHaveBeenCalledOnce();
  });
});
