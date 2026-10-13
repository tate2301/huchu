# Workers

The app runs on Vercel, which only serves requests. The jobs that run on a clock run as long-lived processes on Fly.io: one app, `huchu-workers`, built from this repository's `Dockerfile`, with one process group per worker in `fly.toml`.

| Worker | Process group | What it runs |
| --- | --- | --- |
| Retail | `retail` | Price changes, posting runs, the message outbox, buying follow-ups, lay-by reminders, expiries (`lib/retail/worker/jobs.ts`) |

Vane's worker joins this table when `scripts/vane-worker.ts` exists (`docs/handover-core-modules.md` §3.3).

The image holds the dependencies and the Prisma client, not the Next.js build. Each process group starts its script with `node_modules/.bin/tsx` directly, never through `pnpm`, which does not pass SIGTERM on: a worker finishes the pass in flight when a deploy stops it, and `kill_timeout` gives it two minutes.

## Setting it up

1. In the Fly.io dashboard, launch an app from GitHub: `tate2301/huchu`, branch `main`. Fly reads `fly.toml` and the `Dockerfile`; keep the app name `huchu-workers` and the region `iad` (Virginia, next to the Neon database).
2. Secrets: the same values as Vercel's production environment (`vercel env pull .env.production`, then paste them into the app's Secrets, or `fly secrets import < .env.production`). The retail worker reads `DATABASE_URL` and whatever its jobs need: WhatsApp, email, blob storage.
3. Deploy. The retail machine's log shows `[retail-worker] starting` and a line per job it runs.
4. Keep one machine per process group (`fly scale count retail=1`): two would run every job twice.

## Adding a worker

Add a line under `[processes]` in `fly.toml` (`vane = "node_modules/.bin/tsx scripts/vane-worker.ts"`), add the group to `[[vm]] processes`, set its secrets, deploy, and scale it to one.
