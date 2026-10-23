# Agent instructions

Self-hosted Instagram comment-to-DM (OpenReply fork, Instagram through Composio).
Read `README.md` and `UPSTREAM.md` first. `AGENTS.md` applies: this Next.js version differs
from training data, so check `node_modules/next/dist/docs/` before using a Next API you are
unsure of.

## Constraints

- Keep upstream code shape so upstream fixes stay easy to port. Fork changes are listed in
  `UPSTREAM.md`; keep that list current.
- Never print or log Composio credentials, database URLs, or secrets. Credentials enter
  `scripts/connect-composio.ts` on stdin from a private file, never as arguments.
- Do not persist Composio response bodies on failure; they can contain credential data.

## Verification

```bash
npm test && npm run lint && npm run typecheck
```

A real DM needs a keyword comment from a second Instagram account. A healthy queue or
`/api/health` is not proof of delivery; check Activity (`DmLog`).

## Gotchas

- **On Vercel the poll route is the worker.** If DMs stop, check that the external
  scheduler is calling `/api/cron/poll` with the bearer secret. The route answers
  `{started:true}` at once and runs the tick in `after()` (cron-job.org gives up after 30 s),
  so results are in Activity and the function log, never in the response. A log line with
  `"skipped":true` means a previous tick still held the Redis lock.
- **Vercel Hobby rejects crons more frequent than daily** at deploy time, which is why
  `/api/cron/poll` is not in `vercel.json`.
- **Do not rotate `ENCRYPTION_KEY`** without reconnecting Composio (Settings or
  `scripts/connect-composio.ts`): the stored Composio credential is encrypted with it.
- **A Composio API key reaches every connection in its project.** Settings connects in two
  steps (check shows the username, connect saves only that account id) and the script pins
  the username and id; keep both.
- **Redis eviction must be off.** BullMQ loses jobs silently under eviction.
- **Vercel preview deployments share production env** unless configured otherwise, and
  their build runs `prisma migrate deploy`. Never put a destructive migration on a branch.

## Git

Branch model: `main-only`. Repo: `batky-ai/open-reply-but-free`. `main` is the only long-lived branch:
changes land through a PR from a `<type>/<slug>` branch, or directly with Evan's
"push to main".
Workflow: `~/projects/CLAUDE-reference.md` → "Git workflow".
