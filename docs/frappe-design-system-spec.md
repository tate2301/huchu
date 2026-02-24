# Frappe-Influenced Design System Specification for Huchu

## Document Status
- Owner: Platform UI
- Audience: Product, Design, Frontend Engineering
- Repository: `huchu`
- Last updated: February 24, 2026
- Scope: Canonical migration spec for moving this app toward a Frappe/ERPNext-influenced system using `@rtcamp/frappe-ui-react`, with Huchu brand overlays.

---

## 1. Purpose and Outcome

This document defines the full target design system for this application, inspired heavily by:
- Frappe Framework UX patterns
- ERPNext operational list-first workflows
- `frappe-ui` design language
- `@rtcamp/frappe-ui-react` component APIs and class conventions

The target outcome is:
1. Frappe-first visual and interaction behavior.
2. Adapter-first integration in this codebase to avoid breaking existing screens.
3. One coherent component and token system across legacy shadcn primitives and new Frappe components.
4. Brand-consistent results under Huchu’s `Executive Premium` identity.

---

## 2. Source Baseline

### Primary references
- `https://frappe.io/`
- `https://github.com/frappe/frappe-ui`
- `https://github.com/rtCamp/frappe-ui-react`
- `https://opensource.rtcamp.com/frappe-ui-react/?path=/docs/getting-started--docs`
- `https://ui.frappe.io/`
- `https://www.figma.com/community/file/1407648399328528443/espresso-by-frappe`

### Local constraints and standards
- `docs/ux/platform-ux-playbook.md`
- `docs/build-plan/brand-identity.md`
- Existing primitives under `components/ui/*`
- Existing token architecture in `app/globals.css`

---

## 3. Frappe Design System: Full Model

## 3.1 Design Philosophy

Frappe UI is optimized for high-frequency operational work:
1. Data density over decorative whitespace.
2. Fast scanability over ornamental hierarchy.
3. Explicit states and predictable controls.
4. Enterprise workflow continuity (list -> inspect -> act -> confirm).
5. Context-preserving actions (inline row actions, lightweight overlays).

### Practical implications
1. Lists/tables are primary surfaces, not secondary widgets.
2. “No surprises” interactions: row hover, selection, active row, batch actions.
3. Color semantics are restrained and meaning-driven.
4. Small, consistent control sizes.
5. Typography tuned for table readability first, marketing aesthetics second.

---

## 3.2 Token Architecture (Frappe)

Frappe uses a layered token model:
1. Raw scales (`gray`, `blue`, `green`, etc., generally `50..900`).
2. Semantic aliases:
- `ink-*` (text/foreground)
- `surface-*` (backgrounds)
- `outline-*` (borders/strokes)
3. Structural tokens:
- spacing
- radius
- shadow
- typography

### 3.2.1 Base color families
Full families typically include:
- `gray`
- `blue`
- `green`
- `red`
- `orange`
- `yellow`
- `teal`
- `violet`
- `cyan`
- `amber`
- `pink`
- `purple`
- `white-overlay`
- `black-overlay`

Dark mode also introduces dedicated dark families:
- `dark-gray`
- `dark-blue`
- `dark-green`
- `dark-red`
- `dark-amber`
- `dark-orange`
- `dark-yellow`
- `dark-teal`
- `dark-cyan`
- `dark-purple`
- `dark-pink`
- `dark-violet`

### 3.2.2 Semantic text tokens (`ink-*`)
Core semantic set includes:
- `ink-white`
- `ink-gray-1..9`
- `ink-red-1..4`
- `ink-green-1..3`
- `ink-amber-1..3`
- `ink-blue-1..3`
- `ink-cyan-1`
- `ink-pink-1`
- `ink-violet-1`
- `ink-blue-link`

### 3.2.3 Semantic surface tokens (`surface-*`)
Core semantic set includes:
- `surface-white`
- `surface-gray-1..7`
- `surface-red-1..7`
- `surface-green-1..3`
- `surface-amber-1..3`
- `surface-blue-1..3`
- `surface-orange-1..2`
- `surface-violet-1..2`
- `surface-purple-1..2`
- `surface-yellow-1`
- `surface-teal-1..2`
- `surface-cyan-1..2`
- `surface-pink-1..2`
- `surface-menu-bar`
- `surface-cards`
- `surface-modal`
- `surface-selected`

### 3.2.4 Semantic outline tokens (`outline-*`)
Core semantic set includes:
- `outline-white`
- `outline-gray-1..5`
- `outline-red-1..3`
- `outline-green-1..2`
- `outline-amber-1..2`
- `outline-blue-1`
- `outline-orange-1`
- `outline-gray-modals`

### 3.2.5 Typography tokens
Frappe includes compact display/body scales:
1. Heading-like:
- `text-2xs`, `xs`, `sm`, `base`, `lg`, `xl`, `2xl`, `3xl`
2. Paragraph-like:
- `text-p-2xs`, `p-xs`, `p-sm`, `p-base`, `p-lg`, `p-xl`, `p-2xl`, `p-3xl`
3. Each size has size + line-height + letter-spacing + weight pairing.

### 3.2.6 Spacing, radius, shadows
1. Spacing uses dense operational rhythm from micro (`px`, `0.5`) to large (`112`).
2. Radius scale typically includes:
- `none`, `sm`, `default`, `md`, `lg`, `xl`, `2xl`, `full`
3. Shadow scale includes:
- `sm`, `default`, `md`, `lg`, `xl`, `2xl`, `none`

---

## 3.3 Component Semantics and Variant Logic

Frappe UI React components follow:
1. Clear theme axes (often `gray|blue|green|red|orange`).
2. Variant axes (`solid|subtle|outline|ghost`).
3. Size axes (`sm|md|lg|xl|2xl` depending on component).
4. Predictable class contracts around `surface-*`, `ink-*`, `outline-*`.

This is critical for migration because class names in package internals assume these semantic token families exist.

---

## 4. Frappe UI React: Complete Usable Scope for This Repo

`@rtcamp/frappe-ui-react` provides a broad set. Current high-priority categories:
1. Core actions and form controls:
- `Button`, `Badge`, `TextInput`, `Textarea`, `Select`, `Combobox`, `Checkbox`, `Switch`
2. Structure and nav:
- `Sidebar`, `Tabs`, `Dialog`, `Popover`, `Dropdown`, `Card`, `Divider`
3. Data surfaces:
- `ListView` (+ `ListHeader`, `ListRow`, `ListGroup*`, `ListSelectBanner`, `ListFooter`)
4. System feedback:
- `Alert`, `Toast`, `ErrorMessage`, `LoadingIndicator`, `Spinner`
5. Utilities:
- `Typography`, icons, hooks

---

## 5. ListView Standard (Authoritative Table Pattern)

This section is the anchor for table/list migration.

## 5.1 Why ListView is primary
1. ERP-style work is row-centric and action-centric.
2. Current app has many operational tables across HR, accounting, management, gold, CCTV.
3. ListView maps naturally to one-table-per-view platform UX rules.

## 5.2 Data contract
`ListView` requires:
1. `columns: Array<{ label, key, width?, align?, getLabel?, getTooltip?, prefix? }>`
2. `rows: Row[]` or grouped rows `[{ group, rows: Row[] }]`
3. `rowKey: string`
4. `options: ListOptionsProps`

`options.options` supports:
1. `onRowClick`
2. `enableActive`
3. `rowHeight`
4. `selectable`
5. `showTooltip`
6. `resizeColumn`
7. `selectionText`

## 5.3 Built-in interaction model
1. Header checkbox for select-all.
2. Row checkbox selection.
3. Optional active row behavior.
4. Selection banner for batch actions.
5. Optional column resize handles.
6. Grouped list rendering.
7. Empty state with action affordance.

## 5.4 ListView behavior standards for Huchu
1. Preserve existing search-submit model from current DataTable toolbar.
2. Keep one visible primary table in active view.
3. For multi-context lists, continue using vertical rail patterns.
4. Numeric/time columns stay `font-mono tabular-nums`.
5. Keep server pagination/query state contracts from existing modules.

## 5.5 Migration target for existing `DataTable`
We do not remove existing `DataTable` immediately.

### Bridge strategy
1. Keep `DataTableQueryState` API stable.
2. Introduce a Frappe-style rendering mode via adapter.
3. Migrate feature screens progressively to adapter-backed list/table primitives.
4. Only deprecate old internals after module-by-module parity.

---

## 6. Huchu Brand Overlay on Top of Frappe

Brand goals from `Executive Premium` remain non-negotiable:
1. Trust and precision
2. Clarity for low-literacy contexts
3. Consistent semantic use of status/action colors

### 6.1 Typography overlay
1. Keep `SS Huchu` as primary family.
2. Retain Frappe scale rhythm and density.
3. Enforce semantic roles:
- `text-page-title`
- `text-section-title`
- `text-field-label`
- `text-field-help`
- `text-table-cell`

### 6.2 Color overlay
1. Frappe semantic names are mapped to Huchu semantic tokens.
2. No arbitrary hard-coded colors in feature code.
3. Saturated tones reserved for action/status.

### 6.3 Motion overlay
1. Enter/exit: 120ms–180ms
2. Focus/state transitions: 80ms–120ms
3. No decorative loop animations in operational surfaces.

---

## 7. Repository Implementation (Completed Foundation in This Change)

## 7.1 Package integration
Installed:
- `@rtcamp/frappe-ui-react@^1.1.0`

Updated:
- `package.json`
- `pnpm-lock.yaml`

## 7.2 Tailwind source integration
Added to global styles:
- `@source "../node_modules/@rtcamp/frappe-ui-react/dist";`

Purpose:
1. Ensure Tailwind generates utility classes referenced in Frappe package internals.
2. Avoid missing class output for Frappe components.

## 7.3 Semantic token bridge added in `app/globals.css`
Added Frappe-compatible semantic token aliases under `@theme inline`, including:
1. `--color-ink-*`
2. `--color-surface-*`
3. `--color-outline-*`
4. `--shadow-default`
5. `--radius-default`
6. `--text-2xs`

This lets package classes resolve using Huchu’s existing brand token backbone.

## 7.4 Adapter layer added
New adapter files:
1. `components/ui/frappe/button.tsx`
2. `components/ui/frappe/input.tsx`
3. `components/ui/frappe/badge.tsx`
4. `components/ui/frappe/list-view.tsx`
5. `components/ui/frappe/index.ts`

Adapter design intent:
1. Use Frappe components as source implementation.
2. Normalize API around Huchu naming and defaults.
3. Keep migration incremental and low-risk.

---

## 8. Component Coverage Matrix (Initial)

## 8.1 Use Frappe package via adapter (now)
1. Button -> `FrappeButtonAdapter`
2. Input -> `FrappeInputAdapter` (`TextInput` under the hood)
3. Badge -> `FrappeBadgeAdapter`
4. List/table surface -> `FrappeListViewAdapter`

## 8.2 Keep existing shadcn primitive for now (restyle progressively)
1. Dialog/Sheet
2. Dropdown menu
3. Command/Popover composition
4. Toast stack
5. Sidebar shell internals (until full nav migration batch)

## 8.3 Targeted restyle/customize components (where Frappe package gaps exist)
1. Current `DataTable` toolbar contract (search + submit + filters + pagination in one row)
2. `VerticalDataViews` (left rail, one active data panel)
3. `NumericCell` conventions and alignment policies
4. Parent-child expansion mechanics where package behavior differs from operational rules

---

## 9. Module Rollout Order

Recommended order:
1. Shared primitives and shell-level components.
2. HR and management master-data screens (high reuse, moderate risk).
3. Accounting tables (heavy list complexity).
4. Gold and exception workflows (state-heavy, high impact).
5. CCTV utility views (mix of cards and basic tables).

---

## 10. Quality and Acceptance Gates

## 10.1 Design gates
1. One primary table per active view.
2. Unified controls row for every operational table.
3. Numeric/time fields remain mono and tabular.
4. No feature-local arbitrary colors for status/action.

## 10.2 Interaction gates
1. Keyboard navigation works for table/list actions.
2. Focus styles remain visible and consistent.
3. Selection and batch actions remain explicit and reversible.

## 10.3 Engineering gates
1. New UI work should prefer adapter imports from `components/ui/frappe`.
2. Legacy component usage is allowed only where adapter parity is incomplete.
3. No reformat-only diffs.

---

## 11. Detailed Migration Tasks (Next Execution Batches)

## Batch A: Adapter adoption
1. Replace local imports in one pilot module (`management/master-data`) with adapter components.
2. Validate visual parity and UX playbook compliance.
3. Record class and token gaps.

## Batch B: DataTable/ListView convergence
1. Introduce a bridge mode in existing `DataTable` to render Frappe-style row and header patterns.
2. Preserve server query and pagination contracts.
3. Keep existing feature-level API stable.

## Batch C: Shell and navigation convergence
1. Align sidebar and tab surfaces to Frappe semantic classes and edge language.
2. Preserve role gating and route structure.

## Batch D: Final hardening
1. Dark-mode semantic review.
2. Accessibility pass (contrast/focus/keyboard).
3. Module-by-module visual consistency check.

---

## 12. Risks and Mitigations

## 12.1 Risk: Class/token mismatch
- Mitigation: semantic token bridge and `@source` path in global css.

## 12.2 Risk: Visual drift between old and new primitives
- Mitigation: adapter-first migration and explicit coverage matrix.

## 12.3 Risk: Over-aggressive global theme overrides
- Mitigation: map only required semantic aliases first, then expand deliberately.

## 12.4 Risk: Table behavior regressions
- Mitigation: ListView bridge via adapter before broad feature rewrites.

---

## 13. Implementation Notes for Developers

1. For new UI, prefer:
```ts
import { FrappeButtonAdapter, FrappeInputAdapter, FrappeBadgeAdapter } from "@/components/ui/frappe";
```

2. Keep existing shadcn imports in legacy screens unless actively migrating.

3. For list-heavy pages, pilot `FrappeListViewAdapter` with local data first, then connect server query state.

4. Respect the UX playbook even when Frappe examples differ:
- one table per view
- unified controls row
- full-bleed primary table

---

## 14. Canonical Mapping Snapshot (Frappe Semantics -> Huchu Semantics)

| Frappe semantic family | Mapped in Huchu to |
|---|---|
| `ink-gray-*` | `text-muted/body/strong` tiers |
| `ink-red/green/amber/blue-*` | `status-*` text and action colors |
| `surface-gray-*` | `surface-canvas/muted/soft/subtle/base` |
| `surface-*-*` status | `status-*` background and border palette |
| `outline-gray-*` | `edge-subtle/default/strong/focus` |
| `outline-*-*` status | `status-*` border/text semantic palette |
| `surface-menu-bar` | `surface-canvas` |
| `surface-cards` | `surface-raised` |
| `surface-modal` | `surface-base` |
| `surface-selected` | `table-row-selected-bg` |

---

## 15. Final Notes

This document is the system contract for the migration.

When conflicts occur, resolve precedence in this order:
1. Platform UX playbook constraints
2. Accessibility and semantic correctness
3. Frappe visual conventions
4. Local legacy implementation convenience

The design direction is intentionally strict: operational clarity first, decorative styling second.

