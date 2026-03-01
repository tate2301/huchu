# Merged UX Foundations (Reference)

## Canonical Source
The canonical UX and UI source of truth is:
- `docs/ux/platform-ux-playbook.md`

This file is a bridge summary for migration context. It is non-canonical.

## What This Document Keeps
- A compact map between token implementation work and playbook requirements.
- A reminder that layout and interaction rules must come from the playbook.
- A shared checklist language for cross-team migration discussions.

## Token and Pattern Alignment Summary
- Warm paper token system, typography scale, spacing rhythm, radius, and shadow usage are defined in the playbook.
- One-table-per-view, vertical tabs, and unified DataTable controls row are defined in the playbook.
- Workflow rule for hiding invalid actions and requirement context pattern are defined in the playbook.
- Canonical status vocabulary and chart defaults (including hatch for `Ignored`) are defined in the playbook.

## Migration Validation Prompts
Use these prompts during implementation reviews:
1. Does this screen follow the canonical shell pattern for list, detail-right-panel, or settings?
2. Is only one table visible per active view?
3. Is the controls row unified and aligned?
4. Are invalid actions hidden and requirement context shown when needed?
5. Are statuses and chart rendering aligned to canonical vocabulary and mapping?
6. Is list-to-detail context preserved and bulk action behavior compliant?