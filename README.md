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

Everything else can run on free tiers too: Vercel Hobby + Supabase + Upstash + Resend +
cron-job.org, or one small server with Docker.

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
    tick: sweep comments, then drain the queue for up to 240 seconds. The route answers at
    once and runs the tick right after, so a scheduler that waits only 30 seconds still
    works. See `lib/ops/cron-poll.ts`.
  - **Docker:** the upstream always-on worker (`npm run worker`) plus a small scheduler.

## Deploy option A: Vercel (free tier)

**You need:** an Instagram Business or Creator account, a second Instagram account to test
with, and free accounts on GitHub, Composio, Supabase, Upstash, Resend, Vercel and
cron-job.org. Keep a scratch note open: steps 2 to 5 each give you a value for step 6.

### 1. Fork this repository

Click **Fork** at the top of this page. Vercel deploys from your fork.

### 2. Composio: new project, connect Instagram

1. Sign in to [Composio](https://composio.dev) and create a **new project** just for this
   app. One Composio API key can reach every account connected in its project, so keep this
   one separate.
2. In that project, add the **Instagram** toolkit (Composio's managed auth is fine), then
   connect your Instagram Business or Creator account.
3. Copy two values: the project **API key** (project settings) and the **connected account
   ID** of your Instagram connection (it starts with `ca_`). You paste both into the app in
   step 7, not into Vercel. Prefer the API? [docs/composio.md](docs/composio.md) does the
   same with two `curl` calls.

### 3. Supabase: the database

The app only needs Supabase's Postgres database, not its other features.

1. At [supabase.com](https://supabase.com), create a project. Pick the East US (North
   Virginia) region, closest to Vercel's default. Give the database a password of letters
   and numbers only, so it can go into the connection strings as is, and keep it.
2. Turn off the **Data API** (in the project's security options when you create it, or
   later under Project Settings). The app talks to Postgres directly, and with the Data API
   on, Supabase publishes the app's tables over its own web API.
3. Click **Connect** and copy two connection strings, putting your password in place of
   `[YOUR-PASSWORD]`:
   - **Transaction pooler** (port `6543`): that is `DATABASE_URL`, for the app.
   - **Session pooler** (port `5432`): that is `DIRECT_DATABASE_URL`. The build uses it to
     create the tables. Use the session pooler, not "Direct connection": on the free plan the
     direct address is IPv6 only, which Vercel cannot reach.

### 4. Upstash: the queue

1. At [upstash.com](https://upstash.com), create a Redis database in the same region.
2. Make sure **Eviction** is off (it is off by default). With eviction on, Redis can drop
   queued DMs without telling you.
3. Copy the **TCP** connection string that starts with `rediss://`: that is `REDIS_URL`.

### 5. Resend: the sign-in email

At [resend.com](https://resend.com), create an API key: that is `RESEND_API_KEY`. Without
your own domain, use `EMAIL_FROM=OpenReply <onboarding@resend.dev>`; Resend then delivers
only to the email you signed up to Resend with, so use that email in `ALLOWED_EMAILS`.

### 6. Vercel: import and deploy

1. At [vercel.com](https://vercel.com), **Add New > Project**, and import your fork.
2. Open **Environment Variables** and add every variable from [.env.example](.env.example).
   You can paste the whole filled-in file into the first field. Generate the secrets in a
   terminal:

   ```bash
   openssl rand -base64 32
   ```

   for `NEXTAUTH_SECRET`,

   ```bash
   openssl rand -hex 32
   ```

   for `ENCRYPTION_KEY` (64 characters), and

   ```bash
   openssl rand -hex 24
   ```

   for `CRON_SECRET`. Set `NEXTAUTH_URL` to `https://<your-project-name>.vercel.app`,
   `ALLOWED_EMAILS` to your email and `WORKER_HEARTBEAT_TTL_SECONDS` to `420`.
3. Click **Deploy**. The build runs `prisma migrate deploy`. When it finishes, open the app.
   If Vercel gave it a different domain than you guessed, fix `NEXTAUTH_URL` and redeploy.

### 7. Sign in and connect Instagram

1. Open your app, enter your email and click the magic link Resend sends you.
2. Go to **Settings**, paste the Composio API key and connected account ID from step 2, and
   click **Check connection**. When it shows your Instagram username, click
   **Connect @yourname**.

### 8. cron-job.org: the five minute check

Vercel's free plan runs its own scheduled jobs at most once a day, which is why
`vercel.json` holds only two daily jobs. The comment check needs every five minutes, so a
free outside scheduler calls it:

1. At [cron-job.org](https://cron-job.org), create a cronjob.
2. URL: `https://<your-app>/api/cron/poll`. Schedule: every 5 minutes.
3. Under **Advanced**, add a header: `Authorization` with the value `Bearer <your
   CRON_SECRET>`.
4. Save and run a test. A good answer is `{"success":true,"data":{"started":true}}`. The
   route answers at once and does the work right after, because cron-job.org gives up on a
   request after 30 seconds; the results show in Activity, not in that answer. A `401` means
   the header does not match `CRON_SECRET`.

On Vercel Pro you can skip cron-job.org: add `{"path": "/api/cron/poll", "schedule":
"*/5 * * * *"}` to the `crons` list in `vercel.json` and Vercel sends the secret itself.

### 9. Your first campaign

1. **Campaigns > New campaign**, and pick the post or reel.
2. Add a keyword people would actually type, like `LINK`.
3. Write the DM and add the button with your link. **Save paused**: nothing sends yet.
4. Open the campaign and click **Activate**.
5. From your second Instagram account, comment the keyword (your own comments are ignored on
   purpose). Within five minutes the DM arrives (check Message Requests too). **Activity**
   shows the send, or the reason it skipped.

### Free plan limits

Check each provider's pricing page; these figures were current in October 2026.

- **Supabase Free** gives a 500 MB database that stays on, with no monthly compute-hour
  cap, which is why this uses it instead of a database that sleeps when idle: a check every
  5 minutes would keep one awake all month. Supabase pauses free projects after a week of
  inactivity; if yours is ever paused, restore it from the Supabase dashboard.
- **Upstash Free** allows 500,000 commands a month. A check with nothing to send uses about
  30, so checks every 5 minutes use about 260,000 a month before any DMs.
- **Vercel Hobby** functions may run up to 300 seconds; one check stops working after 240.

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

## Connect Instagram from a terminal

Settings (step 7 above) is the simple way, and works on Docker too. If you prefer a
terminal, `scripts/connect-composio.ts` does the same and pins the exact account:

1. Put the Composio values in a private file outside the repo, for example
   `~/composio-ig.json` (`chmod 600`):

   ```json
   { "apiKey": "<composio api key>", "connectedAccountId": "ca_..." }
   ```

2. In a local clone, put your deployment's `DATABASE_URL` and `ENCRYPTION_KEY` in `.env`.
   Read which Instagram account the connection points at. This saves nothing:

   ```bash
   npm ci && npx prisma generate
   npx tsx scripts/connect-composio.ts --dry < ~/composio-ig.json
   ```

3. Save it, pinned to exactly that account:

   ```bash
   EXPECTED_IG_USERNAME=<username from --dry> EXPECTED_IG_USER_ID=<user_id from --dry> OWNER_EMAIL=<your sign-in email> npx tsx scripts/connect-composio.ts < ~/composio-ig.json
   ```

   On Docker, run both inside the web container:
   `docker compose -f deploy/compose.yml exec -T web npx tsx scripts/connect-composio.ts --dry < ~/composio-ig.json`

## Use it

Campaigns → New campaign → pick a post (or "next reel") → keywords → message and link →
Save paused → Activate.

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

Built on [diwenne/openreply](https://github.com/diwenne/openreply) by Diwen Huang and Anish
Raj, MIT.
This fork is MIT too; see [LICENSE](LICENSE), and [UPSTREAM.md](UPSTREAM.md) for what
changed. Not affiliated with Meta, Instagram, Composio or ManyChat.
