# Upstream

Source: https://github.com/diwenne/openreply
Pinned commit: `4df321844740536fe8fe54a3fc4b1c9acf277b23`
License: MIT, retained in LICENSE. Upstream `.github` workflows are not included.

## Changes in this fork

- **Composio provider** (`COMPOSIO`): `lib/composio/transport.ts` proxies the same
  Instagram Graph requests through Composio, with a durable per-comment delivery claim
  (`ComposioDelivery` table) so a comment can never be answered twice.
  `scripts/connect-composio.ts` stores a pinned, encrypted connection.
  `lib/composio/campaigns.ts` blocks features that need Meta webhooks.
- **Serverless worker**: `lib/ops/cron-poll.ts` and `app/api/cron/poll/route.ts` run one
  worker tick per call, so the app runs on Vercel with no always-on process.
  `WORKER_HEARTBEAT_TTL_SECONDS` makes `/api/health` fit that cadence.
- **Docker stack**: `Dockerfile`, `deploy/compose.yml`, and `scripts/cron.sh` (a scheduler
  for the `/api/cron` routes off Vercel).
- Campaigns save paused by default; sign-in is a fail-closed email allowlist
  (`ALLOWED_EMAILS`); `DIRECT_DATABASE_URL` for migrations on pooled Postgres;
  `CONTACT_EMAIL` on the legal pages.
