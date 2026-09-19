import { describe, expect, it } from "vitest";
import { assertExpectedProfile, ConnectSetupError } from "@/lib/composio/connect";

const profile = { username: "creator", user_id: "1784" };

describe("assertExpectedProfile", () => {
  it("accepts the pinned account", () => {
    expect(() => assertExpectedProfile(profile, { username: "creator", userId: "1784" })).not.toThrow();
  });
  it.each([
    [{ username: "a.bbe", userId: "1784" }],
    [{ username: "creator", userId: "9999" }],
  ])("rejects a different account: %j", (expected) => {
    expect(() => assertExpectedProfile(profile, expected)).toThrow("not the expected Instagram account");
  });
  it("refuses to run without both pins", () => {
    expect(() => assertExpectedProfile(profile, { username: "creator" })).toThrow(ConnectSetupError);
    expect(() => assertExpectedProfile(profile, {})).toThrow(/EXPECTED_IG_USERNAME/);
  });
});
