# Retail Vertical Redesign — Implementation Plan

**Date:** 2026-05-15 · **Branch base:** `main` (after `d0ae77a0f` merge of PR #110) · **Design brief:** `C:\Users\Atipamara\.claude\plans\i-want-you-to-encapsulated-rocket.md`

This document operationalizes the approved design brief into epics, tickets, sequencing, and DoD. The brief carries design intent; this carries execution.

---

## 1. Current State

- **Main is at `d0ae77a0f`** (PR #110 merged — POS + catalog redesign + `ddfb60d80` work all live).
- **Feature branch `feat/pos-terminal-redesign` is fully merged.** Cut new branches from `main` for each epic below.
- **Retail today:** POS portal + catalog redesigned. All other admin surfaces (dashboard, sales, customers, stock, purchasing, reports, setup, merchandising) untouched by the design-system pass.

---

## 2. Playbook Compliance Addendum

`docs/ux/platform-ux-playbook.md` is the canonical source and supersedes the brief where they conflict. Three corrections to the brief:

1. **Multi-table views use vertical tab rails, not horizontal Tabs.** The brief said "Sales list — real Tabs (posted / refunds / exceptions)". Correction: use the playbook's **left vertical tab rail** pattern. One table visible per active rail item. Same applies to any other surface with multiple tables (e.g., Stock per-location views).
2. **DataTable controls are a single unified row** — search+submit (left), filters (middle), rows-per-page + pagination (right). Same control height across all three groups. No detached toolbar, no separate filter card.
3. **Status vocabulary is fixed.** Use exactly: `Passing`, `Failing`, `Need changes`, `In review`, `In progress`, `Pending`, `Inactive`. Apply to shifts, POs, transfers, counts, promotions wherever the underlying state maps to workflow status. Domain-specific words like "Refunded", "Voided", "Exception" remain for sales because they're sale-state, not workflow-state.

Top-level retail module nav (Overview, Sales, Catalog, Stock, Purchasing, Reports + Setup gear) stays horizontal — the playbook's vertical-rail rule applies to **multi-table view contexts**, not module nav.

### 2.1 Iteration — Header Action Density & One-Thesis (brief §14)

Two enforcement rules carried in from brief §14, applied universally across every retail surface:

**Header Action Density Rule.** `RetailShell.actions` accepts **at most two visible buttons at any breakpoint**: one primary (filled) and zero or one secondary (outline), with an optional overflow kebab menu for everything beyond. Below `md`: primary only, secondary collapses into overflow.

Categorically banned from `actions`:
- **Sibling navigation.** Setup children currently render 4 cross-sibling links; pricing/promotions cross-link; stock count ↔ transfers cross-link. All of these move to the relevant shell's tab bar (module nav) or settings rail (Setup).
- **Filters.** They live in the DataTable controls row per playbook §59.
- **Breadcrumbs.** They live in `PageHeading`.
- **Bulk actions.** They live in the playbook's sticky bottom bulk-action bar per §127.
- **Cross-tab shortcuts.** "Open POS" is rendered ONCE in the shell (RET-C2), not on every page.

See brief §14.1 for the canonical per-surface allowed actions table. Every ticket in §4 conforms.

**One-Thesis-Per-Page Rule.** Every analytical page declares a single question and every KPI and chart on the page elaborates that question. Off-thesis stats migrate to the page that owns the question. Canonical theses listed in brief §14.2. Content migrations tracked in new Epic **RET-K** (§4).

---

## 3. Epic Map

Eleven epics, sequenced so each unblocks the next. Each epic is a PR-sized unit. Total scope: ~55 tickets.

| # | Epic | Outcome | Depends on |
|---|---|---|---|
| **RET-A** | Foundations — primitives + tabbed shell | Five shared primitives in `components/ui/`; new `RetailShell` mirrors `GoldShell`; shell-level POS pill | — |
| **RET-B** | IA migration — routes + redirects | Routes reorganized; old URLs preserved via redirects | RET-A |
| **RET-K** | Chart/KPI coherence migrations | Off-thesis content moves to the page that owns the question (tender mix, low-stock, customers KPIs, purchasing KPIs) | RET-A, RET-B |
| **RET-C** | Overview redesign | `/retail` stripped to profit thesis; uses new shell + primitives | RET-A, RET-B, RET-K1, RET-K2 |
| **RET-D** | Sales surfaces | List, detail, shifts, customers under `/retail/sales/*` | RET-A, RET-B, RET-K1, RET-K3 |
| **RET-E** | Catalog polish | Items mobile fixes, pricing + promotions routes moved | RET-A, RET-B |
| **RET-F** | Stock surfaces | Overview (with low-stock alerts moved in), count, transfers | RET-A, RET-B, RET-K2 |
| **RET-G** | Purchasing surfaces | Orders, receipts | RET-A, RET-B, RET-K4 |
| **RET-H** | Reports unified | Single `/retail/reports` with `FilterBar` | RET-A, RET-B |
| **RET-I** | Setup hub + Settings Shell | Readiness donut + 4 sub-routes with left rail (per playbook); strips sibling-nav from child headers | RET-A, RET-B |
| **RET-J** | POS orientation + admin pill | Top-bar `Workspace + Open admin` link in POS; sticky POS pill in `RetailShell.actions` (shell-level) | RET-A |

**Critical path:** RET-A → RET-B → RET-K (content migrations) → (RET-C..J in parallel).

**Header Action Density Rule** and **One-Thesis-Per-Page Rule** apply to every ticket: see §2.1.

---

## 4. Tickets

### Epic RET-A — Foundations

| ID | Title | Files | Acceptance |
|---|---|---|---|
| **RET-A1** | Create `components/ui/kpi-card.tsx` | new file | Renders flat KPI tile per brief §5. Props: `label`, `value` (ReactNode), `detail?`, `delta?: {value, negativeIsBetter?}`, `tone?: 'neutral'\|'success'\|'warning'\|'danger'`, `loading?`. Uses semantic tokens only. Has a `Skeleton` loading state. Storybook-style usage example in a comment. |
| **RET-A2** | Create `components/ui/stat-grid.tsx` | new file | Wrapper with `columns?: 2\|3\|4` (default 3), 8px gap, responsive: 1col below `md`, 2 below `xl`, full at `xl`. Children render flat — no card chrome. |
| **RET-A3** | Create `components/ui/section-frame.tsx` | new file | Flat section per brief §5. Props: `title`, `metric?: {label, value}` (right-aligned), `actions?`, `children`. Bottom-border separator under header per `app/retail/page.tsx:189` pattern. |
| **RET-A4** | Create `components/ui/big-number.tsx` | new file | Lift `components/retail/reports/report-big-number.tsx` verbatim; rename export to `BigNumber`. |
| **RET-A5** | Create `components/ui/filter-bar.tsx` | new file | Generalize `components/retail/reports/report-filter-bar.tsx`. Props: `fields: FilterField[]`, `value: FilterRule[]`, `onChange`, `onExport?`. Field config passed in, not hard-coded. Layout = playbook's unified controls row (search left, filters middle, pagination/export right). Same control height across groups. |
| **RET-A6** | Create `lib/retail/tab-config.ts` + `RETAIL_TABS` | new file | Mirror `lib/gold/tab-config.ts`. Export `RETAIL_TABS` array with `{ id, label, href, icon }` for Overview, Sales, Catalog, Stock, Purchasing, Reports. Setup is separate (gear icon, right-aligned). |
| **RET-A7** | Rewrite `components/retail/retail-shell.tsx` as tabbed shell | overwrite | Mirror `components/gold/gold-shell.tsx`: hydration gate via `useSyncExternalStore`, session-aware POS pill in actions slot, horizontal tab bar reading from `RETAIL_TABS`, Setup gear right-aligned. Drop-in replacement for existing `RetailShell({title, description?, actions?, children})` — accept same props plus `activeTab: RetailTab`. |
| **RET-A8** | Storybook-style smoke page for new shell + primitives | optional dev-only route | Renders the new shell + all 5 primitives with realistic data. Used for QA review before page migrations begin. Skip if no Storybook configured — fold into RET-C as the first real consumer. |

### Epic RET-B — IA Migration

| ID | Title | Files | Acceptance |
|---|---|---|---|
| **RET-B1** | Add redirects for moved routes | new 6-line `page.tsx` files at: `app/retail/customers`, `app/retail/cash-control`, `app/retail/merchandising/pricing`, `app/retail/merchandising/promotions`, `app/retail/insights` | Each is a `redirect()` server component pointing to the new path per brief §3. |
| **RET-B2** | Delete dead routes | rm `app/retail/sell`, `app/retail/buy`, `app/retail/merchandise`, `app/retail/merchandising/page.tsx`, `app/retail/purchasing/page.tsx` | After RET-B1 lands, these legacy redirects can be deleted because nothing points at them. Verify by `grep -rn` for the paths first. |
| **RET-B3** | Create new route shells | `app/retail/sales/shifts/page.tsx`, `app/retail/sales/customers/page.tsx`, `app/retail/catalog/pricing/page.tsx`, `app/retail/catalog/promotions/page.tsx` | Each new shell starts as a placeholder rendering the new `RetailShell` with the correct `activeTab`. Full content lands in the per-surface epics. |
| **RET-B4** | Wire `RETAIL_TABS` to active route detection | `components/retail/retail-shell.tsx` consumers | Every retail page passes the correct `activeTab` prop. Audit with `grep -rn "<RetailShell"` and confirm all 25+ pages updated. |

### Epic RET-C — Overview

**Thesis** (brief §14.2): *"Is the business profitable right now, and is the trend healthy?"* — profit-only page. Tender mix moves to Sales (RET-K1). Low-stock alerts move to Stock overview (RET-K2). "More" dropdown cross-tab links deleted (replaced by the shell tab bar). "Sell" action deleted (redundant with POS pill).

| ID | Title | Files | Acceptance |
|---|---|---|---|
| **RET-C1** | Migrate `app/retail/page.tsx` to new shell + primitives | `app/retail/page.tsx` | Replace inline `KpiCard` (line 149) with `<KpiCard>`. Replace inline `SectionCard` (line 176) with `<SectionFrame>`. Wrap KPIs in `<StatGrid columns={4}>`. Use `RetailShell activeTab="overview"`. Mobile: `xl:grid-cols-[1fr_340px]` so sidebar stacks below `xl`. **No `actions` passed** — the page is read-only per the brief §14.1 allowed-actions table; the POS pill is rendered by the shell, not by this page. |
| **RET-C2** | Add "Open POS" pill to `RetailShell` (once, shell-level) | `components/retail/retail-shell.tsx` + new `components/retail/open-pos-pill.tsx` | Pill rendered ONCE at shell level (not per-page) when `canAccessPosPortal(session.user.role)`. Sits to the right of the tab bar so it appears on every retail surface. Opens `/portal/pos` with `target="_blank"`. Hidden below `md`. Removes the per-page POS buttons in `app/retail/page.tsx:281`, `app/retail/sales/page.tsx:258`. |
| **RET-C3** | Verify dashboard color contrast | `app/retail/page.tsx:139` `DeltaPill` | Test `bg-emerald-50` / `text-emerald-700` and `bg-rose-50` / `text-rose-700` against WCAG AA. If fail at lower brightness, swap to `emerald-100`/`emerald-800` or use `StatusChip`. Document outcome in PR. |
| **RET-C4** | Strip Overview to profit thesis | `app/retail/page.tsx` (delete tender mix section, delete low-stock section, delete `More` dropdown, delete `Sell` button) | After RET-K1 and RET-K2 move the content elsewhere, the Overview body contains exactly: 4 profit KPIs (`StatGrid`), full-width revenue/profit trend chart, full-width cost bridge waterfall. Nothing else. Header has no actions; shell renders the POS pill. |

### Epic RET-D — Sales

**Thesis** (brief §14.2): Sales list = *"Where is revenue coming from?"*; Shifts = *"Are cash drawers reconciling?"*; Customers = *"How valuable is the customer base?"* — three sub-routes, each with its own coherent KPI set.

| ID | Title | Files | Acceptance |
|---|---|---|---|
| **RET-D1** | Sales list with vertical rail | `app/retail/sales/page.tsx` | Replace `VerticalDataViews` with playbook's **left vertical tab rail** (posted / refunds / exceptions). One DataTable per active rail item. Unified controls row (search left, filters middle, pagination right). Bulk actions: export, refund, void (in sticky bottom bulk bar per playbook §127, NOT in header). List→detail context preservation: store tab/search/filters/sort/pagination in URL params so detail back-nav restores state. **Header actions:** primary `"New sale"` (opens POS) only. Existing "Open POS" button at line 258 deleted — covered by shell pill (RET-C2). KPI row above rail: Revenue, Transactions, Avg ticket, Refund rate. Tender mix donut (moved here from Overview by RET-K1) renders below the table area. |
| **RET-D2** | Sales detail page | `app/retail/sales/[saleNo]/page.tsx` (new) | Uses `DetailShell` with sticky right panel `320-360px`. Left: line items table, totals breakdown, tenders. Right: customer mini, shift mini, audit log timeline via new `DetailSection` "Activity". **No header actions.** Footer actions: refund / void / print receipt — only valid next actions rendered (no disabled buttons). |
| **RET-D3** | Sales shifts page | `app/retail/sales/shifts/page.tsx` | Migrate content from `app/retail/cash-control/page.tsx` and `app/retail/shifts/page.tsx`. KPIs: Open shifts, Expected cash, Variance today, Closed-clean rate (in `StatGrid`). One DataTable of shifts. Detail = `Sheet` (size lg) with cash count entry, drawer reconciliation, close shift form via `FormShell` bare. **Header actions:** primary `"Open new shift"` only. Drop sibling `"Open POS"`, `"Cash control"` buttons currently in `app/retail/shifts/page.tsx:319-340`. Status vocab: `In progress`, `Pending`, `Failing` (variance), `Passing` (closed clean). |
| **RET-D4** | Sales customers page | `app/retail/sales/customers/page.tsx` | Migrate content from `app/retail/customers/page.tsx`. **Add missing primary action "Add customer"** (audit P0 finding). Re-frame KPIs to match thesis: Total customers, Active this month, Repeat rate, Avg LTV (drop "Top spend" hero — it's a chart, not a KPI; move to chart row below). One DataTable; mobile uses `MobileList`. Detail = `Sheet` (size md) with profile + loyalty timeline. Fix audit finding: `loyaltyDetailQuery` loading and error states must use components, not strings. **Header actions:** primary `"Add customer"`, overflow `Import` / `Export`. |
| **RET-D5** | Delete old `cash-control`, `shifts`, `customers` page bodies | leave only redirect files from RET-B1 | After D3, D4 land, the old paths are pure redirects. Also delete `app/retail/shifts/page.tsx` (the standalone shifts page) since it's now `/retail/sales/shifts`. |

### Epic RET-E — Catalog Polish

**Thesis** (brief §14.2): Catalog items = *"What am I selling, and is the catalog healthy?"*; Pricing = *"Are prices competitive and margins protected?"*; Promotions = *"Which promos are running, and which are working?"*

| ID | Title | Files | Acceptance |
|---|---|---|---|
| **RET-E1** | Convert outer catalog form `Dialog` → `Sheet` size lg | `app/retail/catalog/page.tsx:367` | Outer form moves to `Sheet`. Mobile-friendly. Inner quick-create stays as `Dialog` on `≥md` viewports; on `<md` it becomes a separate Sheet step (back button returns to outer form). |
| **RET-E2** | Mark required fields explicitly | `app/retail/catalog/page.tsx:390-427, 515-590` | `*` after label + `required` attr + `aria-required` on Stock item, Sell price, and Item name. Inline validation on blur. |
| **RET-E3** | Quick-create focus restoration | `app/retail/catalog/page.tsx:501-601` | After quick-create closes, focus returns to the "Stock item" select trigger. Use `useRef` on the select trigger and call `.focus()` in the quick-create `onSuccess` handler. |
| **RET-E4** | Catalog empty/loading states | `app/retail/catalog/page.tsx:363` | Replace `emptyState="Loading catalog..."` (string) with `<Empty>` component + `<Skeleton>` row grid. Same for the items table when query is errored. |
| **RET-E5** | Catalog items header conforms | `app/retail/catalog/page.tsx:323` | **Header actions:** primary `"New item"`, overflow `Import` / `Export`. Drop any sibling pricing/promotions links from header — those are tab-bar level (handled by Setup-like internal nav inside Catalog if needed, or simply by Catalog section being in the top-level tab bar). |
| **RET-E6** | Move pricing route | `app/retail/catalog/pricing/page.tsx` (new) | Migrate `app/retail/merchandising/pricing/page.tsx` content. Unified controls row. Inline-editable price cells via `NumericCell`. Bulk actions: `% increase`, `% decrease`, `Set absolute` (in sticky bottom bulk bar, NOT header). **Header actions:** primary `"Bulk update"`, overflow `Export`. Drop the `Catalog`/`Promotions` sibling links currently at line 161. |
| **RET-E7** | Move promotions route | `app/retail/catalog/promotions/page.tsx` (new) | Migrate `app/retail/merchandising/promotions/page.tsx`. Card list of promos using `SectionFrame` per item with status chip from canonical vocab (`In progress` = active, `Pending` = scheduled, `Inactive` = expired). Empty state with primary "Create your first promotion" CTA. **Header actions:** primary `"New promotion"` only. Drop the `Pricing` sibling link currently at line 165. |

### Epic RET-F — Stock

**Thesis** (brief §14.2): Stock overview = *"What do I have, and what's running out?"* — receives the Low-stock alerts list moved from Overview by RET-K2. Count and transfers each have their own thesis.

| ID | Title | Files | Acceptance |
|---|---|---|---|
| **RET-F1** | Stock overview | `app/retail/stock/page.tsx` | 4 KPI cards: Total units, Total value, Low-stock SKUs, Out-of-stock SKUs (in `StatGrid`). One DataTable of items with location stock columns. Unified controls row. Row click → item detail `Sheet` (size lg) with movement history. **Low-stock alerts list** (moved from Overview by RET-K2) renders as a `SectionFrame` below the table. **Header actions:** primary `"Adjust stock"`, overflow `Export`. Drop sibling `"Receive stock"` button at line 138 (it's nav, not action — surfaced via the Purchasing tab). |
| **RET-F2** | Stock count | `app/retail/stock/count/page.tsx` | Active counts list (top, compact). Click into count → mobile-first counting view: large `NumericCell`, barcode scanner button. Tablet-optimized; touch targets ≥44px. KPIs: Active counts, Overdue counts, Avg variance. **Header actions:** primary `"Start new count"` only. Drop sibling `"Stock transfers"` button at line 118 — sibling nav handled by parent Stock section. |
| **RET-F3** | Stock transfers | `app/retail/stock/transfers/page.tsx` | Transfers list one DataTable. Detail uses `DetailShell`: from/to `FactGrid`, line items table, dispatch + receive footer actions (only valid actions rendered). Status vocab: `Pending`, `In progress`, `Passing` (received clean), `Need changes` (discrepancy). KPIs: Open transfers, Arriving this week, Variance rate. **Header actions:** primary `"New transfer"` only. Drop sibling `"Stock count"` button at line 172. |

### Epic RET-G — Purchasing

**Thesis** (brief §14.2): Orders = *"What's on order, and is supply on track?"*; Receipts = *"Are POs arriving complete and on time?"*

| ID | Title | Files | Acceptance |
|---|---|---|---|
| **RET-G1** | Purchase orders list + detail | `app/retail/purchasing/orders/page.tsx`, new `app/retail/purchasing/orders/[id]/page.tsx` | List = one DataTable, unified controls row. Detail uses `DetailShell` (mirrors Gold dispatch detail). Status vocab: `Pending`, `In review`, `In progress`, `Passing` (received). **Header actions:** primary `"New PO"`, overflow `Export`. Drop sibling `Suppliers` link currently at line 217. Thesis-aligned KPIs (per RET-K4): Open POs, Total committed, Expected this week, Overdue. |
| **RET-G2** | Goods receipts | `app/retail/purchasing/receipts/page.tsx`, new `app/retail/purchasing/receipts/[id]/page.tsx` | List grouped by PO. Detail = `DetailShell` with line-by-line received-vs-expected `NumericCell` editing. Variance highlighting via status colors from playbook chart system. **Header actions:** primary `"Record receipt"` only. KPIs: Pending receipt, Received this week, Variance rate. |

### Epic RET-H — Reports

| ID | Title | Files | Acceptance |
|---|---|---|---|
| **RET-H1** | Migrate to shared primitives | `app/retail/reports/page.tsx` | Replace `ReportFilterBar` import with `FilterBar` from `components/ui/`. Replace `ReportChartShell` with `SectionFrame`. Replace `ReportBigNumber` with `BigNumber`. Field config moves to `lib/retail/report-filters.ts`. |
| **RET-H2** | Unify with Insights | delete `app/retail/insights/page.tsx` after RET-B1 redirect lands | Confirm no content in Insights is missing from Reports; if any chart only existed there, port it. |
| **RET-H3** | Delete `components/retail/reports/*` | rm 4 files | After RET-H1 ships and no imports remain. Audit by `grep -rn "components/retail/reports"`. |

### Epic RET-I — Setup

**Thesis** (brief §14.2): Setup hub = *"Is the workspace configured to operate?"* — readiness only, no operational stats. Setup children = forms only, no header actions (Save lives in `FormShell` action bar).

| ID | Title | Files | Acceptance |
|---|---|---|---|
| **RET-I1** | Setup hub readiness | `app/retail/setup/page.tsx`, new `lib/retail/setup-readiness.ts` | Hub renders readiness donut + 4 `SectionFrame` cards (Operations, Branding, POS Policy, Accounting) with completion state + "Configure" CTA. Readiness scoring lives in `lib/retail/setup-readiness.ts` as a pure function of the setup payload. **Header actions:** primary `"Continue setup"` (jumps to first incomplete section). Delete current `Operations` + sibling buttons at line 67 — those are the readiness cards, not header actions. |
| **RET-I2** | Setup children internal nav (Settings Shell) | `components/retail/setup-shell.tsx` (new) | Left settings rail with 4 items (per playbook Settings Shell). Each child page wraps with this shell so `/retail/setup/operations` shows it's part of Setup. Active item highlighted. **This is where the sibling navigation that's currently in every child's `actions` slot moves.** After this lands, RET-I3..I6 strip the `actions` block from each child. |
| **RET-I3** | Migrate `setup/operations` | `app/retail/setup/operations/page.tsx` | Use new Setup shell (left rail). Adopt `FormShell` + `SectionFrame`. Group fields per playbook ("Prefer grouped sections with clear headings over long unstructured forms"). **Delete the `actions` block at line 219** — sibling nav is now the rail. No header actions. |
| **RET-I4** | Migrate `setup/branding` | `app/retail/setup/branding/page.tsx` | Same pattern as I3. **Delete the `actions` block at line 93.** No header actions. |
| **RET-I5** | Migrate `setup/pos-policy` | `app/retail/setup/pos-policy/page.tsx` | Same pattern as I3. **Delete the `actions` block at line 166.** No header actions. |
| **RET-I6** | Migrate `setup/accounting` | `app/retail/setup/accounting/page.tsx` | Same pattern as I3. **Delete the `actions` block at line 109.** No header actions. Destructive actions (e.g., re-mapping live GL accounts) isolated at the end of a section with explicit confirmation per playbook. |

### Epic RET-J — POS Orientation

| ID | Title | Files | Acceptance |
|---|---|---|---|
| **RET-J1** | POS top-bar orientation strip | `components/retail/portal/pos-portal-layout-frame.tsx` | Thin top-bar element: `Workspace: {name}` + small "Open admin" link → `/retail` with `target="_blank"`. Respects `.pos-terminal` scope (uses POS tokens, not admin tokens). Minimal — does not compromise hardware aesthetic. |
| **RET-J2** | "Open POS" pill in retail shell | covered by RET-C2 | (No separate ticket — done as part of RET-C2.) |

### Epic RET-K — Chart/KPI Coherence Migrations (brief §14.2)

Off-thesis content moves from the page that doesn't own the question to the page that does. Each ticket is *content + state ownership move*, not a UI rewrite. Sequence: RET-K1, RET-K2 run BEFORE the cleanup ticket RET-C4 strips Overview, otherwise the content has nowhere to live.

| ID | Title | Files | Acceptance |
|---|---|---|---|
| **RET-K1** | Move tender mix from Overview to Sales list | `app/retail/page.tsx` (remove tender mix section), `app/retail/sales/page.tsx` (add tender mix `SectionFrame` below table area) | The tender mix donut + supporting copy currently rendered on Overview (queries `tenderMix` from `/api/v2/retail` payload) renders instead on Sales list. Sales list query is extended (or a sibling query added) to surface tender mix for the active filter window. Overview no longer fetches or renders tender mix. |
| **RET-K2** | Move low-stock alerts from Overview to Stock overview | `app/retail/page.tsx` (remove low-stock section sourced from `ownerMetrics.highlights`), `app/retail/stock/page.tsx` (add low-stock alerts `SectionFrame` below DataTable) | The low-stock alerts list currently rendered on Overview renders on Stock overview. Stock page extends its query or hits the relevant API to surface low-stock items. Overview no longer queries or renders them. Click-through goes from the alert row to the affected SKU's stock detail Sheet. |
| **RET-K3** | Re-frame Customers KPI set to thesis | `app/retail/sales/customers/page.tsx` (renamed from `app/retail/customers/page.tsx` per RET-D4) | Replace current KPI set (Named customers, Top spend hero, Loyalty balance) with thesis-aligned set: Total customers, Active this month, Repeat rate, Avg LTV. "Top spend" moves to a chart row below KPIs (it's a chart, not a KPI). Loyalty redemption flow detail moves to Reports drilldown. |
| **RET-K4** | Re-frame Purchasing Orders KPI set to thesis | `app/retail/purchasing/orders/page.tsx` | Replace inherited generic chart shells with purchasing-thesis KPIs: Open POs, Total committed, Expected this week, Overdue. Remove any revenue/sales-flavored metrics. Spend-by-supplier top-5 chart below the KPI row. |
| **RET-K5** | Strip Overview to profit-only | covered by RET-C4 | (No separate ticket — done as part of RET-C4 after RET-K1 and RET-K2 have moved content.) |

---

## 5. Definition of Done (per ticket)

A ticket merges when:

1. **Code:** Lints clean (`pnpm lint`), types clean (`npx tsc --noEmit`), production-builds (`pnpm build`).
2. **Playbook compliance:** Passes the 8-point checklist in `docs/ux/platform-ux-playbook.md:133`. Specifically: warm paper tokens used, one table per active view, vertical rail for multi-table contexts, unified DataTable controls row, no disabled invalid actions, canonical status vocab, chart system defaults, list→detail context preserved.
3. **Header Action Density (brief §14.1):** `actions` slot has ≤2 visible buttons at every breakpoint; no sibling nav, filters, breadcrumbs, or bulk actions in the slot; below `md` only the primary is visible.
4. **One-Thesis-Per-Page (brief §14.2):** Every KPI and chart on the page elaborates the page's stated thesis. Off-thesis content has been moved to the page that owns the question (or removed). The thesis is documented as a comment at the top of the page file.
5. **Brief alignment:** Surface conforms to its §6 + §14 entries in the design brief.
6. **Accessibility:** Tab traversal works, focus rings visible, color contrast verified at WCAG AA, no color-only state, required fields explicitly marked.
7. **Responsive:** Verified at 375px, 768px, 1024px, 1440px. Sales surfaces also at 1024px tablet portrait.
8. **State coverage:** Loading state (Skeleton), empty state (`<Empty>`), error state (`<Alert>`) all implemented as components, not strings.
9. **PR description:** Includes before/after screenshots for each affected screen, links the ticket ID and the brief section, calls out any header buttons removed and where they relocated to.

---

## 6. Sequencing

**Sprint 1 (foundations):**
- RET-A1 → A7 in order (each builds on the previous). A8 optional.
- RET-B1, B2 in parallel after A7.
- RET-B3, B4 after B1 and B2.

**Sprint 1.5 (content migrations — RET-K runs BEFORE surface redesigns):**
- RET-K1 (move tender mix Overview → Sales).
- RET-K2 (move low-stock Overview → Stock).
- RET-K3 (re-frame Customers KPIs).
- RET-K4 (re-frame Purchasing KPIs).

These have to land before RET-C, RET-D, RET-F, RET-G because those epics' tickets reference the moved content. Without RET-K first, the consumer pages have nowhere to render the migrated UI.

**Sprint 2 (parallel surface migrations):** After Sprint 1.5 lands, the following run in parallel.
- RET-C (Overview — stripped to profit thesis)
- RET-D (Sales — biggest epic, 5 tickets)
- RET-E (Catalog polish)
- RET-F (Stock — with relocated low-stock alerts)
- RET-G (Purchasing — with thesis-aligned KPIs)
- RET-H (Reports)
- RET-I (Setup — with Settings Shell)
- RET-J1 (POS orientation strip — independent)

**Sprint 3 (cleanup):**
- Delete `components/retail/reports/*` (RET-H3).
- Delete dead legacy routes (RET-B2 second pass).
- Phase 3 of primitive migration: opportunistic Gold module swap of `FrappeStatCard` → `KpiCard` (gold-frontend agent, gold-reviewer gate). Genuinely optional.

---

## 7. Agent Strategy

There's no `retail-frontend` charter zone today (the gold team agents own `app/gold/**` and `components/gold/**` — see `AGENTS.md:60-68`). Two options:

**Option A — Spawn general-purpose agents in worktrees per epic.** Each agent gets a self-contained prompt: this implementation doc + the brief + the playbook + the ticket scope. Reviewer is the human PR reviewer (no automated reviewer gate). **Recommended** because retail doesn't have the hard-rules constraints Gold has.

**Option B — Create a retail-frontend charter zone.** Mirror gold's pattern: add a `retail-frontend` agent definition under `.claude/agents/` with charter `app/retail/**` and `components/retail/**`, a `retail-reviewer` agent that runs typecheck/lint/build, a `retail-tech-lead` to orchestrate. Heavier setup; valuable if more than one redesign sprint of similar size is anticipated.

Pick Option A for this sprint unless the user wants to invest in the team infrastructure.

---

## 8. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Primitive APIs don't fit Gold's needs later | Medium | Phase 3 (Gold migration) is opportunistic and optional. If `KpiCard` doesn't fit a Gold case, `FrappeStatCard` stays. No forced consolidation. |
| Playbook rule conflict during implementation | Medium | Playbook wins (per its §3). If a brief direction conflicts, file an addendum to this doc and adjust the ticket. |
| URL breakage during IA migration | Low | Every moved route gets a redirect (RET-B1). Add the redirects BEFORE deleting old route bodies. |
| POS pill in admin actions distracts on small screens | Low | Hide the pill below `md` breakpoint; POS launcher remains accessible from the Overview page CTA. |
| New `RetailShell` breaks hydration like the gold one did (React #418) | Medium | Mirror `components/gold/gold-shell.tsx` exactly — including the `useSyncExternalStore` hydration gate (lines 27-49). |

---

## 9. Verification

Before declaring the redesign done:

1. `pnpm build` succeeds.
2. `pnpm lint` clean.
3. `npx tsc --noEmit` clean.
4. Manual smoke on every surface listed in §4 across 4 breakpoints.
5. Playbook compliance checklist (§5 step 2 above) green for every page.
6. Side-by-side aesthetic comparison: `/gold` vs `/retail` reads as the same product.
7. POS portal at `/portal/pos` opened from the admin pill in a new tab — orientation strip visible, "Open admin" link returns to `/retail` in a new tab.
8. All audit P0/P1 findings (brief §10 coverage map) verified resolved.

---

## 10. Out of Scope

(Same as brief §9): no schema changes, no API changes, no Gold behavioral changes beyond opportunistic Phase 3, no performance work, no offline/sync work, no brand/typography refresh.

---

## 11. Open Questions (carry-forward from brief §12)

1. POS orientation top-bar wording.
2. Setup readiness scoring config — author `lib/retail/setup-readiness.ts` from scratch (no precedent in repo).
3. Mobile POS phone support (tablet confirmed; phone TBD).
4. Phase 3 Gold migration — defer decision until after Sprint 2 ships.
