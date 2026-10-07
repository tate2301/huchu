# 50 Selling and the floor: the overview, sales, shifts, lay-bys and end of day

Handover spec for canvas page **"05 Selling and the floor"** of the "Corelith data tables" canvas, version 32.
Lede from the workflow map: "The till sells; the admin watches. Every shift is opened with a float, counted at the
end, and any difference is signed off by a person, not left in a report."

This spec covers the boards on that page, the Shifts list board (`Main.dc.html`, on the "Data tables" page, which the
workflow map names as the `shifts` screen), workflows **W-37 to W-44**, the floor half of **W-51** (the Overview is the
"morning look") and **W-53**'s link into a shift, plus the till work the other area specs assign to `FLR:till`.

Read first: `docs/handover/00-foundations.md` (the frames), `10-setup.md` (tills, devices, till rules, fiscal, posting),
`20-products.md` (price lists, vouchers), `30-stock.md` (stock ledger reasons, `stockLevel()`, the manager-PIN service).
Rules from the brief apply: the canvas chooses the direction; every value comes from Postgres through real routes; every
button does what the board and the workflow map say, on the server; no backward compatibility.

Canvas sources: `scratchpad/canvas-v32/project/*.dc.html`. Board images: `scratchpad/shots-v32/<Board>.png`.
Screenshots of today's pages (owner, 1440×1000, `c78d01f`): `scratchpad/smoke/flr50/{overview,sales,sale,shifts,shift,laybys,eod}.png`.

## How to read this spec

- **Frames** come from foundations and are referenced, never re-specified. Aliases used in this document and in the
  structured unit list:

  | Alias | Foundations unit(s) | What it gives this spec |
  |---|---|---|
  | `FND-THEME` | FND-01 | Tender tokens, light and dark, the type pair |
  | `FND-SHELL` | FND-03 (with FND-02 components) | Rail, module panel with badges, 48px header, nav table 5.3.4, `GET /api/v2/retail/nav/badges` |
  | `FND-LIST` | FND-04 + FND-05 | List sources (`lib/reports/definitions/retail/floor.ts`, loaders `lib/reports/loaders/retail/floor.ts`), ListFrame, the **Shifts list itself**, the Z-report print/export bulk endpoints |
  | `FND-RECORD` | FND-06 | RecordFrame, `lib/retail/record-kinds/floor.ts`, Activity tab, ConfirmDialog, the shift record on the frame |
  | `FND-SHEET` | FND-07 | SheetForm, `?sheet=` host, lookups with inline add, **Open a shift** as the reference sheet, `cashierId` on `POST /api/v2/retail/shifts` |
  | `FND-SETTINGS` | FND-08 | SettingsFrame (used only for the lay-by rules added to Till rules) |
  | `FND-DASH` | FND-09 (+ FND-10 checklist card) | DashboardFrame tile kinds, `period-toolbar`, the setup checklist card at the top of `/retail` |

- **Other areas' units** are named by their ids: `SET-03`…`SET-09` (setup), `PRD-05`, `PRD-10` (products), `STK-01`,
  `STK-02`, `STK-04`, `STK-09` (stock). Areas not yet written are named by area: `CUS:customers` (customer noun, customer
  record, `message` sheet), `BUY:requisitions` (requisition payout), `ADM:people` (`person` noun, People record),
  `INS:insights` (Insights › Losses reads reasons).
- **Defined here** marks a choice the canvas shows the control for but not its contents. **Deviation** marks a place where
  this spec deliberately does not copy the board and says why.
- Copy in quotes is exact, sentence case, British English. Money "US$1,284.60", negative "−US$15.79" (U+2212), ZiG
  "ZiG 4,288"; times "14:42" in the company's time zone (Africa/Harare); everything per foundations 5.13.
- Every write in this spec: session through `requireRetailSession`, permission through `requireRetailPermission`
  (`lib/retail/permissions.ts`), company scope on every query, money in `Decimal` (`lib/money.ts`), and its audit event
  (`lib/retail/audit.ts`) **inside the same transaction**; ledger postings through `postRetailJournal`
  (`app/api/v2/retail/_helpers.ts` → `lib/accounting`), never by writing journal rows by hand.

## Decisions at a glance

1. **Routes** (foundations 5.3.4 is canonical; these are the floor's rows of it):

   | Page | Route |
   |---|---|
   | Overview | `/retail` (`?period=` today, week or month; `&site=` a site id or `all`) |
   | Sales | `/retail/sales` (`?tab=` today, refunds, voids or all) |
   | A sale (or a refund) | `/retail/sales/[id]` |
   | Shifts | `/retail/shifts` (FND-LIST) |
   | A shift | `/retail/shifts/[id]` |
   | Count and close | `/retail/shifts/[id]/close` (a page, not a sheet) |
   | Lay-bys | `/retail/laybys` (`?tab=` paying, ready, done or all) |
   | End of day | `/retail/end-of-day` (`?site=<siteId>&date=YYYY-MM-DD`, default the person's default site and today) |
   | Past days and Z-reports | `/retail/end-of-day/days` |

   Sheets (`lib/retail/sheet-kinds/floor.ts`): `shift-open` (FND-SHEET builds it; this spec adds the ZiG float and the
   float default), `cash-move`, `sign-off`, `refund`, `sale-void`, `sale-customer`, `sale-send`, `staff-message`,
   `layby-new`, `layby`. **Reconcile with foundations:** its Shifts row menu (5.5.5) opens "Count and close" as
   `?sheet=shift-close`; the canvas draws Count and close as a full page (ShiftClose), so the row menu and the record's
   primary link to `/retail/shifts/[id]/close`.

2. **One drawer rule for the back office.** Cash that moves because of something done in the back office (a cash refund,
   a lay-by deposit or payment in cash, a lay-by cancellation paid back in cash, a void of a cash sale) goes through a
   real open drawer, found in this order: the sale's own shift if it is still open; else the open shift on the sale's
   till; else the signed-in person's own open shift at that site; else the only open shift at that site; else, when
   several are open, the person picks one in the sheet (a `seg` "Drawer" under the cash choice listing "Front till · Chipo
   Dube", "Handheld 1 · Tendai Mhlanga", stale drawers last; default the first by till name; sent as `shiftId`, re-checked
   OPEN at that site on the server). None open → 409 "Open a shift at Harare Main Branch to take cash." (or "…to hand cash
   back."). When the drawer is found without asking, the sheet says which before the person presses the button (a hint
   under "With" / "Money goes back as": "Cash comes out of the front till’s drawer (Chipo Dube)."). All **Defined here**.
   Card, EcoCash, credit note, voucher and lay-by tenders need no drawer. Implemented once in
   `lib/retail/floor/drawer.ts#resolveDrawer(tx, { companyId, siteId, registerId?, saleShiftId?, chosenShiftId?, actorId })`
   returning `{ shift } | { choose: Shift[] } | { none: true }`; the sheet-load endpoints return the same answer.

3. **Manager approval** is the stock spec's `lib/retail/manager-pin.ts` (STK-04: pick a manager, type their till PIN,
   the till lockout of 5 tries and 15 minutes). The "Manager PIN" field on the floor sheets is a `read` field that says who
   approves:
   - the signed-in person holds the approval right (`retail.sell:approve` for refunds and voids, `retail.cash-control:approve`
     for cash moves): the field reads "<their name>, <HH:MM>" in `ok` tone and nothing is typed — their own signed-in
     session is the approval, and their name goes on the record;
   - they do not: the field reads the board's warn sentence ("Needed. Ask Tafara Nyathi or Tendai Mhlanga." — the active
     people with the right, at most two named, "or" before the last) and under it the STK-04 approval control (an `auto`
     of those people, a 4-digit PIN input). The request carries `approver: { userId, pin }`; the server verifies it with
     `verifyManagerPin` and the lockout. SET-06 says a manager PIN is accepted only from a paired device; the stock spec
     accepts it in the back office for adjustments. This spec follows the stock spec (back-office PIN accepted with the
     lockout) — see Open questions.

4. **Shifts are counted by note, blind for the cashier.** The close stores the count per note and currency, the ZiG rate
   used, the float left and what went to the safe. A difference under US$0.05 (ZiG conversion rounding) is "None" and is
   stored as 0.00; more than US$1.00 needs "What happened"; any non-zero difference waits on the Overview until a manager
   signs it off.

5. **Sign-off is a decision with consequences.** Accept (already booked to Cash over short at close), Recover (a receivable
   from the cashier: Dr Staff owe the shop / Cr Cash over short), or Look into it (stays on the Overview and blocks the day
   close). The cashier is notified with the note.

6. **Lay-bys are their own documents** (`RetailLayby`, `LAY-0031`): goods leave the shelf when the lay-by starts (stock
   movement reason `LAYBY_ASIDE`), each payment is a liability (Lay-by deposits held), and handing over posts a real sale
   paid by the `LAYBY` tender, fiscalised then.

7. **End of day is per site per trading day** and is the only place Z-reports are generated (`POST /api/v2/retail/z-reports`
   stops being a public generate endpoint). Closing the day needs every shift opened that day closed and every difference
   signed off; it generates each till's Z-report, closes the fiscal day when the fiscal settings say "By hand", records the
   banking with its slip and posts Dr Bank / Cr Cash vault.

8. **The Overview has one endpoint**, `GET /api/v2/retail/overview`, returning every tile for the period and site
   (foundations 5.11.2). The old `GET /api/v2/retail` dashboard (P&L by month) and `app/retail/page.tsx` go.

9. **Numbers people read**: sales `SALE-31870` (five digits, company-wide), refunds `RFD-0044`, void reversals
   `VOID-0007` (never shown in lists; the voided original carries the state), shifts `SH-00242`, lay-bys `LAY-0031`.
   `lib/id-generator.ts` prefixes change for new documents; existing rows keep their numbers (fiscalised receipts are
   never renumbered).

10. **Takings** everywhere on the floor = Σ `RetailSale.baseAmount` over SALE (posted or voided), VOID (negative) and
    REFUND (negative) documents — a void nets to zero, a refund subtracts, deposits and vouchers sold are outside it. One
    function: `lib/retail/floor/takings.ts#takingsWhere(...)` and `sumTakings(...)`, used by the Overview, the shift
    record, End of day and Past days so the four never disagree.

---

## 1. Boards

Canvas reading order (page "floor", rows top to bottom, left to right), then the boards the floor's links reach that this
area owns, then the ones it only links to.

| # | Board file | Canvas title | What it is | Target route, or where it opens | Code status today | Notes |
|---|---|---|---|---|---|---|
| 1 | `Floor.dc.html` | Overview | dashboard | `/retail` | **Exists but differs.** `app/retail/page.tsx` (`flr50/overview.png`): "Needs action" as a two-row register ("Shifts not cashed up", "Low stock"), four month P&L blocks ("Sales this month $2,918.60", Gross profit, Operating profit, Net profit), a Tenders table, a 12-month line chart; header link "Open the till" to `/portal/pos`. No period toolbar, site chip, live line, hero KPI with sparkline, KPI tiles with 7-day bars, tills now, 30-day bars, share bar or rank lists. Blue theme, `$` money. Data from `GET /api/v2/retail` (P&L by month). | Hand-built board on DashboardFrame tiles (FND-DASH 5.11.1). Needs action rows link to their workflow (canvas note: "The morning look: the overview, with what needs action linked to its workflow"). |
| 2 | `ShiftOpen.dc.html` | W-37  Open a shift for a cashier | sheet (`shiftopen`) over the Shifts list | `?sheet=shift-open` over `/retail/shifts`; the same sheet over `/retail` from the Overview's "Open shift" | **Exists but differs.** `app/retail/shifts/page.tsx` "Open shift" centred dialog: site select, register select, opening float, notes; `POST /api/v2/retail/shifts` opens for the caller only (`cashierId = actor`), refuses when the caller has an open shift; no cashier pick, no ZiG float, no last-close hint, no "till already open" check. | The sheet is FND-SHEET's reference; this spec owns its server rules beyond `cashierId`, the ZiG float and the float default. |
| 3 | `ShiftRecord.dc.html` | The shift, live | record (`shift`) | `/retail/shifts/[id]` | **Exists but differs.** `app/retail/shifts/[id]/page.tsx` (`flr50/shift.png`): "SH-00042" header with "Close shift"; Details, Cash up, Cash in and out, Tender mix and Sales as fact lists at 560px; the close is a dialog with one "Counted cash" field. No strip, steps, chips, KPIs, chart, tabs, rail, ⋯ menu. | FND-RECORD moves it onto the frame (5.6.10) wiring only Export as PDF, Print X-report and the close link; this spec wires every other action. |
| 4 | `CashMove.dc.html` | W-38  Cash in or out, with a PIN | sheet (`cashmove`) over the shift record | `?sheet=cash-move` over `/retail/shifts/[id]` | **Missing in the back office.** Server works for the till: `POST /api/v2/retail/shifts/[id]/cash-movements` (own drawer `retail.sell:create`, others `retail.cash-control:update`), moves `expectedCash`, audit `RETAIL_CASH.MOVED`; the till screen `pos-cash-movement-view.tsx` counts notes. No manager approval, no requisition link, no journal. | |
| 5 | `ShiftClose.dc.html` | W-39  Count by note, then close | page | `/retail/shifts/[id]/close` | **Exists but differs.** Close is one counted total (`POST /api/v2/retail/shifts/[id]/close { countedCash }`) in a dialog; variance journal `RETAIL_SHIFT_VARIANCE` and `ApprovalAction` work. No per-note count, ZiG count, difference preview, explanation rule, blind count, float left or to-the-safe. | Hand-built board. Header back is the shift number ("SH-00242"), not "Shifts". |
| 6 | `SignOff.dc.html` | W-40  Sign off what was short | sheet (`signoff`) over the shift record | `?sheet=sign-off` over `/retail/shifts/[id]` (the shift being signed off) | **Missing.** Nothing records an outcome; closing writes an automatic `ApprovalAction` "APPROVE". | Reached from Overview › Needs action and End of day. |
| 7 | `SalesList.dc.html` | Sales | list (`sales`) | `/retail/sales` | **Exists but differs.** `app/retail/sales/page.tsx` (`flr50/sales.png`): a register (number, customer and date stacked) with Status, Cashier, Tender, Total; Type and Tender filters; the last 120 sales filtered in the browser ("120 of 120"); "Open the till". No tabs, Till/Cashier filters, Items or Till columns, totals, selection, bulk, export, pager, row menu. | |
| 8 | `SaleRecord.dc.html` | A sale, with its fiscal receipt | record (`sale`) | `/retail/sales/[id]` | **Exists but differs.** `app/retail/sales/[id]/page.tsx` (`flr50/sale.png`): "S-000930" with Details, Lines and Total fact lists; no actions at all (comment: "a sale is refunded or voided on the till"); no fiscal block, strip, KPIs, chart, tabs, rail. Data `GET /api/v2/retail/pos/sales/[id]`. | |
| 9 | `RefundNew.dc.html` | Refund, with a reason and a PIN | sheet (`refund`, wide) over the sale record | `?sheet=refund` over `/retail/sales/[id]` | **Missing in the back office.** The till refunds through `POST /api/v2/retail/pos/sales/[id]/refund` (lines, reason text, payments, password override): stock back (`RECEIPT`), journal `RETAIL_REFUND`, deposits back, fiscal credit note, audit — these work. No credit note or voucher refund, no write-off of damaged goods, no PIN, no reasons list. | |
| 10 | `VoidSale.dc.html` | Void, same day only | sheet (`voidsale`) over the sale record | `?sheet=sale-void` over `/retail/sales/[id]` | **Missing in the back office.** Till void works (`pos/sales/[id]/void`: VOID document, original VOIDED, stock back, journal, audit) but has no same-day rule and uses the password override. | |
| 11 | `LaybysList.dc.html` | W-42  Lay-bys | list (`laybys`) | `/retail/laybys` | **Missing** (`flr50/laybys.png`: 404; no model, no API). | |
| 12 | `LaybyNew.dc.html` | Start a lay-by | sheet (`laybynew`, wide) over the Lay-bys list | `?sheet=layby-new` over `/retail/laybys` | **Missing.** | |
| 13 | `LaybyPay.dc.html` | Take a payment, hand over, cancel | sheet (`laybypay`) over the Lay-bys list | `?sheet=layby&id=<id>` over `/retail/laybys` (a lay-by row opens it) | **Missing.** | The board's footer note wraps into a tall column (a canvas layout fault); the frame's footer wraps the note normally. |
| 14 | `EndOfDay.dc.html` | W-43  End of day | page | `/retail/end-of-day` | **Missing** in the back office (`flr50/eod.png`: 404). The till's Reports view (`pos-z-report-view.tsx`) lists a day's registers and takes a Z-report per register (`POST /api/v2/retail/z-reports`, frozen, idempotent); no site day close, banking, fiscal check or sign-off check. | Hand-built board. |
| 15 | `DaysList.dc.html` | Past days and Z-reports | list (`days`) | `/retail/end-of-day/days` | **Missing** (the till lists the last 30 Z-reports). | |
| 16 | `Main.dc.html` (page "Data tables") | Shifts — live (press Play) | list | `/retail/shifts` | **Exists but differs** (foundations board 1). | FND-LIST builds it. This spec defines its row menu's actions (they open this spec's sheets and page) and its "Needs sign-off" filter option (section 5.4). |
| 17 | `WfFloor.dc.html` (page "Workflows") | 05 Selling and the floor | explainer (the workflow map for this area) | none | n/a | Nothing to build; section 2 is its content made real. |

Boards the floor links to, owned elsewhere: `CustomersList`, `CustomerRecord`, `AccountsList` (customers area; the
Customers and Accounts items sit in the floor's panel), `StockList` (stock; "below reorder level"), `TillsList` (setup;
"receipts not yet fiscalised"), `Receive` (buying/stock; "purchase order due today"), `PromotionRecord` (products;
"promotion ends tomorrow"), `MessageNew` (customers; lay-bys "Remind on WhatsApp"), `InsightsLosses` (insights; refund
and void reasons), `Selected`/`Grouped`/`Narrow`/`Mobile`/`Dark` (foundations; Shifts states).

### The floor's panel (List template `M.floor`)

"The floor" module, items in this order: Overview · Sales · Shifts (badge "2 open") · Lay-bys (badge "3") · End of day ·
Customers · Accounts (badge "1 overdue"). Routes and visibility are foundations 5.3.4's rows. This spec ships the
**Lay-bys** badge provider (`lib/retail/nav-badges.ts`: href `/retail/laybys`, requires `retail.laybys:view`, count
`RetailLayby` with status `PAYING` at any site, label "<n>"). The Shifts badge is foundations'. `Main.dc.html`'s older
panel (Overview, Sales, Shifts, Customers with Help and Management rows) is superseded by `M.floor`.

---

## 2. Workflows

Who does what (from the Roles board, "The floor" rows; O owner `SUPERADMIN`, M manager `MANAGER`/`SHOP_MANAGER`,
C cashier, S stock clerk, B bookkeeper `FINANCE_OFFICER`):

| Row | Superuser | O | M | C | S | B | Board's limit note |
|---|---|---|---|---|---|---|---|
| Sales, refunds, voids | C R U D | C R U D | C R U D | C R | – | R | "Cashiers refund with a manager PIN over the limit." |
| Shifts and cash | C R U D | C R U D | C R U D | C R U | – | R | "Cashiers open and close their own." |
| Lay-bys | C R U D | C R U D | C R U D | C R U | – | R | |
| End of day | C R U D | C R U | C R U | – | – | R | |

Per action, server-checked (section 3.3 has the matrix entries):

| Action | O | M | C | S | B |
|---|---|---|---|---|---|
| See the Overview | ✓ | ✓ | – (home is Shifts) | – | ✓ |
| See sales | all | all | own | – | all |
| Refund a sale | ✓ | ✓ | ✓, a manager approves over the till-rules limit | – | – |
| Void a sale (same day) | ✓ | ✓ | ✓, a manager approves as the till rules say | – | – |
| Reprint, send on WhatsApp | ✓ | ✓ | own sales | – | – |
| Add a customer, correct a payment reference, mark looked at | ✓ | ✓ | – | – | – |
| See shifts | all | all | own | – | all |
| Open a shift | any till, any person who may sell | same | their own | – | – |
| Cash in or out | any drawer (approves it themselves) | same | own drawer, a manager approves | – | – |
| Count and close | any | any | own (blind count) | – | – |
| Close without counting | ✓ | ✓ | – | – | – |
| Sign off a difference | ✓ | ✓, not their own drawer | – | – | – |
| Message the cashier | ✓ | ✓ | – | – | – |
| Lay-bys: see, start, take a payment, hand over, change the date | ✓ | ✓ | ✓ | – | see only |
| Cancel a lay-by | ✓ | ✓ | – | – | – |
| See End of day and Past days | ✓ | ✓ | – | – | ✓ |
| Close the day | ✓ | ✓ | – | – | – |

### W-37 Open a shift — **Cashier** (a manager for them) — starts "Till, or Shifts"

Steps: Pick the till · Count the float · Start selling. Screens: shifts, shiftopen, shift.

**Code today: partly.** The till opens a shift for its signed-in cashier (`POST /api/v2/retail/pos/shifts`); the back office
opens one only for the caller. No ZiG float, no "last close left", no check that the till is free.

1. **From the till** (the usual way, the sheet's note says so): the cashier signs in with their PIN on a paired device
   (SET-04); the till's Shift screen asks for the float in US$ and, when the shop takes ZiG cash, ZiG; `POST
   /api/v2/retail/pos/shifts` uses the device's till (SET-04 removes `registerId` from the body). FLR-09 adds the ZiG float
   and the float default to the till's screen.
2. **From the back office** (a manager opening for someone): Shifts › "+ Open shift", or Overview › "+ Open shift" →
   `?sheet=shift-open`. Pick the till (lookup `till`, sub "Open"/"Closed"), the cashier (lookup `person`, people who may
   sell, sub their role), the opening float (defaults to what the till's last close left) and the ZiG float.
3. **Server** `POST /api/v2/retail/shifts` (`openRetailShiftTransaction`, `app/api/v2/retail/_services.ts` → moved to
   `lib/retail/floor/shifts.ts`):
   - Permission: `retail.cash-control:open-shift` (owner, manager) for anybody; `retail.sell:open-shift` when
     `cashierId` is the caller (cashier). Else 403 "Your role cannot open a till shift in sales".
   - Validation: the till exists in the company, is active, belongs to an active site (404 "Till not found"); no OPEN shift
     on that till (409 "Back till already has an open shift."); the cashier is an active user of the company with
     `retail.sell:open-shift` (400 `fieldErrors.who` "Kuda Banda cannot sell at a till."); the cashier has no other OPEN
     shift (409 "Kuda Banda already has a shift open on the front till."); floats ≥ 0 with two decimals (400
     `fieldErrors.float` "Give the float as an amount, like 100.00."); ZiG float only when the shop takes ZiG cash
     (`RetailPaymentSettings.takeCashZig`, SET-05), else ignored.
   - Writes, one transaction: `RetailShift` (`SH-#####`, `registerId` (SET-04) and the frozen `registerCode`/`registerName`,
     `siteId` from the till, `cashierId`/`cashierName` of the chosen person, `openingFloat`, `openingFloatZig`,
     `expectedCash = openingFloat + openingFloatZig ÷ today's ZiG rate` (`CurrencyRate` USD→ZWG latest, SET-05), status
     OPEN); audit `RETAIL_SHIFT.OPENED` (actor = the caller, payload `{ cashierId, openingFloat, openingFloatZig }`).
   - Ledger (after commit, as today): `RETAIL_SHIFT_OPEN` Dr Till cash / Cr Cash vault for the float in base currency
     (US$ float + ZiG float ÷ today's rate, `amount` in base, the ZiG part named in the memo).
   - Response 201 `{ data: { id, shiftNo, registerName, cashierName } }`.
4. **Other screens**: the Shifts list's first row (Open), the Shifts badge ("3 open"), Overview › Tills now (the till
   "Open"), End of day's tills table, the till's lock screen for that cashier on that till.

### W-38 Take cash out or put it in — **Cashier, manager** — starts "Shift record, or the till"

Steps: Amount · Why · Manager PIN. Screens: shift, cashmove.

**Code today: partly** (server and till screen work; no back-office sheet, no approval, no journal, no requisition link).

1. Shift record › "Record cash in or out" → `?sheet=cash-move`. Which way (Out of the drawer / Into the drawer), Why (four
   cards), Amount, Currency, Manager PIN. "Pay a supplier" asks which requisition; "Petty cash" asks what for
   (**Defined here**, section 5.6.2).
2. **Server** `POST /api/v2/retail/shifts/[id]/cash-movements` (changed body, section 4.3;
   `recordRetailCashMovementTransaction` moved to `lib/retail/floor/cash-moves.ts`):
   - Permission: own drawer `retail.sell:create`; another's `retail.cash-control:update`. Approval: every movement needs a
     manager ("Every movement needs one."): the caller with `retail.cash-control:approve` approves it themselves; else
     `approver { userId, pin }` verified by STK-04's `verifyManagerPin` (400 `fieldErrors.pin` "That PIN is not right.";
     429 "Too many tries. Try again in 15 minutes."; missing → 409 `{ error: "A manager has to approve this.", needsApprover:
     true }`).
   - Validation: shift OPEN (409 "SH-00242 is closed."); amount > 0, two decimals; currency US$ or ZiG (ZiG only when taken);
     money out not more than should be in the drawer in that currency (400 `fieldErrors.amt` "Only US$201.50 should be in
     the drawer."); "Pay a supplier": `requisitionId` of an APPROVED requisition not yet paid, amount ≤ its approved amount
     (400 `fieldErrors.req` "REQ-0014 is for US$1,940.00."); "Petty cash": `note` 3–200 characters (400 `fieldErrors.note`
     "Say what it was for.").
   - Mapping: Drop to the safe → `DROP_TO_SAFE`/`CASH_LEVEL_TOO_HIGH`; Pay a supplier → `PAYOUT`/`SUPPLIER_PAYOUT`; Petty cash
     → `PAYOUT`/`PETTY_CASH`; Float top-up → `FLOAT_TOP_UP`/`CHANGE_REQUIRED`.
   - Writes, one transaction: `RetailCashMovement` (with `approvedById`, `approvedByName`, `requisitionId`, `reason` = the
     note), `expectedCash` incremented by the signed base amount (guarded on OPEN, as today), audit `RETAIL_CASH.MOVED`
     (payload adds `approvedBy`, `requisitionNo`); for "Pay a supplier" the buying area's payout service in the same
     transaction (`BUY:requisitions` `payRetailRequisition(tx, actor, id, { from: "TILL_CASH", shiftId, cashMovementId })`,
     which posts its own journal crediting Till cash).
   - Ledger (after commit): `RETAIL_CASH_MOVEMENT` (new source type) — Drop: Dr Cash vault / Cr Till cash; Float top-up: Dr
     Till cash / Cr Cash vault; Petty cash: Dr Petty cash (5110) / Cr Till cash. Supplier payouts post through the
     requisition (no second journal).
   - Response 201 `{ data: { id, type, amount, currency, delta }, shift: { expectedCash } }`.
3. **Other screens**: the shift record (KPI "Cash in and out", "Should be in the drawer", the Cash in and out tab, rail
   "To the safe"), the count page's "Dropped to the safe", the Z-report's cash movements, End of day's cash to bank, the
   requisition record (paid from Front till).

### W-39 Count and close a shift — **Cashier, manager** — starts "Shift record" — guided

Steps: Count by note · See the difference · Explain it · Close. Screens: shift, shiftclose.

**Code today: partly** (close with a counted total works: status, variance, variance journal, audit, approval row).

1. Shift record › "Count and close" (or Shifts row menu, or End of day "Count and close", or Overview "Back till open for 52
   hours") → `/retail/shifts/[id]/close`. Type how many of each note; the page adds them up, converts ZiG at today's rate and
   shows the difference (a manager sees it as they type; the cashier counting their own drawer sees it after pressing
   close — the board's "The cashier counts without seeing what is expected").
2. Out by more than US$1.00 → "What happened" is needed. "Float left for tomorrow" can be changed (**Defined here**).
3. "Close the shift" → `POST /api/v2/retail/shifts/[id]/close` (changed body, section 4.3;
   `closeRetailShiftTransaction` moved to `lib/retail/floor/shifts.ts`):
   - Permission: own drawer `retail.sell:close-shift`; another's `retail.cash-control:close-shift` (403 "Only SH-00242’s
     cashier or a manager can close it." otherwise, today's message reworded).
   - Validation: shift OPEN (409 "SH-00242 is closed already."); counts are whole numbers ≥ 0 for the denominations of that
     currency (USD 100, 50, 20, 10, 5, 2, 1; ZWG 200, 100, 50, 20, 10, 5 — the board's lists; 400 `fieldErrors` keyed
     `usd.100` "Count whole notes."); float left ≥ 0 and ≤ the US$ counted (400 `fieldErrors.floatLeft` "Only US$167.00 in
     US$ notes was counted."); when |difference| > 1.00 and no note → 400 `{ error: "It is out by −US$4.50. Say what happened,
     then close.", difference: "-4.50", fieldErrors: { note: "Say what happened." } }` (this is how the blind count reveals
     the difference).
   - Arithmetic (`lib/retail/floor/count.ts#countDrawer`, pure, unit-tested): counted US$ = Σ notes; counted ZiG = Σ notes;
     rate = today's ZiG rate; counted (base) = US$ + ZiG ÷ rate, to the cent; difference = counted − expectedCash; |d| <
     0.05 → 0.00 ("None"); to the safe = counted − float left.
   - Writes, one transaction: `RetailShift` status CLOSED, `closedAt`, `closedById`, `countedCash`, `countedUsd`,
     `countedZig`, `countRate`, `countLines` (`{ USD: [{ denomination, count }], ZWG: [...] }`), `variance`, `closeNote`,
     `floatLeft`, `toSafe`; audit `RETAIL_SHIFT.CLOSED` (adds `countedUsd`, `countedZig`, `rate`, `floatLeft`, `toSafe`,
     `closedByOwner`); the existing `createApprovalAction` row only when the difference is 0 (a balanced drawer needs no
     sign-off; a different one waits for W-40).
   - Ledger (after commit): `RETAIL_SHIFT_VARIANCE` as today when the difference ≠ 0; `RETAIL_SHIFT_CLOSE` (new) Dr Cash vault
     / Cr Till cash for `toSafe`.
   - Notifications: difference ≠ 0 → `RETAIL_SHIFT_DIFFERENCE` to every owner and manager (except the closer) "SH-00242 is
     short US$4.50" / "…is over US$3.17", summary "Front till · Chipo Dube. Sign it off on the overview.", link
     `/retail/shifts/<id>?sheet=sign-off`, severity WARNING.
   - Fiscal: after commit, SET-08's `closeFiscalDayIfLastShift(companyId)` (closes the open fiscal day when this was the
     company's last open shift and the fiscal settings say "With the last shift").
   - Response `{ data: { shiftNo, closedAt, difference: "-4.50" | "0.00", state: "BALANCED" | "SHORT" | "OVER" } }`; the page
     shows the board's banner "**Closed at 14:10.** The drawer balanced." or "**Closed at 14:10.** Out by −US$4.50. It is on
     the overview for a manager to sign off."
4. **Close without counting** (shift ⋯, `--bad`; owner, manager): ConfirmDialog `closeuncounted` → `POST
   /api/v2/retail/shifts/[id]/close-uncounted { reason }` (`retail.cash-control:close-shift`): status CLOSED, `countedCash`
   and `variance` null (state "Not counted"), `closeNote` = reason (3–300 chars, 400 otherwise), `closedById`; audit
   `RETAIL_SHIFT.CLOSED` with `uncounted: true`; no variance journal; notification as above ("SH-00240 closed without a
   count"); it waits for sign-off. Used for a lost or broken device (SET-03 "Lost device").
5. **Other screens**: Shifts list state (Balanced / Short / Over / Not counted), Tills now, the Overview's Needs action,
   End of day's tills table and checklist, the till (`pos/current-shift` returns nothing; the lock screen offers "Open a
   shift"), the nav badge.

### W-40 Sign off a short or over drawer — **Manager** — starts "Overview › Needs action"

Steps: Read the shift · Accept or recover · Note. Screens: overview, signoff.

**Code today: missing.**

1. Overview › "Three drawers short this week" (opens the oldest unsigned one), End of day › "Sign off", the shift's ⋯ "Sign
   off the difference", or the Shifts list's "Needs sign-off" filter → `/retail/shifts/[id]?sheet=sign-off`.
2. Read the difference and what was counted; choose Accept it / Recover from the cashier / Look into it; write the note.
3. **Server** `POST /api/v2/retail/shifts/[id]/sign-off { outcome: "ACCEPT" | "RECOVER" | "LOOK_INTO", note }`
   (`lib/retail/floor/sign-off.ts`):
   - Permission `retail.cash-control:approve` (owner, manager); the drawer's own cashier cannot sign it off unless they are
     the owner (403 "Somebody else signs off your own drawer.").
   - Validation: shift CLOSED with a difference (variance ≠ 0) or not counted (409 "SH-00239 has nothing to sign off.");
     not already finally signed off — `signOffOutcome` null or LOOK_INTO (409 "SH-00239 is signed off already.");
     RECOVER only when short (400 `fieldErrors.do` "Only a short drawer can be recovered."); note required for RECOVER and
     LOOK_INTO, 3–500 characters (400 `fieldErrors.note` "Note how Chipo agreed." / "Say what you are looking into."),
     optional for ACCEPT.
   - Writes, one transaction: `signOffOutcome`, `signedOffAt`, `signedOffById`, `signOffNote`, `recoverAmount` (RECOVER: the
     shortage); `createApprovalAction` (`RETAIL_SHIFT`, APPROVE for ACCEPT/RECOVER, `fromStatus "CLOSED"`, `toStatus
     "SIGNED_OFF"`, note); audit `RETAIL_SHIFT.SIGNED_OFF { outcome, amount, note }`.
   - Ledger (after commit): RECOVER → `RETAIL_SHIFT_RECOVERY` (new) Dr Staff owe the shop (1150) / Cr Cash over short
     (5420). ACCEPT and LOOK_INTO post nothing (the variance was booked at close).
   - Notification to the cashier: `RETAIL_SHIFT_SIGNED_OFF` "SH-00239 signed off" with summary "US$20.00 to be recovered.
     <note>" / "US$20.00 written off. <note>" / "Being looked into. <note>" — "Chipo sees the sign-off and the note in the
     app."
   - Response `{ data: { shiftNo, outcome, amount } }`.
4. **Other screens**: the Overview's Needs action (gone unless LOOK_INTO), the shift record (chips "Signed off" /
   "Recovering US$20.00" / "Being looked into"), the Shifts list's "Needs sign-off" filter, End of day's checklist,
   Past days' state "Signed off short", the cashier's People record (ADM:people shows what they owe — the admin area reads
   `recoverAmount` of RECOVER shifts not yet repaid; repayment is out of scope here, see Open questions).

### W-41 Refund or void a sale — **Cashier with manager PIN** — starts "The till, or Sales"

Steps: Find the sale · Lines to refund · Cash, credit note or voucher. Screens: sales, sale, refund, void.

**Code today: partly** (till refund and void services work: reversing documents, stock back, ledger, fiscal credit
notes, deposits; no back-office screens, no same-day rule, no write-off, no credit note or voucher, password override).

1. **Find the sale**: Sales (tabs, search "Sale, receipt, customer or product") → the sale record. From the till: the till's
   History (FLR-09).
2. **Refund** (record action) → `?sheet=refund`: the lines that can still come back with quantities, Why (the till rules'
   reasons), Money goes back as (the sale's tender, Cash, Credit note, Voucher), Put it back on the shelf, Manager PIN.
3. **Server** `POST /api/v2/retail/sales/[id]/refund` (back office) and `POST /api/v2/retail/pos/sales/[id]/refund` (till,
   device-checked by SET-04) both call `lib/retail/floor/refunds.ts#refundSale` (the moved and extended
   `refundRetailSaleTransaction`):
   - Permission `retail.sell:refund` (owner, manager, cashier — SET-06 gives cashiers `refund` limited by the rules);
     cashiers only their own site's sales.
   - Rules (SET-06 `RetailTillRules`): refund value > `refundPinOver` → a manager's approval (decision 3); `reason` one of
     `refundReasons` (400 `fieldErrors.why` "Pick a reason from the list.").
   - Validation: the sale is SALE and POSTED (409 "SALE-31866 was voided." / "Only sales can be refunded."); each line's
     quantity > 0 and ≤ what is left of it (400 `fieldErrors.lines` "Only 1 Johnnie Walker Black 750ml can still come
     back."); at least one line (400 "Choose what comes back."); `to = CASH` needs a drawer (decision 2, 409); `to =
     CREDIT_NOTE` needs a customer — the sale's, or `customerId` in the body (400 `fieldErrors.customer` "A credit note
     needs a customer."); `to = ORIGINAL` only when the sale was paid by one non-cash tender (card, EcoCash, InnBucks,
     transfer), otherwise it is Cash.
   - Writes, one transaction: the REFUND document (`RFD-####`, `sourceSaleId`, negative lines and totals apportioned in
     `Decimal` as today, deposits back, `overrideReason` = reason, `approvedById`/`approvedByName`, `restocked`,
     `customerId` copied), its negative payment by tender (ORIGINAL → the sale's tender with reference "Reversal of <ref>";
     CASH → CASH on the resolved shift, `expectedCash` decremented; CREDIT_NOTE → PRD-10 `issueVoucher(tx, { kind:
     "CREDIT_NOTE", funding: "REFUND", customerId, value, soldSaleId: refund.id })` and tender VOUCHER with `voucherId`;
     VOUCHER → `issueVoucher({ kind: "GIFT", funding: "REFUND" })`); stock: `RECEIPT` per line, reason `REFUND`, reference
     the refund number (STK-01); when `restocked = false`, straight after, an `ADJUSTMENT` −quantity reason `BROKEN` with
     the same reference and note "Damaged, refunded on RFD-0045" through the stock area's adjustment service (journal
     `RETAIL_STOCK_ADJUSTMENT` LOSS at cost — this is what makes it "show in Losses"); audit `RETAIL_SALE.REFUNDED` with
     `approvedBy`.
   - Ledger (after commit): `RETAIL_REFUND` (existing; tender mapping takes VOUCHER to Vouchers owed). Fiscal: the existing
     `fiscaliseAfterPosting` issues the credit note citing the original receipt.
   - Response 201 `{ data: { id, saleNo: "RFD-0045", value: "42.00", to, voucherCode? } }`.
4. **Void** (⋯ "Void (same day only)") → `?sheet=sale-void`: Why (the till rules' void reasons), Note, Manager PIN.
   **Server** `POST /api/v2/retail/sales/[id]/void` and `pos/sales/[id]/void` → `lib/retail/floor/voids.ts#voidSale`:
   - Permission `retail.sell:void`; rule `voidPin` ALWAYS → approval; AFTER_5_MINUTES → approval when now − postedAt > 5
     minutes; NEVER → none. Reason one of `voidReasons`.
   - Validation: the sale is SALE POSTED with no refunds or reversals (409 "SALE-31866 has a refund against it. Refund the
     rest instead."); posted on today's trading day in the company's time zone (409 "Only today’s sales can be voided.
     Refund it instead."); a cash sale needs its money to come out of a drawer (decision 2; 409 "Front till’s shift is
     closed. Refund it instead.").
   - Writes, one transaction: VOID document (`VOID-####`) as today, original `status VOIDED` and `voidReason`,
     `approvedById/Name`, `notes`; stock `RECEIPT` reason `VOID`; card/EcoCash payments reversed as negative payments with
     reference "Reversal of <ref>"; cash from the resolved drawer; audit `RETAIL_SALE.VOIDED`.
   - Ledger `RETAIL_VOID` (existing); fiscal credit note (existing).
   - Response `{ data: { saleNo: "SALE-31866", voidNo: "VOID-0008" } }`.
5. **Other screens**: Sales tabs (Refunds +1, Voids +1, the row's state), the sale record (chips, Lines, Activity), the
   shift (takings, expected cash, Sales tab), Overview takings and payment mix, End of day refunds, Insights › Losses
   (reasons), Stock › Movements (REFUND, VOID, BROKEN), Products › Vouchers (CN-/GV- issued).

### W-42 Lay-by — **Cashier** — starts "The till"

Steps: Customer · Deposit · Pay over time · Collect. Screens: laybys, laybynew, laybypay.

**Code today: missing.**

1. **Start**: Lay-bys › "+ New lay-by" (or the till's "Lay-by" button, FLR-09) → `?sheet=layby-new`: Customer (lookup
   `customer`, quick add name and phone), what is put aside (product lines at today's price), Deposit today and With,
   Pay by, Remind on WhatsApp each week.
   **Server** `POST /api/v2/retail/laybys` (`lib/retail/floor/laybys.ts#startLayby`):
   - Permission `retail.laybys:create` (owner, manager, cashier).
   - Validation: customer live in the company (400 `fieldErrors.cust` "Pick a customer."); with reminders on, the customer has
     a phone (400 `fieldErrors.cust` "Rutendo Banda has no phone number. Add one to send reminders."); 1–50 lines, each a
     sellable product with quantity > 0 and not more than on hand at the site (400 `fieldErrors.lines` "Only 2 Hennessy VS
     700ml, gift box on hand."); deposit ≥ `RetailTillRules.laybyMinDepositPercent` of the total (400 `fieldErrors.dep` "At
     least US$9.20.") and < total (400 "That pays it all. Sell it instead."); pay by after today and within
     `laybyMaxDays` (400 `fieldErrors.due` "Pick a date up to 90 days away."); deposit in cash needs a drawer (decision 2).
   - Writes, one transaction: `RetailLayby` (`LAY-####`, PAYING, site = the person's default site or the till's, `total`,
     `paid = deposit`, `dueOn`, `remindWeekly`), lines at the price the price-list engine gives today (PRD-05
     `priceBasket`, or the shelf price before PRD-05) — "Prices are held at today’s price until the due date." — a
     `RetailLaybyPayment` (DEPOSIT, tender, shift), stock `ISSUE` per line reason `LAYBY_ASIDE` reference `LAY-0032`
     ("Put aside means off the shelf: it no longer shows as available."), the drawer's `expectedCash` when cash; audit
     `RETAIL_LAYBY.STARTED`.
   - Ledger: `RETAIL_LAYBY_PAYMENT` (new) Dr the tender's account (tender mapping) / Cr Lay-by deposits held (2260).
   - Message (when reminders are on): a WhatsApp through SET-07's outbox, template `layby-started`: "LAY-0032 at Harare Bottle
     Store: US$20.00 paid, US$26.00 left to pay by 20 October." (**Defined here**).
2. **Pay over time**: a lay-by row → `?sheet=layby&id=`: Paying now, With, Pay by. **Server** `POST
   /api/v2/retail/laybys/[id]/payments { amount, tender, reference?, dueOn? }` (`retail.laybys:update`): PAYING only (409
   "LAY-0031 is paid already."); 0 < amount ≤ left (400 `fieldErrors.amt` "Only US$26.00 is left."); card/EcoCash
   references per the till rules; cash needs a drawer. Writes a PAYMENT row, `paid += amount`, `dueOn` when changed; when
   `paid = total` → status READY and WhatsApp `layby-ready` "LAY-0031 is paid. Collect it at Harare Bottle Store any time."
   (**Defined here**); audit `RETAIL_LAYBY.PAID`; ledger `RETAIL_LAYBY_PAYMENT`. Changing only the date: `PATCH
   /api/v2/retail/laybys/[id] { dueOn }` (`retail.laybys:update`) → `RETAIL_RECORD.EDITED` "Pay by".
3. **Collect** ("Hand it over", READY, or paying the rest and handing over in one): **Server** `POST
   /api/v2/retail/laybys/[id]/hand-over` (`retail.laybys:update`): READY only (409 "US$26.00 is still to pay."). One
   transaction: a `RetailSale` (SALE, lines from the lay-by at the held prices with VAT from each product, `customerId`,
   payment tender `LAYBY` for the total, shift = the drawer rule's shift when there is one, else none; **no stock movement**
   — the goods left at `LAYBY_ASIDE`), lay-by COLLECTED with `saleId`, `collectedAt`, `collectedById`; audit
   `RETAIL_LAYBY.HANDED_OVER` and `RETAIL_SALE.POSTED`. After commit: `RETAIL_SALE` journal (the `LAYBY` tender maps to
   2260, so the liability becomes revenue, VAT and COGS), `fiscaliseAfterPosting` (the receipt is signed at hand over).
   Response `{ data: { saleNo: "SALE-31871" } }`.
4. **Cancel** (sheet's danger, owner and manager): ConfirmDialog `cancellayby` → `POST /api/v2/retail/laybys/[id]/cancel
   { tender }` (`retail.laybys:delete`): PAYING or READY (409 "LAY-0031 was handed over."). Fee = min(`laybyCancelFee`,
   paid); paid back = paid − fee through the chosen tender (cash → drawer). Writes a REFUND payment row, status CANCELLED,
   `cancelledAt/ById`, `cancelFee`, stock `RECEIPT` per line reason `LAYBY_BACK`; audit `RETAIL_LAYBY.CANCELLED`; ledger
   `RETAIL_LAYBY_CANCEL` (new) Dr 2260 paid / Cr tender paid back / Cr Other income the fee.
5. **Reminders**: the retail worker (`scripts/retail-worker.ts`, SET-01) runs `sendLaybyReminders()` daily at 09:00
   Africa/Harare: PAYING lay-bys with `remindWeekly` whose last reminder (`lastRemindedAt`, or creation) is ≥ 7 days ago →
   WhatsApp `layby-reminder` "Hi Rutendo, LAY-0031 at Harare Bottle Store: US$26.00 left to pay by 20 October."
   (**Defined here**), `lastRemindedAt = now`. Bulk "Remind on WhatsApp" opens the customers area's `message` sheet with
   those customers (CUS:customers).
6. **Other screens**: the Lay-bys badge, Stock › On hand and Movements (Put aside, Back from a lay-by), Sales (the hand-over
   sale, paid with "Lay-by"), Overview (payment mix "Other"; Needs action "Two lay-bys overdue" **Defined here**), End of
   day (lay-by cash in the drawer), the customer record (CUS:customers lists their lay-bys).

### W-43 End of day — **Manager** — starts "Overview, after the last shift" — guided

Steps: All shifts closed · Z-report · Fiscal day closed · Bank the cash. Screens: eod, days.

**Code today: partly** (per-register Z-report generation and reading work; no site day, no checklist, no banking).

1. End of day (panel, or the Overview after the last shift) → `/retail/end-of-day` for today at the person's default site.
   The checklist says what is left; "Close it" and "Sign off" go to W-39 and W-40.
2. **Server** `GET /api/v2/retail/end-of-day?siteId=&date=` builds the page (section 4.5); `POST
   /api/v2/retail/end-of-day/close { siteId, date, banked, slipUrl? }` (`lib/retail/floor/day-close.ts`):
   - Permission `retail.end-of-day:create` (owner, manager).
   - Validation: not closed already (409 "Saturday 3 October is closed already."); no OPEN shift opened that trading day at
     the site (409 "Handheld 1 is still open. Close it first."); every shift that day with a difference has a final
     sign-off (409 "Back till’s US$4.50 is not signed off yet."); `banked` ≥ 0, two decimals (400 `fieldErrors.banked`);
     a bank account exists when banked > 0 (400 "Add a bank account in Posting to the books first."); a date in the past
     or today (400).
   - Writes, one transaction: for each till that traded that day at the site, `generateRetailZReportTransaction(tx, {
     registerCode, businessDate })` (existing, made transaction-aware; idempotent); `RetailDayClose` with the frozen figures
     (takings, refunds, cash difference, cash US$, cash ZiG, tenders, banked, bank account, slip, fiscal day number, Z-report
     ids, `closedAt`, `closedById`); audit `RETAIL_DAY.CLOSED`.
   - Also in the transaction when `banked` > 0: a `BankTransaction` on the bank account (`AccountingSettings.defaultBankAccount`,
     the board's "CBZ current account"): `direction DEBIT`, `amount` banked, `description` "Takings banked, Harare Main Branch,
     3 October", `reference` the day close's id, `sourceType RETAIL_DAY_BANKED`, `sourceId` the day close — so the bank
     reconciliation matches the deposit.
   - After commit: when `RetailFiscalSettings.dayClose = BY_HAND` and the fiscal day is open, SET-08's `closeRetailFiscalDay`
     (sends the Z-report to ZIMRA); ledger `RETAIL_DAY_BANKED` (new) Dr Operating bank (1010) / Cr Cash vault (1005) for
     `banked`.
   - Response `{ data: { closedAt, zReports: [{ id, reportNo, registerName }] } }`; toast "Saturday 3 October closed.
     US$2,610.00 banked to CBZ." (**Defined here**).
3. **Past days** (`/retail/end-of-day/days`) lists closed days and days that traded but were not closed; a row opens that
   day's End of day page read-only with its Z-reports.
4. **Other screens**: Past days, the Shifts list's "Print Z-reports", the Overview (no change), Fiscal settings' fiscal days
   (SET-08), the books (bank).

### W-44 Keep selling offline — **Cashier** — starts "Automatic"

Steps: Till keeps selling · Receipts queue · Sends on reconnect. Screens: overview, tills.

**Code today: works on the till** — `lib/retail/offline-runtime.ts`, `pos-offline-queue.ts` keep selling and queue sales;
`pos/sync` replays them; `fiscaliseAfterPosting` leaves a PENDING `FiscalReceipt` when ZIMRA cannot be reached and the
fiscal worker (`scripts/fiscal-worker.ts`) retries. SET-03/04 add device heartbeats (`RetailDevice.lastSeenAt`) and the
Tills list states; SET-06 flags sales sold offline longer than the rules allow (`reviewReason`).

This spec's part (FLR-08, FLR-01):
- Overview › Tills now shows a till "Offline" when SET-03's `tillState` says OFFLINE ("<cashier> · last seen 13:58").
- Overview › Needs action "Two receipts not yet fiscalised" — `FiscalReceipt` with `retailSaleId` set and status PENDING or
  FAILED; meta "<till> offline since 13:58 · will send on reconnect" when the receipts' till's device is offline, else
  "Waiting for ZIMRA · it retries every few minutes" (**Defined here**); link `/retail/manage/tills`.
- Sales flagged by SET-04/06 (`reviewReason` set, `reviewedAt` null): Needs action "Three sales to look at" (meta the most
  recent reason), the Sales list's Filters › "Flagged", the sale record's chip "To look at" and ⋯ "Mark as looked at"
  (**Defined here**) → `POST /api/v2/retail/sales/[id]/reviewed` (`retail.sell:update`), audit `RETAIL_SALE.REVIEWED`.

### W-51 The morning look (insights area; the screen is this spec's) — **Owner** — starts "Overview"

Steps: Needs action · Yesterday against last week · Tills now. The Overview (section 5.1) is that screen; "Yesterday
against last week" is the Today tile compared with the same weekday last week and the 30-day bars. The insights spec owns
the workflow's wording; nothing else to build.

### W-53 Investigate a loss (insights area) — link into a shift

Insights › Losses links to `/retail/shifts/[id]` and `/retail/sales/[id]`; both are this spec's records. The Shifts list
filter "Cashier" and "Needs sign-off" are what an owner reaches from there.

### Workflows that already work, in one line each

| W | Works today | Missing |
|---|---|---|
| W-37 | Till and back office open a shift for the caller | Open for someone else, till-busy check, ZiG float, float default, the sheet |
| W-38 | Server + till screen | Back-office sheet, approval, requisition, journal |
| W-39 | Close with a total, variance journal | Count by note, ZiG, blind count, explanation rule, float left, to the safe, notification, page |
| W-40 | — | Everything |
| W-41 | Till refund and void services | Back-office sheets, same-day rule, credit note/voucher, write-off, PIN, reasons from rules |
| W-42 | — | Everything |
| W-43 | Z-report per register | Site day, checklist, banking, fiscal check, Past days |
| W-44 | Offline selling, queue, retry | Overview surfacing, flagged sales |

---
## 3. Data

### 3.1 Models used

| Model | Used for | Owner of changes |
|---|---|---|
| `RetailShift` | Shifts, the shift record, count and close, sign-off, Tills now, End of day | this spec (fields below); SET-04 adds `registerId`, `deviceId` |
| `RetailCashMovement` | Cash in and out, the count page, the Z-report | this spec (approval, requisition) |
| `RetailSale`, `RetailSaleLine`, `RetailSalePayment` | Sales, the sale record, refunds, voids, lay-by hand over, every takings figure | this spec (`customerId`, approval, `restocked`); SET-04 (`registerId`, `reviewReason`…), PRD-05/08/09/10 (line price list, bundles, promotions, vouchers) |
| `RetailZReport` | Z-reports per till per day, generated by Close the day | unchanged schema |
| `RetailRegister`, `RetailDevice` | Tills now, the till lookup, offline state | SET-03 |
| `RetailTillRules` | Refund and void approval, reasons, lay-by rules | SET-06; this spec adds three lay-by columns |
| `RetailTillPin` | Manager approval by PIN | existing; read through STK-04's `lib/retail/manager-pin.ts` |
| `RetailPaymentSettings`, `CurrencyRate` | Which tenders and whether ZiG cash; today's ZiG rate | SET-05 |
| `RetailFiscalSettings`, `FiscalDay`, `FiscalReceipt` | Fiscal chips, receipts not fiscalised, the fiscal day on End of day | SET-08 (settings); existing |
| `RetailMessage` | WhatsApp receipts and lay-by messages | SET-07 |
| `RetailVoucher` | Credit notes and vouchers from refunds | PRD-10 |
| `StockMovement` (`reason`, `reference`) | Refund/void restock, damaged write-off, lay-by put aside and back | STK-01; this spec adds two reasons |
| `InventoryItem`, `Product` | Lines, on hand, stock to reorder (`stockLevel()`, STK-01) | stock, products |
| `Customer` | Sale customer, lay-by customer, credit notes | CUS:customers |
| `CrmRequisition` | "Pay a supplier" from the drawer | BUY:requisitions |
| `RetailPurchaseOrder`, `RetailPromotion` | Overview Needs action (due today, ending tomorrow) | buying, products |
| `User`, `Site` | People, sites | existing; ADM, SET-02 |
| `PlatformAuditEvent` | Activity tabs, "Last opened", no-sale opens | FND-RECORD index |
| `ApprovalAction` | Cash-up and sign-off approvals | existing |
| `Notification` | Differences, sign-offs, messages to the cashier | existing |
| `JournalEntry` via `lib/accounting` | Every posting below | existing |
| `RetailLayby`, `RetailLaybyLine`, `RetailLaybyPayment` | Lay-bys | **new** (3.2.5) |
| `RetailDayClose` | End of day, Past days | **new** (3.2.6) |

### 3.2 Schema changes, by migration

Each migration ships in its unit's commit with its witness test, is applied with `npx prisma migrate deploy` and again
with `set -a; . ./.env; set +a; DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy`. Never `prisma db push`.
Enum values added with `ALTER TYPE … ADD VALUE` are not used inside the same migration (Postgres refuses a new value in the
transaction that adds it).

#### 3.2.1 `20261004135000_retail_sale_floor` (FLR-01) · witness `lib/retail/sale-floor-migration.test.ts`

```prisma
model RetailSale {
  // … existing (and SET-04's registerId, deviceId, printedAt, reviewReason, reviewedAt, reviewedById) …
  /// The customer the sale was rung for, when one was. `customerName` stays as the printed name.
  customerId     String?
  /// Who approved a refund or a void: the manager whose PIN was typed, or the signed-in manager who did it.
  approvedById   String?
  approvedByName String?
  /// Refunds only: false when the goods were written off instead of going back on the shelf.
  restocked      Boolean   @default(true)

  customer   Customer? @relation("RetailSaleCustomer", fields: [customerId], references: [id], onDelete: SetNull, onUpdate: Cascade)
  approvedBy User?     @relation("RetailSaleApprovedBy", fields: [approvedById], references: [id], onDelete: SetNull, onUpdate: Cascade)

  @@index([companyId, customerId])
  @@index([companyId, saleType, postedAt])
}

model Customer {
  // … existing …
  retailSales RetailSale[] @relation("RetailSaleCustomer")
}

model User {
  // … existing …
  retailSalesApproved RetailSale[] @relation("RetailSaleApprovedBy")
}
```

SQL after the DDL: backfill `customerId` where exactly one active `Customer` of the same company has `name = customerName`;
backfill `approvedByName` from `overrideReason` text "… (approved by <name>)" (the password-override era) and strip that
suffix from `overrideReason`. Witness: the three columns with types and defaults, both indexes, both FKs with `ON DELETE SET
NULL`, and on a fixture (two customers, one with a unique name) that only the unique name was linked.

Code with it (no schema): `lib/id-generator.ts` — `RETAIL_SALE` prefix `SALE`, five digits, company-wide (`requiresSiteId:
false`); new `RETAIL_REFUND` (`RFD`, four digits, company-wide) and `RETAIL_VOID` (`VOID`, four digits, company-wide); the
first-use scan reads `RetailSale.saleNo` with that prefix. The config gains a `pad` per entity (`buildCode` already takes
`padWidth`). Existing rows keep their numbers.

#### 3.2.2 `20261004135100_retail_shift_floor` (FLR-03) · witness `lib/retail/shift-floor-migration.test.ts`

```prisma
model RetailShift {
  // … existing …
  /// The ZiG counted into the drawer at opening. `expectedCash` includes it at the day's rate.
  openingFloatZig Decimal @default(0) @db.Decimal(14, 2)
}

model RetailCashMovement {
  // … existing …
  /// The manager who approved it: the signed-in manager, or the one whose PIN was typed.
  approvedById   String?
  approvedByName String?
  /// "Pay a supplier": the requisition paid from the drawer.
  requisitionId  String?

  approvedBy  User?           @relation("RetailCashMovementApprovedBy", fields: [approvedById], references: [id], onDelete: SetNull, onUpdate: Cascade)
  requisition CrmRequisition? @relation("RetailCashMovementRequisition", fields: [requisitionId], references: [id], onDelete: SetNull, onUpdate: Cascade)

  @@index([requisitionId])
}

enum AccountingSourceType {
  // … existing …
  RETAIL_CASH_MOVEMENT
  RETAIL_PETTY_CASH
}

enum NotificationType {
  // … existing …
  RETAIL_STAFF_MESSAGE
}

enum NotificationEntityType {
  // … existing …
  RETAIL_SHIFT
}
```

Witness: the column and default, the three cash-movement columns and FKs, the index, the enum values present.

Code with it: `lib/id-generator.ts` `RETAIL_SHIFT` prefix `SH`, five digits, company-wide.

#### 3.2.3 `20261004135200_retail_shift_count` (FLR-04) · witness `lib/retail/shift-count-migration.test.ts`

```prisma
model RetailShift {
  // … existing …
  /// Who pressed "Close the shift" (the cashier, or a manager for them).
  closedById  String?
  /// The count, by currency, as typed: US$ notes and ZiG notes.
  countedUsd  Decimal? @db.Decimal(14, 2)
  countedZig  Decimal? @db.Decimal(14, 2)
  /// ZiG per US$1 used to add the two together ("Counted, ZiG at 26.80").
  countRate   Decimal? @db.Decimal(12, 4)
  /// { USD: [{ denomination: "20", count: 2 }], ZWG: [...] } — only the rows typed.
  countLines  Json?
  /// "What happened". Needed when the drawer is out by more than US$1.00; the reason when closed without a count.
  closeNote   String?
  /// "Float left for tomorrow": the next shift on this till starts from it.
  floatLeft   Decimal? @db.Decimal(14, 2)
  /// What went to the safe at close: counted − float left.
  toSafe      Decimal? @db.Decimal(14, 2)

  closedBy User? @relation("RetailShiftClosedBy", fields: [closedById], references: [id], onDelete: SetNull, onUpdate: Cascade)
}

enum AccountingSourceType {
  // … existing …
  RETAIL_SHIFT_CLOSE
}

enum NotificationType {
  // … existing …
  RETAIL_SHIFT_DIFFERENCE
}
```

SQL: backfill closed shifts `countedUsd = countedCash`, `countRate = 1`, `closeNote = notes` where the shift was closed with
notes. Witness: the eight columns, the FK, the enum values; on a fixture, a closed shift's `countedUsd` equals its
`countedCash`.

#### 3.2.4 `20261004135300_retail_shift_sign_off` (FLR-05) · witness `lib/retail/shift-sign-off-migration.test.ts`

```prisma
/// What a manager decided about a drawer that did not balance.
enum RetailShiftSignOff {
  /// "Accept it": written off to Cash over short (posted at close).
  ACCEPT
  /// "Recover from the cashier": owed by the cashier.
  RECOVER
  /// "Look into it": stays on the overview and keeps the day open.
  LOOK_INTO
}

model RetailShift {
  // … existing …
  signOffOutcome RetailShiftSignOff?
  signedOffAt    DateTime?
  signedOffById  String?
  signOffNote    String?
  /// RECOVER: the shortage the cashier owes.
  recoverAmount  Decimal? @db.Decimal(14, 2)

  signedOffBy User? @relation("RetailShiftSignedOffBy", fields: [signedOffById], references: [id], onDelete: SetNull, onUpdate: Cascade)

  @@index([companyId, status, signOffOutcome])
}

enum AccountingSourceType {
  // … existing …
  RETAIL_SHIFT_RECOVERY
}

enum NotificationType {
  // … existing …
  RETAIL_SHIFT_SIGNED_OFF
}
```

SQL: closed shifts with a non-zero variance (or no count) closed more than seven days before the migration get `signOffOutcome
= 'ACCEPT'`, `signedOffAt = "closedAt"` (history before sign-off existed is treated as accepted, so the Overview shows this
week's). Witness: the enum and its three values, the columns, the index, and the backfill rule on a fixture (an 8-day-old
short shift accepted, a 2-day-old one left).

#### 3.2.5 `20261004135400_retail_laybys` (FLR-06) · witness `lib/retail/laybys-migration.test.ts`

Depends on STK-01 (`StockMovementReason`) and SET-05/SET-06 (`RetailTenderType` rewrite, `RetailTillRules`) being migrated.

```prisma
enum RetailLaybyStatus {
  /// Deposit taken, paying over time.
  PAYING
  /// Paid in full, waiting to be collected ("Ready to collect").
  READY
  /// Handed over; `saleId` is the sale.
  COLLECTED
  /// Cancelled; paid back less the fee, goods back on the shelf.
  CANCELLED
}

enum RetailLaybyPaymentKind {
  DEPOSIT
  PAYMENT
  /// Money paid back when it was cancelled (negative amount).
  REFUND
}

/// Goods put aside for a customer who pays over time. "LAY-0031".
model RetailLayby {
  id             String            @id @default(uuid())
  companyId      String
  laybyNo        String
  siteId         String
  customerId     String
  status         RetailLaybyStatus @default(PAYING)
  /// Held at the price on the day it started.
  total          Decimal           @db.Decimal(14, 2)
  /// Σ deposits and payments, kept on the row for the list.
  paid           Decimal           @default(0) @db.Decimal(14, 2)
  /// "Pay by".
  dueOn          DateTime          @db.Date
  /// "Remind on WhatsApp each week".
  remindWeekly   Boolean           @default(true)
  lastRemindedAt DateTime?
  createdById    String
  collectedAt    DateTime?
  collectedById  String?
  /// The sale made when it was handed over.
  saleId         String?           @unique
  cancelledAt    DateTime?
  cancelledById  String?
  /// What was kept when it was cancelled (Till rules' lay-by fee, at most what was paid).
  cancelFee      Decimal?          @db.Decimal(14, 2)
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  company     Company              @relation(fields: [companyId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  site        Site                 @relation(fields: [siteId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  customer    Customer             @relation("RetailLaybyCustomer", fields: [customerId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  createdBy   User                 @relation("RetailLaybyCreatedBy", fields: [createdById], references: [id], onDelete: Restrict)
  collectedBy User?                @relation("RetailLaybyCollectedBy", fields: [collectedById], references: [id], onDelete: SetNull)
  cancelledBy User?                @relation("RetailLaybyCancelledBy", fields: [cancelledById], references: [id], onDelete: SetNull)
  sale        RetailSale?          @relation("RetailLaybySale", fields: [saleId], references: [id], onDelete: SetNull)
  lines       RetailLaybyLine[]
  payments    RetailLaybyPayment[]

  @@unique([companyId, laybyNo])
  @@index([companyId, status, dueOn])
  @@index([customerId])
}

model RetailLaybyLine {
  id              String   @id @default(uuid())
  companyId       String
  laybyId         String
  productId       String
  /// The stock line the goods left (the site's InventoryItem).
  inventoryItemId String
  itemName        String
  quantity        Decimal  @db.Decimal(12, 4)
  unitPrice       Decimal  @db.Decimal(14, 2)
  lineTotal       Decimal  @db.Decimal(14, 2)
  /// The price list the price came from (PRD-05), when there is one.
  priceListId     String?
  createdAt       DateTime @default(now())

  company       Company       @relation(fields: [companyId], references: [id], onDelete: Cascade)
  layby         RetailLayby   @relation(fields: [laybyId], references: [id], onDelete: Cascade)
  product       Product       @relation("RetailLaybyLineProduct", fields: [productId], references: [id], onDelete: Restrict)
  inventoryItem InventoryItem @relation("RetailLaybyLineItem", fields: [inventoryItemId], references: [id], onDelete: Restrict)

  @@index([laybyId])
  @@index([companyId, productId])
}

model RetailLaybyPayment {
  id           String                 @id @default(uuid())
  companyId    String
  laybyId      String
  kind         RetailLaybyPaymentKind
  tenderType   RetailTenderType
  /// Positive for money in, negative for money paid back.
  amount       Decimal                @db.Decimal(14, 2)
  currency     String                 @default("USD")
  exchangeRate Decimal                @default(1) @db.Decimal(12, 4)
  baseAmount   Decimal                @db.Decimal(14, 2)
  reference    String?
  /// The drawer cash went in or out of.
  shiftId      String?
  receivedById String
  createdAt    DateTime               @default(now())

  company    Company      @relation(fields: [companyId], references: [id], onDelete: Cascade)
  layby      RetailLayby  @relation(fields: [laybyId], references: [id], onDelete: Cascade)
  shift      RetailShift? @relation("RetailLaybyPaymentShift", fields: [shiftId], references: [id], onDelete: SetNull)
  receivedBy User         @relation("RetailLaybyPaymentReceivedBy", fields: [receivedById], references: [id], onDelete: Restrict)

  @@index([laybyId, createdAt])
  @@index([companyId, shiftId])
}

enum RetailTenderType {
  // … SET-05's values …
  /// Paid by a lay-by's deposits at hand over. Maps to Lay-by deposits held.
  LAYBY
}

enum StockMovementReason {
  // … STK-01's values …
  /// Put aside for a lay-by: off the shelf, still the shop's.
  LAYBY_ASIDE
  /// A cancelled lay-by's goods back on the shelf.
  LAYBY_BACK
}

model RetailTillRules {
  // … SET-06's columns …
  /// "At least 20%": the smallest deposit, as a percentage of the total.
  laybyMinDepositPercent Decimal @default(20) @db.Decimal(5, 2)
  /// Kept when a lay-by is cancelled ("less any fee in Till rules"). US$0.00 keeps nothing.
  laybyCancelFee         Decimal @default(0) @db.Decimal(14, 2)
  /// The longest "Pay by" from the day it starts.
  laybyMaxDays           Int     @default(90)
}

enum AccountingSourceType {
  // … existing …
  RETAIL_LAYBY_PAYMENT
  RETAIL_LAYBY_CANCEL
}
```

Back-relations on `Company`, `Site`, `Customer`, `User`, `Product`, `InventoryItem`, `RetailShift`, `RetailSale` as named
above. Code with it: `lib/id-generator.ts` `RETAIL_LAYBY` (`LAY`, four digits, company-wide). Witness: the two enums and their
values, the three tables with their unique and indexes, the new enum values on the three existing enums, the till-rules
columns and defaults (20.00, 0.00, 90).

#### 3.2.6 `20261004135500_retail_day_close` (FLR-07) · witness `lib/retail/day-close-migration.test.ts`

```prisma
/// One site's trading day, closed. Frozen like a Z-report: figures are written once and never recomputed.
model RetailDayClose {
  id            String   @id @default(uuid())
  companyId     String
  siteId        String
  /// The trading day (Africa/Harare), as a bare date. Shifts belong to the day they were opened.
  businessDate  DateTime @db.Date
  takings       Decimal  @db.Decimal(14, 2)
  /// Positive magnitude of the day's refunds.
  refunds       Decimal  @db.Decimal(14, 2)
  /// Σ the day's shift differences (negative is short).
  cashDifference Decimal @db.Decimal(14, 2)
  /// The day's cash in US$ notes and in ZiG notes, net of change and refunds.
  cashUsd       Decimal  @db.Decimal(14, 2)
  cashZig       Decimal  @db.Decimal(14, 2)
  /// [{ tender, label, currency, amount }] — the "How people paid" row as it stood.
  tenders       Json
  banked        Decimal  @db.Decimal(14, 2)
  /// The account it was paid into (`AccountingSettings.defaultBankAccount` when closed).
  bankAccountId String?
  /// The deposit slip photo.
  slipUrl       String?
  /// The ZIMRA fiscal day closed for this day, when the shop fiscalises.
  fiscalDayNo   Int?
  /// The Z-reports generated by closing it.
  zReportIds    String[]
  closedAt      DateTime @default(now())
  closedById    String
  closedByName  String

  company     Company      @relation(fields: [companyId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  site        Site         @relation(fields: [siteId], references: [id], onDelete: Restrict, onUpdate: Cascade)
  bankAccount BankAccount? @relation("RetailDayCloseBankAccount", fields: [bankAccountId], references: [id], onDelete: SetNull)
  closedBy    User         @relation("RetailDayCloseClosedBy", fields: [closedById], references: [id], onDelete: Restrict)

  /// One close per site per day.
  @@unique([companyId, siteId, businessDate])
  @@index([companyId, businessDate])
}

enum AccountingSourceType {
  // … existing …
  RETAIL_DAY_BANKED
}
```

Back-relations on `Company`, `Site`, `BankAccount` (`retailDayCloses`) and `User` (`retailDaysClosed`). Witness: the table,
the unique (inserting a second close for the same site and day fails), the index, the enum value.

### 3.3 Permissions (`lib/retail/permissions.ts`)

| Resource | Owner `SUPERADMIN` | Manager `MANAGER`, `SHOP_MANAGER` | Cashier | Stock clerk | Bookkeeper `FINANCE_OFFICER` |
|---|---|---|---|---|---|
| `retail.laybys` (new; label "lay-bys") | ALL | ALL | view, create, update | – | view |
| `retail.end-of-day` (new; label "the end of day") | ALL | ALL | – | – | view |
| `retail.cash-control` (changed) | ALL | ALL | – | – | **view** (new grant) |
| `retail.reports` (changed, if the insights spec has not) | ALL | ALL | – | – | **view** |
| `retail.sell` | as SET-06 (cashier gains `refund`, `void`, limited by the till rules) | | | | |

Uses: `retail.sell:approve` = approves refunds and voids (decision 3); `retail.cash-control:approve` = approves cash moves and
signs off drawers; `retail.cash-control:close-shift` = closes another's drawer and closes without counting;
`retail.cash-control:open-shift` = opens a shift for someone else. List sources read with any of
`[retail.sell:view, retail.cash-control:view]`, so the bookkeeper reads sales and shifts without the till's grants.
`lib/retail/route-guard-coverage.test.ts` gains every new route; `lib/retail/permissions.test.ts` gains the rows above.

### 3.4 Audit events (`lib/retail/audit.ts`, `RETAIL_AUDIT_EVENTS`) and Activity sentences

Existing events gain payload fields as noted in section 2. New:

| Constant | Event | Entity | Payload | Activity sentence (`lib/retail/activity-words.ts`) | Tone |
|---|---|---|---|---|---|
| `shiftSignedOff` | `RETAIL_SHIFT.SIGNED_OFF` | `RetailShift` | `{ outcome, amount, note }` | "Signed off: accepted −US$7.15" / "Signed off: US$20.00 to recover" / "Being looked into" | `ok` / `warn` / `warn` |
| `shiftMessaged` | `RETAIL_SHIFT.MESSAGED` | `RetailShift` | `{ to, body }` | "Messaged Chipo Dube" | `hollow` |
| `saleReprinted` | `RETAIL_SALE.REPRINTED` | `RetailSale` | `{ copy: true }` | "Printed a copy of the receipt" | `hollow` |
| `saleSent` | `RETAIL_SALE.SENT` | `RetailSale` | `{ to }` (number masked to the last 4) | "Sent the receipt on WhatsApp to ••• 3388" | `hollow` |
| `saleReviewed` | `RETAIL_SALE.REVIEWED` | `RetailSale` | `{ reason }` | "Looked at: <reason>" | `ok` |
| `laybyStarted` | `RETAIL_LAYBY.STARTED` | `RetailLayby` | `{ total, deposit, dueOn }` | "Started with a deposit of US$20.00" | `info` |
| `laybyPaid` | `RETAIL_LAYBY.PAID` | `RetailLayby` | `{ amount, tender, left }` | "Took US$13.00 by EcoCash, US$13.00 left" | `ok` |
| `laybyHandedOver` | `RETAIL_LAYBY.HANDED_OVER` | `RetailLayby` | `{ saleNo }` | "Handed over as SALE-31871" | `ok` |
| `laybyCancelled` | `RETAIL_LAYBY.CANCELLED` | `RetailLayby` | `{ paidBack, fee }` | "Cancelled, US$18.00 paid back" | `bad` |
| `dayClosed` | `RETAIL_DAY.CLOSED` | `RetailDayClose` | `{ siteId, businessDate, takings, banked }` | "Closed the day, US$2,610.00 banked" | `ok` |

Sentences for existing events used on these records (`RETAIL_SHIFT.OPENED`, `.CLOSED`, `RETAIL_CASH.MOVED`,
`RETAIL_SALE.POSTED/REFUNDED/VOIDED`) are foundations 5.6.9's; `RETAIL_SHIFT.CLOSED` with `uncounted` reads "Closed without a
count: <reason>" (`warn`). `lib/retail/audit.test.ts` asserts the full list.

### 3.5 Notifications (`emitRetailNotification`, `lib/notifications.ts`)

| Type | To | Title | Summary | Link | Severity |
|---|---|---|---|---|---|
| `RETAIL_SHIFT_DIFFERENCE` | owners and managers except the person who closed it | "SH-00242 is short US$4.50" / "SH-00242 is over US$3.17" / "SH-00240 closed without a count" | "Front till · Chipo Dube. Sign it off on the overview." | `/retail/shifts/<id>?sheet=sign-off` | WARNING |
| `RETAIL_SHIFT_SIGNED_OFF` | the shift's cashier | "SH-00239 signed off" | "US$20.00 to be recovered. <note>" / "US$20.00 written off. <note>" / "Being looked into. <note>" | `/retail/shifts/<id>` | INFO (WARNING for RECOVER) |
| `RETAIL_STAFF_MESSAGE` | the shift's cashier | "Message from Tafara Nyathi" | the message | `/retail/shifts/<id>` | INFO |

Entity type `RETAIL_SHIFT`. The cashier reads these in the account menu's notifications (FND-SHELL) and on the till
(FLR-09 shows unread ones on the lock screen).

### 3.6 Ledger (`lib/accounting/defaults.ts`, `lib/accounting/source-types.ts`)

New chart accounts in `BASE_CHART_OF_ACCOUNTS` (existing tenants get them from `ensureAccountingDefaults`, which the seed
calls): `1150` "Staff owe the shop" (ASSET, Receivables), `2260` "Lay-by deposits held" (LIABILITY, Payables), `5110` "Petty
cash" (EXPENSE, Operations). New fallback rules in `RETAIL_POSTING_RULES` (labels in `source-types.ts`; SET-09 may move fixed
accounts to roles — these stay fixed unless that spec lists them):

| Source type | Subtype / direction | Lines |
|---|---|---|
| `RETAIL_CASH_MOVEMENT` | DROP | Dr 1005 Cash vault / Cr 1000 Till cash |
| | TOP_UP (`invertDirection`) | Dr 1000 / Cr 1005 |
| `RETAIL_PETTY_CASH` | — | Dr 5110 Petty cash / Cr 1000 |
| `RETAIL_SHIFT_CLOSE` | — | Dr 1005 / Cr 1000 (to the safe) |
| `RETAIL_SHIFT_RECOVERY` | — | Dr 1150 Staff owe the shop / Cr 5420 Cash over short |
| `RETAIL_LAYBY_PAYMENT` | — | Dr tender (`TENDER_MAPPING`) / Cr 2260 |
| `RETAIL_LAYBY_CANCEL` | — | Dr 2260 (`valuePath: "paid"`) / Cr tender (`valuePath: "paidBack"`) / Cr 4200 Other income (`valuePath: "fee"`) |
| `RETAIL_DAY_BANKED` | — | Dr 1010 Operating bank / Cr 1005 (the `BankTransaction` on the bank account carries the same source for reconciliation) |

Tender mapping default: `LAYBY` → 2260 (the seed pack and SET-09's posting page list it as "Lay-by"). Existing rules
unchanged: `RETAIL_SHIFT_OPEN`, `RETAIL_SHIFT_VARIANCE`, `RETAIL_SALE`, `RETAIL_REFUND`, `RETAIL_VOID`,
`RETAIL_STOCK_ADJUSTMENT`. With SET-09's "At the end of each day" schedule these capture PENDING like every retail source.

### 3.7 Words (`lib/retail/words.ts`)

`tenderLabel` adds "Lay-by"; `paidWithLabel(payments)` → "Cash", "ZiG" (cash in ZWG), "EcoCash", "Card", "Cash and EcoCash"
(two), "3 ways" (three or more); `cashMovementWhy(type, reasonCode)` → "Drop to the safe", "Pay a supplier", "Petty cash",
"Float top-up" (other reason codes keep their existing labels); `shiftStateLabel` → "Open", "Short", "Over", "Not counted",
"Balanced"; `laybyStateLabel(layby, today)` → "Paying", "Due in 3 days" (due within 7 days), "Due today", "Overdue",
"Ready to collect", "Collected", "Cancelled".

### 3.8 Seed and demo data (`scripts/seed-retail-demo.ts`)

One idempotent function per unit, called from `main()` after foundations' sites, tills and shift history (FND 3.4) and
setup's tills, devices, rates and fiscal days (SET 3.7). Run: `pnpm tsx scripts/seed-retail-demo.ts --slug hurudza-creative
--days 160 --reset`. Times are written as offsets from the run so the fixture reads the same whenever it runs; below they
are shown for a run at 14:42 on Saturday 3 October 2026. People: Tendai Mhlanga (owner), Tafara Nyathi (manager), Chipo Dube
and Farai Moyo (cashiers) exist; Kuda Banda and Rudo Moyo come from the admin seed (used only if present).

| Unit | Seed |
|---|---|
| FLR-01 | Sales history renumbered `SALE-#####` so the last sale of the run is `SALE-31870` and every earlier one counts down; about 130 sales a trading day across the 160 days (Friday and Saturday heavier, baskets around US$9), on the tills of the shift they belong to; refunds `RFD-####` from 1 upwards at about 1 in 60 sales; voided sales `VOID-####` at about 1 in 200. Customers added with phones: Farai Chikore `+263 77 509 1144`, Tinashe Mavhunga `+263 71 330 8826`, and phones for the existing eight (Tapiwa Marange `+263 77 412 3388`, Nyasha Gwenzi `+263 71 220 9014`, Rutendo Banda `+263 78 301 5521`, the rest any valid number). `customerId` set on every named sale. The board's six rows, today: `SALE-31870` 12:10 Front till, Chipo Dube, walk-in, 13 items, EcoCash, US$23.40; `SALE-31869` 12:02 Back till, Farai Moyo, Tapiwa Marange, 6 items, cash, US$9.30; `RFD-0044` 11:51 Front till, Chipo Dube, Nyasha Gwenzi, 1 × Jameson Irish Whiskey 750ml, cash, −US$27.90, reason "Changed mind", of a sale she made at 10:20; `SALE-31866` 11:40 Front till, Chipo Dube, walk-in, Johnnie Walker Black 750ml 1 × US$42.00 and Ice 2kg bag 1 × US$2.20, card US$44.20 reference `CBZ 4412 0988`, `idCheckedAt` 11:39, its `FiscalReceipt` SUCCESS `FDMS 0441-2209 / 31866` on fiscal day 214; `SALE-31862` 11:12 Front till, Chipo Dube, walk-in, 4 items, cash, US$13.00; `SALE-31858` 10:58 Back till, Farai Moyo, walk-in, 1 × Castle Lager 340ml, cash, US$1.20, voided ("Rang up wrong", approved by Tafara Nyathi). (The board shows Kuda Banda on the Back till; this seed keeps the Back till on Farai Moyo's open shift — see Open questions.) |
| FLR-03 | Open shifts at the run: Front till, Chipo Dube, opened 07:58, float US$200.00, one drop to the safe US$20.00 at 10:04 approved by Tafara Nyathi; Back till, Farai Moyo, opened 52 hours before the run (`SH-00240`-style number in sequence), float US$100.00, 11 sales US$72.95 on it; Handheld 1, Tendai Mhlanga, opened 10:05, float US$0.00, 40 sales US$369.50, its device last seen 44 minutes before the run (Offline). Shift numbers continue the `SH-#####` sequence so the Front till's is the highest. Cash movements on about one shift in four in the history (drops of US$100–US$300, approved by Tafara Nyathi). |
| FLR-04 | Every closed shift in the history gets a count: `countLines` that add up to its counted cash (US$ notes greedy, the last few dollars as US$1), `countRate` the day's rate, `floatLeft` US$100.00, `toSafe` counted − 100. Three closed without a count (FND seed's), with `closeNote` "Device lost, counted next morning". |
| FLR-05 | This week (Monday to the run): every closed shift balanced except three short and not signed off — Chipo Dube −US$7.15 (Wednesday), Farai Moyo −US$8.14 (Thursday), Chipo Dube −US$0.50 (Friday) — so the Overview reads "Three drawers short this week · Chipo Dube twice, Farai Moyo once · −US$15.79". Wednesday 30 September: a Front till shift by Chipo Dube counted US$412.50 against US$432.50, signed off RECOVER by Tafara Nyathi with "Chipo says a US$20 note went out as change for a US$10. Agreed to recover." Older differences: ACCEPT by Tafara Nyathi. |
| FLR-06 | Products added if missing: "Hennessy VS 700ml, gift box" (Spirits, US$46.00, cost US$36.50, 3 on hand), "Savanna Dry 330ml, case of 24" (Ciders and coolers, US$28.20, case of Savanna Dry 330ml). Lay-bys at Harare Main Branch: `LAY-0031` Rutendo Banda, 1 × Hennessy VS 700ml, gift box, total US$46.00, deposit US$20.00 cash, pay by run + 17 days, PAYING; `LAY-0030` Farai Chikore, 4 × Castle Lager case of 24 at US$26.50 and 2 × Savanna Dry 330ml, case of 24 at US$28.20 (US$162.40), deposit US$40.00 and a payment of US$60.00 EcoCash, pay by run + 14 days, PAYING; `LAY-0028` Nyasha Gwenzi, 1 × Johnnie Walker Black 750ml US$42.00, paid in full, READY; `LAY-0027` Tinashe Mavhunga, 2 × Amarula Cream 750ml at US$18.25 (US$36.50), US$10.00 paid, pay by run + 3 days, PAYING. Done: `LAY-0016`…`LAY-0026` and `LAY-0029` — ten COLLECTED over the last four months (each with its hand-over sale paid "Lay-by") and two CANCELLED (`LAY-0019`, `LAY-0029`, fee US$0.00). Tabs read Paying 3 · Ready to collect 1 · Done 12 · All 16, as on the board. Stock movements `LAYBY_ASIDE` for every line, `LAYBY_BACK` for the cancelled ones. |
| FLR-07 | For every past trading day of the 160 at each site, run the close-day service (Z-reports, fiscal day, `RetailDayClose`) with `banked` = that day's cash in US$ and the slip absent, closed at 22:00 by Tafara Nyathi — except the day the Back till's open shift belongs to (52 hours before the run), which stays "Not closed". A bank account `BankAccount { name: "CBZ current account", bankName: "CBZ", currency: "USD" }` set as `AccountingSettings.defaultBankAccountId` when the tenant has no default. |
| FLR-08 | Two sales of Handheld 1's shift today with `FiscalReceipt` PENDING ("Two receipts not yet fiscalised"). Nothing else: purchase orders due today, promotions ending tomorrow and low stock come from the buying, products and stock seeds. |

---
## 4. API

Conventions are foundations section 4's (session, permission, `successResponse`/`errorResponse`, 400 with `fieldErrors`
keyed by the sheet's field ids, 403 "Your role cannot <verb> <noun>", 404 "<Noun> not found", 409 with a sentence the UI
shows as is). Money on the wire is a string with two decimals ("42.00"); dates "YYYY-MM-DD" or ISO date-times; `approver`
is always `{ userId: uuid, pin: string /* 4 digits */ }` and is checked by STK-04's `verifyManagerPin` (400
`fieldErrors.pin` "That PIN is not right."; 429 `{ error: "Too many tries. Try again in 15 minutes." }`; when needed and
absent 409 `{ error: "<sentence>", needsApprover: true }`). Paths below are under `/api/v2/retail` unless they start with
`/api/v2/reports`.

### 4.1 Overview

**`GET /overview?period=today|week|month&siteId=<uuid|all>`** (new; `retail.reports:view`; 403 otherwise). Default period
`today`, default site the caller's default site (`getRetailSetupProfile(companyId).defaultSiteId`, or `all` when the company
has one site). Tiles the caller cannot see are absent (cost: `retail.catalog:view-cost` for the margin tile and the rank
list's margin; nothing else is cost-gated).

```ts
type OverviewResponse = {
  period: "today" | "week" | "month";
  site: { id: string; name: string } | null;          // null = all sites
  sites: Array<{ id: string; name: string }>;         // for the Site chip
  updatedAt: string;                                  // ISO; the "Live · Saturday 3 October 2026 · 14:42" line
  tiles: {
    takings: {                                        // hero
      label: "Takings today" | "Takings this week" | "Takings this month";
      value: string;                                  // "1284.60"
      against: { value: string; deltaPct: number | null; label: string }; // "on last Saturday by this hour"
      axis: string[];                                 // today: the site's hours "07:00" … "19:00" (5 labels); week: Mon…Sun; month: 1 … 31 (5 labels)
      series: number[];                               // per hour / per day, up to now
      compare: number[];                              // same weekday last week / last week / last month, the whole span
      legend: [string, string];                       // ["Today", "Last Saturday"] | ["This week", "Last week"] | ["This month", "Last month"]
    };
    sales:   { value: number; delta: number | null; deltaLabel: string; bars: number[] };   // bars: last 7 days, oldest first
    basket:  { value: string; delta: string | null; deltaLabel: string; bars: number[] };
    margin?: { valuePct: number; deltaPts: number | null; deltaLabel: string; bars: number[] };
    needsAction: Array<{
      key: "stale-shift" | "short" | "over" | "uncounted" | "low-stock" | "not-fiscalised" | "flagged-sales"
         | "order-due" | "promotion-ending" | "laybys-overdue";
      tone: "warn" | "bad" | "info";
      title: string; meta: string; figure: string; figureTone: "ink" | "bad" | "warn";
      href: string;
    }>;
    tillsNow: Array<{
      id: string; name: string;
      state: "OPEN" | "STALE" | "OFFLINE" | "CLOSED";
      stateLabel: string;                             // "Open" | "Open 52h" | "Offline" | "Closed"
      meta: string;                                   // "Chipo Dube · since 07:58 · float US$200.00"
      takings: string; sales: number;
      href: string;                                   // the open shift, else the till's last shift
    }>;
    byDay: { total: string; days: Array<{ date: string; label: string; value: string; sales: number }> }; // 30, oldest first
    paid: Array<{ key: "cash" | "ecocash" | "card" | "zig" | "other"; name: string; value: string; share: number }>;
    topProducts: Array<{ productId: string; name: string; takings: string; qtyLabel: string; pct: number }>;   // ≤5
    toReorder: Array<{ productId: string; name: string; onHandLabel: string; meta: string; pct: number; low: boolean }>; // ≤5
    cashiers: Array<{ userId: string; name: string; takings: string; meta: string; pct: number }>;          // this week
  };
};
```

Rules (all in `lib/retail/floor/overview.ts`, pure functions over loaded rows, unit-tested):
- **Window**: today = the trading day so far; week = Monday to now; month = the 1st to now (Africa/Harare). "Against": today
  vs the same weekday last week up to the same time ("on last Saturday by this hour (US$1,187.20)"); week vs last week up to
  the same weekday and time ("on last week by now"); month vs last month up to the same day ("on last month by now").
  `deltaPct` null when the comparison is zero (the line then reads "Nothing to compare with yet").
- **Takings** per decision 10, base currency, the site (or all). Sparkline: per hour across the site's hours for that weekday
  (`Site` hours from SET-02, else the shop profile's licence hours, else 07:00–19:00); today's line stops at the current hour.
- **Sales** = count of SALE documents still POSTED in the window; **basket** = takings ÷ sales; **margin** = (Σ line net ex
  VAT − Σ cost) ÷ Σ line net ex VAT over the window's sales net of refunds, in % to one decimal; deltas against the same
  comparison window ("+11 on last Saturday", "−US$0.31 on last Saturday", "+0.6 pts on last Saturday"); bars: the last seven
  days' value for each, today last.
- **Needs action**, in this order, only rows with something in them and only those the caller can act on:
  1. `stale-shift` (warn) per OPEN shift opened more than 12 hours ago: "Back till open for 52 hours" · "SH-00240 · Farai
     Moyo · not cashed up since 17 Aug" (short date of `openedAt`) · figure takings on it · href
     `/retail/shifts/<id>/close`. (`retail.cash-control:close-shift`)
  2. `short` (bad), one row: closed shifts this week with variance < 0 and no final sign-off: "Three drawers short this week"
     (count in words up to ten, "One drawer short this week") · "Chipo Dube twice, Farai Moyo once" (names by count, "three
     times", "4 times" after) · figure Σ variance "−US$15.79" · href the oldest one's `?sheet=sign-off`.
     (`retail.cash-control:approve`)
  3. `over` (warn), same for variance > 0: "One drawer over this week" … (**Defined here**).
  4. `uncounted` (warn): "One drawer closed without a count" · "SH-00229 · Tafara Nyathi · 8 Aug" (**Defined here**).
  5. `low-stock` (warn): `stockLevel()` Low + Out at the site: "Seven products below reorder level" · "<the one with the least
     cover> has <n> left, about <d> days" ("Jameson 750ml has 9 left, about 2 days"; "is out" when 0) · figure the count ·
     href `/retail/stock?tab=low`. (`retail.stock:view`)
  6. `not-fiscalised` (warn): PENDING or FAILED retail fiscal receipts: "Two receipts not yet fiscalised" · W-44's meta ·
     figure the count · href `/retail/manage/tills`. (`retail.cash-control:view`)
  7. `flagged-sales` (warn): sales with `reviewReason` and no `reviewedAt`: "Three sales to look at" · the newest reason ·
     figure the count · href `/retail/sales?tab=all&flagged=1`. (`retail.sell:update`) (**Defined here**)
  8. `order-due` (info): purchase orders expected today, not fully received: one → "Purchase order PO-0031 due today" ·
     "Delta Beverages · 14 lines · not yet received" · figure its value · href the buying spec's receive page for it; several →
     "Three purchase orders due today" · supplier names · Σ value · `/retail/buying/orders?due=today`. (`retail.purchasing:view`)
  9. `promotion-ending` (info): promotions ending tomorrow: one → "Promotion ends tomorrow" · "<its name or its product and
     price>" ("Castle Lager case of 24 at US$24.00") · figure the count · href its record. (`retail.promotions:view`)
  10. `laybys-overdue` (warn): PAYING lay-bys past their date: "Two lay-bys overdue" · "LAY-0027 · Tinashe Mavhunga · US$26.50
     left" (the oldest) · figure Σ left · `/retail/laybys?tab=paying&state=overdue`. (`retail.laybys:view`) (**Defined here**)
- **Tills now**: active tills at the site with an open shift, an OFFLINE device (SET-03 `tillState`) or a sale today, open
  first, then offline, then closed, by name. OPEN (shift ≤ 12 h) "Open" `info`, meta "<cashier> · since 07:58 · float
  US$200.00"; STALE (> 12 h) "Open 52h" `warn`, meta "<cashier> · since 17 Aug 11:18 · needs closing"; OFFLINE "Offline"
  `tray`, meta "<cashier first name> · last seen 13:58"; CLOSED "Closed" `hollow`, meta "Closed at 21:58 · <cashier>"
  (**Defined here**). Figures: the open shift's takings and sales; else today's on that till.
- **Takings by day**: the last 30 trading days to today, total in the header; label "Sat 3 Oct"; today labelled "· so far" in
  the tooltip. Independent of the period control.
- **How people paid**: the window's payments by base amount, groups in the fixed order Cash (cash in US$), EcoCash, Card, ZiG
  (cash in ZWG), then "Other" (transfer, InnBucks, on account, voucher, lay-by) when not zero; shares sum to 100.
- **Top products**: the window's lines by takings, top five: `qtyLabel` "8 cases", "3 bottles", "84 cartons" (the product's
  unit, plural); `pct` against the first.
- **Stock to reorder**: `stockLevel()` Low and Out at the site, least cover first, five: "6 left", meta "reorder at 12" plus
  " · 6 days" when cover is known and the line is above its reorder level; `low` when at or under it (bar `--warn-dot`).
- **Cashiers this week**: people with shifts this week at the site, by takings: meta "5 shifts · −US$7.65" (Σ variance) or
  "<n> shifts · balanced".
- The route reads in parallel with `Promise.all`, at most one query per tile; it answers within 800 ms on the seeded tenant.

### 4.2 Sales

| Method | Path | Permission | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/v2/reports/retail-sales?…` | read: `retail.sell:view` or `retail.cash-control:view`; cashiers own (`scopeOwn cashierId`) | list query (FND 4.1) | list page | |
| GET | `/sales/[id]` | same, own for cashiers | – | `{ data: SaleView }` | 404 "Sale not found" |
| PATCH | `/sales/[id]` | `retail.sell:update` | `{ customerId?: uuid \| null, paymentReference?: { paymentId, reference } }` | `{ data: SaleView, changed }` | 400 `fieldErrors.customer` "That customer is not this shop’s."; 409 "SALE-31866 was voided." |
| GET | `/sales/[id]/receipt?format=pdf` | read | – | `application/pdf` (80 mm, marked "Copy"); audit `RETAIL_SALE.REPRINTED` | 404 |
| POST | `/sales/[id]/send` | `retail.sell:view` (own for cashiers) | `{ to?: string /* E.164 */ }` | `{ queued: true, to: "••• 3388" }` | 400 `fieldErrors.to` "Give a WhatsApp number, like +263 77 412 3388."; 409 "WhatsApp is not set up. Ask the owner to connect it." |
| POST | `/sales/send` | `retail.sell:view` | `{ ids: uuid[] (≤500) }` | `{ sent: number, noNumber: number }` | |
| POST | `/sales/[id]/reviewed` | `retail.sell:update` | – | `{ reviewedAt }` | 409 "Nothing to look at on SALE-…" |
| GET | `/sales/[id]/refund` | `retail.sell:refund` | – | `RefundForm` | 409 as the POST's state errors |
| POST | `/sales/[id]/refund` | `retail.sell:refund` | `RefundInput` | 201 `{ data: { id, saleNo, value, to, voucherCode? } }` | section 2 W-41 |
| GET | `/sales/[id]/void` | `retail.sell:void` | – | `VoidForm` | 409 "Only today’s sales can be voided. Refund it instead." |
| POST | `/sales/[id]/void` | `retail.sell:void` | `{ reason: string, note?: string, approver? }` | `{ data: { saleNo, voidNo } }` | section 2 W-41 |

```ts
type SaleView = {
  id: string; saleNo: string; saleType: "SALE" | "REFUND";
  state: "SOLD" | "PART_REFUNDED" | "REFUNDED" | "VOIDED" | "REFUND";
  till: { id: string | null; name: string }; cashier: { id: string | null; name: string };
  customer: { id: string; name: string; phone: string | null } | null;     // null = walk-in
  priceList: string;                     // "Retail" (lines' lists, "Retail and Happy hour" when two)
  postedAt: string; total: string; vat: string; vatRatePct: string; items: string;
  margin: { value: string; onCostPct: string } | null;                     // null without view-cost
  deposit: string; change: string;
  lines: Array<{ id: string; name: string; quantity: string; price: string; discount: string; total: string;
                 refundedQty: string; productId: string | null }>;
  payments: Array<{ id: string; tender: string; label: string; reference: string | null; currency: string;
                    amount: string; baseAmount: string }>;
  fiscal: { state: "SIGNED" | "WAITING" | "FAILED" | "OFF"; receipt: string | null; dayNo: number | null;
            signedAt: string | null; error: string | null };
  idCheckedAt: string | null;
  source: { id: string; saleNo: string } | null;                           // a refund's sale
  refunds: Array<{ id: string; saleNo: string; total: string; postedAt: string }>;
  void: { reason: string; approvedBy: string | null; at: string } | null;
  refund: { reason: string; restocked: boolean; approvedBy: string | null } | null;  // on a refund document
  review: { reason: string; reviewedAt: string | null } | null;
  hourly: { today: { labels: string[]; values: number[]; mark: number }; week: { labels: string[]; values: number[]; mark: number } };
  can: { refund: boolean; void: boolean; voidableToday: boolean; update: boolean; send: boolean };
};

type RefundForm = {
  saleNo: string; sub: string;                       // "Front till · Chipo Dube · today 11:40 · card"
  lines: Array<{ saleLineId: string; name: string; bought: string; left: string; price: string; deposit: string }>;
  reasons: string[];                                 // RetailTillRules.refundReasons
  to: Array<{ value: "ORIGINAL" | "CASH" | "CREDIT_NOTE" | "VOUCHER"; label: string }>; // "The card", "Cash", "Credit note", "Voucher"
  drawer: { shiftId: string; label: string } | { choose: Array<{ shiftId: string; label: string }> } | null;
                                                     // found: the hint; several: the "Drawer" choice; null: none open
  pinOver: string;                                   // "20.00"
  approval: { canApprove: boolean; name: string; approvers: Array<{ id: string; name: string }> };
  customer: { id: string; name: string } | null;
};
type RefundInput = {
  lines: Array<{ saleLineId: string; quantity: string }>;
  reason: string; to: "ORIGINAL" | "CASH" | "CREDIT_NOTE" | "VOUCHER";
  restock: boolean; customerId?: string; shiftId?: string /* the chosen drawer for cash */;
  approver?: { userId: string; pin: string };
};
type VoidForm = { saleNo: string; sub: string; reasons: string[]; needsApproval: boolean;
  approval: RefundForm["approval"]; note: string /* the footer sentence for this tender */ };
```

The list source `retail-sales` (definition `lib/reports/definitions/retail/floor.ts`, database-side `page()` in
`lib/reports/loaders/retail/floor.ts` because sales pass 5,000): columns, tabs, filters, sorts, groups and totals in 5.2.
`GET /pos/sales` and `GET /pos/sales/[id]` stay for the till only (scope `mine`); the back office never calls them.

### 4.3 Shifts

| Method | Path | Permission | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/v2/reports/retail-shifts?…` | FND-LIST | | | |
| GET | `/shifts/new?registerId=` | `retail.cash-control:open-shift` or `retail.sell:open-shift` | – | `{ float: "100.00", hint: "Counted in. Last close left US$100.00.", takesZig: boolean, zigFloat: "0.00" }` | 404 "Till not found" |
| POST | `/shifts` | W-37 | `{ registerId, cashierId?, openingFloat: string, openingFloatZig?: string, notes? }` | 201 `{ data: { id, shiftNo, registerName, cashierName } }` | W-37 |
| GET | `/shifts/[id]` (changed) | `retail.cash-control:view`, or own with `retail.sell:view` | – | `{ data: ShiftView }` | 404 |
| GET | `/shifts/[id]/x-report?format=pdf` | same | – | `application/pdf` (live figures, "X-report, not final") | |
| GET | `/shifts/[id]/z-report` | same | – | 302 to `/z-reports/<id>?format=pdf` of the shift's till and day; 409 "Saturday 3 October is not closed yet." | |
| GET | `/shifts/[id]/cash-movements` | unchanged | | | |
| POST | `/shifts/[id]/cash-movements` (changed) | W-38 | `CashMoveInput` | 201 `{ data: { id, type, amount, currency, delta }, shift: { expectedCash } }` | W-38 |
| GET | `/shifts/[id]/close` | as POST | – | `CountForm` | 409 "SH-00242 is closed already." |
| POST | `/shifts/[id]/close` (changed) | W-39 | `CloseInput` | `{ data: { shiftNo, closedAt, difference, state } }` | W-39 |
| POST | `/shifts/[id]/close-uncounted` | `retail.cash-control:close-shift` | `{ reason: string }` | `{ data: { shiftNo, closedAt } }` | 409 closed already |
| POST | `/shifts/[id]/sign-off` | `retail.cash-control:approve` | `{ outcome: "ACCEPT" \| "RECOVER" \| "LOOK_INTO", note?: string }` | `{ data: { shiftNo, outcome, amount } }` | W-40 |
| POST | `/shifts/[id]/message` | `retail.cash-control:update` | `{ body: string /* 1–500 */ }` | `{ sent: true }` | 400 `fieldErrors.body` "Write the message." |

```ts
type ShiftView = {
  id: string; shiftNo: string; status: "OPEN" | "CLOSED";
  state: "OPEN" | "STALE" | "SHORT" | "OVER" | "BALANCED" | "NOT_COUNTED";
  till: { id: string; name: string }; site: { id: string; name: string };
  cashier: { id: string; name: string; firstName: string };
  openedAt: string; closedAt: string | null; durationMinutes: number;
  openingFloat: string; openingFloatZig: string;
  takings: string; salesCount: number; cashSales: string;
  moves: { net: string; count: number; summary: string };      // summary: "1 drop to the safe" | "3 movements"
  dropsToSafe: Array<{ amount: string; at: string }>;          // rail "To the safe": "−US$20.00 at 10:04"
  expected: string; counted: string | null; difference: string | null;
  signOff: { outcome: "ACCEPT" | "RECOVER" | "LOOK_INTO"; by: string; at: string; note: string | null; recover: string | null } | null;
  needsSignOff: boolean;
  drawer: { lastOpened: string | null /* "13:12, for SALE-31862" */; noSaleOpens: number };
  hourly: { labels: string[]; values: number[] };
  tenders: Array<{ tender: string; label: string; sales: number; amount: string; share: number }>;
  can: { move: boolean; close: boolean; closeUncounted: boolean; signOff: boolean; message: boolean };
};

type CashMoveInput = {
  direction: "OUT" | "IN";
  why: "DROP" | "SUPPLIER" | "PETTY" | "TOP_UP";
  amount: string; currency: "USD" | "ZWG";
  requisitionId?: string; note?: string; approver?: { userId: string; pin: string };
};

type CountForm = {
  shiftNo: string; sub: string;                                 // "Front till · Chipo Dube · open 6h 12m"
  blind: boolean;                                               // the cashier counting their own drawer
  denominations: { USD: string[]; ZWG: string[] | null };       // ZWG null when the shop takes no ZiG cash
  rate: string | null;                                          // "26.80"
  parts: { openingFloat: string; cashSales: string; moves: { label: string; amount: string } } | null; // null when blind
  expected: string | null;                                      // null when blind
  checked: Array<{ label: string; amount: string; ok: boolean; note: string }>; // "EcoCash", "14.00", true, "matches"
  floatLeft: string;                                            // default: the till's last float left, else this shift's float
};
type CloseInput = {
  counts: { USD: Array<{ denomination: string; count: number }>; ZWG?: Array<{ denomination: string; count: number }> };
  note?: string; floatLeft: string;
};
```

"Not counted, checked": for each non-cash tender on the shift, its total; `ok` when every payment of it carries a reference
(card slips, EcoCash confirmations), note "matches"; otherwise note "<n> without a reference" (`warn`) (**Defined here**:
the board's "matches" has no source to match against, so it says what the system can check).

### 4.4 Lay-bys

| Method | Path | Permission | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/v2/reports/retail-laybys?…` | `retail.laybys:view` | list query | list page | |
| GET | `/laybys/new` | `retail.laybys:create` | – | `{ minDepositPct: "20", maxDays: 90, defaultDue: "2026-10-20", tenders: [...], drawer }` | |
| POST | `/laybys` | `retail.laybys:create` | `{ customerId, lines: [{ productId, quantity: string }], deposit: string, depositTender, reference?, shiftId?, dueOn, remindWeekly }` | 201 `{ data: { id, laybyNo, left, dueOn } }` | W-42 |
| GET | `/laybys/[id]` | `retail.laybys:view` | – | `{ data: LaybyView }` | 404 "Lay-by not found" |
| PATCH | `/laybys/[id]` | `retail.laybys:update` | `{ dueOn }` | `{ data: LaybyView, changed }` | 400 `fieldErrors.due`; 409 "LAY-0031 was handed over." |
| POST | `/laybys/[id]/payments` | `retail.laybys:update` | `{ amount, tender, reference?, shiftId?, dueOn? }` | 201 `{ data: { paid, left, status } }` | W-42 |
| POST | `/laybys/[id]/hand-over` | `retail.laybys:update` | `{ amount?, tender?, reference? }` (paying the rest first) | `{ data: { saleId, saleNo } }` | 409 "US$26.00 is still to pay." |
| POST | `/laybys/[id]/cancel` | `retail.laybys:delete` | `{ tender, shiftId? }` | `{ data: { paidBack, fee } }` | 409 "LAY-0031 was handed over." |

```ts
type LaybyView = {
  id: string; laybyNo: string; status: "PAYING" | "READY" | "COLLECTED" | "CANCELLED"; stateLabel: string;
  customer: { id: string; name: string; phone: string | null };
  what: string;                         // "Hennessy VS 700ml, gift box"
  total: string; paid: string; left: string; dueOn: string;
  lines: Array<{ name: string; quantity: string; price: string; total: string }>;
  payments: Array<{ at: string; kind: string; tender: string; amount: string; by: string }>;
  drawer: RefundForm["drawer"];
  cancel: { fee: string; paidBack: string };
  can: { pay: boolean; handOver: boolean; cancel: boolean; changeDate: boolean };
};
```

Lookups registered by this spec in `lib/retail/lookups.ts`: none new (uses `customer` from CUS:customers, `product` from
PRD-01, `till` and `person` from foundations/ADM). Nav badge provider `/retail/laybys`.

### 4.5 End of day

| Method | Path | Permission | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/end-of-day?siteId=&date=` | `retail.end-of-day:view` | – | `{ data: EndOfDayView }` | 400 "Pick a day up to today." |
| POST | `/end-of-day/close` | `retail.end-of-day:create` | `{ siteId, date, banked: string, slipUrl?: string }` | `{ data: { closedAt, zReports } }` | W-43 |
| POST | `/end-of-day/slip` | `retail.end-of-day:create` | multipart `file` (jpg/png/pdf ≤ 8 MB) | `{ url }` | 400 "That file is not a photo or a PDF." |
| GET | `/api/v2/reports/retail-days?…` | `retail.end-of-day:view` | list query | list page | |
| GET | `/z-reports/[id]?format=pdf` (changed: adds pdf) | `retail.cash-control:view` or `retail.end-of-day:view` | – | `application/pdf` | |
| POST | `/z-reports/print` (FND-LIST; extended) | same | `{ shiftIds }` or `{ days: [{ siteId, date }] }` (≤366) | one PDF | 409 "None of these days has been closed yet." |
| POST | `/z-reports` | **removed** | | | generation is Close the day's |

```ts
type EndOfDayView = {
  site: { id: string; name: string }; sites: Array<{ id: string; name: string }>;
  date: string; dateLabel: string;                       // "Saturday 3 October"
  closed: { at: string; by: string; banked: string; slipUrl: string | null } | null;
  takings: string;
  tills: Array<{
    registerId: string; name: string; cashier: string;   // the day's last shift's cashier
    shiftLabel: string;                                  // "Closed 21:58" | "Still open"
    open: boolean; openShiftId: string | null;
    takings: string; refunds: string; difference: string | null;   // null while open ("–")
    zReport: { id: string } | null;                      // set once the day is closed
  }>;
  totals: { tills: number; takings: string; refunds: string; difference: string };
  paid: Array<{ key: string; label: string; value: string }>;   // "Cash, US$" US$2,610.00 · "Cash, ZiG" ZiG 4,288 · "EcoCash" · "Card" · "On account" …
  checklist: Array<{
    key: "shifts" | "signoff" | "fiscal" | "banked";
    label: string; detail: string; done: boolean; blocking: boolean;
    action: { label: string; href: string } | null;     // "Close it", "Sign off"
  }>;
  thingsLeft: number;                                     // blocking and not done
  banked: { default: string; account: string | null /* "CBZ current account" */ };
  can: { close: boolean };
};
```

### 4.6 The till (FLR-09, FLR-10) — changes to existing POS routes

| Route | Change |
|---|---|
| `POST /pos/shifts` | adds `openingFloatZig`; float default from `/shifts/new` logic; SET-04 takes the till from the device |
| `POST /pos/shifts/[id]/close` | body becomes `CloseInput` (counts by note); same service as the back office |
| `POST /pos/shifts/[id]/cash-movements` | body becomes `CashMoveInput`; approval by `approver` PIN on the device |
| `POST /pos/sales/[id]/refund`, `/void` | bodies become `RefundInput` / the void input; `managerOverride` (password) removed (SET-06); same services |
| `POST /pos/laybys/[id]/payments`, `POST /pos/laybys` | the till calls the back-office routes above with the device session (they accept a till-pin session on the POS host, SET-04) — no separate POS copies |
| `POST /pos/drawer/open` | SET-06 defines it; FLR-09 builds the button and its PIN dialog |
| `GET /pos/sales` | adds `customerId` filter for the till's customer screen; unchanged otherwise |

---
## 5. UI per page

Every page sits in the shell (FND-SHELL): rail mark "The floor" current, panel "The floor" with the item current as named.
Tables use the ListFrame cells (foundations 5.4.7); money and times are mono; badges are StateBadges with the tones named.
Loading: the frame's skeletons. Error: the frame's error state with the endpoint's message ("The sales would not load").

### 5.1 Overview — `/retail` (board `Floor.png`) · FLR-08

DashboardFrame, Overview variant (FND-DASH 5.11.1). Panel item: Overview.

**Header**: title "Overview"; no back, no sub; primary "+ Open shift" → `?sheet=shift-open` over this page (owner,
manager; hidden for the bookkeeper). When setup is unfinished the setup checklist card (FND-DASH/SET-13) leads the grid.

**Toolbar** (48px, `--surface`): period Segmented "Today" · "This week" · "This month" (address `?period=`); FilterChip
"Site" with the site's name ("Harare Main Branch"), options every active site then "All sites" (address `?site=`); spacer;
live line "Live · Saturday 3 October 2026 · 14:42" (dot `--ok` ringed `--ok-soft`, the time mono), refetching every 60 s
(React Query `refetchInterval: 60_000`, key `["retail-overview", period, site]`).

**Grid** (12 columns, gap 16, padding 20 24 32, `--ground`):

| Tile | Span | Kind | Content (period = Today; the words change with the period as in 4.1) |
|---|---|---|---|
| Takings | 6 | hero KPI | "Takings today" · "US$1,284.60" · pill "+8.2%" (`--ok`/`--ok-soft`; `--bad` when negative) · "on last Saturday by this hour (US$1,187.20)" · area sparkline over the site's hours (labels "07:00", "10:00", "13:00", "16:00", "19:00") · legend "Today" (solid) and "Last Saturday" (dashed) |
| Sales | 2 | small KPI | "Sales" · "142" · "+11 on last Saturday" · seven bars · "Last 7 days" |
| Average basket | 2 | small KPI | "Average basket" · "US$9.05" · "−US$0.31 on last Saturday" (the figure in `--bad`) · bars · "Last 7 days" |
| Gross margin | 2 | small KPI | "Gross margin" · "31.4%" · "+0.6 pts on last Saturday" · bars · "Last 7 days". Not drawn without `view-cost`; the two other KPIs then span 3 each |
| Needs action | 7 | panel, action list | header "Needs action" with a `--bad-soft` count pill ("6"); rows as 4.1 (dot, title 500, meta 12.5 `--ink-3`, figure mono in its tone, chevron), each row a link. Empty: "Nothing needs you right now." (`--ink-3`, padding 16) **Defined here** |
| Tills now | 5 | panel, status list | header "Tills now" with a muted count ("3") and link "Shifts" (→ `/retail/shifts`); rows: name 600 + StateBadge ("Open" info, "Open 52h" warn, "Offline" tray, "Closed" hollow), right the takings mono 600; meta 12.5 `--ink-3`, right "91 sales" mono 12. Row → the shift. Empty: "No till has opened today." |
| Takings by day | 8 | panel, bar chart | header "Takings by day" + qualifier "last 30 days" + figure "US$34,918.40"; 30 bars, last darker; y labels "2k", "1.5k", "1k", "500", "0" (rounded from the data's maximum); x labels every 7th day ("4 Sep", "11 Sep", "18 Sep", "25 Sep", "3 Oct"); tooltip "Sat 3 Oct · so far" / "US$1,284.60" / "141 sales" |
| How people paid | 4 | panel, share bar | header "How people paid today" ("this week", "this month"); stacked bar in `--s1` Cash, `--s2` EcoCash, `--s3` Card, `--s4` ZiG, `--data-muted` Other; legend rows "Cash US$526.69 41%" … |
| Top products | 4 | panel, rank list | header "Top products" + "today" + link "Sales" (→ `/retail/sales`); head "Product" / "Takings"; rows name, "US$212.00", bar, "8 cases" |
| Stock to reorder | 4 | panel, rank list | header "Stock to reorder" + "below level" + link "Stock" (→ `/retail/stock?tab=low`); head "Product" / "On hand"; rows name, "6 left" (`--warn` when low), bar (`--warn-dot` when low), "reorder at 12". Hidden for roles without `retail.stock:view`; empty "Nothing is low." |
| Cashiers | 4 | panel, rank list | header "Cashiers" + "this week" + link "Shifts"; head "Cashier" / "Takings"; rows name, "US$3,412.60", bar, "5 shifts · −US$7.65" |

Empty tiles (no sales yet in the window): their title and "Nothing yet today." (`--ink-3`; "this week", "this month"). The
KPI tiles show "US$0.00" / "0" with "Nothing to compare with yet".

**Mobile** (<720px): toolbar wraps (period full width, site chip under it, live line hidden); tiles stack one per row in
the order above; the bar chart keeps 30 bars at 2px gaps; rank lists keep their rows.

### 5.2 Sales — `/retail/sales` (board `SalesList.png`) · FLR-01

ListFrame, source `retail-sales`, noun "sales". Panel item: Sales.

**Header**: title "Sales"; no back; no primary (sales are rung at the till).

**Tabs** (own row): "Today" · "Refunds" · "Voids" · "All", each with its count ignoring search and filters (FND 5.4.3):
Today = SALE and REFUND documents posted today; Refunds = REFUND documents; Voids = SALE documents VOIDED; All = SALE and
REFUND documents. VOID reversal documents never list. Default tab Today (`?tab=`).

**Toolbar**: search "Sale, receipt, customer or product" (sale number, fiscal receipt number, customer name, line item
names); "Till Any" (choice: "Any", then the company's tills by name); "Cashier Anyone" ("Anyone", then people who rang a
sale, by name; hidden for a cashier); "Filters" holding: "When" (period presets, "Any time" default), "Paid with" ("Any",
"Cash", "ZiG", "EcoCash", "Card", "Bank transfer", "InnBucks", "On account", "Voucher", "Lay-by"), "Site" ("All sites",
then sites; **default the person's default site when the company has more than one site** — this is the board's "Filters
1"), "Flagged" ("Any", "Only flagged") (**Defined here**). Count, Clear, "Newest first | Group | Columns", "Export ⌄".

Sorts: "Newest first" (default), "Oldest first", "Biggest first" (absolute total, descending) (**Defined here**).
Groups: "Till", "Cashier", "Paid with", "State" (**Defined here**).

**Columns** (grid `40px 120px 110px 130px 140px minmax(150px,1fr) 70px 120px 120px 130px 44px`, min width 1240px):

| Column | Key | Cell | Align | Priority | Value |
|---|---|---|---|---|---|
| Sale | `saleNo` | `ref` → `/retail/sales/{id}` | start | 1 | "SALE-31870", "RFD-0044" |
| When | `postedAt` | `mono` | start | 2 | "12:10" when today, else "3 Oct 12:10" |
| Till | `till` | `text` | start | 3 | till name |
| Cashier | `cashier` | `muted` | start | 2 | cashier name |
| Customer | `customer` | `link` → `/retail/customers/{customerId}` when linked; `text` when only a name; `faint` "Walk-in" when none | start | 1 | |
| Items | `items` | `num`, total sum | end | 3 | Σ line quantities (absolute) |
| Paid with | `paidWith` | `text` | start | 2 | `paidWithLabel` |
| Total | `total` | `money`, total sum | end | 1 | signed (refunds "−US$27.90"); a voided sale's total in `--ink-3` |
| State | `state` | `state`: "Sold" hollow, "Refund" warn, "Voided" bad, "Refunded" hollow, "Part refunded" hollow, "To look at" warn | start | 1 | |

**Totals band**: "Σ <count>" · Items Σ · Total Σ. **Deviation**: the totals leave voided sales out (their money came back);
the board's sample arithmetic adds the voided US$1.20 into "US$63.20" — real data would overstate takings by every void.

**Row menu ⋯** (**Defined here**): "Open"; "Reprint the receipt"; "Send on WhatsApp"; "Refund" (`retail.sell:refund`,
sales only); "Void (same day only)" (voidable rows only). Each opens what the record's action opens.

**Selection** (bulk): "Send receipts" → `POST /sales/send` → toast "4 receipts sent. 2 sales have no customer number."
(or "4 receipts sent.") **Defined here**; "Export <n>".

**Pager**: "1–50 of <n> · Rows per page 50 · ‹ 1 2 3 … ›" (FND).

**Empty**: guide "No sales yet" / "Sales appear here as the tills ring them up." (no button). No match: the frame's.
**Phone card**: title sale number, badge state, figure total, meta "{When} · {Till} · {Cashier}", figure2 paid with.
**Roles**: owner, manager, bookkeeper all rows; cashier own (`scopeOwn` on `cashierId`, Cashier filter hidden); stock clerk
"Your role cannot view sales."

### 5.3 A sale — `/retail/sales/[id]` (board `SaleRecord.png`) · FLR-01

RecordFrame kind `sale` (`lib/retail/record-kinds/floor.ts`), type `RetailSale`. Panel item: Sales.

**Header**: back "Sales" (→ `/retail/sales`, keeping the list's last address); title the sale number ("SALE-31866");
reference "Front till · Chipo Dube" (mono). Action group: "Refund" (`?sheet=refund`; shown when `can.refund`),
"Reprint the receipt" (opens `/api/v2/retail/sales/<id>/receipt?format=pdf` in a new tab), "Send on WhatsApp" (sends to the
customer's phone at once with toast "Sent to ••• 3388 on WhatsApp."; with no phone opens `?sheet=sale-send`). ⋯: "Export as
PDF", "Void (same day only)" (`?sheet=sale-void`; disabled with the tooltip "Only today’s sales can be voided." when
`voidableToday` is false; not drawn for roles without `retail.sell:void`), "Add a customer to it" (`?sheet=sale-customer`;
"Change the customer" when one is set; managers), "Mark as looked at" (only with an open review; **Defined here**). No
primary. Not binnable.

**Strip**: no steps. Chips: state — "Sold" plain, "Part refunded" warn, "Refunded" warn, "Voided" bad; fiscal — "Fiscal
receipt signed" ok, "Fiscal receipt waiting" warn, "Fiscal receipt failed" bad, none when the shop does not fiscalise;
"To look at" warn when flagged. Figure: "Total" "US$44.20".

**KPIs** (5): "Total" "US$44.20" · "2" "items"; "VAT" "US$5.77" · "15%" "included"; "Margin" "US$9.84" · "22.3%" "on cost"
(margin ÷ cost; tile replaced by "Discount" "US$0.00" · "0" "lines" for roles without view-cost); "Paid with" "Card" ·
"CBZ 4412" "reference" (first 8 characters of the reference; "Split" · "2" "tenders" when several; "Cash" · "US$0.00"
"change" for cash); "When" "11:40" · "3 Oct" "2026".

**Chart**: "This till today, by hour", unit "US$, this sale’s hour darker", range Segmented "Today" · "This week"; Today:
the till's takings per hour over the site's hours that day; This week: per day Monday–Sunday of that week. **Deviation**:
only the sale's own hour (or day) is in `--data`, the rest `--data-muted` — the board's template darkens every bar from the
sale's hour on, which contradicts its own unit line.

**Tabs**:
- "Lines" (count): columns "Product" (text), "Quantity" (num, end), "Price" (money, end), "Discount" (money end; `zero` kind
  at 0), "Line" (money, end); grid `minmax(0,1fr) 90px 110px 110px 120px`; totals "Σ 2 lines" · "2" · "" · "US$0.00" ·
  "US$44.20"; footer "1–2 of 2" and link "View the receipt" (opens the receipt PDF). A deposit adds a row "Deposit on 12
  bottles" (**Defined here**) so the lines add to what was paid.
- "Payment" (count): "Paid with" (dot in the tender's series colour + label), "Reference" (mono), "Currency", "Amount"
  (money), "In US$" (money); totals; footer "1–1 of 1". Change given shows as a row "Change" with a negative amount.
- "Receipt" (1): "Receipt" (mono "FDMS 0441-2209 / 31866"), "Fiscal day" (num "214"), "State" (badge Signed ok / Waiting warn
  / Failed bad with the error as title), "Signed" (when); footer link "View the receipt". Refunds list their credit note.
- "Activity" (built in).
- On a sale with refunds a fifth tab "Refunds" (count): "Refund" (ref → its record), "When", "Total" (**Defined here**).

**Details rail** (hint "click any value to change it" on the first group, managers only):
- "Sale": Till, Cashier, Customer (editable: `auto` noun `customer` → `PATCH { customerId }`; "Walk-in" when none), Price
  list.
- "Paid": one row per payment "<Tender>" "US$44.20" (mono); "Reference" (editable for managers: text, `PATCH
  { paymentReference }`, writes `RETAIL_RECORD.EDITED` "Reference"); "Change" "US$0.00".
- "Fiscal": "Receipt" (mono), "Day" (mono), "ID checked" ("Yes, 11:39" / "Not needed").
- On a voided sale a group "Void": "Why", "Approved by", "When".

**A refund document** (`saleType REFUND`, e.g. `RFD-0044`): title "RFD-0044", reference "Front till · Chipo Dube"; actions
"Reprint the receipt", "Send on WhatsApp"; ⋯ "Export as PDF"; chips "Refund" warn and the credit-note chip ("Credit note
signed"); figure "Total −US$27.90"; KPIs as above (Margin shows the margin given back); tabs Lines, Payment, Receipt,
Activity; rail group "Refund": "Of" (link to the sale), "Why", "Back on the shelf" ("Yes" / "No, written off"), "Approved by".

**Mobile**: the frame's (rail under the main column; actions fold into ⋯).

### 5.4 Shifts list additions — `/retail/shifts` (board `Main.png`) · FLR-03, FLR-05

FND-LIST builds the page. This spec adds:
- **State filter option** "Needs sign-off" (closed, difference or no count, no final sign-off) to the "State" filter
  inside Filters, and the address `?state=needs-sign-off` (used by End of day and the Overview when several are waiting).
- **Row menu** contents (FND 5.5.5 says "Defined here"; this spec wires them): "Open"; for open shifts "Record cash in or
  out" (`/retail/shifts/<id>?sheet=cash-move`), "Count and close" (`/retail/shifts/<id>/close`), "Print X-report"; for closed
  shifts "Print Z-report" (`/api/v2/retail/shifts/<id>/z-report`, disabled with "The day is not closed yet." until it is),
  "Sign off the difference" when it needs one (`?sheet=sign-off`).
- The primary "+ Open shift" sheet gains the ZiG float and the float default (5.6.1).

### 5.5 A shift — `/retail/shifts/[id]` (board `ShiftRecord.png`) · FLR-03

RecordFrame kind `shift` (FND-RECORD 5.6.10 is the frame; the content below is this spec's). Panel item: Shifts.

**Header**: back "Shifts"; title the till ("Front till"); reference the shift number ("SH-00242"). Actions (open shift):
"Record cash in or out" (`?sheet=cash-move`), "Print X-report" (new tab, `/x-report?format=pdf`); (closed shift): "Print
Z-report". ⋯: "Export as PDF", "Message the cashier" (`?sheet=staff-message`; owner, manager), "Sign off the difference"
(`?sheet=sign-off`; when `needsSignOff`), "Close without counting" (`--bad`; open shifts; owner, manager → ConfirmDialog
`closeuncounted`). Primary: open → "Count and close" (→ `/retail/shifts/<id>/close`); closed and needs sign-off → "Sign off
the difference" (**Defined here**); otherwise none.

**Strip**: steps "Opened" · "Trading" · "Counted" · "Closed" — open: done, now, to do, to do; closed and counted: done,
done, done, now; closed without a count: done, done, to do, now. Chips: the cashier (plain); state — "Open 6h 12m" info,
"Open 52h" warn, "Short US$7.15" bad, "Over US$3.17" warn, "Balanced" ok, "Not counted" warn; sign-off — "Signed off" ok,
"Recovering US$20.00" warn, "Being looked into" warn. Figure: open "Should be in the drawer" "US$201.50"; closed "Counted"
"US$412.50" (or "Expected" "US$72.95" when not counted).

**KPIs** (5): "Takings" "US$41.50" · "4" "sales"; "Opening float" "US$200.00" · "07:58" "counted in" (with a ZiG float the
note reads "counted in, and ZiG 500.00"); "Cash in and out" "−US$20.00" · "1" "drop to the safe" (or "3" "movements", or
"0" "none"); "Should be in the drawer" "US$201.50" · "US$21.50" "in cash sales"; "Counted" "—" · "" "not counted yet", or
"US$412.50" · "−US$20.00" (bad) "short" / "+US$3.17" (warn) "over" / "" "balanced".

**Chart**: "Takings per hour", unit "US$", no range (foundations decided); hours from opening to now (or close); last bar
darker; tooltip "11:00 · US$14.00".

**Tabs**:
- "Sales" (count): "When" (`when` "3 Oct 13:12"), "Sale" (`ref`), "Items" (num), "Paid with" (dot + label: Cash `ok`, EcoCash
  `info`, Card `warn`, ZiG `--s4`), "Total" (money); grid `150px 140px 80px minmax(0,1fr) 120px`; newest first; totals "Σ 4
  sales" · "10" · "cash US$21.50 · EcoCash US$14.00 · card US$6.00" · "US$41.50"; footer "1–4 of 4" and "All sales on this
  shift" (→ `/retail/sales?tab=all&shift=<id>`; the sales source's `parent` filter `shift`).
- "Cash in and out" (count): "When", "What" (dot `hollow` + "Drop to the safe" / "Float top-up" / "Pay a supplier" / "Petty
  cash"), "Note" (the requisition number or the note), "Approved by", "Amount" (signed money); totals "Σ <n>" · net; footer
  "1–1 of 1".
- "How people paid" (count of tenders): "Paid with", "Sales" (num), "Amount" (money), "Share" (mono %); totals.
- "Activity".

**Rail** (read-only, no hint): "Shift": Till, Site, Cashier, Opened ("3 October 2026, 07:58", mono). "Cash up": Opening
float, Cash sales, To the safe ("−US$20.00 at 10:04"; several: "−US$120.00, 2 drops"), Expected, Counted ("Not counted
yet" / "US$412.50"). "Drawer": "Last opened" ("13:12, for SALE-31862"), "No-sale opens" ("0"). Closed shifts add a group
"Close": "Closed" (time), "By", "What happened" (the note), "Float left", "To the safe"; signed-off shifts a group "Sign-off":
"Decision", "By", "Note".

**Mobile**: the frame's.

### 5.6 Shift sheets · FLR-03, FLR-05

#### 5.6.1 Open a shift — `?sheet=shift-open` (board `ShiftOpen.png`; FND-SHEET builds the chrome)

From `K.shiftopen`. Title "Open a shift"; sub "The floor › Shifts". Fields:

| Field | Type | Options / default | Validation | Hint |
|---|---|---|---|---|
| Till (`till`) | `auto`, noun "till" | lookup `till` at every site, sub "Open"/"Closed"; default the first closed till at the person's default site; quick add Name (owner, manager) | required; not open (409 → footer) | – |
| Cashier (`who`) | `auto`, noun "person" | people who may sell (owner, managers, cashiers), sub the role ("Owner", "Manager", "Cashier"); default the signed-in person when they may sell; quick add is ADM's | required | – |
| Opening float (`float`) | `money`, half | default from `GET /shifts/new?registerId=` | ≥ 0 | "Counted in. Last close left US$100.00." ("Counted in." when the till never closed) |
| ZiG float (`zig`) | `money`, half, `cur: "ZiG"` | "0.00" | ≥ 0 | – (field drawn only when the shop takes ZiG cash) |

Footer note "Cashiers usually open from the till with their PIN. This is for when a manager opens it for them."; secondary
"Cancel"; primary "Open it". A cashier opening their own sees the Cashier field fixed to themselves (read). Done: "SH-00243
open on the back till for Kuda Banda." (till name in lower case after "the"; "open on Handheld 1" when the name is not
"<word> till"), with "Open" → the shift.

#### 5.6.2 Cash in or out — `?sheet=cash-move` over the shift (board `CashMove.png`)

From `K.cashmove`. Title "Cash in or out"; sub "Front till · SH-00242 · Chipo Dube".

| Field | Type | Options / default | Rules |
|---|---|---|---|
| Which way (`dir`) | `seg` | "Out of the drawer" (default) · "Into the drawer" | Picking "Into the drawer" selects Float top-up; picking "Out of the drawer" while Float top-up is chosen selects Drop to the safe |
| Why (`why`) | `cards`, 2 columns, no label | "Drop to the safe" / "Too much cash in the drawer."; "Pay a supplier" / "From a requisition, so it balances."; "Petty cash" / "Small spend with a slip."; "Float top-up" / "Change is running out." — default Drop to the safe | Picking a card sets Which way to its direction. "Pay a supplier" is not drawn until BUY:requisitions ships its payout service |
| For (`req`) — when Why = Pay a supplier | `auto`, noun "requisition" (BUY's lookup: APPROVED, unpaid; label "REQ-0014 · Afdis Distillers", sub "US$1,940.00") | – | required; amount defaults to its approved amount (**Defined here**) |
| What for (`note`) — when Why = Petty cash | `text` | placeholder "Cleaning materials, for example" | required (**Defined here**) |
| Amount (`amt`) | `money`, half | empty | > 0; out ≤ what should be in the drawer |
| Currency (`cur`) | `seg`, half | "US$" (default) · "ZiG" (only when the shop takes ZiG cash) | |
| Manager PIN (`pin`) | `read`, tone ok/warn | decision 3: "Tafara Nyathi, 12:31" when the person approves; else the warn sentence and the STK-04 approval control | hint "Every movement needs one." |

Footer note "It shows on the shift and changes what should be in the drawer."; "Cancel"; primary "Record it". Done, built
from the response: "US$200.00 dropped to the safe. Drawer should hold US$1.50 plus sales." / "US$50.00 put in for change.
Drawer should hold US$251.50 plus sales." / "US$20.00 paid out for petty cash. Drawer should hold US$181.50 plus sales." /
"US$1,940.00 paid to Afdis Distillers for REQ-0014. Drawer should hold US$… plus sales." (the last three **Defined here**).

#### 5.6.3 Sign off — `?sheet=sign-off` over the shift (board `SignOff.png`)

From `K.signoff`. Title "Sign off a short drawer" ("Sign off an over drawer", "Sign off a drawer nobody counted" —
**Defined here**); sub "SH-00239 · Front till · Chipo Dube · yesterday" ("today", "yesterday", else "30 Sep").

| Field | Type | Value / options | Rules |
|---|---|---|---|
| Difference (`diff`) | `read`, mono, tone warn | "−US$20.00 short" / "+US$3.17 over" / "Not counted" | |
| Counted (`detail`) | `read` | "US$412.50 against US$432.50 expected" / "Nothing counted against US$72.95 expected" | |
| What happens to it (`do`) | `cards`, 1 column, no label | "Accept it" / "Written off to Cash differences."; "Recover from the cashier" / "Deducted from Chipo’s next pay, with her agreement noted." (first name and possessive from the cashier; short drawers only); "Look into it" / "Stays open on the overview until you decide." | required, no default ("Choose what happens to it.") |
| Note (`note`) | `area`, 2 rows | empty | required for Recover and Look into it |

Footer note "Chipo sees the sign-off and the note in the app."; "Cancel"; primary "Sign off". Done: "SH-00239 signed off.
US$20.00 to be recovered from Chipo Dube." / "SH-00239 signed off. US$20.00 written off to cash differences." / "SH-00239
stays on the overview while you look into it." (the last two **Defined here**).

#### 5.6.4 Message the cashier — `?sheet=staff-message` over the shift (**Defined here**, no board)

Title "Message Chipo Dube"; sub "SH-00242 · Front till". One field "Message" (`area`, 4 rows, 1–500 characters). Note "She
sees it in the app and on the till’s lock screen."; primary "Send"; done "Sent to Chipo Dube."

### 5.7 Count and close — `/retail/shifts/[id]/close` (board `ShiftClose.png`) · FLR-04

A page in the shell (not a frame kind). Panel item: Shifts.

**Header** (48px): back link "SH-00242" (→ the shift) then "/" then title "Count and close" and the sub in mono "Front till ·
Chipo Dube · open 6h 12m"; actions "Print X-report" (outline; new tab) and primary "Close the shift".

**Body**: grid `minmax(0,1fr) 360px`. Main (padding 20 24): the line "Count the notes in the drawer. The cashier counts
without seeing what is expected; the difference shows once both sides are in."; then two tables side by side (grid
`repeat(2, minmax(0,1fr))`, gap 16; the ZiG table absent when the shop takes no ZiG cash), each 1px `--line`, radius 12:
head "US$ note" · "How many" · "Comes to" (grid `1fr 110px 130px`), rows 100, 50, 20, 10, 5, 2, 1 with a 72px right-aligned
mono number input (`inputmode="numeric"`, aria-label "How many 100") and "US$50.00"; the ZiG table "ZiG note" with 200, 100,
50, 20, 10, 5 and "ZiG 400.00". Inputs start empty (0). After closing: a `role="status"` banner above the line —
"**Closed at 14:10.** The drawer balanced." or "**Closed at 14:10.** Out by −US$4.50. It is on the overview for a manager
to sign off." — the inputs become read-only and the primary becomes "Back to the shift" (**Defined here**).

**Aside** (360px, `--ground`, padding 20, gap 20):
1. Summary card (1px `--line`, radius 12): rows "Opening float" "US$200.00"; "Cash sales" "US$21.50"; "Dropped to the safe"
   "−US$20.00" (label "Cash in and out" when there were top-ups or payouts too; absent when none); "Should be there"
   "US$201.50" (600); "Counted, ZiG at 26.80" "US$201.51" (600; "Counted" without a ZiG table); then the Difference row on
   its tone ground: "None" (`--ok` on `--ok-soft`), "−US$4.50" (`--bad`/`--bad-soft`), "+US$3.17" (`--warn`/`--warn-soft`).
   Blind (a cashier's own drawer): "Should be there" and Difference read "Shows when you close" (`--ink-3`) (**Defined
   here**); they fill in from the response.
2. "What happened" (`area`): placeholder "Nothing to explain" when the difference is none, else "For example: gave change for
   US$20 instead of US$10"; hint "Needed when it is out by more than US$1.00. A manager signs it off."
3. "Not counted, checked": one row per non-cash tender: "EcoCash" · "US$14.00 matches" (the word in `--ok`; "2 without a
   reference" in `--warn`).
4. "After closing": "Float left for tomorrow" "US$100.00" (a button that becomes a money input on click, **Defined here**) ·
   "To the safe" "US$101.51" (600, recomputed as you type).

Primary "Close the shift": client checks (a note when out by more than US$1.00 and the difference is visible) then `POST
/close`; a 400 with `difference` (blind count) reveals the summary and focuses "What happened" with its error. Leaving with
counts typed asks "Discard this count?" / "What you typed is not saved." (keep "Keep counting", go "Discard").

**Roles**: the cashier on their own open shift (blind), owner and manager on any open shift; others see 403 "Your role
cannot close a till shift in sales". A closed shift's address shows the read-only page with the banner.
**Mobile**: the aside moves under the tables; the two tables stack.

### 5.8 Sale sheets · FLR-01, FLR-02

#### 5.8.1 Refund — `?sheet=refund` over the sale (board `RefundNew.png`), wide

From `K.refund`. Title "Refund SALE-31866"; sub "Front till · Chipo Dube · today 11:40 · card" (from `RefundForm.sub`).

Section "What comes back": a `lines` field (label "Coming back", no label drawn): head "Product" · "Back" · "Price" · "Value"
· ×; one row per sale line with something left: name, sub "Bought 1" ("Bought 2, 1 back already"), Back input (default 0;
a one-line sale defaults to its whole quantity), price mono "US$ 42.00", value; × removes the line from this refund.
Totals "Σ 2 lines" · back total · value total. **Deviation**: no "Add a product" row — a refund can only return what the sale
sold.

Section "How":

| Field | Type | Options / default | Rules |
|---|---|---|---|
| Why (`why`) | `seg` | the till rules' refund reasons ("Damaged", "Wrong item", "Changed mind", "Overcharged"); default the first | required |
| Money goes back as (`to`) | `seg` | "The card" (or "EcoCash", "InnBucks", "The transfer" — the sale's one non-cash tender; absent for cash sales) · "Cash" · "Credit note" · "Voucher"; default the first | Cash shows the drawer hint under it; Credit note on a walk-in sale shows a "Customer" `auto` (noun customer) under it |
| Put it back on the shelf (`stock`) | `toggle` | on, except off while Why is "Damaged" | hint "Off for damaged goods: it is written off instead and shows in Losses." |
| Manager PIN (`pin`) | `read` | over the limit and the person approves: "Needed, over US$20.00. Tafara Nyathi approved at 12:20." (ok); over and they do not: "Needed, over US$20.00. Ask Tafara Nyathi or Tendai Mhlanga." (warn) + the approval control; under: "Not needed under US$20.00." (**Defined here**) | |

Footer note "A refund is a new sale with a minus, linked to this one. The fiscal device signs it."; "Cancel"; primary
"Refund US$42.00" (the value, deposits included; disabled at US$0.00). Done: "RFD-0045 done. US$42.00 back on the card." /
"…US$42.00 in cash from the front till." / "…as credit note CN-0034." / "…as voucher GV-0102." with "Open" → the refund.

#### 5.8.2 Void — `?sheet=sale-void` over the sale (board `VoidSale.png`)

From `K.voidsale`. Title "Void SALE-31866"; sub "Today 11:40 · US$44.20 · card". Fields: Why (`seg`, the till rules' void
reasons, default the first: "Rang up wrong" · "Customer left" · "Test sale"); Note (`area`, 2 rows, optional, placeholder
"Optional"); Manager PIN (`read`): needed and they approve "Needed. Tafara Nyathi, 12:31." (ok); needed and they do not
"Needed. Ask Tafara Nyathi or Tendai Mhlanga." (warn) + approval control; not needed "Not needed." Footer note "Only today’s
sales can be voided; after that it is a refund. Stock goes back and the card payment is reversed." (cash: "…and the cash
comes back out of the front till."; EcoCash: "…and the EcoCash payment is reversed."). Primary "Void the sale"; done
"SALE-31866 voided."

#### 5.8.3 Add a customer — `?sheet=sale-customer` (**Defined here**)

Title "Add a customer to SALE-31866" ("Change the customer on SALE-31866"); sub "Front till · Chipo Dube · today 11:40".
Field Customer (`auto`, noun "customer", quick add Name and "Phone or WhatsApp" "+263 7"). Note "Points and the receipt go
to them. Nothing else on the sale changes."; primary "Add them" ("Save"); done "Tapiwa Marange added to SALE-31866."
Server `PATCH /sales/[id] { customerId }`; CUS:customers' points ledger (W-46) recalculates from the sale when it exists.

#### 5.8.4 Send on WhatsApp — `?sheet=sale-send` (**Defined here**)

Title "Send SALE-31866 on WhatsApp"; field "WhatsApp number" (`text`, mono, placeholder "+263 7"); toggle "Save it on a new
customer" (off). Primary "Send"; done "Sent to ••• 3388 on WhatsApp."

### 5.9 Lay-bys — `/retail/laybys` (board `LaybysList.png`) · FLR-06

ListFrame, source `retail-laybys` (in-memory loader), noun "lay-bys". Panel item: Lay-bys (badge "3").

**Header**: title "Lay-bys"; primary "+ New lay-by" → `?sheet=layby-new` (`retail.laybys:create`).
**Tabs**: "Paying" (PAYING) · "Ready to collect" (READY) · "Done" (COLLECTED, CANCELLED) · "All", with counts; default
Paying.
**Toolbar**: search "Lay-by or customer"; "State" choice — "Any", "On time", "Due within 7 days", "Overdue" (**Defined
here**: the board's chip reads "State Paying", which repeats the tab; the chip narrows inside the tab instead), default
"Any"; Filters: "Site" ("All sites" + sites), "Pay by" (period presets). Sorts "Due soonest" (default), "Newest first", "Most
left" (**Defined here**). Groups "State", "Customer".

**Columns** (grid `40px 110px minmax(170px,1.2fr) minmax(160px,1fr) 110px 110px 110px 130px 140px 44px`, min 1180px):

| Column | Key | Cell | Align | Value |
|---|---|---|---|---|
| Lay-by | `laybyNo` | `ref` → `?sheet=layby&id={id}` | start | "LAY-0031" |
| Customer | `customer` | `text` | start | name |
| What | `what` | `muted` | start | one line "Hennessy VS 700ml, gift box"; "<name> x2" for a quantity above 1; several lines joined with ", " |
| Total | `total` | `money`, sum | end | |
| Paid | `paid` | `money`, sum | end | |
| Left | `left` | `money`, sum | end | total − paid |
| Due | `dueOn` | `date` | start | "20 Oct 2026"; "Any time" when ready; "—" when done |
| State | `state` | `state`: "Paying" info, "Due in 3 days" warn, "Due today" warn, "Overdue" bad, "Ready to collect" ok, "Collected" hollow, "Cancelled" hollow | start | |

Totals band "Σ <n>" · Total · Paid · Left. **Deviation**: the board shows the ready LAY-0028 under the Paying tab (its Σ
US$286.90 includes it); tabs partition by status, so Paying shows three rows and US$244.90.
**Row menu** (**Defined here**): "Open" (the sheet), "Take a payment" (the sheet, focus on Paying now), "Hand it over"
(ready only), "Cancel the lay-by" (`--bad`, owner and manager).
**Bulk**: "Remind on WhatsApp" → CUS:customers' `message` sheet with the ticked lay-bys' customers and the text "LAY-{no}:
{left} left to pay by {due}." per person; "Export <n>".
**Empty**: guide "No lay-bys yet" / "A customer puts goods aside with a deposit and pays the rest over time." / "+ New
lay-by". **Phone card**: title customer, badge state, figure left, meta "{laybyNo} · due {dueOn}", figure2 total.
**Roles**: owner, manager, cashier read and write (cashier no cancel); bookkeeper read (no primary, no row actions but
Open); stock clerk 403.

#### 5.9.1 New lay-by — `?sheet=layby-new` (board `LaybyNew.png`), wide

From `K.laybynew`. Title "New lay-by"; sub "The floor › Lay-bys".

| Section | Field | Type | Options / default | Rules | Hint |
|---|---|---|---|---|---|
| — | Customer (`cust`) | `auto`, noun "customer" | quick add Name, "Phone or WhatsApp" "+263 7" | required; phone needed when reminders are on | "Needs a phone number for reminders." |
| "What is put aside" | lines (`lines`, label "Put aside") | `lines` with the product add row ("Add a product: search, scan, or add a new one"), head "Product" · "How many" · "Price" · "Value"; sub the category | price from the price-list engine for this site today; quantity default 1 | ≥ 1 line; quantity ≤ on hand | "Put aside means off the shelf: it no longer shows as available." |
| "Paying" | Deposit today (`dep`) | `money`, half | empty | ≥ the minimum, < total | "At least 20%." (the till rules' percentage; "At least 20%, US$9.20." once lines exist — **Defined here**) |
| | With (`with`) | `seg`, half | "Cash" · "EcoCash" · "Card" (the tenders the shop takes) | required | the drawer hint for cash (**Defined here**: the board has no tender for the deposit, and money cannot be taken without one) |
| | Pay by (`due`) | `text` (a date typed "20 October 2026"; a date picker on focus) | today + 17 days | after today, within the till rules' 90 days | – |
| | Remind on WhatsApp each week (`remind`) | `toggle` | on | | – |

Footer note "Prices are held at today’s price until the due date."; "Cancel"; primary "Start the lay-by". Done "LAY-0032
started. US$26.00 left to pay by 20 October." with "Open".

#### 5.9.2 A lay-by — `?sheet=layby&id=` (board `LaybyPay.png`)

From `K.laybypay`. Title the number ("LAY-0031"); sub "Rutendo Banda · Hennessy VS 700ml, gift box" (customer · what).

| Field | Type | Value / default | Rules | Hint |
|---|---|---|---|---|
| Paid so far (`paid`) | `read`, mono, half | "US$20.00 of US$46.00" | | |
| Left (`left`) | `read`, mono, half, right | "US$26.00" | | |
| Paying now (`amt`) | `money`, half | empty | > 0, ≤ left | |
| With (`how`) | `seg`, half | "Cash" · "EcoCash" · "Card"; default the last payment's tender | | the drawer hint for cash |
| Pay by (`due`) | `text` date | the lay-by's date | after today, within the limit | "Extend it here if they ask." |

Below the fields (**Defined here**) a compact read-only table of payments so far: "When", "How", "Amount", "By".

Footer: danger "Cancel the lay-by" (trash icon, `--bad`, owner and manager) → ConfirmDialog `cancellayby`; note "Cancelling
refunds what was paid, less any fee in Till rules, and puts the goods back."; secondary "Hand it over" (enabled when the lay-by
is READY, or when Paying now equals what is left — then it takes the payment and hands over in one); primary "Take US$13.00"
(the amount typed; "Save the date" when only Pay by changed; disabled when nothing changed). When READY: Paying now, With and
the primary are not drawn; "Hand it over" becomes the primary. Done: "US$13.00 taken. US$13.00 left." / "US$26.00 taken.
LAY-0031 is paid. Hand it over when they come." / "Pay by moved to 27 October." / "LAY-0031 handed over as SALE-31871." /
"LAY-0031 cancelled. US$18.00 paid back, US$2.00 kept as the fee." (all but the first **Defined here**). Collected and
cancelled lay-bys open the sheet read-only (fields as reads, no footer buttons but "Close").

### 5.10 End of day — `/retail/end-of-day` (board `EndOfDay.png`) · FLR-07

A page in the shell. Panel item: End of day.

**Header**: title "End of day"; sub in mono "Saturday 3 October · Harare Main Branch" (with more than one site the site is a
button opening a menu of sites — **Defined here**; a past day shows its date); actions "Past days" (outline link →
`/retail/end-of-day/days`) and primary "Close the day" (enabled when nothing blocks; while blocked it stays visible and
disabled with the tooltip "<n> things before closing"; hidden once closed and for the bookkeeper).

**Strip** (48px, `--ground`): left a chip — "2 things before closing" (warn) / "Ready to close" (ok) / "Closed at 22:04 by
Tafara Nyathi" (plain); right "Takings" + "US$3,912.20" (mono 15/600).

**Body**: grid `minmax(0,1fr) 360px`. Main (padding 20 24, gap 20):
1. Tills table (1px `--line`, radius 12): head "Till" · "Shift" · "Takings" · "Refunds" · "Difference" · "" (grid
   `minmax(0,1fr) 120px 120px 100px 110px 130px`); rows: till name with the cashier under it (12.5 `--ink-3`); "Closed 21:58"
   or "Still open" (`--bad`); takings and refunds (mono); difference ("None", "−US$4.50" in `--warn`, "+US$1.20", "–" while
   open); a link "Z-report" (once the day is closed: opens the frozen PDF; before: opens the X-report PDF of that till's day,
   marked "Not final until the day closes" — **Defined here**) or "Count and close" (→ the open shift's close page). A till
   with two shifts in the day shows one row (the last shift's cashier). Σ row "Σ 3 tills" · takings · refunds · difference.
2. "How people paid" tiles (5 equal tiles, 1px `--line`, radius 12): label 12.5 `--ink-3` and value mono 17/600: "Cash,
   US$" "US$2,610.00", "Cash, ZiG" "ZiG 4,288", "EcoCash" "US$702.40", "Card" "US$408.80", "On account" "US$31.00" — the
   tenders that are not zero in this fixed order (Transfer, InnBucks, Voucher, Lay-by after), up to five a row.

Aside (`--ground`, padding 20): `h2` "Before the day closes"; a card listing the four checks (rows: a 20px circle — `--ok`
filled with ✓ when done, hollow `--faint` ring when not — label 500, detail 12.5 `--ink-3`, an outline button right):
- "All shifts closed" — "2 of 3. Handheld 1 is still open." · "Close it" (→ the first open shift's close page). Done: "3 of 3."
- "Drawer differences signed off" — "Back till is US$4.50 short." · "Sign off" (→ that shift's sign-off). Several: "2 drawers
  to sign off." · "Sign off" (→ the first). Done: "Nothing to sign off." or "All 2 signed off."
- "Fiscal day 214 closed" — "Closes with the last shift and sends the Z-report to ZIMRA." (with the last shift) / "Closes when
  you close the day." (by hand) / done "Closed at 22:04. ZIMRA has the Z-report."; absent when the shop has no fiscal device.
- "Cash banked" — "US$2,610.00 to CBZ, slip photo." (from the field below: amount, the bank account's short name, ", slip
  photo" once a slip is added; "No slip yet." otherwise). Done once closed with a banked amount.

Then the field "Banked" (`money`, full width of the aside, default the day's "Cash, US$"), hint "Into CBZ current account.
Add the deposit slip photo." (the default bank account's name), and (**Defined here**) a `photo` field "Deposit slip"
(optional; uploads to `POST /end-of-day/slip`). After closing both read as text.

"Close the day" → `POST /end-of-day/close` → toast "Saturday 3 October closed. US$2,610.00 banked to CBZ."; the page
re-reads as closed.

**Empty** (no trading that day at the site): the tills table reads "Nothing was sold at Harare Main Branch on Saturday 3
October." and "Close the day" is not drawn.
**Roles**: owner, manager read and close; bookkeeper read; others 403 "Your role cannot view the end of day".
**Mobile**: aside under main; the tills table becomes cards (till, shift, takings, difference, link); tiles two a row.

### 5.11 Past days — `/retail/end-of-day/days` (board `DaysList.png`) · FLR-07

ListFrame, source `retail-days` (in-memory: one row per site per trading day that had shifts, closed or not), noun "days".
Panel item: End of day.

**Header**: back "End of day" (→ `/retail/end-of-day`); title "Past days"; no primary. No tabs.
**Toolbar**: search "Date" (matches "2 Oct", "October", "2026-10-02"); "Site All sites" (choice); Filters: "When" (period
presets, "Any time"), "State" ("Any", "Closed", "Signed off short", "Not closed") (**Defined here**). Sorts "Newest first"
(default), "Oldest first", "Most taken". Groups "Site", "State".

**Columns** (grid `40px 150px 170px 90px 130px 120px 130px 130px 120px 44px`, min 1120px):

| Column | Key | Cell | Align | Value |
|---|---|---|---|---|
| Day | `date` | `link` → `/retail/end-of-day?date={date}&site={siteId}` | start | "Fri 2 Oct 2026" |
| Site | `site` | `text` | start | |
| Fiscal day | `fiscalDayNo` | `num` | end | "213"; "—" when none |
| Takings | `takings` | `money`, sum | end | |
| Refunds | `refunds` | `money`, sum | end | |
| Cash difference | `cashDifference` | `money` (signed), sum | end | "−US$4.50", "US$0.00" |
| Banked | `banked` | `money`, sum | end | "—" when not closed |
| State | `state` | `state`: "Closed" hollow, "Signed off short" warn (closed with a negative difference), "Not closed" bad (**Defined here**) | start | |

Closed days read the frozen `RetailDayClose`; days not closed compute live with the same functions. Totals "Σ <n>" ·
takings · refunds · difference · banked.
**Row menu** (**Defined here**): "Open", "Download Z-reports" (`POST /z-reports/print { days: [that day] }`).
**Bulk**: "Export Z-reports" → `POST /z-reports/print { days }` (one PDF, one Z-report a page; toast "<n> of these days are
not closed yet." when some were not), "Export <n>".
**Empty**: guide "No days yet" / "Each day you close shows here with its Z-reports." **Phone card**: title day, badge state,
figure takings, meta site, figure2 banked.

### 5.12 Confirm dialogs (`lib/retail/asks.ts`)

| Key | Title | Body | Keep | Go | Fill |
|---|---|---|---|---|---|
| `closeuncounted` | "Close SH-00240 without counting?" | "Nobody counts the drawer. It closes as Not counted, the US$72.95 that should be in it stays on the shift, and a manager has to sign it off." + a required `area` "Why" (placeholder "The handheld was lost, for example") | "Keep it open" | "Close without counting" | bad |
| `cancellayby` | "Cancel LAY-0031?" | "Rutendo Banda paid US$20.00. US$18.00 goes back by EcoCash, US$2.00 is kept as the fee in Till rules, and Hennessy VS 700ml, gift box goes back on the shelf." (no fee: "It all goes back by EcoCash, and …") | "Keep it" | "Cancel the lay-by" | bad |

(**Defined here**: the canvas links "Close without counting" to the count page and has no ask for cancelling a lay-by.)

### 5.13 The till (no boards) · FLR-09, FLR-10

The canvas has no till boards beyond TillPairing. The till keeps its current layout (`components/retail/portal/*`) and gains
what the workflows need, in the till's existing primitives:
- **Approval dialog** (FLR-09): one component `pos-approval-dialog.tsx` — "A manager has to approve this" / the reason line
  ("Refund over US$20.00", "Void SALE-31866", "Cash out US$200.00", "Open the drawer without a sale") / chips of the people
  who can approve (SET-04's "{First} {L}." chips) / four PIN dots on the till's keypad / "Cancel". Opened when a POS route
  answers 409 `needsApprover` (or 403 `MANAGER_PIN_NEEDED` from SET-06) and re-sends with `approver`. Wrong PIN shakes and says
  "That PIN is not right."; locked says "Too many tries. Try again in 15 minutes."
- **Refund and void** (History view): the refund panel gains Why from the till rules, Money goes back as (as 5.8.1), Put it back
  on the shelf; void is offered only for today's sales.
- **Shift close** (Shift view): count by note per currency (the cash-movement view's denomination rows), blind, then the
  difference and "What happened" when the server asks.
- **Cash in or out**: the four whys of 5.6.2 replace the eight reason codes on screen; approval via the dialog.
- **Drawer open** button on the sale screen (SET-06 `POST /pos/drawer/open`).
- **Lay-bys**: a "Lay-by" button on the cart (customer pick, deposit, pay by — the same fields as 5.9.1) and a lay-by search
  on the Customers view to take a payment or hand over (the same routes).
- **Messages**: unread `RETAIL_STAFF_MESSAGE` and `RETAIL_SHIFT_SIGNED_OFF` notifications show on the lock screen under the
  cashier's name.
- FLR-10 (products and stock asks): the price-list engine (`GET /pos/pricing`, PRD-05) prices the cart; promotions show on the
  lines (PRD-09) and the manual promotion picker goes; bundle buttons and "make it a bundle" (PRD-08); selling gift vouchers
  and the voucher tender (PRD-10); "Bottles back · Pay" (STK-09 `POST /empties/bottles-back`); "Adjust stock" from the till
  (STK-04's endpoint). Each follows its owning spec's server rules.

---
## 6. What to remove

No redirects, no compatibility layers. Each removal lands in the unit named.

| Remove | Replaced by | Unit |
|---|---|---|
| `app/retail/page.tsx` as it is (P&L month blocks, two-row Needs action register, Tenders table, 12-month chart, "Open the till" link) | DashboardFrame Overview (5.1) | FLR-08 |
| `GET /api/v2/retail` (`app/api/v2/retail/route.ts`, 834 lines; its only caller is the old overview) and its entry in `lib/retail/route-guard-coverage.test.ts` | `GET /api/v2/retail/overview` | FLR-08 |
| `app/retail/sales/page.tsx` (`RecordListShell` + `ColumnList`, client-side filter over 120 rows, "Open the till" create) | `<ListFrame source="retail-sales" />` | FLR-01 |
| `app/retail/sales/[id]/page.tsx` as it is and `RetailSaleDetailBody` in `components/retail/sale-detail.tsx` (the helpers `retailMoney`, `SALE_WIDTH`, `saleExceptionLabel` go with FND-11) | `<RecordFrame kind="sale" />` and `GET /api/v2/retail/sales/[id]` | FLR-01 |
| The back office's reads of `GET /api/v2/retail/pos/sales` and `/pos/sales/[id]` | the `retail-sales` source and `GET /sales/[id]` (the POS routes stay for the till, `scope=mine`) | FLR-01 |
| `refundRetailSaleTransaction`, `voidRetailSaleTransaction` in `app/api/v2/retail/_services.ts` | `lib/retail/floor/refunds.ts#refundSale`, `voids.ts#voidSale` (one copy, used by the back office and the till) | FLR-02 |
| The free-text "(approved by <name>)" suffix written into `RetailSale.overrideReason` (`withApprover`) | `approvedById`/`approvedByName` columns | FLR-02 |
| The till's manager-password prompt in `components/retail/portal/pos-history-view.tsx` (and `pos-checkout-view.tsx` for price overrides) and every `managerOverride` body (SET-06 removes `lib/retail/manager-override.ts` on the server) | the approval dialog (5.13) and `approver { userId, pin }` | FLR-09 |
| `openRetailShiftTransaction`, `closeRetailShiftTransaction`, `recordRetailCashMovementTransaction` in `_services.ts` | `lib/retail/floor/shifts.ts`, `cash-moves.ts` | FLR-03, FLR-04 |
| `GET /api/v2/retail/shifts/context` (only the old open dialog read it), if FND-SHEET has not removed it | `till` and `person` lookups, `GET /shifts/new` | FLR-03 |
| The `countedCash` body of `POST /shifts/[id]/close` and `POST /pos/shifts/[id]/close`, and the till's single "Counted cash" field in `pos-shift-view.tsx` | `CloseInput` counts by note | FLR-04, FLR-09 |
| The automatic `createApprovalAction` on every close | written at close only for a balanced drawer; sign-off writes its own | FLR-04 |
| `POST /api/v2/retail/z-reports` (generate one register's day), `listRetailZReportCandidates` and the `registers` half of `GET /z-reports`, and the "take the Z-report" action in `components/retail/portal/pos-z-report-view.tsx` (the panel keeps listing taken reports) | Close the day generates every till's Z-report | FLR-07 |
| Id prefixes `RSL` (sales and reversals) and `RSH` (shifts) for new documents | `SALE`, `RFD`, `VOID`, `SH`, `LAY` | FLR-01, FLR-03, FLR-06 |
| The eight reason codes on the till's cash-movement screen (the enum keeps every value: audit rows hold them) | the four whys | FLR-09 |
| The till's manual promotion picker (PRD-09 lists it) | prices and promotions from the engine | FLR-10 |

Kept on purpose: `GET /api/v2/retail/pos/sales` and `/pos/sales/[id]` (the till's history), `RetailZReport` and its reading
routes, `lib/retail/z-report.ts` (the figures engine, now also used for X-reports), `lib/retail/cash-up.ts`,
`lib/retail/cash-movements.ts` (labels gain the four whys).

---

## 7. Build units

In build order. Every unit: one migration at most with its witness test in the same commit (applied to the dev and test
databases), `pnpm typecheck` passes (one at a time on this machine), `npx eslint <changed files>` has no new errors, the
named tests pass (`npx vitest run <files>`), screenshots with `scratchpad/smoke/lib.js` as `owner@bottlestore.test` (and the
roles named) at 1440×960 unless stated, compared side by side with the board PNG; the seed function for the unit added to
`scripts/seed-retail-demo.ts` and run on `hurudza-creative`. "Matches the board" means layout, hierarchy, copy, columns,
filters, actions and states; the figures are the tenant's real ones.

| Unit | Title | Size | Depends on | Boards | Workflows | Routes |
|---|---|---|---|---|---|---|
| FLR-01 | Sales: the list and the sale record | L | FND-LIST, FND-RECORD, FND-SHEET, FND-SHELL | SalesList, SaleRecord | W-41 (find the sale), W-44 (flagged sales) | `/retail/sales`, `/retail/sales/[id]` |
| FLR-02 | Refund and void, with a manager's approval | L | FLR-01, SET-06, STK-01, STK-04, PRD-10 | RefundNew, VoidSale | W-41 | `/retail/sales/[id]?sheet=refund`, `?sheet=sale-void` |
| FLR-03 | The shift: record, opening and cash in or out | L | FND-LIST, FND-RECORD, FND-SHEET, SET-04, SET-05 | ShiftRecord, ShiftOpen, CashMove, Main | W-37, W-38 | `/retail/shifts`, `/retail/shifts/[id]`, `?sheet=shift-open`, `?sheet=cash-move` |
| FLR-04 | Count and close a shift | L | FLR-03, SET-08 | ShiftClose | W-39 | `/retail/shifts/[id]/close` |
| FLR-05 | Sign off a short or over drawer | M | FLR-04 | SignOff | W-40 | `/retail/shifts/[id]?sheet=sign-off` |
| FLR-06 | Lay-bys | L | FND-LIST, FND-SHEET, FLR-01, FLR-03, STK-01, SET-06, SET-07 | LaybysList, LaybyNew, LaybyPay | W-42 | `/retail/laybys`, `?sheet=layby-new`, `?sheet=layby` |
| FLR-07 | End of day and past days | L | FLR-04, FLR-05, FND-LIST, SET-08 | EndOfDay, DaysList | W-43 | `/retail/end-of-day`, `/retail/end-of-day/days` |
| FLR-08 | The overview | L | FND-DASH, FLR-03, FLR-05, FLR-06, STK-01, SET-03 | Floor | W-40 (entry), W-44, W-51 | `/retail` |
| FLR-09 | The till: approvals, counts, refunds and lay-bys at the counter | L | FLR-02, FLR-04, FLR-06, SET-04, SET-06 | — (TillPairing panel 3 for the chips) | W-37, W-38, W-39, W-41, W-42, W-44 (at the till) | `/portal/pos/*` |
| FLR-10 | The till: prices, promotions, bundles, vouchers and bottles back | L | FLR-09, PRD-05, PRD-08, PRD-09, PRD-10, STK-04, STK-09 | — | (FLR:till asks of W-12, W-13, W-16, W-17, W-18, W-23, W-29) | `/portal/pos/*` |

### FLR-01 · Sales: the list and the sale record · L

- **Builds**: migration `20261004135000_retail_sale_floor` + witness; numbering (`SALE`, `RFD`, `VOID`); source `retail-sales`
  (database-side `page()`, tab counts, totals that leave voided sales out); record kind `sale` (sale and refund variants);
  `GET/PATCH /sales/[id]`, receipt PDF, `send`, bulk `send`, `reviewed`; sheets `sale-customer`, `sale-send`; audit events
  `REPRINTED`, `SENT`, `REVIEWED`; `lib/retail/floor/takings.ts` (decision 10) with its tests; seed FLR-01. Removes the FLR-01
  rows of section 6.
- **Tests**: `lib/retail/sale-floor-migration.test.ts`; `lib/reports/loaders/retail/floor-sales.test.ts` (tab counts ignore
  filters; Σ excludes voided; page 2 totals equal page 1 totals; cashier scope); `lib/retail/floor/takings.test.ts` (a sale and
  its void net to zero; a refund subtracts; deposits outside).
- **Acceptance**:
  - `/retail/sales` beside `SalesList.png`: header "Sales" with no primary; tabs "Today · Refunds · Voids · All" with counts;
    toolbar "Sale, receipt, customer or product", "Till Any", "Cashier Anyone", "Filters 1" (Site), count, "Newest first |
    Group | Columns", "Export ⌄"; columns Sale … State; the six fixture rows present with the board's values and badges
    (Sold hollow, Refund amber, Voided crimson; "Walk-in" faint; Tapiwa Marange a link); Σ row; pager.
  - Tab counts equal SQL on the tenant; Till = Back till narrows the rows and the Σ; search "Jameson" finds RFD-0044 and the
    sale it refunds; "Export › Spreadsheet" downloads the filtered rows.
  - `/retail/sales/<SALE-31866>` beside `SaleRecord.png`: "‹ Sales / SALE-31866 Front till · Chipo Dube", "Refund | Reprint the
    receipt | Send on WhatsApp | ⋯"; chips "Sold", "Fiscal receipt signed"; "Total US$44.20"; five KPIs; "This till today, by
    hour" with "Today | This week" and only the 11:00 bar dark; tabs Lines 2 · Payment 1 · Receipt 1 · Activity; Lines Σ
    "US$44.20" and "View the receipt"; rail Sale, Paid, Fiscal with the board's values.
  - "Add a customer to it" → Tapiwa Marange → toast "Tapiwa Marange added to SALE-31866."; the Customer cell on the list links
    to him; Activity "Changed Customer from Walk-in to Tapiwa Marange". "Reprint the receipt" opens an 80 mm PDF marked "Copy";
    Activity "Printed a copy of the receipt". As the cashier Chipo Dube only her sales list; as the stock clerk "Your role
    cannot view sales."; as the bookkeeper every sale, no Refund.

### FLR-02 · Refund and void, with a manager's approval · L

- **Builds**: `lib/retail/floor/drawer.ts` (decision 2), `refunds.ts`, `voids.ts` (moved services, shift optional, approval
  columns, restock/write-off, credit note and voucher through PRD-10, same-day rule), `GET/POST /sales/[id]/refund`,
  `GET/POST /sales/[id]/void`; `pos/sales/[id]/refund|void` call the same services; sheets `refund`, `sale-void`; the Manager
  PIN `read` field with STK-04's approval control (`components/workspace/fields/approval.tsx` if STK-04 has not built it).
- **Tests**: `lib/retail/floor/drawer.test.ts` (the four-step order, the 409); `lib/retail/floor/refunds.test.ts` against the
  test database (a part refund; a second refund of the rest; over the limit without approval → 409 `needsApprover`; with a
  wrong PIN → 400 and the lockout counter; credit note issues `CN-` with the value; `restock: false` writes RECEIPT then
  ADJUSTMENT BROKEN and a LOSS journal); `voids.test.ts` (yesterday's sale → 409; a refunded sale → 409; AFTER_5_MINUTES).
- **Acceptance**:
  - `/retail/sales/<SALE-31866>?sheet=refund` beside `RefundNew.png`: 760px sheet "Refund SALE-31866" / "Front till · Chipo Dube
    · today 11:40 · card"; "What comes back" lines (no add row); "How" with Why, Money goes back as "The card | Cash | Credit
    note | Voucher", the switch with its hint, Manager PIN; note and "Refund US$42.00".
  - As Tafara Nyathi: Johnnie Walker 1, Why Damaged, The card, shelf off → toast "RFD-<n> done. US$42.00 back on the card.";
    the sale reads "Part refunded"; Sales › Refunds +1 with −US$42.00; Stock › Movements shows REFUND +1 and BROKEN −1 with
    the RFD number; Insights › Losses lists "Damaged"; the refund record's Receipt tab shows the credit note.
  - As Chipo Dube (cashier) the same refund shows "Needed, over US$20.00. Ask Tafara Nyathi or Tendai Mhlanga." and the PIN
    control; Tafara's PIN approves it and the refund's rail reads "Approved by Tafara Nyathi"; a US$13.00 refund needs no PIN.
  - Cash refund with no open shift at the site → footer "Open a shift at Harare Main Branch to hand cash back."
  - `?sheet=sale-void` on a sale from today beside `VoidSale.png` → "SALE-<n> voided."; the row's state "Voided", Voids +1, the
    Σ drops by it, stock back; on yesterday's sale the ⋯ item is disabled with "Only today’s sales can be voided."

### FLR-03 · The shift: record, opening and cash in or out · L

- **Builds**: migration `20261004135100_retail_shift_floor` + witness; `SH-` numbering; `lib/retail/floor/shifts.ts#openShift`
  (FND-07's `cashierId` plus the till-busy, cashier-busy, ZiG float rules), `GET /shifts/new`; `cash-moves.ts` (approval,
  the four whys, requisition payout hook, `RETAIL_CASH_MOVEMENT`/`RETAIL_PETTY_CASH` postings and their default rules,
  accounts 5110); `GET /shifts/[id]` as `ShiftView`; X-report PDF (`lib/retail/z-report.ts` figures over one open shift,
  rendered with `renderPdfFromHtml`), Print Z-report redirect; record kind `shift` content (5.5); sheets `cash-move`,
  `staff-message`; the Shifts row menu and "Needs sign-off" option (5.4); `RETAIL_STAFF_MESSAGE` notifications; seed FLR-03.
- **Tests**: `lib/retail/shift-floor-migration.test.ts`; `lib/retail/floor/shifts.test.ts` (open for another cashier as a
  manager; a cashier opening for someone else → 403; till busy → 409; ZiG float adds at today's rate to expected);
  `cash-moves.test.ts` (each why's type and reason code; out more than the drawer → 400; the cashier without approval → 409;
  journal lines balance).
- **Acceptance**:
  - `/retail/shifts/<the open Front till shift>` beside `ShiftRecord.png`: header actions and primary as the board; strip with
    ✓ Opened, Trading in solid ink, the cashier chip and "Open 6h 12m"; five KPIs with the board's labels and notes ("07:58
    counted in", "1 drop to the safe", "in cash sales", "not counted yet"); "Takings per hour" without a range; tabs "Sales ·
    Cash in and out · How people paid · Activity" with counts; Sales Σ line in the board's form; read-only rail with "To the
    safe −US$20.00 at 10:04".
  - "Record cash in or out" beside `CashMove.png` (sheet over the dimmed record): Out of the drawer, Drop to the safe, 200.00,
    US$, "Tafara Nyathi, 12:31" as the manager → toast "US$200.00 dropped to the safe. Drawer should hold US$… plus sales.";
    KPIs and the Cash in and out tab update; a journal Dr Cash vault / Cr Till cash US$200.00 exists; Activity "Dropped
    US$200.00 to the safe".
  - `/retail/shifts?sheet=shift-open` beside `ShiftOpen.png` (FND-07's acceptance) plus: the float hint "Counted in. Last close
    left US$100.00." from the Back till's last close; the ZiG float field; opening for Kuda Banda (or Farai Moyo) on a free till
    → "SH-<n> open on the … for …"; the cashier's own open refused with "… already has a shift open on …".
  - Row menu of an open shift shows Record cash in or out, Count and close, Print X-report; "Print X-report" opens a PDF marked
    "X-report, not final".

### FLR-04 · Count and close a shift · L

- **Builds**: migration `20261004135200_retail_shift_count` + witness; `lib/retail/floor/count.ts#countDrawer` (pure);
  `closeShift` (counts, tolerance, note rule, float left, to the safe, `RETAIL_SHIFT_CLOSE` posting, notification,
  `closeFiscalDayIfLastShift`); `close-uncounted`; `GET /shifts/[id]/close`; the page 5.7; ConfirmDialog `closeuncounted`;
  seed FLR-04. `pos/shifts/[id]/close` calls `closeShift` (the till's screen changes in FLR-09).
- **Tests**: `lib/retail/shift-count-migration.test.ts`; `lib/retail/floor/count.test.ts` (the board's counts give US$167.00
  + ZiG 925 at 26.80 = US$201.51 and "None" against US$201.50; −US$4.50 needs a note; float left more than the US$ counted →
  error); `shifts-close.test.ts` against the test database (blind 400 reveals the difference; two journals; the last open
  shift closes the fiscal day with "With the last shift").
- **Acceptance**:
  - `/retail/shifts/<open Front till>/close` beside `ShiftClose.png`: header "SH-0… / Count and close Front till · Chipo Dube ·
    open …", "Print X-report", "Close the shift"; the line; the US$ and ZiG tables; the aside's summary with "Counted, ZiG at
    26.80", the Difference row, "What happened" with its hint, "Not counted, checked", "After closing".
  - Typing the board's counts as the manager reads "None"; closing → banner "Closed at hh:mm. The drawer balanced."; the
    shift reads Balanced in the list and its record shows the Close group; journal Dr Cash vault / Cr Till cash for "To the safe".
  - As Chipo Dube on her own drawer the expected and the difference read "Shows when you close"; a count US$4.50 short answers
    "It is out by −US$4.50. Say what happened, then close." with the summary revealed; with a note it closes, Tafara and Tendai
    get "SH-… is short US$4.50", and the Overview's Needs action gains it.
  - ⋯ "Close without counting" on the stale Back till shift → the ask → "Not counted" in the list, a notification, Activity
    "Closed without a count: …".

### FLR-05 · Sign off a short or over drawer · M

- **Builds**: migration `20261004135300_retail_shift_sign_off` + witness; `lib/retail/floor/sign-off.ts`; `POST
  /shifts/[id]/sign-off`; sheet `sign-off`; `RETAIL_SHIFT_RECOVERY` posting and account 1150; `RETAIL_SHIFT_SIGNED_OFF`
  notification; record chips and the Sign-off rail group; seed FLR-05.
- **Tests**: `lib/retail/shift-sign-off-migration.test.ts`; `lib/retail/floor/sign-off.test.ts` (recover only when short;
  own drawer → 403; LOOK_INTO then ACCEPT allowed; a final sign-off twice → 409; the recovery journal balances).
- **Acceptance**:
  - From the Overview "Three drawers short this week" → the oldest short shift with the sheet open, beside `SignOff.png`: "Sign
    off a short drawer" / "SH-… · Front till · Chipo Dube · <day>"; Difference "−US$7.15 short"; Counted "US$… against US$…
    expected"; three cards; Note; footer "Chipo sees the sign-off and the note in the app." and "Sign off".
  - Recover with a note → toast "SH-… signed off. US$7.15 to be recovered from Chipo Dube."; chips "Signed off",
    "Recovering US$7.15"; Chipo's notifications show it with the note; journal Dr Staff owe the shop / Cr Cash over short; the
    Overview row now reads "Two drawers short this week · Farai Moyo once, Chipo Dube once · −US$8.64".
  - Look into it keeps the row on the Overview; the record shows "Being looked into"; a later Accept clears it. Tafara cannot
    sign off a drawer he closed as its cashier (403 message in the footer).

### FLR-06 · Lay-bys · L

- **Builds**: migration `20261004135400_retail_laybys` + witness; `LAY-` numbering; permissions `retail.laybys`;
  `lib/retail/floor/laybys.ts` (start, pay, change date, hand over with its sale, cancel, reminders); routes 4.4; source
  `retail-laybys`; sheets `layby-new`, `layby`; ConfirmDialog `cancellayby`; nav badge provider; the three till-rules columns
  (and a "Lay-bys" section on SET-06's Till rules page: "Smallest deposit" (text "20%"), "Fee for cancelling" (money), "Longest
  time to pay" (text "90 days") — **Defined here**, owner and manager); `RETAIL_LAYBY_PAYMENT`/`_CANCEL` postings, account
  2260 and the `LAYBY` tender mapping; the worker job; seed FLR-06.
- **Tests**: `lib/retail/laybys-migration.test.ts`; `lib/retail/floor/laybys.test.ts` against the test database (deposit under
  20% → 400 with "At least US$9.20."; put aside lowers on hand by the lines; paying the rest makes it READY; hand over posts a
  sale paid "LAYBY" with no second stock movement and a balanced journal moving 2260 to revenue and VAT; cancel with a US$2.00
  fee pays back the rest and returns stock; a cashier cancelling → 403); `lib/reports/loaders/retail/floor-laybys.test.ts`
  (tabs partition; Σ).
- **Acceptance**:
  - `/retail/laybys` beside `LaybysList.png`: "Lay-bys" and "+ New lay-by"; tabs Paying 3 · Ready to collect 1 · Done 12 · All
    16; toolbar "Lay-by or customer", "State Any", "Filters", "Due soonest"; columns and badges (LAY-0027 "Due in 3 days" amber,
    LAY-0028 under Ready to collect "Ready to collect" green with "Any time"); Σ row; panel badge "3".
  - "+ New lay-by" beside `LaybyNew.png`: Rutendo Banda, Hennessy VS 700ml, gift box × 1, deposit 20.00 cash, Drawer "Front till ·
    Chipo Dube" (three drawers are open, so the sheet asks), pay by 20 October, reminders on → "LAY-0032 started. US$26.00 left to pay by 20 October."; On hand for the Hennessy drops by 1 with a movement
    "Put aside · LAY-0032"; the Front till's expected cash rises by US$20.00; a WhatsApp message queued.
  - LAY-0031 row → sheet beside `LaybyPay.png`: Paid so far "US$20.00 of US$46.00", Left "US$26.00", Paying now, With, Pay by,
    the footer with "Cancel the lay-by", "Hand it over", "Take US$13.00". Take US$13.00 EcoCash → "US$13.00 taken. US$13.00
    left."; take the rest and Hand it over → "LAY-0031 handed over as SALE-<n>." and the sale is on the Sales list paid
    "Lay-by" with a fiscal receipt; the lay-by moves to Done.
  - As Chipo Dube there is no "Cancel the lay-by"; as the bookkeeper the list reads and the sheet is read-only.

### FLR-07 · End of day and past days · L

- **Builds**: migration `20261004135500_retail_day_close` + witness; permissions `retail.end-of-day`; `lib/retail/floor/
  day-close.ts` (view, checklist, close: Z-reports in the transaction, fiscal day by hand, `RETAIL_DAY_BANKED`); routes 4.5
  (incl. slip upload and Z-report PDF); the page 5.10; source `retail-days` and its page 5.11; Z-report print by days;
  removes the FLR-07 rows of section 6; seed FLR-07.
- **Tests**: `lib/retail/day-close-migration.test.ts`; `lib/retail/floor/day-close.test.ts` against the test database (open
  shift → 409; unsigned difference → 409; LOOK_INTO → 409; closing twice → 409; Z-reports created per till and equal to
  `generateRetailZReportTransaction`'s; the banked journal); `floor-days.test.ts` (closed vs not closed rows; states).
- **Acceptance**:
  - `/retail/end-of-day` (today) beside `EndOfDay.png`: header "End of day" with the mono sub, "Past days", "Close the day"
    (disabled while blocked); strip chip "<n> things before closing" and "Takings US$…"; the tills table with "Still open" in
    crimson and "Count and close" on the open tills, Σ row; the payment tiles; the aside's four checks with "Close it" and
    "Sign off", "Banked" with the CBZ hint and the slip field.
  - Closing the open shifts and signing off makes the chip "Ready to close"; "Close the day" with US$… banked and a slip →
    toast "<Day> closed. US$… banked to CBZ."; each till's "Z-report" opens its frozen PDF; Past days' first row is today
    "Closed"; journal Dr Operating bank / Cr Cash vault.
  - `/retail/end-of-day/days` beside `DaysList.png`: back "End of day", "Past days", search "Date", "Site All sites",
    columns Day · Site · Fiscal day · Takings · Refunds · Cash difference · Banked · State with ⋯; the 30 September row
    "Signed off short"; the day the stale Back till shift belongs to "Not closed"; tick three → "Export Z-reports" → one PDF.
  - As the bookkeeper both pages read, no "Close the day"; as the cashier 403.

### FLR-08 · The overview · L

- **Builds**: `lib/retail/floor/overview.ts` (pure tile builders) and `GET /api/v2/retail/overview`; `app/retail/page.tsx` on
  DashboardFrame (5.1) with the setup checklist slot; removes the FLR-08 rows of section 6; seed FLR-08.
- **Tests**: `lib/retail/floor/overview.test.ts` (windows and "against" for each period; Needs action order, words for counts,
  "Chipo Dube twice, Farai Moyo once"; tills now states from `tillState`; shares sum to 100; margin hidden without
  view-cost); a route test that the bookkeeper gets 200 without the "Open shift" capability and the cashier 403.
- **Acceptance**:
  - `/retail` at 1440×1460 beside `Floor.png`: header "Overview" and "+ Open shift"; toolbar "Today | This week | This month",
    "Site Harare Main Branch", live line; hero "Takings today" with the pill, the comparison line and the two-line sparkline;
    three KPI tiles with seven bars; "Needs action" with its count pill and rows (stale Back till → its close page; "Three
    drawers short this week · Chipo Dube twice, Farai Moyo once · −US$15.79" → sign-off; low stock → On hand Low; "Two
    receipts not yet fiscalised · Handheld 1 offline since … · will send on reconnect" → Tills; the buying and products rows
    when their seeds have them); "Tills now 3" with Open, Open 52h and Offline; "Takings by day last 30 days" with 30 bars
    and its total; "How people paid today" share bar and legend; the three rank lists with their links.
  - Every figure equals SQL over the tenant for the period and site (takings by decision 10); switching to "This week"
    relabels the tiles ("Takings this week", "on last week by now"); Site "All sites" includes Borrowdale.
  - As the manager the same page; as the bookkeeper no "+ Open shift"; a manager without view-cost does not exist, so the
    margin rule is covered by the unit test.

### FLR-09 · The till: approvals, counts, refunds and lay-bys at the counter · L

- **Builds**: `pos-approval-dialog.tsx` and its use on refund, void, cash in or out, drawer open, discounts; the History
  refund panel (5.13); the Shift view's count by note (blind) and float left; the cash screen's four whys; the drawer-open
  button; lay-by start, payment and hand over at the till; messages on the lock screen; the ZiG float at opening. Removes
  the FLR-09 rows of section 6.
- **Tests**: `components/retail/portal/pos-approval-dialog.test.tsx` (re-sends with `approver`, shows the wrong-PIN and locked
  states); `lib/retail/pos-offline-queue.test.ts` extended (a queued refund needing approval is not replayed blind: it stays
  queued with "Needs a manager" until approved online).
- **Acceptance** (on a paired browser till from SET-04, signed in by PIN as Chipo Dube): a US$27.90 refund opens the approval
  dialog, Tafara's PIN approves it, the back office shows the refund approved by Tafara Nyathi; closing her shift counts by
  note without seeing the expected and is asked "What happened" when short; a lay-by payment taken at the till appears on
  the lay-by's sheet with the till's drawer; a message sent from the shift record shows on her lock screen.

### FLR-10 · The till: prices, promotions, bundles, vouchers and bottles back · L

- **Builds**: the till side of PRD-05 (cart priced by `GET /pos/pricing` and re-priced on the server), PRD-08 (bundle
  buttons, "make it a bundle"), PRD-09 (promotions on lines; the manual picker removed), PRD-10 (sell a gift voucher; the
  voucher tender with code and secret check), STK-09 ("Bottles back · Pay"), STK-04 ("Adjust stock" from the till). The
  server rules are those specs'; this unit is the till's screens and the `pos/sales` body.
- **Acceptance**: each owning spec's till acceptance line passes on a paired till (e.g. PRD-05's Happy hour price on a Friday
  17:30 sale; PRD-10's GV- voucher sold and then redeemed; STK-09's bottles back paying US$8.40 out of the drawer with the
  shift's expected cash dropping by it).

---

## Open questions

1. **Manager PIN in the back office.** SET-06 accepts a manager PIN only from a paired device; STK-04 accepts one in the back
   office for stock adjustments. This spec follows STK-04 (back-office PIN with the till lockout) so a cashier in the back
   office can be approved as the RefundNew and VoidSale boards show. Confirm, or restrict back-office refunds over the limit
   to managers' own sessions.
2. **The canvas's boards are snapshots that disagree**: the Back till's cashier (Kuda Banda on Sales and End of day, Farai Moyo
   on the Overview and Shifts), "Kora handheld" (Overview) vs "Handheld 1" (End of day, Tills), the panel badge "2 open" vs three
   tills trading on the Overview, the shift record's 4 sales vs the Overview's 91 on the same till, SignOff's SH-00239 "yesterday"
   vs Past days' 30 September "Signed off short", and End of day's figures vs the Overview's. The seed (3.8) picks one
   consistent story: three open shifts (badge "3 open"), the Back till on Farai Moyo's stale shift. Confirm.
3. **The stale Back till shift keeps its day open.** A shift belongs to the day it opened; with the Back till open for 52
   hours, that day reads "Not closed" in Past days (the board shows it "Closed"), and with "Close the fiscal day · With the
   last shift" the fiscal day cannot close by itself while any shift stays open. Should Close the day (or the fiscal day)
   ignore other days' stale shifts?
4. **Recovering a shortage.** "Deducted from Chipo’s next pay" implies payroll; cashiers are users, not always employees on
   payroll. This spec books a receivable (Staff owe the shop) and records `recoverAmount`; it writes nothing to payroll and has
   no repayment flow. The admin spec's People record should show what is owed. Confirm whether payroll deductions are in scope.
5. **Lay-by rules have no board**: minimum deposit (20%), cancellation fee, longest time to pay. This spec adds them to
   `RetailTillRules` with a small "Lay-bys" section on Till rules (**Defined here**). Confirm, or leave them fixed.
6. **Money in the back office goes through a drawer** (decision 2). A manager taking a lay-by deposit in cash in the office
   needs an open shift at the site. Confirm the rule (the alternative is a "back office cash" float of its own).
7. **ZiG banking.** The board's "Banked" is US$ only; ZiG cash ("Cash, ZiG ZiG 4,288") stays in the vault. Add a ZiG banked
   field?
8. **Z-reports move to Close the day.** The till can no longer take a Z-report per register (its Reports panel lists them).
   Confirm that a shop never needs a per-till Z before the site's day closes.
9. **Deviations from boards** (each explained where it is): Sales Σ leaves voided sales out; the sale chart darkens only the
   sale's hour; the refund sheet has no "Add a product" row; the Lay-bys State chip narrows inside the tab instead of repeating
   it, and Paying lists only paying lay-bys; LayByNew gains a "With" field; "Close without counting" is a confirm, not the count
   page.
10. **`RetailSale.customerId`** is added here (FLR-01). The customers spec (points, accounts) must use it, not add its own.
11. **Margin "on cost".** The board's "22.3% on cost" equals margin ÷ total; this spec computes margin ÷ cost (what "on cost"
    means), so the percentage differs from the board's sample.
12. **Numbering.** New sales are `SALE-#####`, refunds `RFD-####`; existing rows keep `S-000930` and `RSL-0005`. The seed
    regenerates the demo tenant's history in the new form. Confirm no live tenant needs its old receipts renumbered (they
    cannot be: they are fiscalised).
13. **Foundations reconciliation.** Foundations' Shifts row menu opens Count and close as `?sheet=shift-close`; this spec makes
    it the page `/retail/shifts/[id]/close` (the board is a page). Foundations' seed has two open shifts; this spec adds the
    Handheld 1 shift (three).
14. **"Pay a supplier"** needs BUY:requisitions' payout service to accept a till drawer as the source; until it exists the card
    is not drawn.
15. **"Remind on WhatsApp"** (bulk) needs CUS:customers' `message` sheet and SET-07's WhatsApp credentials; without credentials
    messages are logged FAILED "WhatsApp is not set up".
