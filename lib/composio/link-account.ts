import { prisma } from "@/lib/db/client";
import { graphFetch, type ComposioCredentials } from "@/lib/composio/transport";
import { ConnectSetupError, type ComposioProfile } from "@/lib/composio/connect";
import { encryptToken } from "@/lib/meta/oauth";

/** Reads the Instagram profile behind a Composio connection. Shared by Settings and the CLI script. */
export async function fetchComposioProfile(credentials: ComposioCredentials) {
  let response: Response;
  try {
    response = await graphFetch(credentials, "https://graph.instagram.com/v25.0/me?fields=id,user_id,username,name");
  } catch {
    throw new ConnectSetupError("Composio could not reach Instagram. Check the API key and connected account ID.");
  }
  const profile: ComposioProfile = await response.json().catch(() => ({}));
  if (!response.ok || !profile.user_id || !profile.username)
    throw new ConnectSetupError(response.status === 401 || response.status === 403
      ? "Composio rejected the API key. Copy it again from your Composio project settings."
      : "Composio did not return an Instagram profile. Check the connected account ID and that Instagram is connected in that project.");
  return { userId: profile.user_id, username: profile.username, name: profile.name ?? null };
}

/** Stores the credential, encrypted, as the workspace's Instagram account. */
export async function saveComposioAccount(
  credentials: ComposioCredentials,
  profile: { userId: string; username: string; name: string | null },
  workspaceId: string,
) {
  const existing = await prisma.instagramAccount.findUnique({ where: { instagramId: profile.userId } });
  if (existing && (existing.workspaceId !== workspaceId || existing.provider !== "COMPOSIO"))
    throw new ConnectSetupError("This Instagram account is already connected another way. Disconnect it first.");
  const data = { username: profile.username, name: profile.name,
    accessToken: encryptToken(JSON.stringify(credentials)), tokenExpiresAt: null, webhookSubscribed: false };
  return prisma.instagramAccount.upsert({ where: { instagramId: profile.userId },
    create: { ...data, instagramId: profile.userId, provider: "COMPOSIO", workspaceId }, update: data });
}
