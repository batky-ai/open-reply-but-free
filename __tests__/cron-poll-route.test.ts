import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const run = vi.hoisted(() => vi.fn(async () => ({ skipped: false, drained: true, remaining: 0, errors: [] })));
vi.mock("@/lib/ops/cron-poll", () => ({ runPollTick: run, defaultPollDeps: vi.fn(async () => ({})) }));
import { GET } from "@/app/api/cron/poll/route";

const req = (auth?: string) => new NextRequest("https://ig.example/api/cron/poll", auth ? { headers: { authorization: auth } } : {});

afterEach(() => { vi.unstubAllEnvs(); run.mockClear(); });

describe("GET /api/cron/poll", () => {
  it("rejects a missing or wrong bearer", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-value");
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("fails closed when no secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    vi.stubEnv("NEXTAUTH_SECRET", "");
    expect((await GET(req("Bearer undefined"))).status).toBe(401);
    expect((await GET(req("Bearer "))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("runs one tick with the right bearer", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret-value");
    const res = await GET(req("Bearer cron-secret-value"));
    expect(res.status).toBe(200);
    expect(run).toHaveBeenCalledOnce();
    expect((await res.json()).data).toMatchObject({ drained: true });
  });
});
