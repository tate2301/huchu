# Scheduled jobs

The jobs that run on a clock run inside the app on Vercel. Once a minute, cron-job.org calls `GET /api/cron/tick` (`app/api/cron/tick/route.ts`) with `Authorization: Bearer <CRON_SECRET>`, and the tick runs whichever jobs are due (`lib/scheduled-jobs/run.ts`). There is no worker process to host.

| Jobs | Where they are listed |
| --- | --- |
| Retail: price changes, posting runs, the message outbox, buying follow-ups, lay-by reminders, expiries | `lib/retail/jobs.ts` |

Vane's jobs join the tick when its runner exists (`docs/handover-core-modules.md` §3.3).

## How a tick decides

- Each job is daily at a shop-clock time (`dailyAt: "06:00"`, Africa/Harare) or every few minutes (`everyMinutes: 5`). Time is cut into slots, and a job is due when it has not run since its current slot began (`lib/scheduled-jobs/schedule.ts`).
- `ScheduledJobRun` keeps each job's last run. A tick claims a job with one `UPDATE` that sets a five-minute lease, so two overlapping ticks never run the same job, and a tick that dies mid-job leaves it to the next tick once the lease ends.
- A job that throws keeps its old last run, so the next tick tries it again. The other jobs still run.
- A tick stops starting jobs after 90 seconds (the route's `maxDuration` is 120). Anything left is still due on the next tick.
- If no tick comes for a while, every job whose slot passed runs once at the next tick. Every job is safe to run twice.

## Setting it up

1. Generate a long random secret (`openssl rand -hex 32`) and add it to Vercel's production environment as `CRON_SECRET`. Redeploy so the app reads it.
2. On cron-job.org, create a cron job:
   - URL: `https://<production domain>/api/cron/tick`
   - Schedule: every minute
   - Request method: `GET`
   - Headers: `Authorization: Bearer <the secret>`
   - Notifications: on failure, so a broken tick is noticed
3. Check the first runs in cron-job.org's history: each answers `200` with the jobs it ran, for example `{"outcomes":[{"job":"price-changes","result":"ran","said":"0 applied"}]}`. A `401` means the secret does not match.

Locally, with `CRON_SECRET` in `.env`:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/tick
```

## Adding a job

Add it to the list its module owns (`lib/retail/jobs.ts` for retail) with a `name`, a `when` and a `run` that does the work for every workspace and returns one line saying what it did. A new module's list goes into the route's job list. A job must be safe to run twice and must finish well inside the tick's 90 seconds; work that takes longer is split so each tick does a part.
