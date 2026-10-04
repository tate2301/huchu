# 40 · Buying and paying suppliers — build spec

Area: **04 Buying and paying** (canvas page `buying`, 30 boards, plus `WfBuying` on the workflows page). Workflows W-25,
W-29 to W-36, W-70, W-71, W-72. Canvas: "Corelith data tables", version 32. Board images:
`scratchpad/shots-v32/<Board>.png` (1440 wide). Unit ids: BUY-01 … BUY-10. Migration slot: `2026100413MMSS`, this area
uses `20261004134000` to `20261004134600`.

The handover brief's rules apply (scratchpad `handover-brief.md`): matching the canvas means the same layout, copy, columns,
filters, actions and states **on real data from real endpoints**; the canvas chooses the direction where code and canvas
disagree; roles are enforced on the server; no backward compatibility (what a change replaces is removed in the same unit).

Foundations this area builds on, written in `00-foundations.md` and **not** re-specified here:

| Alias | Foundation units | What this area uses from it |
|---|---|---|
| FND-THEME | FND-01, FND-02 | Tender role tokens, tones `ok warn bad info neutral hollow pending gold`, mono figures, G1 selected state, workspace components. |
| FND-SHELL | FND-03 | Rail, the Buying module panel (Suppliers, Orders "3 open", Deliveries, Requisitions "2 to approve", Bills "1 overdue"), 48px page header (back / title / reference or sub / actions / primary), nav `requires`, nav badges (`lib/retail/nav-badges.ts`). FND-03 also `git mv`s `app/retail/purchasing/orders/**` → `app/retail/buying/orders/**`, `purchasing/receipts` → `buying/deliveries`, `purchasing/requisitions/**` → `buying/requisitions/**`; this area then rebuilds those pages. |
| FND-LIST | FND-04, FND-05 | List sources (`ReportDefinition.list`, 5.4.2), `GET /api/v2/reports/[key]` list mode, tabs with counts, toolbar, filters popover, sort/group/columns, Export (W-55), selection bar and bulk actions, row ⋯ menu, cells (5.4.7), totals band, pager, loading/empty/no-match/error states, phone cards, the empty-list guide (5.12.2). |
| FND-RECORD | FND-06 | RecordFrame (header with action group and ⋯, bin banner, strip with steps/chips/figure, KPI strip, chart panel, tabs with Export and the "all" link, details rail edited in place W-62, Activity W-60), ConfirmDialog (5.8) incl. the asks `closeshort`, `removeorder`, `cancelreq` already written there, the bin registry (W-63), `GET /api/v2/retail/records/[type]/[id]/pdf` (renderers owned by areas). |
| FND-SHEET | FND-07 | SheetForm (520/760px, steps, sections, folds, field types incl. `lines` and `photo`, `auto` with inline add through `GET/POST /api/v2/retail/lookup/[noun]`), sheet host `?sheet=<kind>&id=&ids=`, toast (5.9). |
| FND-DASH, FND-SETTINGS | — | Not used by this area. |

Cross-area units this area relies on (specs written in parallel; reconcile ids before build, open question 1):
`SET-02` sites and the `site` lookup noun; `SET-07` the message outbox (`RetailMessage`, `lib/messaging/whatsapp.ts`, the outbox
drain and the retail worker `scripts/retail-worker.ts`); `SET-09` posting settings (`PostingRuleLineAccountSource.ROLE_MAPPING`,
`RetailAccountRole`); `PRD-01` the bookkeeper user and `FINANCE_OFFICER` grants pattern; `PRD-03` `Product.supplierId` →
`Vendor`, the `product` lookup noun with quick add, `createProduct`, `repriceCostFollowers`; `STK` the stock spec's empties ledger
(W-27) and On hand's "Add to an order"; `ADM` the admin spec's Approvals settings (W-58: "Requisitions need the owner over",
"Owner approvals go to", "Ask by") and the `person` lookup noun; `FLR` the floor spec's Overview "Needs action".

Roles map to `UserRole` as the Roles board says: **Owner** `SUPERADMIN`; **Manager** `MANAGER`, `SHOP_MANAGER`; **Cashier**
`CASHIER`, `POS_CASHIER`; **Stock clerk** `STOCK_CLERK`; **Bookkeeper** `FINANCE_OFFICER`.

Copy rule: every quoted string is the board's own wording unless marked **Defined here** (the board shows the control but not its
contents, or the state is not drawn). Sentence case, British English, no exclamation marks, money as "US$1,940.00", ZiG as
"ZiG 1,250.00".

---

## Decisions at a glance

1. **A supplier is a `Vendor`.** The accounting module's AP vendor (already used by the gold module and named by PRD-03 as
   `Product.supplierId`'s target) gains the retail fields (terms, delivery days, lead time, minimum, WhatsApp) and a
   `VendorContact` table. One supplier list per business; the bookkeeper's AP ageing and vendor statements see the shop's bills.
2. **A bill is a `PurchaseBill`, a payment is `PurchasePayment` rows.** A retail bill points at the delivery it is for. One
   payment that settles several bills "oldest first" is several `PurchasePayment` rows sharing a `groupNo` ("PAY-0019");
   money paid with no bill to settle (an overpayment, or cash handed out on an order requisition) is a row with no bill: a
   credit on the supplier's account, applied to the next bill. Retail bills post through their own source type
   (`RETAIL_SUPPLIER_BILL`: Dr GRNI, Dr VAT input, ± price difference, Cr Accounts Payable), never through the accounting
   module's `PURCHASE_BILL` rule (which expenses to 5000).
3. **Money accounts are `BankAccount` rows** with a kind (Cash, Bank, Mobile) and a ledger account: "Office safe", "Front till
   float", "CBZ current account", "EcoCash merchant". Their balance is `openingBalance` plus their `BankTransaction`s. Every
   payout, change returned and supplier payment writes one transaction and posts to the account's own ledger account.
4. **Requisitions stay `CrmRequisition`** (the C6 decision: one way of asking for money in the business), now with the canvas's
   acquittal ("Account for it"). **Paying out is recorded as paid with no till-drawer movement**: it writes a money-account
   transaction and a ledger posting, never a `RetailCashMovement`, so no shift's expected cash changes. This keeps the existing
   decision in `lib/retail/requisitions.ts`.
5. **Costs are ex VAT; totals carry VAT.** An order or delivery line stores its unit cost ex VAT and the product's VAT rate
   (`Product.defaultTaxRate`) at the time; an order's "Total" and a delivery's billable value add VAT per line. A delivery
   books stock at cost ex VAT (Dr Inventory / Cr GRNI, the existing rule). A bill is compared with the delivery's value with
   VAT. REQ-0014's figures prove the basis: six lines at US$1,686.96 are "US$1,940.00 … with VAT" at 15%.
6. **Order states:** `DRAFT` (not sent) · `SENT` · `PARTIAL` (part delivered) · `RECEIVED` · `CLOSED` (closed with what came,
   reopenable until billed) · `CANCELLED` (what was left cancelled before anything came). "Billed" is derived (every posted
   delivery of the order has a bill). "Late" is derived: still owed and today is after the date first expected.
7. **Two people on a delivery.** A stock clerk counts and saves (`COUNTED`, nothing moves); an owner or manager checks and
   posts (`POSTED`: stock, order, ledger). An owner or manager receiving on their own posts straight away and is both. This
   is what the Delivery record's steps (Arrived · Counted · Checked · In stock · Billed) and its "Post to stock" primary mean.
8. **References, company-wide:** `SUP-0001`, `PO-0001`, `GRN-0001`, `REQ-0001`, `RTN-0001`, `PAY-0001` (`lib/id-generator.ts`;
   the current per-site `RPO`/`RGR` prefixes go).
9. **WhatsApp goes through SET-07's outbox.** `RetailMessage` gains a direction and an entity link so an order's sent order,
   reminders and the supplier's replies sit on the order ("The message and their reply are kept on the order."); replies
   arrive through the WhatsApp webhook.
10. **Routes** (FND 5.3.4): `/retail/buying/suppliers`, `/retail/buying/suppliers/[id]`, `/retail/buying/orders`,
    `/retail/buying/orders/[id]`, `/retail/buying/orders/[id]/receive`, `/retail/buying/deliveries`,
    `/retail/buying/deliveries/[id]`, `/retail/buying/requisitions`, `/retail/buying/requisitions/[id]`, `/retail/buying/bills`.
    APIs live under `/api/v2/retail/buying/**`; lists under `/api/v2/reports/retail-*`.

---

## 1. Boards

Canvas reading order of page `buying` (rows: W-29; W-30/34/70/71; W-31/32/72; W-33/25; W-35/36), then the workflow board.
"Code today" was checked against the source at `c78d01f` and screenshots of the running app as `owner@bottlestore.test` and
`tendai.stock@bottlestore.test`, saved in `scratchpad/smoke/buy40/` (`orders.png`, `order-record.png`, `receive-dialog.png`,
`deliveries.png`, `requisitions.png`, `requisition-record.png`, `orders-stockclerk.png`, `suppliers-404.png`). Every page today
uses the old chrome (Corelith blue, app bar with Search/bell/check, panel search, Help and Management rows, "HS" tile), which
FND-SHELL replaces; that difference is not repeated per row. The demo tenant today has 2 orders (`PO-00001` part delivered,
`RPO-0001` closed short), 2 deliveries (`GRN-00001`, `RGR-0001`), 1 requisition (`REQ-0001`, paid), 0 vendors, 0 bills.

| # | Board file | Canvas title | What it is | Target route, or where it opens | Code today | Notes |
|---|---|---|---|---|---|---|
| 1 | `SuppliersList.dc.html` | Suppliers | list | `/retail/buying/suppliers` | **Missing.** No supplier anywhere in retail: orders and deliveries carry a free-text `supplierName`. `Vendor` exists only for the accounting module (0 rows on this tenant). `/retail/buying/suppliers` is a 404 (`suppliers-404.png`). | Source `retail-suppliers` (BUY-01). |
| 2 | `SupplierNew.dc.html` | 1  New supplier: only the name is needed | sheet (W-29) | `?sheet=supplier-new` over Suppliers; the same create runs from every `auto` supplier field's inline add | **Missing.** | BUY-01. Board draws the `supplier` kind (K). |
| 3 | `SupplierRecord.dc.html` | 2  Supplier record: click any detail to change it | record | `/retail/buying/suppliers/[id]` | **Missing.** | BUY-01 (tabs Bills/Payments/Returns filled by BUY-07/BUY-09). |
| 4 | `ContactNew.dc.html` | 3  Add a contact: who gets orders, who gets statements | sheet (W-29) | `?sheet=contact-new&supplierId=<id>` over the supplier record (⋯ "Add a contact") | **Missing.** | BUY-01. |
| 5 | `OrdersList.dc.html` | Orders | list | `/retail/buying/orders` | **Exists but differs.** `/retail/purchasing/orders` (`orders.png`): `RecordListShell` + `ColumnList`; Order (ref, supplier and site stacked), Status dot ("Closed short", "Part delivered"), Expected, Delivered "300 of 780", Value "$624.00"; search and a Status filter; "2 of 2". No tabs, Supplier/Site filters, Raised, bars, Still to come, totals, selection, bulk, row ⋯, sort/group/columns/export, pager. Refs `RPO-0001`/`PO-00001`. Stock clerk sees the list with no "New order" (`orders-stockclerk.png`). | Source `retail-orders` (BUY-02). |
| 6 | `OrderNew.dc.html` | 1  New order: suggested lines from what is low | sheet, wide (W-30) | `?sheet=order-new` over Orders (also `&supplierId=`, `&productIds=`) | **Exists but differs.** Centred `OrderDialog` (`app/retail/purchasing/orders/_components/order-dialog.tsx`): supplier as free text, site, expected, product/quantity/cost lines, notes, one "Save" (the order is only stored, never sent). No suggested lines, no lead-time expected date, no paying or "Ask for the cash now", no WhatsApp, no draft/send split. | BUY-02. |
| 7 | `OrderRecord.dc.html` | 2  Order record: part delivered | record | `/retail/buying/orders/[id]` | **Exists but differs.** `/retail/purchasing/orders/[id]` (`order-record.png`): header "PO-00001 · Part delivered", outline "Receive a delivery", ⋯ (Edit order, Close the rest, Reopen the order, Remove order); a field list (Supplier, Site, Expected, Raised, Value, Still to come) and a Products table with a Total. No steps strip, KPIs, chart, tabs (Deliveries, Messages, Activity), rail editing, "Send a reminder", "Print", "Duplicate order", PDF. | BUY-02 (record), BUY-03 (its follow-up actions). |
| 8 | `OrderEdit.dc.html` | 3  Edit lines, or cancel what is left | sheet, wide (W-30, W-70) | `?sheet=order-edit&id=<id>` over the order record ("Edit lines"; ⋯ "Cancel what is left" opens it too) | **Exists but differs.** The same `OrderDialog` titled "Edit order". The rule "a line cannot go below what was delivered" is enforced (`planOrderLineEdits`, `lib/retail/purchase-orders.ts`) ✓. No "Save and tell Delta", no "Save without telling them", no "Cancel what is left". | BUY-02 (edit), BUY-03 (cancel what is left). |
| 9 | `OrderChase.dc.html` | W-34  Chase a late order on WhatsApp | sheet (W-34) | `?sheet=order-chase&id=<id>` over the order record ("Send a reminder") | **Missing.** | BUY-03. |
| 10 | `OrderCloseShort.dc.html` | W-70  Close an order with what came | confirm (W-70) | ConfirmDialog `closeshort` over the order record (⋯ "Close with what came") | **Exists but differs.** ⋯ "Close the rest" → `dsConfirm` "Stop waiting for the rest of PO-00001?" → `POST …/orders/[id]/close` (status `CLOSED`, audit `RETAIL_PURCHASE_ORDER.CLOSED`) ✓. Reopen exists with no "until a bill is recorded" rule; wording differs. | BUY-03. |
| 11 | `OrderRemove.dc.html` | W-71  Remove a draft order nothing came against | confirm (W-71) | ConfirmDialog `removeorder` over a draft order's record (⋯ "Remove the order") | **Exists but differs.** ⋯ "Remove order" hard-deletes the order (`DELETE …/orders/[id]`) whenever nothing came, sent or not; no bin, no 30 days, no restore. | BUY-03 (bin kind `order`). |
| 12 | `RequisitionsList.dc.html` | Requisitions | list | `/retail/buying/requisitions` | **Exists but differs.** `/retail/purchasing/requisitions` (`requisitions.png`): Requisition, Kind, Status, Needed by, Amount; Status filter. No tabs, Purpose/Asked by filters, What for, Against, totals, bulk (Approve, Reject, Pay out). | Source `retail-requisitions` (BUY-04). |
| 13 | `ReqOrder.dc.html` | 1  Ask for money for an order | sheet, steps (W-31) | `?sheet=req-new&for=order` over Requisitions (primary "Ask for money"); `&orderId=` from an order | **Missing.** The dialog has no order purpose, currency, "Pay from" or order link. | BUY-04. |
| 14 | `ReqExpense.dc.html` | 1  Or for an expense | sheet, steps (W-32) | `?sheet=req-new&for=expense` over Requisitions (the same sheet with For = An expense) | **Exists but differs.** Centred `RequisitionDialog`: site, category (Shop supplies, Equipment and repairs, Transport, Fuel, Airtime and data, Casual labour, Something else), purpose, amount, needed by, notes, "send now". No expense types tied to accounts, currency, Pay from, Pay to, quote. | BUY-04. |
| 15 | `RequisitionRecord.dc.html` | 2  The owner approves | record | `/retail/buying/requisitions/[id]` | **Exists but differs.** `/retail/purchasing/requisitions/[id]` (`requisition-record.png`): "REQ-0001 · Paid" with a field list (For, Kind, Asked for, Approved, Shop, Asked by; Decision: Approved by, Paid by) and header buttons Decide / Pay / Cancel by permission. No strip, KPIs, chart, tabs, rail, "Ask a question", PDF. Any manager approves any amount. | BUY-04 (record), BUY-05 (pay out, account for). |
| 16 | `ReqApprove.dc.html` | 2  Approve a different amount | sheet, steps (W-31) | `?sheet=req-approve&id=<id>` over the requisition record; bulk "Approve" on the list | **Exists but differs.** "Decide REQ-…" dialog with "Amount to approve" and "Note to the asker", Approve/Decline. The asker gets an in-app notification only. | BUY-04. |
| 17 | `ReqReject.dc.html` | 2  Or reject, saying why | sheet (W-32) | `?sheet=req-reject&id=<id>` (or `&ids=`) | **Exists but differs.** Decline from the same dialog; no reasons. | BUY-04. |
| 18 | `ReqPayout.dc.html` | 3  Pay it out | sheet, steps (W-31) | `?sheet=req-payout&id=<id>` (or `&ids=`) | **Exists but differs.** Confirm "Pay $25.00 to Tafara Nyathi?" → `DISBURSED` and a ledger event `CRM_REQUISITION_DISBURSEMENT` (credit always 1010). No From/To/How/Reference, no money-account balance. No till-drawer movement ✓ (kept). | BUY-05. |
| 19 | `ReqAcquit.dc.html` | 4  Account for it: receipts and change | sheet, steps (W-31, W-32) | `?sheet=req-acquit&id=<id>` | **Missing.** `lib/retail/requisitions.ts` says "Retail stops at paid … there is no acquittal here"; the canvas adds it. | BUY-05. |
| 20 | `ReqCancel.dc.html` | W-72  Cancel a requisition | confirm (W-72) | ConfirmDialog `cancelreq` over the requisition record (⋯ "Cancel the requisition") | **Exists but differs.** Confirm and `PATCH {action:"cancel"}` work for the asker or a decider in Draft/Submitted/Approved ✓; the asker is not told; the order link does not exist. | BUY-04. |
| 21 | `Receive.dc.html` | 1  Receive against the order: count, damaged, keep or close the rest | page (hand-built, W-33) | `/retail/buying/orders/[id]/receive` (order primary "Receive a delivery"; Overview "Needs action") | **Exists but differs.** "Receive against PO-00001" centred dialog over Deliveries (`receive-dialog.png`): Order, Site, Supplier, product/quantity/cost lines, "Nothing more is coming on PO-00001: close the rest", Notes, "Save delivery" → GRN posted, stock in, order lines filled, journal ✓. No per-line Keep/Close, Damaged column, scan box, guide, "When you post" summary, note number, counted by, photo, empties, paying. | BUY-06. |
| 22 | `DeliveriesList.dc.html` | Deliveries | list | `/retail/buying/deliveries` | **Exists but differs.** `/retail/purchasing/receipts` (`deliveries.png`): Delivery (ref, supplier, site, order stacked), Received, Quantity, Value; search; rows do not open. No Order/Lines/Against the order/Received by columns, filters, totals, bulk. | Source `retail-deliveries` (BUY-08). |
| 23 | `DeliveryRecord.dc.html` | 2  Delivery record | record | `/retail/buying/deliveries/[id]` | **Missing.** | BUY-06 (record), BUY-08 (differences, photos, reverse). |
| 24 | `DeliveryDiff.dc.html` | 3  Record a difference after posting | sheet (W-33) | `?sheet=delivery-difference&id=<delivery id>` over the delivery record | **Missing.** | BUY-08. |
| 25 | `IntakeNew.dc.html` | W-25  Take in stock with no order | sheet, wide (W-25) | `?sheet=intake` over Deliveries (primary "Take in stock") | **Exists but differs.** The receive dialog with Order "No order": supplier free text, lines, notes. No supplier lookup or open-order offer, new product inline, Paying section. | BUY-08 (Cash now needs BUY-05 and BUY-07). |
| 26 | `BillsList.dc.html` | Bills: what is owed and when | list | `/retail/buying/bills` | **Missing** in retail (the accounting module's `/accounting/payables` exists for other products). | Source `retail-bills` (BUY-07). |
| 27 | `BillNew.dc.html` | 1  Record a bill against its delivery | sheet (W-35) | `?sheet=bill-new` over Bills (primary "Record a bill"), over the supplier record (action "Record a bill", `&supplierId=`), over the delivery record (primary "Record a bill", `&deliveryId=`) | **Missing.** | BUY-07. |
| 28 | `BillEdit.dc.html` | 2  Open a bill to change, pay or bin it | sheet (W-35) | `?sheet=bill-edit&id=<bill id>` over Bills (row link) and over the supplier record (Bills tab row) | **Missing.** | BUY-07. Bills have no record page; this sheet is the bill's record. |
| 29 | `PaymentNew.dc.html` | 3  Record a payment, oldest bills first | sheet (W-35) | `?sheet=payment-new&supplierId=<id>` over the supplier record (action "Record a payment"), over Bills (bulk), from bill-edit's secondary | **Missing.** | BUY-07. |
| 30 | `ReturnNew.dc.html` | W-36  Return goods to the supplier | sheet, wide (W-36) | `?sheet=return-new&supplierId=<id>` over the supplier record (⋯ "Return goods") | **Missing.** | BUY-09. |
| 31 | `WfBuying.dc.html` (page `workflows`) | 04 Buying and paying | flow (workflow map, area `buying`) | none | n/a | The W-29…W-36, W-70…W-72 definitions in §2. Nothing to build. |

Boards reachable from these that another area owns (built there, linked from here):

| Board | Reached from | Owner | What this area relies on / provides |
|---|---|---|---|
| `MessageNew.dc.html` | Suppliers bulk "Message on WhatsApp", supplier record "Message on WhatsApp" (List/Record `LINK`) | customers spec (`message` kind) | This area defines its own `supplier-message` kind on the same layout (§5.13), because the customer kind's audience options ("Gold customers"…) mean nothing for suppliers. |
| `BinList.dc.html` (W-63) | W-71 screen key `bin` | admin spec | Lists binned draft orders (kind `order`) and bills (kind `bill`) registered by this area; restore calls this area's restore. |
| `ApprovalSettings.dc.html` (W-58) | Requisition rail "Needs approval", sheet notes | admin spec | `getApprovalLimits(companyId)` → `{ requisitionOwnerOver, ownerApproverId, askBy }`. Until it ships: US$500.00, the oldest active `SUPERADMIN`, "WhatsApp and the app". |
| `StockList.dc.html`, `Reorder.dc.html` (W-21) | On hand bulk "Add to an order" | stock spec | Opens `?sheet=order-new&productIds=<…>` (this area). |
| `Product.dc.html` | Product record "Receive stock", "Add to an order", Suppliers tab, ledger rows "Received PO-0003" | products spec | "Add to an order" → `?sheet=order-new&productIds=<id>`; "Receive stock" → `/retail/buying/orders/<open order with this product>/receive`, or `?sheet=intake&productIds=<id>` over Deliveries when no open order has it (replaces PRD's placeholder `/retail/buying/deliveries/new`). |
| `EmptiesReturn.dc.html`, `EmptiesList.dc.html` (W-27) | Receive page "Empties going back" | stock spec | The Receive page calls the stock spec's `returnEmptiesToSupplier` with the crates and the delivery id. |
| `InsightsProducts.dc.html` (W-54) | "Promote, return or write off" | insights spec | Opens `?sheet=return-new&productIds=<…>` over the product's supplier record. |
| `Floor.dc.html` | Needs action "Purchase order PO-0031 due today", late orders | floor spec | Late orders → `/retail/buying/orders/<id>?sheet=order-chase&id=<id>`; due today → `/retail/buying/orders/<id>/receive`; requisitions to approve → `/retail/buying/requisitions?tab=approve`; bills due → `/retail/buying/bills?tab=overdue`. |
| `Guided.dc.html` | Suppliers empty guide; checklist "Add your suppliers" | foundations / setup | The Suppliers guide copy (§5.1) and "Add a supplier" → `/retail/buying/suppliers?sheet=supplier-new`. |

### Module navigation (from the List template `M.buying`)

Panel title "Buying"; items in order: Suppliers (`Storefront`), Orders (`TrayArrowDown`, badge "3 open"), Deliveries (`Truck`),
Requisitions (`Money`, badge "2 to approve"), Bills (`Receipt`, badge "1 overdue"). Visibility (FND 5.3.4): Owner, Manager (Bills
read-only) and Bookkeeper see all five; Cashier sees Requisitions only (own); Stock clerk sees Suppliers, Orders, Deliveries
and Requisitions (own). Badge providers (this area, `lib/retail/buying/badges.ts`, registered in
`lib/retail/nav-badges.ts`):

| Item | Label | Rule | Shown to |
|---|---|---|---|
| Orders | "<n> open" | orders `SENT` or `PARTIAL`, not binned | anyone with `retail.purchasing:view` |
| Requisitions | "<n> to approve" | `SUBMITTED` requisitions this person may decide (owner: all; manager: not their own and at or under the owner limit) | approvers only |
| Bills | "<n> overdue" | non-binned bills with a balance and a due date before today (Africa/Harare) | anyone with `retail.bills:view` |

No badge when the count is 0. The Receive page board draws an older four-item panel; the five-item panel above wins.

---
## 2. Workflows

Each flow: who, where it starts, its steps (the map's words), and per step the screen, the server work, the permission (§3.1)
and what changes elsewhere. "Code today" says what already works. Every write below runs in one transaction with its audit
event (§3.4); WhatsApp sends are queued in the outbox inside that transaction and leave with the drain (SET-07), so a failed
send never undoes the record. Notifications go through `emitRetailNotification` after commit. Dates are Africa/Harare.

### W-29 Add a supplier — Manager — "Suppliers, or the supplier field anywhere" — not guided

Steps: Name and phone · Terms · Save. Screens: suppliers, suppliernew, supplier, contactnew.

| Step | Screen and control | Server |
|---|---|---|
| Open | Suppliers primary "+ New supplier" → `?sheet=supplier-new`. Or, in any `auto` supplier field (order, intake, bill, return, the product form's Supplier, a requisition's Pay to), "Add ‘Mutare Wholesalers’ as a new supplier" → inline panel "New supplier" with Name and "Phone or WhatsApp" ("+263 7"). Or the Suppliers empty guide "Add your first supplier". | `retail.suppliers:create` (Owner, Manager). Others see no primary, no guide button, no add option; the endpoint answers 403 "Your role cannot create suppliers". |
| Name and phone | Name; Phone (mono, half); Email (optional, half); "Send orders on WhatsApp" (on) with the live hint "Orders go to <phone> as a message with a PDF." | Name: trimmed, 1–120, unique among the company's suppliers that are still bought from (case-insensitive) → 409 `fieldErrors.name` "There is already a supplier called Afdis Distillers.". Phone: optional (the note: "Only the name is needed."); normalised to `+263 77 301 2290` form (spaces kept in groups as typed), 9–15 digits → 400 "Write it as +263 77 123 4567.". Email: valid address → 400 "That is not an email address.". The WhatsApp number is set to the phone; it can be changed on the record. |
| Terms | Pays (On delivery · 7 days · 14 days · 30 days, default On delivery); Delivers (text, half); Lead time (text, half, "2 days"); Minimum order (money, optional, half). | `payTermsDays` null/7/14/30. Lead time parsed to whole days 0–60 ("2", "2 days", "two days" not accepted) → 400 "Write it as a number of days, like 2 days.". Minimum ≥ 0.00. |
| More details | Fold "More details · VAT, BP number, bank, address": VAT number, BP number, Bank account, Address. | VAT number 8 digits → 400 "A VAT number has 8 digits."; BP number 9–10 digits → 400 "A BP number has 9 or 10 digits."; bank and address free text ≤ 300. |
| Save | "Add supplier". | `POST /api/v2/retail/buying/suppliers` → `createSupplier` (`lib/retail/buying/suppliers.ts`): `Vendor` with `code` = next `SUP-nnnn` (`reserveIdentifier` entity `RETAIL_SUPPLIER`), `isActive` true, `createdById`; audit `RETAIL_SUPPLIER.CREATED { code, name }`. Inline add (`POST /api/v2/retail/lookup/supplier`) runs the same service with Name and Phone only. Toast "Afdis Distillers added. It is in every supplier field now." with "Open". |
| Add a contact | Supplier record ⋯ "Add a contact" → `?sheet=contact-new&supplierId=<id>`: Name, Role (auto: Sales rep, Accounts, Orders desk, Driver; inline add of a new role word), Phone or WhatsApp, Email (optional), "Sends them" (Orders · Statements · Nothing). | `POST /api/v2/retail/buying/suppliers/[id]/contacts`, `retail.suppliers:update` (Owner, Manager, Bookkeeper). Name required; a phone or an email is required → 400 `fieldErrors.phone` "Add a phone or an email so we can reach them.". Creates `VendorContact`. When the role is "Sales rep" and the supplier has no rep yet, this contact becomes the rep (`Vendor.contactName` = name, shown as "Rep" and in the list's Contact column). Audit `RETAIL_SUPPLIER.CONTACT_ADDED { name, role, sends }`. Toast "Rumbi Chari added to Delta Beverages." |
| Change details | Rail, "click any value to change it" (W-62): Rep, Phone, WhatsApp, Email, Pays, Delivers, Minimum, Lead time, VAT number, BP number, Bank. | `PATCH /api/v2/retail/buying/suppliers/[id]` (FND 4.9), `retail.suppliers:update`; the same validation per field; `RETAIL_RECORD.EDITED` per field. "Rep" picks one of the supplier's contacts (auto over noun `contact` with `context.supplierId`, inline add creates a Sales rep contact). |
| Stop buying | ⋯ "Stop buying from them" (bad) → ConfirmDialog `stopbuying` (**Defined here**, §5.32). | `POST /api/v2/retail/buying/suppliers/[id]/stop`, `retail.suppliers:delete` (Owner, Manager): `isActive` false, `stoppedAt`, `stoppedById`; refused 409 "PO-0005 is still open with Afdis Distillers. Close or cancel it first." while an order is `DRAFT`, `SENT` or `PARTIAL`. Bills and payments stay; the supplier leaves the Suppliers list's default view and every supplier lookup. Audit `RETAIL_SUPPLIER.STOPPED`. The record shows a banner "You stopped buying from <name> on <date>. Orders cannot be raised to them." with "Buy from them again" (`DELETE …/stop`, audit `RETAIL_SUPPLIER.RESUMED`). Suppliers are never moved to the bin: they carry bills and payments. |

Other screens that change: every supplier field; the Suppliers list; the setup checklist's "Add your suppliers" item ticks when
the first supplier exists (FND 4.7 rule "≥1 supplier"); the product form's Supplier field (PRD-03).

Code today: none (no supplier model in retail).

### W-30 Raise and send an order — Manager — "Low stock, a supplier, or Orders" — guided

Steps: Suggested lines · Adjust · Send on WhatsApp or email. Screens: orders, ordernew, order, orderedit.

| Step | Screen and control | Server |
|---|---|---|
| Open | Orders primary "+ New order" (`?sheet=order-new`); supplier record primary "New order" (`&supplierId=`); On hand and Products bulk "Add to an order", product record "Add to an order" (`&productIds=<…>`); Suppliers bulk "New order for each" (the sheet steps through the ticked suppliers, sub "Buying › Orders · 1 of 3", **Defined here**). | `retail.purchasing:create` (Owner, Manager). The stock clerk has no primary and the sheet answers 403 "Your role cannot create purchase orders" ("Stock clerks receive; they do not order."). |
| Suggested lines | Supplier (auto, sub "Beverages, 30 days" = top category and terms); choosing one fills Expected (today + lead time, hint "From their lead time: 2 days."), Deliver to (default site) and the Lines from `GET /api/v2/retail/buying/suppliers/[id]/suggestions?siteId=`. Each line: name, sub ("Low: 18 left, sells 31 a day" in warn, or "Usual order"), quantity input, cost, value, ×. Hint under the lines: "Suggested from what is low and what you usually buy from Delta. Change any quantity." | Suggestion rule (**Defined here**, `lib/retail/buying/suggest.ts`, unit-tested): products whose `supplierId` is this supplier, live and selling, stocked at the site. **Low** when on hand ≤ reorder level (`InventoryItem.minStock`): quantity = `reorderQuantity` when set, else enough for 14 days of the last 30 days' average daily sales plus the lead time, minus on hand, rounded up to the product's case size when it has a pack, minimum 1; sub "Low: <on hand> left, sells <avg, whole number> a day". **Usual order** when not low and the product was on at least 2 of this supplier's last 3 orders: quantity = the median of those quantities. Low lines first (most days of cover lost first), then usual ones by name. Cost = the product's last delivered cost from this supplier, else `InventoryItem.unitCost`. With `productIds`: exactly those products (sub as above), the supplier preset to the one most of them name. |
| Adjust | Quantities, × to remove, "Add a product: search, scan, or add a new one" (auto over `product`, PRD's quick add). Paying: "On account" / "Cash on delivery" (default from terms: On delivery → Cash on delivery); "Ask for the cash now" (off, hint "Creates a requisition for the order total, for the owner to approve before the truck comes."); "Note to the supplier" (optional). Footer note "Delta pays 30 days. Their minimum is US$500.00." | Client totals per line (quantity × cost) and "Σ <n> lines", quantity total, value total (ex VAT). When the order's total with VAT is under the supplier's minimum the note reads, in warn, "Delta's minimum is US$500.00. This order is US$412.80." (**Defined here**; sending is still allowed). Quantity whole numbers > 0 (`inputmode="numeric"`) → 400 `fieldErrors.lines` "Each line needs a quantity.". At least one line to send → 400 "Add at least one line.". |
| Send on WhatsApp | Primary "Send on WhatsApp" (label follows the channel, **Defined here**: "Send by email" when the supplier has no WhatsApp number or "Send orders on WhatsApp" is off and an email exists; "Save and print" when neither exists). Secondary "Save as draft". | `POST /api/v2/retail/buying/orders` `{ send: true }` → `raiseOrder` (`lib/retail/buying/orders.ts`): validates supplier (live, bought from: 409 "You stopped buying from Pamela."), site, lines; `RetailPurchaseOrder` `PO-nnnn` (company-wide), `vendorId`, `siteId`, `expectedDate` and `firstExpectedDate`, `payment`, `noteToSupplier`, lines with `unitCost`, `vatRate` (from the product), `lineTotal`; with `send`: status `SENT`, `sentAt`, `sentById`, `sentVia`; the order PDF (`renderOrderPdf`, §4.10) and one `RetailMessage` per recipient (`direction OUT`, `template "purchase-order"`, `entityType "RetailPurchaseOrder"`, body below, `attachmentUrl` = a signed 30-day link to the PDF). Recipients: contacts whose "Sends them" is Orders (WhatsApp to their phone when the supplier sends on WhatsApp, else email), else the supplier's WhatsApp number, else its email; "Save and print" sends nothing and opens the PDF (`sentVia BY_HAND`). With "Ask for the cash now": a requisition for the order total with VAT (§W-31) in the same transaction, `SUBMITTED`, approvers told. Audit `RETAIL_PURCHASE_ORDER.CREATED { poNo, supplier, lines, value }` and `.SENT { via, to }`. Toast "PO-0031 sent to Delta Beverages on WhatsApp." (or "… by email.", "PO-0031 saved. Print it from the order." **Defined here**) with "Open". Draft: `send: false` → `DRAFT`, toast "PO-0031 saved as a draft." (**Defined here**). |
| Message | — | Body (**Defined here**): "Hello Tinashe, here is order PO-0031 from Harare Bottle Store for Harare Main Branch, expected Wednesday 7 October: Castle Lager 340ml 240, Chibuku Scud 1L 240, Coca-Cola 500ml 180, Sprite 500ml 120. Total US$643.08, on account, 30 days. <note to the supplier> The order is attached." ("Hello" alone when the recipient has no first name.) |
| Send a draft | Draft order primary "Send to Delta" (first word of the supplier name); Orders bulk "Send to suppliers". | `POST /api/v2/retail/buying/orders/[id]/send` (and `/orders/bulk/send { ids }`): `DRAFT` only (409 "PO-0004 has already been sent."), at least one line; same message and audit; `firstExpectedDate` set to the expected date at sending. Bulk answers `{ sent, skipped }`; toast "3 orders sent." / "2 orders sent. PO-0007 has no lines." (**Defined here**). |
| Edit lines | Record "Edit lines" → `?sheet=order-edit&id=`: Expected, Deliver to, Lines (ql "Ordered"; sub "120 delivered"), hint "A line cannot go below what was delivered. To drop what is left, set it to what came."; "Save and tell Delta" (primary), "Save without telling them" (secondary), "Cancel what is left" (danger, W-70/W-34). For a draft: title "Edit PO-0007", sub "Delta Beverages · draft", only "Save" (**Defined here**). | `PATCH /api/v2/retail/buying/orders/[id]` `{ expectedDate, siteId, lines, tell }`, `retail.purchasing:update` (Owner, Manager): `planOrderLineEdits` (kept): 409 "120 of Castle Lager 340ml have already come; the order cannot ask for fewer.", "Castle Lager 340ml has been delivered and cannot come off the order."; the site cannot change once anything came (409 kept). Not on `RECEIVED`, `CLOSED`, `CANCELLED` (409 "PO-0001 is done. Duplicate it to order again."). Status recomputed (`orderStatusFor`). With `tell` (sent orders): a message "PO-0003 has changed: Castle Lager 340ml 240 → 300. Expected 7 October. The new order is attached." to the same recipients. Audit `RETAIL_PURCHASE_ORDER.CHANGED { changes: [{ item, from, to }], expected, told }`. Toast "PO-0003 changed. Delta has the new order." / "PO-0003 changed." (**Defined here** for without telling). |
| Duplicate | ⋯ "Duplicate order". | `POST /orders/[id]/duplicate`, `retail.purchasing:create`: a new `DRAFT` for the same supplier and site with the same products and quantities at today's costs, expected today + lead time, `duplicatedFromId`; navigates to it; toast "PO-0032 made from PO-0003. Check it and send." (**Defined here**). |
| Print / PDF | Record "Print" and ⋯ "Export as PDF". | `GET /api/v2/retail/records/RetailPurchaseOrder/[id]/pdf` (FND path; this area's renderer). "Print" opens it in a new tab with `?print=1` (auto print dialog). |

Other screens that change: Orders tabs and totals; the "3 open" badge; the supplier record's Orders tab and KPIs; the
product record (products spec) "On order" when it reads open order lines; Requisitions when cash was asked for.

Code today: an order can be created, edited (with the "not below what came" rule) and removed; nothing is ever sent;
suppliers are typed names; no suggestions.

### W-31 Ask for money to pay an order — Manager — "The order, Ask for money" — guided

Steps: Amount is the order · Submit · Owner approves · Paid out · Receipt attached. Screens: reqorder, req, reqapprove,
reqpayout, reqacquit. The sheet's steps strip ("Asked · Approved · Paid out · Accounted for") is the guide.

| Step | Screen and control | Server |
|---|---|---|
| Amount is the order | Requisitions primary "+ Ask for money" → `?sheet=req-new&for=order`; order ⋯ "Ask for money" (**Defined here**: the record board has no entry, the map starts W-31 there) → `&orderId=`; New order's "Ask for the cash now"; Receive page "Paid in cash instead?" → "Ask for money". For = "An order"; Order (auto over `order`: open or draft orders without a live requisition, label "PO-0005 · Afdis Distillers", sub the total "US$1,940.00"); Amount defaults to the order total with VAT, hint "The order total. Lower it to pay part now."; Currency US$ / ZiG; Pay from (auto `money account`, sub the balance "US$2,410.00" or "•••• 4471"); Needed by (default the order's expected date, "Tuesday 6 October"); Why. Note "Tendai Mhlanga approves anything over US$500.00." (from the approvals settings; under the limit: "Any manager can approve up to US$500.00." **Defined here**). | `retail.requisitions:create` (everyone on staff). Inline add of an order (quick fields Supplier, Expected) creates a `DRAFT` order with no lines (`retail.purchasing:create` only). Amount > 0 and ≤ the order total → 400 `fieldErrors.amount` "Ask for the order total or less."; one live requisition per order → 409 "REQ-0014 already asks for PO-0005." (live = Submitted, Approved, Paid out). |
| Submit | "Submit for approval". | `POST /api/v2/retail/buying/requisitions` → `askForMoney` (`lib/retail/buying/requisitions.ts`): `CrmRequisition` `REQ-nnnn`, `category STOCK`, `purchaseOrderId`, `purpose` = "Cash to pay Afdis for order PO-0005" (built; the Why goes to `notes`), `amount`, `currency` (USD/ZWG), `bankAccountId` (pay from), `payeeVendorId` = the order's supplier, `neededBy`, `siteId` = the order's site, `status SUBMITTED`, `submittedAt`, `approvalLimit` and `approverId` snapshot (over the limit → the owner approver; else null = any manager); audit `RETAIL_REQUISITION.ASKED`; notification `CRM_REQUISITION_SUBMITTED` to who may decide it, and a WhatsApp to the owner approver when the settings say "WhatsApp and the app". Done "REQ-0015 sent to Tendai Mhlanga for approval." (under the limit: "REQ-0015 sent to the managers for approval." **Defined here**). |
| Owner approves | Record primary "Approve US$1,940.00"; "Approve a different amount" (`req-approve`); "Reject" (`req-reject`, W-32); "Ask a question" (**Defined here**, §5.21). | `POST /requisitions/[id]/approve { amount?, note? }`, `retail.requisitions:approve` plus the limit: an owner approves anything; a manager only at or under the owner limit (403 "Over US$500.00 needs Tendai Mhlanga.") and never their own (403 "Somebody else has to approve your own request." kept); state `SUBMITTED` only (409 "REQ-0014 has already been approved."). A different amount: > 0 and < asked (400 `fieldErrors.amount` "Approve the amount asked for, or less."), the note required (400 `fieldErrors.note` "Tell Tafara why."). Sets `APPROVED`, `approvedById`, `approvedAt`, `approvedAmount`, `decisionNote`; audit `RETAIL_REQUISITION.APPROVED { amount, asked }`; the asker is told in the app (`CRM_REQUISITION_DECIDED`) and on WhatsApp ("REQ-0014: US$1,500.00 approved by Tendai Mhlanga. Pay Afdis US$1,500.00 now; the rest on Friday when the till banks."). Toast "US$1,500.00 approved. Tafara can pay it out." (when the asker cannot pay out: "US$1,500.00 approved. It can be paid out now." **Defined here**). |
| Paid out | Primary "Pay out" (or ⋯ "Pay out") → `req-payout`: Approved (read), Paying (money, default approved), From (money account, hint "US$470.00 left in it after this."), To (person, default the asker, label "Tafara Nyathi, to pay Afdis"), How (Cash · Bank transfer · EcoCash), Reference (optional for cash). Note "Receipts are due three days after paying out." | `POST /requisitions/[id]/pay`, `retail.requisitions:update` (Owner, Manager); `APPROVED` only. Paying > 0 and ≤ approved (400 `fieldErrors.paid` "Pay the approved amount or less."); the account's currency must match (400 `fieldErrors.from` "Office safe holds US dollars."); a cash account cannot go below zero (409 `fieldErrors.from` "Office safe has US$410.00."); a reference for Bank transfer and EcoCash (400 `fieldErrors.ref` "Add the reference."). Sets `DISBURSED`, `disbursedById`, `disbursedAt`, `paidAmount`, `bankAccountId` (from), `paidToId`, `payoutMethod`, `payoutReference`, `receiptsDueAt` = paid + 3 days. **No `RetailCashMovement`, no shift touched.** A `BankTransaction` CREDIT on the account (sourceType `RETAIL_REQUISITION_PAYOUT`). Ledger: `RETAIL_REQUISITION_PAYOUT` subtype `ORDER`: Dr 2000 Accounts Payable (an advance to the supplier) / Cr the account's ledger account. Subledger: a `PurchasePayment` with no bill (`vendorId` the order's supplier, `method` "Cash"/…, `reference` "REQ-0014", `requisitionId`, `groupNo` new `PAY-nnnn`) — a credit on Afdis's account that the delivery's bill uses (W-35). Audit `RETAIL_REQUISITION.PAID { amount, from, to, how }`; the asker told when someone else paid. Toast "US$1,940.00 paid out. Receipts due by 9 October." |
| Receipt attached | Primary "Account for it" (or ⋯) → `req-acquit`: Paid out (read), Spent (money), Change back (read, live, ok tone), Change goes to (money account, default the From account), Receipts (photo, required), Note (optional). Note "The order, the receipt and the change all link back to this requisition." | `POST /requisitions/[id]/acquit`, the asker or `retail.requisitions:update`; `DISBURSED` only. Spent ≥ 0 and ≤ paid out (400 `fieldErrors.spent` "Spent is more than was paid out. Ask for the rest as a new requisition."); at least one receipt file. Sets `ACQUITTED`, `acquittedAt`, `acquittedById`, `acquittedAmount` = spent, `changeAmount`, `changeAccountId`, `acquittalNote`; receipts as `RetailAttachment` (kind `RECEIPT`). With change: `BankTransaction` DEBIT on the change account; ledger `RETAIL_REQUISITION_CHANGE` subtype `ORDER`: Dr change account / Cr 2000; the supplier credit row from the payout is reduced by the change (409 "US$1,940.00 of this cash is already against bills; record the change as a supplier refund." when the unallocated credit is smaller than the change). The bill for the order's delivery is marked paid by that credit through the oldest-first allocation (W-35), so Bills shows "Paid in cash". Audit `RETAIL_REQUISITION.ACCOUNTED { spent, change, into }`. Toast "REQ-0014 accounted for. US$37.60 back in the office safe." |

Other screens that change: the order record (chip "Cash asked for" info / "Cash approved" / "Cash paid out" ok, **Defined
here**); Requisitions tabs and the "2 to approve" badge; the money account's balance (every "Pay from" sub, "Cash at hand"
KPIs); the supplier's Owed (the credit); Bills (the bill shows "Paid in cash").

Code today: ask, approve (any manager, any amount, own excluded), decline, pay (ledger posts an expense on 1010), cancel.
No order link, money accounts, limits, WhatsApp, acquittal.

### W-32 Ask for money for an expense — Anyone — "Requisitions" — guided

Steps: What for and how much · Submit · Approve · Pay · Account for it. Screens: reqs, reqexpense, reqreject.

| Step | Screen and control | Server |
|---|---|---|
| What for and how much | `req-new` with For "An expense": Expense (auto `expense type`: Repairs and maintenance, Fuel and transport, Cleaning, Electricity and water, Licences and fees; inline add with Name and Account), What for, Amount, Currency, Pay from, Pay to (auto `payee` = suppliers, inline add with Name and Phone or WhatsApp creates a supplier), Quote (photo, optional). Note "Under US$100.00, a manager can approve it." (built from the settings: "Under US$500.00, a manager can approve it." over the owner limit: "Tendai Mhlanga approves anything over US$500.00."). | `retail.requisitions:create` (all staff). Inline add of an expense type: `retail.requisitions:approve` (Owner, Manager); Account matched case-insensitively to an active EXPENSE ledger account's code or name (400 "There is no expense account called Expenses." with the empty field meaning 5590 "Other expenses"). What for 1–200; amount > 0 ≤ 1,000,000. |
| Submit | "Submit for approval". | `askForMoney` with `category` = the expense type's category, `expenseTypeId`, `purpose` = What for, `payeeVendorId`, quote as `RetailAttachment` (kind `QUOTE`), `siteId` = the asker's default site; the rest as W-31. Done "REQ-0016 sent to Tafara Nyathi for approval." (the manager who will see it first is named only when exactly one manager can approve; else "REQ-0016 sent to the managers for approval."). |
| Approve | As W-31 (approve, approve a different amount). | As W-31. |
| Reject | Record "Reject" → `req-reject`: Why (Not needed now · Too much · Pay another way · Other), "Tell Tafara" (message). Note "Tafara can change it and ask again." Bulk "Reject" on Requisitions opens the same sheet for the ticked ones ("Reject 2 requisitions", "Tell them"). | `POST /requisitions/[id]/reject { reason, message }` (bulk `/requisitions/bulk/reject { ids, reason, message }`), approve right and the same limit rule; `SUBMITTED` only. Sets `REJECTED`, `rejectReason`, `decisionNote` = message, `approvedById` (the decider), `approvedAt`; audit `RETAIL_REQUISITION.REJECTED { reason }`; asker told in the app and on WhatsApp ("REQ-0014 was not approved: Pay another way. <message>"). Toast "REQ-0014 rejected. Tafara has been told why." The asker's record then has primary "Change and ask again" (**Defined here**) → `req-new` prefilled from it, making a new requisition. |
| Pay | As W-31 Paid out; To defaults to the asker; for an expense the label is the person alone. | `RETAIL_REQUISITION_PAYOUT` subtype `EXPENSE`: Dr the expense type's ledger account / Cr the money account's ledger account (expensed as it leaves, the CRM model). No supplier credit. |
| Account for it | As W-31. | `RETAIL_REQUISITION_CHANGE` subtype `EXPENSE`: Dr change account / Cr the expense account (the variance only). |

Code today: ask with fixed categories, decide, pay, cancel; no expense accounts, payee, quote or acquittal.

### W-72 Cancel a requisition — Whoever asked, or a manager — "Requisition record, ⋯ menu" — not guided

Steps: Cancel the requisition · The asker is told · Nothing paid, no cash moves. Screens: req, reqcancel.

| Step | Screen and control | Server |
|---|---|---|
| Cancel the requisition | ⋯ "Cancel the requisition" (bad) → ConfirmDialog `cancelreq` (FND 5.8 copy, built from the record; expense variant **Defined here**: "<amount> for <what for> is no longer asked for. <asker>, who asked, gets a message. Nothing was paid out, so no cash moves."; when the asker cancels: "… <approver or 'The managers'>, who were to approve it, get a message …"). Keep "Keep it", go "Cancel the requisition". | `POST /api/v2/retail/buying/requisitions/[id]/cancel`: the asker, or `retail.requisitions:update` (Owner, Manager); states `SUBMITTED`, `APPROVED` only (409 "REQ-0012 has been paid out. Account for it instead."). Sets `CANCELLED`, `cancelledAt`, `cancelledById`. No money moves, no ledger. The order's requisition chip goes (the order is unpaid again). Audit `RETAIL_REQUISITION.CANCELLED`. |
| The asker is told | — | Notification `CRM_REQUISITION_CANCELLED` (new) and a WhatsApp to the asker when someone else cancelled ("REQ-0014 was cancelled by Tendai Mhlanga. Nothing was paid out."); to the approver(s) when the asker cancelled. Toast "REQ-0014 cancelled." (**Defined here**). |

Code today: cancel works (asker or decider, Draft/Submitted/Approved); nobody is told.

### W-33 Receive a delivery, whole or part — Manager, staff — "The order, or Deliveries" — guided

Steps: Count what came · Note short or broken · Keep the rest on order or close · Post to stock. Screens: receive,
deliveries, delivery, deliverydiff. The Receive page's three-step note is the guide.

| Step | Screen and control | Server |
|---|---|---|
| Open | Order record primary "Receive a delivery" → `/retail/buying/orders/[id]/receive`; Overview "Needs action" (FLR); product record "Receive stock" (PRD). Header "‹ PO-0003 / Receive delivery · Delta Beverages, second delivery" ("first delivery", "third delivery" by count of posted deliveries + 1). | `retail.purchasing:receive` (Owner, Manager, Stock clerk). Order `SENT` or `PARTIAL` (a `DRAFT` is offered "Send it first, or receive it anyway" → receiving a draft marks it sent `BY_HAND` **Defined here**; `CLOSED` 409 "PO-0003 is closed. Reopen it to book a delivery against it." kept; `RECEIVED` 409 "Everything on PO-0003 has already come." kept). Data: `GET /api/v2/retail/buying/orders/[id]/receiving`. |
| Count what came | Table: Product (name, "120 came on 13 Aug" or "First delivery"), Ordered, This time (input, prefilled with what is still due: "What is already filled is what the order says is due."), Damaged (input), To come, The rest, Value. "Fill as ordered" sets every line to what is due. "Scan or type a product to jump to it": a typed name or scanned barcode focuses that line's This time; a scan adds 1 (a case barcode adds the case size); a product not on the order offers "Castle Lager case of 24 is not on PO-0003. Add it to this delivery?" → an extra line (**Defined here**). | Client: To come = max(0, due − this time); Value = (this time − damaged) × cost; totals; This time above what is due draws the bad border and the hint "More than is still to come." (**Defined here**); the server refuses it (409 "Only 120 of Castle Lager 340ml are still to come on this order." kept). |
| Note short or broken | Damaged per line: "Damaged bottles go in their own column, so they are claimed, not sold." Under the table: "Quantities are single units. Damaged units are counted in, claimed from the supplier and kept off the shelf." | Damaged ≤ this time (400 "More damaged than came on Castle Lager 340ml."). Each damaged line becomes a `RetailDeliveryDifference` (`BROKEN`, settle `CREDIT`) on posting: "A claim for 6 damaged units, US$5.16, goes to Delta Beverages." |
| Keep the rest on order or close | "The rest" per line with something still to come: Keep / Close; "All in" when nothing is left. | Close sets the order line's `closedShortAt` on posting: the line stops being expected (not late, not "still to come"). |
| When you post | Aside "When you post": four live sentences (§5.7); "The delivery note": Note number, Counted by (auto `person`, default the user), "Add a photo of the signed note"; "Empties going back" (liquor store with Empties and deposits on): Crates, Deposit back; "Paying for it": terms sentence, "Paid in cash instead?" (auto over paid-out requisitions for this supplier, plus "Ask for money"). | — |
| Post to stock | Header primary "Post to stock" (owner, manager); for a stock clerk "Send for checking" (**Defined here**). | `POST /api/v2/retail/buying/deliveries` `{ purchaseOrderId, lines: [{ purchaseOrderLineId, inventoryItemId, quantity, damaged, unitCost, rest }], noteNumber, countedById, photoUrl, empties, requisitionId, post }` → `receiveDelivery` (`lib/retail/buying/deliveries.ts`), one transaction (the existing receipts route's structure kept: identifier outside, journal after commit): `RetailGoodsReceipt` `GRN-nnnn`, `vendorId` from the order, lines with `noteQuantity` = this time, `damagedQuantity`, `quantity` = this time − damaged, `unitCost`, `vatRate`, `lineTotal` = quantity × cost; `countedById`; photo as `RetailAttachment` (`DELIVERY_NOTE`). **Posting** (`post: true`, needs `retail.purchasing:approve` — owner, manager; else 403 "Your role cannot approve purchase orders" and the client sends `post: false`): status `POSTED`, `checkedById` = the user, `checkedAt`, `postedAt`; `recordStockMovement` RECEIPT for each line's `quantity` (damaged units never enter stock); order lines `receivedQuantity += this time` (matched by `matchDeliveryToOrder`, kept), `closedShortAt` for lines marked Close, order status via `orderStatusFor` (§3.2); `InventoryItem.unitCost` and `Product.costPrice` = the delivered cost, then PRD's `repriceCostFollowers`; products with no supplier get this one (the guide's "Or let it happen on their first delivery."); differences for damaged lines; empties through STK's `returnEmptiesToSupplier(deliveryId, crates)`; `requisitionId` links the paid-out requisition (its acquittal later settles the bill). Audit `RETAIL_GOODS.RECEIVED { receiptNo, units, value, short, damaged }` (existing `auditGoodsReceived`), `RETAIL_PURCHASE_ORDER.CLOSED` when every remaining line was closed. Journal after commit: `RETAIL_GOODS_RECEIPT` Dr 1200 / Cr 2300 at Σ quantity × cost (existing). **Counting only** (`post: false`): status `COUNTED`, nothing else moves; notification `RETAIL_DELIVERY_TO_CHECK` to owners and managers ("GRN-0005 from Delta Beverages is counted and waiting to be checked."). Success shows the board's status line "Posted to stock. 420 units in stock, 36 still on order." with "Open GRN-0005", then the page stays read-only (counting only: "Sent for checking. Tafara Nyathi will post it." **Defined here**). |
| Check and post a counted delivery | Delivery record primary "Post to stock"; Deliveries bulk "Post to stock". | `POST /deliveries/[id]/post` (`/deliveries/bulk/post { ids }`), `retail.purchasing:approve`; `COUNTED` only (409 "GRN-0005 is already in stock."); runs the posting half above against the order as it is now; `checkedById` = the poster. Bulk confirm `postdeliveries` (**Defined here**). |
| Record a difference after posting | Delivery record "Record a difference" → `delivery-difference` (W-33's fourth screen): Line (auto `line` over this delivery's lines, sub "60 counted"), On the note (read), Counted, Why (Short · Broken · Wrong item · Extra), Settle by (Ask for a credit · Bring it next time · Write it off), Photo (optional). Note "Stock moves by the difference, and it shows on the supplier record." | `POST /deliveries/[id]/differences`, `retail.purchasing:update` (Owner, Manager); `POSTED` only. Counted ≥ 0, ≠ the line's current quantity (400 "That is what is already counted."). Difference d = counted − current. Stock: `recordStockMovement` ADJUSTMENT by d (`sourceType RETAIL_DELIVERY_DIFFERENCE`). Line `quantity` = counted, `lineTotal` recomputed. `RetailDeliveryDifference` (kind, quantity d, value = the absolute difference × cost, settle, state). Settle: **Ask for a credit** → ledger Dr 2300 GRNI / Cr 1200 (short) — the bill should be for less; the claim shows on the supplier's Returns tab as "Credit asked"; **Bring it next time** → the order line's `receivedQuantity` minus the difference (the order goes back to `PARTIAL`; refused 409 "PO-0003 is closed. Reopen it, or ask for a credit." on a closed order), ledger Dr 2300 / Cr 1200; **Write it off** → ledger Dr 5410 Inventory shrinkage / Cr 1200. **Extra** (d > 0) hides "Settle by" (**Defined here**): stock +d, line +d, ledger Dr 1200 / Cr 2300 (the bill will include it). Audit `RETAIL_GOODS.DIFFERENCE { item, from, to, why, settle }`. Toast "Difference saved. Credit for US$4.92 asked of Delta." (other settles: "Difference saved. 6 Chibuku Scud 1L are back on order." / "Difference saved. US$4.92 written off." / "Difference saved. 6 more in stock." **Defined here**). |

Other screens that change: On hand and Movements (stock), the order record (Delivered, Still to come, steps, the Deliveries
tab), Orders list, the supplier record (Deliveries tab, Fill rate, Last delivery), the product record (cost, ledger row
"Received PO-0003"), the "3 open" badge, Bills ("For delivery" options).

Code today: one dialog posts a delivery against an order or none: GRN, stock, order lines, journal, audit, optional "close the
rest" for the whole order ✓. No damaged, per-line close, counting without posting, differences, note number, counted by,
photos, empties, link to a requisition, cost followers.

### W-25 Take in stock with no order — Manager — "Deliveries" — not guided

Steps: Supplier · What came · Post to stock. Screens: deliveries, intakenew. (Listed under Stock in the map; the board is on
the buying page and the delivery it makes is this area's.)

| Step | Screen and control | Server |
|---|---|---|
| Supplier | Deliveries primary "+ Take in stock" → `?sheet=intake`: From (auto supplier, hint "No open orders with them. When a supplier has one, you are offered it here to receive against."; with open orders the hint reads "Mutare Wholesalers has PO-0002 open. Receive against it instead." with the link to its Receive page, **Defined here**), Delivery note (optional), Into (site, default site). | `retail.purchasing:receive` (Owner, Manager, Stock clerk). |
| What came | "What came" lines (ql "Came"), add row "Add a product: search, scan, or add a new one. It sells as soon as you post."; a product added inline shows "New product, added here" in warn. | Lines as W-33 without an order; new products through PRD's `product` quick add (`createProduct`, it sells at its price once posted). |
| Paying | Paid: Cash now · On account · Not yet; with Cash now: Paid from (money account), Requisition (read "REQ-0017, raised for you", hint "So the till float balances at close."). | — |
| Post to stock | Primary "Post to stock" (stock clerk: "Send for checking", **Defined here**). Note "Use this for walk-in suppliers. Anything regular should be an order." | `POST /api/v2/retail/buying/deliveries` `{ purchaseOrderId: null, supplierId, siteId, noteNumber, lines, paying: { mode, moneyAccountId } , post }` → `receiveDelivery` as W-33 (no order work). Paying: **On account** → nothing more (a bill is expected on the supplier's terms; the delivery shows "Record a bill"); **Not yet** → a bill is made now from the delivery (number = the delivery note, else the GRN number; amount = value with VAT; due today) (**Defined here**); **Cash now** → in the same transaction: a requisition `REQ-nnnn` (category STOCK, purpose "Cash for Mutare Wholesalers, GRN-0006", amount = value with VAT, asked, approved, paid out from the chosen account and accounted for by the poster, `receiptsWaived` none: the delivery is the receipt), a bill as Not yet, and its payment (the money-account transaction, ledger Dr 2000 / Cr money account, `PurchasePayment` against the bill) — allowed only when the poster may approve that amount (403 `fieldErrors.paid` "Cash over US$500.00 needs the owner. Choose On account and ask for money." **Defined here**) and the account has the cash (409 "Front till float has US$40.00."). A stock clerk's counted intake keeps the paying choice and runs it on posting. Toast "GRN-0006 posted. 112 units in stock." |

Code today: the receive dialog with "No order" posts stock; no supplier record, new product, paying.

### W-34 Chase a late order — Manager — "Overview, or Orders › late" — not guided

Steps: Send a reminder · New date · Or cancel the rest. Screens: order, orderchase.

| Step | Screen and control | Server |
|---|---|---|
| Find it | Overview "Needs action" (FLR) or Orders › Open with Filters › Late (**Defined here**: the Orders Filters popover has "Late: Any / Late / Not late"); the state badge "48 days late". | Late = status `SENT` or `PARTIAL`, something still to come, and today after `firstExpectedDate`; days = today − first expected. |
| Send a reminder | Record "Send a reminder" → `order-chase`: To (auto `contact` over this supplier's contacts plus the rep, label "Tinashe Moyo, rep", sub the number or email), Message (prefilled), Promised for (hint "Moves the expected date."), "If it does not come" (Remind me · Cancel the rest). Note "The message and their reply are kept on the order." | `POST /api/v2/retail/buying/orders/[id]/chase { contactId, message, promisedFor, then }`, `retail.purchasing:update` (Owner, Manager); `SENT`/`PARTIAL` only (409 "PO-0001 has all come."). Message 1–1,000. Promised for ≥ today (400 "Promise a date from today on."). `RetailMessage` OUT (WhatsApp to a phone, email to an address) linked to the order; `expectedDate` = promised (the original stays in `firstExpectedDate`), `chaseAction`, `chasedAt`, `chasedById`, `followUpDoneAt` null. Audit `RETAIL_PURCHASE_ORDER.CHASED { to, promisedFor, then }`. Toast "Reminder sent. Expected date moved to 7 October." Prefilled message (built): "Hello Tinashe, order PO-0003 from 10 August is still 480 units short: Castle 340ml 120, Chibuku 1L 180, Coke 500ml 90, Sprite 500ml 90. When can you deliver? Harare Main Branch." (short names: the product name without its pack words, "Castle Lager 340ml" → "Castle 340ml"; **Defined here**). |
| Their reply | Messages tab shows the reply. | `POST /api/v2/retail/messages/whatsapp` (webhook, SET-07's Meta app): an inbound message from a number that matches a contact, rep or supplier WhatsApp number is stored as `RetailMessage` `IN` on that supplier's most recently messaged open order (else on the supplier); notification to whoever sent the last message on that order ("Delta Beverages replied about PO-0003."). |
| New date / Or cancel the rest | — | Daily at 07:00, the retail worker's `runBuyingFollowUps(companyId)`: for orders with `chaseAction` set, still owed, `expectedDate` before today and `followUpDoneAt` null — **Remind me**: notification `RETAIL_ORDER_FOLLOW_UP` to the chaser ("PO-0003 has not come. Delta Beverages promised it for 7 October."); **Cancel the rest**: cancels what is left as below with actor "Automatic" and tells the supplier; then `followUpDoneAt` = now. |
| Cancel what is left | ⋯ "Cancel what is left" (bad) and `order-edit`'s danger button → ConfirmDialog `cancelrest` (**Defined here**). | `POST /orders/[id]/cancel-rest`, `retail.purchasing:update`; `SENT`/`PARTIAL`. Every line's `quantity` = `receivedQuantity` (`closedShortAt` cleared); nothing came → status `CANCELLED`, else `RECEIVED`; message to the supplier "Please cancel what is left of PO-0003: Castle 340ml 120, Chibuku 1L 180, Coke 500ml 90, Sprite 500ml 90. Thank you." (**Defined here**); a requisition for it that is not yet paid out is cancelled (W-72 effects; a paid-out one stays and its acquittal settles what came). Audit `RETAIL_PURCHASE_ORDER.REST_CANCELLED { units, value }`. Toast "What was left of PO-0003 is cancelled. Delta has been told." (**Defined here**). |

Code today: none.

### W-70 Close an order with what came, or reopen it — Manager — "Order record, ⋯ menu" — not guided

Steps: Close with what came · See what stops being expected · Reopen until a bill is recorded. Screens: order, orderclose,
orderedit.

| Step | Screen and control | Server |
|---|---|---|
| Close with what came | ⋯ "Close with what came" (shown for `PARTIAL`, and `SENT` once late) → ConfirmDialog `closeshort` (FND copy, built: "<n> units across <m> lines are still to come. Closing stops expecting them: the order is done at <delivered value with VAT>, <supplier short name> is billed for what was delivered, and the lines stop showing as late. You can reopen it until a bill is recorded against it."). Keep "Keep waiting", go "Close the order". | `POST /api/v2/retail/buying/orders/[id]/close` (kept, moved), `retail.purchasing:update`: `SENT`/`PARTIAL` (409 "This order is already closed" / "Everything on this order has come; there is nothing to close" kept). Status `CLOSED`, `closedAt`, `closedById`; a live requisition for it is left alone (the cash may already have paid for what came). Audit `RETAIL_PURCHASE_ORDER.CLOSED` (kept payload). Toast "PO-0003 closed with what came. 480 units are no longer expected." (**Defined here**). |
| See what stops being expected | The record after closing: steps Draft ✓ Sent ✓ Part delivered ✓ Received ✓ (the step reads "Closed short"), chip "Closed short", figure "Still to come US$0.00" plain, KPI "Still to come" note "480 units not delivered", Lines tab "Still to come" shows 0 and a muted "120 not delivered" under the figure (**Defined here**). Orders list: Received tab, badge "Closed short" (hollow). | — |
| Reopen | Record primary "Reopen the order" (LINK target `OrderRecord`) on a `CLOSED` order with no bill. | `DELETE /orders/[id]/close` (kept): refused 409 "INV-88120 is recorded against PO-0003. It cannot be reopened." when any delivery of the order has a non-binned bill (**new rule**); clears every line's `closedShortAt`; status via `orderStatusFor`. Audit `RETAIL_PURCHASE_ORDER.REOPENED`. Toast "PO-0003 reopened. 480 units are expected again." (**Defined here**). |

Code today: close and reopen work, worded "Close the rest"; no bill rule.

### W-71 Remove an order nothing came against — Manager — "Order record, while a draft" — not guided

Steps: Remove the order · It goes to the bin for 30 days. Screens: orderdraft, bin.

| Step | Screen and control | Server |
|---|---|---|
| Remove the order | A `DRAFT` order's ⋯ "Remove the order" (bad) → ConfirmDialog `removeorder` (FND copy: "Remove PO-0007?" / "Nothing has come against it and it was never sent, so nothing in stock or in the books changes. It goes to the bin for 30 days; Delta Beverages is not told." / "Keep it" / "Remove the order"). Orders bulk "Cancel" bins ticked drafts the same way. | `POST /api/v2/retail/bin { kind: "order", id }` (FND 4.6) → this area's bin kind `order`: `retail.purchasing:delete` (Owner, Manager); `DRAFT` only (409 "PO-0003 has been sent. Cancel what is left instead."); refused 409 "REQ-0013 for PO-0004 has been paid out. Account for it first." when a paid-out requisition points at it; `archivedAt` = now; a requisition for it that is not yet paid out is cancelled (W-72 effects). `RETAIL_RECORD.BINNED`. Navigates to Orders; toast "PO-0007 is in the bin. You can restore it until 3 November." (**Defined here**). |
| It goes to the bin | Management › Bin lists it (kind "Order", name "PO-0007 · Delta Beverages"); the record opens with FND's bin banner. | Binned orders leave every list, lookup and badge. Restore (`POST /api/v2/retail/bin/restore`) clears `archivedAt`. After 30 days the admin spec's purge deletes the order and its lines. |

Code today: hard delete whenever nothing came.

### W-35 Record the supplier's bill and pay it — Owner, bookkeeper — "The delivery, or the supplier" — not guided

Steps: Match to the delivery · Due date · Record payment. Screens: bills, billnew, billedit, paymentnew.

| Step | Screen and control | Server |
|---|---|---|
| Open | Delivery record primary "Record a bill" (posted, unbilled); supplier record action "Record a bill"; Bills primary "+ Record a bill". | `retail.bills:create` (Owner, Bookkeeper; Manager reads only). |
| Match to the delivery | `bill-new`: Supplier, For delivery (auto `delivery` over this supplier's posted deliveries without a bill, label "GRN-0002 · 13 Aug", sub the value with VAT "US$214.80"), Bill number, Bill date, Amount (hint warn live "US$1.20 more than the delivery. Accept it, or ask for a credit." / "US$1.20 less than the delivery." / none when equal), Due (hint "30 days from delivery."), The bill (photo, optional). Note "Bills show on the supplier statement and in what you owe." | `POST /api/v2/retail/buying/bills` → `recordBill` (`lib/retail/buying/bills.ts`): supplier live; delivery (optional) posted, this supplier's, not billed (409 "GRN-0002 already has bill INV-88120."); bill number 1–40, unique for the supplier (409 `fieldErrors.no` "Delta Beverages already sent INV-88120."); amount > 0; bill date ≤ today; due ≥ bill date (400 "It is due before it was billed."). Due default = delivery date (or bill date) + `payTermsDays`. `PurchaseBill` (`status RECEIVED`, `goodsReceiptId`, `billNumber`, `billDate`, `dueDate`, `total` = amount, `taxTotal` = the delivery's VAT share of the amount (no delivery: amount × 15/115 when the supplier has a VAT number, else 0), `subTotal` = amount − tax) with one `PurchaseBillLine` "Delivery GRN-0002" (net, VAT rate, tax); the file as `RetailAttachment` (`BILL`). Saving accepts a difference: it posts as a price difference (asking for a credit is "Record a difference" or "Return goods"). Ledger `RETAIL_SUPPLIER_BILL`: Dr 2300 GRNI = delivery value ex VAT, Dr 2210 VAT input = tax, Dr 5000 = price over / Cr 5000 = price under (net − delivery ex VAT), Cr 2000 = amount; no delivery: Dr 5000 net, Dr 2210 tax, Cr 2000. Then `applySupplierCredits(vendorId)`: unallocated payments (overpayments, order-requisition cash) settle the oldest unpaid bills first. Audit `RETAIL_BILL.RECORDED { billNumber, amount, due, delivery }`. Toast "Bill INV-88120 saved, due 12 September." |
| Due date | The Bills list states ("21 days overdue", "Due in 3 days"), the "1 overdue" badge, the supplier's Owed KPI note "15 Oct due" (the earliest due date with a balance). | Computed (§3.3). |
| Change or bin | Bills row → `bill-edit` (the bill's record): the same fields; footer danger "Move to the bin", note "Changed by Tendai Mhlanga, 14 August." (latest `RETAIL_BILL.*`/`RETAIL_RECORD.EDITED` event; "Recorded by …" when never changed), secondary "Record a payment", primary "Save". | `PATCH /api/v2/retail/buying/bills/[id]`, `retail.bills:update`: amount not below what is paid (409 "US$100.00 is paid against INV-88120."); the ledger entry is reversed and reposted when amount, delivery or date change (`reverseJournalEntry`, revision suffix as the sales invoice does); `RETAIL_RECORD.EDITED` per field. Toast "INV-88120 saved." Bin: FND ConfirmDialog `bin` → `POST /api/v2/retail/bin { kind: "bill", id }`, `retail.bills:delete`; refused 409 "US$100.00 has been paid against INV-88120. It cannot go to the bin." when anything is allocated; reverses the ledger entry; restore reposts it. |
| Record payment | Supplier record "Record a payment", Bills bulk "Record a payment" (one supplier at a time; several suppliers step through, sub "… · 1 of 2"), bill-edit's secondary (this bill first) → `payment-new`: Amount (default what is owed), Paid on (default today), Paid by (Cash · Bank transfer · EcoCash, default Bank transfer), From (money account, default by Paid by: the first cash / bank / mobile account), Reference, Pays (read, live: "INV-88120, INV-88504, oldest first", hint "Anything over is held as credit on the account."). Note "Delta sees it on their statement next month." | `GET /api/v2/retail/buying/payments/preview?supplierId=&amount=&billId=` → the allocation. `POST /api/v2/retail/buying/payments` → `recordSupplierPayment` (`lib/retail/buying/payments.ts`), `retail.bills:create`: amount > 0; account currency matches; a cash account cannot go negative (409 "Office safe has US$410.00."); a reference for Bank transfer and EcoCash (400 "Add the reference."); Paid on ≤ today. Allocation: the named bill first, then unpaid bills by due date, oldest first; one `PurchasePayment` per bill touched (`groupNo` `PAY-nnnn`, `paymentNumber` `PAY-0019/1…`, `vendorId`, `bankAccountId`, `method`, `reference`, `paidAt`), the rest one row with no bill (credit); `recalcPurchaseBillBalance` per bill (existing; `PAID` at zero). `BankTransaction` CREDIT on the account. Ledger `RETAIL_SUPPLIER_PAYMENT` subtype the account kind: Dr 2000 / Cr the account's ledger account. Audit `RETAIL_SUPPLIER_PAYMENT.RECORDED { groupNo, amount, bills }`. Toast "US$624.00 paid to Delta Beverages. Nothing owed." (or "… US$120.00 still owed." / "… US$40.00 held as credit." **Defined here**). |
| Export for the bookkeeper | Bills bulk "Export for the bookkeeper". | `POST /api/v2/retail/buying/bills/export { ids }` (`retail.bills:view`) → an `.xlsx` (exceljs): sheet "Bills" (Bill, Supplier, Supplier VAT number, Delivery, Billed, Due, Net, VAT, Amount, Paid, Owed, Ledger entry), sheet "Payments" (Payment, Bill, Paid on, Paid by, From, Reference, Amount). `RETAIL_EXPORT.DOWNLOADED { key: "retail-bills-bookkeeper", rows }`. |

Code today: none in retail.

### W-36 Return goods to a supplier — Manager — "Supplier record" — not guided

Steps: Pick products · Why · Credit note expected. Screens: supplier, returnnew.

| Step | Screen and control | Server |
|---|---|---|
| Pick products | Supplier record ⋯ "Return goods" → `return-new` (also from Insights › Products, `&productIds=`): Supplier, Why (Damaged · Expired · Wrong item · Not ordered); "What goes back" lines (ql "Going back", cl "Cost"; sub "Broken in delivery GRN-0005" for a product with an open BROKEN difference, "Expires 4 October" in warn when the stock spec records an expiry, else the category). | `retail.purchasing:create` (Owner, Manager). Lines: products on hand at the user's site; quantity ≤ on hand (400 "Only 4 of Sprite 500ml are on the shelf."); cost default = the last delivered cost from this supplier. |
| Why / settle | "Settling it": Settle by (Credit note · Replace the goods · Refund), Collected (text), Photos (optional). Note "Stock comes off now. The credit shows on their statement when it arrives." Primary "Book the return". | `POST /api/v2/retail/buying/returns` → `bookReturn` (`lib/retail/buying/returns.ts`): `RetailSupplierReturn` `RTN-nnnn` + lines; `recordStockMovement` ISSUE per line (`sourceType RETAIL_SUPPLIER_RETURN`, reason "Returned to Delta Beverages"); damaged units already outside stock (an open BROKEN difference for that product on this supplier's deliveries) are returned without a stock movement and that difference is marked returned; state `CREDIT_EXPECTED` / `REPLACEMENT_EXPECTED` / `REFUND_EXPECTED`. Ledger `RETAIL_SUPPLIER_RETURN`: Dr 2000 / Cr 1200 at Σ cost (the supplier owes the shop; their Owed drops now and the claim shows on the statement). Audit `RETAIL_SUPPLIER_RETURN.BOOKED`. Toast "Return RTN-0004 booked. 18 units off stock." |
| Credit note expected | Returns tab row ⋯ (**Defined here**): "Credit note came" (Credit note number), "Replacement came" (pick the delivery that brought it), "Refund came" (amount, into money account). | `POST /returns/[id]/settle { kind, … }`, `retail.purchasing:update`: credit note → `DebitNote` rows (`ISSUED`, no posting: the ledger already moved) against the oldest unpaid bills up to the value, state `SETTLED`; replacement → ledger Dr 2300 / Cr 2000 (the replacement delivery booked GRNI; the claim is cleared), state `SETTLED`; refund → `BankTransaction` DEBIT, ledger `RETAIL_SUPPLIER_REFUND` Dr money account / Cr 2000, state `SETTLED`. Audit `RETAIL_SUPPLIER_RETURN.SETTLED`. |

Code today: none.

### Frame workflows used here

W-55 Export (every list, record tabs; FND), W-60 Activity (every record's Activity tab, sentences in §3.4), W-62 edit in place
(supplier, order, delivery and requisition rails), W-63 bin (draft orders, bills; not suppliers, deliveries or requisitions).

---
## 3. Data

### 3.1 Permissions (`lib/retail/permissions.ts`)

Two resources are added for the Roles board's "Suppliers" and "Bills and supplier payments" rows; `retail.purchasing` keeps
"Orders and deliveries" (its label becomes "orders and deliveries"); `retail.requisitions` stays. `FINANCE_OFFICER`
(Bookkeeper) is added on all four, as the products spec does for its resources. `approve` on `retail.purchasing` means **check
and post a delivery to stock**; `receive` means count one. The existing `MANAGE_THE_SHOP` (owner, managers) keeps `ALL`.

| Resource | Covers | Owner | Manager | Cashier | Stock clerk | Bookkeeper |
|---|---|---|---|---|---|---|
| `retail.suppliers` (new) | Suppliers, contacts, supplier messages, supplier import | view, create, update, delete | view, create, update, delete | – | view | view, update |
| `retail.purchasing` | Orders, deliveries, differences, returns | all (incl. receive, approve) | all | – | view, receive | view |
| `retail.requisitions` | Requisitions | all; approves any amount | view, create, update, approve (at or under the owner limit, never their own) | view (own), create | view (own), create | view |
| `retail.bills` (new) | Bills, supplier payments, statements, the bookkeeper export | view, create, update, delete | view | – | – | view, create, update, delete |

Row rules the matrix cannot state (enforced in `lib/retail/buying/*`): cashiers and stock clerks read only requisitions they
asked (`requestedById = me`); the asker may cancel and account for their own; approving needs the limit rule (§W-31); a stock
clerk's Receive saves a counted delivery. `RESOURCE_LABELS`: "suppliers", "orders and deliveries", "requisitions", "bills and
supplier payments". `lib/retail/permissions.test.ts` asserts the table cell by cell (manager on bills: view only — the Roles
board's "R").

### 3.2 Models used, and what each figure is

| Model | Used for |
|---|---|
| `Vendor` (extended), `VendorContact` (new) | Suppliers, their terms and contacts (§3.3 A). |
| `RetailPurchaseOrder`, `RetailPurchaseOrderLine` (extended) | Orders (§3.3 B). |
| `RetailGoodsReceipt`, `RetailGoodsReceiptLine` (extended), `RetailDeliveryDifference` (new) | Deliveries and their differences (§3.3 E). |
| `RetailAttachment` (new) | Quotes, receipts, bill files, delivery notes, photos (§3.3 C). |
| `CrmRequisition` (extended), `RetailExpenseType` (new) | Requisitions (§3.3 C). |
| `BankAccount` (extended), `BankTransaction` | Money accounts and their balances (§3.3 D). |
| `PurchaseBill`, `PurchaseBillLine`, `PurchasePayment` (extended), `DebitNote` | Bills, payments, credits (§3.3 D, F). |
| `RetailSupplierReturn`, `RetailSupplierReturnLine` (new) | Returns to suppliers (§3.3 G). |
| `RetailMessage` (SET-07, extended) | Orders and reminders sent, replies, WhatsApp to askers (§3.3 B). |
| `InventoryItem`, `Product`, `StockMovement` (`recordStockMovement`) | Stock in and out, costs, reorder levels, suppliers of products. |
| `AccountingIntegrationEvent`, `JournalEntry`, `PostingRule`, `PostingRuleLine` (extended) | Ledger postings (§3.5). |
| `PlatformAuditEvent` | Activity (§3.4). |
| `Notification` | In-app messages (new types in §3.3). |
| `Site`, `User` | Deliver to / Into; people (asker, approver, counter, checker). |

Figures (`lib/retail/buying/figures.ts`, unit-tested; money in `Prisma.Decimal`, rounded to cents per line):

| Figure | Definition |
|---|---|
| Line value | quantity × unit cost (ex VAT). Line VAT = round(line value × VAT rate ÷ 100). |
| Order "Lines" / "VAT" / "Total", list "Value" | Σ line values / Σ line VAT / their sum. Orders list "Value" and KPI "Value" are the Total. |
| Ordered, Delivered (units) | Σ `quantity`, Σ `receivedQuantity`. List cell "300 of 780"; the bar's fill = delivered ÷ ordered. |
| Delivered value | Σ over lines of received × cost with VAT ("US$240.00 delivered"). |
| Still to come | Units and value with VAT of max(0, quantity − received) over lines not closed short, while the order is `SENT` or `PARTIAL` (or `DRAFT`: the whole order); 0 when `RECEIVED`, `CLOSED`, `CANCELLED`. |
| Late, days late | `SENT`/`PARTIAL`, still to come > 0, today (Africa/Harare) after `firstExpectedDate`; days = whole days between. |
| Order state badge | `DRAFT` "Draft" neutral · `SENT` "Sent" info · `PARTIAL` "Part delivered" warn · late (either) "<n> days late" bad ("1 day late") · `RECEIVED` "Received" hollow, "Received late" warn on the supplier record when the last delivery came after `firstExpectedDate` · `CLOSED` "Closed short" hollow · `CANCELLED` "Cancelled" hollow. |
| Order steps | Draft · Sent · Part delivered · Received · Billed; done up to the current state; "Billed" done when the order is `RECEIVED` or `CLOSED` and every posted delivery of it has a non-binned bill (current while it is received but not all billed); `CLOSED` shows the fourth step as "Closed short". `CANCELLED`: Draft ✓ Sent ✓ then "Cancelled" current (**Defined here**). |
| Delivery "Units", "Value" | Units = Σ line `quantity` (what is in stock from it: damaged and short excluded; "300", with "312 on the note"). Value = Σ `quantity` × cost (ex VAT): the stock value. Value with VAT (what the bill is compared with) = Σ with each line's VAT. |
| Delivery "Against the order" | `COUNTED` → "To check" pending (**Defined here**) · no order → "No order" neutral · damaged > 0 → "<n> damaged" bad · short > 0 → "<n> short" warn · else "Matches" hollow. Damaged = Σ `damagedQuantity`; short = Σ max(0, `noteQuantity` − `damagedQuantity` − `quantity`). |
| Delivery steps | Arrived · Counted · Checked · In stock · Billed: `COUNTED` → Arrived ✓ Counted ✓ Checked (now); `POSTED` → … In stock ✓, Billed (now) until a bill exists; `REVERSED` → chip "Reversed" bad, no current step. |
| Supplier "Spend, 12 months" | Σ value with VAT of the supplier's posted deliveries in the last 365 days; note "+6%" = change on the 365 days before (ok when up, bad when down; "New this year" when the earlier period is 0). |
| Supplier "Orders" | Count of the supplier's non-binned orders; note "<n> open" (`DRAFT`, `SENT`, `PARTIAL`). Suppliers list "Open" is the same count. |
| "On time" | Of the supplier's orders done (`RECEIVED`, `CLOSED`) in the last 12 months, the % whose last delivery came on or before `firstExpectedDate`; note "−9 pts" = points against the 12 months before ("on last year"). |
| "Fill rate" | Σ received ÷ Σ `sentQuantity` over the supplier's orders done in the last 12 months; no orders but deliveries → 100%; nothing → "No deliveries yet". KPI note "12 units short this year" = Σ max(0, sent − received) over this calendar year. List bar warn under 80%. |
| "Last delivery" | The latest posted delivery's date; "—" when none. |
| "Owed" | Σ bill balances (non-binned bills, `total − amountPaid − debitNoteTotal − writeOffTotal`) − Σ unallocated payment credits − Σ open return credits. Owed pill when > 0; "US$0.00" zero when 0; "US$40.00 credit" muted when < 0 (**Defined here**). KPI note: the earliest due date with a balance, "15 Oct due"; "Nothing due" when none. |
| Bill state | Paid (`amountPaid ≥ total`): "Paid in cash" when every payment row is method Cash, else "Paid" — hollow. Unpaid: due before today "<n> days overdue" bad; due today "Due today" warn; ≤ 7 days "Due in <n> days" warn ("Due tomorrow"); later "Due in <n> days" info. |
| Requisition state badge | `SUBMITTED` "Waiting for approval" warn · `APPROVED` "Approved, to pay" info · `DISBURSED` "Paid, receipt due" info, "Receipt overdue" bad after `receiptsDueAt` (**Defined here**) · `ACQUITTED` "Accounted for" hollow · `REJECTED` "Rejected" hollow · `CANCELLED` "Cancelled" hollow (both **Defined here**). |
| Requisition steps | Asked · Approved · Paid out · Accounted for: the first not done is "now" (`SUBMITTED` → Approved now). `REJECTED`/`CANCELLED`: Asked ✓, then the chip "Rejected"/"Cancelled" and no current step. |
| Money account balance | `openingBalance` + Σ DEBIT − Σ CREDIT of its `BankTransaction`s; option sub "US$2,410.00" for cash, "•••• 4471" (last four of `accountNumber`) for bank and mobile. |
| "Cash at hand" | The Pay from account's balance; note "US$470.00 left after this" (balance − amount; after paying out: "US$470.00 left now" **Defined here**). |

### 3.3 Schema changes, by migration

Every migration ships with its witness test in the same commit (asserting through `information_schema`/`pg_enum`/`pg_indexes`
and, where data moves, the moved rows), is applied with `npx prisma migrate deploy` and again with
`DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy`. Never `prisma db push`. Migrations are numbered in build order
(A…G). Back-relation fields on `Company`, `User`, `Site`, `Vendor`, `BankAccount`, `ChartOfAccount`, `InventoryItem` and
`CrmRequisition` are added with each relation, named after it; the snippets show only the side that owns the foreign key, and a
`model X { … }` block repeated in a later migration adds fields to it.

#### A · `20261004134000_retail_suppliers` (BUY-01) · witness `lib/retail/buying/suppliers-migration.test.ts`

```prisma
enum VendorContactSends {
  ORDERS
  STATEMENTS
  NOTHING
}

model Vendor {
  // … existing fields unchanged: id, companyId, taxCategoryId, name, phone, email, isActive, createdAt, updatedAt.
  // Read by retail as: contactName = "Rep" (kept in step with the rep contact), address = "Address",
  // taxNumber = "BP number", vatNumber = "VAT number".
  /// "SUP-0001". Unique per company.
  code                 String?
  /// Where orders and reminders go on WhatsApp. Starts as `phone`.
  whatsapp             String?
  /// "Send orders on WhatsApp".
  sendOrdersOnWhatsapp Boolean   @default(true)
  /// "Pays": null = on delivery; else days from delivery (7, 14, 30).
  payTermsDays         Int?
  /// "Delivers", as said: "Tuesdays and Fridays".
  deliversOn           String?
  /// "Lead time", whole days. Fills an order's Expected.
  leadTimeDays         Int?
  /// "Minimum order", with VAT.
  minimumOrder         Decimal?  @db.Decimal(14, 2)
  /// "Bank account" as typed. The rail shows "CBZ · •••• 4471".
  bankDetails          String?
  /// "Stop buying from them". isActive is false while set.
  stoppedAt            DateTime?
  stoppedById          String?
  createdById          String?

  contacts  VendorContact[]
  stoppedBy User?           @relation("VendorStoppedBy", fields: [stoppedById], references: [id], onDelete: SetNull)
  createdBy User?           @relation("VendorCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)

  @@unique([companyId, code])
}

model VendorContact {
  id        String             @id @default(uuid())
  companyId String
  vendorId  String
  name      String
  /// "Sales rep", "Accounts", "Orders desk", "Driver", or a word the shop added.
  role      String?
  phone     String?
  email     String?
  /// "Sends them".
  sends     VendorContactSends @default(ORDERS)
  removedAt DateTime?
  createdAt DateTime           @default(now())
  updatedAt DateTime           @updatedAt

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  vendor  Vendor  @relation(fields: [vendorId], references: [id], onDelete: Cascade)

  @@index([vendorId])
  @@index([companyId])
}
```

SQL: create the enum, columns and table; `UPDATE "Vendor" SET "whatsapp" = "phone"`; number existing vendors per company by
`createdAt` (`'SUP-' || lpad(row_number()::text, 4, '0')`); unique index; one `VendorContact` (role 'Sales rep', `sends`
ORDERS, the vendor's phone and email) for every vendor with a `contactName`. Code (no migration): `lib/id-generator.ts` entity
`RETAIL_SUPPLIER` (prefix `SUP`, company-wide, max-existing lookup on `Vendor.code`). Witness: columns, enum values, the unique
index, and that a vendor inserted with a `contactName` before the migration has its Sales rep contact after it.

#### B · `20261004134100_retail_purchase_orders` (BUY-02) · witness `lib/retail/buying/purchase-orders-migration.test.ts`

```prisma
enum RetailPurchaseOrderStatus {
  DRAFT      // not sent
  SENT       // sent; nothing has come
  PARTIAL    // part delivered
  RECEIVED   // everything came (or what was left was cancelled after some came)
  CLOSED     // closed with what came; reopenable until a bill is recorded
  CANCELLED  // what was left was cancelled before anything came
}

enum RetailOrderPayment {
  ON_ACCOUNT
  CASH_ON_DELIVERY
}

enum RetailOrderSentVia {
  WHATSAPP
  EMAIL
  BY_HAND
}

enum RetailOrderChaseAction {
  REMIND
  CANCEL_REST
}

enum RetailMessageDirection {
  OUT
  IN
}

model RetailPurchaseOrder {
  id                String                    @id @default(uuid())
  companyId         String
  poNo              String
  siteId            String
  /// REPLACES supplierName.
  vendorId          String
  status            RetailPurchaseOrderStatus @default(DRAFT)
  /// Expected now: set when raised or edited, moved by a reminder's "Promised for".
  expectedDate      DateTime?
  /// Expected when it was sent. Lateness counts from it; a reminder never moves it.
  firstExpectedDate DateTime?
  payment           RetailOrderPayment        @default(ON_ACCOUNT)
  /// "Note to the supplier". REPLACES notes.
  noteToSupplier    String?
  createdById       String?
  sentAt            DateTime?
  sentById          String?
  sentVia           RetailOrderSentVia?
  chaseAction       RetailOrderChaseAction?
  chasedAt          DateTime?
  chasedById        String?
  /// The worker acted on chaseAction.
  followUpDoneAt    DateTime?
  closedAt          DateTime?
  closedById        String?
  closeNote         String?
  cancelledAt       DateTime?
  cancelledById     String?
  duplicatedFromId  String?
  /// In the bin. Drafts only.
  archivedAt        DateTime?
  createdAt         DateTime                  @default(now())
  updatedAt         DateTime                  @updatedAt

  lines        RetailPurchaseOrderLine[]
  receipts     RetailGoodsReceipt[]

  company     Company @relation(fields: [companyId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  site        Site    @relation(fields: [siteId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  vendor      Vendor  @relation(fields: [vendorId], references: [id], onDelete: Restrict)
  createdBy   User?   @relation("RetailPurchaseOrderCreatedBy", fields: [createdById], references: [id], onDelete: SetNull, onUpdate: Cascade)
  sentBy      User?   @relation("RetailPurchaseOrderSentBy", fields: [sentById], references: [id], onDelete: SetNull)
  chasedBy    User?   @relation("RetailPurchaseOrderChasedBy", fields: [chasedById], references: [id], onDelete: SetNull)
  closedBy    User?   @relation("RetailPurchaseOrderClosedBy", fields: [closedById], references: [id], onDelete: SetNull, onUpdate: Cascade)
  cancelledBy User?   @relation("RetailPurchaseOrderCancelledBy", fields: [cancelledById], references: [id], onDelete: SetNull)

  @@unique([companyId, poNo])
  @@index([companyId, siteId, status])
  @@index([companyId, vendorId, status])
}

model RetailPurchaseOrderLine {
  // … existing: id, companyId, purchaseOrderId, inventoryItemId, itemName, quantity, unitCost (ex VAT),
  //   lineTotal (ex VAT), receivedQuantity, createdAt …
  /// The product's VAT rate when the line was made.
  vatRate         Decimal   @default(0) @db.Decimal(5, 2)
  /// What the supplier was last told to send. Fill rate reads it; "Cancel what is left" does not change it.
  sentQuantity    Decimal?  @db.Decimal(12, 4)
  /// "Close" on Receive: the line stops being expected.
  closedShortAt   DateTime?
  closedShortById String?
  sortOrder       Int       @default(0)
}

model RetailGoodsReceipt {
  // REPLACES supplierName.
  vendorId String
  vendor   Vendor @relation(fields: [vendorId], references: [id], onDelete: Restrict)
  purchaseOrder RetailPurchaseOrder? @relation(fields: [purchaseOrderId], references: [id], onDelete: SetNull)

  @@index([companyId, vendorId])
}

model Vendor {
  purchaseOrders RetailPurchaseOrder[]
  goodsReceipts  RetailGoodsReceipt[]
}

model RetailMessage {
  // … SET-07's fields (channel, to, template, body, saleId, status, attempts, lastError, sentAt, createdById, createdAt) …
  direction     RetailMessageDirection @default(OUT)
  /// What it is about: "RetailPurchaseOrder", "CrmRequisition", "Vendor", "RetailGoodsReceipt".
  entityType    String?
  entityId      String?
  /// A document sent with it (the order PDF), as a signed link.
  attachmentUrl String?
  /// Inbound: the number it came from.
  fromNumber    String?
  /// The channel's id (WhatsApp wamid), for delivery receipts and de-duplication.
  externalId    String?                @unique

  @@index([companyId, entityType, entityId, createdAt])
}
```

`orderStatusFor(lines, closed, sent)` (`lib/retail/purchase-orders.ts`, kept and extended): `CLOSED` when closed; `CANCELLED`
when every line has quantity 0 received and the rest was cancelled (set by the cancel service, never inferred); nothing received
→ `SENT` when sent else `DRAFT`; every line received in full or closed short → `CLOSED` when any line is closed short, else
`RECEIVED`; otherwise `PARTIAL`. `outstanding(line)` is 0 for a line closed short.

Enum additions to existing enums: `NotificationType` + `RETAIL_ORDER_FOLLOW_UP`; `NotificationEntityType` +
`RETAIL_PURCHASE_ORDER`.

SQL (data): `ALTER TYPE "RetailPurchaseOrderStatus" ADD VALUE 'SENT' BEFORE 'PARTIAL'` and `ADD VALUE 'CANCELLED'`; for each
distinct `(companyId, supplierName)` on orders and receipts without a `Vendor` of that name, insert one (next `SUP-` code,
`isActive` true); set `vendorId` by name; drop `supplierName` from both tables; rename `notes` → `noteToSupplier`;
`firstExpectedDate = expectedDate`; existing orders with `PARTIAL`, `RECEIVED` or `CLOSED` get `sentAt = createdAt`,
`sentVia = BY_HAND`; `sentQuantity = quantity`; `vatRate` from the line's product (`InventoryItem.productId` →
`Product.defaultTaxRate`). Code (no migration): `RETAIL_PURCHASE_ORDER` prefix `PO`, `RETAIL_GOODS_RECEIPT` prefix `GRN`, both
company-wide (`requiresSiteId: false`). Witness: enum values in order, the dropped columns, an order inserted with
`supplierName` "Delta Beverages" before the migration points at a `Vendor` named so after it.


#### C · `20261004134200_retail_requisitions` (BUY-04) · witness `lib/retail/buying/requisitions-migration.test.ts`

```prisma
enum CrmRequisitionCategory {
  // … existing values …
  /// "Stock purchase": money to pay a purchase order.
  STOCK
}

enum CrmRequisitionRejectReason {
  NOT_NEEDED_NOW
  TOO_MUCH
  PAY_ANOTHER_WAY
  OTHER
}

enum RetailPayoutMethod {
  CASH
  BANK_TRANSFER
  ECOCASH
}

/// What a shop spends on that is not stock: "Repairs and maintenance", "Fuel and transport" …
model RetailExpenseType {
  id              String                 @id @default(uuid())
  companyId       String
  name            String
  /// The CRM-side grouping its requisitions carry.
  category        CrmRequisitionCategory @default(OTHER)
  /// The expense account a payout debits.
  ledgerAccountId String?
  archivedAt      DateTime?
  createdAt       DateTime               @default(now())

  company       Company          @relation(fields: [companyId], references: [id], onDelete: Cascade)
  ledgerAccount ChartOfAccount?  @relation("RetailExpenseTypeAccount", fields: [ledgerAccountId], references: [id], onDelete: SetNull)
  requisitions  CrmRequisition[]

  @@unique([companyId, name])
}

enum RetailAttachmentKind {
  QUOTE
  RECEIPT
  BILL
  DELIVERY_NOTE
  PHOTO
}

/// Files the buying screens keep: quotes, receipts, bills, delivery notes, photos.
model RetailAttachment {
  id          String               @id @default(uuid())
  companyId   String
  /// "CrmRequisition", "RetailGoodsReceipt", "RetailDeliveryDifference", "PurchaseBill", "RetailSupplierReturn".
  entityType  String
  entityId    String
  kind        RetailAttachmentKind
  url         String
  name        String
  contentType String
  size        Int
  addedById   String?
  createdAt   DateTime             @default(now())

  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  addedBy User?   @relation("RetailAttachmentAddedBy", fields: [addedById], references: [id], onDelete: SetNull)

  @@index([companyId, entityType, entityId])
}

model CrmRequisition {
  // … existing … `bankAccountId` is "Pay from" when asked and "From" once paid out.
  purchaseOrderId String?
  expenseTypeId   String?
  /// "Pay to": the supplier the money is for.
  payeeVendorId   String?
  /// Who it waits for: the owner approver when over the limit; null = any manager.
  approverId      String?
  /// The owner limit when it was asked: "Needs approval: Over US$500.00".
  approvalLimit   Decimal?                    @db.Decimal(14, 2)
  rejectReason    CrmRequisitionRejectReason?
  /// "Paying" on Pay out.
  paidAmount      Decimal?                    @db.Decimal(14, 2)
  /// "To": the person the money was handed to.
  paidToId        String?
  payoutMethod    RetailPayoutMethod?
  payoutReference String?
  receiptsDueAt   DateTime?
  acquittedById   String?
  changeAmount    Decimal?                    @db.Decimal(14, 2)
  changeAccountId String?
  acquittalNote   String?
  cancelledAt     DateTime?
  cancelledById   String?

  purchaseOrder RetailPurchaseOrder? @relation(fields: [purchaseOrderId], references: [id], onDelete: SetNull)
  expenseType   RetailExpenseType?   @relation(fields: [expenseTypeId], references: [id], onDelete: SetNull)
  payee         Vendor?              @relation("CrmRequisitionPayee", fields: [payeeVendorId], references: [id], onDelete: SetNull)
  approver      User?                @relation("CrmRequisitionApprover", fields: [approverId], references: [id], onDelete: SetNull)
  paidTo        User?                @relation("CrmRequisitionPaidTo", fields: [paidToId], references: [id], onDelete: SetNull)
  acquittedBy   User?                @relation("CrmRequisitionAcquittedBy", fields: [acquittedById], references: [id], onDelete: SetNull)
  cancelledBy   User?                @relation("CrmRequisitionCancelledBy", fields: [cancelledById], references: [id], onDelete: SetNull)
  changeAccount BankAccount?         @relation("CrmRequisitionChangeAccount", fields: [changeAccountId], references: [id], onDelete: SetNull)

  @@index([companyId, purchaseOrderId])
}

model RetailPurchaseOrder {
  requisitions CrmRequisition[]
}
```

Enum additions: `NotificationType` + `CRM_REQUISITION_CANCELLED`, `CRM_REQUISITION_QUESTION`. SQL: for every company with a
retail site, insert the five expense types (Repairs and maintenance → `EQUIPMENT`, 5300; Fuel and transport → `FUEL`, 5500;
Cleaning → `MATERIALS`, 5100; Electricity and water → `OTHER`, 5570 "Electricity and water"; Licences and fees → `OTHER`, 5580
"Licences and fees" — accounts linked when present; the seed pack adds 5570 and 5580); existing retail requisitions get
`expenseTypeId` by category (EQUIPMENT → Repairs and maintenance, FUEL/TRANSPORT → Fuel and transport, MATERIALS → Cleaning,
others none). Witness: the enum value, the table and the five rows for a retail company.

#### D · `20261004134300_retail_money_accounts` (BUY-05) · witness `lib/retail/buying/money-accounts-migration.test.ts`

```prisma
enum MoneyAccountKind {
  CASH
  BANK
  MOBILE
}

model BankAccount {
  // … existing …
  /// "Cash, bank or mobile".
  kind            MoneyAccountKind @default(BANK)
  /// The ledger account this money sits in (1005 Cash vault, 1010 Operating bank, 1016 Mobile money clearing …).
  ledgerAccountId String?
  ledgerAccount   ChartOfAccount?  @relation("BankAccountLedger", fields: [ledgerAccountId], references: [id], onDelete: SetNull)
}

enum PostingRuleLineAccountSource {
  FIXED_ACCOUNT
  TENDER_MAPPING
  ROLE_MAPPING   // SET-09
  EVENT_ACCOUNT  // the account the event names (a money account's ledger, an expense type's account)
}

model PostingRuleLine {
  // … existing (+ SET-09's accountRole) …
  /// With accountSource = EVENT_ACCOUNT: the key in the event's `accounts` ("moneyAccount", "expenseAccount", "changeAccount").
  eventAccountKey String?
}

model PurchasePayment {
  // … existing: billId (null = credit on the supplier's account), bankAccountId ("From"), method ("Cash" |
  //   "Bank transfer" | "EcoCash" from retail), reference, paidAt, amount …
  /// The supplier: always set by retail (a credit row has no bill to say it).
  vendorId      String?
  /// "PAY-0019": the rows of one payment.
  groupNo       String?
  /// Cash handed out on an order requisition, held as credit until its bill.
  requisitionId String?

  vendor      Vendor?         @relation(fields: [vendorId], references: [id], onDelete: Restrict)
  requisition CrmRequisition? @relation(fields: [requisitionId], references: [id], onDelete: SetNull)

  @@index([companyId, vendorId, billId])
  @@index([companyId, groupNo])
}
```

Enum additions: `AccountingSourceType` + `RETAIL_REQUISITION_PAYOUT`, `RETAIL_REQUISITION_CHANGE`, `RETAIL_SUPPLIER_PAYMENT`.
`lib/accounting/posting.ts` resolves `EVENT_ACCOUNT` from the event payload's `accounts[eventAccountKey]` (a `ChartOfAccount`
id), with the same active-and-ledger checks as fixed lines; missing → code `EVENT_ACCOUNT_MISSING` (a PENDING posting, retried).
SQL: existing bank accounts get `kind BANK` and the company's 1010 account; `PurchasePayment.vendorId` from its bill. Code:
`RETAIL_SUPPLIER_PAYMENT` id entity (prefix `PAY`). Witness: enum values, columns, the backfilled vendor on a payment.

#### E · `20261004134400_retail_deliveries` (BUY-06) · witness `lib/retail/buying/deliveries-migration.test.ts`

```prisma
enum RetailGoodsReceiptStatus {
  COUNTED   // counted by a stock clerk; nothing has moved yet
  POSTED    // in stock
  REVERSED  // reversed after posting
}

enum RetailDeliveryDifferenceKind {
  SHORT
  BROKEN
  WRONG_ITEM
  EXTRA
}

enum RetailDeliverySettle {
  CREDIT     // "Ask for a credit"
  NEXT_TIME  // "Bring it next time"
  WRITE_OFF  // "Write it off"
}

enum RetailDeliveryPaying {
  ON_ACCOUNT
  NOT_YET
  CASH_NOW
}

model RetailGoodsReceipt {
  // … existing: id, companyId, receiptNo, purchaseOrderId, siteId, vendorId (B), notes, receivedById (who booked it),
  //   createdAt, postedAt, updatedAt …
  status        RetailGoodsReceiptStatus @default(COUNTED)
  /// "Note number" on the supplier's delivery note.
  noteNumber    String?
  /// "Driver".
  driver        String?
  /// "Counted by".
  countedById   String?
  /// Who posted it ("Checked by"), and when.
  checkedById   String?
  checkedAt     DateTime?
  /// Take in stock with no order: how it was paid.
  paying        RetailDeliveryPaying?
  /// "Paid in cash instead?": the paid-out requisition that pays for it.
  requisitionId String?
  reversedAt    DateTime?
  reversedById  String?
  reverseReason String?

  differences RetailDeliveryDifference[]
  countedBy   User?           @relation("RetailGoodsReceiptCountedBy", fields: [countedById], references: [id], onDelete: SetNull)
  checkedBy   User?           @relation("RetailGoodsReceiptCheckedBy", fields: [checkedById], references: [id], onDelete: SetNull)
  requisition CrmRequisition? @relation(fields: [requisitionId], references: [id], onDelete: SetNull)
}

model RetailGoodsReceiptLine {
  // … existing: quantity (now: what is in stock from this line), unitCost (ex VAT), lineTotal = quantity × unitCost …
  /// "This time" on Receive — what came, damaged included. "On the note" on the record.
  noteQuantity    Decimal @default(0) @db.Decimal(12, 4)
  /// Of what came, broken at the door: claimed, never in stock.
  damagedQuantity Decimal @default(0) @db.Decimal(12, 4)
  vatRate         Decimal @default(0) @db.Decimal(5, 2)

  differences RetailDeliveryDifference[]
}

model RetailDeliveryDifference {
  id            String                       @id @default(uuid())
  companyId     String
  receiptId     String
  receiptLineId String
  kind          RetailDeliveryDifferenceKind
  /// Signed units: −6 short or broken, +2 extra.
  quantity      Decimal                      @db.Decimal(12, 4)
  /// |quantity| × the line's cost, ex VAT.
  value         Decimal                      @db.Decimal(14, 2)
  /// Null for EXTRA.
  settle        RetailDeliverySettle?
  /// Damaged at the door (Receive) rather than found after posting.
  atReceiving   Boolean                      @default(false)
  /// The credit came (credit note or return), or the units came back on order.
  settledAt     DateTime?
  returnId      String?
  createdById   String?
  createdAt     DateTime                     @default(now())

  company Company                @relation(fields: [companyId], references: [id], onDelete: Cascade)
  receipt RetailGoodsReceipt     @relation(fields: [receiptId], references: [id], onDelete: Cascade)
  line    RetailGoodsReceiptLine @relation(fields: [receiptLineId], references: [id], onDelete: Cascade)

  @@index([receiptId])
  @@index([companyId, createdAt])
}

model CrmRequisition {
  deliveries RetailGoodsReceipt[]
}

```

Enum additions: `AccountingSourceType` + `RETAIL_DELIVERY_DIFFERENCE`; `NotificationType` + `RETAIL_DELIVERY_TO_CHECK`;
`NotificationEntityType` + `RETAIL_GOODS_RECEIPT`. SQL: the enum gains `COUNTED` (before `POSTED`) and `REVERSED`; the column
default becomes `COUNTED`; existing lines `noteQuantity = quantity`, `vatRate` from the product; existing receipts
`checkedById = receivedById`, `checkedAt = postedAt`. Witness: enum order, the new columns, and the backfilled `noteQuantity`.
#### F · `20261004134500_retail_bills` (BUY-07) · witness `lib/retail/buying/bills-migration.test.ts`

```prisma
model PurchaseBill {
  // … existing …
  /// The delivery this bill is for. One bill per delivery.
  goodsReceiptId String?             @unique
  /// In the bin.
  archivedAt     DateTime?
  goodsReceipt   RetailGoodsReceipt? @relation(fields: [goodsReceiptId], references: [id], onDelete: SetNull)

  // REPLACES @@unique([companyId, billNumber]): two suppliers can both send "INV-001".
  @@unique([companyId, vendorId, billNumber])
  @@index([companyId, vendorId, dueDate])
}

model RetailGoodsReceipt {
  bill PurchaseBill?
}
```

Enum additions: `AccountingSourceType` + `RETAIL_SUPPLIER_BILL`. The accounting module's bill and payment routes keep working
(their generated `BILL-…` numbers stay unique). Witness: the unique index is `(companyId, vendorId, billNumber)` and the old one
is gone.

#### G · `20261004134600_retail_supplier_returns` (BUY-09) · witness `lib/retail/buying/returns-migration.test.ts`

```prisma
enum RetailReturnReason {
  DAMAGED
  EXPIRED
  WRONG_ITEM
  NOT_ORDERED
}

enum RetailReturnSettle {
  CREDIT_NOTE
  REPLACE
  REFUND
}

enum RetailReturnState {
  CREDIT_EXPECTED
  REPLACEMENT_EXPECTED
  REFUND_EXPECTED
  SETTLED
}

model RetailSupplierReturn {
  id               String             @id @default(uuid())
  companyId        String
  /// "RTN-0004".
  returnNo         String
  vendorId         String
  siteId           String
  reason           RetailReturnReason
  settle           RetailReturnSettle
  state            RetailReturnState
  /// "Collected": "With the next delivery, 7 October".
  collected        String?
  /// The supplier's credit note, once it came.
  creditNoteNumber String?
  /// Refund: the money account it came into.
  refundAccountId  String?
  settledAt        DateTime?
  settledById      String?
  createdById      String?
  createdAt        DateTime           @default(now())

  lines   RetailSupplierReturnLine[]
  company Company      @relation(fields: [companyId], references: [id], onDelete: Cascade)
  vendor  Vendor       @relation(fields: [vendorId], references: [id], onDelete: Restrict)
  site    Site         @relation(fields: [siteId], references: [id], onDelete: Restrict)

  @@unique([companyId, returnNo])
  @@index([companyId, vendorId])
}

model RetailSupplierReturnLine {
  id              String   @id @default(uuid())
  companyId       String
  returnId        String
  inventoryItemId String
  itemName        String
  quantity        Decimal  @db.Decimal(12, 4)
  /// Ex VAT.
  unitCost        Decimal  @db.Decimal(14, 2)
  lineTotal       Decimal  @db.Decimal(14, 2)
  vatRate         Decimal  @default(0) @db.Decimal(5, 2)
  /// Sent back from damaged units that never entered stock.
  fromDamaged     Boolean  @default(false)
  createdAt       DateTime @default(now())

  supplierReturn RetailSupplierReturn @relation(fields: [returnId], references: [id], onDelete: Cascade)
  inventoryItem  InventoryItem        @relation(fields: [inventoryItemId], references: [id], onDelete: Restrict)

  @@index([returnId])
}
```

Enum additions: `AccountingSourceType` + `RETAIL_SUPPLIER_RETURN`, `RETAIL_SUPPLIER_REFUND`. Code: `RETAIL_SUPPLIER_RETURN` id
entity (prefix `RTN`). Witness: the tables, enums and unique index.

**Not schema** (decided, so nobody adds a table): late, billed, owed, fill rate, on time, spend are computed (§3.2); a contact
role list is the four defaults plus the distinct roles in use; a bill's "Changed by" line reads the audit chain; the money
account balance is a sum; "Ask a question" is a message and an audit event.

### 3.4 Audit events (`RETAIL_AUDIT_EVENTS`, `lib/retail/audit.ts`) and their Activity sentences

Added to `RETAIL_AUDIT_EVENTS` and `lib/retail/audit.test.ts`; sentences in `lib/retail/activity-words.ts` (FND 5.6.9). Money
in payloads as strings (`auditAmount`).

| Constant | Event type | Entity | Sentence | Tone |
|---|---|---|---|---|
| `supplierCreated` | `RETAIL_SUPPLIER.CREATED` | `Vendor` | "Added <name>" | `ok` |
| `supplierContactAdded` | `RETAIL_SUPPLIER.CONTACT_ADDED` | `Vendor` | "Added <name>, <role>, who gets <orders \| statements \| nothing>" | `info` |
| `supplierContactRemoved` | `RETAIL_SUPPLIER.CONTACT_REMOVED` | `Vendor` | "Removed <name>" | `hollow` |
| `supplierStopped` / `supplierResumed` | `RETAIL_SUPPLIER.STOPPED` / `.RESUMED` | `Vendor` | "Stopped buying from them" / "Started buying from them again" | `bad` / `ok` |
| `suppliersMessaged` | `RETAIL_SUPPLIER.MESSAGED` | `Vendor` | "Sent a message on WhatsApp" | `hollow` |
| `orderCreated` | `RETAIL_PURCHASE_ORDER.CREATED` | `RetailPurchaseOrder` | "Raised PO-0031 for US$643.08" | `info` |
| `orderSent` | `RETAIL_PURCHASE_ORDER.SENT` | `RetailPurchaseOrder` | "Sent on WhatsApp to Tinashe Moyo" / "Sent by email to orders@delta.co.zw" / "Marked sent by hand" | `info` |
| `orderChanged` | `RETAIL_PURCHASE_ORDER.CHANGED` | `RetailPurchaseOrder` | "Changed the lines: Castle Lager 340ml 240 → 300" (+ ", told Delta") | `info` |
| `orderChased` | `RETAIL_PURCHASE_ORDER.CHASED` | `RetailPurchaseOrder` | "Sent a reminder; promised for 7 October" | `warn` |
| `orderClosed` / `orderReopened` (existing) | `RETAIL_PURCHASE_ORDER.CLOSED` / `.REOPENED` | `RetailPurchaseOrder` | "Closed with what came, 480 units not delivered" / "Reopened" (FND) | `hollow` |
| `orderRestCancelled` | `RETAIL_PURCHASE_ORDER.REST_CANCELLED` | `RetailPurchaseOrder` | "Cancelled what was left, 480 units" ("…, automatically" for the worker) | `bad` |
| `orderDuplicated` | `RETAIL_PURCHASE_ORDER.DUPLICATED` | `RetailPurchaseOrder` (the new one) | "Made from PO-0003" | `hollow` |
| `messageReceived` | `RETAIL_MESSAGE.RECEIVED` | `RetailPurchaseOrder` or `Vendor` | "Delta Beverages replied: “<first 80 characters>”" | `info` |
| `goodsReceived` (existing) | `RETAIL_GOODS.RECEIVED` | `RetailGoodsReceipt`, and the order | "Received GRN-0004, <n> units" (FND) | `ok` |
| `goodsCounted` | `RETAIL_GOODS.COUNTED` | `RetailGoodsReceipt` | "Counted, waiting to be checked" | `pending` |
| `goodsDifference` | `RETAIL_GOODS.DIFFERENCE` | `RetailGoodsReceipt` | "Recorded 6 short on Chibuku Scud 1L, credit asked" ("…, back on order", "…, written off", "6 extra on …") | `warn` |
| `goodsReversed` | `RETAIL_GOODS.REVERSED` | `RetailGoodsReceipt` | "Reversed: <reason>" | `bad` |
| `goodsPhotosAdded` | `RETAIL_GOODS.PHOTOS_ADDED` | `RetailGoodsReceipt` | "Added 3 photos" | `hollow` |
| `requisitionAsked` | `RETAIL_REQUISITION.ASKED` | `CrmRequisition` | "Asked for US$1,940.00 for PO-0005" / "Asked for US$85.00: Fix the walk-in cooler door seal" | `info` |
| `requisitionApproved` | `RETAIL_REQUISITION.APPROVED` | `CrmRequisition` | "Approved US$1,940.00" / "Approved US$1,500.00 of US$1,940.00" | `ok` |
| `requisitionRejected` | `RETAIL_REQUISITION.REJECTED` | `CrmRequisition` | "Rejected: Pay another way" | `bad` |
| `requisitionQuestion` | `RETAIL_REQUISITION.QUESTION` | `CrmRequisition` | "Asked: “<question>”" | `info` |
| `requisitionPaid` | `RETAIL_REQUISITION.PAID` | `CrmRequisition` | "Paid out US$1,940.00 from Office safe to Tafara Nyathi" | `ok` |
| `requisitionAccounted` | `RETAIL_REQUISITION.ACCOUNTED` | `CrmRequisition` | "Accounted for: spent US$1,902.40, US$37.60 back in Office safe" | `ok` |
| `requisitionCancelled` | `RETAIL_REQUISITION.CANCELLED` | `CrmRequisition` | "Cancelled" | `hollow` |
| `billRecorded` | `RETAIL_BILL.RECORDED` | `PurchaseBill`, and the delivery | "Recorded bill INV-88120 for US$216.00, due 12 September" | `info` |
| `supplierPaid` | `RETAIL_SUPPLIER_PAYMENT.RECORDED` | `Vendor`, and each bill | "Paid US$624.00 by bank transfer: INV-88120, INV-88504" | `ok` |
| `returnBooked` | `RETAIL_SUPPLIER_RETURN.BOOKED` | `Vendor` | "Booked return RTN-0004, 18 units, credit note expected" | `warn` |
| `returnSettled` | `RETAIL_SUPPLIER_RETURN.SETTLED` | `Vendor` | "RTN-0004 settled: credit note CN-5521" / "…: goods replaced on GRN-0007" / "…: US$11.40 refunded" | `ok` |

The FND activity registry (`lib/retail/record-activity.ts`) maps `Vendor` → `retail.suppliers:view`, `RetailPurchaseOrder` and
`RetailGoodsReceipt` → `retail.purchasing:view`, `CrmRequisition` → `retail.requisitions:view` (row rule applies),
`PurchaseBill` → `retail.bills:view`. Edits in place write FND's `RETAIL_RECORD.EDITED`; bin moves FND's `RETAIL_RECORD.BINNED`
/ `RESTORED` (kinds `order`, `bill`).

### 3.5 Ledger postings (`lib/accounting/defaults.ts`, retail rules; `captureAccountingEvent` / `createJournalEntryFromSource`)

Fallback rules added beside `Retail goods receipt` (company scope, `GUIDED`, `isFallback`). Account codes are the seed pack's;
`EVENT_ACCOUNT` lines read `payload.accounts.<key>`. Events are written by `lib/retail/buying/posting.ts` after commit, like the
goods receipt today (a locked period leaves them PENDING; the goods facts stand).

| Source type (subtype) | Event when | Lines |
|---|---|---|
| `RETAIL_GOODS_RECEIPT` (existing) | a delivery is posted | Dr 1200 Inventory / Cr 2300 GRNI, Σ quantity × cost |
| `RETAIL_DELIVERY_DIFFERENCE` (`CREDIT`, `NEXT_TIME`) | short/broken after posting | Dr 2300 / Cr 1200 |
| `RETAIL_DELIVERY_DIFFERENCE` (`WRITE_OFF`) | short/broken written off | Dr 5410 Inventory shrinkage / Cr 1200 |
| `RETAIL_DELIVERY_DIFFERENCE` (`EXTRA`) | extra found | Dr 1200 / Cr 2300 |
| `RETAIL_SUPPLIER_BILL` | a bill is recorded (reversed and reposted on change, reversed on bin) | Dr 2300 `grni` · Dr 2210 VAT input TAX · Dr 5000 `priceOver` · Cr 5000 `priceUnder` · Cr 2000 Accounts payable AMOUNT (no delivery: Dr 5000 NET, Dr 2210 TAX, Cr 2000) |
| `RETAIL_SUPPLIER_PAYMENT` | a supplier payment | Dr 2000 / Cr EVENT_ACCOUNT `moneyAccount` |
| `RETAIL_REQUISITION_PAYOUT` (`ORDER`) | an order requisition is paid out | Dr 2000 / Cr `moneyAccount` |
| `RETAIL_REQUISITION_PAYOUT` (`EXPENSE`) | an expense requisition is paid out | Dr EVENT_ACCOUNT `expenseAccount` / Cr `moneyAccount` |
| `RETAIL_REQUISITION_CHANGE` (`ORDER`) | change comes back on an order requisition | Dr `changeAccount` / Cr 2000 |
| `RETAIL_REQUISITION_CHANGE` (`EXPENSE`) | change comes back on an expense | Dr `changeAccount` / Cr `expenseAccount` |
| `RETAIL_SUPPLIER_RETURN` | a return is booked | Dr 2000 / Cr 1200 at cost |
| `RETAIL_SUPPLIER_REFUND` | a refund for a return comes in | Dr `moneyAccount` / Cr 2000 |
| (replacement came) `RETAIL_SUPPLIER_RETURN` subtype `REPLACED` | a replacement settles a return | Dr 2300 / Cr 2000 |

Retail requisitions no longer call `postRequisitionDisbursement` (the CRM keeps it). `lib/retail/buying/posting.test.ts`
asserts each event balances and reads the right accounts; `lib/accounting/posting.test.ts` covers `EVENT_ACCOUNT`.

### 3.6 Seed and demo data — extend `scripts/seed-retail-demo.ts`

Run: `pnpm tsx scripts/seed-retail-demo.ts --slug hurudza-creative --days 160 --reset`. Idempotent (upsert by code / number).
"Today" = the seed date; dates are written as offsets so the boards' dates come out exactly when seeded on 3 October 2026
(the boards' today) and keep their shape on any other day. Prices and costs are the products spec's (§3.5 there); this area
adds **Sprite 500ml** (`SPRITE-500`, Soft drinks, price 0.75, cost 0.52, 96 bottles, reorder at 48, supplier Delta Beverages)
because PO-0003 and the Receive board order it (the products tabs become Selling 20 · All 22; see open question 6), and asks
the products seed to set Chibuku's supplier to Delta Beverages (PO-0003 orders it from Delta).

**People:** the existing owner Tendai Mhlanga, manager Tafara Nyathi, cashiers Chipo Dube and Farai Moyo, stock clerk Tendai
Sibanda, bookkeeper (PRD-01). Phones for WhatsApp: the owner `+263 77 100 2001`, Tafara `+263 77 100 2002`.

**Money accounts** (`BankAccount`): Office safe (CASH, USD, ledger 1005, opening so that its balance is US$2,410.00 after the
seeded transactions), Front till float (CASH, USD, 1005, balance US$120.00), CBZ current account (BANK, USD, 1010, number
`…4471`, the existing "Operating Bank" renamed), EcoCash merchant (MOBILE, USD, 1016, number `…0921`).

**Suppliers** (`Vendor`; codes by this order):

| Code | Name | Rep (contact) | Phone · WhatsApp | Email | Pays | Delivers | Lead | Minimum | VAT · BP | Bank | Other contacts |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SUP-0001 | Delta Beverages | Tinashe Moyo, Sales rep, +263 77 214 9080, Orders | +263 24 270 1600 · +263 77 214 9080 | orders@delta.co.zw | 30 days | Tuesdays and Fridays | 2 days | 500.00 | 10023881 · 200118844 | CBZ, Kwame Nkrumah, 0112 3344 4471 | Delta orders desk, Orders desk, orders@delta.co.zw, Orders |
| SUP-0002 | Afdis Distillers | Ruvimbo Sithole | +263 24 266 8001 | orders@afdis.co.zw | 30 days | Mondays and Thursdays | 2 days | 300.00 | — | — | — |
| SUP-0003 | Mutare Wholesalers | Peter Chikore | +263 20 206 4411 | — | On delivery | Fridays | 3 days | — | — | — | — |
| SUP-0004 | Schweppes Zimbabwe | Lindiwe Dube | +263 24 248 7720 | sales@schweppes.co.zw | 14 days | Wednesdays | 2 days | — | — | — | — |
| SUP-0005 | Pamela | Pamela Ndlovu | +263 77 330 1922 | — | On delivery | — | 1 day | — | — | — | — |
| SUP-0006 | Ice Cold Supplies | Joseph Banda | +263 71 909 2210 | — | On delivery | Daily | 0 days | — | — | — | — |
| SUP-0007 | CoolTech Repairs | — | +263 77 410 5566 | — | On delivery | — | — | — | — | — | — |

Product suppliers: Delta (beers, ciders, Coca-Cola, Sprite, ice, Chibuku), Afdis (spirits, wine), Schweppes (tonic).

**Orders** (VAT 15% on every line; costs as given; the "Value" the pages show is computed, §3.2):

| Order | Supplier | State | Raised | First expected | Lines: ordered / received at cost | Notes |
|---|---|---|---|---|---|---|
| PO-0001 | Afdis Distillers | RECEIVED | today − 62 (2 Aug) | today − 58 (6 Aug) | Gordon’s Gin 750ml 24/24 at 12.40, Two Keys Whisky 750ml 24/24 at 7.10 | 48 of 48, delivered on time (history delivery GRN-0006) |
| PO-0002 | Mutare Wholesalers | PARTIAL | today − 56 (8 Aug) | today − 48 (16 Aug) | Coca-Cola 500ml 60/42 at 0.50, Ice 2kg bag 40/25 at 0.95 | 67 of 100 (the board's 65 counts the 2 damaged out; this spec counts what came, §3.2); late |
| PO-0003 | Delta Beverages | PARTIAL | today − 54 (10 Aug) | today − 48 (16 Aug) | Castle Lager 340ml 240/120 at 0.86, Chibuku Scud 1L 240/60 at 0.82, Coca-Cola 500ml 180/90 at 0.52, Sprite 500ml 120/30 at 0.52 | 300 of 780, "48 days late"; sent on WhatsApp 10 Aug 14:20 by Tafara Nyathi; chased today − 1, promised today + 4 (7 Oct), Remind me; Messages 3 (the order, the reminder, the reply "Truck on Wednesday, 7 October."); Deliveries 1 (GRN-0002) |
| PO-0004 | Pamela | DRAFT | today (3 Oct) | today + 3 (6 Oct) | Jameson Irish Whiskey 750ml 12 at 22.15, Gordon’s Gin 750ml 12 at 12.40, Amarula Cream 750ml 12 at 11.67 | 0 of 36; Cash on delivery; REQ-0013 approved for it |
| PO-0005 | Afdis Distillers | SENT | today − 2 (1 Oct) | today + 4 (7 Oct) | Amarula 24 at 13.03, Johnnie Walker Black 24 at 33.60, Jameson 12 at 22.15, Gordon’s 12 at 12.40, Two Keys 12 at 7.10, Bols Brandy 750ml 6 at 11.34 | 0 of 90; US$1,686.96 + VAT = US$1,940.00 exactly; REQ-0014 asks for it |
| PO-0007 | Delta Beverages | DRAFT | today (the board's 4 October is "tomorrow") | today + 6 (9 Oct) | Castle Lager 340ml 240, Chibuku Scud 1L 120, Coca-Cola 500ml 120 at their costs | the W-71 demo; "Not sent" |
| PO-0006, PO-0008 … PO-0023 | Delta (11: PO-0008…PO-0018, PO-0021, PO-0022), Afdis (PO-0006, PO-0019, PO-0023), Schweppes (PO-0020) | RECEIVED, except PO-0021 CLOSED (380 of 384) | spread from today − 150 to today − 1 | raised + 2 days | 3–5 lines each from the supplier's products | PO-0018 received 2 days late ("Received late"); PO-0022 is GRN-0003's order (today − 1); PO-0023 is Afdis's 29 September delivery |

Tabs read Open 3 · Drafts 2 · Received 18 · All 23 (the board's Drafts 1 · Received 19: the board has no PO-0007; open question
6). The badge reads "3 open". Numbers are assigned by the seed, not by date; the sequence is left at 23 so the next is PO-0024.

**Deliveries** (all posted through `receiveDelivery`, except GRN-0005):

| Delivery | Supplier | Order | Received | Lines: on the note / damaged / in stock | Received by · checked by | Note |
|---|---|---|---|---|---|---|
| GRN-0001 | Mutare Wholesalers | PO-0002 | today − 52 (12 Aug) | Coca-Cola 500ml 42 / 2 / 40, Ice 2kg bag 25 / 0 / 25 | Farai Moyo · Tafara Nyathi | "2 damaged"; BROKEN difference at receiving, credit asked; not billed |
| GRN-0002 | Delta Beverages | PO-0003 | today − 51 (13 Aug) 10:42 | Castle 120/0/120, Chibuku 66/0/60, Coca-Cola 90/0/90, Sprite 36/0/30 | Tafara Nyathi · Tendai Mhlanga | "12 short" (two SHORT differences recorded after posting, credit asked 13 Aug); note DB-778104; driver "Simon, truck AEZ 4471"; 3 photos; value US$214.80; billed INV-88120 |
| GRN-0003 | Delta Beverages | PO-0022 | today − 1 (2 Oct) | Castle Lager case of 24, 24 / 0 / 24 at 20.10 | Tafara Nyathi · Tafara Nyathi | "Matches"; billed INV-88504 (the board's PO-0003 link would put 24 more on PO-0003; open question 6) |
| GRN-0004 | Ice Cold Supplies | — | today (3 Oct) | Ice 2kg bag 40 / 0 / 40 at 1.00 | Chipo Dube · Tafara Nyathi | "No order"; Cash now from Front till float through REQ-0010 |
| GRN-0005 | Ice Cold Supplies | — | today 09:15 | Ice 2kg bag 20 / 0 / — | Tendai Sibanda · — | COUNTED ("To check"), paying On account: shows the Delivery record's "Checked · Post to stock" state |
| GRN-0006 … | history | one per historical order | | | | posted; billed and paid |

PO-0003's GRN-0002 makes the Receive page read the board's "120 came on 13 Aug", "60 came on 13 Aug", "90 came on 13 Aug",
"30 came on 13 Aug" and "300 of 780 came on 13 August".

**Requisitions:**

| Ref | What for | State | Amount | Asked by | Needed by | Against | Detail |
|---|---|---|---|---|---|---|---|
| REQ-0014 | Cash to pay Afdis for order PO-0005 | SUBMITTED | 1,940.00 | Tafara Nyathi, today 11:20 | today + 3 (Tuesday 6 Oct) | PO-0005 | Pay from Office safe; pay to Afdis Distillers; why "Afdis deliver on Tuesday and take cash only."; over the US$500.00 limit → approver Tendai Mhlanga |
| REQ-0015 | Generator diesel, 40 litres | SUBMITTED | 62.00 | Farai Moyo | today + 1 | Fuel and transport | Pay from Front till float |
| REQ-0013 | Cash for Pamela order PO-0004 | APPROVED | 637.80 | Tafara Nyathi | today + 3 | PO-0004 | approved by Tendai Mhlanga |
| REQ-0012 | Fridge repair, front till | DISBURSED | 85.00 | Chipo Dube | today − 2 | Repairs and maintenance | pay to CoolTech Repairs; paid out from Front till float today − 2 by Tafara Nyathi; receipts due today + 1 |
| REQ-0011 | Liquor licence renewal | ACQUITTED | 240.00 | Tendai Mhlanga | today − 3 | Licences and fees | paid from CBZ by bank transfer, spent 240.00, receipt attached |
| REQ-0010 | Cash for Ice Cold Supplies, GRN-0004 | ACQUITTED | 46.00 | Chipo Dube | today | Stock purchase | the GRN-0004 intake's Cash now |
| REQ-0009 | Cash to pay Afdis for order PO-0023 | ACQUITTED | 1,940.00 | Tafara Nyathi | today − 4 | PO-0023 | paid out from Office safe, spent 1,902.40, US$37.60 back; pays AF-20931 |
| REQ-0001 … REQ-0008 | history (fuel, cleaning, repairs) | ACQUITTED (6), REJECTED (1), CANCELLED (1) | | | | | so "Money asked for, by month" has eight months |

Tabs: To approve 2 · To pay out 1 · Receipts due 1 · All 15 (the board's 14; open question 6). Badge "2 to approve" for the
owner; "1 to approve" for Tafara Nyathi (REQ-0015 is under the limit and not his; REQ-0014 is over it).

**Bills and payments** (amounts are what the supplier billed, as on the board; the price difference against the delivery posts
to 5000):

| Bill | Supplier | Delivery | Billed | Due | Amount | Paid |
|---|---|---|---|---|---|---|
| INV-88120 | Delta Beverages | GRN-0002 | today − 51 (13 Aug) | today − 21 (12 Sep) | 216.00 | nothing → "21 days overdue" |
| AF-20931 | Afdis Distillers | PO-0023's delivery | today − 4 (29 Sep) | today − 4 (29 Sep) | 1,902.40 | REQ-0009's cash (method Cash) → "Paid in cash" |
| INV-88504 | Delta Beverages | GRN-0003 | today − 7 (26 Sep) | today + 23 (26 Oct) | 408.00 | nothing → "Due in 23 days" |
| SZ-4471 | Schweppes Zimbabwe | PO-0020's delivery | today − 11 (22 Sep) | today + 3 (6 Oct) | 311.20 | nothing → "Due in 3 days" |
| MW-0192 | Mutare Wholesalers | — ("No delivery") | today − 3 (30 Sep) | today + 27 (30 Oct) | 96.00 | nothing → "Due in 27 days" |
| 30 more | the historical deliveries | | | | | paid in full by bank transfer from CBZ (groups PAY-0001 … PAY-0019) |

Tabs: To pay 4 · Overdue 1 · Paid 31 · All 35, totals US$2,933.60 and US$1,031.20 as on the board; Delta owes US$624.00 as on
its record. Returns (seeded in date order through the services, so Delta's owed stays US$624.00): RTN-0001 (Delta, today − 90,
Expired, 12 Sprite 500ml, settled by credit note CN-5521 against the then unpaid PO-0009 bill) and RTN-0002 (Delta, today − 20,
Damaged, 6 Castle Lager 340ml, Replace the goods, settled by GRN-0003) so Delta's Returns tab reads 2; GRN-0002's two "Credit
asked" differences show there too.

Every seeded document posts through the same services the screens use (stock movements, ledger, money-account transactions),
so On hand, the ledger's 2000/2300 balances and the money accounts agree with the screens.

---
## 4. API

Conventions are FND §4's: `requireRetailSession`, `requireRetailPermission(session, resource, action)` → 403 `{ error:
"Your role cannot <verb> <noun>" }`; `successResponse`; `errorResponse` with 400 `{ error: "Validation failed", fieldErrors }`
for sheets (keys are the sheet's field ids), 404 `{ error: "<Noun> not found" }`, 409 with a sentence the UI shows as is; every
id from the client re-checked against `session.user.companyId`. Services live in `lib/retail/buying/*.ts` (one per noun, each
with its `.test.ts`); route files only parse, gate and call. Request schemas are the same zod schemas the sheet kinds declare.
Money in requests is a string with two decimals; in responses a number to two places. Dates in requests `YYYY-MM-DD` (the sheet
parses "7 October 2026" → `2026-10-07`, 400 `fieldErrors.<id>` "Write a date, like 7 October 2026." when it cannot).

### 4.1 List sources (FND-LIST: `GET /api/v2/reports/[key]`, `POST /api/v2/reports/[key]/export`)

Definitions in `lib/reports/definitions/retail/buying.ts`, loaders in `lib/reports/loaders/retail/buying.ts` (database-side
`page()` for orders, deliveries and bills; in-memory for suppliers and requisitions, both small). `catalog: false`. Columns,
filters and copy are in §5.

| Key | Page / tab | Read | Tabs (key: rule) | Filters (key: options) | Parent filters (record tabs) |
|---|---|---|---|---|---|
| `retail-suppliers` | Suppliers | `retail.suppliers:view` | — | `category`: Any + the shop's categories (a supplier matches when one of its products is in it); `owed`: Any, Owed something, Overdue, Owes nothing (**Defined here**); in Filters: `show`: Buying from (default), Stopped, Both (**Defined here**) | — |
| `retail-orders` | Orders; supplier record › Orders | `retail.purchasing:view` | `open`: SENT or PARTIAL · `drafts`: DRAFT · `received`: RECEIVED, CLOSED, CANCELLED · `all` | `supplier`: Any + suppliers; `site`: Any + sites; in Filters: `late`: Any, Late, Not late; `raised`: period (Any time) | `supplierId` |
| `retail-order-lines` | order record › Lines; requisition record › What it pays for | `retail.purchasing:view` (requisition: `retail.requisitions:view` and the row rule) | — | — | `orderId` |
| `retail-order-messages` | order record › Messages | `retail.purchasing:view` | — | — | `orderId` |
| `retail-deliveries` | Deliveries; supplier record › Deliveries; order record › Deliveries | `retail.purchasing:view` | — | `supplier`: Any + suppliers; `differences`: Any, Matches, Short, Damaged, No order, To check; in Filters: `received`: period (Any time), `site` | `supplierId`, `orderId` |
| `retail-delivery-lines` | delivery record › Lines | `retail.purchasing:view` | — | — | `deliveryId` |
| `retail-delivery-differences` | delivery record › Differences | `retail.purchasing:view` | — | — | `deliveryId` |
| `retail-delivery-photos` | delivery record › Photos | `retail.purchasing:view` | — | — | `deliveryId` |
| `retail-requisitions` | Requisitions | `retail.requisitions:view` (`scopeOwn` for CASHIER, POS_CASHIER, STOCK_CLERK on `requestedById`) | `approve`: SUBMITTED · `payout`: APPROVED · `receipts`: DISBURSED · `all` | `purpose`: Any, An order, An expense; `asked`: Anyone + people (hidden for scoped roles); in Filters: `state`: Any + the seven states, `needed`: period | — |
| `retail-requisition-approvals` | requisition record › Approvals | as the record | — | — | `requisitionId` |
| `retail-requisition-receipts` | requisition record › Receipts | as the record | — | — | `requisitionId` |
| `retail-bills` | Bills; supplier record › Bills | `retail.bills:view` | `topay`: balance > 0 · `overdue`: balance > 0 and due before today · `paid`: balance 0 · `all` | `supplier`: Any + suppliers; `due`: Any time, Overdue, This week, Next 30 days (**Defined here**) | `supplierId` |
| `retail-supplier-payments` | supplier record › Payments | `retail.bills:view` | — | — | `supplierId` |
| `retail-supplier-returns` | supplier record › Returns | `retail.purchasing:view` | — | — | `supplierId` |
| `retail-supplier-contacts` | supplier record › Contacts | `retail.suppliers:view` | — | — | `supplierId` |

Binned orders and bills never come back; stopped suppliers only under Show › Stopped/Both. Cost columns carry `requires:
"view-cost"` (FND) — every buying role that can open these lists may see cost, so it never drops here.

### 4.2 Suppliers (BUY-01)

| Method and path | Permission | Request | Response | Errors |
|---|---|---|---|---|
| `POST /api/v2/retail/buying/suppliers` | `retail.suppliers:create` | `{ name, phone?, email?, sendOrdersOnWhatsapp, pays: "On delivery"\|"7 days"\|"14 days"\|"30 days", delivers?, leadTime?, minimumOrder?, vatNumber?, bpNumber?, bank?, address? }` | 201 `{ data: SupplierView }` | 400 field errors (§W-29); 409 `fieldErrors.name` duplicate |
| `GET /api/v2/retail/buying/suppliers/[id]` | `retail.suppliers:view` | — | `{ data: SupplierView }`: `{ id, code, name, isActive, stoppedAt, stoppedBy, rep: { id, name } \| null, phone, whatsapp, email, sendOrdersOnWhatsapp, pays: { days, label }, deliversOn, leadTimeDays, minimumOrder, vatNumber, bpNumber, bank: { masked, full? } (full only with update right), address, topCategory, chips, kpis: { spend12, spendPrev12, orders, openOrders, onTimePct, onTimePrevPct, fillRatePct, unitsShortThisYear, owed, nextDue }, chart: { months: [{ month, value }] } (range=3m\|12m\|all), counts: { orders, deliveries, bills, payments, returns, contacts }, can: { update, delete, order, bill, pay, return } }` | 404 |
| `PATCH /api/v2/retail/buying/suppliers/[id]` | `retail.suppliers:update` | one or more of `{ repContactId, phone, whatsapp, email, pays, delivers, minimumOrder, leadTime, vatNumber, bpNumber, bank, address, name, sendOrdersOnWhatsapp }` | FND 4.9 `{ data, changed }` | 400 per field; 409 duplicate name |
| `POST /api/v2/retail/buying/suppliers/[id]/stop` · `DELETE` same | `retail.suppliers:delete` | — | `{ data }` | 409 open orders |
| `POST /api/v2/retail/buying/suppliers/[id]/contacts` | `retail.suppliers:update` | `{ name, role?, phone?, email?, sends: "Orders"\|"Statements"\|"Nothing" }` | 201 `{ data: Contact }` | 400 name, phone-or-email |
| `PATCH` / `DELETE /api/v2/retail/buying/suppliers/[id]/contacts/[contactId]` | `retail.suppliers:update` | the same fields / — (removal sets `removedAt`; removing the rep clears `contactName`) | `{ data }` | 404 |
| `GET /api/v2/retail/buying/suppliers/[id]/suggestions?siteId=&productIds=` | `retail.purchasing:create` | — | `{ lines: [{ inventoryItemId, productId, name, sub, flag: "low"\|"usual"\|null, quantity, unitCost, vatRate, packSize }], expected: "YYYY-MM-DD" \| null, leadTimeDays, minimumOrder, terms: "Delta pays 30 days. Their minimum is US$500.00." }` | 404 |
| `POST /api/v2/retail/buying/suppliers/messages` | `retail.suppliers:update` | `{ ids: uuid[] (≤200), message (1–1,000) }` | `{ queued, skipped: [{ id, name, why: "No WhatsApp number" }] }` | 400 |
| `POST /api/v2/retail/buying/suppliers/import` (multipart `file`) · `GET …/import/template` | `retail.suppliers:create` | `.xlsx`/`.csv` with Name, Phone, Email, Pays, Delivers, Lead time, Minimum order, VAT number, BP number, Bank account, Address | `{ added, skipped: [{ row, why }] }` / the template `.xlsx` | 400 "That file has no Name column." |
| `GET /api/v2/retail/records/Vendor/[id]/pdf?from=&to=` | `retail.bills:view` | — | `application/pdf` statement: bills, payments, returns and credits in date order with a running balance; default the last 90 days | 404 |

Lookups registered in `lib/retail/lookups.ts` (FND 4.4):

| Noun | Read | Search | Sub | Quick add |
|---|---|---|---|---|
| `supplier` | `retail.suppliers:view` | suppliers bought from, by name, code, phone | "Beverages, 30 days" (top category, terms: "on delivery" / "<n> days") | `[["Name",""],["Phone or WhatsApp","+263 7"]]` → `createSupplier`, `retail.suppliers:create` |
| `payee` | `retail.requisitions:view` | the same suppliers | "Supplier" | as `supplier` |
| `contact` | `retail.suppliers:view` | `context.supplierId`: its live contacts and the rep; label "Tinashe Moyo, rep" for the rep, "Delta orders desk" | the phone, else the email | `[["Name",""],["Phone or WhatsApp","+263 7"]]` → a contact with role "Sales rep" when the supplier has no rep, else none; `retail.suppliers:update` |
| `contact role` | `retail.suppliers:view` | Sales rep, Accounts, Orders desk, Driver + roles in use | — | `[["Name",""]]` → returns the typed word as an option (stored on the contact) |

### 4.3 Orders (BUY-02, BUY-03)

| Method and path | Permission | Request | Response | Errors |
|---|---|---|---|---|
| `POST /api/v2/retail/buying/orders` | `retail.purchasing:create` | `{ supplierId, siteId, expectedDate?, lines: [{ inventoryItemId, quantity, unitCost }] (≥1 to send), payment: "ON_ACCOUNT"\|"CASH_ON_DELIVERY", askForCash: boolean, noteToSupplier?, send: boolean }` | 201 `{ data: OrderView, requisition?: { id, requisitionNo }, messages: [{ id, to, channel }] }` | 400 field errors; 409 stopped supplier; 409 "Delta Beverages has no WhatsApp number or email." only when `send` and the client asked for a channel |
| `GET /api/v2/retail/buying/orders/[id]` | `retail.purchasing:view` | — | `{ data: OrderView }`: header, `status`, `late: { days } \| null`, `steps`, `chips`, `figure`, `kpis` (§5.4), `chart` (per line % delivered), `lines` (with `outstanding`, `closedShort`), `deliveries: [{ id, receiptNo, postedAt, units }]`, `rail`, `requisition: { id, requisitionNo, status } \| null`, `counts: { lines, deliveries, messages, activity }`, `can: { send, edit, chase, close, reopen, cancelRest, remove, duplicate, receive, askForMoney, bill }` | 404 (binned: 200 with `archivedAt` for the banner) |
| `PATCH /api/v2/retail/buying/orders/[id]` | `retail.purchasing:update` | `{ expectedDate?, siteId?, lines?: [{ id?, inventoryItemId, quantity, unitCost }], tell?: boolean, supplierId? (drafts only), payment? }` (rail edits send one field) | `{ data, changed }` | 409 rules in §W-30 |
| `POST /api/v2/retail/buying/orders/[id]/send` | `retail.purchasing:create` | `{ via?: "WHATSAPP"\|"EMAIL"\|"BY_HAND" }` (default by the supplier) | `{ data, messages }` | 409 not a draft; 400 no lines |
| `POST /api/v2/retail/buying/orders/bulk/send` | `retail.purchasing:create` | `{ ids }` | `{ sent: string[], skipped: [{ poNo, why }] }` | — |
| `POST /api/v2/retail/buying/orders/[id]/chase` | `retail.purchasing:update` | `{ contactId \| null (null = the supplier's own number), message, promisedFor, then: "REMIND"\|"CANCEL_REST" }` | `{ data, message: { id } }` | 400, 409 |
| `POST` / `DELETE /api/v2/retail/buying/orders/[id]/close` | `retail.purchasing:update` | `{ note? }` / — | `{ data }` | 409 (kept + the bill rule on reopen) |
| `POST /api/v2/retail/buying/orders/[id]/cancel-rest` | `retail.purchasing:update` | `{ tell: true }` | `{ data }` | 409 not open |
| `POST /api/v2/retail/buying/orders/bulk/cancel` | `retail.purchasing:update` (drafts also `delete`) | `{ ids }` | `{ binned: string[], cancelled: string[], skipped: [{ poNo, why: "Already done" }] }` | — |
| `POST /api/v2/retail/buying/orders/bulk/receive` | `retail.purchasing:approve` | `{ ids }` | `{ posted: [{ poNo, receiptNo }], skipped }`: each open order received in full as ordered ("Mark received") | — |
| `POST /api/v2/retail/buying/orders/[id]/duplicate` | `retail.purchasing:create` | — | 201 `{ data: { id, poNo } }` | 409 stopped supplier |
| `GET /api/v2/retail/records/RetailPurchaseOrder/[id]/pdf` | `retail.purchasing:view`, or a valid `?token=` (the link in a message: HMAC-SHA256 over `<id>.<expiry>` with `NEXTAUTH_SECRET`, 30 days; `lib/retail/buying/documents.ts` signs and checks) | — | `application/pdf` (order: shop name and VAT number, PO number, supplier, deliver to, expected, lines with cost, VAT, total, payment, note) | 404, 410 expired token |
| Bin kind `order` (`POST /api/v2/retail/bin`, `…/bin/restore`) | `retail.purchasing:delete` | `{ kind: "order", id }` | FND | 409 not a draft / paid-out requisition |

Lookup `order` (`retail.requisitions:create` to read; quick add `retail.purchasing:create`): drafts and open orders without a
live requisition, label "PO-0005 · Afdis Distillers", sub the total with VAT; quick fields `[["Supplier",""],["Expected",""]]`
→ an empty draft.

### 4.4 Deliveries (BUY-06, BUY-08)

| Method and path | Permission | Request | Response | Errors |
|---|---|---|---|---|
| `GET /api/v2/retail/buying/orders/[id]/receiving` | `retail.purchasing:receive` | — | `{ order: { id, poNo, supplier, site, late, deliveriesSoFar, deliveredSummary: "300 of 780 came on 13 August" }, lines: [{ orderLineId, inventoryItemId, name, barcodes: string[], packBarcode?, packSize?, ordered, before: "120 came on 13 Aug" \| "First delivery", due, unitCost, vatRate }], terms: { payment, sentence: "On account with Delta, 30 days from delivery. The bill for this delivery falls due on 2 Nov." }, empties: { on: boolean, perCrate: "3.00", crateWord: "Chibuku crates" } \| null, requisitions: [{ id, requisitionNo, amount, status }], counters: default person }` | 404; 409 order state |
| `POST /api/v2/retail/buying/deliveries` | `retail.purchasing:receive`; `post: true` also `retail.purchasing:approve` | `{ purchaseOrderId?, supplierId (no order), siteId (no order), noteNumber?, countedById?, photoUrl?, lines: [{ purchaseOrderLineId?, inventoryItemId, quantity (this time), damaged, unitCost, rest?: "KEEP"\|"CLOSE" }], empties?: { crates }, requisitionId?, paying?: { mode: "ON_ACCOUNT"\|"NOT_YET"\|"CASH_NOW", moneyAccountId? }, post: boolean }` | 201 `{ data: { id, receiptNo, status, units, value, stillOnOrder, orderClosed }, accountingStatus }` | 400, 403 (post without approve; cash over the limit), 409 (order state, more than owed, cash short) |
| `GET /api/v2/retail/buying/deliveries/[id]` | `retail.purchasing:view` | — | `{ data: DeliveryView }`: header, `status`, `steps`, `chips`, `figure`, `kpis`, `chart` (counted ÷ note per line), `lines`, `rail`, `bill: { id, billNumber } \| null`, `counts: { lines, differences, photos, activity }`, `can: { post, difference, photos, reverse, email, bill }` | 404 |
| `PATCH /api/v2/retail/buying/deliveries/[id]` | `retail.purchasing:update` | `{ noteNumber? , driver?, countedById? }` | `{ data, changed }` | 400 |
| `POST /api/v2/retail/buying/deliveries/[id]/post` · `POST …/deliveries/bulk/post` | `retail.purchasing:approve` | — / `{ ids }` | `{ data }` / `{ posted, skipped }` | 409 already posted; the W-33 order checks at posting time |
| `POST /api/v2/retail/buying/deliveries/[id]/differences` | `retail.purchasing:update` | `{ lineId, counted, why: "Short"\|"Broken"\|"Wrong item"\|"Extra", settle?: "Ask for a credit"\|"Bring it next time"\|"Write it off", photoUrl? }` | 201 `{ data: Difference, delivery: DeliveryView }` | 400, 409 |
| `POST /api/v2/retail/buying/deliveries/[id]/photos` | `retail.purchasing:receive` | `{ files: [{ url, name, contentType, size }] }` | `{ data: Attachment[] }` | 400 |
| `POST /api/v2/retail/buying/deliveries/[id]/reverse` | `retail.purchasing:approve` | `{ reason (1–300) }` | `{ data }` | 409 "INV-88120 is recorded against it. Move the bill to the bin first."; 409 "Only 12 of Castle Lager 340ml are left on the shelf. Record a difference instead." |
| `POST /api/v2/retail/buying/deliveries/[id]/email` | `retail.purchasing:update` | — (to the order's recipients' emails, else the supplier's) | `{ queued: n }` | 409 "Delta Beverages has no email." |
| `POST /api/v2/retail/buying/deliveries/notes` | `retail.purchasing:view` | `{ ids }` | `application/pdf`, one delivery note per page | — |
| `GET /api/v2/retail/records/RetailGoodsReceipt/[id]/pdf` | `retail.purchasing:view` | — | `application/pdf` (the "Delivery note PDF" link and "Export as PDF") | 404 |
| `POST /api/v2/retail/buying/attachments` (multipart `file`) | any buying create/update right | pdf, png, jpeg, webp ≤ 10 MB | `{ url, name, contentType, size }` (`@vercel/blob` `put` at `retail/<companyId>/buying/<uuid>.<ext>`, the catalogue image route's pattern) | 400 "That file is not a PDF or a picture." / "That file is over 10 MB." |

Lookups: `delivery` (`retail.bills:create`): `context.supplierId`, posted unbilled deliveries, label "GRN-0002 · 13 Aug", sub
the value with VAT; no quick add (the board's quick fields are not offered: a delivery is made by receiving). `line`
(`retail.purchasing:update`): `context.deliveryId`, its lines, sub "60 counted"; no quick add. `requisition`
(`retail.purchasing:receive`, the Receive page's "Paid in cash instead?"): paid-out requisitions for this supplier not yet
linked, label "REQ-0014", sub "US$1,940.00 paid out"; the list's last option "Ask for money" opens `req-new&orderId=`.

### 4.5 Requisitions (BUY-04, BUY-05)

Moved from `/api/v2/retail/requisitions/**` (removed).

| Method and path | Permission | Request | Response | Errors |
|---|---|---|---|---|
| `POST /api/v2/retail/buying/requisitions` | `retail.requisitions:create` | `{ for: "order"\|"expense", orderId?, expenseTypeId?, whatFor?, amount, currency: "US$"\|"ZiG", payFromId?, payToId?, neededBy?, why?, quoteUrl? }` | 201 `{ data: { id, requisitionNo, waitsFor: "Tendai Mhlanga" \| null } }` | 400, 409 |
| `GET /api/v2/retail/buying/requisitions/[id]` | `retail.requisitions:view` + row rule | — | `{ data: RequisitionView }`: header, `status`, `steps`, `chips`, `figure`, `kpis`, `chart`, `rail`, `counts`, `can: { approve, approveLess, reject, ask, payOut, acquit, cancel, askAgain, update }` | 404 (not theirs: 404) |
| `PATCH /api/v2/retail/buying/requisitions/[id]` | the asker or `retail.requisitions:update`, `SUBMITTED` only (`payFromId` also while `APPROVED`) | one of `{ amount, payFromId, payToId, neededBy, whatFor, expenseTypeId }` | `{ data, changed }` | 409 "REQ-0014 has been approved. Ask again to change it." |
| `POST …/requisitions/[id]/approve` · `POST …/requisitions/bulk/approve` | `retail.requisitions:approve` + limit | `{ amount?, note? }` / `{ ids }` (each at the amount asked) | `{ data }` / `{ approved, skipped: [{ requisitionNo, why: "Over US$500.00 needs Tendai Mhlanga." }] }` | 403, 409 |
| `POST …/requisitions/[id]/reject` · `POST …/requisitions/bulk/reject` | `retail.requisitions:approve` + limit | `{ reason: "Not needed now"\|"Too much"\|"Pay another way"\|"Other", message }` / `+ ids` | `{ data }` / `{ rejected, skipped }` | 400 message required for Other |
| `POST …/requisitions/[id]/question` | `retail.requisitions:approve` | `{ message (1–500) }` | `{ data }` | — |
| `POST …/requisitions/[id]/pay` · `POST …/requisitions/bulk/pay` (the sheet steps; each call is one requisition) | `retail.requisitions:update` | `{ paid, fromId, toId, how: "Cash"\|"Bank transfer"\|"EcoCash", reference? }` | `{ data, accountingStatus }` | 400, 409 |
| `POST …/requisitions/[id]/acquit` | asker or `retail.requisitions:update` | `{ spent, changeIntoId?, receipts: [{ url, name, contentType, size }] (≥1), note? }` | `{ data, accountingStatus }` | 400, 409 |
| `POST …/requisitions/[id]/cancel` | asker or `retail.requisitions:update` | — | `{ data }` | 409 |
| `GET /api/v2/retail/records/CrmRequisition/[id]/pdf?sign=1` | `retail.requisitions:view` + row rule | — | `application/pdf`; with `sign=1` ("Print for signing") boxes for "Asked by", "Approved by", "Paid out by", "Received by" | 404 |

Lookups: `money account` (`retail.requisitions:view`; quick add `retail.setup:create` — owner, manager): active `BankAccount`s,
label the name, sub the balance (cash) or "•••• 4471"; quick fields `[["Name",""],["Kind","Cash, bank or mobile"]]` (Kind
parsed: cash/bank/mobile, default Cash; ledger 1005/1010/1016). `expense type` (`retail.requisitions:view`; quick add
`retail.requisitions:approve`): live types; quick fields `[["Name",""],["Account","Expenses"]]`. `person` is the admin spec's.

### 4.6 Bills and payments (BUY-07)

| Method and path | Permission | Request | Response | Errors |
|---|---|---|---|---|
| `POST /api/v2/retail/buying/bills` | `retail.bills:create` | `{ supplierId, deliveryId?, billNumber, billDate, amount, dueDate?, fileUrl? }` | 201 `{ data: BillView, accountingStatus }` | 400, 409 (§W-35) |
| `GET /api/v2/retail/buying/bills/[id]` | `retail.bills:view` | — | `{ data: BillView }`: `{ id, billNumber, supplier, delivery: { id, receiptNo, date, valueWithVat } \| null, billDate, dueDate, amount, paid, owed, state, file: Attachment \| null, lastChange: "Changed by Tendai Mhlanga, 14 August.", can: { update, pay, bin } }` | 404 |
| `PATCH /api/v2/retail/buying/bills/[id]` | `retail.bills:update` | any of the create fields | `{ data, changed }` | 409 below paid |
| `GET /api/v2/retail/buying/bills/compare?deliveryId=&amount=` | `retail.bills:create` | — | `{ deliveryValue, difference, hint: "US$1.20 more than the delivery. Accept it, or ask for a credit." \| null, due: "YYYY-MM-DD", dueHint: "30 days from delivery." }` | 404 |
| Bin kind `bill` | `retail.bills:delete` | FND | FND | 409 paid against |
| `GET /api/v2/retail/buying/payments/preview?supplierId=&amount=&billId=` | `retail.bills:create` | — | `{ owed, pays: [{ billId, billNumber, amount }], credit, sentence: "INV-88120, INV-88504, oldest first" }` | 404 |
| `POST /api/v2/retail/buying/payments` | `retail.bills:create` | `{ supplierId, amount, paidOn, how: "Cash"\|"Bank transfer"\|"EcoCash", fromId, reference?, firstBillId? }` | 201 `{ data: { groupNo, rows: [...], owedAfter }, accountingStatus }` | 400, 409 |
| `POST /api/v2/retail/buying/bills/export` | `retail.bills:view` | `{ ids }` | `.xlsx` | — |

### 4.7 Returns (BUY-09)

| Method and path | Permission | Request | Response | Errors |
|---|---|---|---|---|
| `POST /api/v2/retail/buying/returns` | `retail.purchasing:create` | `{ supplierId, why: "Damaged"\|"Expired"\|"Wrong item"\|"Not ordered", lines: [{ inventoryItemId, quantity, unitCost }], settle: "Credit note"\|"Replace the goods"\|"Refund", collected?, photoUrls? }` | 201 `{ data: { id, returnNo, units, value }, accountingStatus }` | 400 quantities over on hand |
| `POST /api/v2/retail/buying/returns/[id]/settle` | `retail.purchasing:update` | `{ kind: "CREDIT_NOTE", creditNoteNumber }` \| `{ kind: "REPLACED", deliveryId }` \| `{ kind: "REFUND", amount, intoId }` | `{ data }` | 409 already settled |

### 4.8 Messages (BUY-02, BUY-03)

| Method and path | Permission | Notes |
|---|---|---|
| `POST /api/v2/retail/messages/whatsapp` (public; `GET` answers Meta's verify challenge with `META_WHATSAPP_VERIFY_TOKEN`) | signed by Meta (`X-Hub-Signature-256` with `META_APP_SECRET`) | Inbound messages → `RetailMessage IN` matched by number (§W-34); status callbacks update `status`/`sentAt` by `externalId`. 200 always after verification; 401 on a bad signature. If SET-07 already ships this webhook, this area only adds the order matching. |

### 4.9 Worker (BUY-03)

`runBuyingFollowUps(companyId)` in `lib/retail/buying/follow-ups.ts`, called by `scripts/retail-worker.ts` (SET-07/SET-09's
worker) daily at 07:00 Africa/Harare: the W-34 reminders and automatic cancellations, then receipts-overdue notifications for
requisitions past `receiptsDueAt` (once, `CRM_REQUISITION_DECIDED`-style "REQ-0012: receipts were due yesterday.").

### 4.10 Documents

Renderers in `lib/retail/buying/documents.ts` registered with FND's `GET /api/v2/retail/records/[type]/[id]/pdf` and built with
`renderPdfFromHtml` (`lib/documents/pdf-renderer.ts`): purchase order, delivery note, requisition (and its signing variant),
supplier statement. Each carries the company's legal and trading names and VAT number (setup spec's company profile).

### 4.11 Removed endpoints

`/api/v2/retail/purchasing/orders` (GET, POST), `/api/v2/retail/purchasing/orders/[id]` (GET, PATCH, DELETE),
`/api/v2/retail/purchasing/orders/[id]/close`, `/api/v2/retail/purchasing/receipts` (GET, POST), `/api/v2/retail/requisitions`
(GET, POST), `/api/v2/retail/requisitions/[id]` (GET, PATCH). Their behaviour moves to the routes above and to the list sources
(the GETs). `lib/retail/route-guard-coverage.test.ts` is updated with the new routes.

---
## 5. UI per page

Frames and their parts are FND's (loading skeletons, the error block with "Try again", the no-match state with "Clear", the pager and phone cards are FND 5.4.11–5.4.12 and 5.6; they are not repeated per page); this section gives each page's configuration and copy. Lists: `ListSpec` in
`lib/reports/definitions/retail/buying.ts`; records: `RecordKind` in `lib/retail/record-kinds/buying.ts`; sheets: `SheetKind`
in `lib/retail/sheet-kinds/buying.ts`; asks in `lib/retail/asks.ts`. Pages are thin: `app/retail/buying/suppliers/page.tsx` →
`<ListFrame source="retail-suppliers" />`, `…/suppliers/[id]/page.tsx` → `<RecordFrame kind="supplier" id={id} />`, and so on.
Widths are the List template's grid tracks (plus FND's 40px tick column and 44px ⋯ column). Cell kinds are FND 5.4.7's.
"P" = column priority (3 leaves at ≤1140px of table width, 2 at ≤940px).

### 5.1 Suppliers — `/retail/buying/suppliers` · board `SuppliersList.png` · source `retail-suppliers` (BUY-01)

- **Header:** title "Suppliers"; no sub, no back; primary "+ New supplier" → `?sheet=supplier-new` (`retail.suppliers:create`).
- **Tabs:** none.
- **Toolbar:** search "Name, contact or phone" (name, code, rep, contacts' names, phone, WhatsApp); "Category Any"; "Owed Any";
  "Filters" (Show: Buying from · Stopped · Both); count; sort "Most spent" (also "Most owed", "Name A–Z", "Last delivery,
  newest" **Defined here**); Group (None, Terms, Category); Columns; Export.
- **Columns** (min width 1180px):

| Column | Key | Cell | Width | Align | P | Notes |
|---|---|---|---|---|---|---|
| Supplier | `name` | `link` | minmax(170px,1.3fr) | start | — | → `/retail/buying/suppliers/{id}`; stopped ones carry a muted " · stopped" (**Defined here**) |
| Contact | `rep` | `text` | 130px | start | 3 | the rep's name; "—" faint |
| Phone | `phone` | `mono` | 150px | start | 2 | |
| Terms | `terms` | `muted` | 90px | start | 3 | "30 days", "14 days", "7 days", "Cash" (on delivery) |
| Open | `openOrders` | `num` | 70px | end | — | total Σ |
| Owed | `owed` | `owed` / `zero` | 110px | end | — | total Σ; credit shows "US$40.00 credit" muted |
| Last delivery | `lastDelivery` | `date` | 130px | start | 3 | "—" faint when none |
| Fill rate | `fillRate` | `bar` (pct, warnBelow 80) | 130px | start | 2 | "No deliveries yet" faint when none |
| Spend, 12 months | `spend12` | `money` | 120px | end | — | total Σ |

- **Totals:** "Σ <count>" under Supplier, Open Σ, Owed Σ, Spend Σ, over every filtered row (the board's "Σ 6 · 4 · US$743.00 ·
  US$42,964.70" are its sample rows; on the seed: 7, 4, US$1,031.20, the twelve months' deliveries).
- **Row link:** the record. **Row ⋯** (**Defined here**): Open · New order · Record a payment (`retail.bills:create`) · Message
  on WhatsApp · Stop buying from them (bad, `retail.suppliers:delete`).
- **Bulk:** "New order for each" (→ `order-new` stepping through the ticked, `retail.purchasing:create`) · "Record payments" (→
  `payment-new` stepping through the ticked that owe something, `retail.bills:create`) · "Message on WhatsApp" (→
  `supplier-message&ids=`) · Export.
- **Empty guide** (verbatim from `Guided.png`): "Who do you buy from?" / "Add a supplier once, and ordering becomes a tap from
  anything running low." / 1 "**Add them with a name and a WhatsApp number.** Terms and bank details can wait." / 2 "**Link the
  products you buy from them.** Or let it happen on their first delivery." / 3 "**Order from low stock.** Tender suggests the
  lines; you send them on WhatsApp." / primary "Add your first supplier" (`supplier-new`) / secondary "Import a spreadsheet"
  (`?sheet=supplier-import`).
- **Phone card:** title the name; badge "1 late" bad when it has late orders; figure Owed; meta "Tinashe Moyo · 30 days · last
  delivery 2 Oct".
- **Roles:** stock clerk sees the list without primary, Owed/Spend columns stay (they may see cost); bookkeeper sees it with no
  primary, row ⋯ "Record a payment"; cashier: no nav item, 403 page.

### 5.2 Supplier record — `/retail/buying/suppliers/[id]` · board `SupplierRecord.png` · kind `supplier` (BUY-01)

- **Header:** back "Suppliers"; title "Delta Beverages"; reference "SUP-0001". Actions: "Record a payment" (`payment-new`,
  `retail.bills:create`), "Record a bill" (`bill-new&supplierId=`, `retail.bills:create`), "Message on WhatsApp"
  (`supplier-message&ids=<id>`); ⋯: "Export statement as PDF" (first, the statement PDF), "Add a contact" (`contact-new`),
  "Return goods" (`return-new`, `retail.purchasing:create`), "Stop buying from them" (bad, ask `stopbuying`). Primary "New
  order" (`order-new&supplierId=`, `retail.purchasing:create`). Not binnable. A stopped supplier: banner (bad-soft, FND bin
  banner's shape) "You stopped buying from Pamela on 3 October. Orders cannot be raised to them." with "Buy from them again";
  "New order" hidden.
- **Strip:** no steps. Chips: "Pays 30 days" / "Pays on delivery" (plain), top category "Beverages" (plain), "1 order late" (bad,
  when any). Figure "Owed US$624.00" (warn when > 0; "In credit US$40.00" plain when < 0).
- **KPIs:** "Spend, 12 months" US$18,420.00 · "+6%" ok "on the 12 before"; "Orders" 23 · "1" "open"; "On time" 78% · "−9 pts"
  bad "on last year"; "Fill rate" 92% · "12" warn "units short this year"; "Owed" US$624.00 · "15 Oct" "due".
- **Chart:** "Bought per month" unit "US$"; bars = posted delivery value with VAT per month, last bar darker; range "3 months ·
  12 months · All time" (default 12 months).
- **Tabs** (each with Export; footer "1–5 of 23" and the "all" link):

| Tab | Source | Columns (grid) | All link |
|---|---|---|---|
| Orders | `retail-orders` (`supplierId`) | Order (`ref`, 100px) · State (`state`, 140px) · Raised (`date`, 1fr) · Expected (`date`, 130px) · Delivered (`mono` "300 of 780", end, 140px) · Value (`money`, end, 120px); Σ "Σ 5 shown", "1,912 of 2,396", value | "All 23 orders" → `/retail/buying/orders?supplier=<id>&tab=all` |
| Deliveries | `retail-deliveries` | Delivery (`ref`) · Order (`ref`) · Received (`date`) · Units (`num`) · Value (`money`) · Against the order (`state`) | "All 21 deliveries" |
| Bills | `retail-bills` | Bill (`ref`) · Delivery (`ref`) · Billed · Due · State · Amount · Owed | "All 4 bills" (`retail.bills:view`; tab hidden for the stock clerk) |
| Payments | `retail-supplier-payments` | Payment (`mono` "PAY-0019") · Paid on (`date`) · Paid by (`text`) · From (`muted`) · Reference (`mono`) · Pays (`muted` "INV-88120, INV-88504") · Amount (`money`) | "All 19 payments" → Bills list filtered (`?supplier=<id>&tab=paid`) |
| Returns | `retail-supplier-returns` | Return (`mono` "RTN-0002") · Booked (`date`) · Why (`text`) · Units (`num`) · Value (`money`) · Settle by (`text`) · State (`state`: "Credit expected" warn, "Replacement expected" warn, "Refund expected" warn, "Settled" hollow; "Credit asked" warn for a delivery difference with settle CREDIT) | none; row ⋯: Credit note came · Replacement came · Refund came (§W-36) |
| Contacts | `retail-supplier-contacts` | Name (`text` 600) · Role (`muted`) · Phone (`mono`) · Email (`text`) · Sends them (`state`: Orders info, Statements neutral, Nothing hollow) | none; row ⋯: Edit (`contact-new&id=`) · Make them the rep · Remove (ask `removecontact`) |
| Activity | FND | | |

- **Rail** (hint "click any value to change it" on Contact; every row editable with `retail.suppliers:update`):
  - Contact: Rep (`auto` contact) "Tinashe Moyo"; Phone (mono) "+263 24 270 1600"; WhatsApp (mono) "+263 77 214 9080"; Email
    "orders@delta.co.zw".
  - Terms: Pays (`seg` On delivery / 7 days / 14 days / 30 days) "30 days from delivery" ("On delivery"); Delivers (text)
    "Tuesdays and Fridays"; Minimum (money) "US$500.00 an order" ("None"); Lead time (text) "2 days".
  - Details: VAT number (mono) "10023881"; BP number (mono) "200118844"; Bank (mono) "CBZ · •••• 4471" (editing shows the full
    text, `retail.bills:update` or `retail.suppliers:update`).
  Empty values read "Add" in `--faint` (**Defined here**).
- **Phone:** FND.

### 5.3 Orders — `/retail/buying/orders` · board `OrdersList.png` · source `retail-orders` (BUY-02)

- **Header:** title "Orders"; primary "+ New order" → `?sheet=order-new` (`retail.purchasing:create`).
- **Tabs:** Open (3) · Drafts (1) · Received (19) · All (23); default Open.
- **Toolbar:** search "Order number or supplier"; "Supplier Any"; "Site Any" (hidden with one site); "Filters" (Late: Any /
  Late / Not late; Raised: period); count; sort "Expected, soonest" (also "Raised, newest", "Most still to come", "Order
  number" **Defined here**); Group (None, State, Supplier, Site); Columns; Export.
- **Columns** (min width 1100px):

| Column | Key | Cell | Width | Align | P | Notes |
|---|---|---|---|---|---|---|
| Order | `poNo` | `ref` | 110px | start | — | → `/retail/buying/orders/{id}` |
| Supplier | `supplier` | `text` | minmax(160px,1.3fr) | start | — | |
| State | `state` | `state` | 130px | start | — | §3.2 badges and tones |
| Raised | `raised` | `date` | 120px | start | 3 | |
| Expected | `expected` | `date` | 140px | start | 2 | `firstExpectedDate` ("16 August 2026") |
| Delivered | `delivered` | `bar` ("300 of 780"; ok fill when all in, warn when part delivered or late, data when 0) | 150px | start | 2 | |
| Value | `value` | `money` | 110px | end | — | total with VAT |
| Still to come | `stillToCome` | `owed` when part delivered or late, `money` when nothing came yet, `zero` at 0 | 120px | end | — | |

- **Totals:** "Σ 5", Delivered "413 of 1,012" (mono), Value Σ, Still to come Σ.
- **Row ⋯** (**Defined here**, each only where it applies): Open · Send to <supplier> · Receive a delivery · Send a reminder ·
  Edit lines · Duplicate order · Close with what came · Remove the order (bad).
- **Bulk:** "Send to suppliers" (drafts; confirm `sendorders` **Defined here**) · "Mark received" (open orders; confirm
  `markreceived`; `retail.purchasing:approve`) · "Cancel" (confirm `cancelorders`) · Export.
- **Empty** (**Defined here**): icon `TrayArrowDown`, "No orders yet", "Orders you raise, from low stock or by hand, show here.",
  primary "New order".
- **Phone card:** title "PO-0003 · Delta Beverages"; badge the state; figure Still to come; meta "300 of 780 · expected 16
  Aug".
- **Roles:** stock clerk: no primary, no bulk except Export, row ⋯ only Open and Receive a delivery; bookkeeper: read only.

### 5.4 Order record — `/retail/buying/orders/[id]` · boards `OrderRecord.png`, `OrderRemove.png` (draft) · kind `order` (BUY-02, BUY-03)

- **Header:** back "Orders"; title the supplier "Delta Beverages"; reference "PO-0003".
  - `SENT`/`PARTIAL`: actions "Send a reminder" (`order-chase`), "Edit lines" (`order-edit`), "Print"; ⋯ "Export as PDF",
    "Duplicate order", "Ask for money" (**Defined here**, when no live requisition), "Close with what came" (`closeshort`),
    "Cancel what is left" (bad, `cancelrest`); primary "Receive a delivery" → `/retail/buying/orders/[id]/receive`.
  - `DRAFT` (`OrderRemove.png`): actions "Edit lines", "Print"; ⋯ "Export as PDF", "Duplicate order", "Ask for money",
    "Remove the order" (bad, `removeorder`); primary "Send to Delta".
  - `RECEIVED`/`CLOSED`/`CANCELLED`: actions "Print"; ⋯ "Export as PDF", "Duplicate order"; primary "Reopen the order" (`CLOSED`,
    no bill) or "Record a bill" (deliveries unbilled, `retail.bills:create`, opens `bill-new&deliveryId=<the oldest unbilled>`),
    else none.
  Stock clerk: only "Print" and ⋯ "Export as PDF"; primary "Receive a delivery". Bookkeeper: "Print"; primary "Record a bill".
- **Strip:** steps Draft · Sent · Part delivered · Received · Billed (§3.2). Chips: "48 days late" (bad) / "Not sent" (plain) /
  "Closed short" (plain) / "Cash asked for" (info), "Cash approved", "Cash paid out" (ok) for a requisition. Figure "Still to
  come US$384.00" (warn when late or part delivered); drafts "Value US$412.80".
- **KPIs:** "Ordered" 780 · "4" "lines"; "Delivered" 300 · "38%" warn "of the units" (ok at 100%); "Value" US$624.00 ·
  "US$240.00" "delivered"; "Still to come" US$384.00 · "480" "units"; "Expected" "16 Aug" · "48" bad "days late" (not late: "5"
  "days", "today", "tomorrow"; done: "on time" / "2 days late" from the last delivery).
- **Chart:** "Delivered, by line" unit "% of what was ordered"; one bar per line (short names), fixed max 100%, the last line
  darker; **no range control** (FND open question 10: the record template's range is drawn only where the kind has one).
- **Tabs:**

| Tab | Source | Columns | Footer link |
|---|---|---|---|
| Lines | `retail-order-lines` | Product (`text`, 1fr) · Ordered (`num` 90px) · Delivered (`num` 90px) · Still to come (`owed`-style warn pill when > 0 and the order is late or part delivered, plain `num` otherwise; a closed-short line shows "0" and "not delivered" muted, 110px) · Cost (`money` muted, 90px) · Value (`money`, 110px); Σ "Σ 4 lines", 780, 300, 480, —, US$559.20 (lines ex VAT) | "Order history" → this record's Activity tab |
| Deliveries | `retail-deliveries` (`orderId`) | Delivery (`ref`) · Received (`date`) · Units (`num`) · Value (`money`) · Against the order (`state`) · Received by (`text`) | none |
| Messages | `retail-order-messages` | When (`when`, 150px) · Who (`text`: "To Tinashe Moyo" / "From Delta Beverages") · How (`muted`: WhatsApp, Email) · Message (`text`, ellipsis, full in a tooltip) · State (`state`: Sent info, Delivered ok, Read ok, Failed bad — "Failed: WhatsApp is not set up", Reply hollow) | none; row ⋯ "Send again" for Failed |
| Activity | FND | | |

- **Rail:**
  - Order (hint "click any value to change it"): Supplier (draft: `auto` supplier; else read-only); Site (`auto` site, until
    anything came); Raised (mono, read); Raised by (read); Sent ("WhatsApp, 10 August 14:20", "Not yet", "By hand, 10 August";
    read).
  - Money: Lines (mono), VAT (mono), Total (mono), Pays ("30 days from delivery" / "Cash on delivery": `seg` On account / Cash
    on delivery while not done).
  - Deliveries: one row per delivery, key "GRN-0002" (a link to it), value "13 August, 300 units"; then "Next": "Promised for 7
    October" (after a reminder), "Expected 7 October" (otherwise; editable date while open). Hidden for drafts.
  Editing needs `retail.purchasing:update`.
- **Bin:** drafts only (kind `order`), the FND banner when binned.

### 5.5 Deliveries — `/retail/buying/deliveries` · board `DeliveriesList.png` · source `retail-deliveries` (BUY-08)

- **Header:** title "Deliveries"; primary "+ Take in stock" → `?sheet=intake` (`retail.purchasing:receive`).
- **Tabs:** none.
- **Toolbar:** search "Delivery number or supplier" (GRN, note number, supplier, order number); "Supplier Any"; "Differences
  Any" (Matches, Short, Damaged, No order, To check); "Filters" (Received: period; Site); count; sort "Received, newest" (also
  "Received, oldest", "Value, highest" **Defined here**); Group (None, Supplier, Against the order); Columns; Export.
- **Columns** (min width 1140px):

| Column | Key | Cell | Width | Align | P |
|---|---|---|---|---|---|
| Delivery | `receiptNo` | `ref` → `/retail/buying/deliveries/{id}` | 110px | start | — |
| Supplier | `supplier` | `text` | minmax(160px,1.3fr) | start | — |
| Order | `poNo` | `ref` → the order; "No order" faint | 100px | start | 2 |
| Received | `received` | `date` (`COUNTED`: the count's date) | 150px | start | 3 |
| Lines | `lines` | `num` | 70px | end | 3 |
| Units | `units` | `num` | 90px | end | — |
| Value | `value` | `money` | 110px | end | — |
| Against the order | `against` | `state` (§3.2) | 130px | start | — |
| Received by | `receivedBy` | `text` (the counter) | 130px | start | 2 |

- **Totals:** "Σ 4", Lines Σ, Units Σ, Value Σ.
- **Row ⋯** (**Defined here**): Open · Post to stock (counted) · Record a difference (posted) · Record a bill (posted,
  unbilled) · Print delivery note.
- **Bulk:** "Print delivery notes" (one PDF) · "Post to stock" (the counted ones; ask `postdeliveries`;
  `retail.purchasing:approve`) · Export.
- **Empty** (**Defined here**): icon `Truck`, "Nothing received yet", "Deliveries against orders, and stock taken in without
  one, show here.", primary "Take in stock".
- **Phone card:** title "GRN-0002 · Delta Beverages"; badge Against the order; figure Value; meta "13 Aug · 300 units · Tafara
  Nyathi".

### 5.6 Delivery record — `/retail/buying/deliveries/[id]` · board `DeliveryRecord.png` · kind `delivery` (BUY-06, BUY-08)

- **Header:** back "Deliveries"; title the supplier "Delta Beverages"; reference "GRN-0002". Actions: "Record a difference"
  (`delivery-difference`, posted), "Add photos" (file picker, multiple; uploads then `POST …/photos`; toast "3 photos added."
  **Defined here**), "Print" (the delivery note PDF). ⋯: "Export as PDF", "Email to supplier", "Reverse this delivery" (bad →
  `delivery-reverse` sheet, **Defined here**). Primary: "Post to stock" (`COUNTED`, `retail.purchasing:approve`; toast "GRN-0005
  posted. 20 units in stock." **Defined here**) / "Record a bill" (posted, unbilled, `retail.bills:create`) / none.
- **Strip:** steps Arrived · Counted · Checked · In stock · Billed (§3.2). Chips: "12 short" (warn) / "2 damaged" (bad) / "No
  order" (plain) / "Reversed" (bad). Figure "Value US$216.00".
- **KPIs:** "Units" 300 · "312" "on the note"; "Lines" 4 · "2" warn "with differences"; "Value" US$216.00 · "−US$9.36" bad
  "short" (the short value; "Matches" when none); "Against" "PO-0003" · "38%" "of it delivered" ("No order" · "taken in"
  without one); "Received" "13 Aug" · "10:42" "by Tafara Nyathi".
- **Chart:** "Counted against the delivery note" unit "% of each line"; bar per line = in stock ÷ on the note, fixed 100%; no
  range control.
- **Tabs:**

| Tab | Source | Columns | Footer link |
|---|---|---|---|
| Lines | `retail-delivery-lines` | Product (1fr) · On the note (`num` 110px) · Counted (`num` 90px; in stock) · Difference (`diff`-style: warn pill "−6", `zero` "0", 110px) · Cost (`money` muted 90px) · Value (`money` 110px); Σ "Σ 4 lines", 312, 300, −12, —, US$214.80 | "Delivery note PDF" |
| Differences | `retail-delivery-differences` | When (`when`) · Product (`text`) · Why (`text`: Short, Broken, Wrong item, Extra) · Units (`diff`) · Value (`money`) · Settle by (`text`) · State (`state`: "Credit asked" warn, "Credited" ok, "Back on order" info, "Written off" hollow, "Returned" hollow) | none |
| Photos | `retail-delivery-photos` | a thumbnail grid (96px tiles, radius 8; name and "Added 13 Aug by Tafara Nyathi" under each); click opens the file (**Defined here**) | none |
| Activity | FND | | |

- **Rail:** Delivery (hint): Supplier (read), Order (mono link, read), Note number (mono, editable), Driver (editable). Received:
  When (mono, read), By (read: the counter, editable `auto` person while `COUNTED`), Checked by (read; "Not yet"), Site (read).
  Differences: Short ("12 units, US$9.36" mono), Credit ("Asked for, 13 August" / "Came, 20 August" / "None"), Photos ("3 of the
  boxes" — the count and the first photo's name; "None"). Editing needs `retail.purchasing:update`.

### 5.7 Receive delivery — `/retail/buying/orders/[id]/receive` · board `Receive.png` (BUY-06)

A hand-built page in the shell, the Deliveries panel item current. Desktop grid: main (padding 16 24) + aside 320px (left 1px
`--line`), as the board.

- **Header (48px):** back "PO-0003" (→ the order); title "Receive delivery"; then in mono 12 `--ink-3` "Delta Beverages, second
  delivery"; spacer; outline "Fill as ordered"; primary "Post to stock" (stock clerk "Send for checking").
- **Strip (48px, `--ground`):** a 300px input with a barcode icon, placeholder "Scan or type a product to jump to it"
  (`aria-label` "Scan or type a product"); chip "48 days late" (bad; "Due today" warn, none when on time); text "300 of 780
  came on 13 August" (`--ink-2`; "Nothing has come yet" for a first delivery); spacer; "Receiving" `--ink-3` and the live value
  mono 15/600 "US$300.36".
- **Guide note** (`role="note"`, `--ground` card, closable "Hide the guide"; hidden state remembered per person in
  `localStorage` `huchu.buying.receive.guide`): three numbered items, bold first clause: "**Count each line.** Type what came,
  or scan it. What is already filled is what the order says is due." · "**Put breakages aside.** Damaged bottles go in their own
  column, so they are claimed, not sold." · "**Decide on the rest.** Anything short stays on order, unless you close it short."
- **Table** (`role="table" aria-label="Lines on this delivery"`, radius 12, 1px `--line`): Product (name 13/500; under it
  "120 came on 13 Aug" or "First delivery" 12 `--ink-3`) · Ordered (mono) · This time (input 72×30 mono 600, right;
  `aria-label` "Coming now, <name>"; bad border when above what is due) · Damaged (input; red text when > 0; `aria-label`
  "Damaged units, <name>") · To come (mono; warn 600 when kept, muted when closed, "–" faint at 0) · The rest (two-button group
  "Keep" | "Close", the chosen one `--active` 600, `aria-pressed`; or "All in" with a green check) · Value (mono). Rows with
  nothing coming now sit on `--ground`. Totals row: "Σ 4 lines", 780, 426, 6 (bad when > 0), 54 (warn when > 0), —,
  "US$300.36". Under the table: "Quantities are single units. Damaged units are counted in, claimed from the supplier and kept
  off the shelf."
- **Aside, "When you post"** (live, dots ok / warn / hollow / bad): "<n> units go into stock at Harare Main Branch, on sale at
  once." · "<n> line stays on order: <n> units still to come. The order stays part delivered." / "<n> lines stay …" / "Nothing
  left to come. The order closes." · "<n> line is closed short. You pay only for what came." / "No lines closed short." · "A
  claim for <n> damaged units, US$5.16, goes to Delta Beverages." / "Nothing damaged, nothing to claim."
- **Aside, "The delivery note":** Note number (text, mono); Counted by (`auto` person, default the user); a 76px drop zone "Add a
  photo of the signed note" / "Drop it here, or take one on the phone" (photo field).
- **Aside, "Empties going back"** with the "Liquor store" tag (only when the shop is a liquor store and "Empties and deposits" is
  on): Crates (input), Deposit back (read, mono, "US$90.00" = crates × the crate deposit), hint "Chibuku crates at US$3.00
  each, credited against this order." (the crate product and deposit come from the stock spec's empties settings).
- **Aside, "Paying for it":** the terms sentence ("On account with Delta, 30 days from delivery. The bill for this delivery
  falls due on 2 Nov." / "Cash on delivery to Pamela."); "Paid in cash instead?" (`auto` requisition, placeholder "Search
  requisitions, or ask for money"); hint "Cash for a supplier comes from a requisition, like REQ-0014, so the safe always
  balances." (REQ-0014 is a link to the newest paid-out requisition for this supplier, or the sentence without "like …" when
  none).
- **After posting:** the guide is replaced by a status line (ok check) "**Posted to stock.** 420 units in stock, 36 still on
  order." with "Open GRN-0005"; inputs become read-only; the header primary disappears. Counting only: "**Sent for checking.**
  Tafara Nyathi or Tendai Mhlanga will post it." (**Defined here**).
- **States:** loading — FND skeleton rows; an order that cannot be received → the page shows FND's error block with the 409
  sentence and a link back to the order; leaving with typed counts asks "Leave without posting?" / "What you counted is not
  saved." / "Keep counting" / "Leave" (**Defined here**).
- **Phone (<720px):** the aside moves under the table; the table becomes one card per line (name, before, Ordered · To come,
  then This time and Damaged inputs side by side and Keep/Close); the strip's search stays on top; the primary is the header's
  44px icon button (FND).
- **Keyboard:** Enter in This time moves to Damaged, then to the next line; the scan box keeps focus after a scan.

### 5.8 Requisitions — `/retail/buying/requisitions` · board `RequisitionsList.png` · source `retail-requisitions` (BUY-04)

- **Header:** title "Requisitions"; primary "+ Ask for money" → `?sheet=req-new&for=order` (everyone on staff).
- **Tabs:** To approve (2) · To pay out (1) · Receipts due (1) · All (14); default To approve for approvers, All for others
  (**Defined here**).
- **Toolbar:** search "Number, purpose or person"; "Purpose Any" (An order, An expense); "Asked by Anyone" (hidden for cashiers
  and stock clerks); "Filters" (State; Needed: period); count; sort "Needed soonest" (also "Asked, newest", "Amount, highest");
  Group (None, State, Asked by, Purpose); Columns; Export.
- **Columns** (min width 1100px):

| Column | Key | Cell | Width | Align | P |
|---|---|---|---|---|---|
| Number | `requisitionNo` | `ref` → `/retail/buying/requisitions/{id}` | 110px | start | — |
| What for | `purpose` | `text` | minmax(200px,1.5fr) | start | — |
| State | `state` | `state` (§3.2) | 150px | start | — |
| Amount | `amount` | `money` (the approved amount when cut; ZiG as "ZiG 1,250.00") | 120px | end | — |
| Asked by | `askedBy` | `muted` | 150px | start | 3 |
| Needed by | `neededBy` | `date` | 120px | start | 2 |
| Against | `against` | `ref` "PO-0005" → the order, or `muted` the expense type ("Fuel", "Repairs", "Licences": its first word) | 130px | start | 2 |

- **Totals:** "Σ 5", Amount Σ (US$ only; ZiG shown as a second line "ZiG 1,250.00" when present, **Defined here**).
- **Row ⋯** (**Defined here**): Open · Approve · Reject · Pay out · Account for it · Cancel the requisition (bad) — each only
  where state and role allow.
- **Bulk:** "Approve" (ask `approvemany` **Defined here**; skips over-limit ones for a manager) · "Reject" (`req-reject&ids=`) ·
  "Pay out" (`req-payout` stepping through the approved ticked ones) · Export.
- **Empty** (**Defined here**): icon `Money`, "No requisitions yet", "When someone needs money for the shop, they ask here and
  the owner says yes or no.", primary "Ask for money".
- **Phone card:** title the purpose; badge the state; figure Amount; meta "REQ-0014 · Tafara Nyathi · needed 6 Oct".

### 5.9 Requisition record — `/retail/buying/requisitions/[id]` · boards `RequisitionRecord.png`, `ReqCancel.png` · kind `requisition` (BUY-04, BUY-05)

- **Header:** back "Requisitions"; title the purpose ("Cash to pay Afdis for order PO-0005", ellipsis); reference "REQ-0014".
  - `SUBMITTED`, viewer may decide: actions "Approve a different amount", "Reject", "Ask a question"; ⋯ "Export as PDF", "Print
    for signing", "Cancel the requisition" (bad); primary "Approve US$1,940.00".
  - `SUBMITTED`, viewer is the asker or may not decide: ⋯ "Export as PDF", "Print for signing", "Cancel the requisition"; no
    primary; the figure reads "Waiting for Tendai Mhlanga" (**Defined here**) in the strip.
  - `APPROVED`: ⋯ "Export as PDF", "Print for signing", "Pay out", "Cancel the requisition"; primary "Pay out" (payers).
  - `DISBURSED`: ⋯ "Export as PDF", "Print for signing", "Account for it"; primary "Account for it" (asker, payers).
  - `REJECTED`: primary "Change and ask again" (asker); `ACQUITTED`/`CANCELLED`: ⋯ "Export as PDF" only.
  The board's ⋯ lists "Pay out" and "Account for it" whatever the state; they show only when they apply.
- **Strip:** steps Asked · Approved · Paid out · Accounted for. Chips: "Stock purchase" / the expense type (plain); "Needed by
  Tuesday" (warn within 3 days and not paid out; "Needed today", "Needed by 6 Oct" plain otherwise; none once paid);
  "Receipt overdue" (bad); "Rejected"/"Cancelled". Figure "Asked for US$1,940.00" (`SUBMITTED`) / "Approved US$1,500.00" /
  "Paid out US$1,940.00" / "Spent US$1,902.40".
- **KPIs** (order): "Asked for" US$1,940.00 · "PO-0005" "Afdis Distillers"; "In the order" US$1,940.00 · "90" "units, with
  VAT"; "Cash at hand" US$2,410.00 · "US$470.00" "left after this"; "Spent on stock" US$9,120.00 · "this month" (Σ supplier
  payments and order-requisition payouts this calendar month; the board's "of US$12,000.00 budget" is not shown: no budget
  exists, open question 7); "Needed by" "6 Oct" · "3" warn "days".
  (expense, **Defined here**): "Asked for" · the expense type; "Pay to" CoolTech Repairs · "Quote" / "No quote"; "Cash at hand"
  as above; "Spent on <type>" this month; "Needed by".
- **Chart:** "Money asked for, by month", unit "stock purchases" (or the expense type in lower case); bars = Σ approved amounts of
  this purpose (order) or this expense type per month, last 8 months, last bar darker; range "3 months · 12 months · All time".
- **Tabs:**

| Tab | Source | Columns | Footer link |
|---|---|---|---|
| What it pays for (order) | `retail-order-lines` (`orderId`) | Product (1fr) · Quantity (`num` 110px) · Cost (`money` 120px) · Value (`money` 140px); Σ "Σ 6 lines", 90, —, US$1,686.96 | "Open order PO-0005" |
| What it pays for (expense) | none: a block with What for, Pay to and the quote (photo) (**Defined here**) | | |
| Approvals | `retail-requisition-approvals` | When (`when`) · What (`text`: "Waiting for Tendai Mhlanga, owner, over US$500.00" pending; "Approved US$1,500.00 — Pay Afdis …" ok; "Rejected: Pay another way — …" bad; "Asked: …" info; "Answered: …" info) · By (`text`) | none |
| Receipts | `retail-requisition-receipts` | thumbnails as the delivery's Photos tab, with the spent figure under the first | none |
| Activity | FND | | |

- **Rail:** Request (hint while editable): Asked by (read), Asked (mono "3 October 2026, 11:20", read), For ("Order PO-0005"
  link / the expense type, read), Purpose ("Stock purchase" / the expense type). Money: Amount (money, editable while
  `SUBMITTED` by the asker or a manager), Currency ("US dollars, cash" / "ZiG, cash" / "US dollars, bank transfer" after
  paying), Pay from (`auto` money account, editable until paid out), Pay to (supplier, "Afdis Distillers, on delivery";
  expense: `auto` payee editable while `SUBMITTED`). Approval: Approver ("Tendai Mhlanga, owner" / "Any manager"), Needs
  approval ("Over US$500.00" / "Under US$500.00"), Receipt due ("3 days after paying" / "9 October" once paid / "Came 7 October").

### 5.10 Bills — `/retail/buying/bills` · board `BillsList.png` · source `retail-bills` (BUY-07)

- **Header:** title "Bills"; primary "+ Record a bill" → `?sheet=bill-new` (`retail.bills:create`; the manager sees no primary).
- **Tabs:** To pay (4) · Overdue (1) · Paid (31) · All (35); default To pay.
- **Toolbar:** search "Bill number or supplier"; "Supplier Any"; "Due Any time" (Overdue, This week, Next 30 days); "Filters"
  (Billed: period); count; sort "Due soonest" (also "Billed, newest", "Most owed"); Group (None, Supplier, State); Columns;
  Export.
- **Columns** (min width 1120px):

| Column | Key | Cell | Width | Align | P |
|---|---|---|---|---|---|
| Bill | `billNumber` | `ref` → `?sheet=bill-edit&id={id}` | 120px | start | — |
| Supplier | `supplier` | `text` | minmax(170px,1.3fr) | start | — |
| Delivery | `delivery` | `ref` → the delivery; "No delivery" muted | 110px | start | 2 |
| Billed | `billDate` | `date`, short form "13 Aug 2026" (FND date cell with `short`, open question 9) | 130px | start | 3 |
| Due | `dueDate` | `date` short | 130px | start | — |
| State | `state` | `state` (§3.2) | 150px | start | — |
| Amount | `amount` | `money` | 120px | end | — |
| Owed | `owed` | `money`, `zero` at 0 | 120px | end | — |

- **Totals:** "Σ 5", Amount Σ, Owed Σ.
- **Row ⋯** (**Defined here**): Open · Record a payment · Move to the bin (bad).
- **Bulk:** "Record a payment" (`payment-new` for the ticked bills' suppliers, stepping; the ticked bills are paid first) ·
  "Export for the bookkeeper" (`.xlsx`) · Export.
- **Empty** (**Defined here**): icon `Receipt`, "No bills yet", "Record a supplier’s bill against its delivery, and what you owe
  shows here.", primary "Record a bill".
- **Phone card:** title "INV-88120 · Delta Beverages"; badge the state; figure Owed; meta "Due 12 Sep · US$216.00".

### Sheets

Every sheet below is a FND-SHEET kind: chrome, validation display, the unsaved-changes ask, toast and focus are FND's. Copy is
`Sheet.dc.html` `K` verbatim (the values shown on the boards are examples; the fields start empty or with the defaults given).
"Required" follows FND (a field without `opt`) except where marked **quiet**: optional without the word "optional", because the
board draws no tag but its note says the field can be left (FND-SHEET gains `FieldSpec.quiet?: true`, a two-line change owned by
BUY-01; open question 2).

### 5.11 New supplier — `?sheet=supplier-new` · board `SupplierNew.png` (BUY-01)

Title "New supplier"; sub "Buying › Suppliers"; width 520.

| Section | Field (id, type) | Options / default | Rules | Hint |
|---|---|---|---|---|
| — | Name (`name`, text) | — | required, 1–120, unique among suppliers bought from | — |
| — | Phone (`phone`, text mono, half) | — | **quiet**; phone format | — |
| — | Email (`email`, text, half, opt) | — | email format | — |
| — | Send orders on WhatsApp (`wa`, toggle) | on | — | "Orders go to <phone> as a message with a PDF." (live; with no phone: "Orders go to their WhatsApp number as a message with a PDF." **Defined here**) |
| Terms | Pays (`pays`, seg) | On delivery · 7 days · 14 days · 30 days; default On delivery | — | — |
| Terms | Delivers (`days`, text, half) | — | **quiet**, ≤ 80 | — |
| Terms | Lead time (`lead`, text, half) | — | **quiet**, whole days 0–60 | — |
| Terms | Minimum order (`min`, money, half, opt) | — | ≥ 0 | — |
| Details (fold "More details" · "VAT, BP number, bank, address") | VAT number (`vat`, text mono, half, placeholder "10000000") · BP number (`bp`, text mono, half, "200000000") · Bank account (`bank`, text, "Bank, branch, account") · Address (`addr`, area 2 rows, "Street, town") | — | all **quiet** | — |

Footer note "Only the name is needed. Terms fill in their orders."; secondary "Cancel"; primary "Add supplier". Done "Afdis
Distillers added. It is in every supplier field now." (toast with "Open"). Request `POST /api/v2/retail/buying/suppliers`;
invalidates `retail-suppliers` and the `supplier`/`payee` lookups.

### 5.12 Add a contact — `?sheet=contact-new&supplierId=<id>` (edit: `&id=<contactId>`) · board `ContactNew.png` (BUY-01)

Title "Add a contact" (edit: "Change <name>" **Defined here**); sub the supplier "Delta Beverages".

| Field | Type | Options / default | Rules | Hint |
|---|---|---|---|---|
| Name (`name`) | text | — | required, 1–120 | — |
| Role (`role`) | auto, half, noun `contact role` | Sales rep, Accounts, Orders desk, Driver; inline add "New role" with Name | **quiet** | — |
| Phone or WhatsApp (`phone`) | text mono, half | — | phone format; phone or email required | — |
| Email (`email`) | text, opt | — | email format | — |
| Sends them (`gets`) | seg | Orders · Statements · Nothing; default by role: Sales rep / Orders desk → Orders, Accounts → Statements, Driver → Nothing, else Orders | — | — |

Footer note "Orders go to the contact who gets orders; statements to the one who gets statements."; "Cancel"; primary "Add
contact" (edit: "Save" with danger "Remove" → ask `removecontact`). Done "Rumbi Chari added to Delta Beverages." (edit: "Rumbi
Chari saved." **Defined here**).

### 5.13 Message suppliers — `?sheet=supplier-message&ids=<…>` (**Defined here**; the `MessageNew` layout)

Title "Message suppliers" (one: "Message Delta Beverages"); sub "<n> ticked · <m> on WhatsApp" (one: the WhatsApp number). Field
Message (area 4 rows, required, ≤ 1,000, hint "Each gets it on WhatsApp, to their rep or their own number."). Note "Suppliers
without a WhatsApp number are skipped." Primary "Send to <m>". Done "Sent to 3 suppliers." / "Sent to Delta Beverages."; skipped
ones listed in the toast's second line ("Pamela has no WhatsApp number.").

### 5.14 Import suppliers — `?sheet=supplier-import` (**Defined here**; the empty guide's "Import a spreadsheet")

Title "Import suppliers"; sub "Buying › Suppliers". A photo-style drop zone for the file ("Drop the spreadsheet here" / "Or
choose a file · .xlsx or .csv"), a link "Download the template". Note "Name is the only column you need." Primary "Import".
Done "6 suppliers added." with the skipped rows in the footer ("Row 4: there is already a supplier called Pamela.").

### 5.15 New order — `?sheet=order-new` (`&supplierId=`, `&productIds=`) · board `OrderNew.png` (BUY-02)

Title "New order"; sub "Buying › Orders" (stepping: "Buying › Orders · 1 of 3"); **wide** (760).

| Section | Field | Type / options / default | Rules | Hint |
|---|---|---|---|---|
| — | Supplier (`sup`) | auto `supplier` (sub "Beverages, 30 days"); quick add Name, Phone or WhatsApp | required; bought from | — |
| — | Expected (`exp`) | text (date), half; default today + lead time | ≥ today | "From their lead time: 2 days." (no lead time: none) |
| — | Deliver to (`site`) | auto `site` (sub "Default"), half; quick add Name, Address (SET-02's create) | required | — (hidden with one site, **Defined here**) |
| Lines | Lines (`lines`) | lines; ql "Quantity", cl "Cost"; rows from suggestions with sub (warn for Low) | ≥ 1 to send | "Suggested from what is low and what you usually buy from Delta. Change any quantity." (no suggestions: "Nothing is low. Add what you want from Delta." **Defined here**) |
| Paying and sending | Paying (`pay`) | seg On account · Cash on delivery; default from terms | — | — |
| Paying and sending | Ask for the cash now (`ask`) | toggle off | — | "Creates a requisition for the order total, for the owner to approve before the truck comes." |
| Paying and sending | Note to the supplier (`msg`) | area 2 rows, opt, placeholder "Deliveries at the back door before 10:00" | ≤ 500 | — |

Footer note "Delta pays 30 days. Their minimum is US$500.00." (built from terms; under the minimum, warn: "Delta's minimum is
US$500.00. This order is US$412.80."; no terms set: "Delta pays on delivery." **Defined here**); secondary "Save as draft";
primary "Send on WhatsApp" / "Send by email" / "Save and print". Done "PO-0031 sent to Delta Beverages on WhatsApp." (draft:
"PO-0031 saved as a draft."). Invalidates `retail-orders`, the order, supplier and requisition keys, nav badges.

### 5.16 Edit an order — `?sheet=order-edit&id=<id>` · board `OrderEdit.png` (BUY-02, BUY-03)

Title "Edit PO-0003"; sub "Delta Beverages · part delivered" (the state in lower case: "sent", "draft", "48 days late");
**wide**.

| Section | Field | Type | Rules | Hint |
|---|---|---|---|---|
| — | Expected (`exp`) | text (date), half; prefilled `expectedDate` | ≥ today | — |
| — | Deliver to (`site`) | auto `site`, half | locked (read) once anything came | — |
| Lines | Lines (`lines`) | lines, ql "Ordered"; sub "120 delivered" (drafts and lines with none: the product's category); add row | quantity ≥ delivered; a delivered line cannot be removed (× disabled with title "120 have come") | "A line cannot go below what was delivered. To drop what is left, set it to what came." |

Footer (sent orders): danger "Cancel what is left" (→ ask `cancelrest`), note "Delta gets the changed order on WhatsApp." ("…
by email." / nothing when no channel), secondary "Save without telling them", primary "Save and tell Delta". Drafts: no danger,
note none, primary "Save". Done "PO-0003 changed. Delta has the new order." / "PO-0003 changed." Server 409s show in the footer
in `--bad`.

### 5.17 Chase PO-0003 — `?sheet=order-chase&id=<id>` · board `OrderChase.png` (BUY-03)

Title "Chase PO-0003"; sub "Delta Beverages · 48 days late" (not late: "Delta Beverages · expected 9 October").

| Field | Type / default | Rules | Hint |
|---|---|---|---|
| To (`to`) | auto `contact` (`context.supplierId`); default the first contact who gets orders, else the rep; labels "Tinashe Moyo, rep", "Delta orders desk"; sub the number or email; quick add Name, Phone or WhatsApp | required | — |
| Message (`msg`) | area 5 rows; prefilled (§W-34), first name of the chosen contact | 1–1,000 | — |
| Promised for (`new`) | text (date), half; default today + lead time (min tomorrow) | ≥ today | "Moves the expected date." |
| If it does not come (`then`) | seg, half: Remind me · Cancel the rest; default Remind me | — | — |

Footer note "The message and their reply are kept on the order."; "Cancel"; primary "Send on WhatsApp" ("Send by email" when the
chosen contact has only an email). Done "Reminder sent. Expected date moved to 7 October."

### 5.18 Ask for money — `?sheet=req-new&for=order|expense` (`&orderId=`, `&from=<rejected id>`) · boards `ReqOrder.png`, `ReqExpense.png` (BUY-04)

Title "Ask for money"; sub "Buying › Requisitions"; steps "Asked · Approved · Paid out · Accounted for" at Asked.

| Field | Shown | Type / options / default | Rules | Hint |
|---|---|---|---|---|
| For (`purpose`) | always | seg An order · An expense; default from `for` | — | — |
| Order (`po`) | An order | auto `order` (label "PO-0005 · Afdis Distillers", sub "US$1,940.00"); quick add Supplier, Expected | required | — |
| Expense (`cat`) | An expense | auto `expense type`; quick add Name, Account ("Expenses") | required | — |
| What for (`what`) | An expense | text | required, 1–200 | — |
| Amount (`amt`) | always | money, half; order: default the order total with VAT | > 0; order: ≤ total | order: "The order total. Lower it to pay part now." |
| Currency (`cur`) | always | seg, half: US$ · ZiG; default US$ | — | — |
| Pay from (`from`) | always | auto `money account` (sub balance / "•••• 4471"), half; default order: Office safe (the first cash account); expense: the first cash account | required | — |
| Needed by (`by`) | An order | text (date), half; default the order's expected date ("Tuesday 6 October") | ≥ today | — |
| Pay to (`to`) | An expense | auto `payee` (sub "Supplier"), half; quick add Name, Phone or WhatsApp | **quiet** | — |
| Why (`why`) | An order | area 2 rows | **quiet**, ≤ 1,000 | — |
| Quote (`q`) | An expense | photo, opt ("Add the quote") | pdf/picture ≤ 10 MB | — |

Footer note (from the approvals settings and the amount, live): over the limit "Tendai Mhlanga approves anything over
US$500.00."; at or under "Under US$500.00, a manager can approve it." (the board's US$100.00 is the old limit; the figure is the
setting's). Secondary "Cancel"; primary "Submit for approval". Done "REQ-0015 sent to Tendai Mhlanga for approval." (under the
limit: "REQ-0016 sent to Tafara Nyathi for approval." when one manager can decide it, else "… sent to the managers for
approval."). `&from=` prefills from a rejected requisition ("Change and ask again").

### 5.19 Approve a different amount — `?sheet=req-approve&id=<id>` · board `ReqApprove.png` (BUY-04)

Title "Approve a different amount"; sub "REQ-0014 · asked US$1,940.00"; steps at Approved.

| Field | Type | Rules | Hint |
|---|---|---|---|
| Approve (`amt`) | money, half; default the asked amount | > 0 and < asked | — |
| Asked for (`asked`) | read, mono right, half | — | — |
| Tell Tafara why (`why`) | area 3 rows (label uses the asker's first name) | required | — |

Footer note "Tafara Nyathi is told on WhatsApp and in the app." ("… in the app." when the settings say the app only); "Cancel";
primary "Approve US$1,500.00" (live). Done "US$1,500.00 approved. Tafara can pay it out."

### 5.20 Reject — `?sheet=req-reject&id=<id>` (or `&ids=`) · board `ReqReject.png` (BUY-04)

Title "Reject REQ-0014" (bulk: "Reject 2 requisitions"); sub "Cash to pay Afdis for order PO-0005 · US$1,940.00" (bulk: "REQ-0014,
REQ-0015 · US$2,002.00").

| Field | Type / options | Rules |
|---|---|---|
| Why (`why`) | seg: Not needed now · Too much · Pay another way · Other; no default | required |
| Tell Tafara (`msg`) (bulk: "Tell them") | area 3 rows | required when Why is Other, else **quiet** |

Footer note "Tafara can change it and ask again."; "Cancel"; primary "Reject" (bulk "Reject 2"). Done "REQ-0014 rejected. Tafara
has been told why." (bulk "2 requisitions rejected. Each asker has been told why." **Defined here**).

### 5.21 Ask a question — `?sheet=req-question&id=<id>` (**Defined here**)

Title "Ask Tafara a question"; sub "REQ-0014 · Cash to pay Afdis for order PO-0005". Field Question (area 3 rows, required, ≤
500). Note "Tafara Nyathi gets it on WhatsApp and in the app. It stays on the requisition." Primary "Send". Done "Question sent
to Tafara." The asker answers from the notification by opening the record, whose Approvals tab then offers "Answer" (the same
sheet titled "Answer Tendai").

### 5.22 Pay out — `?sheet=req-payout&id=<id>` (bulk stepping `&ids=`) · board `ReqPayout.png` (BUY-05)

Title "Pay out REQ-0014"; sub the purpose ("Cash to pay Afdis for order PO-0005"; stepping adds " · 1 of 2"); steps at Paid out.

| Field | Type / default | Rules | Hint |
|---|---|---|---|
| Approved (`amt`) | read, mono right, half | — | — |
| Paying (`paid`) | money, half; default approved | > 0, ≤ approved | — |
| From (`from`) | auto `money account`; default the requisition's Pay from; quick add Name | required; currency; cash not below zero | "US$470.00 left in it after this." (live; negative: bad "Office safe has only US$410.00." **Defined here**) |
| To (`to`) | auto `person`; default the asker; label "<name>, to pay <supplier short name>" for an order | required | — |
| How (`how`) | seg Cash · Bank transfer · EcoCash; default by the From account's kind | — | — |
| Reference (`ref`) | text mono, opt, placeholder "Optional for cash" | required unless Cash | — |

Footer note "Receipts are due three days after paying out."; "Cancel" (stepping: "Skip"); primary "Record payout". Done
"US$1,940.00 paid out. Receipts due by 9 October."

### 5.23 Account for it — `?sheet=req-acquit&id=<id>` · board `ReqAcquit.png` (BUY-05)

Title "Account for REQ-0014"; sub "US$1,940.00 paid out to Afdis Distillers" (expense: "US$85.00 paid out to Chipo Dube");
steps at Accounted for.

| Field | Type / default | Rules | Hint |
|---|---|---|---|
| Paid out (`paid`) | read, mono right, half | — | — |
| Spent (`spent`) | money, half; default paid out | 0 ≤ spent ≤ paid | — |
| Change back (`back`) | read, mono right, half, tone ok; live paid − spent | — | — |
| Change goes to (`into`) | auto `money account`, half; default the From account | required when change > 0 (hidden at 0, **Defined here**) | — |
| Receipts (`rec`) | photo (several files) "Add the <supplier short name> invoice and receipt" / expense "Add the receipt" | at least one | — |
| Note (`note`) | area 2 rows, opt, placeholder "Anything the owner should know" | ≤ 1,000 | — |

Footer note "The order, the receipt and the change all link back to this requisition." (expense: "The receipt and the change
link back to this requisition." **Defined here**); "Cancel"; primary "Account for it". Done "REQ-0014 accounted for. US$37.60
back in the office safe." (no change: "REQ-0014 accounted for." **Defined here**).

### 5.24 Take in stock with no order — `?sheet=intake` (`&productIds=`) · board `IntakeNew.png` (BUY-08)

Title "Take in stock with no order"; sub "Buying › Deliveries"; **wide**.

| Section | Field | Type / default | Rules | Hint |
|---|---|---|---|---|
| — | From (`sup`) | auto `supplier`; quick add | required | "No open orders with them. When a supplier has one, you are offered it here to receive against." / "Mutare Wholesalers has PO-0002 open. Receive against it instead." (link) |
| — | Delivery note (`note`) | text mono, half, opt | ≤ 40 | — |
| — | Into (`site`) | auto `site`, half; default site | required | — |
| What came | What came (`lines`) | lines, ql "Came"; add placeholder "Add a product: search, scan, or add a new one. It sells as soon as you post."; new products' sub "New product, added here" (warn) | ≥ 1 line, quantity > 0, cost ≥ 0 | — |
| Paying | Paid (`paid`) | seg Cash now · On account · Not yet; default by the supplier's terms (on delivery → Cash now) | — | — |
| Paying | Paid from (`from`) | auto `money account`, half; shown for Cash now | required then | — |
| Paying | Requisition (`rq`) | read, half; shown for Cash now: "REQ-0017, raised for you" (the next number) | — | "So the till float balances at close." |

Footer note "Use this for walk-in suppliers. Anything regular should be an order."; "Cancel"; primary "Post to stock" (stock
clerk "Send for checking"). Done "GRN-0006 posted. 112 units in stock." (counting: "GRN-0006 sent for checking." **Defined
here**).

### 5.25 Record a difference — `?sheet=delivery-difference&id=<delivery id>` · board `DeliveryDiff.png` (BUY-08)

Title "Record a difference"; sub "GRN-0002 · Delta Beverages".

| Field | Type / options / default | Rules |
|---|---|---|
| Line (`line`) | auto `line` (sub "60 counted") | required |
| On the note (`note`) | read, mono right, half | — |
| Counted (`count`) | text mono right, half; default the line's in-stock quantity | whole number ≥ 0, ≠ current |
| Why (`why`) | seg Short · Broken · Wrong item · Extra; default Short (Extra when counted > current) | — |
| Settle by (`do`) | seg Ask for a credit · Bring it next time · Write it off; default Ask for a credit; hidden for Extra; "Bring it next time" disabled with no order | — |
| Photo (`ph`) | photo, opt ("Add a photo") | — |

Footer note "Stock moves by the difference, and it shows on the supplier record."; "Cancel"; primary "Save difference". Done
"Difference saved. Credit for US$4.92 asked of Delta." (§W-33 variants).

### 5.26 Reverse this delivery — `?sheet=delivery-reverse&id=<id>` (**Defined here**)

Title "Reverse GRN-0002"; sub "Delta Beverages · 300 units, US$214.80". Field Why (area 3 rows, required). Note "Stock comes off
again, the order expects these units again, and the books are put back. A bill must be binned first." Danger-filled primary
"Reverse the delivery". Done "GRN-0002 reversed."

### 5.27 Record a bill — `?sheet=bill-new` (`&supplierId=`, `&deliveryId=`) · board `BillNew.png` (BUY-07)

Title "Record a bill"; sub the supplier ("Delta Beverages") or "Buying › Bills".

| Field | Type / default | Rules | Hint |
|---|---|---|---|
| Supplier (`sup`) | auto `supplier`; prefilled from the opener | required | — |
| For delivery (`grn`) | auto `delivery` (`context.supplierId`; label "GRN-0002 · 13 Aug", sub "US$214.80" with VAT); prefilled from `deliveryId` or the oldest unbilled delivery | **quiet** (a bill can have none: Bills shows "No delivery") | — |
| Bill number (`no`) | text mono, half | required, 1–40, unique for the supplier | — |
| Bill date (`date`) | text (date), half; default today | ≤ today | — |
| Amount (`amt`) | money, half; default the delivery's value with VAT | > 0 | live from `GET …/bills/compare`: warn "US$1.20 more than the delivery. Accept it, or ask for a credit." / "US$1.20 less than the delivery." / none |
| Due (`due`) | text (date), half; default from terms | ≥ bill date | "30 days from delivery." / "On delivery." |
| The bill (`pdf`) | photo, opt ("Add the bill PDF or photo") | pdf/picture | — |

Footer note "Bills show on the supplier statement and in what you owe."; "Cancel"; primary "Save bill". Done "Bill INV-88120
saved, due 12 September."

### 5.28 A bill — `?sheet=bill-edit&id=<id>` · board `BillEdit.png` (BUY-07)

Title the bill number "INV-88120"; sub "Delta Beverages · 21 days overdue" (the state in lower case: "due in 3 days", "paid").
Fields as 5.27 with the current values; Due hint the state ("21 days overdue." warn); The bill shows the file "INV-88120.pdf,
added 13 August" with "Change" / "Remove". Footer: danger "Move to the bin" (FND ask `bin`: "Move INV-88120 to the bin?" …;
hidden when anything is paid), note "Changed by Tendai Mhlanga, 14 August.", secondary "Record a payment" (→ `payment-new` with
this bill first), primary "Save". Done "INV-88120 saved." A manager (read only) sees the fields as read rows and no footer
buttons except "Close".

### 5.29 Record a payment — `?sheet=payment-new&supplierId=<id>` (`&billId=`, stepping `&supplierIds=`) · board `PaymentNew.png` (BUY-07)

Title "Record a payment"; sub "Delta Beverages · owed US$624.00".

| Field | Type / default | Rules | Hint |
|---|---|---|---|
| Amount (`amt`) | money, half; default owed | > 0 | — |
| Paid on (`date`) | text (date), half; default today | ≤ today | — |
| Paid by (`how`) | seg Cash · Bank transfer · EcoCash; default Bank transfer | — | — |
| From (`from`) | auto `money account`, half; default the first account of the chosen kind | required, currency, cash not below zero | — |
| Reference (`ref`) | text mono, half | required unless Cash (**quiet** for Cash) | — |
| Pays (`bills`) | read; live from `GET …/payments/preview` | — | "Anything over is held as credit on the account." |

Footer note "Delta sees it on their statement next month."; "Cancel" (stepping: "Skip"); primary "Record payment". Done
"US$624.00 paid to Delta Beverages. Nothing owed."

### 5.30 Return to supplier — `?sheet=return-new&supplierId=<id>` (`&productIds=`) · board `ReturnNew.png` (BUY-09)

Title "Return to supplier"; sub the supplier; **wide**.

| Section | Field | Type / options | Rules |
|---|---|---|---|
| — | Supplier (`sup`) | auto `supplier` | required |
| — | Why (`why`) | seg Damaged · Expired · Wrong item · Not ordered; default Damaged | — |
| What goes back | Going back (`lines`) | lines, ql "Going back", cl "Cost"; sub per product (§W-36) | ≥ 1, ≤ on hand (damaged units at the door count as available) |
| Settling it | Settle by (`cred`) | seg Credit note · Replace the goods · Refund; default Credit note | — |
| Settling it | Collected (`coll`) | text, half; default "With the next delivery, <next delivery day>" from Delivers (**Defined here**) | **quiet** |
| Settling it | Photos (`ph`) | photo, opt ("Add photos of the goods") | — |

Footer note "Stock comes off now. The credit shows on their statement when it arrives."; "Cancel"; primary "Book the return".
Done "Return RTN-0004 booked. 18 units off stock."

### 5.31 Settle a return — `?sheet=return-settle&id=<return id>&kind=credit|replaced|refund` (**Defined here**)

Credit: title "Credit note for RTN-0002", field Credit note number (text mono, required); primary "Save". Replaced: title
"Replacement for RTN-0002", field Delivery (auto `delivery`, this supplier's posted deliveries); primary "Save". Refund: title
"Refund for RTN-0002", Amount (money, default the return value), Into (money account); primary "Record refund". Done "RTN-0002
settled."

### 5.32 Confirm dialogs (`lib/retail/asks.ts`)

FND's `closeshort`, `removeorder`, `cancelreq` and `bin` are used as written there. Added (all **Defined here**):

| Key | Title | Body | Keep | Go | Fill |
|---|---|---|---|---|---|
| `cancelrest` | "Cancel what is left of PO-0003?" | "480 units across 4 lines will not come. Delta Beverages is told on WhatsApp. What came stays in stock and is billed as usual. This cannot be undone; order again if you need them." | "Keep the order" | "Cancel what is left" | bad |
| `stopbuying` | "Stop buying from Pamela?" | "They leave the supplier list and every supplier field. Bills, payments and past orders stay. You can start buying from them again from their record." | "Keep buying" | "Stop buying" | bad |
| `removecontact` | "Remove Rumbi Chari?" | "Delta Beverages keeps everything sent to them. If they were the rep, the supplier has no rep until you choose one." | "Keep them" | "Remove" | bad |
| `sendorders` | "Send 2 orders?" | "PO-0004 to Pamela on WhatsApp and PO-0007 to Delta Beverages on WhatsApp." | "Not yet" | "Send 2" | action |
| `markreceived` | "Mark 3 orders received?" | "Everything still to come on them goes into stock as ordered, 480 units worth US$384.00, and each order closes. Use Receive a delivery to count what really came." | "Keep them open" | "Mark received" | action |
| `cancelorders` | "Cancel 3 orders?" | "Drafts go to the bin for 30 days. Sent orders have what is left cancelled and their suppliers are told. Orders that are done are left alone." | "Keep them" | "Cancel 3" | bad |
| `postdeliveries` | "Post 2 deliveries to stock?" | "60 units go into stock and their orders are filled. You are recorded as the one who checked them." | "Not yet" | "Post to stock" | action |
| `approvemany` | "Approve 2 requisitions?" | "US$2,002.00 in all, each at the amount asked. Tafara Nyathi and Farai Moyo are told." (+ "REQ-0014 is over US$500.00 and is left for Tendai Mhlanga." for a manager) | "Not yet" | "Approve 2" | action |
| `leavereceive` | "Leave without posting?" | "What you counted is not saved." | "Keep counting" | "Leave" | bad |

---
## 6. What to remove (no backward compatibility)

No redirects from old paths, no compatibility layers. FND-03 has already moved `app/retail/purchasing/**` to
`app/retail/buying/**` (and removed `app/retail/purchasing/page.tsx`); each unit below replaces what it rebuilds.

| Remove | Replaced by | Unit |
|---|---|---|
| `app/retail/buying/orders/page.tsx` (the moved `RecordListShell` + `ColumnList` register) and `app/retail/buying/orders/_components/order-dialog.tsx` | `<ListFrame source="retail-orders" />`; sheets `order-new`, `order-edit` | BUY-02 |
| `app/retail/buying/orders/[id]/page.tsx` (field list, `dsConfirm` close/remove) | `<RecordFrame kind="order" />` | BUY-02 |
| `app/api/v2/retail/purchasing/orders/route.ts`, `…/orders/[id]/route.ts`, `…/orders/[id]/close/route.ts` | `/api/v2/retail/buying/orders/**`; `retail-orders` source | BUY-02 (close/reopen move in BUY-03) |
| The hard delete of an order (`DELETE …/orders/[id]`) | bin kind `order` (drafts only) | BUY-03 |
| `RetailPurchaseOrder.supplierName`, `.notes`; `RetailGoodsReceipt.supplierName` | `vendorId`, `noteToSupplier` (migration B) | BUY-02 |
| `RPO` / `RGR` prefixes and their per-site sequences in `lib/id-generator.ts` | `PO`, `GRN`, company-wide | BUY-02 |
| The seed's `PO-00001` / `GRN-00001` block in `scripts/seed-retail-demo.ts` (§ "Purchasing") | the §3.6 seed | BUY-02 |
| The receive dialog in `app/retail/buying/deliveries/page.tsx` and `POST /api/v2/retail/purchasing/receipts` | the Receive page and `POST /api/v2/retail/buying/deliveries` | BUY-06 |
| `app/retail/buying/deliveries/page.tsx` (the register) and `GET /api/v2/retail/purchasing/receipts`; the whole `app/api/v2/retail/purchasing/` folder | `<ListFrame source="retail-deliveries" />` | BUY-08 |
| `app/retail/buying/requisitions/page.tsx`, `…/[id]/page.tsx`, `…/_components/requisition-dialog.tsx`, `…/_components/requisition.ts` | ListFrame, RecordFrame, `req-*` sheets | BUY-04 |
| `app/api/v2/retail/requisitions/route.ts`, `…/[id]/route.ts` (the `PATCH { action }` switch) | `/api/v2/retail/buying/requisitions/**` (one route per act) | BUY-04 |
| `lib/retail/requisitions.ts` (`actOnRetailRequisition`, `requisitionPermissions`, `listRetailRequisitions`), `lib/retail/requisitions.test.ts` | `lib/retail/buying/requisitions.ts` + test | BUY-04 |
| `lib/retail/requisition-words.ts` (`RETAIL_REQUISITION_CATEGORIES`, "Shop supplies", "Casual labour" …) | `RetailExpenseType` | BUY-04 |
| Retail's call to `postRequisitionDisbursement` (expense always on 1010) | `RETAIL_REQUISITION_PAYOUT` / `CHANGE` (§3.5) | BUY-05 |
| The comment and rule "Retail stops at paid … no acquittal here" | acquittal (W-31, W-32) | BUY-05 |
| `PurchaseBill @@unique([companyId, billNumber])` | `@@unique([companyId, vendorId, billNumber])` | BUY-07 |
| Nav: the Buying section's three refs in `lib/workspaces.ts` / `lib/navigation.ts` (left by FND-03) | five items with badges (§1 Module navigation): Suppliers added by BUY-01, Bills by BUY-07, badges by the unit owning each | BUY-01, BUY-02, BUY-04, BUY-07 |
| `lib/retail/route-guard-coverage.test.ts` entries for the removed routes | the new routes | each unit |

Kept on purpose: `lib/retail/purchase-orders.ts` (`outstanding`, `orderStatusFor`, `planOrderLineEdits`,
`matchDeliveryToOrder`, extended); `auditGoodsReceived`; the accounting module's own vendor, bill and payment routes (they share
the tables); `lib/crm/requisitions.ts` (the state machine, used as is).

---

## 7. Build units

In build order. Every unit: `pnpm typecheck` passes (one at a time on this machine); `npx eslint <changed files>` has no new
errors; its migration (if any) applied with `npx prisma migrate deploy` on the dev and test databases with its witness test
passing; the named tests pass (`npx vitest run <files>`); the seed rows it owns are in `scripts/seed-retail-demo.ts` and the
tenant reseeded (`pnpm tsx scripts/seed-retail-demo.ts --slug hurudza-creative --days 160 --reset`); screenshots with
`scratchpad/smoke/lib.js` at 1440×960 as `owner@bottlestore.test` (and the roles named: manager `tafara.manager@`, cashier
`chipo.till@`, stock clerk `tendai.stock@`, bookkeeper `bookkeeper@` — all `@bottlestore.test`, `RetailDemo123!`) compared side
by side with the board PNG. "Matches" means the same layout, hierarchy, copy, columns, filters, actions and states; values come
from the seed.

| Unit | Title | Size | Depends on | Boards | Workflows | Routes |
|---|---|---|---|---|---|---|
| BUY-01 | Suppliers: list, record, new, contacts | L | FND-THEME, FND-SHELL, FND-LIST, FND-RECORD, FND-SHEET, PRD-03, SET-07 | SuppliersList, SupplierNew, SupplierRecord, ContactNew | W-29 | `/retail/buying/suppliers`, `/retail/buying/suppliers/[id]` |
| BUY-02 | Orders: list, record, raise and send | L | BUY-01, SET-02, SET-07, PRD-03 | OrdersList, OrderNew, OrderRecord, OrderEdit | W-30 | `/retail/buying/orders`, `/retail/buying/orders/[id]` |
| BUY-03 | Order follow-up: chase, close short, cancel the rest, remove a draft | M | BUY-02 | OrderChase, OrderCloseShort, OrderRemove, OrderEdit (danger) | W-34, W-70, W-71 | `/retail/buying/orders/[id]` |
| BUY-04 | Requisitions: ask, decide, cancel | L | BUY-02, SET-07, ADM (approvals; fallback defaults) | RequisitionsList, ReqOrder, ReqExpense, RequisitionRecord, ReqApprove, ReqReject, ReqCancel | W-31, W-32, W-72 | `/retail/buying/requisitions`, `/retail/buying/requisitions/[id]` |
| BUY-05 | Money out: money accounts, pay out, account for it | L | BUY-04, BUY-01, SET-09 | ReqPayout, ReqAcquit | W-31, W-32 | `/retail/buying/requisitions/[id]` |
| BUY-06 | Receive against the order; the delivery record | L | BUY-02, BUY-05, PRD-03 (`repriceCostFollowers`), STK (empties, optional) | Receive, DeliveryRecord | W-33 | `/retail/buying/orders/[id]/receive`, `/retail/buying/deliveries/[id]` |
| BUY-07 | Bills and supplier payments | L | BUY-06, BUY-05 | BillsList, BillNew, BillEdit, PaymentNew, SupplierRecord (Bills, Payments tabs) | W-35, W-70 (reopen rule) | `/retail/buying/bills`, `/retail/buying/suppliers/[id]` |
| BUY-08 | Deliveries list, differences, photos, reverse, take in stock | L | BUY-06, BUY-07 | DeliveriesList, DeliveryDiff, IntakeNew, DeliveryRecord (tabs) | W-33, W-25 | `/retail/buying/deliveries`, `/retail/buying/deliveries/[id]` |
| BUY-09 | Returns to suppliers | M | BUY-07, BUY-08 | ReturnNew, SupplierRecord (Returns tab) | W-36 | `/retail/buying/suppliers/[id]` |
| BUY-10 | Retire the old buying code; buying end to end | S | BUY-01 … BUY-09 | all buying boards | all | all buying routes |

### BUY-01 · Suppliers: list, record, new, contacts (W-29) — L

Builds: migration A + witness; `retail.suppliers` and the bookkeeper rows in `lib/retail/permissions.ts` (+ test);
`lib/retail/buying/suppliers.ts` (+ test: create, duplicate name, phone formats, rep sync, stop with open orders refused);
`lib/retail/buying/figures.ts` supplier figures (+ test: spend and its delta, on time, fill rate, owed with credits — owed reads 0
until BUY-07, which fills it); routes §4.2; lookups `supplier`, `payee`, `contact`, `contact role`; list source
`retail-suppliers`; record kind `supplier` (tabs Orders, Deliveries, Contacts, Activity now; Bills, Payments, Returns appear with
their units); sheets `supplier-new`, `contact-new`, `supplier-message`, `supplier-import`; ask `stopbuying`, `removecontact`;
`FieldSpec.quiet`; the Suppliers nav item; audit events `RETAIL_SUPPLIER.*`; seed: the seven suppliers, contacts, product
suppliers.

Acceptance:
- `/retail/buying/suppliers` side by side with `SuppliersList.png`: header "Suppliers" and "+ New supplier"; toolbar "Name,
  contact or phone", "Category Any", "Owed Any", "Filters", count, "Most spent", Group, Columns, Export; the nine columns with
  the board's cells (bold supplier links, mono phones, owed pills, faint "—" and "No deliveries yet", warn bar under 80%), the Σ
  row; pager "1–7 of 7". Rows: Delta Beverages, Afdis Distillers, Mutare Wholesalers, Schweppes Zimbabwe, Pamela, Ice Cold
  Supplies, CoolTech Repairs.
- New supplier (`SupplierNew.png`): 520px sheet over the dimmed list, "New supplier" / "Buying › Suppliers", fields as the board
  with "optional" only on Email and Minimum order, the folded "More details · VAT, BP number, bank, address". Typing "Natbrew",
  "+263 77 555 0101", Pays 30 days, "Add supplier" → toast "Natbrew added. It is in every supplier field now.", the row appears,
  `SUP-0008`, `RETAIL_SUPPLIER.CREATED` written. A second "Natbrew" → "There is already a supplier called Natbrew." under Name.
  From the order sheet's Supplier field "Add ‘Kwekwe Traders’ as a new supplier" → added and selected.
- `/retail/buying/suppliers/<Delta>` side by side with `SupplierRecord.png`: "‹ Suppliers / Delta Beverages SUP-0001",
  "Record a payment | Record a bill | Message on WhatsApp | ⋯", "New order"; chips "Pays 30 days", the top category, "1 order
  late"; figure "Owed US$624.00" (after BUY-07); five KPI tiles; "Bought per month" with 12 bars and the range control; tabs with
  counts and the Orders table; the rail with Contact, Terms, Details. Click Lead time, type 3, Enter → "Saved"; the order sheet
  for Delta now proposes today + 3; Activity shows "Changed Lead time from 2 days to 3 days".
- Add a contact (`ContactNew.png`): "Rumbi Chari", Accounts, "+263 77 551 0283", Statements → toast "Rumbi Chari added to Delta
  Beverages.", Contacts tab 3.
- "Stop buying from them" on Pamela with PO-0004 open → 409 sentence in the dialog; on CoolTech Repairs → leaves the list, absent
  from the order sheet's Supplier options, banner on its record; "Buy from them again" restores.
- Roles: stock clerk sees the list and record read-only (no pens, no primary); bookkeeper can edit Bank and VAT; cashier gets
  "Your role cannot view suppliers" from the API and no nav item.
- Empty tenant: the Suppliers guide matches `Guided.png`'s right card; "Import a spreadsheet" with the template adds rows.

### BUY-02 · Orders: list, record, raise and send (W-30) — L

Builds: migration B + witness; id prefixes; `lib/retail/purchase-orders.ts` extended (`orderStatusFor` with SENT/closed lines
+ tests); `lib/retail/buying/orders.ts` (raise, send, edit with tell, duplicate) and `suggest.ts` (+ tests: low lines, usual
lines, case rounding, lead time); `RetailMessage` extension and the WhatsApp webhook matching (§4.8, + test); the order PDF
renderer; routes §4.3 (not chase/close/cancel); list source `retail-orders` (+ `retail-order-lines`, `retail-order-messages`);
record kind `order`; sheets `order-new`, `order-edit` (without its danger); the "3 open" badge; lookup `order`; audit
`RETAIL_PURCHASE_ORDER.CREATED/SENT/CHANGED/DUPLICATED`, `RETAIL_MESSAGE.RECEIVED`; seed: orders, messages.

Acceptance:
- `/retail/buying/orders` side by side with `OrdersList.png`: tabs Open 3 · Drafts 2 · Received 18 · All 23 (board 1/19, §3.6),
  toolbar "Order number or supplier", "Supplier Any", "Site Any", Filters, count, "Expected, soonest"; rows with mono refs, the
  state badges (Draft, "48 days late", Part delivered, Sent, Received), bars "300 of 780", owed pills; Σ row with "413 of
  1,012"-style delivered total and value totals over the tab.
- New order (`OrderNew.png`): Supplier Delta Beverages → Expected = today + 2 with "From their lead time: 2 days.", Deliver to
  Harare Main Branch, lines Castle Lager 340ml "Low: 26 left, sells 3 a day" (warn) and usual lines; quantities editable; note
  "Delta pays 30 days. Their minimum is US$500.00."; "Send on WhatsApp" → toast "PO-0024 sent to Delta Beverages on WhatsApp.",
  the order `SENT`, a `RetailMessage` OUT to Tinashe Moyo with the PDF link (QUEUED, or FAILED "WhatsApp is not set up" without
  credentials), "4 open" badge. "Save as draft" → Drafts tab. "Ask for the cash now" on → REQ created `SUBMITTED` for the order
  total with VAT.
- `/retail/buying/orders/<PO-0003>` side by side with `OrderRecord.png`: "‹ Orders / Delta Beverages PO-0003", "Send a reminder
  | Edit lines | Print | ⋯", "Receive a delivery"; steps Draft ✓ Sent ✓ Part delivered (current) Received Billed, chip "48 days
  late", figure "Still to come …" in warn; five KPIs; "Delivered, by line" with four bars to 100% (no range control); tabs Lines
  4 · Deliveries 1 · Messages 3 · Activity; the lines table with warn "still to come" pills and Σ; rail Order / Money /
  Deliveries ("GRN-0002 | 13 August, 300 units", "Next | Promised for 7 October").
- `/retail/buying/orders/<PO-0007>` matches `OrderRemove.png` without the dialog: steps with Draft current, chip "Not sent",
  "Edit lines | Print | ⋯", primary "Send to Delta"; pressing it sends.
- Edit lines (`OrderEdit.png`): "Edit PO-0003" / "Delta Beverages · part delivered", lines with "120 delivered"; Castle to 100 →
  "120 of Castle Lager 340ml have already come; the order cannot ask for fewer." in the footer; Castle to 300, "Save and tell
  Delta" → toast "PO-0003 changed. Delta has the new order.", a message queued, Activity "Changed the lines: Castle Lager 340ml
  240 → 300, told Delta".
- A WhatsApp webhook POST from +263 77 214 9080 lands on PO-0003's Messages tab as a reply and notifies Tafara Nyathi.
- Stock clerk: list without primary; the sheet URL answers "Your role cannot create purchase orders".

### BUY-03 · Order follow-up: chase, close short, cancel the rest, remove a draft (W-34, W-70, W-71) — M

Builds: routes chase, close/reopen (moved), cancel-rest, bulk send and cancel; `lib/retail/buying/follow-ups.ts` +
`runBuyingFollowUps` in the retail worker (+ test with a fixed clock); bin kind `order` (+ restore, purge); sheet `order-chase`;
`order-edit`'s danger; asks `cancelrest`, `sendorders`, `cancelorders` (+ FND's `closeshort`, `removeorder` wired); the Orders
Filters › Late; audit `CHASED`, `REST_CANCELLED`; notification type `RETAIL_ORDER_FOLLOW_UP`.

Acceptance:
- Chase (`OrderChase.png`): "Chase PO-0003" / "Delta Beverages · 48 days late"; To "Tinashe Moyo, rep"; the prefilled message
  equals the board's text built from the data; Promised for today + 4 with "Moves the expected date."; "Remind me"; "Send on
  WhatsApp" → toast "Reminder sent. Expected date moved to 7 October." (the date built), the message on the Messages tab, rail
  "Next | Promised for …", the badge still "48 days late" (counted from the first expected date). With a fixed clock past the
  promise, `runBuyingFollowUps` notifies Tafara "PO-0003 has not come. Delta Beverages promised it for …"; with "Cancel the
  rest", it cancels what is left as "Automatic" and queues the supplier message.
- Close with what came (`OrderCloseShort.png`): the dialog's title and body built from PO-0003's figures, "Keep waiting" /
  "Close the order" → state "Closed short", Received tab, figure US$0.00, Activity "Closed with what came, 480 units not
  delivered"; primary "Reopen the order" reopens it (the bill rule arrives with BUY-07).
- Remove a draft (`OrderRemove.png`): PO-0007 ⋯ "Remove the order" → the dialog as the board → Orders without PO-0007, toast
  with the restore date, Management › Bin lists it; restore brings it back as a draft. On PO-0003 the item is absent and the
  API answers "PO-0003 has been sent. Cancel what is left instead."
- Cancel what is left on a sent order with nothing delivered → `CANCELLED`, supplier message queued, a not-yet-paid requisition
  for it cancelled.
- Bulk on Orders: tick PO-0004 and PO-0007 → "Send to suppliers" → `sendorders` → both `SENT`; tick a draft and PO-0005 →
  "Cancel" → the draft binned, PO-0005 cancelled.

### BUY-04 · Requisitions: ask, decide, cancel (W-31, W-32, W-72) — L

Builds: migration C + witness; `lib/retail/buying/requisitions.ts` (ask, approve with the limit, approve less, reject, question,
cancel, edit; + tests for every refusal and the limit); `getApprovalLimits` fallback (ADM); routes §4.5 except pay and acquit;
lookups `expense type`, `order` (read); list source `retail-requisitions` (+ approvals, receipts); record kind `requisition`;
sheets `req-new`, `req-approve`, `req-reject`, `req-question`; ask `cancelreq` (FND) and `approvemany`; requisition PDF and
"Print for signing"; WhatsApp to the asker through `RetailMessage`; the "2 to approve" badge; notification types; audit
`RETAIL_REQUISITION.ASKED/APPROVED/REJECTED/QUESTION/CANCELLED`; seed: expense types, requisitions REQ-0001 … REQ-0015.

Acceptance:
- `/retail/buying/requisitions` side by side with `RequisitionsList.png`: tabs To approve 2 · To pay out 1 · Receipts due 1 · All
  15; toolbar "Number, purpose or person", "Purpose Any", "Asked by Anyone", "Needed soonest"; state badges "Waiting for
  approval" (warn), "Approved, to pay" (info), "Paid, receipt due" (info), "Accounted for" (hollow); Against "PO-0005" links and
  "Fuel"/"Repairs"/"Licences" muted; Σ "US$2,964.80"-style total over the tab.
- Ask for money (`ReqOrder.png`): For "An order", Order "PO-0005 · Afdis Distillers" sub "US$1,940.00", Amount 1,940.00 with
  "The order total. Lower it to pay part now.", Currency US$, Pay from Office safe (sub its balance), Needed by "Tuesday 6
  October", Why; note "Tendai Mhlanga approves anything over US$500.00."; the steps strip at Asked → "REQ-0016 sent to Tendai
  Mhlanga for approval." For an expense (`ReqExpense.png`) the fields swap and the note reads "Under US$500.00, a manager can
  approve it." for US$85.00.
- `/retail/buying/requisitions/<REQ-0014>` as the owner, side by side with `RequisitionRecord.png`: title ellipsis, "REQ-0014",
  "Approve a different amount | Reject | Ask a question | ⋯", "Approve US$1,940.00"; steps Asked ✓ Approved (current) Paid out
  Accounted for; chips "Stock purchase", "Needed by Tuesday"; figure "Asked for US$1,940.00"; KPIs (Spent on stock reads "this
  month" without the budget clause); the bar chart; tabs What it pays for 6 · Approvals 1 · Receipts 0 · Activity; the six lines
  with Σ US$1,686.96 and "Open order PO-0005"; the rail.
- As Tafara (manager): REQ-0014 shows no approve actions (over the limit) and the API answers "Over US$500.00 needs Tendai
  Mhlanga."; REQ-0015 shows them.
- Approve a different amount (`ReqApprove.png`): 1,500.00, "Tell Tafara why" → "Approve US$1,500.00" → toast "US$1,500.00
  approved. Tafara can pay it out.", state Approved, a WhatsApp to Tafara queued, Approvals tab rows.
- Reject (`ReqReject.png`): "Pay another way" + message → "REQ-0014 rejected. Tafara has been told why."; as Tafara the record
  offers "Change and ask again".
- Cancel (`ReqCancel.png`): the dialog's body built ("US$1,940.00 for order PO-0005 is no longer asked for. Tafara Nyathi, who
  asked, gets a message, …") → Cancelled, Tafara notified; on a paid-out requisition the item is absent.
- Chipo (cashier) sees only her own requisitions and no Asked by filter; the stock clerk can ask for an expense.

### BUY-05 · Money out: money accounts, pay out, account for it (W-31, W-32) — L

Builds: migration D + witness; `EVENT_ACCOUNT` in `lib/accounting/posting.ts` (+ test); retail posting rules in
`lib/accounting/defaults.ts` (payout, change, supplier payment) and `lib/retail/buying/posting.ts` (+ test: each event
balances, right accounts); `lib/retail/buying/money-accounts.ts` (balances, + test); lookup `money account`; routes pay, acquit;
sheets `req-payout`, `req-acquit`; the supplier credit row for order payouts; the receipts-overdue follow-up; audit `PAID`,
`ACCOUNTED`; seed: the four money accounts with their opening balances, REQ-0009 … REQ-0012 money.

Acceptance:
- Pay out (`ReqPayout.png`) on REQ-0013: Approved US$637.80 read, Paying, From Office safe with "US$… left in it after this.",
  To "Tafara Nyathi, to pay Pamela", How Cash, Reference placeholder "Optional for cash"; steps at Paid out; "Record payout" →
  toast "US$637.80 paid out. Receipts due by <date>."; the Office safe balance drops by 637.80 (the next sheet's sub shows it);
  **no `RetailCashMovement` row and no shift's expected cash changes** (asserted in the test and checked on `/retail/shifts`);
  a journal Dr 2000 / Cr 1005; Pamela's record shows a credit "In credit US$637.80".
- Paying from Front till float more than it holds → "Front till float has US$120.00." under From.
- Account for it (`ReqAcquit.png`) on REQ-0012: Spent 80.00 → Change back US$5.00 (ok), Change goes to Front till float, a
  receipt photo → toast "REQ-0012 accounted for. US$5.00 back in the front till float."; journal Dr 1005 / Cr 5300; Receipts tab
  1; state Accounted for.
- An expense payout posts Dr the expense type's account / Cr the money account; the CRM's own requisitions still post through
  `postRequisitionDisbursement` (unchanged test).

### BUY-06 · Receive against the order; the delivery record (W-33) — L

Builds: migration E + witness; `lib/retail/buying/deliveries.ts` (`receiveDelivery`, `postDelivery`; + tests: damaged never in
stock, per-line close, more than owed refused, counted vs posted, cost and supplier set on products, cost followers called);
`GET …/orders/[id]/receiving`; `POST …/deliveries`, `…/[id]/post`, `…/bulk/post`, `PATCH …/deliveries/[id]`, attachments upload;
bulk "Mark received" on Orders (`markreceived`); the Receive page (`app/retail/buying/orders/[id]/receive/page.tsx`,
`components/buying/receive/*`); record kind `delivery` (Lines tab, Activity; rail); `RETAIL_GOODS.COUNTED`; notification
`RETAIL_DELIVERY_TO_CHECK`; the empties section behind STK's service (hidden until it exists); seed: deliveries GRN-0001 …
GRN-0005 and history.

Acceptance:
- `/retail/buying/orders/<PO-0003>/receive` side by side with `Receive.png`: "‹ PO-0003 / Receive delivery Delta Beverages,
  second delivery", "Fill as ordered", "Post to stock"; strip "48 days late", "300 of 780 came on 13 August", "Receiving
  US$…"; the guide; four lines "120 came on 13 Aug" … with This time prefilled to what is due; aside sections. Type the board's
  counts (120/6, 144, 90, 72; Keep, Keep, Keep, Close) → totals 780 · 426 · 6 · 54 and "US$300.36"; the four "When you post"
  sentences read as the board.
- "Post to stock" → the status line "Posted to stock. 420 units in stock, 36 still on order." with "Open GRN-<next>"; On hand for
  Castle Lager 340ml +114, Chibuku +144 …; PO-0003 Delivered "720 of 780"-style, Sprite line closed short; a BROKEN difference
  of 6 Castle with credit asked; journal Dr 1200 / Cr 2300; Activity on the order and the delivery.
- As the stock clerk the primary reads "Send for checking"; the delivery is `COUNTED`, nothing moves, managers are notified;
  the delivery record shows steps Arrived ✓ Counted ✓ Checked (current) and primary "Post to stock" (manager) — compare with
  `DeliveryRecord.png`; posting it as Tafara sets "Checked by Tafara Nyathi".
- `/retail/buying/deliveries/<GRN-0002>` side by side with `DeliveryRecord.png` (blocks, rail and copy; this one is posted and
  billed, so the primary is absent and Billed is done).
- More than due on a line → bad border and "More than is still to come."; the server refuses with the kept sentence.

### BUY-07 · Bills and supplier payments (W-35) — L

Builds: migration F + witness; `lib/retail/buying/bills.ts` (record, change with reverse-and-repost, bin and restore,
`applySupplierCredits`; + tests: allocation oldest first, credits, VAT share, price difference) and `payments.ts` (+ tests);
`RETAIL_SUPPLIER_BILL` rules; routes §4.6; lookup `delivery`; list sources `retail-bills`, `retail-supplier-payments`; the
supplier record's Bills and Payments tabs and Owed figures; sheets `bill-new`, `bill-edit`, `payment-new`; bin kind `bill`;
the reopen rule on orders; the statement PDF; the bookkeeper export; the delivery record's "Record a bill" primary; the "1
overdue" badge; audit `RETAIL_BILL.RECORDED`, `RETAIL_SUPPLIER_PAYMENT.RECORDED`; seed: bills and payments; the Bills nav item.

Acceptance:
- `/retail/buying/bills` side by side with `BillsList.png`: tabs To pay 4 · Overdue 1 · Paid 31 · All 35; the five rows with the
  board's bills, deliveries, short dates, states ("21 days overdue", "Paid in cash", "Due in 23 days", "Due in 3 days", "Due in
  27 days"), amounts and owed; Σ US$2,933.60 and US$1,031.20 on All… (on To pay: the To pay rows).
- Record a bill (`BillNew.png`) over Delta's record for a new delivery: For delivery lists only unbilled deliveries with their
  value with VAT; an amount US$1.20 over shows the warn hint; "Save bill" → "Bill <no> saved, due <date>."; the delivery's
  Billed step done; the journal Dr 2300 / Dr 2210 / Dr 5000 1.20 / Cr 2000.
- A bill (`BillEdit.png`): INV-88120 opens from the row; footer "Move to the bin", "Changed by …", "Record a payment", "Save";
  bin refused after a payment with the 409 sentence.
- Record a payment (`PaymentNew.png`) on Delta: Amount 624.00, Bank transfer, CBZ current account, reference; Pays "INV-88120,
  INV-88504, oldest first" → "US$624.00 paid to Delta Beverages. Nothing owed."; both bills Paid; Delta's Owed US$0.00; the
  Payments tab shows one PAY row with both bills; CBZ balance down; journal Dr 2000 / Cr 1010. Paying 700.00 leaves "US$76.00
  held as credit." and the next bill recorded for Delta is paid from it.
- Reopen PO-0003 after closing it short → "INV-88120 is recorded against PO-0003. It cannot be reopened."
- Manager sees Bills read-only (no primary, no bulk but Export); bookkeeper records bills and payments; the export opens in a
  spreadsheet with both sheets.

### BUY-08 · Deliveries list, differences, photos, reverse, take in stock (W-33, W-25) — L

Builds: list source `retail-deliveries` (+ lines, differences, photos); the Deliveries page; routes differences, photos, reverse,
email, notes PDF; sheets `delivery-difference`, `delivery-reverse`, `intake` (all three paying modes, Cash now creating the
requisition, bill and payment); ask `postdeliveries`; lookups `line`, `requisition`; the delivery record's Differences and
Photos tabs; the Receive page's "Paid in cash instead?" link; `RETAIL_DELIVERY_DIFFERENCE` rules; audit `DIFFERENCE`,
`REVERSED`, `PHOTOS_ADDED`; removal of `app/api/v2/retail/purchasing/`.

Acceptance:
- `/retail/buying/deliveries` side by side with `DeliveriesList.png`: "Deliveries", "+ Take in stock"; toolbar "Delivery number
  or supplier", "Supplier Any", "Differences Any"; rows GRN-0005 (To check), GRN-0004 (No order), GRN-0003 (Matches), GRN-0002
  (12 short), GRN-0001 (2 damaged) with the board's cells; Σ lines, units, value.
- Record a difference (`DeliveryDiff.png`) on GRN-0002: Line Chibuku Scud 1L (sub "60 counted"), On the note 66, Counted 55,
  Short, Ask for a credit → "Difference saved. Credit for US$4.10 asked of Delta."; On hand −5; Differences tab 3; Delta's
  Returns tab shows "Credit asked"; journal Dr 2300 / Cr 1200.
- Take in stock (`IntakeNew.png`): From Mutare Wholesalers shows "Mutare Wholesalers has PO-0002 open. Receive against it
  instead."; From Ice Cold Supplies with "No open orders…"; three lines incl. a product added inline ("New product, added
  here"); Paid "Cash now", Front till float, "REQ-0016, raised for you" → "GRN-<next> posted. 112 units in stock."; a requisition
  accounted for, a bill paid in cash, the till float balance down, the new product on sale.
- Reverse a posted, unbilled delivery → stock out, the order's lines expect the units again, journal reversed; on GRN-0002
  (billed) → "INV-88120 is recorded against it. Move the bill to the bin first."
- Bulk "Post to stock" on GRN-0005 → `postdeliveries` → posted.

### BUY-09 · Returns to suppliers (W-36) — M

Builds: migration G + witness; `lib/retail/buying/returns.ts` (book, settle; + tests: stock out, damaged returned without a
movement, the three settlements' postings); routes §4.7; list source `retail-supplier-returns`; sheets `return-new`,
`return-settle`; the Returns tab with its row ⋯; Insights' link (`&productIds=`); audit `RETAIL_SUPPLIER_RETURN.*`; seed RTN-0001,
RTN-0002.

Acceptance:
- Return goods (`ReturnNew.png`) from Delta's record: Supplier, Why Damaged, lines Castle Lager 340ml 6 "Broken in delivery
  GRN-<the BUY-06 delivery>" and Sprite 500ml 12, Settle by Credit note, Collected "With the next delivery, <date>" → "Return RTN-0003 booked. 18
  units off stock."; On hand −12 for Sprite (Castle's 6 were never in stock); Delta's Owed drops by the value; journal Dr 2000 /
  Cr 1200; Returns tab row "Credit expected".
- "Credit note came" with CN-5600 → state Settled; a debit note against INV-88504; Owed unchanged by it (already counted).
- Quantity over on hand → "Only 4 of Sprite 500ml are on the shelf."

### BUY-10 · Retire the old buying code; buying end to end — S

Removes whatever §6 rows are left, updates `lib/retail/route-guard-coverage.test.ts`, and runs the whole area end to end.

Acceptance:
- `grep -rn "purchasing/\|requisition-words\|RETAIL_REQUISITION_CATEGORIES\|order-dialog\|requisition-dialog\|supplierName" app lib components scripts`
  returns nothing in retail code.
- End to end on the reseeded tenant, as the people named: Tafara raises an order to Delta from suggestions and sends it on
  WhatsApp, asks for the cash; Tendai approves less; Tafara pays it out from the office safe; Tendai Sibanda counts the delivery
  with one damaged line and one line short; Tafara posts it and closes the short line; the bookkeeper records the bill and the
  cash requisition is accounted for with change; the bill shows "Paid in cash"; Tafara records a difference found later and
  returns the damaged bottles; the owner's Overview, the Buying badges, On hand, the ledger (2000, 2300, 1200, 1005) and the
  supplier's Owed all agree. Every buying board PNG compared once more.

---

## Open questions

1. **Cross-area ids.** `SET-02`, `SET-07`, `SET-09`, `PRD-01`, `PRD-03`, `STK`, `ADM`, `FLR` name units in specs written in
   parallel; replace them with the real ids. If SET-07 does not take inbound WhatsApp, the webhook in §4.8 is this area's.
2. **Required fields without a tag.** The New supplier board marks only Email and Minimum order optional while its note says
   "Only the name is needed."; the same happens on other sheets. This spec adds `FieldSpec.quiet` (optional, no tag). The
   alternative is to tag them "optional" and change the boards.
3. **Suppliers are `Vendor`.** One supplier list and one payables ledger with the accounting module (and PRD-03's
   `Product.supplierId`). Confirm that a retail tenant's suppliers appearing in `/accounting/payables` is wanted.
4. **VAT basis.** Costs are ex VAT and totals carry VAT (REQ-0014's figures agree; PO-0003's "VAT US$64.80" on US$559.20 does
   not). The products spec's margin is "(price − cost) ÷ price on the VAT-inclusive price"; with costs ex VAT that overstates
   margin by the VAT. One of the two specs should change.
5. **Two people on a delivery.** A stock clerk counts and a manager posts. If stock clerks should post too ("Stock clerks
   receive"), give them `approve` on `retail.purchasing` and the Delivery record's "Checked" step means "posted".
6. **Sample figures that cannot all hold.** The boards' counts and totals (Orders Drafts 1 / Received 19 with PO-0007 drawn
   elsewhere; GRN-0003 against PO-0003; PO-0002's "65 of 100" with 2 damaged; Pamela's spend with no deliveries; Schweppes owing
   nothing while SZ-4471 is unpaid; Requisitions All 14; GRN-0002's US$216.00 value against US$214.80 of lines) contradict each
   other. §3.6 keeps every named row and lets the figures follow the data. The seed also adds Sprite 500ml (products' tabs move
   by one) and asks the products seed to buy Chibuku from Delta.
7. **"Spent on stock … of US$12,000.00 budget".** No stock budget exists anywhere on the canvas; the KPI shows "this month"
   without it. Add a monthly buying budget to Management › Approvals, or drop the clause from the board.
8. **Paying out from "Front till float".** Paying out never moves a till drawer (kept), so "Front till float" is a cash money
   account apart from any open shift's drawer, and the intake hint "So the till float balances at close." means that account,
   not the shift. If the float in the drawer is meant, payouts would need a `RetailCashMovement` and the decision changes.
9. **Short dates.** The Bills list prints "13 Aug 2026"; FND's `date` cell prints "15 August 2026". This spec asks FND for a
   `short` option on the `date` cell.
10. **The expense note's limit.** The Expense board says "Under US$100.00, a manager can approve it." while Approvals says
    US$500.00 and the Roles board "Managers approve up to US$500." The note is built from the setting.
11. **Statements to contacts.** Contacts can be marked "Statements" but nothing on the canvas sends supplier statements; the
    statement is only exported. Add "Send statement" to the supplier record?
12. **Bulk actions that open a sheet for several suppliers** ("New order for each", "Record payments", bills' "Record a payment",
    requisitions' "Pay out") step through one sheet per record ("1 of 3"). The canvas draws only the single-record sheets.
13. **Requisition currency.** ZiG requisitions need a ZiG money account; none is drawn or seeded.
14. **WhatsApp templates.** Messages a shop starts (orders, reminders, decisions to askers) need Meta-approved templates outside
    the 24-hour reply window. This spec names the templates (`purchase-order`, `order-changed`, `order-reminder`,
    `order-cancel-rest`, `requisition-decided`, `requisition-question`, `supplier-message`); SET-07's outbox owns registering
    them and falling back to email.
