# Epic 9a — Importer Worker Decision Memo

**Date:** 2026-05-10  
**Author:** Engineering (drafted by Claude Sonnet 4.6)  
**Status:** Decision pending sign-off  
**Blocking:** Epic 9a implementation tickets  

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

**Use `pg-boss`.** Run the worker as a standalone Node process on a small persistent host (Fly.io free tier or a $5/month VPS is sufficient; this project already has a `worker:pdf` pattern). The reasons:

1. The codebase already has a worker script convention (`worker:pdf` in `package.json`, using `tsx`). Adding `worker:gold-import` follows an established pattern with no new concepts for the team.
2. The DB is Neon Postgres. `pg-boss` runs entirely within Postgres — no new service is added to the infrastructure inventory, just a process.
3. Transactional enqueueing is a hard requirement for this domain. The import's status transition to `COMMITTING` and the job enqueue must be atomic; `pg-boss` supports this because both operations go to the same DB.
4. Inngest's external-call model is operationally riskier for a financial ledger commit. A network partition between Inngest and the app would leave jobs in limbo with no local recovery path.
5. The row-cap option does not solve the problem — it relocates the pain to the operator for a workflow (monthly seed) that is a stated primary use case.

---

## 6. Implementation steps

1. **Install `pg-boss`.** `pnpm add pg-boss`. Version ^9 is current. No schema migration needed beyond `boss.start()` on first worker start (auto-creates `pgboss.*` tables in the same DB).

2. **Create `lib/gold/import-worker/boss.ts`.** Export a singleton `pg-boss` instance configured from `DATABASE_URL`. Export a typed `GOLD_IMPORT_COMMIT_QUEUE` constant for the queue name.

3. **Create `lib/gold/import-worker/commit-job.ts`.** Move the core loop from `app/api/gold/imports/[id]/commit/route.ts` into a `processImportCommit({ importId, userId, companyId })` function. This function is pure logic — no HTTP, no `NextResponse`. The existing row loop, cleanup phase, and status-update logic move verbatim; only the HTTP-layer plumbing is removed.

4. **Update the commit route to enqueue instead of execute.** The route authenticates, validates, does the synchronous guard checks (site set, leaders mapped, zero CRITICAL anomalies, period open), then:
   ```ts
   await prisma.goldLedgerImport.update({ where: { id }, data: { status: "COMMITTING" } })
   const jobId = await boss.send(GOLD_IMPORT_COMMIT_QUEUE, { importId: id, userId, companyId })
   return successResponse({ status: "COMMITTING", jobId })
   ```
   The transition to `COMMITTING` and the `boss.send` must happen in the same `$transaction`. `pg-boss` supports `boss.sendWithConnection(db, ...)` for exactly this.

5. **Create `scripts/worker-gold-import.ts`.** Mirrors `scripts/pdf-worker.ts`. On start: `await boss.start()`. Register: `boss.work(GOLD_IMPORT_COMMIT_QUEUE, processImportCommit)`. Add `"worker:gold-import": "tsx scripts/worker-gold-import.ts"` to `package.json`.

6. **Add SSE progress endpoint.** Create `app/api/gold/imports/[id]/progress/route.ts` as a `GET` returning `text/event-stream`. Each `processImportCommit` row-loop iteration sends a Postgres `NOTIFY gold_import_progress_<importId>` after updating the entry. The SSE endpoint subscribes with `pg.LISTEN`. The UI's "Committing..." state polls or streams this endpoint to show per-row progress and ETA.

7. **Update the UI.** On commit click: poll `GET /api/gold/imports/[id]` every 2s (or connect to the SSE endpoint if implemented) until `status !== "COMMITTING"`. Show a progress bar derived from `rowsCreated + rowsAnomaly + rowsFailed` vs `rowsTotal`. The existing `commitResult` state in `import-studio.tsx` handles the success/failure display.

8. **Keep the test DB green.** In `vitest` environments, set `DISABLE_GOLD_IMPORT_WORKER=true`. The commit route detects this flag and falls back to synchronous in-process execution (call `processImportCommit` directly instead of `boss.send`). No test changes needed — the existing commit tests continue to work.

9. **Local dev.** Add a `concurrently` dev script: `"dev:full": "concurrently \"next dev\" \"tsx scripts/worker-gold-import.ts\""`. Document this in `AGENTS.md` onboarding section.

10. **Deployment.** Add the worker as a separate process in the hosting config. On Fly.io: a second `[[services]]` stanza in `fly.toml` running `worker:gold-import`, scaled to 1 instance minimum. Worker needs `DATABASE_URL` and nothing else.

---

## 7. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Worker crashes mid-commit, leaving partial state | Per-row idempotency already built into the commit loop (`goldShiftAllocationId` null-check before processing). `pg-boss` retries failed jobs. `processImportCommit` is safe to call twice on the same `importId`. |
| Worker not running; operator commits and nothing happens | UI polls `status` every 2s. After 30s with no progress, show "Commit queued — worker may be offline. Contact support." Include a SUPERADMIN action to re-enqueue a stuck `COMMITTING` import. |
| `pg-boss` schema tables conflict with app migrations | `pg-boss` creates tables in the `pgboss` schema, not `public`. No conflict with Prisma-managed tables. |
| Import size grows beyond what the worker can handle in time | Worker timeout is configurable in `pg-boss`. Set `expireInSeconds: 600` (10 min). If 500-row imports take > 10 min, the row-processing logic needs optimization (batch inserts), not the queue architecture. |
| Transactional enqueue fails | If `boss.sendWithConnection` throws, the status update is also rolled back (same tx). The route returns a 500; the import stays in its prior state; the operator can retry. No partial state. |
| `NOTIFY`-based SSE is too chatty under load | Throttle `NOTIFY` to one per 10 rows, or skip SSE v1 and use simple polling on `GET /api/gold/imports/[id]`. SSE is a nice-to-have; polling is the safe fallback. |
