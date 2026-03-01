# Warm Paper Design System (Companion Reference)

## Canonical Source
All normative UX and UI rules live in:
- `docs/ux/platform-ux-playbook.md`

If this document conflicts with the playbook, follow the playbook.

## Purpose of This Document
This file is an implementation companion for teams working on tokens and component styling.
It summarizes token intent and migration usage, but does not define independent UX policy.

## Token Snapshot (Aligned to Playbook)
- Warm paper canvas and surfaces (`--surface-canvas`, `--surface-base`, `--surface-muted`)
- Text tiers (`--text-strong`, `--text-body`, `--text-muted`, `--text-subtle`)
- Action colors (`--action-primary-bg`, `--action-secondary-bg`, `--action-destructive-bg`)
- 8px spacing rhythm with `24px` content and section gutters
- Radius scale `6/8/12/16/9999`
- Minimal shadow model for floating overlays only

## Implementation Notes
- Prefer semantic CSS variables over hard-coded colors.
- Keep controls and table rhythm aligned with playbook shell and DataTable standards.
- Use canonical status labels from the playbook.
- Treat `Ignored` as chart rendering only, never as a workflow status.

## Migration Quick Checks
- Replace direct hex values with semantic tokens.
- Keep numeric and time values in `font-mono`.
- Verify chart defaults (dashed grid, muted labels, status mapping, hatch for ignored).
- Validate list to detail context preservation and bulk action bar behavior.