# Platform UX Playbook

## Purpose
This playbook defines the default UX system for the platform, starting with HR and Compliance.
It is optimized for low cognitive load, fast operations, and a clean Stripe-like visual style.

## Mandatory Principles

1. Show one table per view.
2. Use progressive disclosure for workflows and details.
3. Hide invalid actions instead of disabling them.
4. Keep structure predictable across modules.
5. Use clear standalone section titles, never numbered "Step 1/2/3" labels.

## Page Anatomy

1. Page header:
- Tier 1 title (largest and boldest heading).
- Optional single-line description.
- Optional global actions on the right.

2. Section header:
- Tier 2 title.
- Optional short description.
- Section-local actions.

3. Content:
- Single primary data surface per section.
- Avoid stacking multiple unrelated data tables in the same viewport.

## Multi-Table Contexts

When a page has multiple data contexts:

1. Use a left vertical tab rail.
2. Show exactly one table in the active panel.
3. Preserve search/filter/pagination state per tab.
4. Vertical rail headings are context labels and must render one level smaller than section headings.
5. Vertical rail headings and tab labels must be high contrast.
6. Do not use subtitles under the vertical rail heading.

## Table and Data Rules

1. Full-bleed data tables:
- Do not wrap primary tables inside cards.
- Tables align to page content edges.

2. Controls row (single row):
- Left: search input + explicit submit button.
- Middle: filters.
- Right: rows-per-page + pagination controls.
- All controls must share height.
- Filters belong in the same DataTable controls row, not in a separate card above the table.

3. Numeric readability:
- Numeric columns must use `font-mono`.
- Includes money, rates, quantities, IDs, counts, and timestamps.
- Numeric columns should be right-aligned unless context requires otherwise.

4. Embedded parent-child rows:
- For parent-child workflows, keep users in one table by using expandable parent rows.
- Expanded child data may be fetched lazily on first expand and cached for quick revisit.
- Child rows should be grouped by workflow stage when statuses represent stages (for example `Pending` vs `Archived`).
- Use single-open-row expansion by default on operational tables to minimize scan noise.

## Typography Hierarchy

Use strict 3-tier heading scale:

1. Tier 1: page title.
2. Tier 2: section title.
3. Tier 3: labels/subsection headings.

Do not introduce one-off heading sizes.

Tabbed-shell override:

1. When a page already sits under a visible tab rail, reduce page title prominence by one level.
2. Keep section titles stronger than context labels (rail labels, micro-headings, helper blocks).

## Icon System

1. Use shared icon sizing tokens globally (`--icon-size-*`) instead of per-screen ad-hoc sizes.
2. Keep icons optically aligned with text baseline; avoid vertical drift between labels and action icons.
3. In dense navigation surfaces (sidebar, dropdowns), use compact icon sizing and consistent left padding rhythm.
4. In buttons and actionable controls, keep icon + label spacing consistent and avoid one-off overrides.

## Workflow UX Rules

1. Render only valid next actions for a row state.
2. Once submitted/approved/paid, remove stale create/edit/submit controls.
3. Collapse or hide workflow steps without prerequisites.
4. Use modal/sheet for details, edits, and approvals context.
5. Payroll run generation is period-driven: user selects a period, then confirms generation in a modal.
6. Approved/closed periods are locked for run generation.
7. Payroll screens should default to:
- `Periods` table.
- `Pending Runs` table.
- Optional `Archived Runs` table.

## Visual Style (Stripe-Clean)

1. Use a soft near-white app canvas.
2. Use thin sharp shadows as boundary language.
3. Avoid visible hard borders on primary interactive surfaces.
4. Avoid hover lift transforms on core data surfaces.

## Component Contracts

1. `DataTable`:
- Single integrated controls row.
- Search submit behavior by default.
- Optional expandable parent rows with lazy child content rendering.

2. `VerticalDataViews`:
- Standard one-table-per-view container with left rail tabs.

3. `NumericCell`:
- Standard wrapper for mono numeric content.

## Compliance Checklist

A page is compliant when:

1. One table is visible per active view.
2. Multi-table pages use vertical tabs.
3. Controls row is unified and aligned.
4. Primary table is full-bleed.
5. Numeric columns are mono.
6. Heading hierarchy follows 3 tiers.
7. Invalid workflow actions are hidden.
8. Visual system uses thin-shadow boundaries.
