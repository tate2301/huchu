# UX Excellence + Brand Identity Plan (Low-Literacy First)

## Summary
- Objective: make the app intuitive for low computer-literacy users while establishing a strong, consistent brand and premium visual quality.
- Strategy: ship in phases, starting with high-frequency operational workflows, then scale design and interaction standards across all modules.
- Chosen defaults:
- Brand direction: `Executive Premium`
- Rollout: `Critical Journeys First`
- Copy style: `Plain English + Hints`

## Phase 1: UX/Brand Foundation (Design System Hardening)
- Create a formal UI contract in docs:
- `docs/build-plan/ux-foundation.md` with principles, tone, spacing, states, and interaction rules.
- Add a brand spec:
- `docs/build-plan/brand-identity.md` including logo usage, color roles, typography scale, icon rules, elevation, and motion rules.
- Upgrade tokens in `app/globals.css`:
- Introduce semantic token tiers: `--surface-*`, `--text-*`, `--action-*`, `--status-*`, `--focus-*`.
- Define light/dark parity and chart palette mapping with contrast targets.
- Standardize typography:
- Keep existing custom family but define explicit size/line-height/weight scale and usage map for page title, section title, field label, helper, and table text.
- Add reusable primitives:
- `components/shared/page-intro.tsx` (title + purpose + "what to do next")
- `components/shared/status-state.tsx` (loading/empty/error/success variants)
- `components/shared/field-help.tsx` (helper and validation text pattern)
- `components/shared/primary-action-bar.tsx` (sticky mobile action area)

## Phase 2: Interaction Consistency Contract (Forms + Tables)
- Implement universal form shell pattern:
- New wrapper component for sectioned forms with persistent submit bar, "required field" hint, save feedback, and error summary.
- Standardize field behavior:
- Labels always visible, helper text where errors are common, input masks for phone/currency/date, inline validation before submit.
- Standardize table/list behavior:
- One shared table wrapper with consistent filters, sticky header, row highlight, empty state CTA, and detail drawer action.
- Unify submit result contract:
- Keep and enforce `?createdId=&source=&createdAt=` for all create/update routes.
- Always show `RecordSavedBanner` and scroll/focus to highlighted row.
- Make copy action-first:
- Replace abstract labels with verbs and context, for example `Submit Report`, `Log Incident`, `Record Receipt`.

## Phase 3: Critical Journey UX Refactor (First Ship)
- Refactor highest-frequency workflows first:
- `app/shift-report/page.tsx`
- `app/attendance/page.tsx`
- `app/plant-report/page.tsx`
- `app/stores/issue/page.tsx`
- `app/stores/receive/page.tsx`
- `app/gold/components/pour-form.tsx`
- `app/gold/components/dispatch-form.tsx`
- `app/gold/components/receipt-form.tsx`
- For each flow, enforce:
- Step clarity ("1. Select site", "2. Enter output", "3. Submit")
- Reduced cognitive load (group related fields, progressive disclosure)
- Strong completion feedback (banner + highlight + optional "View saved record" action)
- Safe error recovery (retain inputs, show exact fix guidance)
- Mobile first:
- 44px+ touch targets, sticky submit bar, compact but readable cards, and no hidden critical actions.

## Phase 4: Navigation + Information Architecture Cleanup
- Simplify global navigation language in `lib/navigation.ts`:
- Use plain, task-based labels (what users do, not system jargon).
- Add "Today's Work" quick actions block in shell:
- Top shortcuts to the 5 most used actions by role.
- Improve orientation:
- Breadcrumbs + page intro should always state where user is and what success looks like on that page.
- Role-aware decluttering:
- Hide low-value links/actions for clerks where not needed.

## Phase 5: Accessibility + Confidence Features
- Accessibility hardening:
- Keyboard/focus consistency, color contrast audit, visible error associations (`aria-describedby`, `aria-invalid`), and screen reader labels.
- Confidence helpers for low-literacy users:
- Inline examples in placeholders/help.
- Confirmation prompts only for destructive/high-risk actions.
- Optional guided mode toggle:
- "Show help tips" per user preference (persisted).
- Add non-blocking contextual help:
- One-line "Need help?" prompts linking to module-specific quick tips.

## Phase 6: Brand Polish + Final QA
- Visual polish pass:
- Consistent icon sizing, spacing rhythm, card hierarchy, elevation, and motion timing.
- State completeness audit:
- Every page must show polished loading, empty, error, and success states.
- Cross-module consistency sweep:
- Ensure identical control behavior for filters, modals, banners, and action buttons.
- Final UX acceptance review with pilot users:
- Observe 5-8 real tasks end-to-end and record completion time + failure points.

## Important API / Interface / Type Changes
- UI contracts:
- Add `types/ux.ts` with shared interfaces for list state, saved-result metadata, and form-section schema.
- API result consistency:
- Ensure create/update endpoints used by critical journeys return `{ id, createdAt }` at minimum.
- URL/state contract:
- Standardize query params across modules: `createdId`, `source`, `createdAt`, and optional contextual filters.
- Shared component interfaces:
- `StatusStateProps`, `FormShellProps`, `DataListShellProps`, `PrimaryActionBarProps`.
- No schema migration required for this UX plan unless a later phase adds user-level preference persistence in DB.

## Test Cases and Scenarios
- Core usability scenarios:
- Clerk completes each critical form in under target time without assistance.
- User can always find the saved item in one step after submit.
- Error handling scenarios:
- Missing required fields show inline guidance and prevent submit.
- API failure preserves entered data and gives actionable error text.
- Navigation scenarios:
- User can navigate to key daily tasks in <=2 taps/clicks from shell.
- Accessibility scenarios:
- Full keyboard completion for one form and one table flow.
- Focus order and visible focus ring on all interactive controls.
- Visual regression scenarios:
- Confirm token consistency and component parity across at least 8 representative pages.
- Technical checks:
- `pnpm lint`
- targeted manual smoke tests per module after each phase
- screenshot baseline comparison for changed pages.

## Rollout Plan
- PR1: Foundation tokens + brand docs + shared state components.
- PR2: Form/table consistency components + submit-result contract enforcement.
- PR3: Critical journey refactor batch A (`shift`, `attendance`, `plant`).
- PR4: Critical journey refactor batch B (`stores`, `gold`).
- PR5: Navigation/IA cleanup + accessibility hardening.
- PR6: Visual polish + pilot feedback fixes.

## Assumptions and Defaults
- Users are primarily clerks/supervisors with low digital confidence and mobile-heavy usage.
- English remains primary UI language for now; copy is plain and hint-driven.
- Existing component stack (Tailwind + current UI primitives) is retained, not replaced.
- Existing `RecordSavedBanner` pattern remains the basis for post-submit confidence.
- Performance target is perceived speed and clarity first, then visual enhancements.

## Addendum: Out of Scope for This Phase (But Required for Full Production Maturity)

### 1. Training, Adoption, and Change Management
- Role-specific onboarding guides (clerk, supervisor, manager).
- In-app walkthroughs and "first 7 days" guided checklist.
- Printable one-page SOPs per module.
- Support workflow: issue triage SLA, escalation path, release-note summaries for users.

### 2. Localization and Language Support
- Bilingual UI framework (labels/messages/help text) with translation files.
- Locale-aware formatting for date/time/number/currency.
- Content QA workflow for translated UX copy.

### 3. Advanced Analytics and Decision Support
- KPI definitions and governance (single source of truth for metrics).
- Manager dashboards with benchmark targets and trend alerts.
- Export/report scheduler (email/WhatsApp delivery automation).

### 4. Offline Reliability and Sync Robustness
- Conflict-resolution strategy for concurrent/offline edits.
- Durable offline queue observability and retry diagnostics.
- Sync health dashboard for admins.

### 5. Security and Compliance Hardening
- Full audit policy review and retention controls.
- Stronger auth options (MFA policy, session controls, device trust).
- Data protection controls: PII minimization, encryption-at-rest validation, backup restore drills.
- Formal compliance mapping (regulatory obligations to system controls).

### 6. Performance and Scalability Engineering
- Performance budgets and page-level SLOs.
- Query/index optimization pass across heavy tables.
- Pagination/virtualization standards for high-volume records.
- Background jobs for long-running exports/reconciliations.

### 7. Quality Engineering and Release Governance
- Automated end-to-end tests for critical journeys.
- Visual regression testing in CI.
- Release ring strategy (pilot -> staged -> full rollout).
- Observability stack: frontend error tracking, API latency/error dashboards, alerting thresholds.

### 8. Master Data and Governance
- Data stewardship model for sites, employees, inventory masters.
- Duplicate detection/merge workflows.
- Historical correction governance and approval workflows beyond current additive corrections.

### 9. Integrations and Ecosystem
- ERP/accounting integration roadmap (if needed).
- Biometric/time-clock integration for attendance integrity.
- Document storage lifecycle (versioning, expiry reminders, archival policy).

### 10. Product Operating Model
- UX telemetry plan (drop-off, time-to-complete, error hotspots).
- Quarterly UX review cadence with field interviews.
- Prioritization framework linking UX debt to operational risk/cost.
