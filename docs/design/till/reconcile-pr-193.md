# Reconciling the till branch with PR #193

## 1. Verdict

The two branches overlap heavily, and merging both as they stand is not safe. PR #193 (`origin/claude/corelith-design-system-ox0036` at `59996a51`, 81 commits, open as a draft and mergeable) already builds most of the server side of this branch, but with different tables, names and policies. That covers till pairing, devices on shifts and sales, PIN sign-in, deposits, cases, the ID check, tenders and till rules. Merging both as they are fails in four places:

- **Migrations.** Our `prisma/migrations/20261005090000_till_pairing_liquor` sorts into the middle of PR #193's 27 migrations. PR #193's `20261003170000_retail_sale_deposit` adds `RetailSale.depositAmount` first, so ours fails with "column already exists". Its `20261005180823_retail_till_on_shift_and_sale` adds `RetailShift.deviceId` and `RetailSale.deviceId`, with foreign keys of the same names (`RetailShift_deviceId_fkey`, `RetailSale_deviceId_fkey`) that point at `RetailDevice` instead of our `RetailTillDevice`. I checked both migrations.
- **Compile.** Our `_services.ts`, the `pos/sales`, `refund`, `void`, `context` and `till-settings` routes, `lib/retail/provision.ts` and `lib/retail/setup-snapshot.ts` import `tender-policy`, `manager-override`, `pos-policy` and `setup-profile`. PR #193 deletes all four, and also deletes `pos/context`.
- **Data.** PR #193's migrations delete the `RETAIL_POS_POLICY`, `RETAIL_TENDER_POLICY` and `RETAIL_SETUP_PROFILE` rows, which our code still reads. They also turn `MOBILE_MONEY` into `ECOCASH`, while our `components/retail/till/pay-tray.tsx` and `pos/sales` still send `MOBILE_MONEY`.
- **Silent breaks that git will not flag:**
  - **Icons:** `lib/icons.tsx` would export `ChartBar`, `CreditCard`, `DeviceMobile`, `Ticket` and `Trash` twice, so the build fails.
  - **Account 2250:** in `lib/accounting/defaults.ts` ours names it "Container Deposits Held"; PR #193 names it "Vouchers issued" and holds deposits on 2240.
  - **Permission matrix:** both branches add `lib/retail/permission-matrix.ts`. PR #193's has no `retail.setup`, and our 3 new routes gate on it.

On the UI side, our branch deletes the 27 `components/retail/portal/pos-*` files that PR #193 spent about 15 commits extending.

The fix is to land PR #193 first. Then rebase ours as "our till screens on PR #193's server", and keep a short list of features only we have.

## 2. Concept by concept

| Concept | Keep | Port from the other side | Why |
|---|---|---|---|
| **Device and pairing model** | PR #193: `RetailDevice`, `RetailPairingCode` (PAIR/REPLACE), `RetailPairingThrottle`, `RetailDeviceMessage`, `lib/retail/devices.ts`, `lib/retail/pairing.ts`, `lib/retail/tills.ts`, `app/api/v2/retail/devices/*`, `app/api/v2/retail/tills/*` | From ours: <br>• the `register.isActive` check, added to `requirePosDevice`, which does not check it <br>• "unpair from the till itself" (our `pos/device` DELETE) <br>• "forget a dead cookie" (our `pos/device` PATCH), as small routes under `devices/` <br>• optionally, a foreign key from `RetailPairingCode.deviceId` to the device | PR #193 checks in the database that each till has one live device (a partial unique index, verified). Its codes are salted per company and unique inside a transaction. The wrong-code throttle lives in Postgres and reads the trusted address (the last `x-forwarded-for` entry or Vercel's `x-real-ip`). Ours keeps the throttle in memory (`lib/retail/pairing-throttle.ts`) and keys it on the first `x-forwarded-for` entry, which the client chooses (verified). PR #193 also records an audit event when a till is paired, replaced or unpaired, and enforces the plan's `maxTills`. |
| **Where pairing happens** | PR #193: POS host only (`devices/pair` returns 404 elsewhere). `proxy.ts` drops till-pin tokens off the POS host, and `access.ts` and `api-guard.ts` refuse them. | None | Our `pos/pair` works on any host where `resolveSignInScope` succeeds. A device paired on the workspace host would give a manager a back-office session from a 4-digit PIN. |
| **PIN sign-in (`till-pin`)** | PR #193's provider in `lib/auth.ts`: POS host only, `checkTillPinSignIn`, device claims in the JWT. Same registry entry. | From ours: <br>• `enforceSignInRateLimit` (PR #193's till-pin does not call it; verified) <br>• the password fallback when a PIN is locked <br>• `app/api/v2/retail/pos/pin/first` (first PIN set on the device), moved onto `RetailDevice` and the `tender_device` cookie | Both branches add the same provider id, so only one can stay. PR #193's is the safer one. Ours covers a cashier on their first day and a locked PIN without leaving the till. |
| **"Who is selling?" data** | PR #193's `GET devices/people` (`tillPeople`): short names, PIN holders only, the same list that decides who may sign in | From ours: extend it with `pinLocked`, the open shift, and an entry for "no PIN yet → set your first PIN" | PR #193 exposes less. Ours handles people who have no PIN yet. |
| **Manager approval** | PR #193: `lib/retail/manager-pin.ts`, `approver {userId, pin}`, thresholds from `RetailTillRules` (decision C-31) | Our approval dialogs in `sale-parts.tsx` and `history.tsx` change from asking for a password to asking for a PIN | Recorded owner decision C-31. `manager-override.ts` is deleted on PR #193. Our "manager by password" came from reading main's code, not from an owner decision (`ledger.md`, 5 Oct). Needs confirming: Q1. |
| **Schema: shift and sale till** | PR #193: `registerId` (required on a shift, backfilled) plus `deviceId` pointing at `RetailDevice`, `refuseShiftElsewhere` | From ours: the rule "someone else's open shift on this till blocks a new one" (`pos/shifts/route.ts:41-55`), re-keyed on `registerId` | PR #193 checks the person; ours checks the till. Both rules are wanted. |
| **Schema: deposits** | PR #193: `RetailSaleLine.depositAmount` (net of empties), `RetailSale.depositAmount`, `RetailZReport.depositTotal`, `lib/retail/deposits.ts`, account 2240 with the `DEPOSITS_HELD` role | Drop our `emptiesReturned`/`emptiesCredit`, our 2250 account and our posting lines | PR #193 handles partial refunds, the Z report and the ledger role. The account code collides. |
| **Schema: ID check** | PR #193: `RetailSale.idCheckedAt`, `RetailCategory.ageRestricted`, the `RetailShopProfile.ageCheck` switch | Drop `ageCheckedById`. In our code it always equals the cashier. | Same fact, and PR #193's configuration is richer |
| **Schema: cases** | PR #193: `Product.packOfId`/`packSize` with check constraints and an index, `StockMovementReason.CASE_BROKEN`, `lib/retail/cases.ts` | Our till-side "open a case" (`pos/open-case`, `openableCase`/`casesOnHand` in `lib/retail/shelf-listing.ts`) rebuilt on `packOfId`, writing `CASE_BROKEN` movements | Same model under different names. PR #193 only opens a case in the back office. |
| **Licence hours** | Our `RetailLicenceHours` table (per site, per weekday, minutes after midnight, closed days) | From PR #193: the `RetailShopProfile.licenceHours` switch, `licenceNumber` and `licenceExpiresOn`. Drop PR #193's four `HH:MM` columns and point `liquorSaleRefusal` (`lib/retail/shop-profile-rules.ts`) at the table. | A licence is per premises, and Saturday often differs. Two sources of truth would disagree at the till. Q2. |
| **Held-sale discard** | Ours: `RetailHeldCart.releasedAt`/`releasedById`, `pos/held-carts/[id]/discard` | Add `requirePosDevice` to that route | PR #193 has no equivalent |
| **Tenders and ZiG** | PR #193: `ECOCASH`/`INNBUCKS`/`ON_ACCOUNT`, USD or ZWG on each payment, a rate stamped by the server, `changeZig` | Our `pay-tray.tsx` gains ZiG cash and the new tenders | The enum migration rewrites `MOBILE_MONEY` |
| **Till rules and policy** | PR #193: `RetailTillRules`, `RetailShopProfile`, `devices/me` (`tillContext`), the reshaped `pos/till-settings` | Our `state.tsx` reads `devices/me` instead of `pos/context`. `person.tsx` stops reading `rules.requiredReferenceTenders`. | PR #193 deletes the JSON rows and the modules ours reads |
| **Till screens** | Ours: `components/retail/till/*`, designed and reviewed on the till canvas (`docs/design/till/ledger.md`, `build-plan.md`) | Port PR #193's portal-only behaviour into our components: <br>• `pos-device-watch.ts`: on 401 `DEVICE_UNPAIRED` or 409 `NOT_A_TILL`, send what the till holds, sign out, go to `/unpaired` → `state.tsx` <br>• `pos-till-messages.tsx` banner and the 60-second heartbeat → `shell.tsx` <br>• `pos-cash-drop-prompt.tsx` and the offline-window stop → `state.tsx`/`shell.tsx` <br>• refund and void reasons taken from the till rules → `history.tsx` <br>• the receipt `printed` stamp and `RetailReceiptSettings` → our `app/portal/pos/receipt/[id]` <br>• the ID check and deposits in PR #193's request shapes (`idChecked: boolean`, `emptiesBack` as a number per line) | Ours is the newer approved design. PR #193's behaviour is otherwise lost when its files are deleted. |
| **POS routes and front door** | PR #193's `proxy.ts` (no device key → `/pair`, signed-out `/` → `/who`, `tender_install`) and its `/pair`, `/who`, `/unpaired` paths | Mount our `door.tsx` at `app/portal/pos/pair/page.tsx` and our `gate.tsx` at `app/portal/pos/who/page.tsx`, replacing `components/retail/device/pair-screen.tsx` and `who-is-selling.tsx`. Keep our `(till)/layout.tsx` contents (`TillStateProvider`, `TillShell`). Use the `tender_device` cookie. | The proxy rules depend on PR #193's cookie names and host binding. Our screens are the better front end. Q3. |
| **`pos/sync`** | Ours: delete it | First confirm that `pos/sales` on PR #193 carries `unpairedSaleGate` and `replayApproval`, then move the cases from PR #193's sync `route.test.ts` onto `pos/sales` | Neither branch's till calls it. PR #193's `lib/offline/module-registry.ts` already sends offline sales through `pos/sales` (verified). It is a second copy of the sale rules. |
| **Back office** | PR #193: `/retail/manage/tills` (ListFrame plus the `till-new`, `till`, `till-replace` and `till-message` sheets), `/retail/manage/company`, `/retail/products/[id]`, `lib/retail/nav/setup.ts` | From ours: <br>• the "type it at `<posAddress>`" line in the code sheet (add `posAddress` to the pairing-code response) <br>• the licence-hours editor as a sheet on `/retail/manage/sites`, gated on `retail.company` or a new grant <br>• a per-product 18+ override and a per-product `maxDiscountPercent` as extra fields in `lib/retail/record-kinds/products.ts` and `lib/retail/product-details.ts` (Q4) | PR #193 deletes `app/retail/setup/*`, `app/retail/catalog/[id]`, the "shop" group in `management-nav.ts` and `retail.setup`. Our panel has nowhere to attach. |
| **Permissions** | PR #193's 37-resource `permission-matrix.ts` | Our routes move from `retail.setup` to `retail.tills` or `retail.company`. Map our `canAccessPosPortal` change (Q5). | An add/add conflict, and PR #193's test fails any route that names `retail.setup` |
| **Shared services** | PR #193's `_services.ts`, `_helpers.ts` (`normalizeRetailPostingPayments({payments, change:{usd,zig}})`) and `defaults.ts` | Drop our change-netting hunks. PR #193 fixes the same bug and also handles currency. | The function signatures are incompatible |
| **Small items** | — | <br>• `lib/retail/loyalty-rules.ts`: instead, have `lib/retail/loyalty.ts` export a client-safe `getLoyaltyTier`, so there is not a third copy <br>• `lib/retail/schema-migration.test.ts`: take PR #193's tender labels and list `RetailDevice.kind`/`unpairReason` plus the deposit and `changeZig` columns | — |

There are also four bugs in our branch, independent of the merge:

- `components/retail/till/person.tsx:399` sends POST to `pos/pin`, which only exports GET, PUT and DELETE, so changing a PIN always fails with 405. It should send PUT.
- The comment in `lib/retail/till-device.ts:40` says the cookie is refreshed on use, but nothing refreshes it.
- Closing a shift and moving cash are not checked against the device.
- Unpairing does not expire live codes.

All four go away once ours is moved onto PR #193's device guard and pairing code, apart from the PUT, which needs fixing in our dialog.

## 3. Order to land them

**PR #193 first. Ours rebases onto it.** PR #193 is the server foundation: 27 migrations with witness tests, typed settings and the device model. Ours is uncommitted, with one migration that cannot apply after PR #193's.

The second PR (ours, rebased) needs these changes:

1. **Schema.** Delete `prisma/migrations/20261005090000_till_pairing_liquor` and the `RetailTillDevice`, `RetailTillPairingCode`, `caseOfProductId`/`unitsPerCase`, `ageChecked*` and `emptiesReturned`/`emptiesCredit` parts of `schema.prisma`. Generate one new migration with a timestamp after `20261006024232`. It contains only:
   - `RetailLicenceHours`, plus dropping the four `HH:MM` columns on `RetailShopProfile` if Q2 goes our way
   - `RetailHeldCart.releasedAt`/`releasedById`
   - optionally, a foreign key on `RetailPairingCode.deviceId`

   Ship a migration witness test with it, as AGENTS.md requires.
2. **Delete what PR #193 replaces:**
   - `lib/retail/till-device.ts`, `till-device-server.ts`, `pairing-throttle.ts`
   - `app/api/v2/retail/pos/pair`, `pos/context`
   - `app/api/v2/retail/setup/tills/[id]/pairing`, `setup/licence-hours`, `catalog/[id]/selling-rules`
   - `components/retail/till-device-panel.tsx`, `components/retail/selling-rules-dialog.tsx`, `app/retail/setup/licence-hours`
   - our hunks in `app/retail/setup/operations/page.tsx`, `app/retail/catalog/[id]/page.tsx`, `lib/settings/management-nav.ts`, `lib/workspaces.ts`, `lib/accounting/defaults.ts`, `lib/retail/permission-matrix.ts`, `lib/auth.ts` and `strategy-registry.ts`
   - the duplicate exports in `lib/icons.tsx`
3. **Keep, on PR #193's model:**
   - `pos/pin/first`, moved to `devices/` and using `requireHostDevice`
   - the password fallback and `enforceSignInRateLimit`, added to PR #193's `till-pin`
   - `pos/device` DELETE and PATCH, rebuilt on `RetailDevice`, using `unpairTill` (audit, code expiry) and `retail.tills`
   - the `isActive` check in `requirePosDevice`
   - the "someone else's shift is open on this till" check in `pos/shifts`
   - `pos/open-case` on `packOfId`, writing `CASE_BROKEN`
   - `held-carts/[id]/discard` with `requirePosDevice`
   - `app/portal/pos/receipt/[id]`, reading the receipt settings and calling `/printed`
   - deleting `pos/sync`, after its tests move to `pos/sales`
4. **Point the till UI at PR #193's API:**
   - `state.tsx` → `devices/me`, `devices/heartbeat`, plus the device watch
   - `gate.tsx` → `devices/people`, and `signIn("till-pin")` without a password field unless (3) adds one
   - `door.tsx` → `devices/pair`
   - `pay-tray.tsx` → the new tenders, ZiG and `idChecked`
   - the approval dialogs → `approver {userId, pin}`, handling 409 `needsApprover` and 423
   - `history.tsx` → refund and void reasons from the till rules
   - `person.tsx` → PR #193's `till-settings` shape and `PUT pos/pin`
   - `shell.tsx` → messages banner and cash drop prompt
   - mount `door.tsx` and `gate.tsx` at `/pair` and `/who`
   - accept PR #193's `(till)/layout.tsx` rename and put our providers in it
5. **Check:** `pnpm typecheck`, `npx eslint` on the changed files, PR #193's `route-guard-coverage.test.ts` and the migration tests, then a smoke test on the POS host covering pair → who → PIN → sell → unpair from the back office → `/unpaired`.

## 4. Questions for you

1. **Do managers approve at the till with their PIN or their password?** Recommendation: PIN, as in C-31. The device key, the lockout and the approver's name on every record make four digits enough. Our `till-pin.ts` line saying a PIN never authorises an override then goes.
2. **Are licence hours per site and per weekday, or one company-wide weekday window and one Sunday window?** Recommendation: per site and per weekday (our table), switched on by PR #193's `RetailShopProfile.licenceHours` and edited from `/retail/manage/sites`.
3. **Is the till's front door one `/login` screen or PR #193's `/pair`, `/who` and `/unpaired`?** Recommendation: PR #193's paths and `proxy.ts`, showing our `door.tsx` and `gate.tsx` screens.
4. **Should a product be able to override its category's 18+ flag, and keep its own discount ceiling?** Recommendation: yes to both, as two extra fields on the product record. `Product.ageRestricted` and `maxDiscountPercent` are already on main.
5. **Who may sign in at the till: CASHIER/POS_CASHIER only (PR #193), or anyone allowed to open a shift, managers included (ours)?** Recommendation: anyone allowed to open a shift, while keeping PR #193's POS-host session binding. That binding is what makes manager PIN sessions safe.
6. **Does a first-day cashier set their PIN on the till after typing their password, or sign in with a password at `/login` first?** Recommendation: on the till (our `pos/pin/first`), with its rate limit.
7. **Must empties brought back without a deposit sale be reported separately (our `emptiesReturned` count)?** Recommendation: no. Use PR #193's per-line net deposit until someone asks for that report.

I changed nothing in either branch.

Paths:
- Our branch: /Users/user/work/huchu/.claude/worktrees/merge-pr-169-main-6d63a0
- Our migration: /Users/user/work/huchu/.claude/worktrees/merge-pr-169-main-6d63a0/prisma/migrations/20261005090000_till_pairing_liquor/migration.sql
- PIN dialog bug: fixed on 6 October (components/retail/till/person.tsx now sends PUT).