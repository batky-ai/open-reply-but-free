# open-reply-but-free

Self-hosted Instagram comment-to-DM. Someone comments a keyword on your post or reel, and
within about five minutes they get a private reply DM with your link. A ManyChat-style
keyword funnel, running on your own infrastructure.

This is a fork of [OpenReply](https://github.com/diwenne/openreply) (MIT) with one change
that matters: **Instagram access goes through [Composio](https://composio.dev)**. That
means:

- No Meta developer app, no App Review, no business verification.
- No paid Instagram provider subscription.
- Composio's free plan (100,000 tool calls a month at the time of writing) covers a
  typical creator account many times over.

Everything else can run on free tiers too: Vercel Hobby + Neon + Upstash + Resend, or one
small server with Docker.

## What works on the Composio connection

| Feature | Composio |
| --- | --- |
| Comment keyword → private reply DM with tracked link | Yes |
| Optional public reply under the comment | Yes |
| Campaign on a specific post, or on "my next reel" | Yes |
| Click tracking, activity log, shareable reports | Yes |
| DM keyword triggers, story replies, opening DM | No (needs Meta webhooks) |
| Follow gates, follow-up messages | No |

Comments are found by polling every five minutes, not by webhook, so replies arrive within
roughly five minutes rather than instantly. Only comments made after a campaign is
activated get a reply. The upstream Meta and Zernio connections are still in the code if
you want them later; see [docs/setup.md](docs/setup.md).

Instagram's rules still apply: a Business or Creator account, one private reply per
comment, messaging windows, and rate limits. This tool does not bypass any of them.

## How it works

```
comment on your post → poll (every 5 min) → keyword match → BullMQ queue → private reply via Composio → DM
```

- Next.js 16 dashboard and API, Prisma 7 on PostgreSQL, BullMQ on Redis, Auth.js magic links.
- `lib/composio/transport.ts` sends the same Instagram Graph requests upstream sends, but
  through Composio's proxy using your connected account. Every send is claimed in Postgres
  first, so a comment never gets two DMs, even across retries or restarts.
- Two ways to run the worker:
  - **Vercel:** no always-on process. Each call to `/api/cron/poll` does one full worker
    tick: sweep comments, then drain the queue for up to 240 seconds. See
    `lib/ops/cron-poll.ts`.
  - **Docker:** the upstream always-on worker (`npm run worker`) plus a small scheduler.

## Deploy option A: Vercel (free tier)

You need accounts on Vercel, [Neon](https://neon.tech) (Postgres),
[Upstash](https://upstash.com) (Redis), [Resend](https://resend.com) (sign-in email) and
[Composio](https://composio.dev).

1. Fork this repo and import it into Vercel.
2. Create a Neon database. Put the pooled URL in `DATABASE_URL` and the direct URL in
   `DIRECT_DATABASE_URL`.
3. Create an Upstash Redis database. Use its TCP `rediss://` URL as `REDIS_URL` and turn
   eviction **off**.
4. Verify a sending domain in Resend, then set `RESEND_API_KEY` and `EMAIL_FROM`.
5. Set the remaining variables from [.env.example](.env.example) in Vercel, including
   `WORKER_HEARTBEAT_TTL_SECONDS=420`.
6. Deploy. The build runs `prisma migrate deploy`.
7. **Schedule the poll.** Vercel Hobby only allows daily crons, so the five-minute poll is
   called from outside. Any free scheduler that can send a header works. For example, on
   [cron-job.org](https://cron-job.org) create a job:
   - URL `https://<your-app>.vercel.app/api/cron/poll`, method GET, every 5 minutes
   - Header `Authorization: Bearer <your CRON_SECRET>`
   - The longest timeout it allows (a tick can take about four minutes)

   On Vercel Pro you can instead add `{"path": "/api/cron/poll", "schedule": "*/5 * * * *"}`
   to `crons` in `vercel.json` and skip the external scheduler.

## Deploy option B: Docker on your own server

```bash
git clone https://github.com/batky-ai/open-reply-but-free.git
cd open-reply-but-free
cp deploy/.env.example deploy/.env    # fill it in
docker compose -f deploy/compose.yml up -d --build
```

This runs Postgres, Redis, migrations, the web app on `127.0.0.1:3000`, the always-on
worker, and a scheduler for the daily jobs. Put an HTTPS reverse proxy in front (Caddy,
nginx, Traefik, or a Cloudflare tunnel) and set `NEXTAUTH_URL` to its public URL.

## Connect Instagram

1. Sign in to your deployment once with an email listed in `ALLOWED_EMAILS`. This creates
   your workspace.
2. Get a Composio API key and an Instagram connected account (`ca_...`). Step by step:
   [docs/composio.md](docs/composio.md).
3. Put them in a private file outside the repo, for example `~/composio-ig.json`
   (`chmod 600`):

   ```json
   { "apiKey": "<composio api key>", "connectedAccountId": "ca_..." }
   ```

4. In a local clone, put your deployment's `DATABASE_URL` and `ENCRYPTION_KEY` in `.env`.
   Read which Instagram account the connection points at. This saves nothing:

   ```bash
   npm ci && npx prisma generate
   npx tsx scripts/connect-composio.ts --dry < ~/composio-ig.json
   ```

5. Save it, pinned to exactly that account:

   ```bash
   EXPECTED_IG_USERNAME=<username from --dry> EXPECTED_IG_USER_ID=<user_id from --dry> OWNER_EMAIL=<your sign-in email> npx tsx scripts/connect-composio.ts < ~/composio-ig.json
   ```

   The credential is encrypted with `ENCRYPTION_KEY` before it is stored. On Docker, the
   simplest way is to run both commands inside the web container:
   `docker compose -f deploy/compose.yml exec -T web npx tsx scripts/connect-composio.ts --dry < ~/composio-ig.json`

The pin matters: a Composio API key can reach every connection in its project, so the
script refuses to save anything but the account you named.

## Use it

Campaigns → New → pick a post (or "next reel") → keywords → message and link → Activate.
Campaigns are saved paused until you activate them.

Test from a **different** Instagram account (your own comments are ignored on purpose):
comment the keyword, wait up to five minutes, then check Activity. It lists every send and
every skip with the reason. `/api/health` reports database, Redis, queue and worker
heartbeat.

## Development

```bash
docker compose up -d          # local Postgres and Redis
cp .env.example .env          # DATABASE_URL=postgresql://postgres:postgres@localhost:5432/openreply
                              # REDIS_URL=redis://localhost:6379
npm ci
npx prisma generate && npx prisma migrate deploy
npm run dev                   # and in a second terminal: npm run worker
npm test && npm run lint && npm run typecheck
```

## Credits and license

Built on [diwenne/openreply](https://github.com/diwenne/openreply) by Diwen Huang, MIT.
This fork is MIT too; see [LICENSE](LICENSE), and [UPSTREAM.md](UPSTREAM.md) for what
changed. Not affiliated with Meta, Instagram, Composio or ManyChat.
