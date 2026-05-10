# Epic 13 — Operational Readiness MVP Memo

**Date:** 2026-05-10  
**Author:** Engineering (drafted by Claude Sonnet 4.6)  
**Status:** Decision pending sign-off  
**Blocking:** Epic 13 implementation tickets  

---

## Goal

Define the smallest Epic 13 that produces real operational value — a set of working signals and a practiced response, not a six-week initiative. The §15.2 sizing note estimates Epic 13 as size S (one sprint). This memo holds it to that estimate.

---

## 1. Three SLIs to wire first

From the eight SLIs in §12.6, three are chosen on the following criteria: (a) they are directly observable from existing data without new infrastructure; (b) a breach is immediately actionable by the on-call engineer; (c) they catch the highest-consequence failure modes running in production today.

### 1a. Import commit latency (p95 < 30s for ≤ 100 rows)

**Why first.** The commit handler is synchronous, 1083 lines long, and has no timeout guard. This is the most operationally visible failure mode — an operator sits watching a spinner, and there is currently no way to distinguish a 40-second commit from a timed-out one. Wiring latency measurement here gives the team an early-warning signal before the Epic 9a worker lands. It also establishes the measurement methodology for the post-worker SLO re-baselining.

**How to measure.** The commit route already uses `createRouteLogger` and emits structured JSON to stdout via `console.log`. On Vercel, stdout goes to log drains. The `createRouteLogger` / `createRequestLogger` pattern in `lib/logging.ts` already records `requestId` and timestamp. Add `ms` (elapsed milliseconds) to the final log line emitted at route exit. Log drain → Vercel Log Drain → Logtail / Axiom (both have free tiers and accept Vercel drain webhooks) → alerting on p95 > 30s over a 1-hour window.

**Breach action.** Alert fires → on-call checks `GoldLedgerImport.status` for imports in `COMMITTING` older than 30s → if stuck, follows §12.4.1 playbook. No new tooling needed beyond the log drain.

### 1b. Accounting integration backlog (< 10 PENDING events)

**Why second.** `AccountingIntegrationEvent` rows with `status = PENDING` represent money that has been recorded in the domain model but not yet posted to the GL. A backlog growing past 10 means the accounting retry job is not running or is failing silently. This directly affects financial reporting accuracy. The data is already in the DB and queryable. Checking it requires no new tables.

**How to measure.** A nightly cron (or a Vercel Cron Job running every 15 minutes) runs:
```sql
SELECT COUNT(*) FROM "AccountingIntegrationEvent" WHERE status = 'PENDING' OR status = 'FAILED';
```
If count > 10, emit a structured log line with `level: "alert"` and `sli: "accounting_backlog"`. The same log drain picks this up. Alternative: a lightweight `GET /api/internal/health/accounting-backlog` endpoint, called by an external uptime monitor (UptimeRobot free tier hits it every 5 minutes).

**Breach action.** Alert fires → on-call runs `POST /api/accounting/retry` → if FAILED rows remain, checks `errorMessage` per §12.4.4.

### 1c. FIFO double-link incidents (0 per day)

**Why third.** The FIFO advisory lock is not yet in place (P0.3 pending). Until it lands, a concurrent import commit can theoretically link the same `goldPourId` to two `BuyerReceipt` rows. This is a P0 data integrity failure (§12.4.3). The daily cron query from the runbook is:
```sql
SELECT "goldPourId", COUNT(*) FROM "BuyerReceipt"
WHERE "goldPourId" IS NOT NULL GROUP BY "goldPourId" HAVING COUNT(*) > 1;
```
This costs nothing to run and catches the pre-FIFO-fix double-spend before anyone notices it in finance reports.

**Breach action.** Alert fires → on-call treats as P0, escalates to Engineering Lead within 15 minutes per §12.7 matrix → follows §12.4.3 void-and-reconcile playbook.

**Three SLIs deferred (not in MVP):** Upload-to-parse latency (the parse path is fast and not the bottleneck today), import success rate (requires 30-day rolling window of committed imports — meaningful once volume is higher), lease contention (no UI telemetry is wired yet; monitoring it before the lock primitive ships produces noise). Hydration error rate deferred until Sentry or equivalent is integrated.

---

## 2. Single SLO to wire: import commit p95 < 30s for ≤ 100 rows

**Why this one.** It is the highest-visibility operator experience metric and the one most likely to catch a regression when Epic 9a ships the background worker. A p95 breach before the worker is a "route is dangerously slow" signal; a p95 breach after the worker is a "job queue is backed up" signal. Same SLO, different interpretation, both useful.

**Concrete implementation plan.**

1. **Instrument the commit route.** In `app/api/gold/imports/[id]/commit/route.ts`, at the very end of the `try` block before `return successResponse(...)`, emit:
   ```ts
   log.info("commit completed", {
     importId: id,
     rowsTotal: importRecord.rowsTotal,
     rowsCreated,
     rowsAnomaly,
     rowsFailed,
     durationMs: Date.now() - startMs,  // add `const startMs = Date.now()` at top of try block
   })
   ```
   The `createRequestLogger` in `lib/logging.ts` already accepts arbitrary fields — this is a one-line change to the existing log call pattern.

2. **Set up a Vercel Log Drain.** In the Vercel dashboard: Settings → Log Drains → Add → choose Axiom or Logtail (both have free tiers sufficient for this volume). The drain forwards all structured JSON logs from the Next.js function runtime.

3. **Create a p95 query in the log tool.** In Axiom or Logtail, filter on `event = "commit completed" AND rowsTotal <= 100`. Plot p95 of `durationMs` over a 1-hour rolling window. Set an alert threshold at 30000ms (30s).

4. **Wire the alert.** Alert → email to the on-call rotation DL. Once PagerDuty or equivalent is set up (§3 below), route to the duty engineer. Until then, email is sufficient.

5. **Establish the error budget.** One breach per 30-day window is allowed without requiring an escalation response. Two or more breaches require a post-incident review. Document this in the runbook (§12.6).

6. **Re-baseline after Epic 9a.** When the background worker ships, the SLO transitions: "commit submission p95 < 2s" (time to enqueue) + "job completion p95 < 60s for ≤ 100 rows" (worker execution time). Update the alert thresholds accordingly. The log drain and Axiom/Logtail setup remain; only the query and threshold change.

**No Sentry required for this SLO.** The existing structured logging is sufficient. Sentry integration is a good follow-on (Epic 12b's observability scope) but is not a prerequisite for this SLO.

---

## 3. On-call rotation skeleton

The initial rotation is **two engineers** from the Domain Backend workstream (§9.8), covering the Gold module and its seams with Accounting and HR. Each engineer is on duty for one week. Handoffs happen every Monday at 09:00 local time via a Slack message in the team channel that includes: (1) any open incidents, (2) any `AccountingIntegrationEvent` FAILED rows with pending investigation, (3) import volume for the week, (4) any SLO breaches and their resolution status.

**Page-out criteria.** An engineer is paged (email for now; PagerDuty once the account is set up) when any of the following fires:
- Import commit p95 > 30s (SLO §2 above).
- `AccountingIntegrationEvent` PENDING or FAILED count > 10 (SLI §1b above).
- FIFO double-link detected (SLI §1c above — treat as immediate P0 escalation, bypass the 1-hour grace window).
- `GoldLedgerImport.status = FAILED` fires `emitGoldImportFailedNotification` — this already exists in the commit route.

The on-call engineer does not need to fix the problem during the duty period; they need to triage, follow the §12.4 playbook, and escalate to the Engineering Lead if the issue is not resolved within the SLA window defined in §12.7.

---

## 4. First recovery drill: the partial commit (Scenario 1 from §12.8)

**Scenario.** "The May incident" — a production import with 487 rows, partial commit, 12 failed rows.

**Format.** 60-minute tabletop exercise. No production systems touched. Two participants minimum: one plays the on-call engineer, one plays the operator who initiated the import. A third person plays a witness/scribe.

**Setup (10 min).** Facilitator presents the scenario:  
"It is 14:30 on a Monday. An operator committed a 487-row ledger for Mine Alpha, January 2026. The UI showed 'Committing...' for 8 minutes, then the page refreshed and showed 475 rows CREATED, 12 rows FAILED. The operator sees the red 'N rows failed' banner. They Slack the on-call engineer."

**Step 1 — Initial triage (10 min).** On-call engineer walks through §12.4.1:
- Refresh the page. Status is still FAILED, not COMMITTED. 
- Check `GoldLedgerImport.status` in the DB — confirm FAILED.
- Run the recovery query: `SELECT status, COUNT(*) FROM "GoldLedgerEntry" WHERE "importId" = '<id>' GROUP BY status;`
- Expected result: 475 CREATED, 12 FAILED (or ANOMALY). Discuss: is there any row in PENDING? If yes, what does that mean?

**Step 2 — Row-level investigation (15 min).** Operator opens the import detail page. They filter to FAILED rows. Each failed row shows an `errorMessage`. Participants discuss: what are plausible error messages? Work through two examples:
- "Mapped shift group not found" → group was deleted after the import was mapped. Resolution: re-map the row to the correct current group, reset to PENDING, recommit.
- "Constraint violation on Attendance" → a manual attendance entry already existed for the same (siteId, date, shift, employeeId). Resolution: the FAILED row can be retried now that entry cleanup is scoped by `goldLedgerEntryId` (§1.4 fix). If the constraint still fires, investigate the conflicting attendance row; it may need to be deleted manually under SUPERADMIN supervision.

**Step 3 — Reset and recommit (10 min).** Operator clicks "Reset 12 failed" (resets to PENDING). On-call engineer confirms in the DB that those 12 rows now show PENDING and that the 475 CREATED rows are untouched. Operator clicks Commit again. Participants discuss: what is the idempotency guarantee? Why is it safe to re-run the commit?

**Step 4 — Post-resolution verification (10 min).** After the recommit, operator checks the commit-result card: total grams in + grams from sales should match the paper ledger. Walk through the variance check manually. Open `GoldException` list — how many exceptions should there be for this import? Are all 12 failed rows now CREATED or ANOMALY? Is ANOMALY acceptable? When would it not be?

**Step 5 — Debrief (15 min).** Scribe reads back the sequence of actions. The group answers:
- Was the §12.4.1 playbook complete, or did we need information it didn't cover?
- What would have been different if the operator had clicked Commit a second time before checking the DB?
- What monitoring would have alerted us before the operator reported the issue?
- What would we add to the runbook based on this drill?

**Output.** Scribe documents any runbook gaps and raises them as tickets against the Domain Backend team's backlog. Drill results are noted in the §14 changelog of the review doc with the date.

---

## 5. What is deferred

The following §12 items are explicitly out of Epic 13 MVP:

| Deferred item | Why it waits |
|---|---|
| Full PagerDuty / on-call tool setup | Requires budget approval and account provisioning. Email escalation works until volume demands it. |
| SLO dashboard with error budgets | Requires Axiom/Logtail to accumulate several weeks of data before the p95 baseline is meaningful. |
| Hydration error rate SLI (Sentry) | Sentry integration is Epic 12b scope. Wiring it here pulls a multi-day integration into a one-sprint epic. |
| Import success rate (30-day rolling average) | Meaningful only after the module has 30+ days of committed imports. Set up the query now; add the alert threshold in Epic 12b. |
| Lease contention monitoring | No UI telemetry infrastructure exists. Requires instrumentation work that belongs in Epic 12b. |
| Quarterly drill scheduling | The first drill is run manually per this doc. Recurring scheduling is a calendar item after the first run confirms the playbook is useful. |
| Recovery drills for scenarios 2–4 (disputed assay, lost shipment, double-sale) | Scenario 2 (disputed assay) requires `BuyerReceiptCorrection` to be shipped (Epic 7). Scenario 3 (lost shipment) requires `WRITE_OFF` inventory event type (Epic 9.0). Scenario 4 (double-sale) requires the FIFO lock to be in place (P0.3) before drilling it has meaning. Each drill is gated on its corresponding epic. |
| Variance report wiring | Part of Epic 10 (reconciliation). No automated variance alerting until the reports exist. |
| Period-close monitoring | Epic 9b scope. |
