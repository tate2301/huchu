# Design System Migration Checklist

## Scope
- Phase 1: Foundation tokens + shared primitives + shell + HR benchmark pages.
- Mode: Light-first migration with dark-mode follow-up.

## Foundation
- [x] Refresh semantic color and surface tokens in `app/globals.css`.
- [x] Add density tokens for controls and table rhythm.
- [x] Tune elevation and edge tokens for reference-inspired polish.

## Shared Primitives
- [x] Restyle `Button` variants and control heights.
- [x] Restyle `Input` and `Select` surface treatment.
- [x] Restyle `Badge`, `Card`, and `Alert` components.
- [x] Refine `Table` and `DataTable` visual hierarchy.
- [x] Refine `Dialog` and `Sheet` modal composition.
- [x] Refresh dropdown and tab surfaces.

## Shell
- [x] Update sidebar visual language and spacing.
- [x] Update top navbar surface and rhythm.
- [x] Update page heading typography hierarchy.

## HR Benchmark
- [x] Update HR shell horizontal tab treatment.
- [x] Upgrade employee table row styling and numeric readability.
- [x] Keep workflows intact for table + modal actions.

## Validation
- [ ] Run `pnpm lint`.
- [ ] Manual smoke test on HR pages (desktop + mobile).
- [ ] Follow-up dark mode parity pass.
