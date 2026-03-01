# Design System Migration Checklist

## Canonical Source
Use `docs/ux/platform-ux-playbook.md` as the sole normative source during migration.

## Scope
- Phase 1: Foundation tokens, shared primitives, shell patterns, and benchmark list/detail/settings pages.
- Mode: Light-first migration with dark-mode follow-up.

## Foundation
- [x] Semantic warm-paper tokens are available in global styles.
- [x] Control density and table rhythm align to playbook spacing guidance.
- [x] Radius and shadow usage align to playbook elevation guidance.

## Shared Primitives
- [ ] Button, Input, Select, Badge, Card, and Alert align to canonical token usage.
- [ ] Table and DataTable align to one-table-per-view and unified controls row standards.
- [ ] Dialog and Sheet align to requirement context and workflow confirmation patterns.

## Shell Patterns
- [ ] List shell matches canonical structure.
- [ ] Detail shell uses right panel pattern where workflow context is needed.
- [ ] Settings shell follows single-active-panel pattern.

## Workflow and Status
- [ ] Invalid actions are hidden (not disabled) and requirement context appears where useful.
- [ ] Canonical statuses are used exactly: Passing, Failing, Need changes, In review, In progress, Pending, Inactive.
- [ ] `Ignored` is used only as a chart rendering variant.

## Charts
- [ ] Dashed grid and muted labels are applied.
- [ ] Status color mapping follows the canonical set.
- [ ] Hatch pattern is used for ignored data.

## Context and Bulk Actions
- [ ] List to detail navigation preserves tab, search, filter, sort, pagination, and return context.
- [ ] Bulk action bar appears on selection with count, valid actions, and clear selection.

## Validation
- [ ] Run `pnpm lint`.
- [ ] Manual smoke test of affected desktop and mobile screens.