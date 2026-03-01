# Frappe Design System Integration Spec (Non-Canonical)

## Status
- Owner: Platform UI
- Audience: Product, Design, Frontend Engineering
- Scope: Integration strategy for Frappe-inspired components in this repository
- Canonical UX and UI policy: `docs/ux/platform-ux-playbook.md`

## Precedence
This document does not define final UX rules.
When guidance here differs from the playbook, follow the playbook.

## Purpose
Define how Frappe-style primitives and adapters should be integrated without breaking existing feature workflows.

## Integration Principles
1. Adapter-first migration: keep feature APIs stable while swapping internals.
2. Token compatibility: map Frappe semantics to platform semantic variables.
3. Behavior parity: preserve query state, pagination, selection, and bulk actions.
4. Incremental rollout: migrate module by module with clear acceptance checks.

## Required Playbook Alignment During Integration
- One table per active view and vertical tabs for multi-context pages.
- Unified DataTable controls row (search+submit, filters, pagination in one row).
- Canonical status vocabulary only.
- Workflow validity rule: hide invalid actions; use requirement context pattern when useful.
- Chart defaults: dashed grid, muted labels, canonical status mapping, hatch for ignored.
- List to detail context preservation and canonical bulk action bar behavior.

## Adapter Coverage (Current Target)
- Buttons, inputs, badges, and list surfaces through adapter exports.
- Keep non-migrated legacy primitives until parity is complete.
- Avoid feature-level hard-coded colors or one-off spacing values.

## Rollout Order
1. Shared primitives and shell-level components.
2. HR and management list-heavy screens.
3. Accounting and workflow-heavy modules.
4. Remaining modules and hardening pass.

## Acceptance Gates
1. Playbook compliance passes for each migrated screen.
2. No regressions in keyboard navigation, focus visibility, or selection behavior.
3. Query state and workflow transitions remain stable.
4. No reformat-only diffs in migration changes.

## Developer Note
For all new UI work, treat this file as integration guidance and the playbook as policy.