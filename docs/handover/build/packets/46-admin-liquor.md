# 46 · A liquor store, switched on, everywhere it shows

## Screen
No page of its own. What it touches:
- The till (`/portal/pos`, FLR-09/FLR-10's screens): verifies the four Liquor moments behave per switch; licence hours now honour public holidays.
- Setup › Shop (`/retail/manage/company`): the switches (already built by FND-08/SET-01).
- The Overview (`/retail`, FLR-08's "Needs action"): the licence item.
- The retail worker: the licence reminder (owners' notification + WhatsApp).

## Units
ADM-08 (docs/handover/80-admin.md §W-61, §3.3 `retail_licence_reminder`, §3.4 `licenceReminded`, §4.6, §5.11 (as the till's spec, built
by FLR-10), §5.11.5, §7 ADM-08), with **C-27**: FLR-10 builds every till screen (age check dialog, licence banner and "Not sold", deposit and
bottles-back lines, case prompt and auto-break); ADM-08 adds only the switch tests, public holidays and the reminder (and the old-dialog
removals belong to FLR-10). **C-05**: ADM-08 owns the licence reminder (SET-01 built the worker without it).

## Boards
`Liquor.png` — "W-61 · Shop-type features" / "A liquor store, switched on"; four panels, each the till moment (dark till card) and its
explanation: 1 "Check ID: 18 and over" ("Front till · Chipo Dube"; "Johnnie Walker Black 750ml is in Spirits, which needs an ID check."; "Remove
it" / "18 or over"; "Asked once a sale. Logged with the cashier’s name."); 2 licence hours ("Front till · Monday 22:04"; banner "Alcohol stops at
22:00 on weekdays. Soft drinks and snacks still sell."; Castle Lager 340ml "Not sold", Coca-Cola 2l 2.50, Ice 2kg bag 1.50; "A manager PIN cannot
override it; the licence is the law."); 3 empties ("Back till · Kuda Banda"; "Castle Lager 340ml × 6 7.20", "Deposit, 6 bottles 0.60", "Bottles
back, 12 −1.20", "To pay 6.60"; "Bottles back" / "Pay"); 4 cases ("No singles left"; "Castle Lager 340ml shows 0 singles but 4 cases. Open a
case?"; "Not now" / "Open 1 case"; "1 case off, 24 singles on. Automatic if Break cases at the till is on."). Footer: "On receipts. The licence
number and “Not for sale to persons under 18”." · "Reminders. The licence expiry, 60 days before, on the overview and on WhatsApp." · "Start.
Seven liquor categories and a 180-product Zimbabwean catalogue in onboarding.".

## Workflows
W-61 Shop-type features (Owner; Setup › Shop; guided): Liquor: age check, licence hours, empties · Turn each on or off — the table verbatim
§W-61 (what each switch does when off/on, server and screens), made true and tested switch by switch.

## Roles
Owner changes the switches (`retail.company:update`; superuser through packet 35). Cashier at the till sees the moments (`chipo.till@`, PIN
1928; `kuda.till@`, PIN 3746 for the Back till panel). Owners receive the reminder (`owner@bottlestore.test`, phone +263 77 412 0098). Manager
`tafara.manager@` reads.

## Data
Existing: `RetailShopProfile` (business type, four switches, `licenceNumber`, `licenceExpiresOn`, hours), `PublicHoliday` (companyId, date,
siteId?), `RetailSale.idCheckedAt`, `RetailMessage`, `Notification`.
Migration `<stamp>_retail_licence_reminder`, witness `lib/retail/licence-reminder-migration.test.ts`: `RetailShopProfile.licenceReminderSentFor
DateTime? @db.Date` (no marker exists from SET-01 — checked: none in the schema). Witness: the column.

## Server
- **Public holidays** — `lib/retail/shop-profile-rules.ts`: `isWithinLicenceHours(hours, at, timeZone, { holiday })` treats `holiday` as a
  Sunday (Sunday window); `licenceWindowLabel` likewise. New `isPublicHoliday(companyId, siteId, at)` in `lib/retail/holidays.ts` (+ test):
  a `PublicHoliday` on the shop-clock date for that site, or for the company (siteId null). Callers pass it: `pos/sales` (the server refusal
  stays whatever the body carries: "<Product> can't be sold now. The licence allows …"), the till's context (`GET
  /api/v2/retail/devices/me`, SET-04) so the till's banner reads "Alcohol stops at 18:00 on Sundays and public holidays. Soft drinks and snacks
  still sell." on a holiday. No manager PIN path exists for it (assert the approval dialog is never offered: `pos/sales` answers 400/409 with
  the licence sentence and never `needsApprover`).
- **Reminder** — `lib/retail/licence-reminder.ts` `remindLicenceExpiry(now)` (+ test): for each liquor store (business type LIQUOR) whose
  `licenceExpiresOn` is within 60 days of today (Africa/Harare) or past, and whose `licenceReminderSentFor` ≠ that date: notification to every
  active owner ("Your liquor licence runs out on 31 December 2026" / "Renew it before then, and change the date in Setup › Shop." →
  `/retail/manage/company`), one WhatsApp per owner with a phone (template `licence-reminder`, the same words) through the outbox,
  `licenceReminderSentFor` = that date, audit `RETAIL_LICENCE.REMINDED { licenceNumber, expiresOn }` (source SYSTEM, actor null). A new expiry
  date sends a new reminder. Registered in `lib/retail/worker/jobs.ts` `{ name: "licence-reminder", when: { dailyAt: "07:00" } }` (fix the
  file's header comment, which says 06:00).
  Wording: "Setup › Shop" replaces the spec's "Management › Company" (98-decisions owner direction #3–#4).
- **Overview "Needs action"** — a provider file `lib/retail/floor/needs-action/licence.ts` registered in FLR-08's index (the floor packet 62 builds the registry for exactly this): "Liquor licence
  runs out on 31 December 2026" → `/retail/manage/company` from 60 days before until the date changes; after the date "Liquor licence ran out on
  31 December 2026" in `--bad`.
- **Switch tests** — `lib/retail/shop-features.test.ts`: for each switch off → the till context reports it off; nav has no Empties (empties
  off); product forms hide case fields (cases off); `pos/sales` accepts an age-restricted line without a check (age check off) and outside the
  hours (licence hours off); General retail → all four off whatever the switches; on → the reverse of each.
- **Receipts** — SET-07's renderer prints the licence number when liquor and "Show the liquor licence number" is on, and the default footer
  for a liquor store includes "Not for sale to persons under 18."; ADM-08's test checks a liquor sale's receipt carries both.
Audit constant `licenceReminded` + `LIST_WORDS` (kind Settings: "Licence reminder sent" info, Record "Shop", Change "Runs out 31 December
2026" — **Defined here**).

## UI
No new UI of its own. Verifies FLR-10's four moments against the board; adds the holiday banner wording through the till context it feeds.

## Reuse
`lib/retail/shop-profile-rules.ts` (`shopFeatures`, `isWithinLicenceHours`, `licenceWindowLabel`), `lib/retail/worker/*`,
`lib/retail/approvals/limits.ts` (`activeOwners`), `lib/retail/messages/*`, SET-07 receipt renderer, FLR-08 needs-action registry, FLR-10 till.

## Remove
Nothing here (C-27: the till's old ID dialog and red "Not in licence hours" toast are FLR-10's removals; confirm they are gone:
`grep -n "Check the customer's ID\|ID checked, over 18\|Not in licence hours" components/retail/portal` → nothing).

## Seed
`seedLicence()`: `licenceNumber` HRE/BL/2024/0711, expiry 31 December 2026 (SET-01's seed has them); no reminder is due on the demo date (it
falls on 1 November 2026). Add one company-wide `PublicHoliday` in the coming weeks if none (for the holiday walk), `isSeeded` true.

## Tests
- Witness; `lib/retail/shop-features.test.ts` (above); `lib/retail/holidays.test.ts` (company and site holidays, shop-clock date edges);
  `lib/retail/licence-reminder.test.ts` (fixed clock: 61 days → nothing; 60 → once; second run → nothing; new expiry → again; past → "ran out";
  general retail → nothing); `lib/retail/shop-profile-rules.test.ts` (holiday = Sunday window); a receipt test for the liquor lines.

## Acceptance
1. Migration on dev + test; witness green; reseed.
2. On a paired till as `chipo.till@`: add Johnnie Walker Black 750ml → the dialog of `Liquor.png` panel 1 (words exact); "18 or over" → a second
   whisky does not ask; the sale record shows "ID checked: Yes".
3. With the test clock past 22:00 on a weekday: panel 2's banner, Castle Lager 340ml "Not sold", Coca-Cola and Ice sell; no approval dialog; `POST
   pos/sales` with Castle → the licence refusal. On a seeded public holiday at 19:00: the Sunday sentence and the Sunday window apply.
4. As `kuda.till@`: six Castle Lager 340ml and twelve bottles back → panel 3's cart lines ("Deposit, 6 bottles 0.60", "Bottles back, 12 −1.20",
   "To pay 6.60").
5. Castle singles at 0 and 4 cases, adding a single → panel 4's dialog; "Open 1 case" → 3 cases, 24 singles less the one sold; with "Break cases
   at the till" on, it opens without asking and shows "Opened 1 case of Castle Lager 340ml. 24 singles on.".
6. Switch each off in Setup › Shop (as owner) → the till stops that moment within one context refresh (the switch tests cover all four).
7. Set the licence expiry to 50 days ahead, run the worker job → owners notified, one `licence-reminder` WhatsApp per owner with a phone (QUEUED/
   FAILED without credentials), Overview "Needs action" lists the licence; a second run sends nothing.
8. A liquor sale's receipt shows the licence number and "Not for sale to persons under 18.".
9. `npx eslint <changed>`; `npx vitest run lib/retail/shop-features.test.ts lib/retail/holidays.test.ts lib/retail/licence-reminder.test.ts
   lib/retail/shop-profile-rules.test.ts`; `pnpm typecheck` alone.

## Depends on
FLR-08 (Overview needs-action), FLR-09 and FLR-10 (the till's moments — C-27), STK-04 (case breaks), STK-09 (empties), PRD-08 (packs), SET-07
(receipts, outbox), SET-01 (switches, licence fields). Last in the build order ("after the till is complete"). Holds the till (T), worker (W),
overview (O) and company (CO) locks.

## Risk
**money** in the sense that it touches the till's sale path (`pos/sales` licence refusal) — the change there is the holiday flag only.
Pitfall: the holiday check must use the shop clock's date, not UTC.

## Open questions
- C-27 split followed: the four moments are FLR-10's code; this unit proves them and owns holidays and the reminder.
- Admin open question 21 (public holidays as Sundays): taken.
- Reminder words say "Setup › Shop" (owner direction), not "Management › Company".
