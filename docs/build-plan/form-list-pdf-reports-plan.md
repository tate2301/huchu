# Form/List Split + PDF Reliability + Unified Reports Implementation Plan

## Summary
1. Split all non-modal mixed pages into dedicated form routes (`/new`) and separate list/history routes (`/`).
2. Harden PDF export to avoid unsupported CSS color functions like `lab(...)` while preserving current `html2canvas + jspdf` stack.
3. Expand reports into a unified all-domain report center with shared filters and CSV/PDF export.

## Standards Locked
- Routing: `/new` for create forms, `/` for list/history.
- Post-submit: redirect to list with `createdId`, `source`, `createdAt` and row highlight.
- Modal exception: forms in `Dialog`/`Sheet` can remain colocated with tables.
- Reports UX: catalog + builder in one report center.
- Export formats: CSV + PDF for report outputs.

## Workstreams
### 1) Form/List Architecture Refactor
- Identify all pages with in-page form + table outside modal context.
- Move create/edit forms to dedicated routes and keep list/history pages focused on retrieval + actions.
- Keep list pages as the destination for post-submit confidence feedback.

### 2) PDF Export Hardening
- Add DOM clone + style sanitization in `lib/pdf.ts` to rewrite unsupported color functions to safe RGB/HEX before rendering.
- Add guarded error handling around all export buttons with user-facing fallback messaging.
- Keep CSV fallback available on reports.

### 3) Unified Reports Center
- Rework `app/reports/page.tsx` into a report catalog + builder.
- Add report definitions spanning operations, stores, gold, HR, compliance, maintenance, CCTV.
- Centralize filters and export pipeline while preserving query-string state.

## Acceptance Criteria
- Mixed non-modal form/list pages are split across separate routes.
- PDF export no longer fails with `unsupported color function \"lab\"`.
- Reports support multi-domain generation with CSV + PDF outputs.
- Saved-record redirects and row highlighting work after form submissions.

## Execution Order
1. Harden PDF exporter and update export handlers.
2. Split critical mixed pages first (`shift`, `plant`, `attendance`, `gold`).
3. Split remaining non-modal mixed pages.
4. Implement unified reports catalog + builder and domain definitions.
5. Run lint + manual smoke tests for each module.
