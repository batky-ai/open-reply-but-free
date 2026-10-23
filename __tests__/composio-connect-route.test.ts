import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ context: vi.fn(), profile: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/workspace-access", () => ({
  getCurrentWorkspaceContext: mocks.context,
  canManageWorkspace: (role: string) => role === "OWNER" || role === "ADMIN",
}));
vi.mock("@/lib/composio/link-account", () => ({ fetchComposioProfile: mocks.profile, saveComposioAccount: mocks.save }));
import { POST } from "@/app/api/composio/connect/route";
import { ConnectSetupError } from "@/lib/composio/connect";

const body = { apiKey: "test-project-api-key", connectedAccountId: "ca_test" };
const req = (extra = {}) => new NextRequest("https://replies.example/api/composio/connect", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, ...extra }),
});
const profile = { userId: "1784", username: "creator", name: null };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({ workspaceId: "workspace", role: "OWNER" });
  mocks.profile.mockResolvedValue(profile);
  mocks.save.mockResolvedValue({ username: "creator" });
});

describe("POST /api/composio/connect", () => {
  it("needs a signed-in owner or admin", async () => {
    mocks.context.mockResolvedValueOnce(null);
    expect((await POST(req())).status).toBe(401);
    mocks.context.mockResolvedValueOnce({ workspaceId: "workspace", role: "MEMBER" });
    expect((await POST(req())).status).toBe(403);
    expect(mocks.profile).not.toHaveBeenCalled();
  });

  it("rejects a malformed connected account id", async () => {
    const res = await POST(req({ connectedAccountId: "not-an-id" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/ca_/);
  });

  it("checks first and saves nothing", async () => {
    const res = await POST(req());
    expect(await res.json()).toEqual({ success: true, data: { username: "creator", userId: "1784" } });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("saves only the account the owner confirmed", async () => {
    expect((await POST(req({ confirmUserId: "9999" }))).status).toBe(409);
    expect(mocks.save).not.toHaveBeenCalled();
    const res = await POST(req({ confirmUserId: "1784" }));
    expect(await res.json()).toEqual({ success: true, data: { connected: "creator" } });
    expect(mocks.save).toHaveBeenCalledWith(body, profile, "workspace");
  });

  it("shows setup errors and hides anything else", async () => {
    mocks.profile.mockRejectedValueOnce(new ConnectSetupError("Composio rejected the API key."));
    expect((await (await POST(req())).json()).error).toBe("Composio rejected the API key.");
    mocks.profile.mockRejectedValueOnce(new Error("secret detail"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret detail");
  });
});
