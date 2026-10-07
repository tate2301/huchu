# 98 Decisions

These settle the "Decide" items in `99-coverage.md` and the open questions the specs raised. They take precedence
over any spec that says otherwise.

Every other resolution in `99-coverage.md` §3 stands as written, and the unit it names applies it.

Two rules hold throughout: the canvas chooses the direction, and there is no backward compatibility.

## The six items to settle

**C-04 One WhatsApp webhook.** There is one public route, `POST/GET /api/webhooks/whatsapp`, owned by SET-07.
- It uses these environment names: `META_WHATSAPP_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_VERIFY_TOKEN` and `META_WHATSAPP_APP_SECRET`.
- It verifies the signature, then sends each event to the handler registered for it:
  - reply matching on orders (BUY-02);
  - STOP and opt-out (CUS-06);
  - the owner's yes to support access (ADM-10, optional).
- With no token configured, messages stay queued and the screens say so; nothing fails.

**C-14 One settings contract.** Every settings page loads and saves through `GET/PATCH /api/v2/retail/settings/[page]`. Each save writes one `RETAIL_SETTINGS.CHANGED` event.

Real actions keep their own endpoints:
- test print;
- fiscal connect and close day;
- Post now;
- pairing;
- plan change;
- the ZiG rate.

**C-31 One manager-PIN module.**
- SET-06 builds `lib/retail/manager-pin.ts` with `verifyManagerPin`. A request carries `approver { userId, pin }`.
- A missing or wrong approval answers 409 `{ needsApprover: true, reason }`.
- It works at the till and in the back office.
- Lockout follows ADM-03: after five wrong tries the PIN is locked until a new PIN is issued, answering 423.
- STK-04, FLR-02, FLR-09 and CUS-10 use this module. ADM-06 adds the audit call.

**C-33 Paying from a till: keep the earlier decision.** The owner already decided this. A requisition payout is recorded as paid from a money account and never moves a till drawer, so there is no `RetailCashMovement`.
- BUY-05's model stands.
- FLR-03 does not add `requisitionId` to cash movements, and it does not add a "Pay a supplier" reason.
- The "Pay a supplier" card on `CashMove` is not built. Cash in or out offers the other reasons only.
- BUY-08's "Cash now" pays from the chosen money account, for example "Front till float". That is a money account in the books, not the drawer.

**C-35 Reports follow the Roles board.** Reports are offered to the roles the Roles board gives them to: owner, manager and bookkeeper. Cashiers and stock clerks have no Reports destination.
- A template shared with "Everyone" reaches everyone who can open Reports.
- The sheet's hint says: "Everyone who opens reports".
- The rows any reader sees are still limited by their own role.

**C-40 Test accounts.** There is one account per role, and every acceptance line uses these. The password is `RetailDemo123!`.

| Role | Account | Name |
|---|---|---|
| Owner | `owner@bottlestore.test` | (as seeded) |
| Manager | `tafara.manager@bottlestore.test` | Tafara Nyathi |
| Cashier | `chipo.till@bottlestore.test` | Chipo Dube |
| Cashier, Borrowdale | `farai.till@bottlestore.test` | Farai Moyo |
| Stock clerk | `tendai.stock@bottlestore.test` | Tendai Sibanda |
| Bookkeeper (`FINANCE_OFFICER`) | `bookkeeper@bottlestore.test` | Ruvimbo Chari |
| Corelith superuser | the platform superadmin the seeds already create | — |

Rudo Moyo stays a stock clerk in the data (she counts on the phone), but she is not a login used for acceptance.

For C-42, Farai keeps Borrowdale and also gets Harare Main Branch, so the stale Back till shift stays his.

## Foundations open questions (00-foundations.md)

1. **Notifications** leave the header in every product. They move into the logo tile's account menu, which shows an unread dot.
2. **Pinned rail marks and the area-map panel view** are removed in every product.
3. **Tenant branding colour** no longer tints the interface. The product theme does. The tenant logo still shows.
4. **IBM Plex Mono** replaces Atkinson Hyperlegible Mono in every product.
5. **Routes** are module-prefixed as in 00-foundations §5.3.4, with Reports at `/retail/reports` (C-16) and import at `/retail/products/import` (C-17).
6. **Shifts** defaults to "Opened: Last 30 days".
7. **FINANCE_OFFICER** gets its grants from ADM-01's matrix, transcribed from the Roles board.
8. **Items with no board** ("Defined here") are built as the spec defines them. No new boards are drawn first.
9. **Corelith Workspace (G1) against the canvas**: follow the canvas.
   - Rows use `--selected`.
   - The sheet is 520 or 760 px wide.
   - Totals sit on `--ground`.
   - Only the selected state comes from G1: solid ink with white text.
   - "Selected state" means the chosen item only: a selected row, the chosen cell of a segmented control, the current nav item. Everything around it follows the canvas:
     - A segmented control is the board's row of equal white cells with borders and dividers, not a filled track. Only the chosen cell is solid ink with white text.
     - A switch that is on uses the board's green. A switch is a setting, not a selection.
     - A card's border stays light whether its switch is on or off.
     - These live in the shared `.cx-seg--field` and `.cx-switch-row` classes in `app/themes/workspace.css`, so every settings page follows them together.
10. **Chart ranges** appear only where the record kind has a range.
11. **Company › Money**: SET-01 makes it editable. Changing the base currency is refused while sales exist, and the field explains why.

## Area open questions

Each area spec lists its own open questions. A build unit takes the answer its spec recommends. If the spec has no recommendation, the unit takes what the board draws.

The unit records each choice in its report. If a board draws something with no data behind it (an integration that does not exist, a figure nobody keeps), the unit builds the honest version: it hides the option or rewords the hint. It never fakes a value.

Recorded unit choices:

- **SET-09 account fields list only the types they take.** Sales lists income accounts, Stock asset accounts, a tender asset accounts
  (vouchers: asset or liability), and so on (`ROLE_TYPES`, `TENDER_TYPES`, `VOUCHER_TYPES` in `lib/retail/posting-words.ts`). The save refuses
  any other type by field, so the list never offers what the save would refuse. A quick-added account appears in every field of its type,
  not in every field.
- **SET-09 posts one run per company at a time.** "Post now" pressed while a run is going joins it; what could not post is tried again by
  the next run, and "Ready to post" shows a fourth warn line while anything is waiting to be tried again (10-setup §4.9).
- **SET-08 words where the board's are not what happens.** The "Close the fiscal day" hint reads "Closing sends the Z-report to
  ZIMRA. A day left open takes tomorrow’s sales too." (the board: "… blocks tomorrow’s sales"; an open day takes them). The
  Close day ask reads "The Z-report goes to ZIMRA, and the next sale opens day {n+1}." (the spec: "… sales wait for tomorrow’s
  day"; the next sale opens the next day).
- **SET-08 sends a day's report only from "Close day", the last shift closing and the retail worker.** No sale and no shift
  opening calls ZIMRA's CloseDay. A day whose report never went out (ZIMRA silent when the close first asks how the device
  stands) stays open and the tills keep signing into it; the worker sends the report every five minutes while no shift is
  open, so a day a shift is still selling into stays open past midnight and closes with that shift. One close holds a day
  at a time: a second close (by hand, with the last shift, from the worker or the books' console) is refused while the
  first is on its way, and a close that died is taken over after five minutes. A day stops taking receipts before its
  report is counted (closing), so the report counts every receipt in it. A sale's day is settled in the commit that
  records it, under a lock on the device's day that the close's claim takes too: the sale is in the day (and in its
  report) or it waits — nothing is decided after the commit, which only sends the receipt. A sale that finds no day open
  opens one in its commit.
  Once a day's report has gone out, the day is never given back to the tills, whatever comes back: ZIMRA may have taken it
  with only its answer lost. When the report goes unanswered the close asks ZIMRA how the day stands (GetStatus); closed
  there, the day is recorded closed with its report. Otherwise, or while ZIMRA stays silent, the day stays closing, free
  for the next close ("ZIMRA did not answer day {n}'s report, so the day stays closed to sales and they wait for day
  {n+1}. Close it again once ZIMRA is back."), and so does a day whose report ZIMRA refused. Every close of a closing day
  asks ZIMRA first, so a report it took is recorded and not sent again; the worker closes a closing day again every five
  minutes (with the last shift), even while a shift is open, since its sales wait.
  While no day is open because a report is on its way or waits, a sale rung meanwhile waits unsigned and marked ("Day
  {n}'s report waits for ZIMRA. This sale is signed as soon as a day is open again.", the till's "Waiting for ZIMRA").
  Once the report is taken, day {n+1} opens no later than the first of them and no earlier than day {n}'s last receipt,
  and they are signed there, oldest first and before any sale rung after them; the retail worker signs any a close did
  not get to.
- **SET-08 refuses no sale for its date, and moves no sale's time.** ZIMRA takes no receipt dated before its day opened
  or before the last one it took, so a receipt carries its own date (`FiscalReceipt.receiptDate`, kept so a resend sends
  the same one): the sale's own time, never later than now, or the last receipt's date when that is later. An offline
  sale sent in after another till's receipts, or dated before the open day began, is signed into the open day with that
  date; every sale that took money gets one receipt, and receipt dates never go backwards. `RetailSale.postedAt` stays
  when the sale was rung, for the slip, the reports and the books. A till whose clock runs ahead cannot date anything in
  the future: pos/sync enters a sale, refund or void dated after it arrived at the time it arrived, for review ("Dated
  after it reached the server, so the till's clock runs ahead; entered when it arrived.").
- **SET-08 signs every till sale on the shop's fiscal device**, the company's `ZIMRA_FDMS` provider config
  (`shopFiscalDevice`): the tills, the close, the page and the worker use the same one. A device the books' console adds
  under another key is not the shop's, however recently it was changed.
- **SET-08 prices the demo shelf at 15.5% VAT.** The boards draw 15%; ZIMRA maps only 15.5% (VAT15_5, taxID 1) since
  1 January 2026, and the till signs only a rate ZIMRA maps. The seed prices the products, the categories and the history at 15.5%.
- **STK-04 Adjust stock draws no Site field.** `StockAdjust.png` has none, so the sheet adjusts the line it opened on: the
  default site's (or the product's only line), named in the sub ("· 13 on hand at Harare Main Branch" with two sites);
  On hand's row menu opens it on another site with `&siteId=`.
- **STK-04 Break a case averages the singles' cost.** The singles come in at the case's cost shared over its bottles,
  averaged with the singles already on the line (`blendedCost` in `lib/retail/stock/cases.ts`), to the cent. The singles
  on the shelf are not revalued, and the case's value moves into them whole, give or take that cent's rounding, so a
  break still posts nothing.
- **STK-04 Reverse posts back what the adjustment posted.** The opposite is the original's journal; while that waits for
  the day's run, the amount its accounting event holds; else the value its `RETAIL_STOCK.ADJUSTED` event recorded. Never
  the line's cost at the time of the reversal.
- **STK-02 reads what a line sold off its own ledger.** On hand, its tabs, the "5 low" badge and Change reorder
  levels take a line's net sold (sales less refunds and voids, 30 days) from its `StockMovement` rows, the same read
  as STK-04's stock lines (`netSoldByLine` in `lib/retail/stock/on-hand.ts`), so it is always that site's figure.
- **STK-02 moves a line to another place whole.** A `placeId` on the line's PATCH writes a `PLACE_MOVE` transfer of
  the whole line (on hand is held per site, not per place, so `recordStockMovement` refuses a part or a zero
  quantity); a line with nothing on hand just changes place.
- **STK-02 keeps four figures that differ from `StockList.png` and `Reorder.png`** (for the canvas owner to confirm).
  Each follows from a figure another unit's board or decision fixes, so the seed is not bent to the sample:
  Castle 340ml's Value at cost is US$21.84, not US$22.36, because BRK-0012 averages the case's cost into the
  singles (STK-04's `blendedCost`; the case's US$20.10 is the Products and Buying boards'); Jameson's cover is
  3 days, not 2 (9 on hand, 90 sold in 30 days); Amarula's suggested level is 34, not 32 (63 sold is 2.1 a day,
  ceil(2.1 × 16)); and the tabs read All 31 · Too much 12, not 26 · 3, over the whole demo shelf.
- **STK-05 seeds the shop's real lines, so four of `CountsList.png`'s line figures differ** (for the canvas owner to confirm).
  The demo shelf holds 24 lines at Harare Main Branch, not the board’s 214, so the seed is not bent to the sample:
  CNT-0020 (every Spirits and Wine line) reads 9 lines, not 38; CNT-0018 (Everything) 24, not 214; CNT-0019 (the
  back store, where the five beer lines are kept) 5, not 22; CNT-0021 (the cold room: soft drinks, ciders and
  coolers) "3 of 7", not "12 of 40". Every money figure is the board's: −US$41.20, −US$1.72, −US$63.10, Σ Differ
  13 over those four rows and −US$106.02, Done 18 · All 20. Bols Brandy 50ml is a new line, so On hand's All tab
  reads 32. CNT-0019's Zambezi line keeps the spec's US$0.86 (its cost on 2 October); the fourteen older counts
  matched what was expected.
- **STK-05's acceptance starts its count on a category no open count holds.** Every Spirits line at Harare Main
  Branch is in CNT-0020, which waits for approval, and a line in a count that is counting or to approve cannot be
  counted again (the 409 the spec defines). Some categories + Spirits therefore answers "8 products are already
  being counted in CNT-0020. Finish that count first."; the walk counts Ice and mixers for Tendai Sibanda instead.
- **STK-05's phone count marks the current line with `--selected`.** The theme has no `--action-soft`; `--selected`
  is the same warm tint the board draws. The phone's counter rule lets a cashier asked to count open
  `/retail/stock/counts/<id>/count` (outside the shell, like the till) while Counts itself stays closed to them.
- **Reseeding with `--reset` clears what acceptance walks did to the shop's stock and records.** Every order and
  delivery goes (PO-00001 and GRN-00001 are written again) with the movements, journals and Activity they
  wrote, and so do the products' edit lines in Activity (the seed's own, Amarula's price, is written again).
  The demo tenant's audit chain is trimmed for this, as the transfers and adjustments seeds already do.
- **SET-11 imports a batch of 200 rows per call.** `POST /products/import/[id]/commit` puts in the next 200 ready rows and
  answers `{ created, updated, skipped, refused, left }`; the page calls again until `left` is 0 and counts the rows in on the
  steps band, so no request runs longer than one batch (a 5,000-row file is 25 calls). The first batch makes the import
  `IMPORTING` (a fourth status): its rows can no longer change, Start again is refused (409), done rows count under a Done
  tab rather than New, and "Finish the import" puts in the rest. A call that fails says how many rows are in; the last
  batch makes it `IMPORTED` with its counts and `RETAIL_PRODUCTS.IMPORTED` in the same transaction.
- **SET-11's Check step flags everything the commit would skip.** Besides the spec's ten problems: a cost that is not a
  figure, opening stock or a pack size that is not a whole number (new rows only; these columns are not drawn, so the
  sentence quotes what was typed: fix it in the file, or skip the row), a new product's name repeated in the file ("Same
  name as row {n}") and a second row for a product another row already updates ("Same product as row {n}"). What the
  shop's rules still refuse at the commit (a manager's price below cost) is listed under Done with its reason, and the
  page stays on the import so it can be read.
- **SET-11's refusal page reads the matrix's sentence**, "Your role cannot create products", the same as the API's 403
  (00-foundations' "Your role cannot <verb> <noun>"), not the packet's inferred "Your role cannot add catalogue items".
- **STK-04 seeds BRK-0012 as Tafara Nyathi on the Castle case's record.** The packet's "Farai Moyo on his open shift" is
  not true on 30 Sep (his open shift began on 4 Oct), and the till's rule needs no singles left. The seed's break is the
  record's: cases 23 → 22, singles 2 → 26.
- **FLR-01 prints a receipt copy with a POST, not a GET.** The packet's `GET /sales/[id]/receipt?format=pdf` wrote
  `RETAIL_SALE.REPRINTED` on every fetch, so a prefetch, a reload of the PDF tab or a restored session each logged a
  reprint. `POST /api/v2/retail/sales/[id]/receipt` answers the 80 mm "Copy" PDF and writes the line; there is no GET.
  The record's "Reprint the receipt" and the Lines tab's "View the receipt" run the same action (`{ print }` in
  RecordFrame: the tab opens on the click, the PDF lands in it, then Activity reads again), and the row menu posts the
  same route.
- **FLR-01 keeps the seed's other Front till sales today.** `/retail/sales` today lists the boards' six sales among the
  Front till's others (SALE-31859 to -31868 between them, so every number runs in the order it was rung), and the tab
  counts are the tenant's real ones, not `SalesList.png`'s 212 · 3 · 1 · 31,870. Before 12:13 the morning is moved back
  whole so SALE-31870 is three minutes old. Back till still reads Farai Moyo (C-41).
- **FLR-04 books a closed drawer's whole count to the vault.** The packet's close journal moved only "To the safe"
  (counted less the float left) and FLR-03's opening moves the whole float from the vault, so the float left was booked
  twice: every close-and-open cycle overstated 1000 and understated 1005 by it. The close journal now debits 1005 with
  everything counted, and the next opening takes its float back out of 1005 as every opening does; between the two the
  books hold the float under the vault while it sits in the closed drawer. "To the safe" stays the physical figure on the
  page, the record and the shift (`toSafe`); the journal's amount is the count. Open, close and open again leave the till
  accounts holding exactly the drawer.
- **FLR-04 leaves both till accounts at zero after every close.** The variance journal books counted less expected to the
  cent, so a drawer the US$0.05 ZiG tolerance calls balanced (Difference "None", variance 0.00) still books its stray cent
  to over/short (5420). The close journal then credits 1001 with what the shift booked to it (the ZiG float at its rate,
  each sale's ZiG cash less its ZiG change as its journal debited it, ZiG movements) and 1000 with the rest of the count;
  when the variance took more off a till account than it held, that account takes the excess back (`usdBack`,
  `zigBack`). ZiG swapped for dollars in the drawer, or a ZiG rate that moved, leaves nothing behind in 1001. The
  Z-report reads each shift's recorded variance, so it says "Balanced" where the Shifts list does.
- **FLR-04 hides what should be in the drawer from a blind cashier everywhere, not only on the close page.** While a cashier
  without cash control has her own drawer open, the close page offers no X-report, the shift record's API sends no
  expected figure (no "Should be in the drawer" figure or KPI, no "Expected" in Cash up) and the X-report prints "Shows
  when you close" in its place. The rule is `countsBlind` in `lib/retail/shift-record.ts`, shared by all three.
- **FLR-04's seeded history counts the cents off the notes.** The history's counted cash is what should have been there
  plus the seeded difference, and the sales are priced to the cent, so 314 of the 317 counted drawers hold cents. Notes
  cannot make cents, so their count lines carry the whole dollars and a closed shift's read-only page shows "Comes to"
  short of Counted by those cents. The seed is not bent to whole dollars: that would turn the Balanced history Short.
- **FLR-05 departs from packet 57 in five places.**
  - **The Recover card reads "Owed to the shop by Chipo, with their agreement noted."** The packet has "her". A person
    record holds no pronoun, so the sheet names the cashier by first name and says "their" for anyone.
  - **The State option "Needs sign-off" matches `needsSignOff` against "Yes", not "true".** The filter engine reads a
    boolean row value as "Yes". The option also carries `anyTime`: chosen, the list's Opened starts from "Any time"
    rather than the last 30 days, so a drawer looked into 40 days ago is still listed. A period picked with it still
    narrows.
  - **Every link to the sheet carries the shift's id twice: `/retail/shifts/<id>?sheet=sign-off&id=<id>`.** The sheet
    host loads a sheet's record from `id` on the address. The drawer-difference notification and the Shifts row menu
    link this way, and packets 62 (Overview › Needs action) and 59 (End of day › "Sign off") must link the same way.
  - **This week's three short drawers fall on the week's first closed drawers once Wednesday to Friday have not
    happened.** On a Wednesday run they are Monday's and Tuesday's. The amounts and cashiers are the packet's.
  - **A recovery journal lost after the sign-off commits is found by the retail backfill.** The journal posts after the
    commit, as the close's do. `backfillRetailAccounting` posts `RETAIL_SHIFT_RECOVERY` for a RECOVER shift that
    has none.
- **FLR-05's seeded history books every counted difference to cash over short.** The seed writes the history's
  shifts and sales as rows, not through the close. It posts each counted difference's `RETAIL_SHIFT_VARIANCE` journal
  at its close, so 5420 holds the drawers' differences and SH-00307's recovery nets its US$20.00 back to nothing. The
  history's opens, sales and closes are not posted. SH-00307's float stays US$100.00. A function's order paid in cash
  (14 cases of Castle Lager and 5 bags of ice, US$378.50, its units taken out of the 30-day quotas) and a drop to the
  safe bring its expected cash to the board's US$432.50. Every seeded difference over US$1.00 has a close note, and
  every seeded sign-off has its `RETAIL_SHIFT.SIGNED_OFF` line on the shift's Activity.
- **FLR-07 departs from packet 59 in six places.**
  - **A trading day is the Z-report's day.** The day's shifts are those opened in `tradingDayWindow` (the window
    every Z-report already keys on), so End of day, Past days and the Z-reports a close takes never disagree about
    which day a drawer belongs to.
  - **Past days lists today and every day not closed yet.** Today reads "Not closed" until it is closed, so the
    first row after closing today is today "Closed" (acceptance 2). "Fiscal day" is blank on a day whose sales
    were signed into no fiscal day.
  - **The demo shop banks with CBZ.** The books' own placeholder account ("Operating Bank" at "Seeded Foundation
    Bank") is not a bank the shop uses, so the seed makes "CBZ current account" the default bank account in its
    place. The seeded closes' banked journals are posted as each night's run posted them (Dr 1010, Cr 1005).
  - **A day with nothing sold and no drawer opened cannot be closed** ("Nothing was sold at … on …."); the page
    shows the empty-day sentence and no "Close the day".
  - **A closed day opens no drawer at its site.** A drawer belongs to the trading day it opens on, so once that
    day is closed at the site opening one is refused ("Wednesday 7 October is closed at Harare Main Branch. Open the
    till tomorrow."): no takings land outside a close and no till goes without its Z-report. The close keeps its
    tills table as it stood (`RetailDayClose.tills`), so a later void moves no row under the frozen totals.
  - **The till keeps its taken reports, read only.** `GET /api/v2/retail/z-reports` answers the trading day and the
    reports taken; the till's End of day finds its own for today there and otherwise says it is taken when a
    manager closes the day.
- **FLR-08 departs from packet 62 where it reads as follows.**
  - **Tills now lists Open, then Open 52h, then Offline, then Closed, each by name**, as `Floor.png` draws them (the
    packet's "open first … by name" put the Back till above the Front till). A drawer open more than 12 hours reads
    "Open 52h" even when its device is silent: the drawer that needs closing is the thing to say.
  - **Needs action's `order-due` row has no provider yet.** The dev and test databases already carry BUY-02's purchase
    orders (vendor, sent, chased), which the code on `main` does not, so a read of `supplierName` fails there. BUY-02
    adds `lib/retail/floor/needs-action/order-due.ts` with its orders; `laybys-overdue` waits for FLR-06 the same way.
  - **The flagged-sales row links to `/retail/sales?tab=all&flagged=only`**, the value the Sales list's Flagged filter
    reads (the packet's `flagged=1` selects nothing). The promotion row links to Promotions, which has no record page.
  - **Top products counts a product sold each as "4 sold"**, not "4 each".
  - **Cashiers this week reads "1 shift · not counted yet"** for someone whose only shifts are still open, rather than
    "balanced".
  - **The response carries `can.openShift` and the sparkline's point `labels`** beside 50-floor §4.1's fields: the page
    draws "+ Open shift" from the first, and the chart's tooltips name each hour or day from the second.
  - The setup checklist does not lead the grid: SET-13's endpoint does not exist yet.
  - **Stock links open On hand's "Below level" tab**, which holds Low and Out together (it replaces the Low tab; Out
    stays beside it), so the Needs-action row's count and the Stock to reorder panel's lines are the list they open.
  - **An offline till with an open shift names it**: "Chipo · open since 07:58 · last seen 13:35". A till that closed a
    shift today stays in Tills now as Closed even when it sold nothing.
  - **How people paid splits takings, so it leaves out bottle deposits.** A deposit sale's payments hold the deposit
    (the customer paid goods plus deposit) but takings never do; each sale's deposit comes off its largest payments, so
    the tenders sum to the takings they split.
- **PRD-04 departs from packet 15 in seven places.**
  - **A category that checks ID checks it for every product in it, at the till too.** `ageCheckFor`
    (`lib/retail/products/age-check.ts`) now lets the category win over a product's own No, so every till, the shelf
    listing and the sale routes ask for ID on any product under such a category, whatever the product says. Before,
    a product's own No beat its 18+ category (PRD-03's "alcohol-free beer under Beer says no for itself"). Both writes
    refuse No there with "Spirits checks ID for every product in it." under `ageCheck`: the PATCH, and New product
    (`createProduct`), so no stored No is silently ignored. The Edit sheet's seg still offers No and shows the refusal
    under the field when it is sent. PRD-03's tests that held the old rule now hold this one:
    `lib/retail/products/update.test.ts` ("asks ID for every product under a category that checks it, and refuses No
    there"), `lib/retail/shelf-listing.test.ts` ("asks ID under its 18+ category whatever the product says"),
    `lib/retail/site-licence-hours.test.ts` ("is always asked under a category that checks"), and
    `lib/retail/products/create.test.ts` ("refuses No under a category that checks ID, as the PATCH does").
  - **The chart counts no transfer in as received** (`lib/retail/products/stock-chart.ts`). The packet's received
    is RECEIVED + TRANSFER_IN + OPENING; a move between two of the shop's sites leaves the product's on hand where
    it was, so only RECEIVED and OPENING draw a "+24 received" marker and fill the tooltip's received.
  - **The run-out day is the KPI's cover**: today + `coverDays` (rounded), not today + ceil(on hand ÷ a day's
    sales), so the chip's "in 6 days" and On hand's "6 days at this rate" never disagree (13 on hand at 64 in 30
    days is 6.1 days: the board's 6, where ceil would give 7).
  - **"Most off" leaves the rail.** The board's rail has no such row; the Edit sheet keeps the field.
  - **Reorder at and Reorder are edited on the record while exactly one site keeps levels for it** and it is the
    line the record writes (`levelsEditable` in `lib/retail/products/view.ts`); with two or more each reads per site
    and is changed on its line in On hand. A product stocked at two sites with levels at one stays editable here.
  - **The Suppliers tab leaves its delivery figures blank until Orders lands.** Deliveries carry no supplier yet
    (`RetailGoodsReceipt.vendorId` comes with packet 31), so the product's own supplier reads Last delivered, Last
    cost and Delivered, 12 months empty rather than "0" or "Not delivered yet"; packet 31 fills them.
  - **The order-by day is a weekday name up to six days ahead and a date from a week on** ("Order 24 by 14
    October" on a Wednesday 7 October), so the sentence never names today's own weekday for a day a week off.

- **A list's Export stops at 5,000 rows and says so.** The file holds the engine's first 5,000 rows in the list's order
  with the list's totals over every row; the toast reads "The file has the first 5,000 of 5,858 rows. Narrow the
  filters for the rest."

## Owner direction, 5 October: sidebar, Management and Setup

These override 00-foundations §5.3 and every spec that disagrees.

1. **The sidebar's structure is not ours to change.**
   - The panel keeps its two levels: the workspace's module list, and a module's own items.
   - The chevron before a module's title goes **back to the module list inside the panel**. It does not collapse the panel.
   - Collapsing is a separate control in the panel header, as on `Main.dc.html`, plus Cmd/Ctrl+B.
   - The canvas look (rail, panel, item sizes, badges, theme) stays.
2. **The gear (Settings) opens the existing Management UI** at `/management/master-data`. That is the `ManagementShell` with its settings rail, already built.
   - There is no retail "Management" module.
   - Things Management already has are not rebuilt in retail: company legal details, branding, users and the user directory, master-data sites, billing and plan, activity.
   - Retail pages link to the Management page or extend it.
3. **Retail-specific settings live in the retail sidebar under a "Setup" module.** It takes the pages the canvas draws under Management that are about the shop:
   - Shop: business type, liquor features, money rules
   - Tills and devices
   - Payments
   - Till rules
   - Receipts
   - Fiscal device
   - Posting to the books
   - Approvals
   - Loyalty
   - Staff and PINs: retail roles, till PINs, site access
   - Bin

   Routes stay under `/retail/manage/*`. Every board that drew "Management" for these pages now reads "Setup" in the panel title and the back link.
4. **Units affected:** FND-08 and SET-01 build the Shop page, not "Company". The other SET and ADM units place their pages under Setup.
5. **The sidebar keeps every function it had, always.** The owner said: "we need to retain the functionality of the sidebar always." No unit may remove or move a sidebar function. That covers:
   - search;
   - pins;
   - the area-map and flat views;
   - the workspace switcher;
   - Help and Management;
   - the account menu;
   - collapse;
   - notifications.

   A unit may restyle a sidebar function to the canvas. It may only add to the sidebar.
6. **Two owner calls on the shell:**
   - **The logo-tile account popover stays as it is.** The owner likes it. It holds identity, Search, Notifications, This device, Profile, Appearance, Guided tips, Help, the workspace switch and Sign out.
   - **The top app bar comes back** with everything it had: sidebar trigger, page title, search ⌘K, device status, notifications bell and the primary action. The page header's back link, title and subtitle sit inside that bar.
7. **"What it says" becomes the headline summary.**
   - **Where:** every page that has a "What it says" panel or aside: the Insights pages, the dashboards, and any record or list that draws one.
   - **What replaces it:** the owner's reference (a Boarders page) puts the summary at the top of the content, under the tabs and filters and above the table or charts. It is two sentences in a large type:
     - the first states the fact in ink, for example "86 boarders in six dorms.";
     - the second says what to notice in muted ink, for example "7 are not in the house tonight.".
   - **The words come from the page's real data**, computed on the server. For example: "US$18,940 taken this month across two shops." / "Sales are 12% down on last month, mostly at Borrowdale."
   - **When there is too little data to say anything**, the headline still reads as a sentence about the data, never as a separate box, for example:
     - "No sales yet this week."
     - "Too few sales in these dates to compare. Widen the period."

     "Not enough trade in this period to say" is no longer drawn as a panel.
   - **Removed:** the separate "What it says" panel or aside.
8. **Two follow-ups to the Management direction:**
   - **Sites (shops, the places inside them, the default site) is a retail Setup page.** SET-02 builds it at `/retail/manage/sites` on the same `Site` model that Management uses. Management's operations sites page is a mining master-data screen, and shops are not managed there.
   - **Plan and billing stays in Management.** SET-10 is not built. The paired-till limit (`maxTills`, C-07) still lands with SET-03.
