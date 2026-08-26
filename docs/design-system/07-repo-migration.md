# Repo migration map — `tate2301/huchu`

The DS primitives page says its 47 components "mirror the live `tate2301/huchu` UI primitives". The local
`components/ui/*` layer and the DS are **two implementations of the same intent**. Migration is
convergence, not adoption from zero.

> **Phase 1 is done — this table is now a record of what was decided, not a to-do list.**
> Every file under `components/ui/` is a shim over `@corelithzw/react@0.4.0`. Import paths did not
> change, so no call site under `app/` or `components/` was touched, and the Gold reviewer gate below
> was never triggered.
>
> The `✖ no DS equivalent` verdicts below were resolved by **building the component into the package**
> rather than keeping it local. `NavGroup`/`NavItem`, `Sidebar*`, `Separator`, `Collapsible`,
> `SectionTabs`, `ClientDate`, `Label` and `FloatingActionButton` now all exist as React exports. See
> the package CHANGELOG for the full 0.4.0 list.
>
> Still true, and still worth checking `dist/index.d.ts` before trusting: `Card` has no compound
> `.Header`/`.Title`/`.Body` slots (use `title`/`subtitle`/`footer`, or the local compound shim),
> `Button` uses `startIcon`/`endIcon`/`iconOnly` rather than `icon`, `Select` takes `<option>` children
> rather than an `options` array, and `AlertDialog` has no imperative `.confirm()` (see
> `components/ui/ds-confirm.tsx`).
>
> **Two standing decisions shape everything below.** `data-table.tsx` keeps `@tanstack/react-table`,
> and the overlays keep Radix / Base-UI for positioning, focus trap and scroll lock. Both adopt DS
> class names and tokens, so they *look* like the design system without changing behaviour. Do not
> "finish the job" by swapping those engines out without re-reading the trade-offs at the end of this
> file.

## Blast radius — measured, use it to sequence work

310 of 571 `.tsx` files under `app/` + `components/` import from `@/components/ui/`.

| Local component | Importing files | Sequence |
|---|---|---|
| `button` | 212 | **Last.** Highest risk; do it as one mechanical pass |
| `badge` | 142 | Late |
| `input` | 140 | Late |
| `select` | 111 | Late |
| `data-table` | 99 | Mid — needs a behavioural decision, see below |
| `dialog` | 64 | Mid |
| `skeleton` | 62 | Mid |
| `card` | 57 | Mid |
| `sheet` | 33 | Mid |
| `dropdown-menu` | 23 | Mid |
| `table` | 10 | Early |
| `sidebar` | 7 | Early |
| `popover` | 5 | Early |
| `dropdown/tabs/tooltip/status-dot/segmented-control/toast` | 1–2 each | **First.** Cheap, proves the pipeline |

Migrate a **leaf first** (`tabs`, `tooltip`, `status-dot`) end to end — token wiring, `"use client"`,
visual check — before touching anything above 50 files.

## Current UI dependency surface

The DS overlaps all of these. A migration that leaves the old package installed and imported hasn't
migrated anything — it has added a third UI system.

| Package | Version | Used by |
|---|---|---|
| `radix-ui` (unified) | ^1.4.3 | accordion, alert-dialog, avatar, button-group, collapsible, hover-card, item, menubar |
| `@radix-ui/react-*` (10 scoped) | — | checkbox, dialog, dropdown-menu, popover, select, separator, slot, tabs, toast, tooltip |
| `@base-ui/react` | ^1.1.0 | combobox, dialog |
| `@tanstack/react-table` | ^8.21.3 | data-table, data-table-column-header |
| `react-day-picker` | ^9.14.0 | calendar, date-picker |
| `cmdk` | ^1.1.1 | command |
| `input-otp` | ^1.4.2 | input-otp |
| `@rtcamp/frappe-ui-react` | ^1.1.0 | scanned via `@source` in `globals.css` |
| `@corelithzw/react` | ^0.3.0 | **the target** |

Both `radix-ui` and 10 scoped `@radix-ui/*` packages are installed — the same primitives reachable by two
import paths. Worth consolidating regardless of the DS work.

## Component mapping

`⇄` direct swap · `~` swap with behaviour change · `✎` keep local, restyle with tokens · `✖` no DS equivalent

| `components/ui/*` | Currently built on | DS target | |
|---|---|---|---|
| `button.tsx` | `@radix-ui/react-slot` | `Button` | `~` Local uses `asChild` (3 sites); DS has no Slot. Keep a local `asChild` shim. **Variant axes differ — see below** |
| `input.tsx` | native | `Input` | `⇄` DS adds `leadingIcon` / `trailingIcon` / `trailingSlot` |
| `input-group.tsx` | native | `Input` props | `~` Fold into `Input`'s icon/slot props — no separate component |
| `textarea.tsx` | native | `TextArea` | `⇄` |
| `select.tsx` | `@radix-ui/react-select` | `Select` | `~` **DS `Select` is a styled native `<select>`.** Loses Radix portal/scroll/groups. For rich pickers use `Combobox` or keep Radix |
| `searchable-select.tsx` | native | `Combobox` | `~` DS ships the body only — you supply the anchor |
| `combobox.tsx` | `@base-ui/react` | `Combobox` | `~` Same caveat |
| `checkbox.tsx` | `@radix-ui/react-checkbox` | `Checkbox` | `⇄` DS sets `indeterminate` via ref |
| `segmented-control.tsx` | native | `SegmentedControl<T>` | `⇄` |
| `input-otp.tsx` | `input-otp` | `InputOtp` | `⇄` Ref is `{focus()}`, not an element |
| `calendar.tsx` | `react-day-picker` | `Calendar` | `⇄` Local-time `Date` |
| `date-picker.tsx` | `react-day-picker` | `DatePicker` | `~` Single date only. Ranges → `useDateRange()` |
| `label.tsx` | native | `Field` / `Field.Label` | `~` `Field` owns `id` + `aria-describedby` wiring |
| `dialog.tsx` | `@base-ui/react/dialog` | `Modal` / `Dialog` | `~` DS has its own overlay stack — see the z-index warning below |
| `alert-dialog.tsx` | `radix-ui` | `AlertDialog` | `⇄` Gains async `onConfirm` + imperative `AlertDialog.confirm()` |
| `sheet.tsx` | `@radix-ui/react-dialog` | `Drawer` | `~` DS auto-collapses to a bottom sheet < 720px |
| `popover.tsx` | `@radix-ui/react-popover` | `Popover` | `~` **DS does not position** — no floating-ui. Keep Radix where anchoring matters |
| `hover-card.tsx` | `radix-ui` | `.hover-card` (CSS) | `✎` No React export. Prefer `Popover` |
| `dropdown-menu.tsx` | `@radix-ui/react-dropdown-menu` | `Menu` / `DropdownMenu` | `~` DS is menu **body** only; you own trigger + positioning. Keep Radix for anchored menus |
| `menubar.tsx` | `radix-ui` | — | `✖` Keep |
| `command.tsx` | `cmdk` | `CommandPalette` | `⇄` Returns `ReactPortal \| null` |
| `tabs.tsx` | `@radix-ui/react-tabs` | `Tabs` | `⇄` Full WAI-ARIA tablist. **Migrate first — only 2 files** |
| `table.tsx` | custom | `.table` (CSS) | `✎` |
| `data-table.tsx` | `@tanstack/react-table` | `DataTable<Row>` | `~` **Decide deliberately** — see below |
| `data-table-column-header.tsx` | `@tanstack/react-table` | `DataTable` `columns[].sortable` | `~` |
| `data-table-floating-actions.tsx` | custom | `DataToolbar` + `useOptimistic` | `~` Bulk-edit pattern |
| `numeric-cell.tsx` | custom | `.num` + `--type-mono` | `✎` No DS component; keep and restyle |
| `table-rail.tsx` | custom | — | `✖` Keep |
| `vertical-data-views.tsx` | custom | — | `✖` Keep |
| `badge.tsx` | custom | `Badge` | `⇄` Tones: neutral/info/success/warn/danger/outline. **Don't use `clay`** |
| `status-chip.tsx` | custom | `Badge` or `.chip` | `~` Enforce the canonical five status labels here |
| `status-dot.tsx` | custom | `.status-dot` + `.attention\|.ok\|.progress\|.idle\|.ring` | `✎` CSS-only |
| `avatar.tsx` | `radix-ui` | `Avatar` | `⇄` Groups use `.avatar-group` |
| `kbd.tsx` | custom | `Kbd` | `⇄` |
| `tooltip.tsx` | `@radix-ui/react-tooltip` | `Tooltip` | `~` DS `children` must be one focusable element. **Migrate early — 2 files** |
| `alert.tsx` | custom | `Alert` | `⇄` |
| `progress.tsx` | custom | `Progress` / `Meter` | `~` `Meter` for bounded gauges, `Progress` for tasks |
| `skeleton.tsx` | custom | `Skeleton` | `⇄` DS adds `lines` + `gap` |
| `empty.tsx` | custom | `EmptyState` | `⇄` `variant="inline"` for < 80px |
| `toast.tsx` / `toaster.tsx` / `use-toast.ts` | `@radix-ui/react-toast` | `ToastProvider` + `useToast` | `~` Mount provider once; delete the Radix stack |
| `card.tsx` | custom | `Card` + `.Header/.Title/.Body/.Footer` | `⇄` |
| `accordion.tsx` | `radix-ui` Accordion | `.accordion` > `<details>`/`<summary>` (CSS) | `✎` **No React export.** ⚠ Site docs the wrong class names — see `03-components.md` |
| `collapsible.tsx` | `radix-ui` | `<details>` | `✎` |
| `separator.tsx` | `@radix-ui/react-separator` | `.hr` | `✎` |
| `item.tsx` | `radix-ui` | `.list-item` (+ `.lead .title .sub .meta .chev`) | `✎` |
| `mobile-list.tsx` | `@radix-ui/react-slot` | `.list` / `.list-plain` + `RowCard` | `~` |
| `mobile-action-bar.tsx` | custom | — | `✖` **No DS CSS ships.** Keep, restyle with `--shadow-bar-bottom` |
| `scroll-container.tsx` | custom | — | `✖` No DS CSS. Keep |
| `page-section.tsx` | custom | — | `✖` No DS CSS. Keep, use `--type-section-title` |
| `export-menu.tsx` | custom | — | `✖` No DS CSS. Keep |
| `attachment-center.tsx` | custom | `.upload-zone` + `.file-row`/`.file-tile`; `FileUpload` for the drop zone | `~` `FileUpload` has no progress — add `useUpload()` |
| `button-group.tsx` | `radix-ui` | `.btn-split` | `✎` ⚠ There is no `.btn-group` |
| `split-button.tsx` | custom | `.btn-split` | `✎` |
| `sidebar.tsx` | `@radix-ui/react-slot` | `AppShell.Sidebar` + `NavGroup` + `NavItem` | `~` `NavItem` uses **`to`**, not `href` |
| `step-progress.tsx` / `workflow-step.tsx` | custom | `Stepper` + `Stepper.Step` | `⇄` `current` is **1-based** |
| `client-date.tsx` | custom | — | `✖` Keep. Apply the date format from `05-rules.md` |

### New capability the DS adds — no local equivalent

`Stack` · `Checklist` · `KanbanBoard` + `useKanban` · `Lightbox` + `useGallery` · `CommentsThread` +
`useComments` · `NotificationMatrix` + `usePreferences` · `I18nProvider` / `LocalePicker` / `useT` ·
`SaveBar` · `InlineEdit` · `RoleSwitcher` · `FilterChips` · `RowCard` · `StatCard` / `StatHero` · `DayList` ·
`Grabber` · `BottomSheet` · `BottomTabs` · `MobileShell` · `AuthShell` · `PageHeader` · `Pagination` ·
`Chart` · `useOptimistic` · `useUrlState` · `usePersistedFlag` · `useUpload` · `useInterval` ·
`useMatchMedia` · `useDateRange`

Reach for these on new work rather than hand-rolling.

### Button variant mapping — the axes differ

Local `button.tsx` puts everything on one `variant` axis. The DS splits it into `variant` (shape) ×
`tone` (semantics), and adds `loading` / `icon` / `iconRight` / `fullWidth`.

| Local `variant` | DS equivalent |
|---|---|
| `default` | `variant="primary"` |
| `secondary` | `variant="secondary"` |
| `outline` | `variant="secondary"` — DS has no separate outline; secondary already carries the border |
| `ghost` | `variant="ghost"` |
| `destructive` | `variant="primary" tone="danger"` |
| `link` | ✖ no DS variant. Use `.btn-link` (CSS) or an anchor with `--text-link` |
| `size` `default` / `sm` / `lg` | `size="md"` / `"sm"` / `"lg"` |
| `size` `icon` / `icon-sm` / `icon-lg` | ✖ no DS icon size. Pass `icon` with no children, or keep the local shim — **and keep `aria-label`** |

Local `destructive` currently renders `--status-error-bg` (a *tinted* background), while DS
`tone="danger"` is a **solid** `#B83A2A` fill. That is a visible change, not a like-for-like swap.
Also decide `--action-destructive-soft-bg` (warm grey) for serious-but-reversible actions —
see rule 6 in `05-rules.md`.

## Two decisions to make before bulk migration

### 1. `DataTable`: DS vs `@tanstack/react-table`

`DataTable` is **fully controlled and does not sort rows** — it renders sort affordances and calls
`onSortChange`; you own the comparator, pagination, and filtering. TanStack does that work for you.

99 files depend on the local `data-table`. Realistic split: keep TanStack for the heavy ERP grids
(gold batches, journals, imports) and use DS `DataTable` for simple lists. If you do migrate,
`DataTableSortState.column` is canonical — `columnId` is deprecated and slated for removal in v1.0.

### 2. Overlay ownership: DS stack vs Radix/Base-UI

The DS ships its own overlay stack — global Escape ordering, focus trap, focus return — at
**z-index 9998/9999**, well above this repo's Radix overlays. Mixing them means the DS overlay always wins.
Pick one owner per surface. Do not nest a Radix `Dialog` inside a DS `Modal`.

The DS `Popover` and `Menu` also have **no positioning engine** (no floating-ui). Radix keeps anchoring,
collision detection, and scroll locking. Keep Radix wherever a floating element must track an anchor;
use DS `Popover`/`Menu` only where you position it yourself.

## Route-group → vertical mapping

Fetch the matching vertical before restyling a route group — it is the intended target design for that
exact surface. `https://design.corelith.co.zw/verticals/<name>/index.html`

| Route | Vertical | Also see portal |
|---|---|---|
| `app/gold` | `gold` | `portals/gold/demo.html` |
| ~~`app/scrap-metal`~~ | `scrap` | *(dropped 2026-08, ST-2.3 — directory deleted)* |
| `app/accounting` | `accounting` | — |
| `app/human-resources`, `app/attendance` | `hr` | `portals/staff/demo.html` |
| `app/retail` | `retail` | `portals/pos/demo.html` |
| `app/stores` | `warehouses` | — |
| `app/management`, `app/reports` | `multisite` | `portals/owner/demo.html` |
| `app/maintenance` | `maintenance` | — |
| `app/compliance` | `compliance` | — |
| ~~`app/cctv`~~ | `cctv` | *(dropped 2026-08, ST-2.1 — directory deleted)* |
| ~~`app/car-sales`~~ | `auto` | *(dropped 2026-08, ST-2.2 — directory deleted)* |
| `app/schools` | `schools` | `portals/{parent,student,teacher}/demo.html` |
| `app/thrift` | `thrift` | — |
| `app/admin`, `app/user-management` | — | `portals/admin/demo.html` |
| `app/login` | — | `kits/signin.html`, `system/pg-signin.html` |
| `app/settings` | — | `kits/settings.html`, `system/x-settings.html` |
| `app/dashboard`, `app/home` | — | `system/pg-overview.html`, `kits/data-heavy.html` |
| `app/offline` | — | `system/x-offline-runtime.html` |
| `app/notifications` | — | `kits/notifications.html` |

## Gold module constraint

`CLAUDE.md` puts the Gold module under a structured rebuild: **Epic 0 and Epic 5a are the only active work,
and `gold-reviewer` must sign off before any Gold change merges to `main`.**

Do **not** fold design-system migration into Gold files (`app/gold/**`, `components/gold/**`) as
opportunistic drive-by work. Either land it as its own reviewed ticket, or wait for the rebuild to reach a
UI epic. Migrate non-Gold route groups first — they carry no reviewer gate and give the shared
`components/ui/*` layer a safe place to stabilise.

## Per-file procedure

1. Read the current file. Note every prop its call sites use.
2. Check `03-components.md` for the DS target and its implementation status.
3. Read the real props: `grep -A25 "interface <Name>Props" node_modules/@corelithzw/react/dist/index.d.ts`.
4. If a needed prop is missing, do **not** fork the DS component — wrap it locally in `components/ui/`,
   keeping the existing import path so call sites don't churn.
5. Add `"use client"` if the file lacks it.
6. Replace hard-coded values with tokens (`02-tokens.md`).
7. Update every call site. `grep -rl "components/ui/<name>\"" --include=*.tsx app components`.
8. Verify: `npx tsc --noEmit` then `npx eslint <files>`.
9. Walk the checklist in `05-rules.md`.
10. Remove the superseded dependency from `package.json` **only** once no file imports it.
