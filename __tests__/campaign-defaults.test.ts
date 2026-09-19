import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ context: vi.fn(), account: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentWorkspaceId: vi.fn() }));
vi.mock("@/lib/workspace-access", () => ({ getCurrentWorkspaceContext: m.context, canManageWorkspace: (role: string) => role === "OWNER" || role === "ADMIN" }));
vi.mock("@/lib/db/client", () => ({ prisma: { workspace: { findUnique: async () => ({ id: "w" }) }, instagramAccount: { findFirst: m.account }, automation: { create: m.create } } }));
import { POST } from "@/app/api/automations/route";
beforeEach(() => { vi.resetAllMocks(); m.context.mockResolvedValue({ workspaceId: "w", role: "OWNER" }); m.account.mockResolvedValue({ id: "ig" }); m.create.mockImplementation(async ({data}) => data); });
function request(extra = {}) { return new NextRequest("https://replies.example/api/automations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Book", postId: "post", keywords: ["BOOK"], dmMessage: "Here is the link.", trackedDestinationUrl: "https://example.com/go/book", ...extra }) }); }
it("saves paused by default and preserves tracked short links", async () => { const r = await POST(request()); expect(r.status).toBe(201); const {data} = await r.json(); expect(data.isActive).toBe(false); expect(data.dmTriggerEnabled).toBe(false); expect(data.publicReplyEnabled).toBe(false); expect(data.trackedLinks.create[0].destinationUrl).toBe("https://example.com/go/book"); });
it("allows explicit activation", async () => { const r = await POST(request({isActive:true})); expect((await r.json()).data.isActive).toBe(true); });
it("requires a connected account", async () => { m.account.mockResolvedValue(null); expect((await POST(request())).status).toBe(400); expect(m.create).not.toHaveBeenCalled(); });
it("rejects unauthenticated creation", async () => { m.context.mockResolvedValue(null); expect((await POST(request())).status).toBe(401); expect(m.create).not.toHaveBeenCalled(); });
