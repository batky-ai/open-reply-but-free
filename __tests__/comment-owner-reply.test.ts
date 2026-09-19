import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  automations: vi.fn(), handled: vi.fn(), event: vi.fn(), add: vi.fn(),
  comments: vi.fn(), author: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ prisma: {
  automation: { findMany: mocks.automations }, dmLog: { findMany: mocks.handled },
  operationalEvent: { create: mocks.event }, $queryRaw: vi.fn().mockResolvedValue([]),
} }));
vi.mock("@/lib/queue/client", () => ({ getDMQueue: () => ({ add: mocks.add }) }));
vi.mock("@/lib/instagram/provider", () => ({
  createInstagramContext: vi.fn().mockResolvedValue({ provider: "COMPOSIO", accessToken: {} }),
  getRecentMediaComments: mocks.comments, getCommentAuthor: mocks.author,
  getUserMedia: vi.fn(), MetaApiError: class extends Error {},
}));
import { reconcileComments } from "@/lib/polling/comment-reconciler";

const comment = { id: "comment", text: "Flow", timestamp: new Date().toISOString(), from: { id: "reader" }, replies: { data: [{ id: "reply" }] } };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.automations.mockResolvedValue([{
    id: "campaign", name: "Flow", workspaceId: "workspace", keywords: ["flow"],
    postId: "post", matchAnyPost: false, matchAnyWord: false, wholeWordMatch: true,
    createdAt: new Date(0), activatedAt: new Date(0), publicReplyEnabled: true,
    instagramAccount: { id: "connection", instagramId: "owner", username: "a.bbe", provider: "COMPOSIO", workspaceId: "workspace" },
  }]);
  mocks.handled.mockResolvedValue([]); mocks.event.mockResolvedValue({}); mocks.add.mockResolvedValue({});
  mocks.comments.mockResolvedValue([comment]); mocks.author.mockResolvedValue({ id: "owner", username: "a.bbe" });
});

describe("polling owner-reply guard", () => {
  it("resolves ID-only nested replies and skips a comment already answered by the owner", async () => {
    await reconcileComments();
    expect(mocks.author).toHaveBeenCalledWith(expect.objectContaining({ commentId: "reply" }));
    expect(mocks.add).not.toHaveBeenCalled();
  });
  it("keeps a comment eligible when its reply belongs to another person", async () => {
    mocks.author.mockResolvedValue({ id: "someone-else" });
    await reconcileComments(); expect(mocks.add).toHaveBeenCalledTimes(1);
  });
  it("does not look up authors when the owner is already identified", async () => {
    mocks.comments.mockResolvedValue([{ ...comment, replies: { data: [{ id: "reply", from: { id: "owner" } }] } }]);
    await reconcileComments(); expect(mocks.author).not.toHaveBeenCalled(); expect(mocks.add).not.toHaveBeenCalled();
  });
  it("defers unresolved authors and retries the read on the next sweep without sending", async () => {
    mocks.author.mockRejectedValueOnce(new Error("Instagram temporarily unavailable"));
    await reconcileComments(); expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.event).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ level: "WARNING" }) }));
    mocks.author.mockResolvedValue({ id: "someone-else" });
    await reconcileComments(); expect(mocks.add).toHaveBeenCalledTimes(1);
  });
  it("does not treat a missing author after lookup as permission to send", async () => {
    mocks.author.mockResolvedValue({});
    await reconcileComments(); expect(mocks.add).not.toHaveBeenCalled();
  });
  it("leaves matching comments without replies eligible", async () => {
    mocks.comments.mockResolvedValue([{ ...comment, replies: undefined }]);
    await reconcileComments(); expect(mocks.add).toHaveBeenCalledTimes(1); expect(mocks.author).not.toHaveBeenCalled();
  });
  it("avoids author lookups for unrelated comments", async () => {
    mocks.comments.mockResolvedValue([{ ...comment, text: "Nice van" }]);
    await reconcileComments(); expect(mocks.add).not.toHaveBeenCalled(); expect(mocks.author).not.toHaveBeenCalled();
  });
});
