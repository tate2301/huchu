# Epic 9a — Importer Worker Decision Memo

**Date:** 2026-05-10  
**Author:** Engineering (drafted by Claude Sonnet 4.6)  
**Status:** **DECIDED — Inngest** (hosting constraint confirmed: Vercel Serverless only)  
**Blocking:** Epic 9a implementation tickets  

> **Constraint update (2026-05-10).** The original draft of this memo recommended `pg-boss` because it is the lean option in the abstract. The hosting picture is Vercel Serverless only — no second persistent process host is acceptable, and adding one is out of scope for this epic. That constraint eliminates Option B (`pg-boss` requires a long-running worker process). The recommendation pivots to Option C (Inngest). The option-comparison sections below are preserved unedited so reviewers can see the full reasoning; the recommendation, implementation, and risks sections (§5–§7) reflect the Inngest path.

---

## 1. Current state

The import-commit handler (`app/api/gold/imports/[id]/commit/route.ts`) is a 1083-line synchronous Next.js route handler. It runs entirely within a single HTTP request: cleanup pass, production-rows loop (one Prisma `$transaction` per row), sales pass (one `$transaction` per sale), then a final status update. There is no timeout guard, no progress reporting, and no recovery mechanism at the job level.

From the schema and commit history, `GoldLedgerImport.rowsTotal` is the declared row count set at parse time. We do not have a Neon DB query available in this context, but §12.1 of the operational runbook gives the operational picture: "A clean weekly ledger (~50 rows) should commit in under 10 minutes including review. A monthly seed (~500 rows) should commit in under 30 minutes." The handler's design confirms the concern: each row fires at minimum three Prisma round-trips (ShiftReport, Attendance batch, allocation, pour, inventory event, 2–4 accounting events) inside its own transaction, plus foreign-key lookups. At 50 rows, wall time is well within Vercel's 60-second function limit. At 200–500 rows, the request races the platform timeout. The route has a `// TODO (Epic 9b): require co-sign when rowsTotal > 100` comment, which signals the team already expects 100 as a meaningful breakpoint.

**Bottom line:** imports of 1–150 rows are safe today. Imports of 200+ rows are a latent timeout risk on any serverless platform. Historical seed imports (§9.1 mode 1) — which can span months of ledger data — are the primary risk vector.

---

## 2. Option A — Synchronous with guard (row cap)

Cap import size at, say, 250 rows before commit is allowed. Surface a clear validation error if the operator tries to commit a larger import: "This import has N rows. The maximum for a single commit is 250. Use the 'Split import' action to divide it before committing." Add a basic split-import affordance (a UI that lets the operator nominate a row range to fork into a new draft).

**Pros:**
- Zero new infrastructure. No worker process to run, no queue to monitor.
- Predictable performance envelope. Every commit is guaranteed to finish within the timeout window.
- Simplest implementation path. One validation check at the top of the route, one UI affordance.
- No deployment changes.

**Cons:**
- Hard artificial ceiling. The operational runbook describes monthly seeds of ~500 rows as a normal use case (§12.1). Blocking that workflow entirely is an ops regression.
- Shifts work to the operator. Splitting a 600-row ledger into three 200-row pieces is manual drudgery with room for error (gaps, duplicates at the boundary).
- Does not solve progress reporting. A 250-row commit still gives the operator zero feedback for 30–60 seconds; they cannot distinguish "committing" from "timed out."
- Technical debt. The cap is a workaround, not a fix. The first time a real business needs a 300-row weekly ledger, the conversation starts again.

**Verdict:** viable as an emergency stopgap if the team needs to ship something this sprint, but not a durable answer.

---

## 3. Option B — pg-boss (Postgres-backed queue)

Add `pg-boss` as the job queue. The commit endpoint becomes a job-submission endpoint; a worker process picks up the job and runs the existing row loop outside the HTTP request. `pg-boss` stores job state in its own tables in the same Postgres database, so the queue is transactionally consistent with the application data.

**Pros:**
- No Redis, no Kafka, no external message broker. One less infrastructure dependency.
- Transactionally consistent with the application DB. Job creation and the import-status update can happen in the same transaction (`$transaction`).
- Workers can be run as a `tsx` script (a `worker:pdf` script already exists in `package.json` — the pattern is established). Trivial to add a `worker:gold-import` command.
- Retry semantics are built in. Failed jobs retry with exponential backoff; the existing `GoldLedgerEntry.status = FAILED` flow maps directly.
- Works on Neon (Postgres). No platform restrictions.
- Not tied to the HTTP layer. Commit time can grow to minutes without any timeout concern.
- The review doc (§9.6, §9.10) already names `pg-boss` as the recommended option.

**Cons:**
- Requires a persistent worker process. On Vercel Serverless Functions, there is no long-running process host. A separate worker must run on a second host (a small Fly.io or Railway instance, a Docker container, an EC2 t3.micro, or a Vercel Fluid Function if the team moves there).
- Deployment complexity increases by one unit. CI/CD must also deploy and restart the worker.
- Local dev requires running the worker alongside `next dev`. A `concurrently` script handles this easily, but onboarding documentation must say so.
- `pg-boss` needs its schema tables in the DB. A one-time migration (or `boss.start()` on first run, which auto-creates tables) is required.

---

## 4. Option C — Inngest

Use Inngest's hosted function runner. The commit endpoint calls `inngest.send(...)` to enqueue the job. An Inngest function in the codebase handles it. No worker process to run — Inngest calls back into the Next.js app via HTTP.

**Pros:**
- No worker process to host. Inngest manages execution infrastructure.
- Native step-function primitives (sleep, retry, parallel fan-out). Progress can be broken into steps with individual retry policies.
- Good observability dashboard out of the box.

**Cons:**
- External dependency and cost. Inngest's free tier caps at a few thousand function runs/month; production volumes will require a paid plan.
- Internet connectivity required. The callback model means Inngest's servers must be able to reach the app's HTTP endpoint. This rules out purely private network deployments.
- Vendor lock-in for orchestration logic. Migrating away later means rewriting the step function.
- Adds `@inngest/next` to the dependency surface; requires `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` secrets in every environment.
- Not mentioned in the existing docs as the chosen option (§9.6 and §9.10 specifically name `pg-boss` or Inngest, with `pg-boss` as the lean option).

---

## 5. Recommendation

**Use Inngest.** The hosting constraint (Vercel Serverless only, no second persistent process host) eliminates `pg-boss`. Among the remaining options, Inngest beats the row-cap guard because:

1. The row-cap option relocates the problem to the operator for the **monthly seed** workflow — a stated primary use case (§9.1 mode 1). Forcing operators to split a 600-row ledger into three 200-row pieces by hand is an ops regression, not a fix.
2. Inngest's serverless model is a natural fit for Vercel. Inngest hosts the queue/scheduler and calls back into the Next.js app via HTTP — every step runs as a normal Vercel Function invocation, well within the 60s per-invocation budget.
3. Native Next.js integration via `@inngest/next`. The function definitions live in the codebase. Step-function primitives (sleep, retry, parallel fan-out) map cleanly onto the existing row loop.
4. Free tier covers the initial usage envelope (50k step runs/month at the time of writing — well above expected volume during the rebuild's first quarter). Paid plans scale predictably.
5. Built-in observability dashboard, retry policies, and step-level state — all of which we'd otherwise have to build ourselves on top of `pg-boss`.

The trade-offs are real and accepted:

- **Vendor coupling for orchestration.** Mitigated by wrapping Inngest behind a thin `enqueueImportCommit(...)` boundary so swapping it out later (e.g. once the team adopts Vercel Fluid Functions or moves to a multi-host setup) is a one-day rewrite.
- **Callback model means network reachability matters.** Inngest's servers must be able to reach the public app URL. Mitigated by Inngest's automatic retries with exponential backoff plus a UI "stuck in COMMITTING" detector after 30s.
- **Cost at scale.** Mitigated by alerting at 80% of free-tier; documented upgrade trigger.

---

## 6. Implementation steps (Inngest path)

1. **Install dependencies.** `pnpm add inngest @inngest/next`. Add `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` to every environment (.env, Vercel env, vitest env).

2. **Create `lib/gold/import-worker/inngest-client.ts`.** Export a singleton `inngest` client and the typed event name `"gold/import.commit.requested"`. Wrap the client behind a `enqueueImportCommit({ importId, userId, companyId })` helper so callers never import `inngest` directly — keeps the abstraction swappable.

3. **Create `lib/gold/import-worker/commit-job.ts`.** Move the core loop from `app/api/gold/imports/[id]/commit/route.ts` into a `processImportCommit({ importId, userId, companyId, step })` function. The `step` parameter is Inngest's step builder — wrap each phase (cleanup, production-rows loop, sales pass, status finalisation) in `step.run(...)` so each gets its own retry policy and state checkpoint. Pure logic, no `NextResponse`.

4. **Create the Inngest function.** In `lib/gold/import-worker/functions.ts`:
   ```ts
   export const goldImportCommitFn = inngest.createFunction(
     { id: "gold-import-commit", retries: 3 },
     { event: "gold/import.commit.requested" },
     async ({ event, step }) => processImportCommit({ ...event.data, step }),
   );
   ```

5. **Wire the Inngest webhook endpoint.** Create `app/api/inngest/route.ts` using `serve` from `@inngest/next` exporting the registered functions. This is the standard Inngest pattern — Inngest calls back into this URL to drive function execution.

6. **Update the commit route to enqueue.** The route authenticates, validates, runs the synchronous guard checks (site set, leaders mapped, zero CRITICAL anomalies, period open), then in a single `prisma.$transaction`:
   ```ts
   await tx.goldLedgerImport.update({ where: { id }, data: { status: "COMMITTING" } });
   await enqueueImportCommit({ importId: id, userId, companyId });
   ```
   If `enqueueImportCommit` throws, the transaction rolls back — the import does NOT get stuck in `COMMITTING` because the status update was inside the same tx as the send.

7. **Progress reporting.** Inngest tracks per-step state automatically. The UI polls `GET /api/gold/imports/[id]` every 2s, watching `status` and the rolling `rowsCreated + rowsAnomaly + rowsFailed` counts. SSE is a v2 enhancement; polling is sufficient for v1 because the worker writes counts to the DB after each row anyway.

8. **Keep the test DB green.** In `vitest` environments, set `DISABLE_GOLD_IMPORT_WORKER=true`. The commit route detects this flag and falls back to synchronous in-process execution (call `processImportCommit({ ...args, step: stubStep })` directly instead of enqueueing). The `stubStep` runs each phase inline without Inngest. Existing commit tests continue to work without changes.

9. **Local dev.** Inngest provides a Dev Server (`npx inngest-cli@latest dev`) that runs locally and calls back into `next dev`. Add a `dev:full` script: `"dev:full": "concurrently \"next dev\" \"npx inngest-cli@latest dev\""`. No separate worker process to manage.

10. **Deployment.** No separate process to deploy. On Vercel: set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in production env. Register the Inngest endpoint URL (`https://<your-domain>/api/inngest`) in the Inngest dashboard. Done.

---

## 7. Risks and mitigations (Inngest path)

| Risk | Mitigation |
|---|---|
| Inngest can't reach the app (network partition, DNS issue, downtime) | Inngest retries with exponential backoff (default 4 retries over ~24 hours). UI watches `status` — if `COMMITTING` for > 30s, show a "Worker may be unreachable. Contact support" banner. SUPERADMIN action to re-enqueue a stuck import. |
| Worker crashes mid-step | Step-level state means already-completed steps do not re-run. Per-row idempotency is also built into the commit loop (`goldShiftAllocationId` null-check before processing). Re-running the function on the same `importId` is safe by construction. |
| Free tier exceeded mid-month | Set up monthly cost-alert at 80% of free tier. Document the upgrade decision threshold (recommend: upgrade before reaching 90%). Paid pricing is predictable ($20/month for 100k step runs as of this writing). |
| Vendor lock-in | The `enqueueImportCommit` abstraction in `lib/gold/import-worker/inngest-client.ts` is the only place Inngest is referenced from app code. Migrating to `pg-boss` (or anything else) means rewriting this one file. |
| Transactional enqueue fails | Both the status update and `enqueueImportCommit` are in the same `prisma.$transaction`. If the send fails, the status update is rolled back. Operator retries; no partial state. |
| Vercel function timeout for an Inngest step | Each step is a separate Vercel Function invocation. The largest step (per-row processing) is naturally bounded; if a single row takes > 60s something is very wrong with the row, not the architecture. Set per-step timeout to 50s and let Inngest retry on timeout. |
| Operator commits while Inngest is degraded (status page shows incident) | Manual override: a SUPERADMIN-only `POST /api/gold/imports/[id]/commit-sync` endpoint that bypasses Inngest and runs `processImportCommit` synchronously, capped at 100 rows. Used only as an escape hatch during Inngest incidents. |
