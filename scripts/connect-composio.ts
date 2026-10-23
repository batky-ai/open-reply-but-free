import { readFileSync } from "node:fs";
import { prisma } from "../lib/db/client";
import { parseComposioCredentials } from "../lib/composio/transport";
import { assertExpectedProfile, ConnectSetupError } from "../lib/composio/connect";
import { fetchComposioProfile, saveComposioAccount } from "../lib/composio/link-account";

// The same connection Settings makes, for people who prefer a terminal.
// Pass credentials on stdin from a private file, never command arguments.
// --dry prints only the profile username and id and saves nothing.
async function main() {
  const dry = process.argv.includes("--dry");
  const credentials = parseComposioCredentials(readFileSync(0, "utf8"));
  const profile = await fetchComposioProfile(credentials);
  if (dry) { console.log(JSON.stringify({ username: profile.username, user_id: profile.userId })); return; }
  assertExpectedProfile({ username: profile.username, user_id: profile.userId },
    { username: process.env.EXPECTED_IG_USERNAME, userId: process.env.EXPECTED_IG_USER_ID });
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) throw new ConnectSetupError("Set OWNER_EMAIL to the signed-in owner's email");
  const workspace = await prisma.workspace.findFirst({ where: { owner: { email: ownerEmail } }, orderBy: { createdAt: "asc" } });
  if (!workspace) throw new ConnectSetupError("Owner workspace not found. Sign in once at the dashboard first.");
  const account = await saveComposioAccount(credentials, profile, workspace.id);
  console.log(JSON.stringify({ connected: account.username, provider: account.provider, workspace: workspace.name }));
}
main().catch((error) => {
  console.error(error instanceof ConnectSetupError ? error.message : "Composio account setup failed; credentials were not logged.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
