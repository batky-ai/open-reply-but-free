import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canManageWorkspace, getCurrentWorkspaceContext } from "@/lib/workspace-access";
import { ConnectSetupError } from "@/lib/composio/connect";
import { fetchComposioProfile, saveComposioAccount } from "@/lib/composio/link-account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  apiKey: z.string().trim().min(16, "Paste the API key from your Composio project settings"),
  connectedAccountId: z.string().trim().regex(/^ca_[\w-]+$/, "The connected account ID starts with ca_"),
  // Sent on the second step: the Instagram id the owner saw and confirmed.
  confirmUserId: z.string().optional(),
}).strict();

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Connects Instagram through Composio in two steps. Without confirmUserId it
 * only reads the profile, so the owner sees which account the key reaches.
 * With it, the credential is saved only if it still points at that account.
 */
export async function POST(request: NextRequest) {
  const context = await getCurrentWorkspaceContext();
  if (!context) return json({ success: false, error: "Unauthorized" }, 401);
  if (!canManageWorkspace(context.role))
    return json({ success: false, error: "Only owners and admins can connect Instagram" }, 403);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ success: false, error: parsed.error.issues[0]?.message ?? "Check the details and try again" }, 400);
  const { confirmUserId, ...credentials } = parsed.data;

  try {
    const profile = await fetchComposioProfile(credentials);
    if (!confirmUserId) return json({ success: true, data: { username: profile.username, userId: profile.userId } });
    if (confirmUserId !== profile.userId)
      return json({ success: false, error: "That connection now points at a different Instagram account. Check it again." }, 409);
    const account = await saveComposioAccount(credentials, profile, context.workspaceId);
    return json({ success: true, data: { connected: account.username } });
  } catch (error) {
    // Never echo unexpected errors: they can carry request details.
    if (error instanceof ConnectSetupError) return json({ success: false, error: error.message }, 400);
    console.error("[composio/connect] failed");
    return json({ success: false, error: "Could not connect. Check the details and try again." }, 500);
  }
}
