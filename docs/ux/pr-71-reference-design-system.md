# PR #71 Reference Design System

## Purpose
This document reviews the current direction of PR #71 and defines the target design system for the admin overhaul based on the supplied references.

This spec intentionally preserves the platform UX playbook rules around one active table per view, unified controls, progressive disclosure, and preserved list context. Where the reference images conflict with the current defaults, this document defines the explicit override for the admin overhaul.

## Current Progress Review

### What is moving in the right direction
- The PR is simplifying the admin shell and making the sidebar less heavy.
- Base controls are being normalized around shared tokens instead of page-level styling.
- Mobile navigation drawer groundwork is in place for the admin shell.

### What is not there yet
- The new responsive table path is not adopted by admin pages yet.
- The current responsive table approach changes dense tables into cards, which is the opposite of the reference direction.
- The admin theme in the PR is cooler and more SaaS-generic than the warm, premium, quiet reference images.

### Confirmed implementation gaps
- `components/ui/responsive-data-table.tsx`
  The mobile search field and pagination buttons are visual only and do not update table state.
- `components/ui/responsive-data-table.tsx`
  The component bypasses the shared `DataTable` behavior instead of composing it, so sorting, filters, pagination state, row selection, and expansion behavior will drift.
- `components/ui/data-table-mobile.tsx`
  The card renderer maps visible cells by array index after filtering columns, which can desync labels and values when selection, expansion, or action columns are present.
- `components/admin-portal/pages/companies-page.tsx`
  The main admin table still uses `DataTable`, so the PR does not yet deliver the stated responsive table rollout.

## Visual Direction

### Brand feel
- Premium, quiet, and operational.
- Clean white working surfaces inside a soft neutral application frame.
- Very light borders, almost no shadows, and strong typography instead of decoration.
- Blue is reserved for commitment actions, focus, and filter/save moments.
- Red-pink is used sparingly for subscription urgency chips only.

### Reference interpretation
- The shell should feel like a desktop workspace, not a marketing dashboard.
- The sidebar should be understated and structural.
- Tables are the hero surface. Cards support the table, not the other way around.
- Detail work should happen in a right rail or filter popover, not in bulky page sections.

## Core Tokens

### Color
- `--app-frame-bg`: `#D9D6D1`
- `--surface-canvas`: `#F7F5F1`
- `--surface-base`: `#FFFFFF`
- `--surface-muted`: `#F5F4F1`
- `--surface-subtle`: `#FAF9F7`
- `--border-default`: `#E7E3DC`
- `--border-strong`: `#D9D3CA`
- `--text-strong`: `#151515`
- `--text-body`: `#2E2E2E`
- `--text-muted`: `#75716A`
- `--text-subtle`: `#9A948B`
- `--action-primary-bg`: `#1F80F0`
- `--action-primary-hover`: `#166FD4`
- `--action-primary-soft`: `#EAF3FF`
- `--status-urgent-bg`: `#FFF0F4`
- `--status-urgent-text`: `#D61F5C`

### Typography
- App font: `SS Huchu` for shell and navigation.
- Numeric font: `font-mono` with tabular figures for amounts, dates, and counts.
- Page title: `40/700`
- Section title: `18/600`
- Nav label: `14/500`
- Table header: `13/500`
- Table body: `15/500`
- Meta label: `12/500`

### Radius and elevation
- Outer app frame: `14px`
- Cards and tables: `12px`
- Inputs and buttons: `10px`
- Pills: `9999px`
- Default surfaces use borders only.
- Floating overlays use one soft shadow layer only.

## Shell System

### App frame
- Center the product shell inside a soft gray app background.
- Use a single white application window with a thin border and a restrained outer shadow.
- Split the shell into:
  - left navigation rail
  - main workspace
  - optional right detail rail

### Sidebar
- Default width: `248px` expanded, `56px` collapsed icon rail.
- Sidebar background should match the shell, not become a dark contrasting block.
- Top area contains workspace switcher only.
- Nav items are `40px` tall with `16px` icons and `14px` labels.
- Active nav uses a soft neutral fill, not a saturated brand fill.
- Badges should be compact, dark, and quiet.

### Top bar
- Keep the header thin and structural.
- Left side: workspace label or breadcrumbs.
- Right side: trial chip, operator control, and utility actions.
- Do not turn the header into a second toolbar.

## Control System

### Buttons
- Secondary is the default button style.
- Secondary buttons: white fill, subtle border, dark text.
- Primary buttons: solid blue, compact, used only for upload, save, create, and decisive actions.
- Button height: `36px`.
- Font weight: `600`.
- Avoid oversized shadows, gradients, and glowing focus states.

### Inputs and selects
- Height: `36px`.
- White surface with a very light neutral border.
- Focus uses blue border plus a faint outer ring.
- Placeholder text stays muted and low-contrast.
- Menu surfaces use the same white card treatment as the table overlays.

### Tabs and segmented controls
- Use compact segmented pills above the table.
- Active segment is white on a neutral track.
- Counts appear as tiny badges inside the active context, not as oversized chips.

## Table System

### Non-negotiable behavior
- Do not convert primary admin tables into mobile cards.
- Preserve a real table with shared headers, column alignment, scanability, and row relationships.
- On narrow screens, prefer horizontal scrolling, sticky first column, and compact controls over card conversion.

### Table container
- One bordered white surface.
- Full bleed inside the active content area.
- No extra padded card chrome around the table if the table is already the primary surface.
- Header band uses `--surface-muted`.

### Toolbar
- Single row only.
- Left: segmented table state tabs.
- Middle: filter trigger and active filter chips.
- Right: primary CTA such as `Upload`.
- Search, filters, and pagination must remain part of the same table system and preserve state.

### Header row
- Height: `44px`.
- Background: soft neutral.
- Text: muted, sentence case to match the reference images.
- Divider should be subtle and continuous across the width.

### Body rows
- Height: `52px`.
- White default background.
- Hover uses a very light neutral wash.
- First column gets the strongest type weight.
- Numeric cells are right-aligned and tabular.
- Drill-in rows end with a chevron, not a button-heavy action cluster.

### Nested and expandable rows
- Match the reference hierarchy table.
- Parent rows own the disclosure chevron.
- Expanded children sit on a soft tinted background with a left guide line.
- Keep indentation shallow and consistent.
- Delta or trend annotations sit inline, not in separate badges unless status is critical.

### Filters and overlays
- Use a split popover for advanced table filters:
  - left column for filter type list
  - right column for the active filter form
- Popovers should align to the trigger and feel like tools, not modal dialogs.

### Right rail detail pattern
- For transaction-style tables, opening a row should reveal or focus a right-hand detail rail.
- Rail width: `320-360px`.
- Rail includes record identity, editable fields, key dates, and the primary CTA.
- The table remains visible while the rail is open.

## UX Rules For This Overhaul
- The primary admin experience is desktop-first, dense, and financial.
- Rows must support quick scanning before interaction.
- Actions should appear where the decision is made:
  - filter changes in popovers
  - row-specific work in the right rail
  - structural navigation in the sidebar
- Preserve table state when opening and closing row details.
- Use cards only for metrics and summary blocks above the table.

## Implementation Guidance

### Keep from PR #71
- Mobile sidebar drawer behavior in the admin shell.
- Shared control token cleanup.
- Reduced nav heaviness and flatter component styling.

### Replace or redirect
- Replace the cool indigo admin theme with the warmer neutral frame above.
- Remove the card-based mobile table strategy for primary admin lists.
- Build the reference table as a `DataTable` presentation variant, not as a separate behavior stack.
- Make the right rail a first-class shell pattern for record detail workflows.

### Component targets
- `components/admin-portal/shell/admin-shell.tsx`
  Rework the shell into a framed workspace with optional right rail support.
- `components/admin-portal/shell/admin-sidebar.tsx`
  Move nav styling to the quieter reference treatment.
- `components/ui/data-table.tsx`
  Add the premium reference variant here.
- `components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/select.tsx`, `components/ui/tabs.tsx`
  Tune these to the compact premium control language instead of the generic SaaS look.

## Acceptance Criteria
- The admin shell visually reads as one framed workspace.
- Sidebar, header, buttons, and filters all share one calm neutral system.
- Primary tables remain tables at every breakpoint.
- Toolbar, filters, and pagination stay unified.
- Transaction/detail workflows use the right rail pattern from the references.
- Amounts, dates, and counts use mono/tabular treatment consistently.
