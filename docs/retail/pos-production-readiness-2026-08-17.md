# The POS surface: what exists, what is missing, what is unproven

**Date:** 2026-08-17 · **Contract:** `docs/design-system/portals/pos.html`
**Governs:** `docs/retail/retail-stock-consolidation-plan-2026-08-13.md` §1.6

Written as a stock-take, not a status report. Everything below was read off the
repository and the database, not remembered. Where something is asserted rather
than proven, it says so.

---

## 0. The one-line answer

**As first written (2026-08-17, morning):** the POS was not production-ready and
the gap was not mostly code. Nine of the seventeen surfaces the contract names
were built and wired; three existed but could not be reached; two were not
built; and — the part that mattered most — **not one POS screen had ever been
opened in a browser.** Every claim of "working" rested on typecheck, unit tests
and reading the code.

**Where it stands now.** All seventeen surfaces exist and are reachable. The
money path has been driven through the UI and is backed by rows in the ledger:
a sale, a refund and a void under a manager's approval, a cash drop, and a
cash-up against the variance they produce. Opening the browser was worth more
than the document expected — it found that **the till could not sell at all**
(§1.5), that **reversals were unreachable while their endpoints were open to a
cashier** (§1.6), and that **a cashier could not bank cash from their own
drawer** (§1.9). None of the three was visible from the code.

What is still missing is a single clean end-to-end pass — see §4A — and real
photographs on the shelf (§1.8).

---

## 1. Screen by screen, against the contract

`docs/design-system/portals/README.md` states the rule for these prototypes:
*every feature in a demo is required*. Measured against `portals/pos.html`:

| # | Contract surface | Route | State |
|---|---|---|---|
| 1 | Sell / cart / search / discount / split tender | `/` | **driven through the UI** |
| 2 | Saved sales | `/held` | built, wired, rendered |
| 3 | Sales history | `/history` | **driven through the UI** |
| 4 | Refund a sale | in `/history` | **driven**; was unreachable — see §1.6 |
| 5 | Void receipt | in `/history` | **driven**; was unreachable — see §1.6 |
| 6 | Open till & start shift | `/shift` | **driven through the UI** |
| 7 | End shift (cash-up) | `/shift` | **driven through the UI** |
| 8 | **Cash drop / pickup** | in `/shift` | **driven**; was 403 for cashiers — see §1.9 |
| 9 | **Z-report** | in `/reports` | built, wired, rendered |
| 10 | **Offline queue** | `/offline` | built; **wired 2026-08-17**, was orphaned |
| 11 | **PIN unlock** | portal-wide | built; **wired 2026-08-17**, was orphaned |
| 12 | Find an item (price check) | `/price-check` | built; **route was a redirect stub**, fixed 2026-08-17 |
| 13 | Customers + add new | `/customers` | built; **route was a redirect stub**, fixed 2026-08-17 |
| 14 | Till dashboard (top items, hour by hour, tender mix) | `/overview` | built; **route was a redirect stub**, fixed 2026-08-17 |
| 15 | **Till settings** — identity, currency & tax, discount limits, PINs, printer, receipt template | `/settings` | **built 2026-08-17** |
| 16 | **Audit log** | `/activity` | **built 2026-08-17**, as a derived view — see §1.4 |
| 17 | **Help & keyboard shortcuts** | `/help` | **built 2026-08-17** |

### 1.1 Three screens a cashier cannot reach

**Corrected 2026-08-17.** This section originally said the three were "built, not
in the nav rail", and that was too kind. `app/portal/pos/price-check/page.tsx`,
`customers/page.tsx` and `overview/page.tsx` were each a bare
`redirect("/portal/pos")` — the components were complete and the routes that
should have rendered them threw the cashier back to checkout.

So the nav entries added earlier that day made it *worse*, not better: three
buttons in the rail that bounced. Both halves are fixed now — the pages render
their views, and the rail points at them.

The lesson is the one this document already has in §5, sharpened: a component
existing is not a screen existing, and grepping for the component name finds the
import in the page whether or not the page renders it.


### 1.2 Two surfaces were orphaned until today

`pos-offline-queue-view.tsx` and `pos-lock-screen.tsx` were fully written and
imported by nothing. The agent building them dropped on a connection error at
the exact moment it reported starting the offline queue view, and the work was
committed without the gates being run. They are wired now — a route plus a rail
entry for the queue, and the lock provider wrapped around the portal layout —
but wiring is not verification.

### 1.4 The layout gap nobody had measured

Found only by opening the thing. `pos-checkout-view.tsx` declared its grid
columns at `xl` and nowhere else:

```
md:grid xl:grid-cols-[minmax(0,1.42fr)_minmax(360px,0.9fr)]
```

Every width from 768 to 1279 therefore got a **single-column** grid: the catalog
filling the screen and the payment rail — keypad, Charge button and all — stacked
underneath, below the fold, inside an `overflow-hidden` container. The till's
actual device is a 1024×768 tablet, so that band was not an edge case. It was the
shop floor.

Compounding it, the keypad sat at the bottom of the payment section's *scroll*
container, so even once the columns were right, how far a cashier had to scroll
to reach the number pad depended on how many lines were in the basket.

Fixed by two columns from `md`, and by moving the keypad and Charge outside the
scroll region so the basket scrolls and the input surface never moves. Key
heights and the amount display now key off viewport *height* rather than width —
a 1024×768 tablet is wide enough to trip a `sm:` breakpoint and short enough that
what it triggered did not fit. `e2e/retail-shots.spec.ts` asserts the keypad's
bottom edge is inside the viewport at every width from `md` up, so this cannot
regress quietly.

### 1.5 The till could not sell

**Every sale the POS posted came back `400`.** Not intermittently — every one.

`saleLineSchema` in `app/api/v2/retail/pos/sales/route.ts` requires
`productId: z.string().uuid()`. S-4b moved the item master from
`RetailCatalogItem` to `Product` and moved the API with it. The one place that
builds the request — `buildSalePayload` in `pos-portal-state.tsx` — was never
updated and kept sending `catalogItemId`, so zod rejected the body before any
of the arithmetic this module is so careful about ever ran.

The offline path had the identical defect: `PosSaleQueuePayload` also declared
`catalogItemId`, and `pos/sync` also requires `productId`. That one is worse in
shape — the till would have taken cash all day with the line down and then
failed to put a single sale up when it came back.

**Nothing in the repository could have caught this.** Typecheck cannot: the
payload is an object literal serialised to JSON, so the contract between the two
halves is only checked at runtime, by zod. The 466 unit tests cannot: not one of
them posts a sale. Reading the code does not do it either — both sides look
correct in isolation, and the field name is plausible on both.

It took ringing a sale through the UI. That is precisely the gate §4A named:

> **A. Prove the till sells.** One sale, one refund, one void, one cash drop,
> one cash-up, one Z-report — driven through the UI, not the API. This is the
> gate everything else waits behind.

It was the right call, and the reason was better than the document knew: the
gate was not confirming work that was probably fine. It was the only instrument
that could see the module's single most serious defect.

`e2e/retail-workflows.spec.ts` now holds that gate open.

### 1.6 Reversals were unreachable, and the endpoint was open

Three separate answers to "may a cashier reverse a sale?", and only one of them
was right.

| | Said | |
|---|---|---|
| `RUN_A_TILL` in `lib/retail/permissions.ts` | **No** | correct and deliberate |
| `pos-history-view.tsx`, gating on `isManagerRole` | **No** | agreed, by accident |
| `pos/sales/[id]/refund` and `.../void`, gating on `requireRetailPos` | **Yes** | a hole |

`requireRetailPos` admits `RETAIL_MANAGER_ROLES` **plus `CASHIER`**, so a
cashier could POST either endpoint directly and reverse a posted sale that the
UI had never offered them a button for. `route-guard-coverage.test.ts` could not
see it, and that is the interesting part: it asks *is there a gate*, and there
was one — the wrong one. It now holds those two handlers to the specific gate.

The UI half was worse than a wrong gate. The POS portal admits `CASHIER` and
`POS_CASHIER` only, and the buttons rendered only for `isManagerRole` — two
disjoint sets. **No user who could reach the till could ever see Refund or
Void.** Contract surfaces #4 and #5 were listed as "built, wired, unverified";
they were built, wired, and unreachable.

Moving them to the back office is not the fix, and the reason is concrete: a
refund needs a `shiftId`, because the cash going back to the customer comes out
of a real drawer and has to land against the count at cash-up. A manager in the
office has no drawer. The reversal has to happen *at a till*.

So the manager approves at the till: `lib/retail/manager-override.ts` — lifted
out of the price-override block in `pos/sales`, which had this shape already —
verifies the named manager against the same matrix and their own password, and
writes the approver's name onto the reversal. One act, no session.

Two pieces of copy were describing a flow that did not exist and have been
corrected: the till settings capability list and the help screen both told a
cashier that "a manager approves it at the till with their password" while no
such dialog existed anywhere in `components/`.

### 1.7 A 19-digit receipt number

Every POS sale was handed to the customer as `RSL-1787005857220984`.
`buildSalePayload` generated `RSL-${Date.now()}${random}` and sent it as
`saleNo`, so `reserveIdentifier` — which allocates a short sequential number —
was never reached.

The obvious fix is wrong. That key is the idempotency guard: if the POST commits
and the response is lost, the sale is queued and replayed, and the repeated
`saleNo` collides on `@@unique([companyId, saleNo])` so
`createRetailSaleTransaction` returns the sale that already exists. Drop it and
a flaky Harare line charges the customer twice.

So the two jobs got two columns. `RetailSale.clientRef` (added by
`scripts/retail-sale-client-ref.ts`, nullable, `@@unique([companyId, clientRef])`)
carries the till's key for the attempt; the server numbers the receipt. Receipts
now read `RSL-0002`.

### 1.8 Shelf photographs: rendered for months, never fillable

`Product.imageUrl` existed, `loadSellableProducts` returned it, and the till drew
it in both the catalogue grid and the phone list with a package glyph as the
fallback. Nothing in the product could put a value there. The catalogue API took
`imageUrl` as a `z.string().url()` — a link to somebody else's website — and no
screen offered a field at all. **0 of 30 active products had one**, so every card
on the demo till was a grey box.

Built: `POST /api/v2/retail/catalog/image` (multipart, `retail.catalog` `update`,
2MB cap, magic-byte sniffing so a renamed PDF cannot be stored and served back),
`CatalogImageField` in the catalogue dialog, and `imageUrl` carried through the
form's save.

Two decisions worth keeping:

- **The field sits above "Advanced options", not inside it.** It was inside for
  one commit. A shelf photo is the single most visible attribute an item has —
  it is what a cashier navigates the grid by — and filing it behind a collapsed
  toggle is how a feature ships and never gets used. `e2e/retail-catalog-image.spec.ts`
  asserts it is reachable without expanding anything.
- **The service worker now caches images cross-origin.** `public/sw.js` returned
  early for every request that was not same-origin, and the photographs live on
  a blob host — so a till dropping off the line would have lost every picture at
  once, turning the grid back into grey boxes at the moment the shop is most
  stressed. The new branch is narrow: GET, `destination === "image"`, and a path
  ending in an image extension.

### 1.9 A cashier could not bank cash from their own drawer

`POST .../cash-movements` answered **403 `Feature disabled: retail.shifts`**,
and every layer was behaving as designed:

- the tenant *has* `retail.shifts` enabled;
- `getEffectiveFeaturesForUser` filters the company's features through the
  caller's role template, and a `CASHIER` is not given `retail.shifts` —
  correctly, because that key guards the back-office shifts screen, a manager's
  view of *every* cashier's drawer;
- and `route-registry.ts` maps the whole `/api/v2/retail/shifts` prefix to it.

So a till function inherited a back-office entitlement purely from where its URL
sat. The registry matches on prefixes and takes the longest, and the path that
would need singling out has a dynamic segment in the middle — no prefix can
express it. Granting `CASHIER` the `retail.shifts` default would have fixed the
symptom by handing every cashier the manager's shift screen.

The endpoint moved to `/api/v2/retail/pos/shifts/[id]/cash-movements`, a pure
re-export of the same handlers. They still decide *who* may act — your own
drawer is `retail.sell`, anybody else's is `retail.cash-control`. Only the
feature key the door is on changed. The old path stays for the back office.

Worth recording separately: the UI gave no sign. The dialog counted the notes,
showed "Expected cash after this 187.20", and stayed open. It was found by
reconciling the shift against the database afterwards, not by watching it.

### 1.10 What else the browser found

Neither of these was visible from the code, and both were sitting on the till.

**The generic offline chrome was standing on the selling screen.** Two pieces,
mounted product-wide in `OfflineChrome`:

- `OfflineRuntimeBanner`, a ~120px block in the document flow carrying a
  progress bar for a service-worker cache warm. On a scrolling page it is
  merely noisy; on a 768px-tall fixed-layout till it took a sixth of the screen
  to report something no cashier can act on.
- a status pill pinned `bottom-right` at `z-70`, which on the till landed
  precisely on the keypad's backspace key and covered it.

Both are gone product-wide, replaced by one muted icon in the navbar —
`OfflineStatusButton` — that opens `OfflineRuntimePanel`. That panel was already
written, complete, and imported by nothing: the icon-and-panel design had been
intended and only the trigger was missing. The connectivity strip stays, because
"you are offline" is the one thing that should interrupt.

**The keypad had a fifth row holding one key.** Thirteen buttons in a
three-column grid wraps `CLR` onto a row of its own — 56px spent on one button,
taken out of the basket above it. `CLR` now sits beside the amount readout,
which also gets a destructive key out from under the digits.

**The till bundle pulled in the Postgres driver.** `pos-till-activity-view.tsx`
imported its chip labels and entry type from `lib/retail/till-activity.ts`,
which imports `lib/money`, which imports `lib/prisma`, which requires `dns`.
The whole app stopped compiling:

```
Module not found: Can't resolve 'dns'
  ./lib/prisma.ts        [Client Component Browser]
  ./lib/money.ts         [Client Component Browser]
  ./lib/retail/till-activity.ts
  ./components/retail/portal/pos-till-activity-view.tsx
```

This is the trap `lib/retail/checkout.ts` documents in its own header — it has
no imports *on purpose*, because it is bundled into the offline till and
`lib/money` is the dependency that keeps getting added by accident. The pure
half now lives in `lib/retail/till-activity-shared.ts` with no imports at all,
and `till-activity.ts` re-exports it.

Worth noting how it was caught, because it nearly was not: the screenshot run
went **green** while photographing Next's red build-error overlay, since the
guard regex only knew application phrases like "Unable to load". `ERROR_BANNER`
now matches build and runtime overlays too. A dev overlay is the most complete
failure a screen can have and it was the one thing the guard could not see.

**Nine in the rail, three in a menu.** The rail cannot hold twelve 44px targets
at 768px — with the workspace block and footer it comes to roughly 850px, so
Activity, Settings and Help sat below the fold. Shrinking the targets was not an
option. They moved behind the operator badge, with Log out, which is where
"about you and this terminal" belongs anyway. Nothing in the till scrolls to be
reached now.

### 1.3 Till settings has an API and no screen

`app/api/v2/retail/pos/till-settings/route.ts` exists. Nothing in
`components/` or `app/` references it. The contract puts six settings groups on
the till; today all six live only in the back office at `/retail/setup/**`,
which a cashier on a tablet cannot open and should not be able to.

Worth stating plainly: **this is the one place where "reuse the back office"
was the right instinct and produced nothing usable.** The endpoint was built to
serve a screen that was never started.

---

## 2. What is genuinely proven

Not everything here is soft. The following are backed by tests that fail when
the behaviour breaks:

| Area | Evidence |
|---|---|
| Cash-up arithmetic incl. drops | `lib/retail/cash-up.test.ts` — hand-worked Friday, 21 assertions, exact `Decimal` |
| Multi-currency drawer | same file — a ZWG tender counts at $200, not 5,500 |
| VAT-inclusive checkout | `lib/retail/checkout.test.ts` — $1.20 tag = $1.04 + $0.16 |
| Refund/ledger identity | `lib/retail/sale-totals.test.ts` — 5 cases incl. part-refunds |
| Z-report figures + immutability | `z-report.test.ts`, `z-report-rerun.test.ts` |
| Offline replay verdicts | `offline-queue-verdict.test.ts`, `replay-price-review.test.ts` |
| PIN lockout | `till-pin.test.ts` |
| Every write is gated | `route-guard-coverage.test.ts` |
| Schema matches the database | `schema-migration.test.ts` (caught two enums reverting to `text`) |

466 tests green, typecheck 0, lint 0 across the four retail paths.

**What that does not cover:** whether a page renders, whether a button is
reachable, whether the till can complete a sale. No test in this repo drives the
POS through a transaction.

---

## 3. The honest risk list, ordered

1. **A sale has never been rung end to end.** Not by a test, not by a human. The
   checkout path was rewritten twice this week — S-3 moved price resolution to
   the core engine, S-4b moved item identity from `RetailCatalogItem` to
   `Product` — and neither change has been exercised through the UI.
2. **Till settings has no screen**, so shelf-level configuration a shop needs
   mid-day (discount ceiling, receipt footer, printer) is unreachable from the
   till.
3. **Three built screens are unreachable.**
4. **No audit log and no help**, both named by the contract.
5. **`RetailCatalogItem` is an unread shadow** — everything reads `Product`, but
   the drop is deliberately un-run pending exactly the verification that has not
   happened.

---

## 4. What "ready" requires, in order

**A. Prove the till sells. — DONE, and it did not.** `e2e/retail-workflows.spec.ts`
opens a drawer, rings two bottles, takes a $10 note, charges, and reads the
change back off the receipt. The first time it ran it found §1.5: the POS could
not post a sale at all. Fixed, and the sale below is the proof:

| | |
|---|---|
| Sale | `RSL-1787005374335700` |
| Line | 2 × Castle Lager 340ml @ $1.20 |
| Total | $2.40 (VAT inside the shelf price) |
| Tendered | $10.00 cash |
| Change | $7.60 |

Refund, void and cash drop are still only *rendered*, not driven — see §4A′.

**A′. The reversal paths — DONE, and they were unreachable.** Driving them was
supposed to be a matter of adding steps to the spec. It turned out refund and
void could not be reached by any user who can open the till, and the endpoints
behind them were open to a cashier who called them directly. See §1.6.
`e2e/retail-workflows.spec.ts` now rings a sale, refunds it under a manager's
approval, drops cash to the safe and cashes up against the difference.

**A void — DONE.** `e2e/retail-void.spec.ts`, its own file rather than another
leg on a spec that already runs half an hour: a failure there should say "void
is broken", not "the trading day timed out somewhere". It walks the cashier's
history for a receipt nothing has reversed, voids it under a manager's
approval, and the ledger shows `RSL-0009`, −2.40, *"Rung on the wrong till
(approved by Tafara Nyathi)"*, against source `RSL-0008`.

**What is still not proven is a *single* clean pass.** Sale, refund, cash drop,
cash-up and void are each green on their own; they have never all gone green in
one run. That is the shared Neon pooler rather than the code — `POST /pos/sales`
measured 86s early in a long session and 3.0min by the end of one — and the fix
is a quiet database, not a longer timeout.

**B. Close the reachability gaps. — DONE.** And they were worse than nav
entries: the three routes were `redirect()` stubs. See §1.1.

**C. Build till settings. — DONE.** `/settings`, reading the endpoint that had
been waiting for it.

**D. Audit log and help. — DONE.** `/activity` and `/help`.

**E. Then, and only then, drop `RetailCatalogItem`.** Now genuinely unblocked:
the sale path has been exercised end to end and reads `Product` throughout.

---

## 5. Why this took the shape it did

Recorded because the pattern is worth not repeating.

The POS had **no ticket in either plan** until 2026-08-17. Both plans treated it
as done because it existed and worked, and the build contract at
`design.corelith.co.zw/portals/pos/demo.html` was never downloaded — while the
three school portals had been, and were being treated as contracts. The
back-office surfaces got a design-system pass, a permissions matrix, a nav
reconciliation and a full schema migration; the highest-traffic surface in the
module got none of them until this week.

The second factor: three agents building POS work were interrupted mid-task —
two by connection loss, one by a session limit — and their output was committed
without the verification gates running. That is how two finished components came
to be imported by nothing, and how a missing import in `pos/sync/route.ts` sat
in the tree until a typecheck caught it days later.
