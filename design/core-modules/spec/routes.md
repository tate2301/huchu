# Routes: every board, and what happens to every existing page

The contract for the build.

**Board.** A file in `boards/view/`. Read it with `tools/check/outline.py <Board>`.

**Kind:**
- **new**: no page yet.
- **rebuild**: the page exists, so it is rebuilt to its board.
- **port**: an existing page the boards never drew; it is moved onto the kit and kept.
- **reference**: an explainer board, read for behaviour but never built as a page.

**Redirect.** The old address forwards to the new one with `redirect()` in its `page.tsx`.

Anything that needs a new table, column, role or a data-changing API is marked **approval**. It is proposed with its migration before it is built.

## 0. Shared: the module panel (first, inside Reports)

Every board draws its module's panel the same way:
- Rows with counts.
- **Saved views**, with "shared" and "you" and Add to Saved views.
- **Reports from <module>**, which links to that module's reports.
- **Help** at the foot.

The app's panel (`components/layout/workspace-rail/rail-panel.tsx`, items in `lib/navigation.ts`) has rows only.

**What changes:**
- Groups, counts, and a Reports-from group fed by the reports registry go into the panel component.
- **Saved views** are stored in a new `SavedView` table: company, the page's address, name, the address's query, shared or just you, and who made it. It is **approved** (13 Oct), with its migration, a witness test and Vane's reader grants.
- Management's back link reads "Back to <workspace name>" (`components/settings/management-shell.tsx`; the name is in `shell-nav.tsx`).
- **Books' panel** becomes the board's: Money, Invoices, Payments, Takings, Expenses, Bank, VAT; then Saved views and Reports from Books.
  - Payments, Takings and Expenses are the existing Receivables receipts, retail takings and Payables bills, ported.
  - Receivables, Payables, Financial reports, Trial balance, AR and AP, Chart of accounts, Posting rules and Fiscalisation move under a Books "More" group.
- **Books routes:** the boards name `/books/journals`, `/books/vat` and `/books/periods`. They move there, and `/accounting/journals`, `/accounting/tax` and `/accounting/periods` redirect.

## 1. Reports & Insights

| Board | Route | Kind |
|---|---|---|
| ReportsAll | `/reports` (All reports; Yours, Shared with you, From Corelith, Folders as views) | rebuild |
| ReportsInsights | `/reports/insights` | new |
| PageInsightVisits | `/reports/insights/site-visits` (Sales is the same page, `/reports/insights/sales`) | new |
| PageReport | `/reports/[key]` | rebuild |
| PageReportSave, PageReportExport, PageReportSend | Dialogs and footers on `/reports/[key]`. Send it schedules into a new `ReportSchedule` table, **approved** (13 Oct): report, how often, day, time, recipients, format, filters, who set it, next and last sent, on or off. Sending is by email on the existing cron, and only after a person presses Start sending | new |
| PageReportArrange | `/reports/[key]/arrange` | rebuild |
| PageBuiltReport | `/reports/built/[key]` | rebuild |
| ReportMonday | `/reports/monday-board`, i.e. a custom report at `/reports/c/[slug]` | rebuild of `/reports/custom/[id]` |
| ReportBuild, ReportBuildVane | `/reports/c/[slug]/edit`: the builder grid (bar, outline, page, inspector, shelf), each panel resizing from its edge and widths kept per person | rebuild of `/reports/custom/[id]/edit` |
| PageReportsSettings | Management → Reports | port of `/preferences/organization/reports` |
| PageRetailReports, PageRetailTemplate | `/retail/reports`, `/retail/reports/[ref]` (404s today) | rebuild, new |
| PageRetailSales, PageRetailLosses | `/retail/insights/[topic]` | rebuild |
| PageSchoolReports, PageSchoolBuilt, PageSchoolFees | `/reports`, `/reports/built/[key]` and `/reports/insights/fees` in a schools workspace | rebuild |
| PageMineReports, PageMineDowntime, PageMineProduction | The same, in a gold workspace: `/reports/downtime` and `/reports/insights/production` | rebuild |
| PagePayReports, PagePayCost | The same, for payroll: `/reports/insights/pay-cost` | rebuild |
| PageShopReports | `/reports` in a workshop workspace | rebuild |
| RiTree, RiRequirements, RiTemplates | | reference |

**Existing pages:**

| Page | Fate |
|---|---|
| `/crm/reports`, `/crm/insights` | redirect to `/reports`, `/reports/insights/sales` |
| `/crm/build/visits/[id]/insights` | port; linked from the Site visits insight |
| `/schools/reports` | Collections and Arrears become the Fees insight; the other tabs are ported as reports; redirect |
| `/dashboard` (gold production) | becomes the Production insight; redirect for gold workspaces, kept for the rest |
| `/gold/insights/allocations`, `/[id]` | port to Gold → Allocations (`/gold/allocations`); redirect |
| `/accounting/financial-reports` | port; listed under From Corelith and in Books' Reports from Books |
| `/reports/custom/[id]`, `/edit` | redirect to `/reports/c/[slug]` |

## 2. People and payroll

| Board | Route | Kind |
|---|---|---|
| PeopleEveryone | `/people` | rebuild |
| PeoplePerson | `/people/[id]` (`EMP-0005`) | new |
| PeopleTimeOff | `/people/time-off`. Approve and reject: **approval** (the leave API has neither) | rebuild of `/people/leave` |
| PageHrIncidents | `/people/incidents` | rebuild |
| PayRun | `/people/payroll/[period]` | rebuild of `/payroll/runs` |
| PayApprove | the approve-and-pay drawer on the pay run | rebuild |
| PagePayDisburse | `/people/payroll/disbursements` | rebuild of `/payroll/disbursements` |
| PagePayReturns | `/people/payroll/returns` | rebuild of `/payroll/statutory/returns` |
| PaySlipPhone | `/people/payslips/[id]` at 390 (today a payslip is a PDF only) | new |
| MgmtPay | Management → Pay and statutory | rebuild |
| MgmtJobGrades | done | |

**Existing pages:**

| Page | Fate |
|---|---|
| `/people/leave`, `/people/leave/holidays` | redirect to `/people/time-off`; Holidays becomes a view on it, ported |
| `/people/attendance`, `/people/rosters`, `/people/approvals` | port; in the People panel |
| `/payroll/runs`, `/payroll/disbursements`, `/payroll/statutory/returns` | redirect to their `/people/payroll/*` homes |
| `/payroll/salaries`, `/payroll/salaries/outstanding`, `/payroll/compensation`, `/payroll/statutory` | port to `/people/payroll/*`; in the panel's Payroll group; redirect |

## 3. Notifications

| Board | Route | Kind |
|---|---|---|
| NotifyBell | The bell's Needs you panel in the top bar | rebuild |
| NotifyActivity | `/activity` | new; it merges `/preferences/organization/activity` (redirect) |
| MgmtNotifications | Management → Notifications (who hears about what) | new |
| NotifyHow | | reference |

`/preferences/notifications` stays (personal) and is ported.

## 4. Branding

| Board | Route | Kind |
|---|---|---|
| PageBrandIdentity, PageBrandAssets, PageBrandFinance | `/preferences/organization/branding/{identity,assets,finance}`, with the live quotation preview | rebuild |
| PageBrandWhere | `/preferences/organization/branding/where` | new |

`/settings/branding/*` redirects to these.

## 5. Build

| Board | Route | Kind |
|---|---|---|
| PageBuildHome | `/build` | new |
| PageBuildTemplates | `/build/templates` | new |
| BuildForm, PageIntakeForm | `/build/forms/[id]` on the builder grid | rebuild of `/crm/forms/[id]` and the `/crm/build` editor |
| BuildDocument | `/build/documents/[id]` | rebuild of `/templates/[id]` |
| PageTemplateEmail, PageTemplatePayslip | `/build/templates/[id]` | rebuild |
| BuildReport | `/build/reports/[slug]`, the same editor as `/reports/c/[slug]/edit` | rebuild |

**Existing pages:**

| Page | Fate |
|---|---|
| `/templates`, `/crm/templates`, `/settings/templates`, `/preferences/organization/templates` | redirect to `/build/templates` |
| `/crm/forms` | redirect to `/build?kind=forms` |
| `/crm/build`, `/crm/build/visits/[id]`, `/crm/build/enquiries/[id]` | the runs stay at their addresses, ported to the kit |

## 6. Vane engine (no boards; handover §3.1–3.3)

- **The reader connection and `run_sql`:**
  - Its own login, never SET ROLE.
  - `lib/vane/reader-access.ts` grants.
  - **Approval** for the reader login's setup if it needs a new role.
- **The tools:** read, propose, draft. Draft-only, enforced on the server.
- **The worker:** jobs, plans, allowance; model from `VANE_MODEL`.

## 7. Explore

| Board | Route | Kind |
|---|---|---|
| ExploreStudio | `/explore` and `/explore/q/[slug]` | new |
| ExploreTemplates | `/explore/templates` | new |
| ExploreSchedule | the schedule drawer on a question | new |
| ExploreGuard | the refused and locked states | new |
| ExploreAsk | Ctrl K gains "Open in Explore" | rebuild |
| ExploreSuggest | Vane's suggestions on Books → Invoices | new |
| MgmtExplore | Management → Explore | new |
| ExploreHow | | reference |

It runs on the existing SQL engine (PGlite worker, parser guard). **Approval** is needed for `explore_reader` and its scope table, and for saved questions if they need a table.

## 8. Vane screens

| Board | Route | Kind |
|---|---|---|
| VaneForYou | `/vane` | new |
| PageVanePlan, PageVaneDone, PageVaneMuted | `/vane/plans`, `/vane/done`, `/vane/muted` | new |
| PageVaneJob | Give Vane a job (Ctrl J) | new |
| PageVaneStates | Paused, over the allowance, could not work it out, cannot reach the service | new |
| PageVaneCard | A card and what Vane read | new |
| BooksVane | done | |
| PageVaneReport | explain a figure, on a report | new |
| PageVaneBlock | Vane's block in the builder | new |
| PageVaneForm | changes to a form from its answers | new |
| PageVaneDocument | a quote checked and the message written | new |
| PageVaneDraft | Vane's draft invoice in Books | new |
| PageVaneRetail, PageVaneSchool, PageVaneMine | the vertical drafts. Mine work orders have no `companyId`: **approval** | new |
| PageVanePhone | a fitter's phone, own visits only (the scope is an open decision: build unscoped, note it) | new |
| Main, VaneTouch, VaneComponents, VaneRules, VnTree, VnInteractions, VnUseCases, VnRequirements, VnTemplates | | reference |

## 9. Kit and done

KitSheet is the `/kit` page, already built. Books, the Management boards built so far, and MgmtJobGrades are done; the Books routes and panel are fixed in §0.
