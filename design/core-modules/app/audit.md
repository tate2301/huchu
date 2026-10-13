# Audit: what the app has against the design

From the repository surveys made while designing (11 to 12 Oct 2026) and the notes beside each board (`spec/boards.json`). Ranked by how many screens or people each one blocks.

## Missing or broken

| # | Where | What is wrong | Design that fixes it |
|---|---|---|---|
| 1 | Every module | No shared shell: rail, module panel and top bar differ per vertical; Management sits on panel feet | `spec/shell.md`, every board |
| 2 | `/retail/reports/[ref]` | Every retail template row links here and it 404s | Reports & Insights → Retail, the report page in the Tender look |
| 3 | Reports | `/crm/reports` and `/crm/insights` are two places; the gold Production dashboard is filed under Settings (`/dashboard`); schools split Collections and Arrears into tabs | One Reports & Insights destination; the Fees and Production insights |
| 4 | People | `/people/{id}` is linked from the schools staff list and missing; leave can be requested but not approved or rejected | People → a person; Time off |
| 5 | Payroll | Payslips are PDF only; no bank or EcoCash payment file; returns page Export buttons not wired | The phone payslip; Disbursements; Returns |
| 6 | Books | Bank reconciliation is parked | Books → Bank with statement upload and proposed matches |
| 7 | Management | Integrations and Marketplace have no page; Templates sit in Management | Management → Integrations, Marketplace; Templates move to Build |
| 8 | Vane | Nothing in the app calls it yet; no worker, no pages | The Vane page; `docs/handover-core-modules.md` §3 |
| 9 | Explore | No guarded SQL for power users | The Explore page |
| 10 | Notifications | No Activity page; no notification settings | The Notifications page |

## Model gaps found while designing

- No outbox for record changes: Vane's "record changed" trigger needs one.
- A report block has no draft flag: Vane's question waits on its card until Keep.
- `WorkOrder` (mine) has no `companyId` or `createdById`, so it cannot carry the made-by-Vane mark.
- A CRM rep can read the whole pipeline; fitters' scope for Vane is undecided (see `spec/open.md`).
- Row security existed nowhere before `20261012120000_vane`.

## Before screenshots

The repo survey's screenshots stay in the session that made them. Take fresh ones at 1440 and 390 before building (`build-in-code`, step 0.3): the CRM deals page, `/management/master-data/hr/job-grades`, `/reports`, `/retail/reports`, `/people`, `/payroll`, `/accounting`.
