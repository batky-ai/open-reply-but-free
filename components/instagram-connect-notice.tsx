"use client";

import { useSearchParams } from "next/navigation";

type Tone = "error" | "warning" | "success";

const TONE_CLASSES: Record<Tone, string> = {
  error: "border-error/20 bg-error/10 text-error",
  warning: "border-warning/20 bg-warning/10 text-warning",
  success: "border-success/20 bg-success/10 text-success",
};

const MESSAGES: Record<string, { tone: Tone; title: string; detail: string }> = {
  denied: {
    tone: "warning",
    title: "Instagram connection cancelled",
    detail:
      "You declined the permission prompt on Instagram. Start again and accept all requested permissions.",
  },
  invalid: {
    tone: "error",
    title: "Instagram connection expired",
    detail:
      "The login link was missing or older than 10 minutes. Click Connect Instagram to start a fresh attempt.",
  },
  forbidden: {
    tone: "error",
    title: "Not permitted",
    detail:
      "Only workspace owners and admins can connect an Instagram account.",
  },
  already_connected: {
    tone: "warning",
    title: "Account already connected",
    detail:
      "That Instagram account is connected to another workspace. Disconnect it there first, or connect a different account.",
  },
};

export function InstagramConnectNotice() {
  const searchParams = useSearchParams();
  const status = searchParams.get("instagram");

  if (!status) return null;

  if (status === "misconfigured") {
    return (
      <Notice tone="warning" title="Instagram setup is not finished yet">
        <p>Connect your Instagram account through Composio using scripts/connect-composio.ts (see the README). Your campaigns will stay paused until you activate them.</p>
      </Notice>
    );
  }

  if (status === "failed") {
    const reason = searchParams.get("reason");

    return (
      <Notice tone="error" title="Instagram connection failed">
        <p>
          Instagram accepted the login but the connection could not be
          completed. This is usually a mismatched redirect URI or an app that is
          missing the required permissions.
        </p>
        {reason && (
          <p className="mt-2 font-mono text-xs break-words opacity-80">
            {reason}
          </p>
        )}
      </Notice>
    );
  }

  const known = MESSAGES[status];
  if (!known) return null;

  return (
    <Notice tone={known.tone} title={known.title}>
      <p>{known.detail}</p>
    </Notice>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: Tone;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded border p-4 text-sm ${TONE_CLASSES[tone]}`}>
      <p className="font-semibold">{title}</p>
      <div className="mt-1 opacity-90">{children}</div>
    </div>
  );
}
