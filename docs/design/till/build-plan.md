# Build plan: the till, one slice

Approved on the canvas on 5 October 2026: Shell B (the icon rail), the eight workflows, the liquor store,
product previews. His words: "B for the shell", "should be implemented in the same slice", "Liqour store
also needs to be built", "products must show their previews too". One branch, one PR
(`claude/till-ui-pairing-ffcff0`), built in the order below so each step runs on the one before.

## 1. Schema (one migration, with its witness test)

| Change | Why |
|---|---|
| `RetailTillDevice`: company, register (the till), kind, `keyHash` (unique), paired by and at, last seen, revoked at, by and why | A device paired to one till; the key in its cookie is stored only as a hash |
| `RetailTillPairingCode`: company, register, `codeHash`, made by, expires (10 minutes), used at, used by device | A manager's six digits, good once |
| `RetailShift.deviceId`, `RetailSale.deviceId` | Every shift and sale carries the till and the device, offline ones included |
| `RetailSale.ageCheckedById`, `ageCheckedAt` | The ID check is kept on the sale with the cashier's name |
| `RetailSale.depositAmount`, `emptiesReturned`, `emptiesCredit` | Deposits ride on returnable products; bottles back come off the sale |
| `RetailLicenceHours`: site, weekday, alcohol from, alcohol until | Licence hours stop age-restricted products, and nobody overrides them |
| `Product.caseOfProductId`, `unitsPerCase` | A case is its own product linked to its single; opening one moves stock |
| `RetailHeldCart.releasedAt`, `releasedById` | Discard uses the `RELEASED` status the enum already has |

## 2. Server

- Pairing: a manager makes a code for a till (back office); the device posts it to `pos/pair`, gets an
  httpOnly key cookie scoped to the POS host. Five wrong codes from one address stop it for 15 minutes.
- Device: `pos/device` answers which till this is and who may sell here, from the key alone.
- Sign-in: a `till-pin` credentials provider. The key says which till, the PIN says who. A PIN is
  sent from People and chosen on first use, over the till (ADM-03, `pos/pin/change`); five wrong
  lock it until a new one is sent, and the account password signs in meanwhile.
- Shift: opens on the device's till with no picker. Closing returns the device to "Who is selling?".
- Sale: carries the device, the manager approval the checkout collects, the ID check, deposits and
  bottles back; refuses 18+ products outside licence hours and discounts over a product's ceiling.
- Held: discard. Stock: open a case. Receipt: a printable page per sale, reprinted from History.
- Unpair and replace: from Till settings (a manager) and the back office.

## 3. The till

Every board on the canvas, composed from one set of till components that carry the kit's values:
the rail, the workbench, the tray, the popover, the dialog, the keypad, tiles with their previews,
lines, payment rows with real marks, the list frame with its footer, the record with its feed.

## 4. Back office

- Tills and devices: pair a till (shows the code), pair another device, unpair.
- Licence hours per site. A product's case: its single and how many.

## Done means

`pnpm typecheck`, `npx eslint` on every changed file, `pnpm test` for the new and touched tests,
the witness test against local Postgres, and every till screen looked at in the browser on the POS host.

## What changed while building

- **Sign-out and the preview host** were added to the slice on 5 October ("just design the preview-host page
  … then implement it, along with the logout flow"), drawn on the canvas page "Signing out, and the preview
  host" first.
- **`pos/sync` is gone.** Offline sales post to `pos/sales` like any other, with the sale number and time they were rung under.
- **Cash change was posted unbalanced on main.** A cash sale debited the whole tender, change included, and a
  void took the change out of the drawer twice. Both now go through `normalizeRetailPostingPayments`.
- **Deposits are a liability**, account 2250 Container Deposits Held, outside VAT: charged on a sale, given
  back on bottles back, reversed on a void.
- **On the POS host, `/login` was the workspace sign-in.** It is the till's door now.

## Not built in this slice

- Bottles back paid out as cash, with nothing bought: today the empties only come off a sale.
- Printed slips for the cash-up and the shift's takings. The receipt prints; the end-of-day report prints
  from the browser.
- The e2e specs (`e2e/pos-portal-suite.spec.ts`, `e2e/retail-*.spec.ts`) still drive the old till and fail
  against this one. They are rewritten with the till's flows, not patched.
