# 33 · Buying › Orders: chase a late order, cancel what is left, bulk send and cancel

## Screen
On the Orders list and order record built by packet 31:
- `/retail/buying/orders/[id]?sheet=order-chase&id=<id>`; `order-edit`'s danger "Cancel what is left"
- Asks `cancelrest`, `sendorders`, `cancelorders`
- Orders list: Filters › Late; bulk "Send to suppliers", "Cancel"; row ⋯ "Send a reminder"
- Retail worker job `buying-follow-ups` (daily 07:00 Africa/Harare)

## Units
BUY-03 (40-buying §7 BUY-03, §W-34, §4.3 chase/cancel-rest/bulk, §4.9 first half, §5.16 danger, §5.17, §5.32). Close/reopen
and remove-a-draft moved to packet 31. "Verbatim §x" = that section of `docs/handover/40-buying.md`.

## Boards
- `OrderChase.png` — 520px "Chase PO-0003" / "Delta Beverages · 48 days late": To (auto, "Tinashe Moyo, rep"); Message (area,
  prefilled "Hello Tinashe, order PO-0003 from 10 August is still 480 units short: Castle 340ml 120, Chibuku 1L 180, Coke 500ml
  90, Sprite 500ml 90. When can you deliver? Harare Main Branch."); Promised for (half, "7 October 2026") with hint "Moves the
  expected date."; "If it does not come" seg Remind me · Cancel the rest (half). Footer note "The message and their reply are
  kept on the order.", "Cancel", primary "Send on WhatsApp".
- `OrderEdit.png` footer danger "Cancel what is left" (bad, bin icon).
- `OrderRecord.png` action "Send a reminder"; ⋯ "Cancel what is left" (bad).

## Workflows
- W-34 Chase a late order (Manager; "Overview, or Orders › late"): Send a reminder · New date · Or cancel the rest — every row
  verbatim §W-34 (lines 288–300): Find it (Filters › Late; badge "48 days late" counted from `firstExpectedDate`), Send a
  reminder, Their reply (handled by packet 31's reply matching), New date / Or cancel the rest (worker), Cancel what is left.
- Bulk on Orders: "Send to suppliers" (drafts) and "Cancel" (drafts → bin, sent → cancel what is left, done → skipped).

## Roles
`retail.purchasing:update` (Owner, Manager) for chase and cancel-rest; `retail.purchasing:create` for bulk send;
`retail.purchasing:update` (+ `delete` for drafts) for bulk cancel. Stock clerk and bookkeeper: none of these items are drawn;
API 403 "Your role cannot change orders and deliveries". Accounts: `owner@`, `tafara.manager@`, `tendai.stock@`,
`bookkeeper@` (`@bottlestore.test`).

## Data
No migration: `chaseAction`, `chasedAt`, `chasedById`, `followUpDoneAt`, `cancelledAt`, `cancelledById`,
`RETAIL_ORDER_FOLLOW_UP` and `CANCELLED` came with packet 31's migration. Models: `RetailPurchaseOrder(+Line)`,
`RetailMessage` (OUT, entity link), `VendorContact`, `Notification`, `CrmRequisition` (only to cancel a not-yet-paid one once
packet 34 exists).

## Server
`lib/retail/buying/orders.ts` additions (+ tests) and `lib/retail/buying/follow-ups.ts` (+ test):
- `chaseOrder(actor, id, { contactId|null, message, promisedFor, then: "REMIND"|"CANCEL_REST" })` — SENT/PARTIAL only (409
  "PO-0001 has all come."); message 1–1,000; promisedFor ≥ today Africa/Harare (400 `fieldErrors.new` "Promise a date from today
  on."); one `RetailMessage` OUT (WhatsApp to the contact's phone, email when only an email; `contactId` null = the supplier's
  own WhatsApp number), template `order-reminder`, `entityType "RetailPurchaseOrder"`; `expectedDate` = promisedFor
  (`firstExpectedDate` never moves), `chaseAction`, `chasedAt`, `chasedById`, `followUpDoneAt` = null; audit
  `RETAIL_PURCHASE_ORDER.CHASED { to, promisedFor, then }`. Toast "Reminder sent. Expected date moved to 7 October.".
- `chaseMessage(order, contact)` — built text verbatim §W-34: "Hello <first name>, order <PO> from <d Month> is still <n> units
  short: <short name> <qty>, …. When can you deliver? <site>." ("Hello" alone with no first name). Short name =
  packet 31's `shortName()` (first word + the size token: "Castle Lager 340ml" → "Castle 340ml", "Chibuku Scud 1L" → "Chibuku
  1L", "Coca-Cola 500ml" → "Coca-Cola 500ml"; the board's "Coke" is a nickname no data holds).
- `cancelRest(actor, id, { tell: true }, { automatic?: boolean })` — SENT/PARTIAL only (409 "PO-0003 has all come." /
  not open). Every line `quantity` = `receivedQuantity`, `closedShortAt` cleared; nothing came → CANCELLED (+ `cancelledAt/By`),
  else RECEIVED; message to the supplier "Please cancel what is left of PO-0003: Castle 340ml 120, …. Thank you." (template
  `order-cancel-rest`); a requisition for the order that is SUBMITTED/APPROVED is cancelled with W-72's effects (packet 34's
  `cancelRequisition`; skip until packet 34 lands — the order has no requisitions before it); a DISBURSED one stays. Audit
  `RETAIL_PURCHASE_ORDER.REST_CANCELLED { units, value }` (actor null and "…, automatically" when from the worker). Toast "What
  was left of PO-0003 is cancelled. Delta has been told.".
- `sendOrders(actor, ids)` → `{ sent: string[], skipped: [{ poNo, why }] }` (drafts with ≥1 line; "PO-0007 has no lines.",
  "Already sent"); toast "3 orders sent." / "2 orders sent. PO-0007 has no lines.".
- `cancelOrders(actor, ids)` → `{ binned, cancelled, skipped: [{ poNo, why: "Already done" }] }`: drafts through the bin kind
  `order` (packet 31), sent/part delivered through `cancelRest`.
- `runBuyingFollowUps(companyId, now)` — orders with `chaseAction` set, still owed, `expectedDate` before today, `followUpDoneAt`
  null: REMIND → notification `RETAIL_ORDER_FOLLOW_UP` to the chaser ("PO-0003 has not come. Delta Beverages promised it for 7
  October." → `/retail/buying/orders/<id>`); CANCEL_REST → `cancelRest(…, { automatic: true })`; then `followUpDoneAt` = now.
  Idempotent per order. Registered in `lib/retail/worker/jobs.ts` as `{ name: "buying-follow-ups", when: { dailyAt: "07:00" },
  run }` over every retail company.

API (`app/api/v2/retail/buying/orders/**`):
| Method · path | Permission | Body | Success | Errors |
|---|---|---|---|---|
| POST `/orders/[id]/chase` | `retail.purchasing:update` | `{ contactId: uuid\|null, message, promisedFor: "YYYY-MM-DD", then }` | `{ data, message: { id } }` | 400 fields; 409 "PO-0001 has all come."; 404 |
| POST `/orders/[id]/cancel-rest` | `retail.purchasing:update` | `{ tell: true }` | `{ data }` | 409 not open |
| POST `/orders/bulk/send` | `retail.purchasing:create` | `{ ids }` (1–100) | `{ sent, skipped }` | 400 |
| POST `/orders/bulk/cancel` | `retail.purchasing:update` (drafts also `delete`) | `{ ids }` | `{ binned, cancelled, skipped }` | 400 |
Add them to `lib/retail/route-guard-coverage.test.ts`.
Audit: `orderChased`, `orderRestCancelled` — sentences verbatim §3.4; `LIST_WORDS` rows.

## UI
- Sheet `order-chase` in `lib/retail/sheet-kinds/buying.ts`, verbatim §5.17: To = `auto` over noun `contact`
  (`context.supplierId`), default the first contact who gets orders else the rep; Message prefilled from `chaseMessage` with the
  chosen contact's first name (re-filled when To changes and the text is untouched); Promised for default today + lead time
  (min tomorrow); then seg; primary "Send on WhatsApp" / "Send by email" (contact with only an email); sub "Delta Beverages · 48
  days late" (not late: "Delta Beverages · expected 9 October").
- `order-edit` gains its danger "Cancel what is left" (sent orders only) → ask `cancelrest` → POST cancel-rest.
- Order kind: action "Send a reminder" (SENT/PARTIAL, `retail.purchasing:update`); ⋯ "Cancel what is left" (bad) → ask
  `cancelrest`. Messages tab shows the reminder row.
- Orders list: Filters › Late (Any / Late / Not late), row ⋯ "Send a reminder", bulk "Send to suppliers" (ask `sendorders`,
  body names each order and channel) and "Cancel" (ask `cancelorders`).
- Asks verbatim §5.32 `cancelrest`, `sendorders`, `cancelorders` in `lib/retail/asks/buying.ts`.

## Reuse
Packet 31's `orders.ts`, message recipients rule, bin kind `order`, `retail-orders` source; `lib/retail/worker/jobs.ts` +
`schedule.ts` (`dailyAt`, Africa/Harare); `emitRetailNotification`; `lib/retail/asks/buying.ts`.

## Remove
Nothing left from today's code for these pieces (none existed).

## Seed
PO-0003's chase is seeded by packet 31 (chased yesterday, promised today + 4, Remind me). Nothing new.

## Tests
- `lib/retail/buying/orders.test.ts`: chase moves `expectedDate` only; promised yesterday refused; chase on RECEIVED refused;
  `chaseMessage` equals the board's text for PO-0003's seeded figures; `cancelRest` → CANCELLED when nothing came, RECEIVED
  otherwise; line quantities = received; supplier message queued; bulk send skips "has no lines"; bulk cancel bins a draft and
  cancels a sent one, skips a received one.
- `lib/retail/buying/follow-ups.test.ts` with a fixed clock: REMIND notifies once, then `followUpDoneAt` set; CANCEL_REST cancels
  as "Automatic" (actor null) and queues the supplier message; an order whose promise is today is untouched; a second run does
  nothing.

## Acceptance
1. As owner on PO-0003: "Send a reminder" → sheet vs `OrderChase.png`; To "Tinashe Moyo, rep"; message equals the board's text
   built from data; Promised for today + lead time with "Moves the expected date."; "Remind me"; "Send on WhatsApp" → toast
   "Reminder sent. Expected date moved to <d Month>."; Messages tab +1; rail "Next | Promised for …"; the badge still reads
   "48 days late"; DB `chaseAction REMIND`, `expectedDate` moved, `firstExpectedDate` unchanged; event `CHASED`.
2. Worker: run `runBuyingFollowUps` with a clock past the promise (script or test) → Tafara notified "PO-0003 has not come. Delta
   Beverages promised it for …"; with "Cancel the rest" chosen instead → PO-0003 RECEIVED with lines = received, Activity
   "Cancelled what was left, 480 units, automatically", a `order-cancel-rest` message queued.
3. On PO-0005 (SENT, nothing came) ⋯ "Cancel what is left" → ask `cancelrest` → CANCELLED; supplier message queued; (after packet
   34: REQ-0014 cancelled with the asker told).
4. Orders list: Filters › Late shows PO-0002 and PO-0003 only; tick PO-0004 and PO-0007 → "Send to suppliers" → ask → both SENT;
   tick a draft and PO-0005 → "Cancel" → the draft in the bin, PO-0005 cancelled.
5. Refusals: as `tendai.stock@` no reminder/cancel items; POST chase → 403. Promised for yesterday → 400 "Promise a date from today
   on.".
6. `npx eslint <changed>`; `npx vitest run lib/retail/buying lib/retail/worker`; `pnpm typecheck` alone.

## Depends on
Packet 31 (orders, messages, bin kind, reply matching). Worker file lock (W). Packet 34 for cancelling a requisition (the call is
added there if 34 lands later; see packet 34).

## Risk
standard. Pitfall: "late" counts from `firstExpectedDate`, never from the moved `expectedDate`; the worker must be idempotent and
run per company on the shop's clock.

## Open questions
- Short product names in messages (spec "Defined here"): packet 31's `shortName()`; "Coke 500ml" on the board reads
  "Coca-Cola 500ml" (honest version: no short-name field exists).
- The board's Overview entry ("Needs action") is FLR-08's; it links here with `?sheet=order-chase&id=`.


> Coordinator note (2026-10-06, packet 90): every date this packet takes is entered through the shared picker. Use sheet fields
> `t: "date"` (or `t: "datetime"` for a day and time) with `earliest`/`latest`, rail edits `type: "date"`, and list periods through
> ListFrame's "Choose dates…". Values are `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm` shop days, which the server turns into instants with
> `startOfDayIn(day, SHOP_TIME_ZONE)`. Never use `<input type="date">` or `datetime-local`.
