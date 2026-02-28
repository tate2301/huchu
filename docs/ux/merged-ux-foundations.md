# Merged UX Foundations (Design Tokens + Platform Playbook)

This document merges the warm paper design tokens/principles with the Platform UX Playbook. When guidance conflicts, **use the design tokens and principles from the provided design system as the source of truth**, then layer the UX playbook patterns on top.

## Sources and Conflict Policy
- **Preferred tokens/principles**: Warm Paper Design System (color, typography, spacing, radii, shadows, core component sizing).
- **Interaction and layout rules**: Platform UX Playbook (one table per view, progressive disclosure, controls row, vertical tabs, etc.).
- Apply tokens first; align structure and behaviors to the playbook.

## Canonical Design Tokens
- **Canvas and surfaces**: `#FCFCF4` canvas, `#FFFFFF` base, `#F7F7F2` muted; light border `#E6E6E0`.
- **Text**: strong/body `#111111`, muted `#6B6B6B`, subtle `#9A9A93`.
- **Actions**: primary `#4C64D4`, secondary `#EEF0FF`, destructive `#EC442C`.
- **Statuses**: passing `#2CA47C`, failing `#EC442C`, need-changes `#F46414`, in-review/info `#4C64D4`, in-progress `#FCB414`, pending/inactive `#9A9A93`.
- **Typography scale**: Inter; page title 32/700, section title 20/700, body 14/400, labels 13/600, table header 12/600 uppercase, table cell 14/500, caption 12/500.
- **Spacing**: 8px grid (4/8/12/16/20/24/32/40/48). Gutters: 24px sections/content, 12px table.
- **Radii**: small 6px, default 8px, card/popover 12px, xl 16px, pill 9999px. Buttons are 36px height with 10px radius per component spec.
- **Shadows**: Only for floating surfaces (popover: `0 12px 24px -12px rgba(17,17,17,0.18), 0 2px 6px rgba(17,17,17,0.06)`); primary tables rely on border, not heavy shadow.
- **Icon sizing**: use shared `--icon-size-*` tokens; keep optical alignment with adjacent text.

## Core Principles (Tokens + Playbook)
- **One-table focus**: One table per active view; multi-context pages use vertical tab rail with preserved state.
- **Full-bleed data surfaces**: Tables align to content edges; no card wrappers. Controls live in a single row (search+submit left, filters center, pagination/right-side controls right).
- **Numeric readability**: Use `font-mono` and right alignment for numeric/time columns.
- **Predictable hierarchy**: Three-tier heading scale; section titles clearer than tab labels. When under a tab rail, demote page title one level.
- **Progressive disclosure**: Expandable parent rows for parent-child workflows; lazy-load children; hide invalid actions instead of disabling.
- **Warm paper visual language**: Soft canvas, thin borders/shadows, no hover lifts on core data surfaces; status chips use dot+label with semantic colors.
- **Workflow discipline**: Render only valid next actions; lock approved/closed periods; payroll and posting flows remain period-driven and idempotent.
- **ERP-grade robustness**: Every action leaves an audit trail; destructive or irreversible actions require confirmation and reference to the underlying document/event. Permission checks run server-side in addition to UI gating.

## Layout and Component Contracts
- **Page anatomy**: Page header (title/description/actions) → section header (title/description/actions) → single primary surface.
- **Vertical tabs**: Context labels one level smaller than section headers; high contrast; no subtitles beneath labels.
- **Detail shells**: Detail pages pair main content with a 320–360px sticky right panel for CTAs/evidence/integrations.
- **DataTable**: Integrated controls row, optional expandable parent rows, search submit behavior by default.
- **VerticalDataViews**: Standard wrapper enforcing one-table-per-view with left rail.
- **Buttons/inputs**: Default 36px height; rounded to token radius; use primary/secondary/destructive tokens; keep icon-label spacing consistent.
- **Charts**: Dashed grid (4px dash/6px gap), semantic color mapping, minimal stroke weight, chart cards use 1px border and 12px radius.

## Forms, Validation, and Audit
- **Field governance**: Required fields clearly marked; inline validation with server round-trip on submit to prevent stale data or permission violations.
- **Draft vs submitted**: Support draft/save-as-you-go for complex forms; submission locks fields and triggers posting/approval flows.
- **Attachments and evidence**: Uniform attachment control with file type limits and virus scan hook; audit stamps (created by/on, last modified by/on, submitted by/on).
- **Multi-step flows**: Use progressive disclosure and section anchors rather than wizard steps; persist draft state between sessions where possible.
- **History**: Change logs per record with before/after values and actor, mirroring ERPNext audit trails.

## Data Integrity & Background Jobs
- **Idempotency**: API endpoints and posting actions accept idempotency keys; UI retries must not double-submit.
- **Background processing**: Long-running exports, bulk operations, or postings enqueue jobs with visible status and completion toasts; users can navigate away safely.
- **Concurrency**: Last-write-wins prevented via etags/version fields; conflicting edits surface a rebase prompt (reload with user’s edits preserved when possible).
- **Reconciliation**: Surfaces for failed sync/posting with replay controls; users see per-row status for imports/exports.

## Compliance Checklist (Merged)
1. Warm paper tokens applied (colors/typography/radii/shadows) with CSS variables—no hard-coded colors.
2. One primary table per view; multi-table contexts use vertical tabs with unified controls row.
3. Full-bleed tables; controls aligned in a single row; numeric columns are mono and right-aligned where appropriate.
4. Heading hierarchy follows the canonical scale; tab rail contexts remain subordinate to section titles.
5. Actions reflect valid workflow states only; progressive disclosure via expandable parent rows or modals/sheets.
6. Layouts respect section/content gutters and card/popover radii; charts follow dashed-grid theme and semantic colors.
7. Icon sizing follows shared tokens; visual language remains soft (light borders, thin shadows, no hover lifts).
8. Forms carry draft/submit states, inline + server validation, and attachment/audit stamps; background jobs and idempotency prevent double work.
