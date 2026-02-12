# HR Module Capability Roadmap

## Purpose
This roadmap captures the next capability layers to build on top of the consolidated HR workflow foundation (employees, compensation, payroll, disbursements, incidents, and gold payouts).

## Workflow Hardening Extensions
- Add SLA timers and breach alerts for every `SUBMITTED` workflow entity.
- Introduce escalation policies (auto-assign manager backup approver after timeout).
- Add immutable workflow timeline cards in each HR screen (actor, action, timestamp, note).
- Require structured rejection reasons from controlled categories plus free text.

## Compensation Intelligence
- Add template impact simulation before publish (who will be affected and estimated payroll delta).
- Add versioned compensation rule sets with rollback.
- Add effective-date collision detection with guided resolution UI.
- Add currency normalization with optional per-site conversion source.

## Payroll and Disbursement Controls
- Add pre-close reconciliation checklist per run (missing profiles, unapproved adjustments, outlier nets).
- Add cash custodian dual-acknowledgement step for disbursement payment.
- Add disbursement variance analytics (planned vs paid vs outstanding).
- Add maker/checker separation reports for audit exports.

## Gold Payout Integration
- Add direct deep-link context handoff from payout allocation to gold payroll run builder.
- Add worker payout readiness scorecard (allocation approval, run status, disbursement status).
- Add overdue payout breach alerts by allocation and site.
- Add reconciliation widget for gold owed vs salary owed per employee.

## Employee Lifecycle
- Add onboarding checklist with required document tracking and expiry reminders.
- Add transfer and termination workflows with approval and effective-date validation.
- Add skill/role matrix for workforce planning and site shift staffing.
- Add attendance anomaly detection feeding HR incidents automatically.

## Reporting and Governance
- Add HR control dashboard (approval cycle times, rejection rates, unresolved incidents).
- Add audit export packs per month (workflows, approvals, disbursements, exceptions).
- Add role-based data access audit logs (view/download history for sensitive HR records).
- Add policy compliance scorecards at company and site levels.

