# Posting Engine Housekeeping Plan

## Issues to Address
- **Idempotency drift**: inconsistent source keys across modules causing duplicate postings.
- **Monitoring gaps**: limited visibility into lag, dead-letter volume, and reconciliation status.
- **Schema/version coupling**: posting rule changes risk breaking in-flight events.
- **Retry policy variance**: uneven backoff/limits across producers and consumers.
- **Reconciliation**: missing automated checks between source documents and ledger results.
- **Access discipline**: ad-hoc journal edits bypass posting rules.

## Plan
1. **Idempotency Standardization**
   - Enforce source key schema per module (sales, payments, inventory, payroll, school fees).
   - Reject duplicate keys at ingestion; add key to journal metadata.
2. **Observability**
   - Metrics: enqueue/processing lag, success/fail counts by module, DLQ depth, retry attempts.
   - Structured logs with trace/span and source references.
   - Alerts on DLQ growth, lag thresholds, repeated retries.
3. **Retry & DLQ Policy**
   - Uniform exponential backoff with cap; max attempts before DLQ.
   - DLQ review workflow with reprocess/ignore actions and audit trail.
4. **Schema & Rule Management**
   - Version posting rules; include rule version on entries.
   - Contract tests for tax/COGS/fee paths; dry-run mode for new rules.
5. **Reconciliation**
   - Daily job to reconcile source vs. ledger (counts and totals) per module.
   - Variance report with drill-down and export; annotate resolutions.
6. **Access Controls**
   - Lock direct journal edits for posting-managed accounts; require approval for exceptions.
   - Audit trail for manual adjustments linked back to source or ticket.

## Acceptance Criteria
- Source-key schema enforced per module; duplicate submissions rejected and logged.
- Posting metrics and alerts live for lag, DLQ depth, and retry churn; dashboards per module exist.
- DLQ workflow enables triage and replay/ignore with audit entries.
- Posting rules carry explicit versions; dry-run available for new/changed rules.
- Reconciliation job highlights variances with exports; resolutions tracked.
- Manual journal edits to posting-managed accounts require elevated approval and audit notes.
