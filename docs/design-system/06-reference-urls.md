# Worked examples — fetch on demand

Base: `https://design.corelith.co.zw/`

This file is an **index, not content.** Every entry is a live page with copy-pasteable code. Fetch the one
page you need; never bulk-fetch. When a fetched page contradicts `index.d.ts` or `styles.css`,
**the package wins** — see `README.md`.

## URL patterns

| Layer | Pattern |
|---|---|
| Primitive | `system/p-<name>.html` |
| Block | `system/b-<name>.html` |
| Pattern | `system/x-<name>.html` |
| Page template | `system/pg-<name>.html` |
| Foundation | `system/<colors\|typography\|spacing\|elevation\|motion\|iconography\|accessibility\|voice\|content\|tokens\|principles>.html` |
| Guide | `system/guide-<name>.html` |
| Cookbook recipe | `cookbook/<slug>.html` |
| Chart recipe | `cookbook/charts/<slug>.html` |
| Kit | `kits/<name>.html` |
| Portal prototype | `portals/<name>/demo.html` |
| Vertical | `verticals/<name>/index.html` |
| Shared module | `shared/<stock\|hr\|maintenance\|settings\|notifications>/index.html` (the `cctv` module reference was dropped 2026-08-24 with the module) |

Also: `sitemap.html` (every page), `playground/index.html`, `system/changelog.html`,
`system/audit-a11y.html`, `system/audit-reuse.html`, `system/roadmap.html`.

## Cookbook — 61 recipes

Real React using only `@corelithzw/react` plus state hooks — no other dependencies. Each opens with the
primitives it needs and ends with a complete copyable component. **This is the best source for
"how do I actually wire X".**

`cookbook/<slug>.html`

**Onboarding** · `onboarding-checklist` — empty state → first success

**Auth** · `auth-signin-2fa` (password + 6-digit OTP, resend countdown) · `auth-forgot-password` ·
`auth-signup-email-verify` · `auth-permission-gate`

**Shells & navigation** · `shells-app-shell-sidebar` · `shells-mobile-bottom-tab` · `commands-cmd-k` ·
`shells-multi-tenant-switcher` · `shells-deep-link-restore`

**Forms** · `forms-multi-step-wizard` (validated + autosave) · `forms-autosave-drawer` ·
`forms-inline-edit-row` · `forms-bulk-edit-with-undo` · `forms-file-upload` · `forms-date-range-picker`

**Lists** · `lists-simple-list` · `lists-grid-list` · `lists-grouped-by-date` · `lists-grouped-by-section` ·
`lists-virtualised-long` · `lists-history-feed` · `lists-filterable-data-table` · `lists-master-detail` ·
`lists-activity-log` · `lists-kanban-board`

**Tables** · `tables-server-paginated` · `tables-editable-cells` · `tables-heavy-with-everything` ·
`tables-responsive-to-cards`

**Views** · `views-print-friendly` · `views-image-gallery`

**Dashboards** · `dashboards-operator-overview` · `dashboards-kpi-hero-drilldown`

**States** · `states-empty-loading-error` · `states-optimistic-mutations` · `notifications-toasts`

**Other** · `settings-notification-preferences` · `i18n-localized-app` (locale + currency) ·
`communication-comments-thread` · `approvals-leave-request`

### Charts — 20 recipes

`cookbook/charts/<slug>.html` · index at `cookbook/charts/index.html`

`line-simple` `line-multi` `area-stacked` `bar-vertical` `bar-horizontal` `bar-grouped` `bar-stacked`
`donut` `pie` `progress-ring` `sparkline` `bullet` `heatmap` `funnel` `scatter` `radar` `treemap` `gauge`
`waterfall` `candlestick`

⚠ The React package's `Chart` namespace only ships **Line, Bar, Donut, Sparkline**. The other 16 recipes
build on SVG or the CSS layer. Before replacing a working `@visx/*` chart in this repo, check the recipe —
the DS may not have the form at all. See `01-setup.md`.

## Kits — 10 full screens

`kits/<name>.html` · Operator-facing back-office for multi-tenant ERP: approvals, reconciliation, daily ops.
Ready-to-copy compositions of patterns + blocks.

| Kit | Use case | Built from |
|---|---|---|
| `data-heavy` | Dense ERP operations | AppShell + data table + page header + data toolbar |
| `lists` | Medium-density viewing | AppShell + data table + page header |
| `posting-studio` | Define and test posting rules | AppShell + page header + heavy controls |
| `journal-detail` | Single-record inspection | AppShell + detail view + page header |
| `batch-detail` | Batch tracking and settlement | AppShell + detail view + page header |
| `employee-detail` | Staff profile and payroll | AppShell + detail view + page header |
| `import-ledger` | Upload and mapping workflow | AppShell + import wizard + page header |
| `notifications` | Alerts and preferences | AppShell + notifications pattern |
| `settings` | Workspace and account | AppShell + settings pattern + page header |
| `signin` | Authentication | Auth flow (no AppShell) |

Index: `kits/overview.html`

## Portals — 10 built prototypes

`portals/<name>/demo.html` · index at `portals/index.html`

A portal is a role-scoped app exposing only what that role needs, tuned to their primary device.
**These are the most complete end-to-end references** — use them when a whole role-specific surface is
being built or restyled.

| Portal | Audience | Device | Covers |
|---|---|---|---|
| `admin` | System operators | Desktop | Users, activity history, billing, integrations, backup |
| `owner` | Business owners | Tablet / desktop | Cross-location metrics, cash, receivables/payables, profit, task alerts |
| `pos` | Cashiers, field buyers | Tablet | Sales entry, payments, receipts, till reconciliation |
| `staff` | Employees | Mobile / desktop | Payslips + deductions, leave, clock in/out, expenses, directory |
| `gold` | Mine clerks | Tablet / desktop | Pour ledger, refinery batching, payments, regulatory forms |
| ~~`scrap`~~ | ~~Scrap yard workers~~ | — | *(2026-08-24: the scrap-metal module was dropped under ST-2.3. The demo may still exist on the design-system host, but there is no Huchu surface behind it.)* |
| `parent` | Parents, guardians | Mobile | Fee balances, attendance, marks, news, payments |
| `student` | Students | Mobile / tablet | Timetable, marks, homework, library, goals |
| `teacher` | Teachers | Tablet / desktop | Attendance, grades, lesson plans, parent messaging |
| `stash` | Individuals | Mobile | Spend tracking, budgets, savings goals, subscription alerts |

**Directly relevant to this repo:** `gold`, `scrap`, `owner`, `staff`, `admin`.

## Verticals — 13 industries, 68 surfaces

`verticals/<name>/index.html` · index at `verticals/index.html`

A vertical is an industry-specific implementation (pages, dashboards, forms) built from shared primitives.
A portal is a role's access point; a vertical is a business domain's screens.

| Vertical | Surfaces documented |
|---|---|
| `gold` | Pours, settlement, audit export, pricing |
| `scrap` | Intake, stockpile, bulk sales, supplier ledger |
| `accounting` | Ledgers, journals, reconciliation, financials |
| `hr` | Employee database, payroll runs, compliance |
| `retail` | Branch dashboard, products, Z-report |
| `warehouses` | Stock register, receiving, stock take |
| `multisite` | Group overview, site comparison, transfers |
| `maintenance` | Asset register, preventive scheduling, breakdowns |
| `compliance` | Permits, inspections, training, audit reports |
| `cctv` | Live wall, playback search, incident logs |
| `auto` | Sales pipeline, vehicle detail, workshop board |
| `schools` | Student records, fees, attendance, marks, timetable |
| `thrift` | Bale opening, lot inventory, sales tracking |

**These map 1:1 onto this repo's route groups** — `app/gold`, `app/scrap-metal`, `app/accounting`,
`app/human-resources`, `app/retail`, `app/stores`, `app/management`, `app/maintenance`, `app/compliance`,
`app/cctv`, `app/car-sales`, `app/schools`, `app/thrift`. Fetch the matching vertical before restyling a
route group; it is the intended target design for that exact surface.

## Guides

`system/guides.html` · `system/guide-compose-page.html` (six-step recipe — digested in `04-composition.md`) ·
`system/guide-compose-pattern.html` · `system/guide-new-feature.html` ·
`system/guide-block-vs-pattern.html` (decision tree — digested in `README.md`) ·
`system/guide-mobile-adaptation.html`
