# 99 Coverage: boards, workflows, conflicts and the build order

Completeness check of the nine handover specs (`00-foundations.md` … `80-admin.md`, 92 build units) against the
"Corelith data tables" canvas, version 32. Checked against:

- every board on the canvas pages setup, products, stock, buying, floor, customers, insights, admin, templates and
  tables (`scratchpad/boards-by-page.json`, 163 boards);
- every workflow W-01 … W-76 in `canvas-v32/project/WorkflowMap.dc.html`, with its screen keys resolved through `S`;
- every destination in `NavTree.dc.html` (155 links) and every kind in `Sheet.dc.html` `K` (66 kinds);
- the specs against each other: Prisma models and enums declared in more than one spec, migration folders, witness
  test paths, routes, endpoints, sheet kinds, shared files and the "Depends on" lines.

Short answer: **nothing on the canvas is unowned**, but the specs disagree in about fifty places (45 conflicts, 6 dependency cycles). Six of
those must be settled before any area code is written. They are marked **Decide** below. The rest have a resolution here that the
named unit applies.

---

## 1. Missing boards

**None.** Every one of the 163 boards appears in at least one unit:

| Page | Boards | Missing |
|---|---|---|
| setup | 23 | 0 |
| products | 29 | 0 |
| stock | 16 | 0 |
| buying | 30 | 0 |
| floor | 15 | 0 |
| customers | 13 | 0 |
| insights | 14 | 0 |
| admin | 9 | 0 |
| templates | 3 | 0 |
| tables | 11 | 0 |

Explainer boards. Each one counts as covered because a unit builds what it explains:

| Board | Built by |
|---|---|
| `StockFlow` | PRD-03 (one product form, opening stock, the rules) and STK-02 (the same sheet from On hand) |
| `TillPairing` | SET-04 (`/pair`, "Who is selling?", `/unpaired`, the device key) and FLR-09 (panel 3 chips at the till) |
| `Liquor` | ADM-08 (the four till moments, public holidays, licence reminder); switches in FND-08/SET-01 |
| `Flow` | Not placed on the canvas. Its nine steps are all built: Suppliers BUY-01, Orders BUY-02, Deliveries BUY-08, Products PRD-01/PRD-04, Prices PRD-07, Promotions PRD-09, Shifts FND-05/FLR-03, Customers CUS-02/CUS-03, Overview FLR-08. Nothing of its own to build. |
| `Anatomy`, `Cells`, `Paging` | FND-04 (server rules) and FND-05 (bands, resolver, pager) |
| `Tokens` | FND-01 |

Outside the ten pages, for the record: `TenderArt` is deliberately not built (FND 5.12.2 uses the list's own icon in
empty states); `WfBuying` is BUY-10's end-to-end walk; the other `Wf*`, `NavTree`, `WorkflowTree`, `WorkflowsIndex`
and `WorkflowMap` boards have nothing to build. Every `NavTree` destination is a board some unit builds. Each of the 66
`Sheet` kinds has a board, and a unit builds that board. `InsightsMap` (key `imap` in the workflow map) has no file and no flow uses it.

### 1.1 Boards owned by more than one unit

Most of these are split on purpose: one unit builds the frame and another the content, or one builds the record and
another adds a tab. The rows marked with a conflict number are true duplicates (section 3).

| Board | Units | Split or duplicate |
|---|---|---|
| `CompanySettings` | FND-03 (panel), FND-08, SET-01 | **Duplicate** page and API, C-13 |
| `Guided` | FND-03 (rail), FND-10, SET-13 | **Duplicate** checklist endpoint, C-15 |
| `Floor` | FND-03 (rail), FND-09 (tile kinds), FLR-08 (content) | Split; checklist slot C-15; overview file order in section 4 |
| `InsightsSales` | FND-09, INS-01, INS-05 | Split, but FND-09 acceptance needs INS-05's buttons, C-22 |
| `ShiftRecord`, `ShiftOpen`, `Main` | FND-05/06/07, FLR-03 | Split by sequence; overlap C-23, C-24, C-25 |
| `Product` | FND-06 (rail, bin), STK-03 (tab), STK-04 (actions), PRD-04 (content) | Split by sequence, C-23 |
| `ProductNew`, `ProductNewStock`, `StockFlow` | FND-07, PRD-03, STK-02 | Split |
| `OrderRemove`, `OrderEdit` | FND-06 (ask), BUY-02, BUY-03 | Split |
| `DeliveryRecord` | BUY-06 (record), BUY-08 (tabs) | Split |
| `SupplierRecord` | BUY-01, BUY-07, BUY-09 (tabs) | Split; W-27 opener missing, section 2 |
| `ApprovalSettings` | ADM-04, ADM-05 | Split |
| `PersonEdit`, `Roles` | ADM-01, ADM-02, ADM-03 | Split |
| `SupportCompany` | ADM-09, ADM-10 | Split |
| `TillPairing` | SET-04, FLR-09 | Split |
| `Report*`, `Template*` | INS-06 … INS-09 | Split |
| `Anatomy`, `Cells`, `Paging`, `List`, `Record`, `Mobile`, `Dark`, `Corelith`, `TenderUI` | FND units | Split |

### 1.2 Drawn but not built (a unit owns the board, a piece of it is left out)

| Board | Piece | Where it is decided |
|---|---|---|
| `PaymentsSettings` | EcoCash "Confirmed automatically"; "Daily, RBZ rate" | SET open questions 4, 5: no integration; hint changed or option hidden |
| `TillPairing` | "A till's own fiscal device" footnote | SET open question 11: every till signs with the shop's device |
| `Labels` | "Back office laser · A4" printer | PRD open question 13: tills with printers plus "Print here" only |
| `CashMove` | "Pay a supplier" card | FLR open question 14: not drawn until buying accepts a drawer; contradicts BUY-05, C-33 |
| `SignOff` | "Deducted from Chipo's next pay" | FLR open question 4: a receivable only, no payroll |
| `CustomerRecord` | Meter "on the way to Platinum" | CUS open question 2: tiers end at Gold, meter worded in US$ |
| `SupportCompany` | Owner says yes on WhatsApp | ADM open question 13: a link, though inbound WhatsApp is built (C-39) |

---

## 2. Missing workflows

**None by id.** All 76 workflows are claimed by at least one unit, and every screen key of every workflow resolves to a
board that some unit builds.

| Area | Workflow → units |
|---|---|
| Setup | W-01 FND-10, SET-12, SET-13 · W-02 FND-08, SET-01 · W-03 SET-02 · W-04 SET-03, SET-04 · W-05 SET-05 · W-06 SET-08 · W-07 SET-07 · W-08 SET-11 · W-64 SET-06 · W-65 SET-09 · W-66 SET-02 · W-67 SET-10 · W-76 SET-03, SET-04 |
| Products | W-09 PRD-01, PRD-03 · W-10 PRD-01 (+ SET-12's step) · W-11 PRD-03, PRD-04 · W-12 PRD-08, FLR-10 · W-13 PRD-08, FLR-10 · W-14 PRD-04, PRD-07 · W-15 PRD-07 · W-16 PRD-05, PRD-07, FLR-10 · W-17 PRD-09, FLR-10 · W-18 PRD-10, FLR-10 · W-19 PRD-02 · W-20 PRD-06 |
| Stock | W-21 STK-01, STK-02 (+ BUY-02's sheet) · W-22 STK-05, STK-06 · W-23 STK-04, FLR-10 · W-24 STK-07, STK-08 · W-25 STK-01, BUY-08 · W-26 STK-04 · W-27 STK-09 (+ BUY-06 receive) · W-28 STK-01, STK-03 |
| Buying | W-29 BUY-01 · W-30 BUY-02 · W-31, W-32 BUY-04, BUY-05 · W-33 BUY-06, BUY-08 · W-34 BUY-03 · W-35 BUY-07 · W-36 BUY-09 · W-70 BUY-03, BUY-07 · W-71 BUY-03 · W-72 BUY-04 (all also BUY-10) |
| Floor | W-37, W-38 FLR-03, FLR-09 · W-39 FLR-04, FLR-09 · W-40 FLR-05, FLR-08 · W-41 FLR-01, FLR-02, FLR-09 · W-42 FLR-06, FLR-09 · W-43 FLR-07 · W-44 FLR-01, FLR-08, FLR-09 (+ SET-04, SET-06) |
| Customers | W-45 CUS-02, CUS-05 · W-46 CUS-01, CUS-03, CUS-10 · W-47 CUS-04 · W-48 CUS-01 · W-49 CUS-07 … CUS-10 · W-50 CUS-02, CUS-06 |
| Insights | W-51 FLR-08 · W-52 FND-09, INS-01 … INS-04 · W-53 INS-03 · W-54 INS-02 · W-55 FND-04, FND-05, PRD-01, CUS-02, INS-05 · W-56 INS-05, INS-09 · W-69 INS-06, INS-07, INS-08 · W-73, W-74, W-75 INS-08 |
| Admin | W-57 ADM-01, ADM-02, ADM-03 · W-58 ADM-04, ADM-05 · W-59 ADM-03, ADM-06 (+ SET-06) · W-60 FND-06, CUS-03, ADM-06 · W-61 ADM-08 · W-62 FND-06, CUS-03, ADM-06 · W-63 FND-06, CUS-03, CUS-05, ADM-07 · W-68 ADM-09, ADM-10 |

Steps that no unit fully serves:

| Workflow | Gap | Fix (owner) |
|---|---|---|
| W-10 "Onboarding, or Products", actor **Manager** | PRD-01's "Start from the catalogue" / "Add from the catalogue" open `/retail/setup/products?return=/retail/products`, but SET-12 makes onboarding Owner only and sends `/retail/setup` to `/retail` once `completedAt` is set. After onboarding, a manager (the workflow's actor) has no way in. | SET-12 serves `/retail/setup/products?return=…` to Owner and Manager after onboarding is done, as step 3 alone (no step aside). |
| W-27 starts at "the supplier record" | STK-09 says the `empties-return` sheet opens from the supplier record with `&supplierId=`, but BUY-01's supplier record has no such action. | BUY-09 adds ⋯ "Return empties" (liquor store, empties on) to the supplier record. |
| W-38 step "Why → Pay a supplier" | Not drawn until buying accepts a till drawer as the source, which BUY-05 forbids (C-33). | Decide C-33. |
| W-40 "Accept or recover" | Recover books a receivable and stops: no repayment and no payroll. | Confirm out of scope (FLR open question 4). |
| W-05 | EcoCash confirmation and the RBZ rate feed have no integration. | Confirm hidden (SET open questions 4, 5). |
| W-68 "with their yes" | The owner answers through a link, not a WhatsApp reply. | Can read the reply once C-04 lands. Optional. |

---

## 3. Conflicts

Each conflict lists the units that disagree, what they disagree on, and the resolution. **Decide** marks the six
that need a product decision, not just an edit. Settle those before the area units start.

### 3.1 Schema

**C-01 `InventoryItem` reorder quantity, two columns for one field.**
- PRD-03 (`20261004132300`) adds `reorderQuantity`. PRD-04's rail and `PATCH /products/[id]` use that name.
- STK-01 (`20261004133000`) adds `reorderQty` (and `shelf`). STK-02's stock-line `PATCH` and Reorder sheet use that name.

Both migrations would land, giving one field two columns.
**Resolution:** STK-01 owns `reorderQty` (it lands first in section 4). PRD-03 drops its column, and PRD-03/PRD-04
use `reorderQty`. Products' invalidation key `retail-stock` becomes `retail-stock-on-hand`.

**C-02 `RetailMessage` has three columns for one attachment.**
- BUY-02 adds `attachmentUrl`.
- CUS-06 adds `documentUrl` and `documentName`, plus `sendDocument`.
- INS-05 adds `mediaUrl`, plus `sendImage`.

**Resolution:** SET-07's migration defines `mediaUrl`, `mediaName` and `mediaKind` (IMAGE | DOCUMENT), and
`lib/messaging/whatsapp.ts` gets one `sendMedia`. BUY-02, CUS-06 and INS-05 drop their columns.

**C-03 Two outbox drains.**
- SET-07 drains hourly in `scripts/retail-worker.ts`.
- CUS-06 builds its own `lib/retail/messages/drain.ts`, runs every five minutes and honours `scheduledFor`.
- INS-05 changes the drain again for media.

**Resolution:** one drain, SET-07's. It runs every five minutes and honours `scheduledFor`, and that column moves
into SET-07's migration. CUS-06 builds only audience, render and queue.

**C-04 Two inbound WhatsApp webhooks. Decide.**
- BUY-02: `POST /api/v2/retail/messages/whatsapp`, signed with `META_APP_SECRET`.
- CUS-06: `POST /api/webhooks/whatsapp`, signed with `META_WHATSAPP_APP_SECRET`.

A Meta app has one callback URL.
**Resolution:** one public route owned by SET-07 (`/api/webhooks/whatsapp`) with one set of env names
(`META_WHATSAPP_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_VERIFY_TOKEN`, `META_WHATSAPP_APP_SECRET`). It
dispatches to handlers: reply matching (BUY-02) and STOP (CUS-06).

**C-05 The licence reminder is built twice.**
- SET-01: worker job at 06:00 that sends a Notification.
- ADM-08: `remindLicenceExpiry` at 07:00 that sends a Notification and a WhatsApp, adds an Overview Needs action, and
  adds the migration `20261004138500_retail_licence_reminder` (`RetailShopProfile.licenceReminderSentFor`).

**Resolution:** ADM-08 owns the reminder. SET-01 builds the worker without that job.

**C-06 Staff messages are built twice.**
- FLR-03 adds the `RETAIL_STAFF_MESSAGE` notification type and the `staff-message` sheet.
- ADM-02 adds the same enum value again (`IF NOT EXISTS`) and a `people-message` sheet.

**Resolution:** one sheet and one enum value, both owned by ADM-02, which lands first. FLR-03's "Message the cashier"
opens it.

**C-07 `maxTills` is used before it exists.**
- SET-03's pairing check and acceptance ("ninth paired till on Grow → refused") need `SubscriptionPlan.maxTills`.
- The column is added by SET-10's migration (`131900`), and SET-10 depends on SET-03.

**Resolution:** `maxTills` and `includedTills` move into SET-03's migration. SET-10 keeps the billing page.

**C-08 Stock movements written before the ledger rules exist.**
- STK-01 makes `recordStockMovement` require a `reason` and a `reference`.
- Units that may land before it write movements without them: SET-02's place removal writes a `TRANSFER` with no
  reason (STK-01's value is `PLACE_MOVE`), PRD-03 writes opening stock, SET-11 writes import opening stock.
- STK-01's list of callers to update names none of them.

**Resolution:** STK-01 lands first (it depends on nothing). Those units call it with `PLACE_MOVE` and `OPENING`
from the start.

**C-09 Tender names.**
- PRD-05/PRD-10's `pos/sales` body lists `tenderType: "CASH" | "CARD" | "MOBILE_MONEY" | "TRANSFER" | "VOUCHER"`.
- SET-05 drops `MOBILE_MONEY` and adds `ECOCASH`, `INNBUCKS` and `ON_ACCOUNT`. FLR-06 adds `LAYBY`.

**Resolution:** the products contract uses SET-05's enum.

**C-10 Account roles grow in three units, but the Posting page lists six.**
- SET-09 creates `RetailAccountRole` with six values.
- PRD-03 adds `OPENING_BALANCES`. PRD-10 adds `VOUCHERS_OWED`, `PROMOTIONS_GIVEN` and `OTHER_INCOME`.
- Floor and customers post to fixed account codes (2260, 1150, 5110, 1100) through their own default rules.

`PostingSettings` draws one list of role accounts.
**Resolution:** SET-09's page lists every enum value with a label. A unit that adds a role adds its label and its
seed mapping.

**C-11 Migration order is not build order.**
Timestamps sit in per-area blocks:

| Spec | Range |
|---|---|
| FND | `130000` |
| SET | `131000`–`132100` |
| PRD | `132200`–`132800` |
| STK | `133000`–`133300` |
| BUY | `134000`–`134600` |
| FLR | `135000`–`135500` |
| CUS | `136000`–`136500` |
| INS | `137000`–`137200` |
| ADM | `138000`–`138600` |

No two folders collide, and no two witness test paths collide. Section 4 lands STK-01 and ADM-02/03/04/06 well before
SET-11, PRD-03 and others. The dev database would then apply folders in build order, while a fresh database (test,
production) applies them in name order. No out-of-order pair touches the other's objects today.
**Resolution:** to keep it that way, each unit stamps its folder when it lands, strictly after the last applied
folder, and the spec's name is only the suffix.

**C-12 Old report keys stay registered next to the new ones.**
- `lib/reports/definitions/retail.ts` already registers `retail-sales`, `retail-items-sold`, `retail-stock` and
  `retail-shifts`.
- FND-04 registers a new `retail-shifts` in `lib/reports/definitions/retail/floor.ts`. FLR-01 registers a new
  `retail-sales`.
- INS-06, near the end, deletes the old file and `loaders/retail.ts`. Until then the registry holds duplicate keys, and
  `…/definitions/retail` resolves to the file, not the new directory.

**Resolution:** FND-04 deletes both old files and their generic catalogue rows. The removal moves from INS-06 to
FND-04.

### 3.2 Two units owning the same route, endpoint, page or file

**C-13 `/retail/manage/company` is built twice.**
- FND-08: the page on `GET/PATCH /api/v2/retail/settings/company`, writing `RETAIL_SETTINGS.CHANGED` and
  `RETAIL_SHOP.PROFILE_CHANGED`.
- SET-01: the same page on `GET/PUT /api/v2/retail/company` and `POST /company/logo`, writing `RETAIL_COMPANY.CHANGED`.

Both units test the same board.
**Resolution:** FND-08 builds the frame and the page on `settings/[page]`. SET-01 adds only what FND-08 lacks: logo
upload, WhatsApp, VAT registered, default site, the money rules and the worker. It adds them on the same endpoint, and
`/api/v2/retail/company` is not built.

**C-14 Two settings API contracts. Decide.**
- FND 4.10 says every settings page saves through `GET/PATCH /api/v2/retail/settings/[page]` with one
  `RETAIL_SETTINGS.CHANGED`. CUS-01 (loyalty) and ADM-04 (approvals) follow it.
- SET-05 … SET-10 define their own endpoints (`/payments`, `/till-rules`, `/receipts`, `/fiscal*`, `/posting*`,
  `/billing*`) with their own events (`RETAIL_PAYMENTS.CHANGED`, `RETAIL_TILL_RULES.CHANGED` …).

ADM-06's Settings tab and every page's "Last changed by" read `RETAIL_SETTINGS.CHANGED`.
**Resolution:** every page's save goes through `settings/[page]`. Action endpoints keep their own routes: test print,
fiscal connect and close day, Post now, pairing, plan change, the ZiG rate.

**C-15 The setup checklist is built twice.**
- FND-10: `GET /setup/checklist`, "Hide until tomorrow" in localStorage, and acceptance of "4 of 7" on the seeded
  tenant.
- SET-13: `lib/retail/checklist.ts`, the same `GET`, plus `POST …/hide` stored server-side
  (`RetailOnboarding.checklistHiddenUntil`) and hand ticks. The setup seed marks the demo tenant fully set up, so it
  shows no card.

**Resolution:** SET-13 owns the endpoint, the rules and the storage. FND-10 builds only the `SetupChecklist` and
`EmptyGuide` components, tested with fixtures. Its seeded acceptance moves to SET-13.

**C-16 The Reports route.**
- FND 5.3.4 (FND-03's nav table) puts Reports at `/reports` and `/reports?area=…`.
- INS-07/INS-08 build `/retail/reports`, `/retail/reports?area=…` and `/retail/reports/[ref]`. INS-06 makes
  `/reports/retail-sales` answer 404.

**Resolution:** the nav table points at `/retail/reports…`. FND already says the insights spec owns the route.

**C-17 The import route.**
- SET-11 builds `/retail/catalog/import` and `/api/v2/retail/catalog/import*`.
- FND-03 makes `/retail/catalog` answer 404.
- PRD and STK link to `/retail/products/import`.

**Resolution:** use `/retail/products/import` and `/api/v2/retail/products/import*`. SET-12's "Import a spreadsheet"
link follows.

**C-18 Old setup paths.**
- FND-03 moves `app/retail/setup/{operations,pos-policy,fiscal,accounting,bin}` to
  `app/retail/manage/{tills,till-rules,fiscal,posting,bin}` and deletes `app/retail/setup/page.tsx`.
- SET-01 re-gates the "old `/retail/setup/*` routes". SET-03, SET-06, SET-08 and SET-09 list removals of
  `/retail/setup/operations`, `pos-policy`, `fiscal` and `accounting`, which no longer exist by then.
- SET-12 needs `/retail/setup/*` for onboarding.

**Resolution:** the setup removal rows target the moved `app/retail/manage/*` files. FND-03 adds `/retail/setup` →
`retail.core` to the route registry so onboarding has its prefix.

**C-19 Sheet addresses.**
- FND decision 7: every sheet is `?sheet=<kind>&id=…`.
- The setup spec uses paths: `/retail/manage/sites/new`, `/sites/[id]`, `/tills/new`, `/tills/[id]` and
  `/tills/[id]/replace`.

**Resolution:** use `?sheet=site-new`, `site`, `till-new`, `till` and `till-replace`.

**C-20 Count and close.** FND 5.5.5's Shifts row menu opens `?sheet=shift-close`. FLR-04 builds the page
`/retail/shifts/[id]/close`, and the board is a page.
**Resolution:** the row menu links to the page.

**C-21 Names that disagree across specs.** The owner's name wins in each case.

| Thing | Owner's name | Other name |
|---|---|---|
| Intake sheet | `intake` (BUY-08) | `intake-new` (STK) |
| Take a payment on account | `/retail/customers/[id]?sheet=account-payment&id=<account>` (CUS-08) | `customer-payment` and `/retail/accounts/<customer id>` (INS-03/04; that route does not exist) |
| Lapsed customers | `audience=lapsed-30` (CUS-06) | `segment=lapsed-30` (INS-03) |
| Activity link | `?entity=RetailSettings:company` (FND, ADM-06) | `?subject=company` (SET-01) |
| Empties to a supplier | `bookEmptiesReturn` (STK-09) | `returnEmptiesToSupplier` (BUY-06) |
| On hand query key | `retail-stock-on-hand` (STK) | `retail-stock` (PRD) |

**C-22 Insights › Sales.**
- FND-09 moves the page onto the frame using the old endpoint, and its acceptance draws "Export" and "Send me this".
- INS-01 rebuilds the page on `GET /insights/[topic]` and asks for those two buttons as optional props until INS-05.

**Resolution:** FND-09 takes both as optional props and drops them from its acceptance.

**C-23 The shift and product records.**
- FND-06's acceptance describes the whole shift record (KPIs, chart, tabs), but FLR-03 builds that content.
- FND-06 also builds the product rail that PRD-04 rebuilds, and STK-03/STK-04 add a tab and actions to the same
  record.

Not a clash if the units run in sequence.
**Resolution:** FND-06 accepts on the frame pieces only. Content belongs to FLR-03 and PRD-04, in the order of
section 4.

**C-24 Open a shift.** FND-07 adds `cashierId` and the till-busy rule to `POST /api/v2/retail/shifts`. FLR-03 rewrites
`openShift` with till-busy, cashier-busy and the ZiG float.
**Resolution:** FLR-03 owns `lib/retail/floor/shifts.ts`. FND-07 adds only `cashierId`.

**C-25 The Shifts row menu is defined twice:** in FND 5.5.5 and in FLR 5.4.
**Resolution:** keep one definition, FLR's.

**C-26 The same files are removed by two units.**
- `components/retail/shop-settings.tsx`: FND-08 and SET-09.
- `components/retail/shop-profile-fields.tsx`: FND-08 deletes it, but SET-01 keeps `useShopProfile` in it.

**Resolution:** FND-08 removes both. Callers of `useShopProfile` read the `company` settings page.

**C-27 Till screens claimed twice.**
- ADM-08 builds "the four till moments": age check, licence-hours banner, deposit and bottles-back lines, case-break
  dialog.
- FLR-10 builds STK-09's "Bottles back · Pay" and PRD-08's break-at-till. STK-04 says the till calls its case-break
  endpoint.

**Resolution:** FLR-10 builds every till screen. ADM-08 adds only the switch tests, public holidays and the reminder.

**C-28 The `site` noun.** SET-02 registers it, and STK-05 and ADM-02 register it "if SET-02 has not".
**Resolution:** SET-02 always lands first (section 4), so STK-05 and ADM-02 drop the fallback.

**C-29 Three stand-ins for approval limits.**
- ADM-04 builds `getApprovalLimits`.
- STK-04, BUY-04 and CUS-07 each build a fallback with defaults: US$50 and US$100, US$500, US$250.

**Resolution:** ADM-04 lands before all three (section 4), so no fallbacks are built.

**C-30 Permissions are edited in ten units.**
- SET-01 ("all of them, replacing `retail.setup`"), PRD-01, STK-01, BUY-01, CUS-01, FLR-06, FLR-07, INS-01, INS-07
  and SET-06 all edit `lib/retail/permissions.ts` and its cell-by-cell test.
- ADM-01 transcribes all 37 resources from the Roles board.

**Resolution:** ADM-01 lands right after FND-03 with the whole matrix. The other units only consume it and drop their
permission rows. This removes the busiest shared file from the area units.

### 3.3 Rules that disagree

**C-31 Manager PIN. Decide.**
- SET-06: the till sends `managerPin {userId, pin}`, the server answers 403 `MANAGER_PIN_NEEDED`, and a PIN is
  accepted only from a paired device.
- STK-04: `lib/retail/manager-pin.ts` `verifyManagerPin` with `approver {userId, pin}`, answering 409 `needsApprover`,
  in the back office too. FLR-02, FLR-09 and CUS-10 use STK-04's version.
- ADM-03: a lock that lasts until a new PIN is issued (423), instead of 15 minutes (429).

**Resolution:** one module, built by SET-06 (the first user in section 4). It takes `approver` and answers 409
`needsApprover`. It works in the back office (floor open question 1) and uses ADM-03's lock rule. STK-04 consumes it,
and ADM-06 adds the audit call.

**C-32 A manager prices below cost.** PRD-03 refuses with 400 "Below cost needs the owner…". ADM-05 queues a
`RetailPriceApproval` instead, and does the same for every manager change under "Owner approves".
**Resolution:** ADM-05's rule. PRD-03 and PRD-07 acceptance changes when ADM-05 lands.

**C-33 Paying out from a till. Decide.**
- BUY-05 asserts that a payout never writes a `RetailCashMovement`. "Front till float" is a money account apart from
  the drawer.
- FLR-03 adds `RetailCashMovement.requisitionId` and a "Pay a supplier" why that pays a requisition from the drawer.
- BUY-08's "Cash now" lowers "the till float".

Buying open question 8 and floor open question 14 raise the same issue. Pick one model before BUY-05 and FLR-03.

**C-34 What "low" means.**
- PRD-01's `lib/retail/products/figures.ts`: out, at or below the reorder level, or under 7 days of cover.
- STK-01's `lib/retail/stock/levels.ts` has its own `stockLevel`.

Products' Low stock tab, the product strip and Stock's "5 low" badge must agree.
**Resolution:** STK-01's `stockLevel` is the only rule, and PRD-01 imports it. Products open question 5 asks which
definition; decide inside STK-01.

**C-35 Reports for cashiers and stock clerks. Decide.** INS-07 shows them templates shared with Everyone. FND 5.3.4
and ADM-01's matrix give Reports to owner, manager and bookkeeper only (admin open question 16). Settle before ADM-01.

**C-36 Deleting on End of day.** ADM-01 gives owner and manager no D, following the board. The floor spec gave them
everything.
**Resolution:** ADM-01 wins.

**C-37 Audit event names.**

| Event | Use | Not |
|---|---|---|
| Shop profile changed | `RETAIL_SHOP.PROFILE_CHANGED` (FND-08, the code today) | `RETAIL_SHOP_PROFILE.CHANGED` (setup) |
| A settings page saved | `RETAIL_SETTINGS.CHANGED` (FND, CUS, ADM) | per-page events such as `RETAIL_COMPANY.CHANGED`, `RETAIL_PAYMENTS.CHANGED` (setup) |
| Someone invited | `RETAIL_PERSON.*` (ADM-02) | `RETAIL_STAFF.INVITED` (SET-12) |

**C-38 Staff in onboarding.** SET-12 builds `inviteStaff`: users with PINs, created before ADM-02 makes `User.email`
optional. ADM-02 builds `invitePerson` (admin open question 24).
**Resolution:** ADM-02 lands before SET-12, and SET-12 calls `invitePerson` with the owner-typed PIN.

**C-39 Inbound WhatsApp.** ADM-10 assumes there is none, but BUY-02 and CUS-06 build it. Once C-04 lands, ADM-10 may
read the owner's reply. Optional.

### 3.4 Seed data

Every unit extends `scripts/seed-retail-demo.ts`. These disagree:

**C-40 Test accounts. Decide.**
- Stock clerk: `tendai.stock@` is used by FND-03, FND-04, PRD, BUY and INS acceptance. `rudo.stock@` is used by
  STK-02 and ADM-02, and ADM-02's seed removes `tendai.stock@`'s access.
- Bookkeeper: PRD-01 seeds `bookkeeper@bottlestore.test` and BUY/CUS/INS use it. ADM-02 has Ruvimbo Chari join by
  link.

Pick one account per role and fix every acceptance line before the area units start.

**C-41 Tills and open shifts.**
- FND seeds two tills and two open shifts ("2 open"), and FND-03/FND-05's acceptance counts depend on that.
- SET-03 seeds five tills with states.
- FLR seeds three open shifts, including Handheld 1 ("3 open"). The Overview board says "Kora handheld".

**Resolution:** FLR's story (three open shifts), with FND acceptance counts read from the database rather than from
the board.

**C-42 Farai Moyo.** FND and FLR give him the stale Back till shift at Harare Main Branch. ADM-02 limits him to
Borrowdale, and SET-04 then keeps him off Harare tills.
**Resolution:** seed his Borrowdale access with Harare Main Branch as well, or move the stale shift to a Harare
cashier.

**C-43 Checklist on the demo tenant.** FND-10 expects "4 of 7" on the seeded tenant. The setup seed completes every
item, so no card shows. Follows from C-15: accept on a fresh SET-12 tenant.

**C-44 Smaller seed clashes.**
- Owner phone: "+263 77 100 2001" (buying seed) against "+263 77 412 0098" (People, Insights, ADM-10).
- Rufaro Ndlovu: an inactive manager (INS) but absent from People (setup uses Tafara for "paired by").
- T. Marange: merged on the Bin board, unmerged in the customers seed.
- FLR-01's SALE-31869 and RFD-0044 customers: customers asks for other names.

**Resolution:** use People's phone. Seed Rufaro as an inactive manager. Keep T. Marange unmerged (for the merge
demo). Follow the customers spec's names.

**C-45 Every unit reseeds the shared tenant with `--reset`.** Two units can never run acceptance on
`hurudza-creative` at the same time. Handled by the seed lock in section 4.

### 3.5 Dependency cycles

| # | Cycle | Break it by |
|---|---|---|
| D-1 | PRD-03 → BUY:suppliers (Supplier field), BUY-01 → PRD-03 | PRD-03 does not wait. The field reads existing suppliers, and BUY-01 adds quick add. |
| D-2 | PRD-05, PRD-08, PRD-09, PRD-10 → "FLR:till"; FLR-10 → PRD-05, PRD-08, PRD-09, PRD-10 | "FLR:till" is FLR-10, which follows. The PRD units ship the server contract and test it through the API. |
| D-3 | PRD-09 → CUS:customers (loyalty and staff audiences), CUS-01 → PRD-09; PRD-05 → CUS:customers, CUS-07 and CUS-10 → PRD-05 | PRD-05 and PRD-09 ship with those audiences never matching. CUS-01 and CUS-02 switch them on and add the audience case to their acceptance. |
| D-4 | PRD-10 → "FLR:till" (credit-note refunds), FLR-02 → PRD-10 | PRD-10 builds the issue and redeem services, and FLR-02 calls them. |
| D-5 | FLR-01 needs the `customer` noun (CUS-02) for "Add a customer to it"; CUS-01 → FLR-01 (`RetailSale.customerId`) | FLR-01 ships `sale-customer` hidden until CUS-02 lands. |
| D-6 | SET-03 ⇄ SET-10 via `maxTills` | C-07 |

No hard cycle remains once these are broken.

---

## 4. Proposed global build order

### 4.1 Rules for the whole build

1. **Settle first.** Settle the six **Decide** items (C-04 webhook, C-14 settings contract, C-31 manager PIN,
   C-33 payouts, C-35 Reports visibility, C-40 test accounts) and edit the specs before any area unit starts. The other resolutions are
   applied by the unit named.
2. **Locks.** A lock may never be held by two units at once. A unit takes these only for the step that needs them:
   - **schema**: migration, `migrate deploy` on dev and test, `prisma generate`;
   - **seed and acceptance**: on `hurudza-creative`;
   - **typecheck**: one `pnpm typecheck` on the machine.
3. **File locks.** A unit holds these from its start to its merge:

   | Lock | Files |
   |---|---|
   | **T** till | `app/api/v2/retail/pos/**`, `_services.ts`, `_helpers.ts`, `devices/me`, `components/retail/portal/**`, `lib/retail/manager-pin.ts`, `lib/retail/till-rules.ts` |
   | **P** posting | `lib/accounting/posting.ts`, `lib/accounting/defaults.ts`, posting rules |
   | **W** worker | `scripts/retail-worker.ts` |
   | **M** messaging | `lib/messaging/whatsapp.ts`, the outbox, the webhook |
   | **A** auth | NextAuth providers and claims, proxy, `lib/public-routes.ts`, `User` |
   | **O** overview | `app/retail/page.tsx`, `lib/retail/floor/overview.ts` |
   | **R** list engine | `lib/reports/list-query.ts`, `fetchListPage`, the cell resolver |
   | **PR** product record | the product record kind |
   | **PL** Products list | the Products list and its source |
   | **SH** shifts | the shifts list, record and source |
   | **CO** company | the Company page |
   | **TR** till rules | the Till rules page |
   | **SR**, **OR**, **CR** | the supplier, order and customer record kinds |
   | **IN** insights | the insight pages |

4. **Registries.** Nearly every unit appends to the same registries:
   - `RETAIL_AUDIT_EVENTS` and its test;
   - nav items and badge providers;
   - lookup nouns, bin kinds, list sources, sheet kinds, record kinds and asks;
   - id prefixes and the seed script.

   FND-03 … FND-07 split each one into an index plus one file per area. Area units then add their own file instead of
   editing a shared one, and the lead merges only index lines.
5. **Migration folders** are stamped at landing (C-11).

### 4.2 Steps

Units in the same step may run at the same time. They hold different file locks and take turns on schema, seed and
typecheck. A step starts when the units it depends on have merged.

| Step | Units (locks) | Why together, or why alone |
|---|---|---|
| 1 | STK-01 (T, schema) · FND-01 · FND-04 (R) | No dependencies. STK-01 first stops C-01 and C-08. FND-04 deletes the old report keys (C-12). |
| 2 | FND-02 | Needs FND-01. |
| 3 | FND-03 | Alone: rewrites the shell every page sits in. Nav table fixed for C-16, C-18. |
| 4 | ADM-01 · FND-05 (R, SH) · FND-09 (IN) | ADM-01 takes the whole matrix (C-30) before any area unit. FND-09 has optional buttons (C-22). |
| 5 | FND-06 (SH record, PR, schema) · FND-07 (SH list) | Both need FND-05. They work on different shift files. |
| 6 | FND-08 (CO) · FND-10 (O) · PRD-01 (PL) | FND-08 on `settings/[page]` (C-13, C-14). FND-10 builds components only (C-15). PRD-01 imports `stockLevel` (C-34). |
| 7 | SET-01 (W, CO) · PRD-02 · STK-03 (PR, R) | SET-01 adds only what FND-08 lacks and creates the worker. |
| 8 | SET-02 · ADM-07 (W) | Place moves use `PLACE_MOVE`. Bin list and purge. |
| 9 | SET-03 · STK-07 | SET-03 carries `maxTills` (C-07). |
| 10 | SET-04 (T, A) · SET-10 · STK-08 (P) | |
| 11 | SET-05 (T, W) | Enum swap (C-09). |
| 12 | SET-06 (T, TR) · SET-09 (P, W) | SET-06 builds the one manager-PIN module (C-31). |
| 13 | SET-07 (T, M, W) | One outbox, one drain, one webhook, one media column (C-02 … C-04). |
| 14 | SET-08 (T) | |
| 15 | ADM-02 (A) | Alone: makes `User.email` optional, with typecheck fallout across the codebase. Owns staff messages (C-06). |
| 16 | ADM-03 (T, A) · ADM-04 | PIN lock rule. `getApprovalLimits` lands before STK-04, BUY-04 and CUS-07 (C-29). |
| 17 | PRD-03 (P, T, PL, PR) | Uses `reorderQty` (C-01) and opening stock with `OPENING`. |
| 18 | STK-04 (P, PR) · STK-02 (R) · BUY-01 (SR) · STK-05 (T) | |
| 19 | SET-11 (P, PL) · PRD-04 (PR) · BUY-02 (M handler, OR) · ADM-06 (T: the manager-PIN audit call) | Import at `/retail/products/import` (C-17). |
| 20 | STK-06 (P) · STK-09 (T, R) · BUY-03 (W, OR) | |
| 21 | PRD-05 (T) · BUY-04 · ADM-09 | |
| 22 | PRD-06 (T, PL) · BUY-05 (P, W) | Settle C-33 before this step. |
| 23 | SET-12 (T, A, M) · PRD-07 (W, PL, PR) · BUY-06 (P, OR) | SET-12 calls `invitePerson` (C-38). |
| 24 | PRD-08 (T, PR) · SET-13 (O) · ADM-05 · BUY-07 (P, SR, OR) | ADM-05 after PRD-07 (C-32). |
| 25 | PRD-09 (T) · ADM-10 (A, W, M) · BUY-08 (P) · FLR-01 | FLR-01 ships `sale-customer` hidden (D-5). |
| 26 | FLR-03 (P, SH) · CUS-01 (T, W) · INS-01 (IN) | |
| 27 | BUY-09 (P, SR) · CUS-02 (T) · INS-05 (IN, M, W) | |
| 28 | FLR-04 (T, P, SH) · BUY-10 · INS-02 (IN) · CUS-06 (M, W) | BUY-10 closes buying end to end. |
| 29 | PRD-10 (T, P, W) | Needs CUS-02's `customer` noun. |
| 30 | FLR-02 (T, P) | |
| 31 | FLR-05 (P, SH) | |
| 32 | FLR-06 (T, P, W, TR) | |
| 33 | FLR-07 (P) · FLR-09 (T) · CUS-03 (CR) · FLR-08 (O) · INS-03 (IN) | |
| 34 | FLR-10 (T) · CUS-04 (CR) | FLR-10 owns every till screen (C-27). |
| 35 | CUS-05 (CR) | |
| 36 | CUS-07 (W, CR) | |
| 37 | CUS-08 (P, CR) | |
| 38 | CUS-10 (T) · CUS-09 (M, CR) · INS-04 (IN) | |
| 39 | ADM-08 (T, W, O, CO) | Liquor everywhere, after the till is complete. |
| 40 | INS-06 (T, R, SH) | Adds the `shelfPrice` write in `pos/sales`. The old report files are already gone (C-12). |
| 41 | INS-07 | |
| 42 | INS-08 | |
| 43 | INS-09 (W, M) | |
| 44 | FND-11 | Alone, last. Then `pnpm typecheck`, `pnpm lint` and the end-to-end walk of every workflow on the reseeded tenant. |

### 4.3 Notes on the order

- **The critical path is the till and posting spine.** The till and posting locks are held by about thirty units:
  STK-01, SET-04 … SET-09, PRD-03, PRD-05/06/08/09/10, STK-04/05/06/08/09, all of BUY-05 … BUY-09, FLR-02 … FLR-07,
  FLR-09/10, CUS-01/02/08/10, ADM-03, ADM-08 and INS-06. Units holding the same one of those locks run one at a
  time; a till-only unit may run beside a posting-only one. Lists, records, settings pages and insights run beside
  them.
- **To shorten it,** split each till-touching unit's `pos/sales` edit into a small patch that takes the till lock
  alone, and let the rest of the unit run in parallel.
- **Acceptance is serial.** Each unit reseeds and screenshots the one shared tenant, so a step with three units runs
  acceptance three times in turn.
