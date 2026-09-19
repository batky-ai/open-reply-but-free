import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { composioDelivery: db } }));
import { graphFetch, ComposioDeliveryUnconfirmedError } from "@/lib/composio/transport";
import { commentAfterActivation, unsupportedComposioFeatures } from "@/lib/composio/campaigns";
const credentials = { apiKey: "private-test-credential", connectedAccountId: "ca_test", orgId: "org", projectId: "project" };
const endpoint = "https://graph.instagram.com/v25.0/ig/messages";
const send = (text = "hello") => graphFetch(credentials, endpoint, { method: "POST", body: JSON.stringify({ recipient: { comment_id: "comment" }, message: { text } }) });
const fetchMock = vi.fn();
const respond = (data: unknown, status = 200, outer = 200) => fetchMock.mockResolvedValueOnce(Response.json({ data, status }, { status: outer }));
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal("fetch", fetchMock); db.create.mockResolvedValue({}); db.update.mockResolvedValue({}); });
describe("Composio Instagram transport", () => {
  it("leaves direct Meta fetch unchanged", async () => {
    fetchMock.mockResolvedValue(Response.json({ id: "direct" }));
    await graphFetch("meta-token", endpoint, { method: "GET" });
    expect(fetchMock).toHaveBeenCalledWith(endpoint, { method: "GET" });
  });
  it("pins account and host, strips tokens, and unwraps Graph data", async () => {
    respond({ username: "a.bbe" });
    const result = await graphFetch(credentials, endpoint + "?access_token=leak");
    expect(await result.json()).toEqual({ username: "a.bbe" });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://backend.composio.dev/api/v3.1/tools/execute/proxy");
    expect(JSON.parse(options.body)).toEqual({ endpoint, method: "GET", connected_account_id: "ca_test" });
    expect(options.headers["x-user-api-key"]).toBe(credentials.apiKey);
    expect(options.redirect).toBe("error");
    expect(db.create).not.toHaveBeenCalled();
    await expect(graphFetch(credentials, "https://attacker.test")).rejects.toThrow("graph.instagram.com");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("persists success and replays the receipt without a second send", async () => {
    respond({ message_id: "mid" });
    await send();
    const firstId = db.create.mock.calls[0][0].data.id;
    db.create.mockRejectedValue({ code: "P2002" });
    db.findUnique.mockResolvedValue({ response: { message_id: "mid" } });
    expect(await (await send("changed text")).json()).toEqual({ message_id: "mid" });
    expect(db.create.mock.calls[1][0].data.id).toBe(firstId);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(["network", "proxy500", "graph500", "noId", "receiptWrite"])("keeps an uncertain %s send blocked", async (failure) => {
    if (failure === "network") fetchMock.mockRejectedValueOnce(new Error("timeout"));
    else if (failure === "proxy500") respond({}, 200, 500);
    else if (failure === "graph500") respond({}, 500);
    else if (failure === "noId") respond({});
    else { respond({ message_id: "mid" }); db.update.mockRejectedValueOnce(new Error("db unavailable")); }
    await expect(send()).rejects.toBeInstanceOf(ComposioDeliveryUnconfirmedError);
    expect(db.delete).not.toHaveBeenCalled();
    db.create.mockRejectedValueOnce({ code: "P2002" }); db.findUnique.mockResolvedValueOnce({ response: null });
    await expect(send()).rejects.toBeInstanceOf(ComposioDeliveryUnconfirmedError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("releases a known rejected claim so a valid fallback can send", async () => {
    respond({ error: { code: 100 } }, 400);
    expect((await send()).status).toBe(400);
    expect(db.delete).toHaveBeenCalledTimes(1);
  });
  it("deduplicates public replies across polling jobs", async () => {
    respond({ id: "public" }); respond({ id: "public" });
    for (const operationId of ["job1", "job2"]) await graphFetch({ ...credentials, operationId }, "https://graph.instagram.com/v25.0/comment/replies", { method: "POST", body: JSON.stringify({ message: operationId }) });
    expect(db.create.mock.calls[0][0].data.id).toBe(db.create.mock.calls[1][0].data.id);
  });
  it("rejects features requiring missing webhooks", () => {
    for (const feature of ["dmTriggerEnabled", "openingDmEnabled", "requireFollow", "followUpEnabled"]) expect(unsupportedComposioFeatures("COMPOSIO", { [feature]: true })).toBe(true);
    expect(unsupportedComposioFeatures("COMPOSIO", {})).toBe(false);
    expect(unsupportedComposioFeatures("META", { requireFollow: true })).toBe(false);
  });
  it("does not send comments from before activation or without timestamps", () => {
    const created = new Date("2026-09-01"), active = new Date("2026-09-16");
    expect(commentAfterActivation("2026-09-15", active, created)).toBe(false);
    expect(commentAfterActivation("2026-09-17", active, created)).toBe(true);
    expect(commentAfterActivation(undefined, active, created)).toBe(false);
    expect(commentAfterActivation("invalid", active, created)).toBe(false);
  });
});
