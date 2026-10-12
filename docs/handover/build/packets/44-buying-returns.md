# 44 · Buying › Supplier record: return goods to the supplier

## Screen
On `/retail/buying/suppliers/[id]` (packet 30):
- ⋯ "Return goods" → `?sheet=return-new&supplierId=<id>` (`&productIds=` from Insights › Products)
- Returns tab (`retail-supplier-returns`) with row ⋯ "Credit note came" · "Replacement came" · "Refund came" →
  `?sheet=return-settle&id=<return id>&kind=credit|replaced|refund`
- ⋯ "Return empties" (liquor store with empties on) → STK-09's `empties-return` sheet with `&supplierId=` (99-coverage §2 W-27 fix)

## Units
BUY-09 (40-buying §7 BUY-09, §W-36, §3.3 G, §3.5 return/refund/replaced rows, §4.7, §5.2 Returns tab, §5.30, §5.31), plus 99-coverage §2:
W-27's opener "Return empties" on the supplier record. "Verbatim §x" = that section of `docs/handover/40-buying.md`.

## Boards
`ReturnNew.png` — 760px "Return to supplier" / "Delta Beverages": Supplier; Why seg **Damaged** · Expired · Wrong item · Not ordered;
"What goes back" lines (Product, Going back, Cost, Value, ×): "Castle Lager 340ml / Broken in delivery GRN-0005" 6 · US$0.86 · US$5.16;
"Sprite 500ml / Expires 4 October" (warn) 12 · US$0.52 · US$6.24; add row; Σ "2 lines" 18 "US$11.40"; "Settling it": Settle by seg
**Credit note** · Replace the goods · Refund; Collected (half) "With the next delivery, 7 October"; Photos optional drop zone "Add photos of
the goods". Note "Stock comes off now. The credit shows on their statement when it arrives.", "Cancel", primary "Book the return".
`SupplierRecord.png` tab "Returns 2".

## Workflows
W-36 Return goods to a supplier (Manager; "Supplier record"): Pick products · Why · Credit note expected — verbatim §W-36 (lines 341–351).
W-27 opener: "Return empties" from the supplier record (the empties ledger and sheet are STK-09's).

## Roles
Book: `retail.purchasing:create` (Owner, Manager). Settle: `retail.purchasing:update` (Owner, Manager). Returns tab: `retail.purchasing:view`
(stock clerk and bookkeeper read). Accounts: `tafara.manager@`, `owner@`, `tendai.stock@` (refused), `bookkeeper@` (reads).

## Data
Existing: `Vendor`, `InventoryItem`, `StockMovement`, `RetailDeliveryDifference` (`returnId`, `settledAt`), `PurchaseBill`, `DebitNote`,
`BankAccount`/`BankTransaction`, `RetailAttachment`.
Migration `<stamp>_retail_supplier_returns`, witness `lib/retail/buying/returns-migration.test.ts`, verbatim §3.3 G: enums
`RetailReturnReason`, `RetailReturnSettle`, `RetailReturnState`; models `RetailSupplierReturn` (`RTN-nnnn`, vendor, site, reason, settle,
state, collected, creditNoteNumber, refundAccountId, settledAt/ById, createdById; unique `(companyId, returnNo)`) and
`RetailSupplierReturnLine` (inventoryItemId, itemName, quantity, unitCost ex VAT, lineTotal, vatRate, `fromDamaged`);
`AccountingSourceType` + `RETAIL_SUPPLIER_RETURN`, `RETAIL_SUPPLIER_REFUND`. Code: id entity `RETAIL_SUPPLIER_RETURN` (prefix `RTN`,
company-wide). Witness: tables, enums, unique index.

## Server
`lib/retail/buying/returns.ts` (+ `returns.test.ts`):
- `bookReturn(actor, { supplierId, why, lines: [{ inventoryItemId, quantity, unitCost }], settle, collected?, photoUrls? })` — supplier
  live; lines are products at the caller's site; quantity whole > 0 and ≤ available = on hand + the open BROKEN damaged units of that product
  on this supplier's deliveries not yet returned (400 `fieldErrors.lines` "Only 4 of Sprite 500ml are on the shelf."); cost default = the
  last delivered cost from this supplier. One transaction: `RetailSupplierReturn` (state CREDIT_EXPECTED / REPLACEMENT_EXPECTED /
  REFUND_EXPECTED by settle) + lines; the damaged-at-the-door units are used first: those line parts are `fromDamaged`, write **no** stock
  movement, and mark their `RetailDeliveryDifference` rows `returnId` (state "Returned"); the rest `recordStockMovement` ISSUE (reason
  `SUPPLIER_RETURN`, sourceType `RETAIL_SUPPLIER_RETURN`, reason text "Returned to Delta Beverages"); photos → `RetailAttachment` PHOTO.
  Audit `RETAIL_SUPPLIER_RETURN.BOOKED`. After commit post `RETAIL_SUPPLIER_RETURN`: Dr 2000 = Σ lines × cost / Cr Stock (role STOCK) for
  the stock lines (`amounts.stock`) and Cr 5000 for the `fromDamaged` lines (`amounts.damaged` — they never entered stock or GRNI; a bill
  that charged for them posted the excess to 5000, so the return reverses it there), via packet 41's `EVENT_AMOUNT` basis. The supplier's
  Owed drops now (open return credit). Toast "Return RTN-0004 booked. 18 units off stock." (units = all lines).
  Invariant (tested): stock value change = −Σ stock lines × cost; Dr 2000 = Σ all lines × cost; Σ Dr = Σ Cr.
- `settleReturn(actor, id, input)` — open states only (409 "RTN-0002 is settled already."):
  - `{ kind: "CREDIT_NOTE", creditNoteNumber }` → `DebitNote` rows (status ISSUED, **no posting**: the ledger moved at booking) against the
    supplier's oldest unpaid bills up to the return value (`recalcPurchaseBillBalance` each); any value left stays as the open credit until
    a later bill (applied by packet 41's `applySupplierCredits` — extend it to consume settled-return remainders); state SETTLED,
    `creditNoteNumber`.
  - `{ kind: "REPLACED", deliveryId }` (a posted delivery of this supplier that brought the goods) → ledger subtype `REPLACED`: Dr 2300 /
    Cr 2000 (the replacement delivery booked GRNI; the claim is cleared); state SETTLED.
  - `{ kind: "REFUND", amount, intoId }` → `BankTransaction` DEBIT on the money account (`sourceType RETAIL_SUPPLIER_REFUND`); ledger Dr
    the account's ledger account (EVENT_ACCOUNT `moneyAccount`) / Cr 2000; state SETTLED, `refundAccountId`.
  Audit `RETAIL_SUPPLIER_RETURN.SETTLED`. Toast "RTN-0002 settled.".
- Figures: Owed = Σ bill balances − Σ unallocated credits − Σ **open** return values (CREDIT_EXPECTED/REFUND_EXPECTED/REPLACEMENT_EXPECTED)
  (packet 30's `figures.ts` gets the third term). Delivery-difference claim state for the Returns tab and the delivery's Differences tab:
  "Credit asked" (settle CREDIT, no bill yet or the delivery's bill above its value with VAT), "Credited" (the delivery's bill does not
  exceed its value with VAT), "Returned" (a return took it).
- Rules in `lib/accounting/defaults.ts`: `RETAIL_SUPPLIER_RETURN` (default and `REPLACED` subtype), `RETAIL_SUPPLIER_REFUND`; both in
  `RETAIL_SOURCE_TYPES` (`kindOf` → "other").

API (`app/api/v2/retail/buying/returns/**`), verbatim §4.7:
| Method · path | Permission | Body | Success | Errors |
|---|---|---|---|---|
| POST `/returns` | `retail.purchasing:create` | `{ supplierId, why: "Damaged"\|"Expired"\|"Wrong item"\|"Not ordered", lines, settle: "Credit note"\|"Replace the goods"\|"Refund", collected?, photoUrls? }` | 201 `{ data: { id, returnNo, units, value }, accountingStatus }` | 400 quantities; 403; 409 stopped supplier |
| POST `/returns/[id]/settle` | `retail.purchasing:update` | `{ kind: "CREDIT_NOTE", creditNoteNumber }` \| `{ kind: "REPLACED", deliveryId }` \| `{ kind: "REFUND", amount, intoId }` | `{ data }` | 400; 409 |
Audit `returnBooked`, `returnSettled` + `LIST_WORDS`.

## UI
- Sheets (`lib/retail/sheet-kinds/buying.ts`): `return-new` (§5.30; lines' sub per product: "Broken in delivery GRN-0005" for an open BROKEN
  difference, "Expires 4 October" in warn when the stock spec records an expiry, else the category; Collected default "With the next
  delivery, <next delivery day from Delivers>"; `&productIds=` preselects), `return-settle` (§5.31 three variants).
- Supplier kind: ⋯ "Return goods" (`retail.purchasing:create`), ⋯ "Return empties" (liquor store with empties on; STK-09's sheet with
  `supplierId`); Returns tab (`retail-supplier-returns`, parent `supplierId`): Return (mono "RTN-0002") · Booked · Why · Units · Value · Settle by
  · State ("Credit expected" warn, "Replacement expected" warn, "Refund expected" warn, "Settled" hollow; difference rows "Credit asked" warn);
  row ⋯ settle actions; no all link.
- Insights › Products "Promote, return or write off" (INS) opens `?sheet=return-new&productIds=…` over the product's supplier record.

## Reuse
`lib/inventory/stock-movements.ts`, packet 41's `EVENT_AMOUNT`, `applySupplierCredits`, `recalcPurchaseBillBalance`, packet 36's money
accounts and `EVENT_ACCOUNT`, `figures.ts`, STK-09's empties sheet.

## Remove
Nothing (new).

## Seed
In date order through the services so Delta's Owed stays US$624.00: RTN-0001 (Delta, today − 90, Expired, 12 Sprite 500ml, settled by credit
note CN-5521 against the then-unpaid PO-0009 bill); RTN-0002 (Delta, today − 20, Damaged, 6 Castle Lager 340ml, Replace the goods, settled by
GRN-0003). Delta's Returns tab reads 2 returns plus GRN-0002's two "Credit asked" differences.

## Tests
- Witness.
- `lib/retail/buying/returns.test.ts`: stock out for stock lines; damaged-at-door returned without a movement and the difference marked;
  quantity over available refused with the sentence; each settlement's posting (credit note none; replaced Dr 2300 / Cr 2000; refund Dr money
  / Cr 2000) and balance; settle twice refused; Owed before/after booking and after a credit note.

## Acceptance
1. Migration on dev + test; witness green; reseed.
2. On Delta's record ⋯ "Return goods" vs `ReturnNew.png`: Supplier, Why Damaged, Castle Lager 340ml 6 "Broken in delivery GRN-<the packet 38
   delivery with damaged Castle>" and Sprite 500ml 12, Settle by Credit note, Collected "With the next delivery, <date>" → "Return RTN-0003
   booked. 18 units off stock."; On hand Sprite −12 (Castle's 6 never were in stock); the BROKEN difference "Returned"; Delta's Owed drops by
   the value; after "Post now" journal Dr 2000 / Cr Stock (Sprite) and Cr 5000 (Castle), balanced; Returns tab row "Credit expected".
3. Row ⋯ "Credit note came" with CN-5600 → Settled; a `DebitNote` ISSUED against INV-88504 (oldest unpaid); Owed unchanged by it.
4. Quantity over on hand → "Only 4 of Sprite 500ml are on the shelf." (with the shelf's real count).
5. As `tendai.stock@`: no "Return goods"; POST → 403. As `bookkeeper@`: Returns tab readable, no actions.
6. `npx eslint <changed>`; `npx vitest run lib/retail/buying`; `pnpm typecheck` alone.

## Depends on
Packets 41 (bills, debit notes, credits, `EVENT_AMOUNT`), 43 (deliveries, differences), 38 (damaged at the door), 36 (money accounts). STK-09
(empties sheet for the "Return empties" opener). Holds the posting lock (P).

## Risk
**money** — stock value, AP, the price-difference account. Pitfalls: damaged-at-door units credit 5000, not stock; a credit note posts nothing
(the ledger moved at booking); never let a debit note push a bill below zero.

## Open questions
- Ledger for damaged units returned (the spec says Cr 1200 for all): Cr 5000 for units that never entered stock, so stock is not understated.
- Delivery-difference claim states are derived from the delivery's bill ("Credited" when the bill is not above the delivery's value with VAT);
  no separate settle action for differences.
