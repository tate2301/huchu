# 34 · Buying › Requisitions: ask for money, decide, cancel (and the money accounts they name)

## Screen
- `/retail/buying/requisitions` — list (ListFrame, source `retail-requisitions`)
- `/retail/buying/requisitions/[id]` — record (RecordFrame, kind `requisition`)
- Sheets: `?sheet=req-new&for=order|expense` (`&orderId=`, `&from=<rejected id>`), `?sheet=req-approve&id=`,
  `?sheet=req-reject&id=` / `&ids=`, `?sheet=req-question&id=`
- Asks: `cancelreq` (exists as `cancelRequisitionAsk`), `approvemany`

## Units
BUY-04 (40-buying §7 BUY-04, §W-31 rows "Amount is the order", "Submit", "Owner approves", §W-32 rows 1–3, §W-72, §3.3 C,
§4.5 (not pay/acquit), §5.8, §5.9, §5.18–§5.21, §5.32), **plus from BUY-05**: the money-account kind and ledger link on
`BankAccount`, the `money account` lookup and balances (the ask sheet's "Pay from" and the record's "Cash at hand" need them),
and the attachments upload route (the expense "Quote" needs it; spec §4.4 lists it under BUY-06). "Verbatim §x" = that section
of `docs/handover/40-buying.md`.

## Boards
- `RequisitionsList.png` — "Requisitions", "+ Ask for money"; tabs To approve 2 · To pay out 1 · Receipts due 1 · All 14;
  toolbar "Number, purpose or person", "Purpose Any", "Asked by Anyone", "Filters", count, "Needed soonest", Group, Columns,
  Export. Columns Number (mono) · What for · State ("Waiting for approval" warn, "Approved, to pay" info, "Paid, receipt due"
  info, "Accounted for" hollow) · Amount · Asked by · Needed by · Against ("PO-0005" mono link / "Fuel", "Repairs", "Licences"
  muted) · ⋯; Σ "5", "US$2,964.80".
- `ReqOrder.png` — "Ask for money" / "Buying › Requisitions", steps "1 Asked — Approved — Paid out — Accounted for"; For seg An
  order · An expense; Order "PO-0005 · Afdis Distillers"; Amount (US$ prefix, "1,940.00") + Currency seg US$ · ZiG; hint "The
  order total. Lower it to pay part now."; Pay from "Office safe" + Needed by "Tuesday 6 October"; Why. Note "Tendai Mhlanga
  approves anything over US$500.00.", "Cancel", "Submit for approval".
- `ReqExpense.png` — For An expense; Expense "Repairs and maintenance"; What for; Amount + Currency; Pay from "Front till float" +
  Pay to "CoolTech Repairs"; Quote "optional" drop zone "Add the quote / Drop it here, or take one on a phone". Note (board: "Under
  US$100.00, a manager can approve it." — built from the setting, so "Under US$500.00, …").
- `RequisitionRecord.png` — "‹ Requisitions / Cash to pay Afdis for order PO… REQ-0014"; "Approve a different amount | Reject |
  Ask a question | ⋯", primary "Approve US$1,940.00"; steps Asked ✓ — **Approved** — Paid out — Accounted for; chips "Stock
  purchase", "● Needed by Tuesday" (warn); figure "Asked for US$1,940.00". KPIs Asked for "US$1,940.00" "PO-0005 Afdis Disti…" · In
  the order "US$1,940.00" "90 units, with VAT" · Cash at hand "US$2,410.00" "US$470.00 left aft…" · Spent on stock "US$9,120.00"
  "this month of US…" · Needed by "6 Oct" "3 days". Chart "Money asked for, by month stock purchases" range 3m/12m/All. Tabs What
  it pays for 6 · Approvals 1 · Receipts 0 · Activity 3; lines Σ "90" "US$1,686.96"; footer "Open order PO-0005". Rail Request
  (Asked by, Asked "3 October 2026, 11:20", For "Order PO-0005", Purpose), Money (Amount, Currency "US dollars, cash", Pay from,
  Pay to "Afdis Distillers, on delivery"), Approval (Approver "Tendai Mhlanga, owner", Needs approval "Over US$500.00",
  Receipt due "3 days after paying").
- `ReqApprove.png`, `ReqReject.png`, `ReqCancel.png` — sheets and ask verbatim §5.19, §5.20, FND `cancelreq` (body "US$1,940.00 for
  order PO-0005 is no longer asked for. Tafara Nyathi, who asked, gets a message, and the order goes back to unpaid. Nothing was
  paid out, so no cash moves." / "Keep it" / "Cancel the requisition").
Not here: "Pay out", "Account for it" (packet 36). The board's "Spent on stock … of US$12,000.00 budget" clause is not drawn (no
budget exists; spec open question 7).

## Workflows
- W-31 (Manager; "The order, Ask for money"): Amount is the order · Submit · Owner approves — verbatim §W-31 rows 1–3.
  (Paid out · Receipt attached → packet 36.)
- W-32 (Anyone; "Requisitions"): What for and how much · Submit · Approve · Reject (incl. bulk) — verbatim §W-32 rows 1–4,
  and "Change and ask again".
- W-72 Cancel a requisition (Whoever asked, or a manager): Cancel · The asker is told · Nothing paid, no cash moves — verbatim
  §W-72.

## Roles
`retail.requisitions` (landed): Owner view/create/update/delete/approve (any amount); Manager view/create/update/approve (at or
under `requisitionOwnerOver`, never their own); Cashier and Stock clerk `view-own` + create; Bookkeeper view.
Row rules in `lib/retail/buying/requisitions.ts`: `view-own` roles read only `requestedById = me` (others 404); the asker may
cancel their own; approving needs the limit rule. Accounts: owner `owner@` (Tendai Mhlanga, the owner approver), manager
`tafara.manager@`, cashier `chipo.till@`, stock clerk `tendai.stock@`, bookkeeper `bookkeeper@`; `farai.till@` asked REQ-0015.

## Data
Existing: `CrmRequisition` + `lib/crm/requisitions.ts` (state machine `assertTransition`, used as is), `BankAccount`,
`BankTransaction`, `RetailPurchaseOrder` (packet 31), `Vendor`, `ChartOfAccount`, `Notification`, `RetailMessage`,
`RetailApprovalSettings` + `getApprovalLimits` (ADM-04, landed), `notifyApprover`, `registerWaitingProvider`.

Migration `<stamp>_retail_requisitions`, witness `lib/retail/buying/requisitions-migration.test.ts`. Schema verbatim §3.3 C
(lines 653–770): `CrmRequisitionCategory` + `STOCK`; enums `CrmRequisitionRejectReason`, `RetailPayoutMethod`,
`RetailAttachmentKind`; models `RetailExpenseType`, `RetailAttachment`; `CrmRequisition` + `purchaseOrderId`, `expenseTypeId`,
`payeeVendorId`, `approverId`, `approvalLimit`, `rejectReason`, `paidAmount`, `paidToId`, `payoutMethod`, `payoutReference`,
`receiptsDueAt`, `acquittedById`, `changeAmount`, `changeAccountId`, `acquittalNote`, `cancelledAt`, `cancelledById`, relations,
`@@index([companyId, purchaseOrderId])`; `NotificationType` + `CRM_REQUISITION_CANCELLED`, `CRM_REQUISITION_QUESTION`.
**Moved here from migration D:** enum `MoneyAccountKind` (CASH, BANK, MOBILE); `BankAccount.kind MoneyAccountKind @default(BANK)`,
`BankAccount.ledgerAccountId String?` + relation `"BankAccountLedger"`. SQL: the five expense types for every company with a
retail site (Repairs and maintenance → EQUIPMENT/5300; Fuel and transport → FUEL/5500; Cleaning → MATERIALS/5100; Electricity
and water → OTHER/5570; Licences and fees → OTHER/5580; accounts linked when present); existing retail requisitions get
`expenseTypeId` by category (EQUIPMENT → Repairs, FUEL/TRANSPORT → Fuel, MATERIALS → Cleaning); existing bank accounts `kind
BANK` and the company's 1010 as `ledgerAccountId`. Witness: the enum value STOCK, the tables, the five rows for a retail company,
the BankAccount columns and the backfilled ledger link. Code: `lib/crm/requisitions.ts` `REQUISITION_CATEGORIES` gains `STOCK`;
`lib/accounting/defaults.ts` chart gains 5570 "Electricity and water" and 5580 "Licences and fees" (EXPENSE).

## Server
`lib/retail/buying/requisitions.ts` (+ `requisitions.test.ts`) — rebuilt from `lib/retail/requisitions.ts` (retired below);
the CRM state machine is used unchanged. Rules verbatim §W-31/§W-32/§W-72; the key ones:
- `askForMoney(actor, input)` — for an order: order DRAFT/SENT/PARTIAL of the company, amount > 0 and ≤ the order's total with
  VAT (`figures.ts`) → 400 `fieldErrors.amt` "Ask for the order total or less."; one live (SUBMITTED, APPROVED, DISBURSED)
  requisition per order → 409 "REQ-0014 already asks for PO-0005."; `category STOCK`, `purpose` "Cash to pay <supplier first
  word> for order <PO>", Why → `notes`, `payeeVendorId` = the order's supplier, `siteId` = the order's site, `neededBy` default
  the order's expected date. For an expense: expense type live, What for 1–200, amount > 0 ≤ 1,000,000, `category` = the type's,
  `payeeVendorId` optional, quote → `RetailAttachment` kind QUOTE, `siteId` = the asker's default site. Currency USD/ZWG; Pay
  from must hold that currency → 400 `fieldErrors.from` "Office safe holds US dollars.". Snapshot `approvalLimit` =
  `requisitionOwnerOver`, `approverId` = the owner approver when amount > limit else null. Status SUBMITTED, `submittedAt`,
  `REQ-nnnn` via `reserveIdentifier(CRM_REQUISITION)`. Audit `RETAIL_REQUISITION.ASKED`. After commit `notifyApprover({ level:
  over ? "owner" : "manager", siteId, type: CRM_REQUISITION_SUBMITTED, title, summary, entityType, entityId, viewPath:
  /retail/buying/requisitions/<id> })`. Done text "REQ-0015 sent to Tendai Mhlanga for approval." / "… sent to Tafara Nyathi for
  approval." (exactly one manager can decide) / "… sent to the managers for approval.". Packet 31's `raiseOrder` calls this with
  `askForCash` in the same transaction (wire it here: the New order toggle appears now).
- `approveRequisition(actor, id, { amount?, note? })` — SUBMITTED only (409 "REQ-0014 has already been approved."); owner any
  amount; manager only ≤ `approvalLimit` (403 "Over US$500.00 needs Tendai Mhlanga.") and never their own (403 "Somebody else
  has to approve your own request."); a different amount > 0 and < asked (400 `fieldErrors.amt` "Approve the amount asked for, or
  less.") with a note (400 `fieldErrors.why` "Tell Tafara why."). Sets APPROVED, `approvedById/At`, `approvedAmount`,
  `decisionNote`; audit `.APPROVED { amount, asked }`; asker told in the app (`CRM_REQUISITION_DECIDED`) and on WhatsApp
  (template `requisition-decided`, "REQ-0014: US$1,500.00 approved by Tendai Mhlanga. <note>"). Toast "US$1,500.00 approved.
  Tafara can pay it out." (asker cannot pay out: "… It can be paid out now.").
- `rejectRequisition(actor, id|ids, { reason, message })` — same right and limit; SUBMITTED only; message required for Other;
  sets REJECTED, `rejectReason`, `decisionNote`, decider in `approvedById/At`; audit `.REJECTED { reason }`; asker told ("REQ-0014
  was not approved: Pay another way. <message>"). Bulk answers `{ rejected, skipped }`.
- `askQuestion(actor, id, message 1–500)` — approve right; notification `CRM_REQUISITION_QUESTION` + WhatsApp
  `requisition-question` to the asker; audit `.QUESTION`; the asker's "Answer" posts the same endpoint (their answer is a
  `.QUESTION` event with `answer: true` and goes to the approver).
- `cancelRequisition(actor, id, { automatic? })` — the asker or `retail.requisitions:update`; SUBMITTED/APPROVED only (409
  "REQ-0012 has been paid out. Account for it instead."); CANCELLED, `cancelledAt/By`; no money, no ledger; notification
  `CRM_REQUISITION_CANCELLED` + WhatsApp to the asker when someone else cancelled ("REQ-0014 was cancelled by Tendai Mhlanga.
  Nothing was paid out."), to the approver(s) when the asker did; audit `.CANCELLED`. Packet 33's `cancelRest` and packet 31's bin
  kind `order` call it for a not-yet-paid requisition (add those calls here if those packets landed first).
- `changeRequisition(actor, id, patch)` — the asker or update right; SUBMITTED only (`payFromId` also while APPROVED) → 409
  "REQ-0014 has been approved. Ask again to change it."; `RETAIL_RECORD.EDITED`.
- `lib/retail/buying/money-accounts.ts` (+ test): `moneyAccountBalance(accountId)` = `openingBalance` + Σ DEBIT − Σ CREDIT of
  its `BankTransaction`s, in `Prisma.Decimal` rounded to cents (the columns are Float: convert once, never sum floats); option
  sub "US$2,410.00" (cash) or "•••• 4471" (last four of `accountNumber`, bank/mobile).
- `lib/retail/buying/attachments.ts` + `POST /api/v2/retail/buying/attachments` (multipart `file`; any of
  `retail.requisitions:create`, `retail.purchasing:receive`, `retail.bills:create`): pdf/png/jpeg/webp ≤ 10 MB (400 "That file is
  not a PDF or a picture." / "That file is over 10 MB."), `@vercel/blob` `put` at `retail/<companyId>/buying/<uuid>.<ext>` (the
  `app/api/v2/retail/catalog/image/route.ts` pattern) → `{ url, name, contentType, size }`; rows are written by the service that
  owns the record (`RetailAttachment`).
- Waiting-now provider (`lib/retail/buying/waiting.ts`, one import line in `lib/retail/approvals/providers.ts`): kind
  "requisition", requires `retail.requisitions:approve`, SUBMITTED ones the caller may decide → `{ ref: "REQ-0014", text: ",
  US$1,940.00, for Afdis.", href, since: submittedAt }`.
- Badge "<n> to approve" on Requisitions (`lib/retail/nav-badges/buying.ts`): SUBMITTED ones this person may decide (owner all;
  manager not their own and ≤ the snapshot limit); approvers only.
- Requisition PDF in `lib/retail/buying/documents.ts`, registered as `CrmRequisition` in `lib/retail/record-pdf.ts` (read
  `retail.requisitions:view` + row rule); `?sign=1` adds boxes "Asked by", "Approved by", "Paid out by", "Received by".

API (`app/api/v2/retail/buying/requisitions/**`), verbatim §4.5 except pay/acquit:
| Method · path | Permission | Body | Success | Errors |
|---|---|---|---|---|
| POST `/requisitions` | `retail.requisitions:create` | `{ for, orderId?, expenseTypeId?, whatFor?, amount, currency: "US$"\|"ZiG", payFromId?, payToId?, neededBy?, why?, quoteUrl? }` | 201 `{ data: { id, requisitionNo, waitsFor } }` | 400; 409 |
| GET `/requisitions/[id]` | view or view-own + row rule | — | `{ data: RequisitionView }` (`can: { approve, approveLess, reject, ask, payOut, acquit, cancel, askAgain, update }`) | 404 (not theirs: 404) |
| PATCH `/requisitions/[id]` | asker or update | one field | `{ data, changed }` | 409 |
| POST `/requisitions/[id]/approve` · `/requisitions/bulk/approve` | approve + limit | `{ amount?, note? }` / `{ ids }` | `{ data }` / `{ approved, skipped: [{ requisitionNo, why }] }` | 403; 409 |
| POST `/requisitions/[id]/reject` · `/requisitions/bulk/reject` | approve + limit | `{ reason, message }` (+ `ids`) | `{ data }` / `{ rejected, skipped }` | 400 |
| POST `/requisitions/[id]/question` | approve (or the asker answering) | `{ message }` | `{ data }` | 400 |
| POST `/requisitions/[id]/cancel` | asker or update | — | `{ data }` | 409 |
| GET `/api/v2/retail/records/CrmRequisition/[id]/pdf?sign=1` | view + row rule | — | pdf | 404 |
| POST `/api/v2/retail/buying/attachments` | see above | multipart | `{ url, name, contentType, size }` | 400 |
Lookups (`lib/retail/lookups/buying.ts`): `money account` (read `retail.requisitions:view`; quick add right
`retail.requisitions:approve` — owner and manager, standing in for the spec's `retail.setup:create`, which ADM-01 removed; quick fields
`[["Name",""],["Kind","Cash, bank or mobile"]]` → kind parsed, ledger 1005/1010/1016), `expense type` (read
`retail.requisitions:view`; quick add `retail.requisitions:approve` with `[["Name",""],["Account","Expenses"]]`; account matched
case-insensitively to an active EXPENSE ledger account's code or name, empty → 5590 "Other expenses", 400 "There is no expense
account called Expenses."). `order` lookup is packet 31's.
Audit: `requisitionAsked`, `requisitionApproved`, `requisitionRejected`, `requisitionQuestion`, `requisitionCancelled` (§3.4) +
`LIST_WORDS`. Record activity: `CrmRequisition` → `retail.requisitions:view` with the row rule.

## UI
- `app/retail/buying/requisitions/page.tsx` → `<ListFrame source="retail-requisitions" title="Requisitions" />`; source in-memory
  (small), `scopeOwn` on `requestedById` for CASHIER/POS_CASHIER/STOCK_CLERK; tabs `approve` (SUBMITTED), `payout` (APPROVED),
  `receipts` (DISBURSED), `all`; default To approve for approvers, All for others; filters purpose, asked (hidden for scoped roles),
  Filters › State (seven states) and Needed (period); sorts, group, columns (Amount = approved amount when cut; ZiG "ZiG 1,250.00";
  totals US$ only with a second "ZiG …" line when present), row ⋯ (Open · Approve · Reject · Cancel the requisition (bad) — Pay
  out and Account for it with packet 36), bulk (Approve → ask `approvemany`, skips over-limit for a manager; Reject → `req-reject&ids=`;
  Export), empty and phone card verbatim §5.8. Also sources `retail-requisition-approvals` (When · What · By; rows from the
  requisition's audit events: asked/waiting, approved, rejected, questions/answers) and `retail-requisition-receipts` (thumbnails;
  packet 36 fills it).
- `app/retail/buying/requisitions/[id]/page.tsx` → `<RecordFrame kind="requisition" id={id} />` + page asks (`cancelreq` built
  from data; expense variant and "asker cancels" variant verbatim §W-72). Kind: header per state verbatim §5.9 (SUBMITTED decider /
  asker; APPROVED and DISBURSED primaries are packet 36's; REJECTED primary "Change and ask again" → `req-new&from=<id>` for the
  asker); strip steps and chips (§3.2 requisition state/steps); figure "Waiting for Tendai Mhlanga" for a non-decider; KPIs (order
  and expense variants, "Spent on stock" this calendar month = Σ order-requisition payouts + supplier payments — reads 0 until packets
  36/41 — no budget clause); chart (range 3m/12m/all, last 8 months default view); tabs What it pays for (order: `retail-order-lines`
  parent `orderId` with "Open order PO-0005"; expense: a block with What for, Pay to and the quote) · Approvals · Receipts ·
  Activity; rail verbatim §5.9.
- Sheets (`lib/retail/sheet-kinds/buying.ts`): `req-new` (verbatim §5.18; steps strip at Asked; fields shown by For; note live from
  `getApprovalLimits` and the amount; `&from=` prefills from a rejected one), `req-approve` (§5.19), `req-reject` (§5.20, bulk via
  `&ids=`), `req-question` (§5.21, also "Answer Tendai" for the asker). Asks `approvemany` (§5.32) in `lib/retail/asks/buying.ts`.
- Packet 31's New order: draw the "Ask for the cash now" toggle now. Order record ⋯ "Ask for money" (no live requisition) →
  `req-new&for=order&orderId=`; order chips "Cash asked for" (info) / "Cash approved"; rail/`OrderView.requisition`.
- Nav: Requisitions item exists (`lib/retail/nav/buying.ts`); add the badge.

## Reuse
`lib/crm/requisitions.ts` (state machine), `lib/retail/approvals/{limits,notify,waiting,providers}.ts`,
`lib/retail/asks/buying.ts` (`cancelRequisitionAsk`), `lib/id-generator.ts` (`CRM_REQUISITION` → REQ), `figures.ts` (order total
with VAT), `app/api/v2/retail/catalog/image/route.ts` (blob upload pattern), `lib/retail/record-pdf.ts`.

## Remove
- `app/retail/buying/requisitions/page.tsx`, `…/[id]/page.tsx`, `…/_components/requisition-dialog.tsx`,
  `…/_components/requisition.ts`.
- `app/api/v2/retail/requisitions/route.ts` (GET, POST) and `…/[id]/route.ts` (GET, PATCH `{ action }` switch).
- `lib/retail/requisitions.ts` (`actOnRetailRequisition`, `requisitionPermissions`, `listRetailRequisitions`, `raiseRetailRequisition`,
  `loadRetailRequisition`, zod schemas) and `lib/retail/requisitions.test.ts` — rebuilt as `lib/retail/buying/requisitions.ts`.
- `lib/retail/requisition-words.ts` (`RETAIL_REQUISITION_CATEGORIES`, "Shop supplies", "Casual labour" …) — replaced by
  `RetailExpenseType`.
- `lib/retail/route-guard-coverage.test.ts` rows for the removed routes; add the new ones. (Route registry prefix
  `/api/v2/retail/requisitions` goes in packet 45.)
- Kept: `lib/retail/requisition-site-migration.test.ts` (witness of an applied migration).
**Gap, stated:** today's "Pay" (posts an expense on 1010 through `postRequisitionDisbursement`) is retired with
`lib/retail/requisitions.ts`; paying out comes back with packet 36 on the money-account model. Land packet 36 next (the build plan
already does); do not port the old pay.

## Seed
- Money accounts (`seedMoneyAccounts()`): Office safe (CASH, USD, ledger 1005), Front till float (CASH, USD, 1005), CBZ current
  account (BANK, USD, 1010, number "…4471" — rename the tenant's existing "Operating Bank"), EcoCash merchant (MOBILE, USD, 1016,
  "…0921"). A last seed step `settleMoneyAccountOpenings()` sets each `openingBalance` = target − Σ its seeded transactions, targets
  Office safe US$2,410.00 and Front till float US$120.00 (packets 36/41/43 add transactions; the step keeps the targets).
- Expense types: the five (migration) + chart 5570/5580 ensured.
- Requisitions through these services, verbatim §3.6 table, the ones this unit can make: REQ-0014 (SUBMITTED, today 11:20,
  Tafara, PO-0005, Office safe, why "Afdis deliver on Tuesday and take cash only.", amount = PO-0005's total with VAT =
  US$1,940.00, waits for Tendai Mhlanga), REQ-0015 (SUBMITTED, Farai, Generator diesel, 40 litres, 62.00, Fuel and transport, Front
  till float, needed today + 1), REQ-0013 (APPROVED, Tafara, PO-0004, 637.80 = PO-0004's total with VAT — let the figure follow the
  data, approved by Tendai), history REQ-0001…0008 rejected (1) and cancelled (1) now; the DISBURSED/ACQUITTED ones (REQ-0009…0012,
  the six acquitted history ones) are seeded by packet 36. Numbers assigned so the board's numbers hold.

## Tests
- Witness.
- `lib/retail/buying/requisitions.test.ts`: every refusal sentence above; limit snapshot; manager approves REQ-0015 (≤ limit, not
  own) but not REQ-0014 (403) nor their own; owner approves anything incl. own; approve less needs a note; reject Other needs a
  message; cancel refused once DISBURSED; one live requisition per order; view-own scoping (cashier gets 404 on another's);
  `waitsFor` naming (one manager vs several); bulk approve skips over-limit for a manager.
- `lib/retail/buying/money-accounts.test.ts`: balance from Float columns without float drift (e.g. 0.1 + 0.2 cases), sub texts.
- Lookup tests (`expense type` inline add account matching; `money account` kind parsing).
- `lib/retail/nav-badges/nav-badges.test.ts` (to approve per person), waiting provider test.

## Acceptance
1. Migration on dev + test; witness green; reseed.
2. As owner, `/retail/buying/requisitions` vs `RequisitionsList.png`: tabs To approve 2 · To pay out 1 · Receipts due 0 · All n
   (DISBURSED ones arrive with packet 36), toolbar words, badges and tones, Against links/muted, Σ.
3. "+ Ask for money" → vs `ReqOrder.png`: Order "PO-0005 · Afdis Distillers" sub "US$1,940.00", Amount 1,940.00 with the hint,
   Pay from Office safe with its balance sub, Needed by "Tuesday 6 October", note "Tendai Mhlanga approves anything over
   US$500.00."; submit on PO-0004 is refused 409 "REQ-0013 already asks for PO-0004."; on a new draft order → toast "REQ-00nn sent
   to Tendai Mhlanga for approval." (over the limit); owner notified (in-app; WhatsApp `approval-ask` queued). For An expense
   US$85.00 → note "Under US$500.00, a manager can approve it." (vs `ReqExpense.png` layout) and "… sent to Tafara Nyathi for
   approval." only if exactly one manager can decide it, else "… to the managers …".
4. `/retail/buying/requisitions/<REQ-0014>` as owner vs `RequisitionRecord.png` (no budget clause): header, actions, primary
   "Approve US$1,940.00", steps, chips, figure, KPIs, chart, tabs What it pays for 6 (Σ lines ex VAT) · Approvals 1 · Receipts 0 ·
   Activity, rail rows.
5. As `tafara.manager@`: REQ-0014 shows no approve actions and `POST …/approve` → 403 "Over US$500.00 needs Tendai Mhlanga.";
   REQ-0015 shows them; approving REQ-0015 works; the badge reads "1 to approve" before.
6. Approve a different amount on REQ-0014 (as owner): 1,500.00 + "Tell Tafara why" → "Approve US$1,500.00" → toast "US$1,500.00
   approved. Tafara can pay it out."; DB APPROVED, `approvedAmount` 1500; `requisition-decided` message queued to Tafara; Approvals
   tab rows. (On a fresh reseed:) Reject "Pay another way" + message → "REQ-0014 rejected. Tafara has been told why."; as Tafara the
   record offers "Change and ask again" → `req-new` prefilled.
7. Cancel on REQ-0013 → ask body built from data (vs `ReqCancel.png` wording) → Cancelled; Tafara notified; order chip gone.
8. As `chipo.till@`: only her own requisitions, no "Asked by" filter, another's id → 404; she can ask for an expense. As
   `tendai.stock@`: can ask for an expense. As `bookkeeper@`: reads all, no decide actions.
9. `npx eslint <changed>`; `npx vitest run lib/retail/buying lib/retail/lookups.test.ts lib/retail/nav-badges lib/retail/approvals
   lib/retail/route-guard-coverage.test.ts`; `pnpm typecheck` alone.

## Depends on
Packet 31 (orders, `order` lookup, `raiseOrder`), packet 30 (`payee`), ADM-04 (landed: limits, notify, waiting), SET-07 (outbox).

## Risk
standard (no money moves in this unit: no payout, no ledger, no `BankTransaction`; balances are read only). Pitfalls: Float money
columns on `BankAccount`/`BankTransaction` — sum as Decimal; the limit is snapshotted at asking; "view-own" must answer 404, not 403,
for another person's requisition.

## Open questions
- Money-account kind/ledger, the `money account` lookup and the attachments upload moved here from BUY-05/BUY-06 because this unit's
  sheets name them first.
- Expense note limit (spec open question 10): built from the setting (US$500.00), not the board's US$100.00.
- ZiG requisitions (open question 13): allowed; "Pay from" must hold the chosen currency; no ZiG account is seeded.
- The pay-out gap between this packet and packet 36 is accepted rather than porting the old expense-on-1010 pay.


> Coordinator note (2026-10-06, packet 90): every date this packet takes is entered through the shared picker. Use sheet fields
> `t: "date"` (or `t: "datetime"` for a day and time) with `earliest`/`latest`, rail edits `type: "date"`, and list periods through
> ListFrame's "Choose dates…". Values are `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm` shop days, which the server turns into instants with
> `startOfDayIn(day, SHOP_TIME_ZONE)`. Never use `<input type="date">` or `datetime-local`.
