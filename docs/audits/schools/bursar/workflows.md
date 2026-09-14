# Bursar dashboard: workflow audit

Surface: the fees and finance area of the school workspace. Pages `app/schools/finance/**` (overview by year group, class view, ledger with invoices, receipts, credits, refunds, waivers and structures, arrears) and `app/schools/fees` (redirect), the fee sections of `app/schools/documents` and `app/schools/imports`, and portal invites from guardian records. APIs `app/api/v2/schools/fees/**`, `app/api/v2/schools/finance/**`, `reports/{arrears,collections,export}`. Domain logic `app/api/v2/schools/fees/_helpers.ts`, `lib/schools/fees-v2.ts`, `lib/schools/money.ts`, `lib/schools/fiscalisation.ts`, `lib/schools/audit.ts`. Persona: `BURSAR` (`lib/platform/personas.ts:106-124`), plus `SCHOOL_ADMIN` and tenant admins.

Audit date: 2026-09-14. Static read of `main`, cross-checked against the roadmap (Iteration 2, S-4.6, S-5.1, S-7.3, S-7.4, S-8.2, S-9.3), the fees phase 3 spec, the marketing promises, and the K-12 benchmark §9. UI companion: `ui-ux.md` in this folder.

## 1. Verdict in one paragraph

The money core is the strongest part of the schools vertical. Every money verb is wired end to end, transactional, row-locked, `Decimal(14,2)`, dual-currency, DB-constrained, audited, posted to the general ledger with an idempotency key, and fiscalisable through ZIMRA. The tests are real (fee money, credit and refund, audit, posting, fiscalisation, clone). What is wrong is around the edges and in the role model. A bursar cannot send a fee reminder or answer a parent's fee question, because both go through a route that only the head may call. A draft receipt can never be posted. One bursar can create, approve and apply a scholarship alone. GL posting runs after the transaction commits and a failure is only logged. A fiscalised receipt can be voided locally with no reversal. Draft invoices take allocations. Beyond that, the functions a bursar's office runs a term on are absent: payment plans, sibling and scholarship schemes as entities, bank reconciliation of receipts, a cash-up, a statement run, dunning, and any online payment.

## Runtime check (14 September 2026)

Verified on the seeded St Marys tenant as `bursar@stmarys.test` (see `../reference/runtime-verification.md`). Confirmed at runtime: B1 (both `POST /notices` and `POST /messages` return 403 "Your role cannot create reports" while the "Send reminders" button is enabled), B2 (a receipt saved with `postNow:false` is stored as DRAFT, there is no post route, and allocate and void both refuse it), B3 (one bursar created a waiver that landed as APPLIED with the approver equal to the creator), B7 (guardian-link PATCH returns 200 for BURSAR), B8 (opening-balance import refused with "Your role cannot create students"), and the phone ledger with no invoice on the first screen. Corrected: B10, the ageing surfaces agree on this data.

## 2. Docs versus code

| Claim | Source | Code reality | Verdict |
|---|---|---|---|
| S-2.1 to S-2.8 money correctness: `done` | roadmap | Decimal columns, currency and base amount, source types, partial unique index on live invoices, surplus to credit, refunds, fiscalisation, six audited actions. All confirmed in `_helpers.ts` and the fee tests. | True. |
| S-0.6 receipt posts to GL inline | roadmap | Posting is emitted after the receipt transaction commits (`receipts/route.ts:433` then `:588`); a FAILED posting is logged and returned as `accounting.accountingStatus` with nothing persisted on the receipt. | "Inline" is not "inside the transaction". Partial. |
| S-2.6 refunds replace the 501 stub | roadmap | `SchoolFeeRefund` with request, pay, cancel; checks available credit. | True. |
| S-4.6 fees by year group, ledger, clone, `/schools/fees` redirect | roadmap | All present. | True. |
| S-5.1 branded invoice, receipt, statement | roadmap | Document sources exist. Receipt and statement have no page in `/schools/documents` (only invoice, report card, class list, register are surfaced, `school-documents-content.tsx:770-773`). Statement prints from the student record bar; receipt from the ledger row. | True at the engine, partial at the surface. No batch statement run. |
| Marketing: "arrears list the bursar can work through daily" | `site-data.ts` | Arrears and ageing exist. "Send reminders" on the finance overview is enabled for `fees:create` but posts to `/notices` which requires `reports:create`. The bursar gets a 403 after composing. On the arrears page the button is correctly disabled for BURSAR. | Sold, and the bursar cannot do it. |
| Marketing: fiscal receipts for "fees, tuck shop, and uniform sales" | `SCHOOL_ADD_ONS` | Fee receipts only. No tuck shop or uniform sale exists in the pack. | Overclaim. |
| Marketing: Premier includes "Accounting, AR/AP, and banking" | pricing bands | Schools post headlessly with no accounting UI entitlement; banking reconciliation UI is parked under the scope trim. | Overclaim for schools tenants. |
| Marketing: offline receipting | site FAQ | S-8.2 `todo`; nothing in the fees UI uses the offline runtime. | Overclaim. |
| S-7.3 and S-7.4 portal payments and reconciliation: `todo` | roadmap | Absent. `lib/payments/` serves subscription billing only. | Accurate. |
| Fees phase 3 spec: accounting events PENDING for later posting | phase 3 spec | Replaced by direct posting. | Spec superseded; retire it. |
| Bursar dashboard drawn in `design/campus/leadership/BursarDashboard.dc.html` | design canvas | No page implements it; `/schools/finance` is the year-group picker. No roadmap story. | Design without a story. |

## 3. Workflow inventory

Status key: Implemented = UI, API, DB, permission check and audit where sensitive; Partial = works with a named gap; Broken = the bursar hits a refusal or dead end; Missing = absent.

**Setup**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| F1 | Fee structures: create, edit, activate, archive, clone up the ladder | Implemented | Creation is the one structure verb not audited (`fees/structures/route.ts` POST). |
| F2 | Fee structure lines (tuition, boarding, transport, levies) | Implemented | Transport and library charges are computed elsewhere and never become lines (see F22). |
| F3 | Discounts: sibling, staff child, early payment | Missing | Only per-invoice waivers with a `waiverType`. No scheme, no automatic application. |
| F4 | Scholarship and bursary schemes, sponsor billing (BEAM) | Missing | `SchoolFeeWaiver.waiverType = SCHOLARSHIP` per invoice only. |
| F5 | Opening balances import | Partial | Requires `students:create` and `fees:create` together (`imports/_guard.ts:19-24`); only SCHOOL_ADMIN holds both. The UI lets a bursar start a job the API will refuse. Cross-currency balances import at rate 1 and are flagged. |

**Billing**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| F6 | Create invoice, edit or discard while draft, issue | Implemented | Issue posts `SCHOOL_FEE_INVOICE_ISSUED`. |
| F7 | Bulk generate per term and structure, skip existing | Implemented | Partial unique index closes the two-bursars race; one audit row per run. No preview of "this will raise 20 invoices totalling $9,800". |
| F8 | Issue all drafts in one action | Missing | Bulk generate creates; issuing 120 drafts is 120 row actions. |
| F9 | Write off | Implemented | No DRAFT guard; GL posted after commit. |
| F10 | Payment plans and instalments with due dates | Missing | One `dueDate` per invoice. |
| F11 | Reissue, credit note, adjustment | Partial | Discard is DRAFT only; a wrong ISSUED invoice needs write-off plus a new invoice. |

**Collection**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| F12 | Record receipt with allocation (first-fit or explicit), surplus to credit | Implemented | Row locks, split and credit-xor-balance DB checks. |
| F13 | Post a receipt saved as draft | Broken | `postNow: false` creates a DRAFT receipt (`receipts/route.ts:94, 499-503`); no post route exists; allocate and void both require POSTED. A draft receipt is stuck forever. |
| F14 | Allocate later, void with reason | Implemented | Void ignores `FiscalReceipt` state (see §5 B4). |
| F15 | Fiscalise via ZIMRA, replay un-landed receipts | Implemented | Feature-flagged; never blocks payment. |
| F16 | Receipt printed at the counter | Partial | Print is a row verb after the fact; the receipt dialog has no "print on save". |
| F17 | Online payment from the parent portal, reconciled to receipts | Missing | S-7.3, S-7.4. |
| F18 | Cash-up, till close, deposit slip, bank reconciliation of fee receipts | Missing | `BankReconciliation` exists in accounting but has no link to `SchoolFeeReceipt`. |
| F19 | Payment method configuration (accounts, merchant codes) | Missing | Four enum values; nothing to tell a parent where to pay. |

**Relief and refunds**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| F20 | Waiver create, edit, discard, approve, apply, reject, reverse | Implemented, control gap | A waiver can be created directly as APPROVED or APPLIED; `apply` stamps the caller as approver when none exists; `/finance/waivers/[id]/approve` is a re-export of `apply`. No segregation of duties. |
| F21 | Refund request from credit or receipt surplus, pay, cancel | Implemented | GL posted after commit. |
| F22 | Transport and library charges flowing into invoices | Missing | Transport billing "reported, never posted" (`lib/schools/transport.ts:255-262`); library fines computed, never billed. |

**Chasing and reporting**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| F23 | Fees by year group, class finance view | Implemented | |
| F24 | Arrears with ageing, collections, export CSV and PDF | Implemented | Three surfaces compute ageing differently (see UI audit). |
| F25 | Send reminders to families in arrears | Broken for BURSAR | Finance overview button enabled by `fees:create`, route needs `reports:create` (`notices/route.ts:121`). Arrears page disables it. Delivery is in-app only; families without a portal account are counted as `withoutAccount` and not reached. |
| F26 | Answer a parent's fee question in the office inbox | Broken for BURSAR | `POST /messages` needs `reports:create` (`messages/route.ts:83`). |
| F27 | Dunning schedule, automatic reminders before and after due date | Missing | S-9.3 `todo`. |
| F28 | Statements per family or per class as a batch | Missing | Statement source exists; only a single-student print. |
| F29 | Results or portal hold for non-payment (fee-threshold gate) | Missing | Promised in `schools.md` §4.5 and the market gameplan; no story. |
| F30 | Collections target and daily takings | Missing | Reports show collections vs billed; no target, no today figure. |
| F31 | Portal invites to guardians and students | Implemented | Manual link copy; guardians without email are skipped. |
| F32 | Who changed what a family owed | Implemented | Six fee actions write `PlatformAuditEvent` in-transaction. |
| F33 | Multi-currency invoicing and receipting | Implemented | Rate per document date; allocation refused across currencies. |

Counts: 15 implemented (2 with control gaps), 4 partial, 3 broken, 11 missing.

## 4. Benchmark gap

Graded against `../reference/k12-benchmark.md` §9.

| Capability | Benchmark norm | Huchu today | Priority |
|---|---|---|---|
| Fee structures, bulk invoicing, receipts, credits, refunds, write-off | Standard | Present, strong | Done |
| GL posting and fiscalisation | Regional necessity | Present | Done |
| Online payment and reconciliation | Standard | Absent | P0 |
| Reminders and dunning by SMS or WhatsApp | Standard | Absent; in-app only and bursar cannot send | P0 |
| Payment plans and instalments | Standard | Absent | P1 |
| Sibling, staff and early-payment discounts as rules | Standard | Absent | P1 |
| Scholarship and sponsor (BEAM, church, company) billing | Regional necessity | Absent | P1 |
| Cash-up and bank reconciliation of receipts | Standard | Absent | P1 |
| Statement runs and family statements | Standard | Single print only | P1 |
| Fee holds on results | Common in the region | Absent | P2 (policy) |
| Tuck shop and uniform POS with fiscalisation | Sold in the add-on copy | Absent from the pack (retail POS exists separately) | P2 |
| Offline receipting | Sold on the site | Absent | P1 |
| Bursar dashboard with today's takings and collection rate | Standard | Absent (year-group picker) | P1 |

## 5. Bugs and risks

| # | Finding | Location | Severity |
|---|---|---|---|
| B1 | Bursar cannot send reminders or reply in the office inbox: `reports:create` is SCHOOL_ADMIN only. | `fees-grade-picker.tsx:184` vs `notices/route.ts:121`; `messages/route.ts:83`; `personas.ts:106-124` | High |
| B2 | Draft receipt can never be posted, allocated or voided. | `receipts/route.ts:94, 499-503`; `allocate/route.ts:111`; `void/route.ts:43` | High |
| B3 | Waiver approval has no segregation of duties; one bursar grants, approves and applies a scholarship. | `waivers/route.ts:35, 197-221`; `waivers/[id]/apply/route.ts:138` | High (control) |
| B4 | Voiding a receipt never checks `FiscalReceipt`; a receipt already submitted to ZIMRA can be voided locally with no credit note or reversal. | `receipts/[id]/void/route.ts` | High (compliance) |
| B5 | GL posting after the transaction for receipts, void, write-off and refund pay; a failed posting is `console.error`ed, no journal id or status stored on the document, no retry. Money can be received with no ledger entry and no list of unposted documents. | `receipts/route.ts:433, 588`; `void/route.ts:37, 118`; `write-off/route.ts:52, 92`; `pay/route.ts:56, 119` | High |
| B6 | DRAFT invoices accept allocations, waivers and write-offs, flipping to PART_PAID or PAID without ever being ISSUED, so the receivable is posted without the issue journal. | `_helpers.ts:630`; `apply/route.ts:79, 98`; `write-off/route.ts:40-45` | Medium |
| B7 | `PATCH /guardian-links/[id]` (consent flags, primary) has no persona check; BURSAR, via `canViewAnyPortalSubject`, can change which parent receives results. | `guardian-links/[id]/route.ts:46-110` | Medium |
| B8 | Opening-balance import requires a role no bursar has. | `imports/_guard.ts:19-24` | Medium |
| B9 | Fee structure creation is not audited while edit, activate and archive are. | `fees/structures/route.ts` | Low |
| B10 | Three separately coded ageing computations with different bucket sets and labels on the finance overview, the reports page and the dashboard. On the seeded tenant all three agree; the older screenshot set showed them disagreeing. A maintenance risk rather than a live defect. | `fees-grade-picker.tsx:188-192`; `schools-reports-enhanced-content.tsx:1164-1168`; `schools-dashboard-content.tsx:96-104, 1212-1216` | Medium |
| B11 | Parent-facing invoice, receipt and statement downloads always fail for the PARENT role, so the "phone call the bursar does not have to take" still happens. | `app/api/documents/render/route.ts:101-108` | High (see parent audit) |
| B12 | No browser test records a receipt, issues an invoice, applies a waiver or voids; e2e is a page-render sweep. | `e2e/schools-back-office-suite.spec.ts` | Medium |

## 6. Proposed edits

1. **Give the bursar the verbs the job needs (B1).** Add a `notify-families` action on `schools.fees` (or grant `schools.reports create` scoped to fee notices) and guard the arrears and finance reminder path on it. Grant BURSAR `schools.messages reply` (new resource) so fee threads can be answered. Gate the finance overview button on the same check the arrears page uses.
2. **Add `POST /fees/receipts/[id]/post` (B2)** or drop `postNow` entirely; the counter case is always post-now.
3. **Segregation of duties on waivers (B3).** Require `approve` by SCHOOL_ADMIN (or a second bursar) before `apply`; refuse `approvedById === createdById`; remove the create-as-APPLIED path. Keep the audit rows.
4. **Fiscal-aware void (B4).** Refuse void when a linked `FiscalReceipt` is submitted, or route it through a fiscal credit note.
5. **Persist posting outcome (B5).** Store `journalEntryId` and `accountingStatus` on `SchoolFeeReceipt`, `SchoolFeeInvoice`, `SchoolFeeRefund` (as `FiscalReceipt` does), add a "not posted" filter and a replay endpoint, or emit inside the transaction.
6. **Restrict allocation, waiver and write-off to ISSUED and PART_PAID (B6).**
7. **Persona check on guardian-link PATCH (B7)** and split the import guard per entity (B8).
8. **One ageing service (B10)** with one bucket definition and one component, consumed by all three surfaces.
9. **Fix the parent downloads (B11)** with a guardian-link check in the render path.
10. **Browser tests for the money path (B12):** record receipt, issue, bulk generate, waiver apply, refund pay, void, in `e2e/`.
11. **Audit structure creation (B9)** and update the roadmap rows for S-0.6 (posting is after commit) and S-5.1 (receipt and statement have no page).

## 7. Proposed restructuring

- **Make `/schools/finance` the bursar's home and a dashboard**, not a year-group picker: collected vs billed hero, today's takings, drafts not issued, receipts not fiscalised, refunds awaiting payment, ageing strip, longest overdue with verbs, recent receipts. "Record receipt" as the one primary in the bar. The year-group table stays below.
- **One ledger, one status vocabulary.** The ledger's Draft, Issued, Part paid, Paid, Written off, Voided everywhere; "Overdue" becomes a filter, not a status.
- **Family as a unit.** Receipts, statements and reminders are per family in practice. Introduce a household view (guardian with billing responsibility, all children) so one receipt can settle several children and one statement covers the family.
- **Retire the fees phase 3 spec** and fold its surviving intent into the roadmap.
- **Separate relief from billing.** Discounts and scholarships become schemes applied at invoice generation; waivers remain the exception path for one-off relief with approval.

## 8. Proposed new workflows and features

Each entry names the model and route it needs.

1. **Online payments (S-7.3, S-7.4).** `SchoolFeePayment` intent (invoice ids, amount, method, provider ref, status INITIATED / PENDING / PAID / FAILED) on the `lib/payments/` seam; on PAID create the receipt through the existing allocation and posting; bursar screen "Portal payments" with method filter and unreconciled list. Providers: Paynow (EcoCash, OneMoney), card, bank transfer with proof upload and bursar confirmation.
2. **Reminders with a channel (S-9.3).** Invoice issued, due in 7 days, overdue at 7, 30 and 60 days; per family; in-app plus SMS or WhatsApp; bursar sees delivery status and cost. Templates per school.
3. **Payment plans.** `SchoolFeePaymentPlan` with instalments (amount, due date) against an invoice; reminders per instalment; arrears computed per instalment.
4. **Discount and scholarship schemes.** `SchoolFeeScheme` (type SIBLING, STAFF, EARLY_PAYMENT, SCHOLARSHIP, SPONSOR; rule; sponsor party) applied at bulk generation as invoice lines or credit notes; sponsor billing produces an invoice to the sponsor.
5. **Cash-up and banking.** `SchoolCashSession` per cashier per day (opening float, receipts by method, count, variance, deposit slip); link receipts to bank statement lines through the existing `BankReconciliation`.
6. **Statement run.** Batch statements per class or whole school at term start and mid-term, delivered to the portal and by WhatsApp or email, using `schools.fee.statement`.
7. **Transport and library billing into invoices.** Rider fees as structure lines; fines as a "Library" line on the next invoice or a separate small invoice.
8. **Fee hold policy** (optional per school): results or report card withheld below a payment threshold, with the head's override and an audit row.
9. **Offline receipting (S-8.2)** through the outbox with an idempotency key on receipt number.
10. **Tuck shop and uniform sales**: either wire the retail POS to school fee customers with fiscalisation, or remove the add-on copy.

## 9. Open decisions

- Who approves a waiver: the head, a second bursar, or a configurable threshold?
- Which payment provider for fees, and who bears the transaction fee?
- Is a receipt ever saved as draft? If not, delete the path.
- Should the school see accounting screens, or stay headless? The Premier band says one thing and the scope trim another.
- Family or student as the billing unit going forward.
