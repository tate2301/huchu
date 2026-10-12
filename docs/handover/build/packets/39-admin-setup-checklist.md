# 39 · The floor › Overview: "Finish setting up" card

## Screen
- `/retail` (Overview), the card at the top of the main column, owner only, while the checklist says `show`.
- API `GET /api/v2/retail/setup/checklist`, `POST …/checklist/hide`, `POST …/checklist/items/[key]`.
Area tag "admin" (setup units are planned under admin in this set).

## Units
SET-13 (docs/handover/10-setup.md §W-01 step 8, §4.12 checklist rows and rules, §5.2, §7 SET-13), with C-15 (SET-13 owns the
endpoint, rules and storage; FND-10 built only the components) and C-43 (acceptance on a fresh signup, not the demo tenant).

## Boards
`Guided.png` left card — white, radius 12, border: H2 "Finish setting up"; progress bar (ok colour, done/total) and "4 of 7"; right
text button "Hide until tomorrow". Rows: status circle (done = filled ok with check) · label (done: muted, line-through) and why
(muted) · right outlined cta for open items. Rows: ~~Pick the shop type~~ "Liquor store"; ~~Add your products~~ "137 products, all
on sale"; ~~Pair a till~~ "Front till, CounterMini"; ~~Invite your staff~~ "3 people with PINs"; "Add your suppliers" "So low stock
turns into an order in a tap." [Add a supplier]; "Connect the fiscal device" "ZIMRA needs every receipt signed." [Connect]; "Add your
EcoCash merchant code" "So EcoCash payments confirm on their own." [Add it]. Footer "This card sits at the top of the overview until
everything is ticked, then it goes for good. Nothing on it stops you selling." The right card (Suppliers empty guide) is packet 30.

## Workflows
W-01 step 8 "After" (guided): the card shows until every item is ticked; anything skipped in onboarding waits here; ticking by hand;
Hide until tomorrow; gone for good once all are done.

## Roles
Owner (`SUPERADMIN`) only: managers, cashiers, stock clerks and the bookkeeper never see the card; the three endpoints answer 403
"Your role cannot change company settings" (owner-only gate: `retail.company:update`). Accounts: a fresh `/signup/tender` owner
(packet 37) for "4 of 7"; `owner@bottlestore.test` (demo: fully set up, no card); `tafara.manager@bottlestore.test` (no card).

## Data
`RetailOnboarding.checklistTicked`, `checklistHiddenUntil`, `checklistDoneAt` (packet 37's migration). Reads `RetailShopProfile`,
`Product`, tills/devices (SET-03/04), `User` + `RetailTillPin`, `Vendor` (packet 30), `shopFiscalDevice()`
(`lib/retail/fiscalisation.ts`), `RetailPaymentSettings` (`ecocash` switch, `ecocashMerchantCode`). No migration.

## Server
`lib/retail/checklist.ts` (+ `checklist.test.ts`), pure rules over a loaded snapshot, verbatim §4.12 "Checklist rules":
| key | label | done when | why when done | cta → href |
|---|---|---|---|---|
| type | Pick the shop type | the profile row exists | "Liquor store" / "General retail" | Change → `/retail/manage/company` |
| products | Add your products | ≥1 active product | "{n} products, all on sale" | Open → `/retail/products` |
| till | Pair a till | ≥1 paired device | "{till}, {device}" ("Front till, CounterMini") | Open → `/retail/manage/tills` |
| staff | Invite your staff | ≥1 other active user with a till PIN | "{n} people with PINs" | Open → `/retail/manage/people` |
| suppliers | Add your suppliers | ≥1 supplier bought from | "So low stock turns into an order in a tap." | Add a supplier → `/retail/buying/suppliers?sheet=supplier-new` |
| fiscal | Connect the fiscal device | `shopFiscalDevice` registered | "ZIMRA needs every receipt signed." | Connect → `/retail/manage/fiscal` |
| ecocash | Add your EcoCash merchant code | a merchant code saved; the item exists only while EcoCash is on | "So customers know which merchant to pay." (**Defined here**, the honest version) | Add it → `/retail/manage/payments` |
Open items' why is the same sentence. `done` = by data or by hand (`checklistTicked`); `byHand` = ticked by hand and not done by data.
`show` = caller is the owner and `checklistDoneAt` is null and not (`checklistHiddenUntil` > now). When every item is done the read
sets `checklistDoneAt` (once) and `show` is false for good.
- `GET /api/v2/retail/setup/checklist` → `{ show, done, total, items: ChecklistItem[] }` (type in §4.12).
- `POST /api/v2/retail/setup/checklist/hide` → 204; `checklistHiddenUntil` = the next local midnight Africa/Harare.
- `POST /api/v2/retail/setup/checklist/items/[key]` `{ ticked: boolean }` → `{ items }`; unknown key 404; a data-done item cannot be
  unticked (409 "That one is done by what is set up."  — **Defined here**).
No audit events (personal view state). Route guard rows added.

## UI
- `app/retail/page.tsx` (overview, file lock O): above everything in the main column, render FND-10's
  `components/workspace/setup-checklist.tsx` with the endpoint's items, `onHide` → hide, `onTick` → items/[key]; React Query key
  `["retail-setup-checklist"]`; loading = card skeleton with seven rows; on error the card is omitted (never blocks the overview).
  Mobile: full width, cta buttons wrap under the text.
- The empty-list guide pattern is FND's (`components/workspace/empty-guide.tsx`, already in ListFrame); nothing to add.

## Reuse
`components/workspace/setup-checklist.tsx` (+ its test fixtures), `lib/retail/onboarding.ts` (packet 37), `lib/retail/fiscalisation.ts`
`shopFiscalDevice`, `lib/retail/payment-settings.ts`, `lib/retail/devices.ts`/`tills.ts` (paired state), `lib/retail/people/*`.

## Remove
Nothing (FND-10 built components only; no other checklist endpoint exists — confirm `grep -rn "setup/checklist" app lib`).

## Seed
None new. The demo tenant's `RetailOnboarding.checklistDoneAt` is set by packet 37's seed (fully set up → no card).

## Tests
- `lib/retail/checklist.test.ts`: each rule done/not done with fixtures; why texts; EcoCash item absent while EcoCash is off; hand tick
  and untick; data-done cannot be unticked; hidden until next Harare midnight (fixed clock at 23:30 and 00:30); all done sets
  `checklistDoneAt` once and `show` stays false after an item later becomes undone.
- Route test: non-owner 403.

## Acceptance
1. On a fresh `/signup/tender` tenant taken through packet 37's onboarding (no suppliers, no fiscal device, no EcoCash code), `/retail`
   as that owner shows the card side by side with `Guided.png` (left card): "4 of 7", the four struck rows with their whys from data,
   three open rows with their ctas.
2. Click "Add your suppliers"'s circle → "5 of 7" (hand tick); click again → back to "4 of 7". The "Pair a till" circle does nothing.
3. "Hide until tomorrow" → the card is gone; `checklistHiddenUntil` = next Harare midnight; it returns after (test with a fixed clock).
4. Add a supplier, save an EcoCash merchant code, tick fiscal by hand → "7 of 7" → the card disappears and `checklistDoneAt` is set;
   unticking is no longer possible (the card never returns).
5. As `tafara.manager@` on that tenant (or the demo): no card; `GET /api/v2/retail/setup/checklist` → 403. On the demo tenant as
   `owner@bottlestore.test`: no card (fully set up).
6. `npx eslint <changed>`; `npx vitest run lib/retail/checklist.test.ts components/workspace/setup-checklist.test.tsx`; `pnpm typecheck` alone.

## Depends on
Packet 37 (SET-12: `RetailOnboarding`, onboarding), packet 30 (suppliers rule), FND-10 (components, landed). Holds the overview lock (O):
FLR-08 later rebuilds the overview and must keep this card in its "above everything" slot.

## Risk
standard.

## Open questions
- EcoCash why: the board's "So EcoCash payments confirm on their own." promises an integration that does not exist (setup open question
  4; SET-05 already reworded its hint) — replaced by "So customers know which merchant to pay.".
- C-43: acceptance on a fresh signup; the demo tenant shows no card by design.
