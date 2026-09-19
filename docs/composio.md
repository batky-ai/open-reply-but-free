# Connect Instagram through Composio

You need two values: a Composio **API key** and the **connected account id** (`ca_...`) of
your Instagram account. This takes about five minutes and uses Composio's managed Instagram
login, so you never create a Meta app.

Requirements: an Instagram **Business or Creator** account (switch in the Instagram app
under Settings → Account type if needed), and a free [Composio](https://composio.dev)
account.

## 1. API key

Sign in to Composio and open
[Project settings → API keys](https://dashboard.composio.dev/~/project/settings/api-keys).
Create or copy a key. Keep it private: it can reach every connected account in that
project.

Load it into your shell without it landing in your history:

```bash
read -rs COMPOSIO_API_KEY && export COMPOSIO_API_KEY
```

## 2. Instagram auth config (once per project)

This tells Composio to use its own managed Instagram login:

```bash
curl -s https://backend.composio.dev/api/v3.1/auth_configs \
  -H "x-api-key: $COMPOSIO_API_KEY" -H "Content-Type: application/json" \
  -d '{"toolkit":{"slug":"instagram"},"auth_config":{"type":"use_composio_managed_auth","credentials":{},"restrict_to_following_tools":[]}}'
```

Copy `auth_config.id` (starts with `ac_`) from the response.

## 3. Connect your Instagram account

Create a connection link. `user_id` is any label you choose for yourself:

```bash
curl -s https://backend.composio.dev/api/v3.1/connected_accounts/link \
  -H "x-api-key: $COMPOSIO_API_KEY" -H "Content-Type: application/json" \
  -d '{"auth_config_id":"ac_...","user_id":"instagram-owner"}'
```

The response has `redirect_url` and `connected_account_id` (`ca_...`). Open `redirect_url`
in a browser, log in to Instagram **as the account that should send the DMs**, and approve.
Keep the `ca_...` id.

## 4. Hand it to the app

Write both values to a private file outside the repo:

```bash
printf '{"apiKey":"%s","connectedAccountId":"%s"}\n' "$COMPOSIO_API_KEY" "ca_..." > ~/composio-ig.json
chmod 600 ~/composio-ig.json
```

Then continue with **Connect Instagram** in the [README](../README.md): run
`scripts/connect-composio.ts --dry` first. It asks Instagram (through Composio) which account
the connection belongs to and prints only the username and id. If that fails, the key or
the connection is wrong, and nothing has been saved.

## Notes

- The credential is stored encrypted with `ENCRYPTION_KEY`. Changing that key means
  re-running `scripts/connect-composio.ts`.
- Revoking the API key or disconnecting the account in Composio stops all sends until you
  reconnect. Activity will show the failures.
- The connect script also accepts a Composio user key with explicit project scope
  (`{"apiKey", "orgId", "projectId", "connectedAccountId"}`), which is sent as
  `x-user-api-key`. A project API key as above is the simpler path.
- Composio's free plan limits are on [composio.dev/pricing](https://composio.dev/pricing).
  Each sweep and each DM is a proxied request; check your usage in the dashboard.
