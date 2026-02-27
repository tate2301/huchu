# QA, UAT, and Release Checklists (Expansion Packs)

## Normative References
1. Platform architecture source of truth: `docs/expansion-plan/platform-holy-grail.md`
2. UX enforcement source of truth: `docs/ux/platform-ux-playbook.md`

## Purpose
Provide hard gates for shipping `Schools`, `Car Sales`, and `Thrift` packs safely.

## 1. Build and Pre-QA Gate
- [ ] Schema changes reviewed for tenant key + constraints.
- [ ] `pnpm lint` passes.
- [ ] `pnpm build` passes.
- [ ] Feature keys added to `FEATURE_CATALOG`.
- [ ] Page/API route mappings added to `route-registry.ts`.
- [ ] Navigation entries are entitlement-aware.

## 2. QA Functional Gate (Per Pack)
### Common
- [ ] CRUD endpoints enforce `companyId` tenancy.
- [ ] Forbidden behavior validated for unentitled tenants.
- [ ] Pagination, filter, and search behavior works in DataTable controls row.
- [ ] Numeric cells are mono and right-aligned where applicable.

### Schools
- [ ] Student number uniqueness enforced per company.
- [ ] Attendance uniqueness per student/date enforced.
- [ ] Invoice/payment arithmetic and balance integrity validated.

### Car Sales
- [ ] VIN and stock number uniqueness enforced per company.
- [ ] Vehicle state lifecycle guards enforced.
- [ ] Deal totals and payment balances are accurate.

### Thrift
- [ ] Bale and lot references stay traceable.
- [ ] Negative stock prevented on lot depletion.
- [ ] Sale margin calculations are deterministic.

## 3. QA Integration Gate
- [ ] Accounting integration events emitted for financial actions.
- [ ] Retry/failure handling validated for event posting.
- [ ] Reports match source transaction totals.
- [ ] Existing modules unaffected (targeted smoke on HR, Stores, Accounting, Reports).

## 4. UX Compliance Gate (Playbook)
- [ ] One table visible per active view.
- [ ] Multi-table contexts implemented with vertical tabs.
- [ ] Search + submit + filters + pagination are in one controls row.
- [ ] Invalid row actions are hidden (not just disabled).
- [ ] Heading hierarchy follows page/section/label tiers.

## 5. UAT Gate (Business Sign-Off)
- [ ] Top 5 workflows per pack executed by business users.
- [ ] Data exports/reports reviewed and accepted.
- [ ] Error states/messages understandable and actionable.
- [ ] Role-based action visibility accepted by operations owners.
- [ ] Stakeholder sign-off captured in release note.

## 6. Release Gate
- [ ] Rollout plan identifies pilot tenants and schedule.
- [ ] Feature flags default off for non-pilot tenants.
- [ ] Monitoring dashboards and alerts ready.
- [ ] Rollback procedure tested (disable bundle + verify access removal).
- [ ] Support runbook updated with known issues and first-response steps.

## 7. Post-Release Gate (First 7 Days)
- [ ] Daily check of API error rates and latency.
- [ ] Daily review of failed integration events.
- [ ] Confirm no tenant-isolation incident.
- [ ] Capture defects and assign fix owners with ETA.
- [ ] Decide widen rollout or hold based on stability review.
