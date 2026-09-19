import { readFileSync } from "node:fs";
import { prisma } from "../lib/db/client";
import { parseComposioCredentials, graphFetch } from "../lib/composio/transport";
import { assertExpectedProfile, ConnectSetupError, type ComposioProfile } from "../lib/composio/connect";
import { encryptToken } from "../lib/meta/oauth";

// Pass credentials on stdin from a private file, never command arguments.
// --dry prints only the profile username and id and saves nothing.
async function main() {
  const dry = process.argv.includes("--dry");
  const credentials = parseComposioCredentials(readFileSync(0, "utf8"));
  const response = await graphFetch(credentials, "https://graph.instagram.com/v25.0/me?fields=id,user_id,username,name");
  const profile: ComposioProfile = await response.json();
  if (!response.ok || !profile.user_id || !profile.username)
    throw new ConnectSetupError("Composio did not return an Instagram profile");
  if (dry) { console.log(JSON.stringify({ username: profile.username, user_id: profile.user_id })); return; }
  assertExpectedProfile(profile, { username: process.env.EXPECTED_IG_USERNAME, userId: process.env.EXPECTED_IG_USER_ID });
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) throw new ConnectSetupError("Set OWNER_EMAIL to the signed-in owner's email");
  const workspace = await prisma.workspace.findFirst({ where: { owner: { email: ownerEmail } }, orderBy: { createdAt: "asc" } });
  if (!workspace) throw new ConnectSetupError("Owner workspace not found. Sign in once at the dashboard first.");
  const existing = await prisma.instagramAccount.findUnique({ where: { instagramId: profile.user_id } });
  if (existing && (existing.workspaceId !== workspace.id || existing.provider !== "COMPOSIO"))
    throw new ConnectSetupError("Existing account connection needs review before replacement");
  const data = { username: profile.username, name: profile.name ?? null,
    accessToken: encryptToken(JSON.stringify(credentials)), tokenExpiresAt: null, webhookSubscribed: false };
  const account = await prisma.instagramAccount.upsert({ where: { instagramId: profile.user_id },
    create: { ...data, instagramId: profile.user_id, provider: "COMPOSIO", workspaceId: workspace.id }, update: data });
  console.log(JSON.stringify({ connected: account.username, provider: account.provider, workspace: workspace.name }));
}
main().catch((error) => {
  console.error(error instanceof ConnectSetupError ? error.message : "Composio account setup failed; credentials were not logged.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
