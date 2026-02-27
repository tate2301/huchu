# Risk Register and Guardrails (Expansion Packs)

## Normative References
1. Platform architecture source of truth: `docs/expansion-plan/platform-holy-grail.md`
2. UX enforcement source of truth: `docs/ux/platform-ux-playbook.md`

## Purpose
Track the highest expansion risks and define enforceable guardrails before production rollout.

## Risk Register
| ID | Risk | Impact | Likelihood | Guardrail | Owner | Stop-Ship Trigger |
| --- | --- | --- | --- | --- | --- | --- |
| R1 | Cross-tenant data leakage on new APIs | Critical | Medium | Mandatory `companyId` scoping + negative tenant tests for every endpoint | Backend lead | Any confirmed cross-tenant read/write |
| R2 | Missing feature-gate mapping for new pages/APIs | High | Medium | Add route mappings in `route-registry.ts`; CI review checklist includes ungated route scan | Platform lead | Any pack route reachable without entitlement |
| R3 | UX drift from playbook (table sprawl, split controls) | Medium | High | UX checklist and screenshot review against playbook | Product/UX | Any non-compliant primary page in release scope |
| R4 | Accounting integration events fail silently | High | Medium | Outbox/retry visibility and failed event alerting | Finance platform lead | Unbounded failed events with no retry path |
| R5 | Data model collisions or weak uniqueness constraints | High | Medium | Tenant-aware unique keys and migration review gate | Data lead | Duplicate business keys in UAT/QA |
| R6 | Performance regression on list/report APIs | Medium | Medium | Pagination defaults, indexed filters, load testing on hot endpoints | Backend lead | p95 latency above agreed threshold after tuning |
| R7 | Role/action mismatch exposes invalid workflow actions | Medium | Medium | Hide invalid actions by state and entitlement; action matrix review | Module lead | Users can execute invalid workflow state transition |
| R8 | Rollback plan missing for pack releases | High | Low | Feature-flag first rollout + explicit rollback owner/runbook | Release manager | No tested rollback path before go-live |

## Guardrails (Engineering)
1. No new model without `companyId` and tenant-safe indexes.
2. No new page/API without feature key + route mapping.
3. No direct journal writes from pack modules; use accounting integration events.
4. No multi-table stacked views; use vertical tabs where needed.
5. No release without documented data migration rollback.

## Guardrails (Delivery)
1. Every wave uses feature-flag rollout by pilot tenants first.
2. UAT sign-off required per pack before broad enablement.
3. Release notes must include:
- enabled features
- migration changes
- known limitations
- rollback instructions

## Monitoring and Escalation
Minimum monitors:
1. `/api/schools/*`, `/api/car-sales/*`, `/api/thrift/*` error rates.
2. Auth/forbidden trends for pack routes (detect gate drift).
3. Failed accounting integration event queue depth.

Escalation path:
1. Module owner triage (same day).
2. Platform lead decision on rollback/disable flag.
3. Stakeholder communication with incident summary and fix ETA.
