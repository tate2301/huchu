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
   - Include source document type + version in posting metadata; validate referential integrity before posting.
2. **Observability**
   - Metrics: enqueue/processing lag, success/fail counts by module, DLQ depth, retry attempts.
   - Structured logs with trace/span and source references.
   - Alerts on DLQ growth, lag thresholds, repeated retries.
   - Business dashboards: postings per module/day, imbalance count, tax/COGS variance, reconciliation pass rate.
3. **Retry & DLQ Policy**
   - Uniform exponential backoff with cap; max attempts before DLQ.
   - DLQ review workflow with reprocess/ignore actions and audit trail.
   - Auto-suppress known permanent failures with classification (schema mismatch, permission denied, missing config).
4. **Schema & Rule Management**
   - Version posting rules; include rule version on entries.
   - Contract tests for tax/COGS/fee paths; dry-run mode for new rules.
   - Migration playbook for rule changes with side-by-side simulation and compare report.
5. **Reconciliation**
   - Daily job to reconcile source vs. ledger (counts and totals) per module.
   - Variance report with drill-down and export; annotate resolutions.
   - Closing checklist per period (rebuild trial balance, aging checks, inventory/COGS parity, tax payable vs return).
6. **Access Controls**
   - Lock direct journal edits for posting-managed accounts; require approval for exceptions.
   - Audit trail for manual adjustments linked back to source or ticket.
   - Segregation of duties: separate permissions for configure rules, post journals, and override approvals.

## Acceptance Criteria
- Source-key schema enforced per module; duplicate submissions rejected and logged.
- Posting metrics and alerts live for lag, DLQ depth, and retry churn; dashboards per module exist.
- DLQ workflow enables triage and replay/ignore with audit entries.
- Posting rules carry explicit versions; dry-run available for new/changed rules.
- Reconciliation job highlights variances with exports; resolutions tracked with timestamps and owner.
- Manual journal edits to posting-managed accounts require approval; segregation of duties enforced for rule changes and overrides.
