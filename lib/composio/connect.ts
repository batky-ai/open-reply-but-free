export interface ComposioProfile { id?: string; user_id?: string; username?: string; name?: string }

/** A setup failure whose message carries no credential data and is safe to print. */
export class ConnectSetupError extends Error {}

/** The profile Composio returned must be exactly the account the operator pinned. */
export function assertExpectedProfile(profile: ComposioProfile, expected: { username?: string; userId?: string }) {
  if (!expected.username || !expected.userId)
    throw new ConnectSetupError("Set EXPECTED_IG_USERNAME and EXPECTED_IG_USER_ID (run with --dry first to read them)");
  if (profile.username !== expected.username || profile.user_id !== expected.userId)
    throw new ConnectSetupError("Connection is not the expected Instagram account");
}
