# Workers

The app runs on Vercel, which only serves requests. The jobs that run on a clock run as long-lived processes on Railway, one Railway service per worker, all from this repository.

| Worker | Script | Railway config |
| --- | --- | --- |
| Retail: price changes, posting runs, message outbox, follow-ups, reminders, expiries (`lib/retail/worker/jobs.ts`) | `pnpm worker:retail` | `railway/retail-worker.json` |

Vane's worker joins this table when `scripts/vane-worker.ts` exists (`docs/handover-core-modules.md` §3.3).

## Adding a worker's service on Railway

1. New service → GitHub repo → `tate2301/huchu`, branch `main`.
2. Settings → Config-as-code → the worker's file from the table above. It sets the build (the Prisma client only, no `next build`), the start command, one replica and restart on exit.
3. Variables: the same values as Vercel's production environment (`vercel env pull`, then paste into Railway's raw editor). The worker reads `DATABASE_URL` and whatever the jobs it runs need: WhatsApp, email, blob storage.
4. Deploy. The log shows `[retail-worker] starting` and one line per job it runs.

Keep each service at one replica: two copies would run every job twice.
