"use client";

import { useState } from "react";

const field =
  "w-full rounded border border-border bg-surface px-4 py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/40";

/** Settings form: paste the Composio API key and connected account ID, check, then connect. */
export function ComposioConnectForm() {
  const [apiKey, setApiKey] = useState("");
  const [connectedAccountId, setConnectedAccountId] = useState("");
  const [found, setFound] = useState<{ username: string; userId: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/composio/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, connectedAccountId, ...(found ? { confirmUserId: found.userId } : {}) }),
      });
      const payload = await res.json();
      if (!payload.success) {
        setError(payload.error ?? "Could not connect");
        setFound(null);
      } else if (found) {
        window.location.reload();
        return;
      } else {
        setFound(payload.data);
      }
    } catch {
      setError("Could not reach the app. Try again.");
    }
    setBusy(false);
  }

  function edit() {
    setFound(null);
    setError(null);
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3 border-t border-border pt-4">
      <p className="text-sm font-medium text-foreground">Connect through Composio</p>
      <p className="text-xs text-muted">
        In your Composio project, connect Instagram, then copy the project API key and the
        connected account ID (it starts with ca_). Use a project made only for this app.
      </p>
      <input
        type="password"
        autoComplete="off"
        aria-label="Composio API key"
        placeholder="Composio API key"
        value={apiKey}
        onChange={(event) => { setApiKey(event.target.value); edit(); }}
        className={field}
        required
      />
      <input
        autoComplete="off"
        autoCapitalize="none"
        aria-label="Connected account ID"
        placeholder="Connected account ID (ca_...)"
        value={connectedAccountId}
        onChange={(event) => { setConnectedAccountId(event.target.value); edit(); }}
        className={field}
        required
      />
      {found && (
        <p role="status" className="rounded border border-success/20 bg-success/10 p-3 text-sm text-success">
          Found @{found.username}. Connect it if this is your account.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {busy ? "Checking..." : found ? `Connect @${found.username}` : "Check connection"}
      </button>
    </form>
  );
}
