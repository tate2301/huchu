# 80 Admin: people, who can do what, approvals, activity, the bin, shop-type features and support

Handover spec for canvas page **"08 People and controls"** of the "Corelith data tables" canvas, version 32, and its
workflows **W-57, W-58, W-59, W-60, W-61, W-62, W-63 and W-68**. It is written on top of `00-foundations.md` and next to the
seven other area specs (`10-setup.md` … `70-insights-reports.md`). An implementer builds from this document and compares
screenshots with the board PNGs; no decision is left to the canvas.

Matching the canvas means the same layout, hierarchy, copy, columns, filters, actions and states **on real data from the
real server**: every value below comes from Postgres through Prisma and an API route, every button does what the workflow
says server-side, and every role check is enforced on the server.

Sources: `scratchpad/canvas-v32/project/*.dc.html` (Roles, PeopleList, PersonNew, PersonEdit, ApprovalSettings,
ActivityList, BinList, Liquor, SupportCompany, WfAdmin, and the `List`, `Sheet`, `Record`, `WorkflowMap`, `NavTree`
templates). Board images: `scratchpad/shots-v32/<Board>.png`. Screenshots of today's code: `scratchpad/smoke/adm80/*.png`
(taken as `owner@bottlestore.test` on 4 October 2026 at `c78d01f`).

## How to read this spec

- **Foundation units** are named by their ids. The aliases the area specs use map as follows:

  | Alias | Unit | What this spec takes from it |
  |---|---|---|
  | FND-THEME | FND-01 | Tender light and dark for retail; Corelith for the platform admin portal |
  | FND-SHELL | FND-03 | Rail, Management panel, 48px page header (title, sub, sub link, primary), nav `requires`, routes table 5.3.4 |
  | FND-LIST | FND-04 + FND-05 | List sources (`ReportDefinition` with a `list` block), `GET /api/v2/reports/[key]` list mode, ListFrame (tabs, toolbar, selection bar, totals, pager, phone cards), export (W-55) |
  | FND-RECORD | FND-06 | RecordFrame, ⋯ "Move to the bin", bin banner, `POST /api/v2/retail/bin` and `/bin/restore`, `lib/retail/bin.ts` registry, record Activity tab, `RETAIL_RECORD.*` events, `lib/retail/activity-words.ts`, `PlatformAuditEvent` entity index |
  | FND-SHEET | FND-07 | SheetForm (520/760px), `?sheet=` addressing, field types incl. `cards`, `tags`, `read`, `toggle`, lookups with inline add (`/api/v2/retail/lookup/[noun]`), ConfirmDialog, toast |
  | FND-SETTINGS | FND-08 | SettingsFrame (form, save bar, aside, read-only mode), `GET`/`PATCH /api/v2/retail/settings/[page]`, `RETAIL_SETTINGS.CHANGED` |
  | FND-DASH | FND-09 | Not used here |

- **Other areas' units** are named by id: `SET-01` (Management module, Company, the retail worker `scripts/retail-worker.ts`),
  `SET-04` (pairing, "Who is selling?", the `till-pin` sign-in), `SET-06` (till rules and their enforcement: when a manager
  PIN is needed), `SET-07` (`RetailMessage` outbox, `lib/messaging/whatsapp.ts`), `SET-10` (plans), `SET-12` (onboarding's
  Staff and PINs step), `PRD-03`/`PRD-07` (`changePrices`, the price worksheet), `PRD-08` (cases, "Break cases at the till"),
  `STK-04` (`lib/retail/manager-pin.ts`, case breaks), `STK-09` (empties ledger, bottles back), `FLR-02` (refund and void),
  `FLR-04` (`close-uncounted`), `FLR-08` (Overview "Needs action"), `FLR-09`/`FLR-10` (the till), `CUS-05` (merge),
  `CUS-07` (accounts), `BUY-04` (requisitions), `INS-03` (Losses). The customers spec calls this area `ADM:approvals`,
  `ADM:bin`, `ADM:activity`; those are ADM-04, ADM-07 and ADM-06 here.
- **Defined here** marks a choice the canvas shows the control for but not its contents (an option list, an error
  sentence, a state the board does not draw). **Deviation** marks a place where this spec deliberately does not copy the
  board, with the reason.
- Copy in quotes is exact, sentence case, British English. Money "US$1,940.00", negative "−US$65.50" (U+2212), dates and
  times per foundations 5.13 in Africa/Harare ("Today 12:31", "Yesterday 21:58", "2 Oct 08:15", "2 Nov 2026").
- Every endpoint: session through `requireRetailSession`, permission through `requireRetailPermission(session, resource,
  action)` (403 `{ error: "Your role cannot <verb> <noun>" }`), company scoping on every id, success through
  `successResponse`, errors through `errorResponse` (foundations section 4 conventions). Every write that changes a record's
  state writes its audit event inside the same transaction through `writeRetailAuditEvent`.

## Decisions at a glance

1. **The Roles board is code.** `lib/retail/roles-matrix.ts` transcribes the board row by row (section, label, resources,
   the C/R/U/D letters per role, the limit sentence). `lib/retail/permissions.ts` keeps one explicit grant table per role and
   a test derives the letters from the grants and asserts they equal the board, cell by cell. The "Who can do what" sheet
   renders the same data. Every resource the area specs name (`retail.company`, `retail.prices`, `retail.counts` …) lands
   in ADM-01 at once, with the grants the board gives; area units that "add" a resource find it there.
2. **Five tenant roles and one support role.** Owner = `SUPERADMIN`, Manager = `MANAGER` or `SHOP_MANAGER`, Cashier =
   `CASHIER`, Stock clerk = `STOCK_CLERK`, Bookkeeper = `FINANCE_OFFICER`. Superuser = Corelith support (a platform
   superuser, never a tenant user); its matrix row `CORELITH_SUPPORT` applies only while a support session is on (ADM-10),
   and its two other powers are the platform console (ADM-09).
3. **A person is a `User` of the tenant** with a phone (required), an email only when they sign in to the admin, a role,
   sites (all, or a list), and an optional till PIN. Inviting creates the person at once and sends a WhatsApp link that
   works for 7 days. `User.email` becomes optional (till-only staff have none).
4. **Till PINs are issued, not chosen.** The owner or a manager issues a PIN (random, or typed in onboarding); it goes on
   WhatsApp and the person picks their own the first time they use it. Five wrong tries lock the PIN **until somebody sends
   a new one** (PersonEdit: "Locked today at 08:12 after 5 wrong tries"); the 15-minute self-unlock goes.
5. **Approvals and limits are one row per company** (`RetailApprovalSettings`), read by every area through
   `getApprovalLimits(companyId)`. Asking an approver goes through one helper, `notifyApprover`, which posts the in-app
   notification and, when "Ask by" is "WhatsApp and the app", a WhatsApp message. "Waiting now" on the Approvals page is
   assembled from providers each area registers.
6. **A manager's price change can wait for the owner.** With "Owner approves", or a price under cost while "Below cost
   needs the owner" is on, the change becomes a `RetailPriceApproval` the owner approves or turns down (the hint: "Any price
   under its cost waits for you.").
7. **Activity is the retail audit chain.** One list over `PlatformAuditEvent` (retail events and the generic activity rows
   written by `/api/v2/retail/**`), tabs Everything, Overrides, Prices, Settings; each row says who, what, which record, what
   changed and where ("Front till", "Admin", "Phone", "Corelith support", "Automatic"). Managers limited to some sites see
   those sites' events and their own.
8. **The bin is a list over every binnable kind**, no table of its own (foundations 3.2). Kept 30 days from `archivedAt`;
   restore by owner and manager; "Delete for good" by the owner; a nightly purge. "Gone for good" is a
   `RETAIL_RECORD.PURGED` event, plus deleting the row when nothing refers to it.
9. **Shop-type features keep one switchboard**: `shopFeatures()` in `lib/retail/shop-profile-rules.ts`. The Liquor board is
   the till's spec for its four moments (ID check, licence hours, bottles back, opening a case), and the source of the
   licence reminder ("60 days before, on the overview and on WhatsApp").
10. **Routes**: `/retail/manage/people`, `/retail/manage/approvals`, `/retail/manage/activity`, `/retail/manage/bin`
    (foundations 5.3.4); `/join/[token]` (tenant host, public); `/support/answer/[token]` and `/support/enter` (tenant
    host); `/admin/company/[companyId]/shop` (admin portal host).

---
## 1. Boards

Canvas page "08 People and controls", in reading order (top to bottom, left to right), then the area's workflow board from
"Workflows, start here", then boards this area's workflows name that other specs own. Code status was checked against the
running app (`scratchpad/smoke/adm80/`) and the source at `c78d01f`.

| # | Board file | Canvas title | What it is | Target route, or where it opens | Code status today | Notes |
|---|---|---|---|---|---|---|
| 1 | `Roles.dc.html` | Who can do what: superuser, owner, manager and the rest | explainer, built as a read-only sheet and as the permission matrix in code | The matrix: `lib/retail/roles-matrix.ts` + `lib/retail/permissions.ts`. The screen: sheet `?sheet=roles` over `/retail/manage/people`, opened from the People header's sub link "Who can do what" (**Defined here**; the nav tree files "Who can do what" under People as a sheet) | **Exists but differs.** `lib/retail/permissions.ts` has 8 resources (`retail.sell`, `catalog`, `purchasing`, `stock`, `cash-control`, `reports`, `setup`, `requisitions`) and 5 roles; Owner and Manager are identical (`MANAGE_THE_SHOP`, everything); Bookkeeper (`FINANCE_OFFICER`) can do nothing; Cashier cannot add customers, refund or void; no row for people, approvals, activity, bin, insights; no superuser. No screen shows the matrix. | 32 rows in 7 sections, 6 role columns, a Limits column. The Limits sentences become live (they read the Approvals settings). |
| 2 | `PeopleList.dc.html` | People | list (`List` kind `people`) | `/retail/manage/people` | **Missing** (404, `manage-people.png`). The nearest thing is the Settings dialog's Users register at `/preferences/organization/users` (`pref-users.png`): a name column ("Users 5") beside a record pane, "+ New", no tabs, filters, columns, phone, sites, PIN, last in, state, bulk or totals; only `SUPERADMIN` can change anything. | Tabs Active 6 · Invited 1 · No access 2 · All 9; 7 columns; bulk Reset PINs, Send a message, Remove access. |
| 3 | `PersonNew.dc.html` | Invite someone with a role | sheet (`Sheet` kind `person`) over the People list | `?sheet=person-new` over `/retail/manage/people` | **Missing.** Today's "New user" dialog asks Name, Email, Temporary password and Role (a select of every role the workspace allows); email and password are required; nothing is sent to the person. | Role cards with the board's five descriptions; Sites tags; "Give them a till PIN" toggle; WhatsApp link valid 7 days. |
| 4 | `PersonEdit.dc.html` | Change a role, reset a PIN, remove access | sheet (`Sheet` kind `personedit`) over the People list | `?sheet=person&id=<userId>` over `/retail/manage/people` | **Missing.** Today's user record pane (`/preferences/organization/users/[id]`) changes role and active status and resets a password. Till PINs are set only by the cashier, with their own password, at the till (`POST /api/v2/retail/pos/pin`); a lock clears itself after 15 minutes (`TILL_PIN_LOCK_MS`); nobody can reset another person's PIN. | Danger "Remove access" closes their open shift first. |
| 5 | `ApprovalSettings.dc.html` | W-58  Approvals and limits | settings (SettingsFrame) | `/retail/manage/approvals` | **Missing** (404, `manage-approvals.png`). No limit exists anywhere: any manager approves any requisition (`lib/retail/requisitions.ts`), prices have no owner rule, counts and accounts have no threshold. | Four sections, eight fields; aside "Waiting now" and "Who can change this". |
| 6 | `ActivityList.dc.html` | W-59/60  Activity, overrides included | list (`List` kind `activity`) | `/retail/manage/activity` | **Missing** at the route (404, `manage-activity.png`). The Settings dialog's Activity (`/preferences/organization/activity`, `pref-activity.png`) is a day-grouped feed of every company event, dominated by sign-ins (69 of this tenant's 89 events are `auth.login.success`), with filters Anyone, Any module, Any change, Any time and Export; no tabs, no record, change or where columns, no overrides. | Tabs Everything 1,204 · Overrides 12 · Prices 41 · Settings 6; "Filters 1"; bulk Export. |
| 7 | `BinList.dc.html` | W-63  The bin: restore within 30 days | list (`List` kind `bin`) | `/retail/manage/bin` | **Exists but differs.** `/retail/setup/bin` inside the Settings dialog (`setup-bin.png`): a plain table Removed · Kind · When (one row, "Craft gin", Category), kinds product, promotion and category only, Restore as a row action, no 30-day rule, no "Binned by", no "Gone for good", no delete, no bulk, no Kind filter. `POST /api/v2/retail/bin` means "restore" (foundations moves it to `/bin/restore`). | Sub "Kept for 30 days, then gone for good"; last column a "Restore" link; bulk Restore, Delete for good. |
| 8 | `Liquor.dc.html` | W-61  A liquor store, switched on, as the till shows it | explainer + four till moments | The till (`/portal/pos`, FLR-09/FLR-10 screens) for the four panels; Management › Company (FND-08/SET-01) for the switches; the Overview (FLR-08) and WhatsApp for the licence reminder | **Exists but differs.** Switches live in the Settings dialog (`/retail/setup/operations` via `shop-profile-fields.tsx`); `shopFeatures()` is honoured by `pos/sales`. Till: the ID prompt reads "Check the customer's ID" / "ID checked, over 18" / "Don't sell"; licence hours refuse with a red toast on add; deposits and bottles back exist (C4, D1, D2); a case is opened only from the product page ("Open cases into singles"), never from the till; no licence number or "Not for sale to persons under 18" on receipts; no licence expiry reminder. | Four panels each link to the boards that configure them (CategoryEdit, CompanySettings, ReceiptSettings, EmptiesList, EmptiesReturn, Receive, PackNew, BreakCase — owned by setup, products and stock). |
| 9 | `SupportCompany.dc.html` | W-68  Superuser: business type and features for a company | settings page in the platform admin portal | `/admin/company/[companyId]/shop` on the admin host (file `app/portal/admin/company/[companyId]/shop/page.tsx`) | **Missing.** The admin portal has company pages (dashboard, commercial with plan and features, support access) but no business type or shop features, no reason that reaches the owner, and support access is approved by a platform admin, not the owner; a `SupportSession` row is recorded but nothing signs anyone in as the owner. | Aside "Act as the owner" with "Ask Tendai for access"; "Last changes by support". |
| 10 | `WfAdmin.dc.html` | 08 People and controls | explainer (workflow map, area `admin`) | Nothing to build | n/a | Lists W-57 … W-63 and W-68 with their screens; section 2 follows it. |

Boards these workflows name that other specs own (built there, used here):

| Board | Owner | What this area adds |
|---|---|---|
| `CompanySettings.dc.html` (W-61 screen `company`) | FND-08 (frame), SET-01 (content) | The effect of each switch everywhere (W-61 below, ADM-08); Activity rows for its saves. |
| `TillRules.dc.html` (W-59 screen `tillrules`) | SET-06 | The override log (`RETAIL_OVERRIDE.APPROVED`) every manager PIN writes; the Overrides tab. |
| `CustomerRecord.dc.html`, `Product.dc.html` (W-62, W-63 screens) | CUS-03, PRD-04 (content); FND-06 (rail edit, ⋯ bin, banner) | Activity rows for inline edits and bin moves; the Bin list and "Delete for good". |
| `Record.dc.html` `ASKS.bin` | FND-06 | Nothing (the ask's copy is foundations'). |

---
## 2. Workflows

Definitions from `WorkflowMap.dc.html` `A.admin` (id, name, who, starts from, steps, guided, screens). "Works in code
today" is judged against `c78d01f`.

### W-57 Invite staff and set PINs — **Owner** — Onboarding, or Management › People — guided

Steps (board): Name and phone · Role · Till PIN. Screens: people, personnew, personedit, roles.

**Works in code today: partly.** An owner can create a user at `/preferences/organization/users` with name, email,
temporary password and role (`POST /api/users/create`, `SUPERADMIN` only). There is no phone, no sites, no invite, no
WhatsApp, no state; PINs are set by the person, with their own password, at the till; nobody can reset another's PIN or
unlock it; removing access does not close their shift.

Who may do it (Roles row "People and PINs": Superuser CRUD, Owner CRUD, Manager CRU, others –; limit "Managers add
cashiers and stock clerks only."):

| Act | Owner | Manager | Superuser (acting as the owner) |
|---|---|---|---|
| See People, open a person | ✓ | ✓ | ✓ |
| Invite | any role | Cashier or Stock clerk only | any role |
| Change name, phone, role, sites; send a new PIN | anyone except changing their own role | Cashiers and stock clerks only, and only to Cashier or Stock clerk | as the owner |
| Remove access, give access back | anyone except themselves and the last owner | – | as the owner |

| Step | UI | What the server does |
|---|---|---|
| Start | People › "+ Invite someone" opens `?sheet=person-new` (section 5.2). From onboarding, SET-12's Staff and PINs step calls the same service. From any `auto` field with noun `person` ("Owner approvals go to", "Counted by", "Cashier"), "Add ‘Kuda’ as a new person" opens the quick add (Name, Phone or WhatsApp). | `GET /api/v2/retail/lookup/site` for the Sites tag options (setup spec's noun; this unit registers it if SET-02 has not). Nothing else. |
| Name and phone | Name, Phone or WhatsApp (mono), Email optional ("Only needed to sign in to this admin."). | Validated on submit (below). |
| Role | One of five cards (Owner, Manager, Cashier, Stock clerk, Bookkeeper) with the board's descriptions. A manager sees only Cashier and Stock clerk. | — |
| Where | Sites tags ("All sites", or one or more sites); "Give them a till PIN" toggle. | — |
| Send the invite | Primary "Send the invite". | `POST /api/v2/retail/people` → `invitePerson` (`lib/retail/people/invite.ts`), `retail.people:create` plus the role rule. Validation (fieldErrors, **Defined here**): `name` 1–120 characters "Write their name."; `phone` must normalise through `normaliseZimbabweMobile` ("Write a mobile number such as +263 77 123 4567.") and be unused by any of the company's users ("Chipo Dube already has that number."); `email` optional, valid ("That email does not look right.") and unused by any user ("Someone already signs in with that email."), required for Owner and Bookkeeper ("Owners and bookkeepers sign in to the admin, so they need an email."); `role` allowed for the caller (403 "Managers add cashiers and stock clerks only."); `sites` "ALL" or at least one open site of the company ("Pick at least one site."), "ALL" for an owner ("Owners see every site."), within a site-limited manager's own sites ("You can only give sites you work at."); a way in: an email or a PIN ("Give them an email or a till PIN, or they cannot get in.", on `pin`). One transaction: `User` (`isActive` true, no password, `phone` in E.164, `email` lower-cased or null, `role` mapped Owner→`SUPERADMIN`, Manager→`MANAGER`, Cashier→`CASHIER`, Stock clerk→`STOCK_CLERK`, Bookkeeper→`FINANCE_OFFICER`, `allSites`), `UserSiteAccess` rows when not all sites, a `RetailStaffInvite` (32 random bytes, stored as SHA-256, `expiresAt` = now + 7 days, `sentTo` = the phone), and when the toggle is on a `RetailTillPin` with a random four-digit PIN that is not obvious (`isObviousTillPin`), bcrypt cost 10, `mustChange` true, `issuedById` the caller; `clearUserFeatureOverrides`; audit `RETAIL_PERSON.INVITED { name, role, sites, pin: true/false, email: true/false }` (entity `User`). After commit the WhatsApp message goes out **at once** through SET-07's `sendWhatsAppNow` (never queued: the PIN is never stored), template `staff-invite`, logged in `RetailMessage` with the PIN replaced by "••••". 201 `{ data: PersonView, sent: { whatsapp: true } }`, or when WhatsApp could not send `{ data, sent: { whatsapp: false, error }, handOver: { link, pin } }` (the only time a PIN leaves the server, to the person who issued it). |
| They join | The WhatsApp link opens `/join/<token>` on the shop's host (section 5.6). | `GET /api/public/retail/join/[token]` → who and where, or 404 for an unknown, expired, used or withdrawn token. `POST` with `{ password }` when they have an email (8–200 characters, "Choose a password of 8 characters or more."): sets the password (bcrypt 12, `passwordChangedAt`), `acceptedAt`, audit `RETAIL_PERSON.JOINED`; the page then signs them in with the credentials provider. Without an email: `POST {}` sets `acceptedAt`. An invite is also accepted by the person's first till PIN use (ADM-03) or first admin sign-in (`lib/auth.ts` success hook calls `acceptPendingInvite(userId)`). |
| Till PIN | — | First use at the till: ADM-03 (W-57's third step). |

Changing, resetting, removing (PersonEdit):

| Act | UI | What the server does |
|---|---|---|
| Open | A row's name (or ⋯ "Change") opens `?sheet=person&id=<id>`. | `GET /api/v2/retail/people/[id]` (`retail.people:view`) → `PersonView` (section 4). |
| Save | Primary "Save". | `PATCH /api/v2/retail/people/[id]` `{ name?, phone?, role?, sites?, sendNewPin? }` (`retail.people:update`). Same field rules as invite, plus: a manager may change only cashiers and stock clerks and only to those roles (403 "Managers change cashiers and stock clerks only."); nobody changes their own role (409 "Ask another owner to change your role."); the last active owner keeps the role (409 "Tendai Mhlanga is the only owner. Make someone else an owner first."); Owner or Bookkeeper needs an email on file (400 `role` "Owners and bookkeepers sign in to the admin, so they need an email. Invite them again with one."). One transaction: the changes; `UserSiteAccess` replaced; with `sendNewPin` a new random PIN (`mustChange` true, `failedAttempts` 0, `lockedAt` null, `issuedById`, `issuedAt`); audit `RETAIL_PERSON.CHANGED { changes: [{ field, label, from, to }] }` and, for a PIN, `RETAIL_PERSON.PIN_SENT { wasLocked }` (never the PIN). After commit WhatsApp `staff-pin`. A role change or removal takes effect on the person's next request: `enrichTokenClaims` re-reads `role` and `isActive` (ADM-02 adds this; today the JWT keeps the role until it expires). |
| Remove access | Danger "Remove access" (owner) → ConfirmDialog `removeaccess` (section 5.3). | `POST /api/v2/retail/people/[id]/remove-access` (`retail.people:delete`). 409 "You cannot remove your own access."; 409 "Tendai Mhlanga is the only owner. Make someone else an owner first."; 409 "Farai Moyo has no access already.". One transaction: every `OPEN` `RetailShift` with `cashierId` = them is closed through FLR-04's `closeShiftUncounted` with reason "Access removed for Farai Moyo" (Not counted, waits for sign-off, no variance journal); `User.isActive` false, `accessRemovedAt`, `accessRemovedById`; their `RetailTillPin` deleted; pending invites `revokedAt`; audit `RETAIL_PERSON.ACCESS_REMOVED { closedShifts: ["SH-00244"] }`. Their sessions end at their next request; SET-04's "Who is selling?" drops them; lookups drop them. |
| Give access back | No access row ⋯ "Give access back" (owner) → the person sheet in its No access state, primary "Give access back" (**Defined here**). | `POST /api/v2/retail/people/[id]/give-access-back` `{ sendNewPin }` (`retail.people:delete`): `isActive` true, `accessRemovedAt` null, optional new PIN, audit `RETAIL_PERSON.ACCESS_RESTORED`. |
| Send the invite again | Invited row ⋯ "Send the invite again". | `POST /api/v2/retail/people/[id]/invite-again` (`retail.people:update`): revokes the old token, a new one for 7 days; if their PIN was never used (`mustChange` and no `lastUnlockedAt`) a new PIN goes in the same message. Audit `RETAIL_PERSON.INVITED { again: true }`. |
| Bulk: Reset PINs | Selection bar "Reset PINs" → ConfirmDialog `resetpins`. | `POST /api/v2/retail/people/pins { ids }` (`retail.people:update`): each person through the same PIN issue; people the caller may not change, or with no access, are skipped with a reason. |
| Bulk: Send a message | "Send a message" → `?sheet=people-message&ids=…`. | `POST /api/v2/retail/people/message { ids, message }` (`retail.people:update`): a `RETAIL_STAFF_MESSAGE` notification (the floor spec's type; ADM-02's migration adds the value with `ADD VALUE IF NOT EXISTS` in case FLR-03 has not) to each, and a WhatsApp message to each with a phone (queued through the outbox; no secret in it). |
| Bulk: Remove access | "Remove access" → ConfirmDialog `removeaccessmany`. | `POST /api/v2/retail/people/remove-access { ids }` (`retail.people:delete`): each through the same service; self and the last owner are skipped with their reason. |

What changes elsewhere: the People tabs and counts; `person` lookups (Open a shift's Cashier, Counted by, Owner approvals
go to, the manager pickers); the till's "Who is selling?" chips (SET-04: active people with a PIN and `retail.sell:create`
at that till's site); the approval dialog's chips (FLR-09: people holding the act's `approve`); the setup checklist's staff
item (FND-10); Activity (Everything and People kind); the Shifts list when access removal closed a shift.

### W-58 Approvals and limits — **Owner** — Management › Approvals — guided

Steps (board): Requisitions over US$ · Refunds over US$ · Price changes · Who approves. Screen: approvals.

**Works in code today: no.** There are no limits; any manager approves any requisition; refunds use the manager's password
(SET-06 replaces it with a PIN over the till-rules limit).

| Step | UI | What the server does |
|---|---|---|
| Open | Management › Approvals (`/retail/manage/approvals`). Owner edits; Manager and Bookkeeper read (Roles row "Approvals": Owner RU, Manager R, Bookkeeper R). | `GET /api/v2/retail/settings/approvals` (`retail.approvals:view`) → `{ values, canEdit, lastChanged }` (foundations 4.10) and `GET /api/v2/retail/approvals/waiting` → the aside's list. |
| Requisitions over US$ | "Requisitions need the owner over" (money) and "Owner approvals go to" (person). | Saved by `PATCH /api/v2/retail/settings/approvals` (`retail.approvals:update`; owner, superuser). BUY-04 reads `requisitionOwnerOver`: a manager approves at or under it; over it only an owner ("Over US$500.00 needs Tendai Mhlanga."). |
| Refunds over US$ | Not on this page: the board's step is the till rules' "Manager PIN for refunds over" (SET-06, `/retail/manage/till-rules`). The Roles sheet's limit sentence "Cashiers refund with a manager PIN over the limit." links there. | SET-06. |
| Price changes | "Price changes" (Managers, no approval · Owner approves) and "Below cost needs the owner". | ADM-05's hook in PRD-03's `changePrices`: a manager's change waits for the owner when the rule is Owner approves, or when the new price is under cost and the switch is on (W-58 price approvals below). |
| Stock | "Stock adjustments need a manager PIN over"; "Count differences" (Any manager · Owner approves over US$100). | STK-04 reads `adjustmentPinOver`; STK-06 reads `countDifferences` and `countOwnerOver`. |
| Customers and asking | "Accounts need the owner over"; "Ask by" (The app only · WhatsApp and the app). | CUS-07 reads `accountOwnerOver`; every owner-level ask goes through `notifyApprover`, which reads `ownerApproverId` and `askBy`. |
| Who approves | "Owner approvals go to" names the owner who is asked; any owner may still approve. | `notifyApprover` sends to that person (fallback: every active owner). |
| Save | Save bar "<n> changes not saved · Discard · Save changes". | One transaction: upsert `RetailApprovalSettings`, one `RETAIL_SETTINGS.CHANGED { page: "approvals", changes }`. 400 `fieldErrors` (**Defined here**): money fields 0.00–1,000,000.00 with at most two decimals "Write an amount such as 500.00."; `ownerApproverId` an active owner of the company "Pick an owner.". 403 for anyone but an owner or superuser: "Your role cannot change approvals". |

Price approvals (ADM-05), the part of W-58 the board implies with "Any price under its cost waits for you.":

| Step | UI | What the server does |
|---|---|---|
| A manager changes a price | Anywhere prices change (price worksheet, product rail, bulk change). Toast "2 price changes wait for Tendai Mhlanga." (**Defined here**) instead of "saved". | PRD-03's `changePrices` calls `priceChangeNeedsOwner(ctx, lines)` first: a caller without `retail.prices:approve` whose company rule is `OWNER`, or whose new price is under the product's cost while `belowCostNeedsOwner` is on, gets those lines written as one `RetailPriceApproval` (status `WAITING`, one `RetailPriceApprovalLine` per product: from, to, cost, reason) instead of applied; lines that need no owner apply as usual in the same transaction. Audit `RETAIL_PRICE_APPROVAL.ASKED { list, lines }`. `notifyApprover` (owner level): "Price changes wait for you" / "Tafara Nyathi changed 2 prices on Retail. Castle Lager 340ml US$1.20 → US$0.80, under its cost of US$0.86." → `/retail/manage/approvals?sheet=price-approval&id=<id>`. The response tells the caller which lines wait: `{ applied: [...], waiting: { id, lines: n } }`. |
| The owner decides | "Waiting now" item "Prices on Retail, 2 products, from Tafara Nyathi. 20 minutes." opens `?sheet=price-approval&id=<id>` (section 5.8). | `POST /api/v2/retail/price-approvals/[id]/approve` (`retail.prices:approve`): re-runs `changePrices` for the lines as the owner (current cost checked again), status `APPROVED`, `decidedById`, audit `RETAIL_PRICE_APPROVAL.APPROVED`, and each product's `RETAIL_PRICE.CHANGED` carries `approvedBy`. `POST …/turn-down { note? }`: status `TURNED_DOWN`, audit, nothing changes. Either way a notification to the manager ("Tendai Mhlanga approved your 2 price changes." / "… turned down …"). 409 "This was decided already." for a decided one. A manager may withdraw their own waiting approval (`POST …/withdraw`) — **Defined here**, from the same sheet opened by the asker. |

What changes elsewhere: the requisition rail's "Needs approval" (BUY-04), stock adjustment and count approval (STK-04,
STK-06), account opening (CUS-07), the Roles sheet's limit sentences, prices on the till only after approval, Activity
(Settings tab for the page, Prices tab for approvals).

### W-59 Manager override at the till — **Manager** — The till

Steps (board): Cashier asks · Manager PIN · Logged. Screens: activity, tillrules.

**Works in code today: partly.** Refund and void accept a manager's email and **password** (`lib/retail/manager-override.ts`)
and the approver's name is appended to `overrideReason` as text; nothing lists overrides.

| Step | UI | What the server does |
|---|---|---|
| Cashier asks | The till's approval dialog (FLR-09) opens when a POS route answers 409 `needsApprover` / 403 `MANAGER_PIN_NEEDED` (SET-06 rules: refund over "Manager PIN for refunds over", voids per the void rule, a discount over the cashier's largest, the drawer without a sale; STK-04: an adjustment over "Stock adjustments need a manager PIN over"). | SET-06, STK-04 decide when. |
| Manager PIN | The manager taps their chip and types their PIN on the till. | STK-04's `verifyManagerPin(tx, { companyId, approverId, pin, act })`: the approver must hold the act's approve right (`retail.sell:approve`, `retail.adjustments:approve`), their `RetailTillPin` must match, with the lockout of ADM-03 (five wrong → `lockedAt`, `RETAIL_PIN.LOCKED`, until a new PIN is sent). Only from a paired device (SET-06). |
| Logged | — | In the same transaction as the act, `verifyManagerPin`'s caller writes **one** `RETAIL_OVERRIDE.APPROVED` (ADM-06 adds `auditOverrideApproved` and the call inside `verifyManagerPin`'s success path, so no act can forget it): entity = the record the act made (the refund `RetailSale`, the void, the adjustment movement), `actor` = the **approver**, payload `{ act: "refund" \| "void" \| "discount" \| "drawer" \| "cash-out" \| "adjustment", reference: "RFD-0045", amount: "42.00", limit: "20.00" \| null, askedBy: { id, name }, source: "TILL", registerName: "Front till", siteId }`. Activity › Overrides lists it: "Today 12:31 · Tafara Nyathi · Manager PIN at the till · RFD-0045 · Refund US$42.00 over the US$20.00 limit · Front till". INS-03 (Losses) counts overrides from the same events. |

### W-60 Read the audit trail — **Owner** — Any record › Activity

Steps (board): What changed · Who · When. Screen: activity.

**Works in code today: partly.** Events are written for sales, refunds, voids, shifts, cash, receiving, order close and
shop profile changes, and every mutating `/api/v2/**` request writes a generic activity row; the Settings dialog's
Activity lists them all with sign-ins mixed in; no retail list, no record tab, no who/where columns.

| Step | UI | What the server does |
|---|---|---|
| From a record | The record's Activity tab (FND-06) and its "All activity" link → `/retail/manage/activity?entity=<EntityType>:<id>`. From a settings page, the header's "Activity" button → `?entity=RetailSettings:<page>`. | FND-06 for the tab. |
| From Management | Management › Activity (`/retail/manage/activity`), tabs Everything, Overrides, Prices, Settings. | `GET /api/v2/reports/retail-activity?page=…` (list source, database-side paging, section 4.4), `retail.activity:view` (Owner, Manager, Bookkeeper, Superuser). Managers whose sites are limited see events whose `siteId` is one of their sites, and their own events; events with no site (company settings) are not theirs to see. |
| What changed | "What" badge and "Change" sentence. | From `lib/retail/activity-words.ts` `LIST_WORDS` (section 5.9.4). |
| Who | "Who" column. | `payloadJson.actorName`, else the user's name by `actor`; "Automatic" when `actor` is null; "Nyasha, Corelith support" for support. |
| When | "When" column, mono. | `createdAt` in Africa/Harare. |
| Where | "Where" column. | `payloadJson.source` written by `writeRetailAuditEvent` from the request context (ADM-06): `TILL` → the till's name, `ADMIN` → "Admin", `PHONE` → "Phone", `SUPPORT` → "Corelith support", `SYSTEM` → "Automatic". |
| Export | Toolbar "Export" or bulk "Export". | Foundations W-55 with source `retail-activity`. |

### W-61 Shop-type features — **Owner** — Management › Shop — guided

Steps (board): Liquor: age check, licence hours, empties · Turn each on or off. Screens: company, liquor.

**Works in code today: partly.** The business type and the four switches exist (`RetailShopProfile`, C1), are read through
`shopFeatures()` (a feature is on only when the type is Liquor store and its switch is on) and enforced by `pos/sales` for
the ID check, licence hours and deposits; the page is in the Settings dialog; the till's words differ from the board; no
case prompt at the till, no licence line on receipts, no reminder.

The switches are saved on Management › Company (FND-08 frame, SET-01 content; owner only, superuser through the console).
What each switch does everywhere (ADM-08 makes every row true and tests it):

| Switch | When off | When on | Server | Screens |
|---|---|---|---|---|
| Age check at the till | No ID question | The till asks once a sale, before payment, the first time an age-restricted line is added (a line whose category has the 18+ switch); "Remove it" takes that line out; "18 or over" lets the sale go on; the answer is kept on the sale (`RetailSale.idCheckedAt`) with the cashier's name | `pos/sales` refuses a sale with an age-restricted line and no ID check (exists) | Till panel 1 (section 5.11.1); Categories' 18+ field shows only when on (PRD-02) |
| Licence trading hours | Sells at any hour | Outside the licence hours (Company: Mondays to Saturdays, Sundays and public holidays) age-restricted categories do not sell; everything else still sells; **no manager PIN can override it** | `pos/sales` refuses with "<Product> can't be sold now. The licence allows …" (exists); the approval dialog is never offered for it | Till panel 2 (5.11.2) |
| Empties and deposits | No deposits; Stock › Empties hidden; deposit fields hidden | Returnable products carry a deposit; the till charges it and takes bottles back for cash or off the sale; the Empties ledger tracks the store and what suppliers owe for crates | `pos/sales` deposits (exists); STK-09 ledger and returns; BUY receiving | Till panel 3 (5.11.3); nav item "Empties" (FND-03 rule); product and category deposit fields (PRD) |
| Cases and singles | Case products, "Sell it by the case too", "Break a case" hidden | A case is its own product linked to its single; the till opens a case when singles run out (automatically when the case has "Break cases at the till" on, else it asks); a manager breaks one from the product | STK-04 `POST /api/v2/retail/stock/case-breaks`; PRD-08 packs | Till panel 4 (5.11.4); PackNew, BreakCase |
| (Liquor store, always) | — | Receipts print the licence number (Receipts "Show the liquor licence number", SET-07) and the footer line "Not for sale to persons under 18." (SET-07's default footer for a liquor store); the licence expiry reminder 60 days before | SET-07 renderer; ADM-08 reminder job | Overview "Needs action" (FLR-08), WhatsApp |

Saving the Company page writes `RETAIL_SETTINGS.CHANGED { page: "company" }` and `RETAIL_SHOP.PROFILE_CHANGED`; the till
reads the profile on its next context fetch (`GET /api/v2/retail/pos/context`, or SET-04's `devices/me`), so a switch turned
off stops the till asking within one refresh.

### W-62 Edit a record's details — **Anyone allowed to** — Any record, its details rail

Steps (board): Click the value · Change it · Enter saves, Esc cancels · Logged in Activity. Screens: customer, productrec.

Built by FND-06 (the rail, the `PATCH` contract 4.9, `RETAIL_RECORD.EDITED`) and the area record units. This area's part is
the last step: every `RETAIL_RECORD.EDITED` appears in Management › Activity (Everything; Prices when the field is a price,
because PRD writes `RETAIL_PRICE.CHANGED` for it) with What "Changed a detail" and Change "<Label>: <from> → <to>".
**Works in code today: partly** (inline edit on products without an event).

### W-63 Delete and restore — **Managers and owners** — Any record, ⋯ menu

Steps (board): Move to the bin · Gone from lists, kept 30 days · Restore from the bin or the record. Screens: customer, bin.

Moving to the bin and restoring from a record are FND-06 (`POST /api/v2/retail/bin`, `/bin/restore`, the banner, the
30-day 410). This area builds the Bin list, "Delete for good" and the purge.

**Works in code today: partly.** Products, promotions and categories can be restored from `/retail/setup/bin`; nothing
expires, nothing is ever gone for good, and the list does not say who binned it.

| Step | UI | What the server does |
|---|---|---|
| Gone from lists, kept 30 days | Management › Bin lists everything binned in the last 30 days. | `GET /api/v2/reports/retail-bin` (list source, section 4.5), `retail.bin:view` (Owner, Manager, Superuser): every registered kind's rows with `archivedAt` within 30 days and no `RETAIL_RECORD.PURGED` event after their latest `RETAIL_RECORD.BINNED`; "Binned by" from that BINNED event; "Gone for good" = `archivedAt` + 30 days. |
| Restore from the bin | The row's "Restore" link, ⋯ "Restore", or bulk "Restore". | `POST /api/v2/retail/bin/restore { kind, id }` (FND-06), or `POST /api/v2/retail/bin/restore-many { items: [{ kind, id }] }` (this area): `retail.bin:update` (the board: "Restore is U"); each item through its kind's `restore`; `RETAIL_RECORD.RESTORED` each. Toast "Restored. It is back in every list." / "3 restored. They are back in every list." Per-kind refusals pass through (e.g. a customer whose survivor was binned, CUS-05). |
| Restore from the record | The bin banner's "Restore" (FND-06). | Same endpoint. |
| Delete for good (owner) | ⋯ "Delete for good" or bulk "Delete for good" → ConfirmDialog `deleteforgood`. | `POST /api/v2/retail/bin/delete { items }` (`retail.bin:delete`: Owner, Superuser). Each item: the kind's `purge(tx, id)` deletes the row and what hangs only on it when nothing else refers to it (a price list never used, a draft order, a promotion never sold), else keeps the row for history (a product with sales); either way `RETAIL_RECORD.PURGED { kind, name, how: "deleted" \| "kept" }` and it never lists or restores again (restore answers 410 "It was deleted for good."). |
| After 30 days | — | The retail worker (SET-01) runs `purgeExpiredBin` nightly at 02:00 Africa/Harare: each registered kind's rows binned more than 30 days ago and not yet purged go through `purge`, event actor null ("Automatic"). Restore already refuses them (FND 410). |

### W-68 Support a shop (Corelith superuser) — **Superuser** — Platform › Companies

Steps (board): Set the business type and features · Say why: it is logged for the owner · Act as the owner, with their yes.
Screen: support.

**Works in code today: partly.** The admin portal has per-company pages and a support-access model (`SupportAccessRequest`,
`SupportSession`), but a platform admin approves the request, a session is a row with no sign-in behind it, and nothing
changes a shop's business type or tells the owner.

Who: a platform superuser (`isPlatformSuperuser`: role `SUPERADMIN` in the platform company and an email in
`ADMIN_PORTAL_ALLOWED_EMAILS`), on the admin host only (`requirePlatformAdminAccess`).

| Step | UI | What the server does |
|---|---|---|
| Open the company | Admin portal › Companies › a company › "Business type and features" (row action and a link on the company page) → `/admin/company/[companyId]/shop` (section 5.12). | `GET /api/platform-admin/companies/[companyId]/shop` → company line, values, the owner, the access state and "Last changes by support". |
| Set the business type and features | Business type cards; "Liquor store features" (four switches, shown while Liquor store); "Plan and modules" (Plan Start · Grow · Scale; Fiscal receipts; Posting to the books; Sales and CRM). | Nothing until saved. |
| Say why | "Why you are changing it" (required to save; hint "Shown to the owner in Activity, with your name."). | — |
| Save for this company | Primary "Save for this company"; then "Saved. The owner sees it in Activity." beside it. | `PATCH /api/platform-admin/companies/[companyId]/shop { changes, reason }`. 400 `reason` "Say why. The owner reads it in Activity." (5–500 characters, **Defined here**). One transaction in the tenant: business type and switches through `saveShopProfile` (the same service the Company page uses, so categories seed the same way); the plan through the platform's `subscription.assignTier` (SET-10's plan codes START, GROW, SCALE); modules through `CompanySubscriptionAddon` (`ADDON_ZIMRA_FISCAL` for Fiscal receipts, `ADDON_ACCOUNTING_CORE` for Posting to the books, `ADDON_CRM_SUITE` for Sales and CRM). Audit on the tenant's chain: `RETAIL_SETTINGS.CHANGED { page: "company", changes }` for the shop fields and `RETAIL_SUPPORT.PLAN_CHANGED { changes }` for plan and modules, each with `reason` = the why and `payload.support = { name: "Nyasha", email }`, `source: "SUPPORT"`, actor = the platform user's id. A notification to every owner: "Corelith support changed your shop" / "<Nyasha>: <changes>. Why: <reason>" → `/retail/manage/activity?kind=support`. The platform's own chain gets `appendAuditEvent` as today. |
| Act as the owner, with their yes | Aside "Ask Tendai for access" → states in section 5.12. | ADM-10: `POST …/support-access { reason }` creates a `SupportAccessRequest` (`IMPERSONATE`, `READ_WRITE`, `ownerUserId` = the owner approver or first owner, an answer token) and sends the owner WhatsApp `support-ask` with a link to `/support/answer/<token>`; audit `RETAIL_SUPPORT.ACCESS_ASKED`. The owner, signed in as themselves, answers "Let them in" or "Not now" (`POST /api/v2/retail/support-access/answer`): `APPROVED` or `DENIED`, `answeredAt`, audit `RETAIL_SUPPORT.ACCESS_ANSWERED`. "Open their admin" (`POST …/support-access/open`) starts a `SupportSession` (30 minutes from now), creates a `SessionHandoff` carrying the session id and returns `https://<tenant host>/support/enter?token=…`; the tenant signs the superuser in **as the owner** with claims `supportSessionId`, `supportActorName`, `authExpiresAt` = the session's end. While it lasts every page shows the support banner, every permission check uses the `CORELITH_SUPPORT` row, and every audit event carries `payload.support` and `source: "SUPPORT"`. "End it" (banner or console) or the 30 minutes end it (`REVOKED`/`EXPIRED`, `RETAIL_SUPPORT.SESSION_ENDED`). |

What changes elsewhere: the shop's Company page, till and nav (W-61 table), the plan on Plan and billing (SET-10), the
workspace switcher when Sales and CRM is turned on, Activity (Support kind), the owner's notifications.

---
## 3. Data

### 3.1 Who can do what: the matrix in code (ADM-01)

The Roles board governs permissions everywhere. It becomes two files and one test:

- `lib/retail/roles-matrix.ts` — the board, transcribed: `ROLE_COLUMNS` (Superuser "Corelith support", Owner
  "SUPERADMIN", Manager "MANAGER, SHOP_MANAGER", Cashier "CASHIER", Stock clerk "STOCK_CLERK", Bookkeeper
  "FINANCE_OFFICER"), `ROLE_SECTIONS` (7 sections, 32 rows; each row `{ label, letters: Record<RoleColumn, string>,
  realise: { C?, R?, U?, D? }, limit?: (limits: ApprovalLimits) => string }`). `realise` lists, per letter, the
  `[resource, action]` pairs that make it true (table below).
- `lib/retail/permissions.ts` — `RETAIL_RESOURCES` (37 resources), `RETAIL_ACTIONS` (the 11 existing plus `view-own`),
  one explicit grant table per role key (`SUPERADMIN`, `MANAGER`, `SHOP_MANAGER` = `MANAGER`'s, `CASHIER`, `STOCK_CLERK`,
  `FINANCE_OFFICER`, `CORELITH_SUPPORT`), `RESOURCE_LABELS` for every resource, `canRetailRoleDo(role, resource, action)`
  unchanged, and a new `canRetailSessionDo(session, resource, action)` that uses `CORELITH_SUPPORT` when
  `session.user.supportSessionId` is set. `requireRetailPermission` and `retailPermissionDenial` call the session form.
  `retail.setup` is removed (the setup spec's resources replace it).
- `lib/retail/roles-matrix.test.ts` — for every row, role and letter: the board has the letter ⇔ the role holds at least
  one of the letter's `realise` pairs. Plus: every resource in `RETAIL_RESOURCES` has a label; no role outside the seven
  keys has any grant (`TEACHER`, `SALES_REP` … deny); `view-own` never makes an R.

Letter realisations (resource prefix `retail.` omitted):

| Section | Row (board label) | C | R | U | D | Limit (live; board wording) |
|---|---|---|---|---|---|---|
| Set up | Company and business type | `company:create` | `company:view` | `company:update` | `company:delete` | "Superuser can switch business type and features for support." |
| | Sites and places | `sites:create` | `sites:view` | `sites:update` | `sites:delete` | — |
| | Tills and devices | `tills:create` | `tills:view` | `tills:update` | `tills:delete` | — |
| | Payments, ZiG rate | `payments:create` | `payments:view` | `payments:update`, `zig-rate:update` | `payments:delete` | "Managers change the rate only." |
| | Till rules, receipts | `till-rules:create` | `till-rules:view`, `receipts:view` | `till-rules:update`, `receipts:update` | `till-rules:delete` | — |
| | Fiscal device | `fiscal:create` | `fiscal:view` | `fiscal:update` | `fiscal:delete` | — |
| | Posting to the books | `posting:create` | `posting:view` | `posting:update` | `posting:delete` | — |
| | Plan and billing | `billing:create` | `billing:view` | `billing:update` | `billing:delete` | — |
| Products and prices | Products | `catalog:create` | `catalog:view` | `catalog:update` | `catalog:delete` | "Cashiers and stock clerks never see cost." |
| | Prices and price lists | `prices:create` | `prices:view` | `prices:update`, `prices:approve` | `prices:delete` | "Below cost needs the owner." (when `belowCostNeedsOwner`; "Price changes need the owner." when the rule is Owner approves) |
| | Promotions, bundles, vouchers | `promotions:create` | `promotions:view` | `promotions:update` | `promotions:delete` | "Cashiers redeem vouchers at the till." |
| | Categories | `categories:create` | `categories:view` | `categories:update` | `categories:delete` | — |
| Stock | Counts | `counts:create` | `counts:view` | `counts:update`, `counts:approve` | `counts:delete` | "Owner approves differences over US$100." (from `countOwnerOver`; "Any manager approves differences." for Any manager) |
| | Adjustments, breakage | `adjustments:create` | `adjustments:view` | `adjustments:update`, `adjustments:approve` | `adjustments:delete` | "Over US$50 needs a manager PIN." (from `adjustmentPinOver`, whole dollars drop ".00") |
| | Transfers | `transfers:create` | `transfers:view` | `transfers:update` | `transfers:delete` | — |
| | Empties | `empties:create` | `empties:view` | `empties:update` | `empties:delete` | "Liquor store only." |
| Buying and paying | Suppliers | `suppliers:create` | `suppliers:view` | `suppliers:update` | `suppliers:delete` | — |
| | Orders and deliveries | `purchasing:create`, `purchasing:receive` | `purchasing:view` | `purchasing:update`, `purchasing:approve`, `purchasing:receive` | `purchasing:delete` | "Stock clerks receive; they do not order." |
| | Requisitions | `requisitions:create` | `requisitions:view` | `requisitions:update`, `requisitions:approve` | `requisitions:delete` | "Managers approve up to US$500." (from `requisitionOwnerOver`) |
| | Bills and supplier payments | `bills:create` | `bills:view` | `bills:update` | `bills:delete` | — |
| The floor | Sales, refunds, voids | `sell:create`, `sell:refund`, `sell:void` | `sell:view` | `sell:update`, `sell:approve` | `sell:delete` | "Cashiers refund with a manager PIN over the limit." (links to Till rules) |
| | Shifts and cash | `cash-control:create`, `sell:open-shift` | `cash-control:view`, `sell:open-shift` | `cash-control:update`, `cash-control:close-shift`, `sell:close-shift` | `cash-control:delete` | "Cashiers open and close their own." |
| | Lay-bys | `laybys:create` | `laybys:view` | `laybys:update` | `laybys:delete` | — |
| | End of day | `end-of-day:create` | `end-of-day:view` | `end-of-day:update` | `end-of-day:delete` | — |
| Customers | Customers and points | `customers:create` | `customers:view` | `customers:update` | `customers:delete` | "Cashiers add customers at the till." |
| | Accounts | `accounts:create` | `accounts:view` | `accounts:update`, `accounts:approve` | `accounts:delete` | "Owner approves limits over US$250." (from `accountOwnerOver`) |
| | Loyalty settings | `loyalty:create` | `loyalty:view` | `loyalty:update` | `loyalty:delete` | — |
| People and controls | People and PINs | `people:create` | `people:view` | `people:update` | `people:delete` | "Managers add cashiers and stock clerks only." |
| | Approvals | `approvals:create` | `approvals:view` | `approvals:update` | `approvals:delete` | — |
| | Activity | `activity:create` | `activity:view` | `activity:update` | `activity:delete` | "Managers see their own sites." |
| | Bin | `bin:create` | `bin:view` | `bin:update` | `bin:delete` | "Restore is U; delete for good is D." |
| | Insights | `insights:create` | `insights:view` | `insights:update` | `insights:delete` | "Managers do not see Money." |

Grants (`ALL` = every action except `view-own`; "–" = nothing). Three resources sit under board rows without one of their
own: `retail.stock` (On hand and Movements, under the Stock section), `retail.money` (the Money insight, under Insights) and
`retail.reports` (Reports templates; not on the board, visibility from foundations 5.3.4).

| Resource | Owner `SUPERADMIN` | Manager `MANAGER`, `SHOP_MANAGER` | Cashier | Stock clerk | Bookkeeper `FINANCE_OFFICER` |
|---|---|---|---|---|---|
| `company` | view, update | view | – | – | view |
| `sites` | view, create, update, delete | view, update | – | view | view |
| `tills` | view, create, update, delete | view, create, update, delete | – | – | – |
| `payments` | view, update | view | – | – | view |
| `zig-rate` | view, update | view, update | – | – | view |
| `till-rules` | view, update | view, update | – | – | – |
| `receipts` | view, update | view, update | – | – | – |
| `fiscal` | view, update | view | – | – | view |
| `posting` | view, update | – | – | – | view, update |
| `billing` | view, update | – | – | – | view |
| `catalog` | view, view-cost, create, update, delete | view, view-cost, create, update, delete | view | view | view, view-cost |
| `prices` | view, create, update, delete, approve | view, create, update | view | – | view |
| `promotions` | view, create, update, delete | view, create, update, delete | view | – | view |
| `categories` | view, create, update, delete | view, create, update | – | – | view |
| `stock` | view, update | view, update | – | view | view |
| `counts` | view, create, update, delete, approve | view, create, update, delete, approve | – | view, create, update | view |
| `adjustments` | view, create, update, delete, approve | view, create, update, approve | – | create | view |
| `transfers` | view, create, update, delete | view, create, update, delete | – | view, create, update | view |
| `empties` | view, create, update, delete | view, create, update, delete | create | view, create, update | view |
| `suppliers` | view, create, update, delete | view, create, update, delete | – | view | view, update |
| `purchasing` | view, create, update, delete, approve, receive | view, create, update, delete, approve, receive | – | view, receive | view |
| `requisitions` | view, create, update, delete, approve | view, create, update, approve | view-own, create | view-own, create | view |
| `bills` | view, create, update, delete | view | – | – | view, create, update, delete |
| `sell` | view, create, update, delete, approve, refund, void, open-shift, close-shift | same as Owner | view, create, refund, void, open-shift, close-shift | – | view |
| `cash-control` | view, create, update, delete, approve, open-shift, close-shift | same as Owner | – | – | view |
| `laybys` | view, create, update, delete | view, create, update, delete | view, create, update | – | view |
| `end-of-day` | view, create, update | view, create, update | – | – | view |
| `customers` | view, create, update, delete | view, create, update, delete | view, create | – | view |
| `accounts` | view, create, update, delete, approve | view, create, update | – | – | view, update |
| `loyalty` | view, update | view | – | – | – |
| `people` | view, create, update, delete | view, create, update | – | – | – |
| `approvals` | view, update | view | – | – | view |
| `activity` | view | view | – | – | view |
| `bin` | view, update, delete | view, update | – | – | – |
| `insights` | view | view | – | – | view |
| `money` | view | – | – | – | view |
| `reports` | view, create, update, delete | view, create, update, delete | – | – | view |

`CORELITH_SUPPORT` (Superuser): `ALL` on every resource, except `activity`, `insights` and `money`: view only.

Row-level rules the matrix cannot state, each enforced in its service and named here so nobody reads the matrix as the
whole answer: Managers add and change cashiers and stock clerks only (ADM-02); managers limited to sites see those sites'
Activity (ADM-06); a manager approves requisitions at or under the owner limit and never their own (BUY-04); cashiers refund
and void within the till rules (SET-06); `view-own` lists only the caller's own requisitions (BUY-04); a cashier sees only
their own shifts (FLR).

Labels (`RESOURCE_LABELS`, so a refusal reads "Your role cannot <verb> <label>"): company "company settings", sites
"sites", tills "tills and devices", payments "payment settings", zig-rate "the ZiG rate", till-rules "till rules",
receipts "receipt settings", fiscal "the fiscal device", posting "posting to the books", billing "the plan and billing",
catalog "products", prices "price lists", promotions "promotions, bundles and vouchers", categories "categories", stock
"stock", counts "stock counts", adjustments "stock adjustments", transfers "transfers", empties "empties", suppliers
"suppliers", purchasing "orders and deliveries", requisitions "requisitions", bills "bills and supplier payments", sell
"sales", cash-control "shifts and cash", laybys "lay-bys", end-of-day "the end of day", customers "customers", accounts
"accounts", loyalty "loyalty settings", people "people", approvals "approvals", activity "activity", bin "the bin",
insights "insights", money "the money page", reports "reports". `ACTION_VERBS` gains `"view-own": "view"`.

Where other specs' tables differ from the board, this table wins and those units take it as written: End of day has no
delete (the floor spec gave Owner and Manager everything); Reports are Owner, Manager and Bookkeeper only (the insights
spec gave Cashier and Stock clerk view); requisitions' "view (own)" is the action `view-own`.

### 3.2 Models used

| Model | Used for |
|---|---|
| `User` (extended) | People: name, phone, email, role, `isActive`, sites, access removal |
| `UserSiteAccess` (new) | Sites a person works at when not all |
| `RetailStaffInvite` (new) | The WhatsApp link, its 7 days, accepted or withdrawn |
| `RetailTillPin` (changed) | The till PIN: issued, must change, locked until reset, last used |
| `RetailShift` | Closing open shifts on access removal (via FLR-04); "Selling now" |
| `Site` | Sites tags and filters |
| `RetailApprovalSettings` (new) | Approvals and limits |
| `RetailPriceApproval`, `RetailPriceApprovalLine` (new) | Price changes waiting for the owner |
| `PlatformAuditEvent` (extended) | Activity; "Last changed by"; bin "Binned by"; "Last changes by support"; last seen |
| `Notification`, `NotificationRecipient` | Approval asks, PIN locked, support changes |
| `RetailMessage` (SET-07) | WhatsApp invites, PINs (redacted), approval asks, support asks, licence reminder |
| `RetailShopProfile` (extended) | Business type and switches; licence reminder sent |
| `Product`, `RetailPromotion`, `RetailCategory`, `PriceList`, `RetailPurchaseOrder`, `Customer`, … (each with `archivedAt`) | The bin, through each kind's registry entry |
| `SupportAccessRequest`, `SupportSession`, `SessionHandoff` (extended) | Act as the owner |
| `CompanySubscription`, `SubscriptionPlan`, `CompanySubscriptionAddon` | Plan and modules from the support console |

### 3.3 Schema changes

Seven migrations in this area's slot. Each ships with its witness test in the same commit and is applied with `npx prisma
migrate deploy`, then again against `DATABASE_URL_TEST`.

#### `20261004138000_retail_people` (ADM-02) · witness `lib/retail/people-migration.test.ts`

```prisma
model User {
  id    String  @id @default(uuid())
  /// Null for someone who only uses a till: they never sign in to the admin.
  email String? @unique
  name  String
  // … existing fields unchanged …
  /// E.164 ("+263719027713"). Required for retail people (checked in the service; other products leave it null).
  phone             String?
  isActive          Boolean   @default(true)
  /// Works at every site, now and later. False: only the sites in `siteAccess`.
  allSites          Boolean   @default(true)
  /// When their access was removed (isActive went false), and by whom. Null while they have access.
  accessRemovedAt   DateTime?
  accessRemovedById String?

  accessRemovedBy  User?               @relation("UserAccessRemovedBy", fields: [accessRemovedById], references: [id], onDelete: SetNull)
  accessRemovals   User[]              @relation("UserAccessRemovedBy")
  siteAccess       UserSiteAccess[]
  staffInvites     RetailStaffInvite[] @relation("RetailStaffInvitee")
  staffInvitesSent RetailStaffInvite[] @relation("RetailStaffInviter")

  @@index([companyId, phone])
}

/// The sites a person works at, when they do not work at all of them.
model UserSiteAccess {
  userId    String
  siteId    String
  companyId String
  createdAt DateTime @default(now())

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  site    Site    @relation(fields: [siteId], references: [id], onDelete: Cascade)
  company Company @relation(fields: [companyId], references: [id], onDelete: Cascade)

  @@id([userId, siteId])
  @@index([companyId, siteId])
}

/// The WhatsApp link a new person joins with. Works for 7 days; stored only as its SHA-256.
model RetailStaffInvite {
  id          String    @id @default(uuid())
  companyId   String
  userId      String
  invitedById String?
  tokenHash   String    @unique
  /// The phone it was sent to.
  sentTo      String
  expiresAt   DateTime
  /// They opened the link and joined, used their PIN, or signed in.
  acceptedAt  DateTime?
  /// Sent again (a newer invite replaces it) or their access was removed.
  revokedAt   DateTime?
  createdAt   DateTime  @default(now())

  company   Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  user      User    @relation("RetailStaffInvitee", fields: [userId], references: [id], onDelete: Cascade)
  invitedBy User?   @relation("RetailStaffInviter", fields: [invitedById], references: [id], onDelete: SetNull)

  @@index([companyId, userId])
}

model Site {
  // … add:
  userAccess UserSiteAccess[]
}

model Company {
  // … add:
  userSiteAccess     UserSiteAccess[]
  retailStaffInvites RetailStaffInvite[]
}

model PlatformAuditEvent {
  // … existing fields and indexes …
  /// "Last in" on People, and Activity's Who filter.
  @@index([companyId, actor, createdAt])
}

/// The area's notification values, in its first migration so every later unit has them. The SQL uses
/// `ALTER TYPE … ADD VALUE IF NOT EXISTS` for each, so the order against other areas' migrations does not matter.
enum NotificationType {
  // … existing …
  RETAIL_PRICE_APPROVAL
  RETAIL_PRICE_DECIDED
  RETAIL_PIN_LOCKED
  RETAIL_SUPPORT
  RETAIL_STAFF_MESSAGE // also the floor spec's (FLR-03); IF NOT EXISTS
}

enum NotificationEntityType {
  // … existing …
  RETAIL_PRICE_APPROVAL
  RETAIL_PERSON
  RETAIL_SETTINGS
}
```

SQL: `ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL`; add `allSites` (default true), `accessRemovedAt`,
`accessRemovedById` (FK `ON DELETE SET NULL`); `UPDATE "User" SET "phone" = NULL WHERE btrim("phone") = ''`; create
`UserSiteAccess` and `RetailStaffInvite` with their FKs and indexes; index `User_companyId_phone_idx`;
`PlatformAuditEvent_companyId_actor_createdAt_idx`; the eight enum values (`IF NOT EXISTS`). Phone uniqueness is a service rule for retail
people, not a constraint: other products' users (school guardians) may share a number. Witness: `email` nullable and still
unique, the three columns with types and defaults, both tables with their keys, FKs (cascade and set null as above) and
indexes, the audit index, the enum values.

Code that follows: every `user.email` read becomes `string | null` (`pnpm typecheck` lists them; the credentials and email
sign-in paths already look users up by email and simply never match a null); `enrichTokenClaims`
(`lib/auth-core/session-claims.ts`) reads `{ role, isActive }` for `token.id` on every request — an inactive or missing
user yields no session, and the role claim is replaced by the database's.

#### `20261004138100_retail_till_pin_issued` (ADM-03) · witness `lib/retail/till-pin-issued-migration.test.ts`

```prisma
model RetailTillPin {
  id             String    @id @default(uuid())
  companyId      String
  userId         String    @unique
  pinHash        String
  failedAttempts Int       @default(0)
  /// Set on the fifth wrong PIN in a row. While set the PIN is refused without comparing it, until somebody sends a new one.
  lockedAt       DateTime?
  /// True for a PIN somebody else issued: the person chooses their own the first time they use it.
  mustChange     Boolean   @default(false)
  issuedAt       DateTime  @default(now())
  issuedById     String?
  lastUnlockedAt DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  company  Company @relation(fields: [companyId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  user     User    @relation("RetailTillPinUser", fields: [userId], references: [id], onDelete: Cascade, onUpdate: Cascade)
  issuedBy User?   @relation("RetailTillPinIssuedBy", fields: [issuedById], references: [id], onDelete: SetNull)

  @@index([companyId])
}
// User gains: retailTillPinsIssued RetailTillPin[] @relation("RetailTillPinIssuedBy")
```

SQL: add `lockedAt`, `mustChange`, `issuedAt` (default now), `issuedById` (FK set null); `UPDATE "RetailTillPin" SET
"lockedAt" = "lockedUntil" - interval '15 minutes' WHERE "lockedUntil" > now()`; drop `lockedUntil`. Witness: the columns,
`lockedUntil` gone, the FK.

#### `20261004138200_retail_approval_settings` (ADM-04) · witness `lib/retail/approval-settings-migration.test.ts`

```prisma
enum RetailPriceChangeRule {
  /// "Managers, no approval"
  MANAGERS
  /// "Owner approves"
  OWNER
}

enum RetailCountApprovalRule {
  /// "Any manager"
  ANY_MANAGER
  /// "Owner approves over US$100" (the amount is `countOwnerOver`)
  OWNER_OVER_LIMIT
}

enum RetailApprovalChannel {
  /// "The app only"
  APP
  /// "WhatsApp and the app"
  WHATSAPP_AND_APP
}

/// Management › Approvals. One row per company; absent = the defaults below.
model RetailApprovalSettings {
  companyId            String                  @id
  /// "Requisitions need the owner over". Under it, any manager approves.
  requisitionOwnerOver Decimal                 @default(500) @db.Decimal(14, 2)
  /// "Owner approvals go to". Null = every active owner.
  ownerApproverId      String?
  priceChanges         RetailPriceChangeRule   @default(MANAGERS)
  /// "Below cost needs the owner": a manager's price under cost waits for the owner.
  belowCostNeedsOwner  Boolean                 @default(true)
  /// "Stock adjustments need a manager PIN over"
  adjustmentPinOver    Decimal                 @default(50) @db.Decimal(14, 2)
  countDifferences     RetailCountApprovalRule @default(OWNER_OVER_LIMIT)
  /// The amount in "Owner approves over US$100". Not editable on the page; the segment's label is built from it.
  countOwnerOver       Decimal                 @default(100) @db.Decimal(14, 2)
  /// "Accounts need the owner over", when opening or raising a limit.
  accountOwnerOver     Decimal                 @default(250) @db.Decimal(14, 2)
  askBy                RetailApprovalChannel   @default(WHATSAPP_AND_APP)
  updatedById          String?
  createdAt            DateTime                @default(now())
  updatedAt            DateTime                @updatedAt

  company       Company @relation(fields: [companyId], references: [id], onDelete: Cascade)
  ownerApprover User?   @relation("RetailApprovalOwner", fields: [ownerApproverId], references: [id], onDelete: SetNull)
  updatedBy     User?   @relation("RetailApprovalSettingsUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
}
```

Witness: the three enums and their values in order, the table, the defaults (500.00, MANAGERS, true, 50.00,
OWNER_OVER_LIMIT, 100.00, 250.00, WHATSAPP_AND_APP), both FKs set null.

#### `20261004138300_retail_price_approvals` (ADM-05) · witness `lib/retail/price-approvals-migration.test.ts`

```prisma
enum RetailPriceApprovalStatus {
  WAITING
  APPROVED
  TURNED_DOWN
  WITHDRAWN
}

enum RetailPriceApprovalReason {
  /// The company's rule is "Owner approves".
  OWNER_APPROVES
  /// Under the product's cost while "Below cost needs the owner" is on.
  BELOW_COST
}

/// A manager's price changes on one price list, waiting for the owner.
model RetailPriceApproval {
  id            String                    @id @default(uuid())
  companyId     String
  priceListId   String
  requestedById String
  status        RetailPriceApprovalStatus @default(WAITING)
  /// When the change was asked to apply ("Tonight, after closing", a date); null = now. Kept when approved.
  effectiveAt   DateTime?
  decidedById   String?
  decidedAt     DateTime?
  note          String?
  createdAt     DateTime                  @default(now())
  updatedAt     DateTime                  @updatedAt

  company     Company                   @relation(fields: [companyId], references: [id], onDelete: Cascade)
  priceList   PriceList                 @relation(fields: [priceListId], references: [id], onDelete: Cascade)
  requestedBy User                      @relation("RetailPriceApprovalAsker", fields: [requestedById], references: [id], onDelete: Restrict)
  decidedBy   User?                     @relation("RetailPriceApprovalDecider", fields: [decidedById], references: [id], onDelete: SetNull)
  lines       RetailPriceApprovalLine[]

  @@index([companyId, status, createdAt])
}

model RetailPriceApprovalLine {
  id         String                    @id @default(uuid())
  approvalId String
  productId  String
  fromPrice  Decimal                   @db.Decimal(14, 2)
  toPrice    Decimal                   @db.Decimal(14, 2)
  costAtAsk  Decimal?                  @db.Decimal(14, 4)
  reason     RetailPriceApprovalReason

  approval RetailPriceApproval @relation(fields: [approvalId], references: [id], onDelete: Cascade)
  product  Product             @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([approvalId])
  @@index([productId])
}
```

Witness: both enums, both tables, their FKs and indexes.

#### `20261004138400_audit_site_and_actor` (ADM-06) · witness `lib/audit/audit-site-actor-migration.test.ts`

```prisma
model PlatformAuditEvent {
  // … existing fields …
  /// The site the event happened at, copied from `payloadJson.siteId` when it is written. Null = the whole company.
  /// Not a foreign key: the chain outlives sites. Not part of the hash: the payload, which is, already carries it.
  siteId String?

  @@index([companyId, createdAt])
  @@index([eventType, createdAt])
  @@index([companyId, entityType, entityId, createdAt]) // FND-06
  @@index([companyId, actor, createdAt])                // ADM-02
  @@index([companyId, siteId, createdAt])
}
```

SQL also backfills `siteId` from `payloadJson::jsonb ->> 'siteId'` where it is a UUID. Witness: the column, its index, a
backfilled row.

#### `20261004138500_retail_licence_reminder` (ADM-08) · witness `lib/retail/licence-reminder-migration.test.ts`

```prisma
model RetailShopProfile {
  // … existing fields …
  /// The licence expiry date the 60-day reminder was sent for. A new expiry date sends a new reminder.
  licenceReminderSentFor DateTime? @db.Date
}
```

(If SET-01 already added a marker for its reminder, this unit uses that column and drops this migration.)

#### `20261004138600_support_act_as_owner` (ADM-10) · witness `lib/platform/support-act-as-owner-migration.test.ts`

```prisma
model SupportAccessRequest {
  // … existing fields …
  /// The owner asked for their yes.
  ownerUserId     String?
  /// SHA-256 of the link in the owner's WhatsApp message. Spent on answer.
  answerTokenHash String?   @unique
  answeredAt      DateTime?
}

model SupportSession {
  // … existing fields …
  /// The platform superuser acting, by id and first name ("Nyasha").
  actorUserId    String?
  actorName      String?
  /// The owner they act as.
  actingAsUserId String?
}

model SessionHandoff {
  // … existing fields …
  /// A support session this ticket opens: the session it makes carries the support claims and ends with it.
  supportSessionId String?
}
```

Witness: the six columns, the unique index on `answerTokenHash`.

### 3.4 Audit events added (`lib/retail/audit.ts` `RETAIL_AUDIT_EVENTS`; `lib/retail/audit.test.ts` updated)

| Constant | Event type | Entity | Payload (never a PIN, token or password) | Unit |
|---|---|---|---|---|
| `personInvited` | `RETAIL_PERSON.INVITED` | `User` | `{ name, role, sites: string[], pin: boolean, email: boolean, again?: true }` | ADM-02 |
| `personJoined` | `RETAIL_PERSON.JOINED` | `User` | `{ how: "link" \| "pin" \| "sign-in" }` | ADM-02 |
| `personChanged` | `RETAIL_PERSON.CHANGED` | `User` | `{ changes: [{ field, label, from, to }] }` | ADM-02 |
| `personPinSent` | `RETAIL_PERSON.PIN_SENT` | `User` | `{ wasLocked: boolean, sent: boolean }` | ADM-02 |
| `personAccessRemoved` | `RETAIL_PERSON.ACCESS_REMOVED` | `User` | `{ closedShifts: string[] }` | ADM-02 |
| `personAccessRestored` | `RETAIL_PERSON.ACCESS_RESTORED` | `User` | `{ pin: boolean }` | ADM-02 |
| `pinChosen` | `RETAIL_PERSON.PIN_CHOSEN` | `User` | `{}` | ADM-03 |
| `pinLocked` | `RETAIL_PIN.LOCKED` | `User` | `{ registerName, source }` | ADM-03 |
| `overrideApproved` | `RETAIL_OVERRIDE.APPROVED` | the record the act made | `{ act, reference, amount, limit, askedBy: { id, name } }` | ADM-06 |
| `priceApprovalAsked` | `RETAIL_PRICE_APPROVAL.ASKED` | `RetailPriceApproval` | `{ list, lines: [{ product, from, to, reason }] }` | ADM-05 |
| `priceApprovalDecided` | `RETAIL_PRICE_APPROVAL.APPROVED` / `.TURNED_DOWN` / `.WITHDRAWN` | `RetailPriceApproval` | `{ list, lines: n, note }` | ADM-05 |
| `recordPurged` | `RETAIL_RECORD.PURGED` | the record | `{ kind, name, how: "deleted" \| "kept", automatic: boolean }` | ADM-07 |
| `licenceReminded` | `RETAIL_LICENCE.REMINDED` | `RetailShopProfile` | `{ licenceNumber, expiresOn }` | ADM-08 |
| `supportPlanChanged` | `RETAIL_SUPPORT.PLAN_CHANGED` | `Company` | `{ changes: [{ field, label, from, to }] }` | ADM-09 |
| `supportAccessAsked` | `RETAIL_SUPPORT.ACCESS_ASKED` | `SupportAccessRequest` | `{ reason }` | ADM-10 |
| `supportAccessAnswered` | `RETAIL_SUPPORT.ACCESS_ANSWERED` | `SupportAccessRequest` | `{ answer: "yes" \| "no" }` | ADM-10 |
| `supportSessionStarted` / `Ended` | `RETAIL_SUPPORT.SESSION_STARTED` / `.SESSION_ENDED` | `SupportSession` | `{ until }` / `{ how: "ended" \| "expired" }` | ADM-10 |

`writeRetailAuditEvent` (ADM-06) adds to every payload, from the open request (`lib/activity/context.ts` gains `host`,
`userAgent`, `mobile` (the `Sec-CH-UA-Mobile` header or a phone user agent), and the session's `supportSessionId`,
`supportActorName`, `deviceRegisterId`/`deviceRegisterName` from SET-04's device): `source` (`SUPPORT` during a support
session; `TILL` for a till-pin session or a request with a paired device; `PHONE` for a phone browser; `ADMIN` otherwise;
`SYSTEM` when there is no request), `registerName` (TILL), `siteId` when the caller passes one or the device's till has
one, and `support: { name, email }` during a support session (then `actorName` is "Nyasha (Corelith support)"). It copies
`siteId` to the new column. Callers may pass `source`, `siteId` explicitly (the worker passes `SYSTEM`).

### 3.5 Notifications added

| Type | To | Title | Summary | View path | Severity |
|---|---|---|---|---|---|
| `RETAIL_PRICE_APPROVAL` | the owner approver (else every owner) | "Price changes wait for you" | "Tafara Nyathi changed 2 prices on Retail. Castle Lager 340ml US$1.20 → US$0.80, under its cost of US$0.86." | `/retail/manage/approvals?sheet=price-approval&id=<id>` | WARNING |
| `RETAIL_PRICE_DECIDED` | the asker | "Your price changes were approved" / "… were turned down" | "Tendai Mhlanga approved 2 prices on Retail." / "Tendai Mhlanga turned down 2 prices on Retail. <note>" | `/retail/products/price-lists/<listId>` | INFO |
| `RETAIL_PIN_LOCKED` | owners and managers who see the person's sites | "Farai Moyo’s PIN is locked" | "Five wrong tries at Back till, 08:12. Send a new PIN from People." | `/retail/manage/people?sheet=person&id=<id>` | WARNING |
| `RETAIL_SUPPORT` | every owner | "Corelith support changed your shop" / "Corelith support asks to open your admin" / "Corelith support is in your admin" | "Nyasha: Cases and singles on. Why: Owner asked on WhatsApp to switch on cases and singles." / "Nyasha asks for 30 minutes as you, to: <reason>." / "Until 14:35. Everything they do is in Activity." | `/retail/manage/activity?kind=support` / `/support/answer/<token>` / `/retail/manage/activity?kind=support` | INFO |

`notifyApprover` (ADM-04, `lib/retail/approvals/notify.ts`) is the one way any area asks for an approval:
`notifyApprover({ companyId, level: "owner" | "manager", siteId?, type, title, summary, entityType, entityId, viewPath })`
→ recipients: level owner → `ownerApproverId` if active, else every active owner; level manager → every active owner and
every active manager who sees `siteId`; always an in-app notification (`emitRetailNotification`); and when `askBy` is
`WHATSAPP_AND_APP`, a WhatsApp message to each recipient with a phone through SET-07's outbox, template `approval-ask`:
"<title>. <summary> Open it: <absolute view url>". BUY-04, STK-06, CUS-07 and ADM-05 call it.

### 3.6 Seed and demo data

Extend `scripts/seed-retail-demo.ts` (run `pnpm tsx scripts/seed-retail-demo.ts --slug hurudza-creative --days 160
--reset`). One function per unit, called from `main()` after the other areas' seeds (people first, before anything that
names a person); idempotent by natural key (email, phone, reference). Times "today hh:mm" are clamped to one minute before
the run when the run is earlier in the day. Every person signs in with `RetailDemo123!` when they have an email.

**ADM-02 `seedPeople()`** — the board's people, and the two with no access. `STAFF` changes: Kuda Banda and Rudo Moyo
join; Tendai Sibanda loses access (the stock clerk test account becomes `rudo.stock@bottlestore.test`).

| Name | Email | Role | Sites | Phone | State |
|---|---|---|---|---|---|
| Tendai Mhlanga | `owner@bottlestore.test` (exists) | `SUPERADMIN` | All sites | +263 77 412 0098 | Active |
| Tafara Nyathi | `tafara.manager@bottlestore.test` | `MANAGER` | Harare Main Branch | +263 77 301 2290 | Active |
| Chipo Dube | `chipo.till@bottlestore.test` | `CASHIER` | Harare Main Branch | +263 71 220 4410 | Active |
| Kuda Banda | `kuda.till@bottlestore.test` (new) | `CASHIER` | Harare Main Branch | +263 78 551 0921 | Active |
| Rudo Moyo | `rudo.stock@bottlestore.test` (new) | `STOCK_CLERK` | All sites | +263 77 118 2044 | Active |
| Farai Moyo | `farai.till@bottlestore.test` | `CASHIER` | Borrowdale | +263 71 902 7713 | Active, PIN locked |
| Ruvimbo Chari | `ruvimbo@charibooks.co.zw` (no password) | `FINANCE_OFFICER` | All sites | +263 77 551 0283 | Invited 2 days before the run, 10:00, by Tendai Mhlanga; invite expires 5 days after the run |
| Tendai Sibanda | `tendai.stock@bottlestore.test` | `STOCK_CLERK` | All sites | +263 77 640 1187 | No access since 3 days before the run, by Tendai Mhlanga |
| Rufaro Ndlovu | `rufaro.manager@bottlestore.test` | `MANAGER` | Harare Main Branch | +263 71 330 5521 | No access since 19 days before the run (the setup and insights specs name him) |

Sites `HRE` "Harare Main Branch" and `BDL` "Borrowdale" come from SET-02; if they are absent the function creates `BDL`
and renames `MAIN` as SET-02 does. Each person gets their `RETAIL_PERSON.INVITED` event at their `createdAt` (Tendai
Mhlanga's is skipped) and the two removals their `RETAIL_PERSON.ACCESS_REMOVED`.

**ADM-03 `seedPins()`** — PINs testers can type (documented in the seed's header; never obvious): Tendai Mhlanga 1357,
Tafara Nyathi 2468, Chipo Dube 1928, Kuda Banda 3746, Rudo Moyo 5091, Farai Moyo 6024; `mustChange` false (as if chosen).
`lastUnlockedAt`: Chipo 4 minutes and Kuda 6 minutes before the run ("Selling now"), Rudo today 10:40, Tafara today 12:31,
Farai yesterday 21:40; Farai `failedAttempts` 5, `lockedAt` today 08:12 and a `RETAIL_PIN.LOCKED` event then (source TILL,
Back till). Ruvimbo has no PIN.

**ADM-04 `seedApprovals()`** — `RetailApprovalSettings` with the board's values (500.00, owner approver Tendai Mhlanga,
MANAGERS, below cost on, 50.00, OWNER_OVER_LIMIT, 100.00, 250.00, WHATSAPP_AND_APP), `updatedById` Tendai Mhlanga,
`updatedAt` the latest 1 September before the run, and one `RETAIL_SETTINGS.CHANGED { page: "approvals" }` at that time
("Last changed by Tendai Mhlanga, 1 September."). "Waiting now" fills itself from BUY-04's REQ-0014 (US$1,940.00 for Afdis,
asked 3 hours before the run) and STK-06's CNT-0020 (To approve, submitted today 10:40); nothing is seeded here for them.

**ADM-05** — nothing (no price change is waiting on the board).

**ADM-06 `seedActivity()`** — the board's six rows exist as real events (written only when an equivalent event is absent,
each through `writeRetailAuditEvent` with the board's time and source):

| When | Event | Actor | Entity | Payload | Source |
|---|---|---|---|---|---|
| today 12:31 | `RETAIL_OVERRIDE.APPROVED` | Tafara Nyathi | FLR-02's seeded refund RFD-0045 (`RetailSale`) | act refund, amount 42.00, limit 20.00, askedBy Chipo Dube | TILL, Front till |
| today 12:20 | `RETAIL_PRICE.SCHEDULED` | Tendai Mhlanga | Product CASTLE-340 | list Retail, from 1.20, to 1.25, effective tonight 22:00 — written by PRD-07's scheduling service, which also creates the `ProductPriceChange` (so it really changes tonight) | ADMIN |
| today 10:41 | `RETAIL_STOCK_COUNT.SUBMITTED` | Rudo Moyo | CNT-0020 (STK-05/06 seed) | lines 38, differ 3 | PHONE |
| today 09:02 | `RETAIL_RECORD.BINNED` | Tendai Mhlanga | Nederburg Rosé 750ml (ADM-07 seed) | kind product | ADMIN |
| yesterday 21:58 | `RETAIL_SHIFT.CLOSED` | Chipo Dube | SH-00239 (FLR seed, short −20.00) | variance −20.00 | TILL, Front till |
| the latest 2 October, 08:15 | `RETAIL_SETTINGS.CHANGED` | Tendai Mhlanga | `RetailSettings`/company | changes [Empties and deposits off → on] (FND's "Last changed by Tendai Mhlanga, 2 October." event, at 08:15) | ADMIN |

If the owning seed has not created the entity (RFD-0045, CNT-0020, SH-00239), that row is skipped with a printed warning.
The tab counts are whatever the chain holds (the board's 1,204 is sample).

**ADM-07 `seedBin()`** — through each kind's own `move` service, as the people named, at the board's offsets from the run
(the board's "today" is 3 October): Nederburg Rosé 750ml (`NEDERBURG-ROSE-750`, Wine, US$12.60, created by PRD-03's
service if absent) binned today 09:02 by Tendai Mhlanga; PO-0029, a draft order to Delta Beverages (BUY-02's service, two
lines) binned 13 days before by Tafara Nyathi; "Happy hour (old)", a paused price list (PRD-05) binned 24 days before by
Tendai Mhlanga. T. Marange is **not** merged (the customers seed keeps the merge for its demo), so the bin shows three rows
until someone merges him.

**ADM-08 `seedLicence()`** — `licenceNumber` HRE/BL/2024/0711 and expiry 31 December 2026 (SET-01's seed); no reminder
is due yet (it falls on 1 November 2026).

**ADM-09/ADM-10 `seedSupport()`** (run only with `--support`, because it needs the platform company) — platform
superusers Nyasha (`nyasha@corelith.test`) and Tawanda (`tawanda@corelith.test`) in `ADMIN_PORTAL_COMPANY_ID`'s company,
both added to `ADMIN_PORTAL_ALLOWED_EMAILS` in `.env.example` and the preview's environment; two support events on the
tenant's chain: 14 March 10:20 Tawanda `RETAIL_SETTINGS.CHANGED { page: "fiscal" }` labelled "Fiscal device registered"
(reason "Registered the FDMS device for the owner.") and the latest 2 October 07:55 Nyasha `RETAIL_SETTINGS.CHANGED {
page: "company" }` "Empties and deposits on" (reason "Owner asked on WhatsApp to switch on empties.").

---
## 4. API

Conventions as foundations section 4. Shapes are TypeScript; money as strings with two decimals in requests, numbers to two
places in responses (`successResponse`); dates ISO. "Role rule" refusals are 403 with the sentence shown.

### 4.1 People (ADM-02, ADM-03)

```ts
type PersonRole = "OWNER" | "MANAGER" | "CASHIER" | "STOCK_CLERK" | "BOOKKEEPER";
// OWNER↔SUPERADMIN, MANAGER↔MANAGER|SHOP_MANAGER, CASHIER, STOCK_CLERK, BOOKKEEPER↔FINANCE_OFFICER (lib/retail/people/roles.ts)

type PersonState = "ACTIVE" | "PIN_LOCKED" | "INVITED" | "INVITE_EXPIRED" | "NO_ACCESS";

type PersonView = {
  id: string;
  name: string;
  phone: string | null;            // E.164
  phoneDisplay: string;            // "+263 71 902 7713"
  email: string | null;
  role: PersonRole;
  roleLabel: string;               // "Cashier"
  sites: { all: true } | { all: false; ids: string[]; names: string[] };
  sitesLabel: string;              // "All sites" | "Borrowdale" | "Harare Main Branch, Borrowdale"
  state: PersonState;
  pin: {
    state: "NONE" | "SET" | "NEW" | "LOCKED";   // NEW = issued, not yet changed by them
    lockedAt: string | null;
    lastUsedAt: string | null;
    text: string;                  // "Locked today at 08:12 after 5 wrong tries" | "Set. Last used today at 07:58." | "Sent 2 Oct. Not used yet." | "No PIN yet."
  };
  invite: { sentAt: string; expiresAt: string; acceptedAt: string | null } | null;
  accessRemoved: { at: string; byName: string } | null;
  lastSeenAt: string | null;
  lastIn: string;                  // "Now" | "Selling now" | "Today 12:31" | "Yesterday" | "28 Sep" | "Invited 2 Oct" | "Never"
  sub: string;                     // "Cashier · Borrowdale · PIN locked after 5 tries"
  can: {
    edit: boolean; roles: PersonRole[]; sendPin: boolean;
    removeAccess: boolean; giveAccessBack: boolean; inviteAgain: boolean;
  };
};

type HandOver = { link: string | null; pin: string | null };   // only when WhatsApp could not send
type Sent = { whatsapp: boolean; error?: string };              // error: "WhatsApp is not set up" | the provider's sentence
```

| Method | Path | Permission | Body / query | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/v2/reports/retail-people` | `retail.people:view` | list query (FND 4.1): `tab` active \| invited \| no-access \| all, `q`, `role`, `site`, `sort`, `group`, `page`, `size` | `ListPageResponse` with rows of section 5.1 | 403 |
| GET | `/api/v2/retail/people/[id]` | `retail.people:view` | — | `{ data: PersonView }` | 404 "That person is not in this shop." |
| POST | `/api/v2/retail/people` | `retail.people:create` + role rule | `{ name: string; phone: string; email?: string \| null; role: PersonRole; sites: "ALL" \| string[]; givePin: boolean; pin?: string }` (`pin` only from SET-12's onboarding, a typed PIN checked by `tillPinDenial`) | 201 `{ data: PersonView; sent: Sent; handOver?: HandOver }` | 400 `{ error: "Validation failed", fieldErrors }` (W-57 sentences); 403 "Managers add cashiers and stock clerks only." |
| PATCH | `/api/v2/retail/people/[id]` | `retail.people:update` + role rule | `{ name?; phone?; role?; sites?; sendNewPin?: boolean }` | `{ data: PersonView; changed: Array<{ field; from; to }>; sent?: Sent; handOver?: HandOver }` | 400 fieldErrors; 403 "Managers change cashiers and stock clerks only."; 404; 409 "Ask another owner to change your role." / "Tendai Mhlanga is the only owner. Make someone else an owner first." / "Farai Moyo has no access. Give access back first." |
| POST | `/api/v2/retail/people/[id]/remove-access` | `retail.people:delete` | `{}` | `{ data: PersonView; closedShifts: string[] }` | 404; 409 "You cannot remove your own access." / the only-owner sentence / "Farai Moyo has no access already." |
| POST | `/api/v2/retail/people/[id]/give-access-back` | `retail.people:delete` | `{ sendNewPin: boolean }` | `{ data; sent?; handOver? }` | 404; 409 "Tendai Sibanda has access already." |
| POST | `/api/v2/retail/people/[id]/invite-again` | `retail.people:update` + role rule | `{}` | `{ data; sent: Sent; handOver?: HandOver }` | 404; 409 "Ruvimbo Chari has joined already." / "Tendai Sibanda has no access. Give access back first." |
| POST | `/api/v2/retail/people/pins` | `retail.people:update` | `{ ids: uuid[] }` (1–100) | `{ sent: string[]; skipped: Array<{ id; name; why }>; handOver: Array<{ name; pin }> }` — `why`: "Managers change cashiers and stock clerks only." / "No access." / "No phone." | 400 |
| POST | `/api/v2/retail/people/message` | `retail.people:update` | `{ ids: uuid[]; message: string }` (1–500 characters, "Write a message.") | `{ sent: number; whatsapp: number }` | 400 |
| POST | `/api/v2/retail/people/remove-access` | `retail.people:delete` | `{ ids: uuid[] }` | `{ removed: string[]; skipped: Array<{ id; name; why }>; closedShifts: string[] }` | 400 |
| GET | `/api/v2/retail/roles` | `retail.people:view` | — | `RolesView` (below) | 403 |
| GET | `/api/v2/retail/lookup/person` | the context's need: `retail.people:view`, or for pickers `retail.sell:view` / `retail.counts:create` / `retail.adjustments:create` | `?q=&limit=8&context={"roles":["OWNER"]}` or `{"can":"retail.adjustments:approve"}` or `{"sells":true,"siteId":"…"}` | `{ options: Array<{ id; label: name; sub: roleLabel }>; more }` — active people (invited included), never no-access | 403; 404 |
| POST | `/api/v2/retail/lookup/person` | `retail.people:create` + role rule | `{ fields: { "Name": string; "Phone or WhatsApp": string }, context: { role?: PersonRole; siteId?: string } }` → `invitePerson` with role `context.role` (default CASHIER), sites `[context.siteId]` or ALL, a PIN for Manager, Cashier and Stock clerk | 201 `{ option: { id, label, sub } }` (the WhatsApp goes as in W-57; a failed send is reported in a toast "Kuda Banda is added. WhatsApp is not set up, so give them their link from People.") | 400 `fieldErrors` keyed "Name", "Phone or WhatsApp" |
| GET | `/api/public/retail/join/[token]` | none (the token is the capability) | — | `{ data: { shop: string; name: string; roleLabel: string; sitesLabel: string; invitedBy: string; email: string \| null; needsPassword: boolean } }` | 404 "This link is not valid any more." (unknown, expired, used, withdrawn — not told apart) |
| POST | `/api/public/retail/join/[token]` | none | `{ password?: string }` | `{ data: { email: string \| null; home: string } }` | 400 `fieldErrors.password` "Choose a password of 8 characters or more."; 404 as above; 429 after 10 attempts per token per hour |
| GET | `/api/v2/retail/pos/pin` (changed) | the till session | — | `{ data: { hasPin: boolean; mustChange: boolean; locked: boolean; lastUnlockedAt: string \| null } }` | 401 |
| POST | `/api/v2/retail/pos/pin/change` (new; replaces `POST`/`DELETE /pos/pin`) | the till session, own PIN | `{ currentPin?: string; newPin: string }` — `currentPin` not asked when the session was opened by an issued PIN that must change (claim `pinMustChange`) | `{ data: { mustChange: false } }` | 400 `fieldErrors.newPin` (`tillPinDenial`, or "Pick a PIN that is not the one you were sent."); 400 `fieldErrors.currentPin` "That PIN is not right."; 423 "Too many tries. Ask a manager to send you a new PIN." |
| POST | `/api/v2/retail/pos/pin/unlock` (changed) | the till session | as today | as today | 423 (was 429) "Too many tries. Ask a manager to send you a new PIN." while `lockedAt` is set; no time-out |

```ts
type RolesView = {
  intro: string;                      // the board's lede, verbatim
  columns: Array<{ key: "SUPERUSER" | "OWNER" | "MANAGER" | "CASHIER" | "STOCK_CLERK" | "BOOKKEEPER";
                   label: string; sub: string }>;   // "Superuser" / "Corelith support", "Owner" / "SUPERADMIN" …
  sections: Array<{ title: string; rows: Array<{ label: string;
    cells: Record<string, string>;    // "CRUD" | "RU" | "" (drawn "–")
    limit: string | null;             // live sentence, e.g. "Managers approve up to US$500."
    limitHref: string | null }> }>;  // "/retail/manage/approvals" | "/retail/manage/till-rules" | null
};
```

### 4.2 Approvals (ADM-04, ADM-05)

| Method | Path | Permission | Body / query | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/v2/retail/settings/approvals` | `retail.approvals:view` | — | `{ values: ApprovalValues; canEdit: boolean; lastChanged: { by: string; at: string } \| null }` | 403 |
| PATCH | `/api/v2/retail/settings/approvals` | `retail.approvals:update` | `{ changes: Partial<ApprovalValues> }` | `{ values; lastChanged }` | 400 `fieldErrors` ("Write an amount such as 500.00.", "Pick an owner."); 403 "Your role cannot change approvals" |
| GET | `/api/v2/retail/approvals/waiting` | `retail.approvals:view` | — | `{ items: Array<{ key: string; kind: "requisition" \| "count" \| "account" \| "prices"; text: string; href: string; since: string }>; more: number }` — oldest first, at most 5 | 403 |
| GET | `/api/v2/retail/price-approvals/[id]` | `retail.prices:view` (the asker, or anyone with `retail.prices:approve`) | — | `{ data: { id; list: { id; name }; askedBy: { id; name }; askedAt; status; effectiveAt; lines: Array<{ productId; name; code; from: number; to: number; cost: number \| null; reason: "OWNER_APPROVES" \| "BELOW_COST"; marginAfter: number \| null }>; can: { decide: boolean; withdraw: boolean } } }` | 404 |
| POST | `/api/v2/retail/price-approvals/[id]/approve` | `retail.prices:approve` | `{}` | `{ data; applied: number }` | 409 "This was decided already."; 409 per PRD-03 refusals passed through |
| POST | `/api/v2/retail/price-approvals/[id]/turn-down` | `retail.prices:approve` | `{ note?: string }` (≤300) | `{ data }` | 409 "This was decided already." |
| POST | `/api/v2/retail/price-approvals/[id]/withdraw` | the asker | `{}` | `{ data }` | 403 "Only Tafara Nyathi can withdraw this."; 409 |

```ts
type ApprovalValues = {
  requisitionOwnerOver: string;      // "500.00"
  ownerApproverId: string | null;    // a person; shown by name
  priceChanges: "Managers, no approval" | "Owner approves";
  belowCostNeedsOwner: boolean;
  adjustmentPinOver: string;         // "50.00"
  countDifferences: "Any manager" | "Owner approves over US$100";   // label built from countOwnerOver
  accountOwnerOver: string;          // "250.00"
  askBy: "The app only" | "WhatsApp and the app";
};
```

`lib/retail/approvals/limits.ts`:

```ts
export type ApprovalLimits = {
  requisitionOwnerOver: Prisma.Decimal;
  ownerApproverId: string | null;
  ownerApprover: { id: string; name: string; phone: string | null } | null;   // resolved, else the first active owner
  priceChanges: "MANAGERS" | "OWNER";
  belowCostNeedsOwner: boolean;
  adjustmentPinOver: Prisma.Decimal;
  countDifferences: "ANY_MANAGER" | "OWNER_OVER_LIMIT";
  countOwnerOver: Prisma.Decimal;
  accountOwnerOver: Prisma.Decimal;
  askBy: "APP" | "WHATSAPP_AND_APP";
};
export function getApprovalLimits(companyId: string, client?: Prisma.TransactionClient): Promise<ApprovalLimits>;
// No row = the defaults of the model. BUY-04, STK-04, STK-06, CUS-07, ADM-05 and the Roles sheet read it.
```

`lib/retail/approvals/waiting.ts`: `registerWaitingProvider({ kind, requires: [resource, action], list(ctx) })`;
providers return `{ key, text, href, since }`. Registered by: BUY-04 (requisitions `ASKED`: "REQ-0014, US$1,940.00, for
Afdis. 3 hours." → the requisition), STK-06 (counts To approve: "CNT-0020, −US$65.50 count difference. 1 hour." → the
review page), CUS-07 (accounts waiting: "Chikore Weddings, a US$500.00 limit. 2 hours." → the account sheet), ADM-05
(price approvals: "Prices on Retail, 2 products, from Tafara Nyathi. 20 minutes." → the sheet). The age is "<n> minutes",
"1 hour", "<n> hours", "1 day", "<n> days" since `since`. Only providers whose `requires` the caller holds run.

`lib/retail/approvals/prices.ts`: `priceChangeNeedsOwner(ctx, lines) → { apply: Line[]; wait: Line[] }` and
`askPriceApproval(tx, ctx, list, wait, effectiveAt)`; PRD-03's `changePrices` calls both (ADM-05 adds the two calls).

### 4.3 Roles and sessions (ADM-01, ADM-02)

No endpoint. `lib/retail/permissions.ts` exports `canRetailRoleDo`, `canRetailSessionDo`, `requireRetailPermission`,
`retailPermissionDenial`, `canSeeRetailCostPrice` (unchanged meaning), `retailRoleKey(session)` (`CORELITH_SUPPORT` during
a support session, else the user's role). `lib/auth-core/session-claims.ts` `enrichTokenClaims` re-reads the user's `role`
and `isActive` on each request and carries `supportSessionId`/`supportActorName` from the token.

### 4.4 Activity (ADM-06)

| Method | Path | Permission | Query | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/v2/reports/retail-activity` | `retail.activity:view` | list query: `tab` everything \| overrides \| prices \| settings, `q`, `who` (person id, `support`, `automatic` or `any`), `kind` (section 5.9.2), `when` (period, default `30d`), `where` (`any`, `admin`, `phone`, `support`, `automatic`, or a till id), `site`, `entity` (`<EntityType>:<id>`, parent filter), `sort` newest \| oldest, `group` none \| day \| who \| what \| where, `page`, `size` | `ListPageResponse` — rows `{ id, when, who, what: { label, tone }, record: { label, mono, href \| null }, change, where }`; `tabs` counts over the whole chain the caller may see; `totals.count` | 403 |
| POST | `/api/v2/reports/retail-activity/export` | `retail.activity:view` | FND 4.2 | the file | FND |

The loader implements `page(ctx, query)` (database-side): `where` = `companyId` and (`eventType` starts with `RETAIL_`
**and** is not an `auth.*` event) or (`payloadJson` starts with `{"module":"retail"`) — the explicit retail events and
the generic activity rows of `/api/v2/retail/**`; tab, kind, who, where, site, period and search as filters; managers
limited to sites add `OR(siteId in theirs, actor = them)`. Ordered by `createdAt` then `id`; `count()` for `total`; tab
counts by four `count()`s. Search `q` matches `payloadJson`, `reason`, `entityType` (case-insensitive) and the actor's name
(resolved to ids first).

### 4.5 Bin (ADM-07)

| Method | Path | Permission | Body / query | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/v2/reports/retail-bin` | `retail.bin:view` | list query: `q`, `kind` (`any` or a registered kind), `sort` gone-soonest \| binned-newest \| name, `page`, `size` | `ListPageResponse` — rows `{ id: "<kind>:<id>", kind, what, kindLabel, binnedBy, binnedAt, goneOn, restoreHref, openHref }`; `totals.count` | 403 |
| POST | `/api/v2/retail/bin/restore` | FND-06 (`retail.bin:update`) | `{ kind, id }` | `{ restored: true }` | FND (404, 410) |
| POST | `/api/v2/retail/bin/restore-many` | `retail.bin:update` | `{ items: Array<{ kind; id }> }` (1–100) | `{ restored: number; refused: Array<{ kind; id; name; why }> }` | 400 |
| POST | `/api/v2/retail/bin/delete` | `retail.bin:delete` | `{ items: Array<{ kind; id }> }` (1–100) | `{ deleted: number; kept: number }` (kept = held for history, gone from the bin either way) | 403 "Your role cannot delete the bin"; 404 per item is skipped |

`lib/retail/bin.ts` registry entry (FND-06's, extended): `{ kind, label, labelFor?(row), deleteRight, viewRight,
move(tx, ctx, id), restore(tx, ctx, id), purge(tx, ctx, id): Promise<"deleted" | "kept">, listBinned(ctx, since): Promise<Array<{ id; name; binnedAt }>>, href(id) }`.
Kinds registered by their areas: `product`, `category`, `promotion`, `bundle`, `price-list` (PRD), `customer` (CUS, label
"Customer, merged" when merged), `order` (BUY, label "Order, draft"), `bill` (BUY), and any later kind.
`purgeExpiredBin(now)` runs in `scripts/retail-worker.ts` (SET-01) daily at 02:00 Africa/Harare.

### 4.6 Shop-type features (ADM-08)

No new endpoint. The till keeps reading the profile through its context (`GET /api/v2/retail/pos/context`, or SET-04's
`GET /api/v2/retail/devices/me`) and computes with `shopFeatures()` and `isWithinLicenceHours()`; the server keeps
refusing in `pos/sales`. The case prompt calls STK-04's `POST /api/v2/retail/stock/case-breaks`. The reminder is the worker
job `remindLicenceExpiry(now)` (daily 07:00 Africa/Harare). FLR-08's Overview "Needs action" registers the item "Liquor
licence runs out on 31 December 2026" → `/retail/manage/company` while `licenceExpiresOn` is within 60 days or past.

### 4.7 Support (ADM-09, ADM-10)

Admin host, `requirePlatformAdminAccess` (superuser on the admin host):

| Method | Path | Body | Response | Errors |
|---|---|---|---|---|
| GET | `/api/platform-admin/companies/[companyId]/shop` | — | `{ company: { id; name; slug; productLabel: "Retail"; planName: "Grow"; sites: number }; values: { businessType: "General retail" \| "Liquor store"; ageCheck; licenceHours; emptiesAndDeposits; casesAndSingles; plan: "Start" \| "Grow" \| "Scale"; fiscalReceipts; postingToTheBooks; salesAndCrm }; owner: { id; name; firstName; hasPhone } \| null; access: AccessState; lastSupportChanges: Array<{ at; by; text }>; signedInAs: { firstName } }` | 404 "That company does not exist." |
| PATCH | `/api/platform-admin/companies/[companyId]/shop` | `{ changes: Partial<values>; reason: string }` | `{ values; lastSupportChanges }` | 400 `fieldErrors.reason` "Say why. The owner reads it in Activity."; 400 a Soon type "Pharmacy is not ready yet."; 409 a plan the usage does not fit (SET-10's sentence) |
| POST | `/api/platform-admin/companies/[companyId]/support-access` | `{ reason: string }` (5–500) | `{ access: AccessState }` | 400 `fieldErrors.reason` "Say why, so Tendai knows."; 409 "Tendai Mhlanga has no WhatsApp number. Ask them another way." (no phone); 409 "You are in their admin already." |
| POST | `/api/platform-admin/companies/[companyId]/support-access/open` | `{}` | `{ url: string }` (the tenant host's `/support/enter?token=…`, valid 2 minutes) | 409 "Tendai has not said yes." / "That yes has run out. Ask again." (a yes is good for 30 minutes) |
| POST | `/api/platform-admin/companies/[companyId]/support-access/end` | `{}` | `{ access }` | 409 "Nothing to end." |

```ts
type AccessState =
  | { state: "none" }
  | { state: "asked"; askedAt: string }
  | { state: "yes"; answeredAt: string; usableUntil: string }
  | { state: "no"; answeredAt: string }
  | { state: "in"; until: string };
```

Tenant host:

| Method | Path | Permission | Body | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/v2/retail/support-access/answer?token=` | signed in as the owner asked | — | `{ data: { askerFirstName; reason; askedAt; state: "asked" \| "answered" \| "expired" } }` | 403 "This was sent to Tendai Mhlanga." (another user); 404 |
| POST | `/api/v2/retail/support-access/answer` | the owner asked | `{ token; answer: "yes" \| "no" }` | `{ data: { state } }` | 409 "You answered already." / "This has run out." (an ask is good for 24 hours) |
| POST | `/api/v2/retail/support-access/end` | the support session itself, or any owner | `{}` | `{ ended: true }` | 409 "Nothing to end." |
| NextAuth | `signIn("handoff", { token })` (extended) | — | — | a session as the owner with `supportSessionId`, `supportActorName`, `authExpiresAt` = the session's end | the handoff's own refusals |

Every request in a support session re-checks the `SupportSession` is `ACTIVE` and not past `expiresAt` (in
`enrichTokenClaims`); otherwise the session ends and the browser lands on `/login`. `expireSupportSessions` runs every
minute in the retail worker.

---
## 5. UI per page

Every page sits in the FND-03 shell with the **Management** module (gear at the bottom of the rail) and its panel:
Company, Sites, Tills and devices, Payments, Till rules, Receipts, Fiscal device, Posting to the books, **People**,
**Approvals**, Loyalty, **Activity**, **Bin**, Plan and billing (FND 5.3.4; items the role may not see are not drawn).
Lists are ListFrame sources (FND-05), sheets are SheetForm kinds (FND-07) in `lib/retail/sheet-kinds/admin.ts`, the
settings page is a SettingsFrame page (FND-08). Only what differs from the frames is written below.

### 5.1 People — `/retail/manage/people` · board `PeopleList.png` · source `retail-people` (ADM-02)

**Header** (48px): title "People"; sub link "Who can do what" (**Defined here**: the nav tree puts the "Who can do what"
sheet under People and the list template's `subLink` is its door; opens `?sheet=roles`); primary "+ Invite someone"
(plus icon) → `?sheet=person-new`, drawn for roles with `retail.people:create`. No back link.

**Tabs** (own row, 48px, with counts in mono pills): "Active" · "Invited" · "No access" · "All". Board: Active 6, Invited 1,
No access 2, All 9. Conditions: Active = `isActive` and not waiting on an invite (state ACTIVE or PIN_LOCKED); Invited =
`isActive` with an invite not accepted (INVITED or INVITE_EXPIRED); No access = not `isActive`; All = everyone. Default tab
Active.

**Toolbar** (row below the tabs): search "Name or phone" (matches name, the phone's digits — "0283" finds Ruvimbo — and
email); chip "Role" (Any · Owner · Manager · Cashier · Stock clerk · Bookkeeper); chip "Site" (All sites · each open site by
name, e.g. Harare Main Branch · Borrowdale; a person matches a site when they work at all sites or at that one); "Filters"
(holds Role and Site again at narrow widths; no further filters, so its badge shows only when Role or Site is set); the
count pill (rows matching, "7"); sort "Name A–Z" (options **Defined here**: Name A–Z · Name Z–A · Last in, newest · Role);
"Group" (None · Role · State); "Columns"; "Export ⌄" (W-55: "The 7 people the filters show").

**Columns** (grid `40px minmax(170px,1.2fr) 130px 160px 150px 110px 140px 120px 44px`, min width 1100px):

| Column | Kind | Align | Value |
|---|---|---|---|
| (tick) | checkbox | — | selection |
| Name | link (600) | left | the person's name → `?sheet=person&id=<id>` |
| Role | text | left | "Owner" · "Manager" · "Cashier" · "Stock clerk" · "Bookkeeper" |
| Sites | muted | left | "All sites", or site names joined by ", " ("Harare Main Branch") |
| Phone | mono | left | "+263 77 412 0098" (E.164 grouped 3·2·3·4) |
| Till PIN | text | left | "Set" · "Locked" · "Sent" (issued, not yet changed by them; **Defined here**) · faint "–" (no PIN) |
| Last in | date | left | "Now" (the viewer, or seen in the last 5 minutes) · "Selling now" (their PIN was used at a till in the last 30 minutes) · "Today 12:31" · "Yesterday" · "28 Sep" · "Invited 2 Oct" (Invited tab states) · "Never" (active, never seen) |
| State | badge | left | "Active" (ok) · "PIN locked" (warn) · "Invited" (info) · "Invite expired" (warn, **Defined here**) · "No access" (neutral, **Defined here**) |
| ⋯ | row menu | — | below |

"Last seen" is the latest of: the person's `auth.login.success` event, any audit event they are the actor of, and their PIN's
`lastUnlockedAt` (one grouped query per page each, using the `(companyId, actor, createdAt)` index).

**Totals** (pinned Σ line): "Σ 7" (the row count, mono) and nothing else.

**Row ⋯ menu** (**Defined here**; items the role may not do are not drawn): "Change" (opens the person sheet); "Send a new
PIN" (has a PIN) or "Give them a till PIN" (no PIN) — both open the person sheet with the PIN toggle on; "Send the invite
again" (Invited, Invite expired); separator; "Remove access" (`--bad`, owner, has access) → ConfirmDialog `removeaccess`;
"Give access back" (owner, No access) → the person sheet in its No access state.

**Selection bar** (FND F-2): "<n> selected · Select all <n>" then "Reset PINs" → ConfirmDialog `resetpins`; "Send a message"
→ `?sheet=people-message&ids=…`; "Remove access" (owner only) → ConfirmDialog `removeaccessmany`; "⋯" holds "Export <n>".

**States**: loading, no match ("Nobody matches. Clear the search or the filters." with "Clear"), error — FND 5.4.11. The
list is never empty (the owner is in it), so it has no empty guide. A role without `retail.people:view` never sees the nav
item; the URL answers the frame's refusal "Your role cannot view people".

**Phone** (<720px, FND 5.4.12): cards — name (600) with the state badge right; "Role · Sites" (`--ink-3`); phone (mono) left
and Last in right; ⋯ on the card. Header primary becomes the 44px plus. Totals "7 people".

### 5.2 Invite someone — `?sheet=person-new` over People · board `PersonNew.png` · kind `person-new` (ADM-02)

Width 520px. Header: title "Invite someone"; sub "Management › People".

| Section | Field | Type | Options / default | Validation and hint |
|---|---|---|---|---|
| (none) | Name | text, full | empty | required; "Write their name." |
| | Phone or WhatsApp | text, half, mono | empty, placeholder "+263 7" | required; normalised to E.164; "Write a mobile number such as +263 77 123 4567."; "<Name> already has that number." |
| | Email | text, half, **optional** | empty | hint "Only needed to sign in to this admin."; "That email does not look right."; "Someone already signs in with that email."; required for Owner and Bookkeeper: "Owners and bookkeepers sign in to the admin, so they need an email." |
| "What they can do" | Role | cards, one column, no label | "Owner" — "Everything, including money settings, approvals and the plan." · "Manager" — "Runs the shop: stock, buying, prices, shifts, staff PINs. Approves up to the limits." · "Cashier" — "The till only. Opens and closes their own shift." · "Stock clerk" — "Receives, counts and moves stock. No prices or money." · "Bookkeeper" — "Bills, payments, posting and reports. Read-only on the shop." Default Cashier (the board shows Bookkeeper picked as an example). A manager sees only Cashier and Stock clerk. | required |
| "Where" | Sites | tags | "All sites" (default); options "All sites" and each open site; picking a site removes "All sites", picking "All sites" removes the rest; placeholder "Add a site, then Enter" | at least one: "Pick at least one site."; Owner: "Owners see every site."; a site-limited manager may give only their sites |
| | Give them a till PIN | toggle | on for Manager, Cashier and Stock clerk, off for Owner and Bookkeeper; follows the role card until the toggle is touched | hint "Cashiers, managers and stock clerks need one. Sent on WhatsApp, changed on first use."; with no email and no PIN: "Give them an email or a till PIN, or they cannot get in." |

Footer: note "They get a WhatsApp message with a link. It works for 7 days."; secondary "Cancel"; primary "Send the
invite". Submit → `POST /api/v2/retail/people`. Done (sent): the sheet closes, toast "Invite sent to Ruvimbo Chari.", the
list refetches (Invited +1). Done (WhatsApp could not send): the hand-over panel (5.5.4) replaces the body.

### 5.3 A person — `?sheet=person&id=<id>` over People · board `PersonEdit.png` · kind `person` (ADM-02)

Width 520px. Header: title = the name ("Farai Moyo"); sub = `PersonView.sub`: "<Role> · <sites> · <PIN or state>" —
"Cashier · Borrowdale · PIN locked after 5 tries", "Manager · Harare Main Branch · PIN set", "Bookkeeper · All sites ·
Invited 2 Oct", "Stock clerk · All sites · No access since 1 Oct", "Owner · All sites · No till PIN".

| Section | Field | Type | Value | Notes |
|---|---|---|---|---|
| (none) | Name | text, full | the name | as invite |
| | Phone or WhatsApp | text, full, mono | "+263 71 902 7713" | as invite |
| "What they can do" | Role | cards, one column, no label | the five cards, their role chosen | a manager editing a cashier or stock clerk sees those two cards only; the person's own sheet shows the cards read-only (nobody changes their own role); a manager opening an owner, manager or bookkeeper sees the whole sheet read-only with no footer actions but Cancel |
| "Where and the PIN" | Sites | tags | "Borrowdale" | as invite |
| | Till PIN | read, tone warn when locked | `PersonView.pin.text`: "Locked today at 08:12 after 5 wrong tries" (warn) · "Set. Last used today at 07:58." · "Sent 2 Oct. Not used yet." · "No PIN yet." | — |
| | Send a new PIN on WhatsApp | toggle | on when the PIN is locked, otherwise off; reads "Give them a till PIN" when there is none | — |

Footer: danger "Remove access" (trash icon; owner only; not on their own sheet) → ConfirmDialog `removeaccess`; note
"Removing access ends any open shift first. Their sales and history stay."; secondary "Cancel"; primary "Save". Done:
"Farai Moyo saved. A new PIN is on its way." when a PIN went; "Farai Moyo saved." otherwise; the hand-over panel when
WhatsApp could not send.

States (**Defined here**, no board):
- **Invited**: the PIN field reads "Sent 2 Oct. Not used yet." or "No PIN yet."; a link-styled button under the sub, "Send
  the invite again" (`POST …/invite-again`; toast "Invite sent again to Ruvimbo Chari.").
- **No access**: every field read-only; the read field "Till PIN" says "Removed with their access on 1 October."; no danger;
  toggle "Send a new PIN on WhatsApp" (default on for Manager, Cashier, Stock clerk); primary "Give access back" (owner) →
  `POST …/give-access-back`; done "Tendai Sibanda can get in again." (+ " A new PIN is on its way.").

ConfirmDialogs (**Defined here**, in the Record `ASKS` shape):

| Key | Title | Body | Keep | Go | Fill |
|---|---|---|---|---|---|
| `removeaccess` | "Remove access for Farai Moyo?" | "They can no longer sign in or use a till PIN. An open shift of theirs is closed without a count first, for a manager to sign off. Their sales and history stay." (the shift sentence only when they have one: "SH-00244 on Back till is closed without a count first, …") | "Keep access" | "Remove access" | `--bad` |
| `removeaccessmany` | "Remove access for 2 people?" | "They can no longer sign in or use a till PIN. Their open shifts are closed without a count first. Their sales and history stay." | "Keep access" | "Remove access" | `--bad` |
| `resetpins` | "Send new PINs to 3 people?" | "Each gets a new PIN on WhatsApp and chooses their own the first time they use it. Their old PINs stop working now." | "Keep them" | "Send new PINs" | `--accent-fill` |

After `removeaccess`: toast "Farai Moyo can no longer get in." or "Farai Moyo can no longer get in. SH-00244 was closed
without a count."; the sheet closes; the row moves to No access.

### 5.4 Who can do what — `?sheet=roles` over People · board `Roles.png` (ADM-02, data ADM-01)

A read-only sheet, **1120px wide** (min(1120px, 100vw − 56px)) — **Defined here**: FND-07's sheet gains the size
`matrix` for this one kind; the board is a 1440px explainer. Header: title "Who can do what"; sub "Role review · every
record, every role". No footer actions except "Close" (secondary).

Body (padding 4 24 24):
- Lede (16/1.5, `--ink-2`, max 820px): "C adds, R sees, U changes, D removes (to the bin, or ends it). Superuser is Corelith
  support acting for the shop, always logged. Owner is the tenant’s SUPERADMIN. Limits are set in Management › Approvals."
  ("Management › Approvals" is a link to `/retail/manage/approvals` for roles that can see it.)
- One table (1px `--line` border, radius 12): head row "Record" (13, `--ink-3`) then six role columns, each a 600 name over
  a 11px `--ink-3` sub ("Superuser"/"Corelith support", "Owner"/"SUPERADMIN", "Manager"/"MANAGER, SHOP_MANAGER",
  "Cashier"/"CASHIER", "Stock clerk"/"STOCK_CLERK", "Bookkeeper"/"FINANCE_OFFICER"), then "Limits". Section rows on
  `--ground` with the title 600 ("Set up", "Products and prices", "Stock", "Buying and paying", "The floor", "Customers",
  "People and controls"); 32 record rows (40px, label 15px). Each cell shows the letters as 18px mono chips: C, R, U on
  `--tray` with `--ink`, **D filled** `--ink` with white text (the board's emphasis); an empty cell "–" in `--faint`.
  Limits: 12.5px `--ink-2`, the live sentence (section 3.1), linked to Approvals or Till rules where it names a limit.
- Data: `GET /api/v2/retail/roles`. The table is the matrix the server enforces; nothing in it is typed into the page.
- Phone: the sheet is full width; the table scrolls sideways with the Record column sticky.

### 5.5 From People's selection, and the hand-over panel (ADM-02)

#### 5.5.1 Send a message — `?sheet=people-message&ids=…` (**Defined here**, no board)

Title "Message 3 people"; sub "Management › People". One field "Message" (`area`, 4 rows, 1–500 characters, "Write a
message."). Note "They get it in the app and on WhatsApp."; primary "Send to 3"; done "Sent to 3 people." People without a
phone get the in-app message only.

#### 5.5.2 Reset PINs

ConfirmDialog `resetpins` (5.3) → `POST /api/v2/retail/people/pins`. Toast "3 new PINs sent." or, with skips, "2 new PINs
sent. Ruvimbo Chari has no PIN to reset." (**Defined here**, the first skip's reason). When WhatsApp could not send, the
hand-over panel lists the PINs.

#### 5.5.3 Remove access (bulk)

ConfirmDialog `removeaccessmany` → `POST /api/v2/retail/people/remove-access`. Toast "2 people can no longer get in." with
"1 shift was closed without a count." when one was.

#### 5.5.4 The hand-over panel (**Defined here**)

When the response carries `handOver`, the sheet does not close: its body becomes one `read` block on `--warn-soft` —
"WhatsApp is not set up, so give Ruvimbo Chari these yourself. They are not shown again." — then "Link" (mono, with a
"Copy" button) and "Till PIN" (mono, four digits spaced "4 8 2 9"); footer primary "Done". For bulk PINs, a ConfirmDialog
lists "Farai Moyo · 4 8 2 9" lines with the same sentence and "Done".

### 5.6 Join — `/join/[token]` on the shop's host (ADM-02; **Defined here**, no board)

A public page outside the shell (no rail), Tender theme, centred 420px card on `--ground`, the shop's logo tile and name on
top. Data `GET /api/public/retail/join/[token]`.
- Valid, with an email: h1 "Join Harare Bottle Store"; line "Tendai Mhlanga added you as a bookkeeper, for all sites.";
  field "Choose a password" (password, 8+ characters) with hint "You sign in to the admin with ruvimbo@charibooks.co.zw and
  this password."; primary "Join" → `POST`, then `signIn("credentials")` and the role's home (`/retail`; cashier
  `/retail/shifts`; stock clerk `/retail/stock`).
- Valid, without an email: h1 "You are in Harare Bottle Store"; line "Tendai Mhlanga added you as a cashier at Harare Main
  Branch. Use the PIN in your WhatsApp message on the till. You choose your own PIN the first time."; primary "Got it" →
  `POST {}` → "All set. You can close this page."
- Not valid: h1 "This link is not valid any more"; line "Ask whoever invited you to send it again."

### 5.7 Approvals — `/retail/manage/approvals` · board `ApprovalSettings.png` · SettingsFrame page `approvals` (ADM-04)

`lib/retail/settings-pages/approvals.ts` (FND 5.10.2): `{ title: "Approvals", sections, aside, whoCanChange: "Owners
only.", schema }`.

**Header**: title "Approvals"; the frame's outline "Activity" button → `/retail/manage/activity?entity=RetailSettings:approvals`.

**Form** (main column, max 680px):

| Section | Field | Type | Value on the board | Notes |
|---|---|---|---|---|
| "Money out" | Requisitions need the owner over | money, half (US$ box, right-aligned mono) | 500.00 | hint "Under it, any manager approves." |
| | Owner approvals go to | auto, half, noun "person" | Tendai Mhlanga | options: active owners (context `{"roles":["OWNER"]}`), sub "Owner"; inline add "Add ‘…’ as a new person" with quick fields "Name" and "Phone or WhatsApp" (placeholder "+263 7") invites an **owner** (context `{ role: "OWNER" }`; owner-only; that invite needs an email, so the quick add shows a third quick field "Email" for this context — **Defined here**) |
| "Prices" | Price changes | seg, full | "Managers, no approval" chosen | two options exactly "Managers, no approval" · "Owner approves" |
| | Below cost needs the owner | toggle row | on | hint "Any price under its cost waits for you." |
| "Stock" | Stock adjustments need a manager PIN over | money, half | 50.00 | — |
| | Count differences | seg, half | "Owner approves over US$100" chosen | options "Any manager" · "Owner approves over US$100" (the amount from `countOwnerOver`, whole dollars without ".00") |
| "Customers and asking" | Accounts need the owner over | money, half | 250.00 | hint "The limit, when opening or raising it." |
| | Ask by | seg, full | "WhatsApp and the app" chosen | options "The app only" · "WhatsApp and the app" |

Selected segments are solid ink (G1), as on every settings page.

**Save bar**: clean "Last changed by Tendai Mhlanga, 1 September." (from `lastChanged`); dirty "● <n> changes not saved ·
Discard · Save changes"; after a save "Saved just now.". Read-only (Manager, Bookkeeper): every field `read`, the bar
reads "Owners only.".

**Aside** (`--ground`, 320px):
- "Waiting now": bullets from `GET /api/v2/retail/approvals/waiting`, each a line in `--ink-2` whose reference is a link to
  the record: "REQ-0014, US$1,940.00, for Afdis. 3 hours." · "CNT-0020, −US$65.50 count difference. 1 hour." (the seeded
  count reads −US$41.20). More than five: a last line "and 3 more" (**Defined here**). None: "Nothing is waiting."
  (**Defined here**). Refetched every 60 s and after any approval.
- "Who can change this": "Owners only."

**Phone**: the aside moves under the form; the form padding is 16 (FND 5.10.1).

### 5.8 Price changes waiting — `?sheet=price-approval&id=<id>` over Approvals (ADM-05; **Defined here**, no board)

Width 760px (`wide`). Header: title "Price changes on Retail"; sub "Asked by Tafara Nyathi, today 14:02 · from tonight"
(the `effectiveAt` words when set). Body: one `lines`-style read table: "Product" (name, code under it in mono), "Now"
(money), "Asked" (money), "Cost" (money, `--ink-3`), "Margin" (pill: warn under target, bad under cost — the products
spec's margin pill), "Why" ("Owner approves" or "Under cost", muted); Σ row "2 products". A `read` line when anything is
under cost: "Castle Lager 340ml would sell under its cost of US$0.86." (warn). Footer for the owner: danger "Turn down"
(opens an inline `area` "Why, for Tafara" optional, then "Turn down"), note "The till has the new prices the moment you
approve.", secondary "Cancel", primary "Approve 2 prices". For the asker while waiting: note "Waiting for Tendai Mhlanga.",
danger "Withdraw", secondary "Close". Decided: every action gone, a `read` line "Approved by Tendai Mhlanga, today 14:20."
/ "Turned down by Tendai Mhlanga: <note>". Done toasts: "2 prices approved. The till has them now." / "Turned down. Tafara
Nyathi is told." / "Withdrawn."

### 5.9 Activity — `/retail/manage/activity` · board `ActivityList.png` · source `retail-activity` (ADM-06)

#### 5.9.1 Header, tabs, toolbar

**Header**: title "Activity"; no primary. With `?entity=` the sub reads "For <record label>" ("For Amarula Cream 750ml",
"For Company settings") and the sub link "Show everything" clears it (**Defined here**).

**Tabs**: "Everything" · "Overrides" · "Prices" · "Settings", counts in mono pills (board: 1,204 · 12 · 41 · 6; computed,
over everything the caller may see, ignoring search and filters). Conditions: Everything = every retail event;
Overrides = `RETAIL_OVERRIDE.APPROVED`; Prices = `RETAIL_PRICE.*`, `RETAIL_PRICE_LIST.*`, `RETAIL_PRICE_APPROVAL.*`;
Settings = `RETAIL_SETTINGS.CHANGED`, `RETAIL_SHOP.PROFILE_CHANGED`, `RETAIL_COMPANY.CHANGED`, `RETAIL_PAYMENTS.CHANGED`,
`RETAIL_ZIG_RATE.SET`, `RETAIL_TILL_RULES.CHANGED`, `RETAIL_RECEIPTS.CHANGED`, `RETAIL_FISCAL.CHANGED`,
`RETAIL_FISCAL.CONNECTED`, `RETAIL_POSTING.CHANGED`, `RETAIL_SUPPORT.PLAN_CHANGED`.

**Toolbar**: search "Person, record or change"; chip "Who" (Anyone · every person in the shop, including those with no
access · "Corelith support" · "Automatic"); chip "Kind" (5.9.2); "Filters" with badge "1" by default — the popover holds
"When" (Today · Yesterday · Last 7 days · **Last 30 days** (default) · This month · Last month · Any time · a range), "Where"
(Anywhere · each till by name · Admin · Phone · Corelith support · Automatic) and "Site" (All sites · each site); count pill;
sort "Newest first" (· "Oldest first"); "Group" (None · Day · Who · What · Where); "Columns"; "Export ⌄".

#### 5.9.2 Kind options (**Defined here**)

| Option | Event types |
|---|---|
| Any | all |
| Sales and refunds | `RETAIL_SALE.*`, `RETAIL_LAYBY.*`, `RETAIL_VOUCHER.REDEEMED` |
| Shifts and cash | `RETAIL_SHIFT.*`, `RETAIL_CASH.*`, `RETAIL_DRAWER.*`, `RETAIL_DAY.*` |
| Overrides | `RETAIL_OVERRIDE.*`, `RETAIL_PIN.LOCKED` |
| Products and prices | `RETAIL_PRODUCT.*`, `RETAIL_PRODUCTS.*`, `RETAIL_CATEGORY.*`, `RETAIL_PROMOTION.*`, `RETAIL_BUNDLE.*`, `RETAIL_VOUCHER.*` (not REDEEMED), `RETAIL_LABELS.*`, `RETAIL_PRICE.*`, `RETAIL_PRICE_LIST.*`, `RETAIL_PRICE_APPROVAL.*` |
| Stock | `RETAIL_STOCK.*`, `RETAIL_STOCK_COUNT.*`, `RETAIL_STOCK_TRANSFER.*`, `RETAIL_EMPTIES.*` |
| Buying | `RETAIL_SUPPLIER.*`, `RETAIL_SUPPLIER_PAYMENT.*`, `RETAIL_SUPPLIER_RETURN.*`, `RETAIL_PURCHASE_ORDER.*`, `RETAIL_GOODS.*`, `RETAIL_REQUISITION.*`, `RETAIL_BILL.*` |
| Customers | `RETAIL_CUSTOMER.*`, `RETAIL_ACCOUNT.*`, `RETAIL_POINTS.*`, `RETAIL_MESSAGES.*` |
| People | `RETAIL_PERSON.*`, `RETAIL_STAFF.*` |
| Settings | the Settings tab's types, plus `RETAIL_SITE.*`, `RETAIL_TILL.*`, `RETAIL_DEVICE.*`, `RETAIL_POSTING.*`, `RETAIL_ONBOARDING.*` |
| Bin and edits | `RETAIL_RECORD.*` |
| Support | events with `payload.support` (`?kind=support` is the owner's notification link) |
| Exports | `RETAIL_EXPORT.DOWNLOADED`, `RETAIL_REPORT_*` |

#### 5.9.3 Columns, totals, selection

Grid `40px 120px 150px minmax(170px,1.2fr) 130px minmax(180px,1.3fr) 110px 44px`, min width 1180px:

| Column | Kind | Value |
|---|---|---|
| (tick) | checkbox | selection |
| When | mono | "Today 12:31" · "Yesterday 21:58" · "2 Oct 08:15" · "28 Sep 2025 10:02" (another year) |
| Who | text | the actor's name; "Nyasha, Corelith support"; "Automatic" |
| What | badge with tone | `LIST_WORDS` (5.9.4) |
| Record | link (mono when it is a reference like "RFD-0045", "CASTLE-340", "CNT-0020", "SH-00239"; 600 otherwise: "Nederburg Rosé 750ml", "Company") | → the record; settings → the settings page; a record deleted for good → faint text, no link |
| Change | muted | the change sentence (5.9.4) |
| Where | muted | "Front till" · "Admin" · "Phone" · "Corelith support" · "Automatic" |
| ⋯ | row menu | "Open the record", "Show only this record" (sets `entity`) — **Defined here** |

Rows have no link of their own (the board's `href '#'`); the Record cell is the link. Totals: "Σ 6" (count only). Bulk:
"Export" (W-55 with the ticked rows). Phone cards: When · Who on line 1, the What badge, the Record link, the Change
sentence, Where right-aligned.

#### 5.9.4 What and Change words (`lib/retail/activity-words.ts` `LIST_WORDS`, next to FND's record sentences)

| Event | What (tone) | Record | Change |
|---|---|---|---|
| `RETAIL_OVERRIDE.APPROVED` | "Manager PIN at the till" (warn) — "Manager PIN" when not from a till | the reference | refund: "Refund US$42.00 over the US$20.00 limit" · void: "Void of SALE-31866" · discount: "Discount 15% over the 10% limit" · drawer: "Drawer opened without a sale" · cash-out: "Cash out US$200.00" · adjustment: "Adjustment US$67.20 over the US$50.00 limit" |
| `RETAIL_PRICE.CHANGED` / `.SCHEDULED` | "Changed a price" (hollow) | product code | "US$1.20 → US$1.25" (+ ", from tonight" / ", from 5 Oct" when scheduled; + ", approved by Tendai Mhlanga" when it came through an approval) |
| `RETAIL_PRICE_APPROVAL.ASKED` / `.APPROVED` / `.TURNED_DOWN` | "Asked to change prices" (warn) / "Approved prices" (ok) / "Turned down prices" (hollow) | price list name | "2 products on Retail" |
| `RETAIL_STOCK_COUNT.SUBMITTED` | "Count sent" (hollow) | count number | "38 lines, 3 differ" |
| `RETAIL_STOCK_COUNT.APPROVED` | "Count approved" (hollow) | count number | "−US$41.20 posted to Breakage and losses" |
| `RETAIL_RECORD.BINNED` | "Moved to the bin" (bad) | the name | "Restorable until 2 November" |
| `RETAIL_RECORD.RESTORED` | "Restored from the bin" (ok) | the name | "Back in every list" |
| `RETAIL_RECORD.PURGED` | "Deleted for good" (bad) | the name (faint) | "After 30 days in the bin" (automatic) / "By the owner" |
| `RETAIL_RECORD.EDITED` | "Changed a detail" (hollow) | the record's label | "<Label>: <from> → <to>" |
| `RETAIL_SHIFT.CLOSED` | "Closed a shift" (hollow) | shift number | "Short −US$20.00" · "Over +US$3.17" · "Balanced" · "Not counted" |
| `RETAIL_SHIFT.OPENED` | "Opened a shift" (hollow) | shift number | "Float US$100.00" |
| `RETAIL_SALE.REFUNDED` / `.VOIDED` | "Refunded" (warn) / "Voided" (bad) | the refund or void number | "US$42.00 on SALE-31862" |
| `RETAIL_SETTINGS.CHANGED` and every other Settings-tab type | "Changed a setting" (info) | the page ("Company", "Approvals", "Till rules", "Payments", "Receipts", "Fiscal device", "Posting to the books", "Loyalty") | one change: toggles "<Label>: on" / "<Label>: off" ("Empties and deposits: on"), others "<Label>: <from> → <to>"; several: the first and ", and 2 more" |
| `RETAIL_PERSON.INVITED` / `.CHANGED` / `.PIN_SENT` / `.ACCESS_REMOVED` / `.ACCESS_RESTORED` / `.JOINED` / `.PIN_CHOSEN` | "Invited someone" (info) / "Changed a person" (hollow) / "Sent a new PIN" (hollow) / "Removed access" (bad) / "Gave access back" (ok) / "Joined" (ok) / "Chose a PIN" (hollow) | the person's name | "As a cashier, Harare Main Branch" / the change sentence / "The PIN was locked" when it was / "SH-00244 closed without a count" / — |
| `RETAIL_PIN.LOCKED` | "PIN locked" (warn) | the person's name | "Five wrong tries" |
| `RETAIL_SUPPORT.*` | "Corelith support" (info) | "Company" | "Asked to act as the owner" · "Tendai said yes" / "Tendai said no" · "In the admin until 14:35" · "Left the admin" · plan and module changes as settings |
| `RETAIL_EXPORT.DOWNLOADED` | "Exported" (hollow) | the list's title ("Customers") | "Spreadsheet, 412 rows" |
| any other `RETAIL_*` event | its type's last segment in sentence case (hollow) | `payload.name`, `payload.reference`, or the entity type in words | FND's record sentence |
| a generic activity row (`module: "retail"`) | "Added …" / "Changed …" / "Removed …" + the model in words ("Changed a purchase order line") (hollow) | `payload.label` | the changed field names joined ("Quantity, Cost") |

During a support session every row's Who reads "<First name>, Corelith support" and Where "Corelith support". Every area
that adds an event adds its row here in the same commit (the table's test asserts every constant in `RETAIL_AUDIT_EVENTS`
has a `LIST_WORDS` entry).

### 5.10 Bin — `/retail/manage/bin` · board `BinList.png` · source `retail-bin` (ADM-07)

**Header**: title "Bin"; sub "Kept for 30 days, then gone for good"; no primary.

**No tabs.** **Toolbar**: search "Name or reference"; chip "Kind" (Any · each registered kind present in the bin by its
label: Product · Customer · Order · Price list · Promotion · Category · Bundle · Bill …); "Filters" (holds Kind at narrow
widths); count pill; sort "Gone soonest" (· "Binned, newest" · "Name A–Z", **Defined here**); "Group" (None · Kind);
"Columns"; "Export ⌄".

**Columns** (grid `40px minmax(190px,1.4fr) 130px 150px 130px 130px 120px 44px`, min width 1060px):

| Column | Kind | Value |
|---|---|---|
| (tick) | checkbox | selection |
| What | text | the registry's name: "Nederburg Rosé 750ml", "T. Marange, +263 77 412 3380", "PO-0029", "Happy hour (old)" |
| Kind | muted | "Product" · "Customer, merged" · "Order, draft" · "Price list" (the registry's `labelFor`) |
| Binned by | muted | from the latest `RETAIL_RECORD.BINNED` event's actor ("Tendai Mhlanga") |
| Binned | date | "Today" · "Yesterday" · "28 Sep 2026" |
| Gone for good | date | `archivedAt` + 30 days: "2 Nov 2026" (warn text on the last 3 days, **Defined here**) |
| (no header) | link (600) | "Restore" → restores at once (no ask), toast "Restored. It is back in every list.", row leaves |
| ⋯ | row menu | "Restore" · "Open it" (the record with its bin banner) · separator · "Delete for good" (`--bad`, owner) |

**Totals**: "Σ 4" (count only). **Selection bar**: "Restore" → `POST /api/v2/retail/bin/restore-many` (no ask; toast "3
restored. They are back in every list." or "2 restored. Tapiwa Marange is in the bin, so T. Marange cannot come back
first." for a refusal); "Delete for good" (owner) → ConfirmDialog `deleteforgood`.

| Key | Title | Body | Keep | Go | Fill |
|---|---|---|---|---|---|
| `deleteforgood` | "Delete 2 things for good?" (one: "Delete Happy hour (old) for good?") | "They cannot be restored. Anything sold, paid or counted against them stays in the records, under their old names." | "Keep them" (one: "Keep it") | "Delete for good" | `--bad` |

Toast after: "Deleted for good." **Empty**: when nothing is in the bin, the FND empty state with the list's icon, "The bin
is empty", "Anything moved to the bin waits here for 30 days." (**Defined here**). **Phone** cards: What (600), Kind ·
Binned by, "Gone for good 2 Nov 2026", a "Restore" button.

Manager: no "Delete for good" anywhere. Restoring needs only Bin U ("Restore is U"), so a manager may restore a bill they
cannot otherwise open; the registry's `viewRight` is checked only for "Open it".

### 5.11 A liquor store at the till — board `Liquor.png` (ADM-08)

The board is the spec for four moments on the till (`/portal/pos`, components under `components/retail/portal/*`, which
FLR-09 and FLR-10 build out). Each panel is the till's dialog or banner in its existing primitives, laid out as the board
draws it: a small eyebrow (12.5, muted), a title (18/600), a line of body, two buttons side by side (secondary dark, primary
orange), a footnote (11.5, muted). Copy is exact. Every moment exists only while its switch is on (`shopFeatures(shop)`).

#### 5.11.1 Age check at the till (switch "Age check at the till")

- When: the first time in a sale that a line is added whose category is age-restricted (Categories' 18+ switch). Asked once
  a sale; later restricted lines do not ask again; a new sale asks again.
- Dialog: eyebrow "<Till> · <Cashier>" ("Front till · Chipo Dube"); title "Check ID: 18 and over"; body "<Product> is in
  <Category>, which needs an ID check." ("Johnnie Walker Black 750ml is in Spirits, which needs an ID check."); secondary
  "Remove it" (the line is not added; if it was added by a scan, it is taken out); primary "18 or over" (the line is
  added; the sale is marked checked); footnote "Asked once a sale. Logged with the cashier’s name."
- Server: `pos/sales` already refuses a sale with a restricted line and no check ("Check the customer's ID before selling
  <product>.") and stores `RetailSale.idCheckedAt`; the sale record (FLR-01) shows "ID checked: Yes, 11:39" with the
  cashier. Replaces today's dialog ("Check the customer's ID" / "ID checked, over 18" / "Don't sell").

#### 5.11.2 Licence trading hours (switch "Licence trading hours")

- When: the shop's clock is outside the licence window for today (Mondays to Saturdays the weekday window; Sundays **and
  public holidays** the Sunday window — ADM-08 makes `isWithinLicenceHours` treat a `PublicHoliday` of the till's site, or
  of the company, as a Sunday).
- Banner at the top of the sale screen (`--warn-soft` on the till's dark ground, warn text): "Alcohol stops at 22:00 on
  weekdays. Soft drinks and snacks still sell." (after closing time; Sundays and public holidays: "Alcohol stops at 18:00
  on Sundays and public holidays. Soft drinks and snacks still sell."; before opening: "Alcohol sells from 08:00. Soft
  drinks and snacks sell now." — the last two **Defined here**). Eyebrow on the panel: "<Till> · <Weekday> <hh:mm>".
- The product grid and search results show restricted products greyed with "Not sold" (mono, muted) where the price goes;
  tapping one does nothing but repeat the banner's sentence as a toast. Others keep their price and sell.
- No manager PIN can override it: the approval dialog is never offered for it, and `pos/sales` refuses outside the hours
  whatever the body carries (today's behaviour, kept and tested).

#### 5.11.3 Empties and deposits (switch "Empties and deposits")

- The cart shows, under the lines: "Deposit, <n> bottles" with the deposit total (for returnable lines), and, once bottles
  come back, "Bottles back, <n>" with a negative amount in the ok colour ("−1.20"); a rule; "To pay" (600) with the total.
  Buttons under the cart: secondary "Bottles back" (opens the till's bottles-back count, STK-09's `POST
  /api/v2/retail/empties/bottles-back` through FLR-10) and primary "Pay". Eyebrow "<Till> · <Cashier>".
- Server: deposits on sale lines and bottles back are today's (C4, D1, D2) and STK-09's ledger; nothing new here beyond the
  words.

#### 5.11.4 Cases and singles (switch "Cases and singles")

- When: a single is added and its on-hand at the till's site would go below zero, and a case of it (`packOfId`) has stock
  there.
- If that case has "Break cases at the till" on (PRD-08): the till breaks one case at once through STK-04's `POST
  /api/v2/retail/stock/case-breaks { caseProductId, siteId, cases: 1 }` (a cashier may, from their open shift, when singles
  are under one) and adds the single; toast "Opened 1 case of Castle Lager 340ml. 24 singles on." (**Defined here**).
- Otherwise the dialog: eyebrow "<Till> · <Cashier>"; title "No singles left"; body "<Single> shows <n> singles but <m>
  cases. Open a case?" ("Castle Lager 340ml shows 0 singles but 4 cases. Open a case?"); secondary "Not now" (nothing is
  added); primary "Open 1 case" (the same call, then the single is added); footnote "1 case off, 24 singles on. Automatic
  if Break cases at the till is on." (24 = the case's `packSize`).
- Server: STK-04's case break writes the two movements and `RETAIL_STOCK.CASE_BROKEN` (source TILL), visible in Activity.

#### 5.11.5 The board's footer, made true

- "On receipts. The licence number and “Not for sale to persons under 18”." — SET-07's receipt prints the licence number
  when the shop is a liquor store and "Show the liquor licence number" is on; the default footer for a liquor store
  includes "Not for sale to persons under 18." ADM-08's test checks a liquor sale's receipt carries both.
- "Reminders. The licence expiry, 60 days before, on the overview and on WhatsApp." — `remindLicenceExpiry` (retail
  worker, daily 07:00): for each liquor store whose `licenceExpiresOn` is within 60 days and whose
  `licenceReminderSentFor` is not that date: a notification to every owner ("Your liquor licence runs out on 31 December
  2026" / "Renew it before then, and change the date in Management › Company."), a WhatsApp message to each owner with a
  phone (template `licence-reminder`, the same words), `licenceReminderSentFor` = that date, audit
  `RETAIL_LICENCE.REMINDED`. The Overview's "Needs action" (FLR-08) lists "Liquor licence runs out on 31 December 2026" →
  Company from that day until the date changes (and "Liquor licence ran out on …" in `--bad` after it).
- "Start. Seven liquor categories and a 180-product Zimbabwean catalogue in onboarding." — C2 categories and SET-12's
  starter catalogue; nothing to add.

### 5.12 Support console — `/admin/company/[companyId]/shop` (admin host) · board `SupportCompany.png` (ADM-09, ADM-10)

The platform admin portal is the Corelith product: Corelith theme (FND-01), the board's layout. **Deviation**: the page is
drawn full-bleed with the board's own 52px top bar instead of the admin portal's sidebar shell, because the board draws it
that way; the bar's crumb leads back into the portal.

**Top bar** (52px, `--ink` ground, `--on-ink` text, padding 0 24, gap 12): "Corelith" (600); "Platform · Companies"
(muted; "Companies" links to `/admin/companies`); spacer; "Signed in as support: <first name>, superuser" (12.5, muted).

**Body**: grid `minmax(0,1fr) 360px`. Main (padding 24 40, `--surface`, max 720px):
- "Company" (13, `--ink-3`); h1 26/600 the company's name ("Harare Bottle Store"); mono 12 `--ink-3`
  "<slug> · <product> · <plan> · <n> sites" ("hurudza-creative · Retail · Grow · 2 sites").
- Sections (the settings field kit, each after the first with a top rule):

| Section | Field | Type | Board value | Notes |
|---|---|---|---|---|
| "Business type" | (no label) | cards, two columns | "General retail" — "Groceries, hardware, clothing: anything sold by the unit." · **"Liquor store"** — "Beer, wine and spirits. Age checks, licence hours, empties and cases." · "Pharmacy" — "Prescriptions, batches and expiry dates." badge "Soon" (dimmed, not pickable) · "Restaurant and bar" — "Tables, tabs and the kitchen." badge "Soon" | the selected card: 2px ink outline, filled ring |
| "Liquor store features" (only while Liquor store) | Age check at the till · Licence trading hours · Empties and deposits · Cases and singles | toggle rows | all on | no hints |
| "Plan and modules" | Plan | seg | Start · **Grow** · Scale | SET-10's plans |
| | Fiscal receipts | toggle row | on | `ADDON_ZIMRA_FISCAL` |
| | Posting to the books | toggle row | on | `ADDON_ACCOUNTING_CORE` |
| | Sales and CRM | toggle row | off | hint "Adds the Sales and CRM workspace beside Retail."; `ADDON_CRM_SUITE` |
| "Logged" | Why you are changing it | area, 2 rows | "Owner asked on WhatsApp to switch on cases and singles." | hint "Shown to the owner in Activity, with your name."; required to save and to ask for access |

- Under the form: primary "Save for this company" (38px). Saving with nothing changed: "Nothing has changed." beside it
  (**Defined here**). After a save: "Saved. The owner sees it in Activity." (`--ok`) beside it until the next edit; the
  "Last changes by support" list gains the change. Errors: under the field (reason), or beside the button.

**Aside** (border-left `--line`, padding 24, gap 16):
- h2 "Act as the owner"; paragraph "Opens their admin as <owner name> for 30 minutes, with a banner on every page. Needs
  the owner’s yes on WhatsApp first." Then by `AccessState` (**Defined here** except the first):
  - none: outline button "Ask <first name> for access" → `POST …/support-access { reason }` (the "Why" field's text).
  - asked: line "Asked at 13:58. Waiting for Tendai’s yes on WhatsApp." and a link "Ask again" (re-sends; the old link
    stops working).
  - yes: line "Tendai said yes at 14:02." and primary "Open their admin" → `POST …/open` → a new tab at the returned URL.
  - in: line "In their admin until 14:35." and outline "End it".
  - no: line "Tendai said no at 14:03." and the outline "Ask Tendai for access" again.
  - the owner has no phone: line "Tendai Mhlanga has no WhatsApp number. Ask them another way." and no button.
- h2 "Last changes by support"; a list (12.5, `--ink-2`, gap 8) of the newest five support events on the tenant's chain:
  "<d Mon> · <first name> · <summary>" ("2 Oct · Nyasha · Empties and deposits on", "14 Mar · Tawanda · Fiscal device
  registered"); none: "None yet." (**Defined here**).

### 5.13 The owner's yes, entering, and the banner (ADM-10; **Defined here**, no board)

- **`/support/answer/[token]`** (tenant host, in the shell, signed in as the owner asked; anyone else gets "This was sent to
  Tendai Mhlanga."): a centred 480px card: h1 "Let Corelith support into your admin?"; line "Nyasha from Corelith asked
  at 13:58 to open your admin as you for 30 minutes, to: Owner asked on WhatsApp to switch on cases and singles.";
  line "Everything they do shows in Activity with their name. You can end it at any time."; secondary "Not now", primary
  "Let them in". After: "Done. Nyasha can open your admin until 14:32." / "Done. Nyasha has been told no." Expired: "This
  has run out. Corelith support can ask again."
- **`/support/enter?token=…`** (tenant host): signs in through the `handoff` provider and goes to `/retail`; a spent or
  stale token shows "This link has been used or has run out."
- **Banner** (every page of the tenant while a support session is on, above the 48px header, 40px, `--warn-soft`, warn
  text, padding 0 16): "You are in Harare Bottle Store as Tendai Mhlanga, for Corelith support, until 14:35. Everything you
  do is logged with your name." and an outline "End it" (`POST /api/v2/retail/support-access/end`, then `/login`). The
  owner, in their own session, sees in the account menu a line "Corelith support is in your admin until 14:35" with "End
  it" (same endpoint).

### 5.14 Till PIN: first use and locked (ADM-03; the screens are SET-04's "Who is selling?" lock)

- **First use**: after a person types an issued PIN (`mustChange`), the lock screen does not open the till; it shows
  "Choose your own PIN" with the four dots and keypad, then "Type it again" — **Defined here**. Mismatch: "Those two do not
  match. Try again." Then `POST /api/v2/retail/pos/pin/change { newPin }`; refusals under the dots ("Pick a PIN that is not
  four of the same digit or four in a row.", "Pick a PIN that is not the one you were sent."). Then the till opens as
  usual.
- **Locked**: the fifth wrong PIN in a row locks it; the chip shows "Locked" and the lock screen says "Too many tries. Ask a
  manager to send you a new PIN." (replacing "Try again in 15 minutes"); the password sign-in stays on the screen for people
  who have one. Managers and owners get the `RETAIL_PIN_LOCKED` notification; People shows "PIN locked".
- **Change my PIN** (the till's settings, today `pos-till-settings-view.tsx`'s PIN section): "Current PIN", "New PIN",
  "Again" → `POST /api/v2/retail/pos/pin/change { currentPin, newPin }`; replaces the password-based set and clear.

---
## 6. What to remove

No redirects, no compatibility layers. Each removal lands in the unit named.

| Remove | Replaced by | Unit |
|---|---|---|
| `retail.setup` and the persona-shaped grant sets in `lib/retail/permissions.ts` (`MANAGE_THE_SHOP`, `RUN_A_TILL`, `READ_THE_SHELF`, `MOVE_STOCK`, `BOOK_A_DELIVERY_IN`, `ASK_FOR_MONEY`), and every `requireRetailPermission(session, "retail.setup", …)` call (tills → `retail.tills`, till settings and POS policy → `retail.till-rules`, fiscal → `retail.fiscal`, posting → `retail.posting`, shop profile → `retail.company`, bin → `retail.bin`) | the explicit grant table of 3.1 | ADM-01 |
| The retail personas in `lib/platform/personas.ts` (`CASHIER`, `STOCK_CLERK`, `RETAIL_MANAGER`) and their grants (`retail.pos`, `retail.refunds`, `retail.shifts`, `retail.promotions`, `retail.catalog` edit…), which nothing reads | the matrix | ADM-01 |
| `canChangeShopProfile` in `lib/retail/shop-profile-rules.ts` (if SET-01 has not removed it) | `retail.company:update` | ADM-01 |
| `app/user-management/{page,create/page,status/page,role-change/page,password-reset/page}.tsx` (redirect-only pages) and the `/user-management` entries in `matchPrefixes` of `lib/settings/management-nav.ts` | nothing (no path leads there) | ADM-02 |
| For RETAIL tenants: the Settings dialog's "Users" item (`management-nav.ts` id `users`) and `/preferences/organization/users` and `/[id]` (they `notFound()` when `workspaceProfile` is RETAIL); other products keep them | Management › People | ADM-02 |
| `email: String` (required) on `User` | `String?` | ADM-02 |
| The JWT's frozen `role` (`enrichTokenClaims` not reading the user) | role and `isActive` read per request | ADM-02 |
| `seed-retail-demo.ts` `STAFF`: Tendai Sibanda as the active stock clerk | Rudo Moyo; Tendai Sibanda without access | ADM-02 |
| `POST /api/v2/retail/pos/pin` (set with password) and `DELETE /api/v2/retail/pos/pin` (clear with password), and the password fields in `components/retail/portal/pos-till-settings-view.tsx` | `POST /api/v2/retail/pos/pin/change`; PINs issued from People | ADM-03 |
| `TILL_PIN_LOCK_MS`, `lockedUntil`, `retryAfterMs` and the 15-minute self-unlock in `lib/retail/till-pin.ts` and `pos/pin/unlock`; the copy "Try again in 15 minutes" in the till and in STK-04/FLR-09 | `lockedAt`, locked until a new PIN; "Too many tries. Ask a manager to send you a new PIN." | ADM-03 |
| `scripts/retail-till-pin.ts` (a hand-written DDL script for a table migrations own) | the migration chain | ADM-03 |
| For RETAIL tenants: the Settings dialog's "Activity" item (`management-nav.ts` id `activity`) and `/preferences/organization/activity` (`notFound()` for RETAIL) | Management › Activity | ADM-06 |
| `GET /api/v2/retail/bin` and `listBin` in `lib/retail/bin.ts` | list source `retail-bin` | ADM-07 |
| The old bin table page (moved to `app/retail/manage/bin/page.tsx` by FND-03 as it was) and its per-kind "Restored, off sale…" toasts | ListFrame `retail-bin` | ADM-07 |
| The till's ID dialog ("Check the customer's ID" / "ID checked, over 18" / "Don't sell") and the red "Not in licence hours" toast on add, in `components/retail/portal/pos-portal-state.tsx` | the Liquor board's moments (5.11) | ADM-08 |
| Platform-side approval of support access: `approveRequest` in `PLATFORM_ADMIN_MANIFEST.support`, `approveSupportAccess` in `scripts/platform/domain/support-service.ts`, the approve and deny actions on the admin portal's support-access pages and in the platform TUI's Support module, and `startSupportSession` without an owner's yes | the owner's yes (5.13) | ADM-10 |

Not removed here (other units own them): `lib/retail/manager-override.ts` and the password override (SET-06, FLR-02),
`components/retail/shop-settings.tsx` (FND-08), `/retail/setup/*` routes (FND-03).

---

## 7. Build units

In build order. Every unit: migration witness test in the same commit (when it has a migration), `pnpm typecheck` passes
(one at a time on this machine), `npx eslint <changed files>` adds no errors, the named tests pass (`npx vitest run …`),
`scripts/seed-retail-demo.ts --slug hurudza-creative --days 160 --reset` has been re-run, and screenshots are taken with
`scratchpad/smoke/lib.js` at 1440×960 (unless stated) as the people named, compared side by side with the board PNG.
Test accounts after ADM-02's seed (password `RetailDemo123!`): owner `owner@bottlestore.test`, manager
`tafara.manager@bottlestore.test`, cashier `chipo.till@bottlestore.test`, stock clerk `rudo.stock@bottlestore.test`,
bookkeeper — Ruvimbo Chari after she joins through her link in the test (her email `ruvimbo@charibooks.co.zw`).

| Unit | Title | Size | Depends on | Boards | Workflows | Routes |
|---|---|---|---|---|---|---|
| ADM-01 | Who can do what in code: the Roles matrix | M | FND-03 | Roles | W-57 | every `/api/v2/retail/**` guard; the Management panel |
| ADM-02 | People: list, invite, change, remove access, who can do what | L | ADM-01, FND-04, FND-05, FND-07, SET-07 | PeopleList, PersonNew, PersonEdit, Roles | W-57 | `/retail/manage/people`, `/join/[token]` |
| ADM-03 | Till PINs: issued, chosen on first use, locked until a new one | M | ADM-02, SET-04 | PersonEdit | W-57, W-59 | `/portal/pos` (lock screen), `/api/v2/retail/pos/pin/*` |
| ADM-04 | Approvals and limits | M | ADM-01, ADM-02, FND-08 | ApprovalSettings | W-58 | `/retail/manage/approvals` |
| ADM-05 | Price changes that wait for the owner | M | ADM-04, PRD-03, PRD-07 | ApprovalSettings | W-58 | `/retail/manage/approvals?sheet=price-approval` |
| ADM-06 | Activity, overrides included | L | ADM-01, ADM-02, FND-04, FND-05, FND-06, STK-04 | ActivityList | W-59, W-60, W-62 | `/retail/manage/activity` |
| ADM-07 | The bin: restore within 30 days, delete for good | M | ADM-01, FND-05, FND-06, SET-01 | BinList | W-63 | `/retail/manage/bin` |
| ADM-08 | A liquor store, switched on, everywhere it shows | M | FND-08, SET-01, SET-07, FLR-08, FLR-09, FLR-10, STK-04, STK-09, PRD-08 | Liquor | W-61 | `/portal/pos`, `/retail/manage/company`, `/retail` |
| ADM-09 | Support console: business type, features, plan and modules | M | ADM-01, ADM-06, SET-10 | SupportCompany | W-68 | `/admin/company/[companyId]/shop` |
| ADM-10 | Act as the owner, with their yes | L | ADM-09, ADM-02, ADM-06, SET-07 | SupportCompany | W-68 | `/admin/company/[companyId]/shop`, `/support/answer/[token]`, `/support/enter` |

### ADM-01 · Who can do what in code: the Roles matrix · M

Builds 3.1: `lib/retail/roles-matrix.ts` (the board, 32 rows), `lib/retail/permissions.ts` (37 resources, `view-own`,
seven role keys, `canRetailSessionDo`, labels), the guards that named `retail.setup`, the Management items' `requires`
(people `retail.people:view`, approvals `retail.approvals:view`, activity `retail.activity:view`, bin `retail.bin:view`,
company `retail.company:view`, sites `retail.sites:view`, tills `retail.tills:view`, payments `retail.payments:view`, till
rules `retail.till-rules:view`, receipts `retail.receipts:view`, fiscal `retail.fiscal:view`, posting
`retail.posting:view`, loyalty `retail.loyalty:view`, billing `retail.billing:view`), the removals of section 6 for ADM-01.

Acceptance:
- `npx vitest run lib/retail/roles-matrix.test.ts lib/retail/permissions.test.ts lib/retail/route-guard-coverage.test.ts`:
  all 32 × 6 cells of the board hold (Superuser column through `CORELITH_SUPPORT`); `TEACHER`, `SALES_REP`, `CLERK` hold
  nothing; every resource has a label; `view-own` never yields R; no handler names `retail.setup`.
- Management panel per role (screenshots of the panel only): owner sees all fourteen items; manager (`tafara.manager@`)
  sees Company, Sites, Tills and devices, Payments, Till rules, Receipts, Fiscal device, People, Approvals, Loyalty,
  Activity, Bin (no Posting to the books, no Plan and billing) — items whose pages do not exist yet are not drawn; the
  cashier and the stock clerk have no gear.
- `GET /api/v2/reports/retail-shifts?page=1` as a `FINANCE_OFFICER` user answers 200 (bookkeeper reads shifts) and `POST
  /api/v2/retail/shifts` answers 403 "Your role cannot open a till shift in sales"; as the manager the shop profile's `PATCH`
  (`/api/v2/retail/shop-profile`, or `/api/v2/retail/settings/company` once FND-08 has moved it) answers 403 "Your role
  cannot change company settings".

### ADM-02 · People: list, invite, change, remove access, who can do what · L

Builds migration `20261004138000_retail_people` (+ witness `lib/retail/people-migration.test.ts`; it also adds
`@@index([companyId, actor, createdAt])` on `PlatformAuditEvent`, used by "Last in" and later by Activity's Who filter —
so ADM-06's migration carries only `siteId` — and the area's notification enum values); `lib/retail/people/{roles,invite,change,access,pins,last-seen,scope}.ts`
(+ tests); section 4.1 endpoints except `pos/pin/*`; the `person` lookup noun (and `site` if SET-02 has not registered it);
the `retail-people` list source; sheet kinds `person-new`, `person`, `roles`, `people-message`; ConfirmDialogs
`removeaccess`, `removeaccessmany`, `resetpins`; the hand-over panel; the `matrix` sheet size; `/join/[token]` and its
public API (+ `lib/public-routes.ts`); `enrichTokenClaims` reading role and `isActive`; `acceptPendingInvite` in the sign-in
success path; `seedPeople()`; the ADM-02 removals; the typecheck fallout of `email: string | null`.

Acceptance (reseeded tenant):
- `/retail/manage/people` side by side with `PeopleList.png`: Management panel with People current; header "People" with
  the sub link "Who can do what" and "+ Invite someone"; tabs "Active 6 · Invited 1 · No access 2 · All 9" on their own
  row; toolbar "Name or phone", "Role Any", "Site All sites", "Filters", count, "Name A–Z", Group, Columns, Export; rows
  Farai Moyo · Cashier · Borrowdale · +263 71 902 7713 · Locked · Yesterday · PIN locked (warn), Chipo Dube and Kuda Banda
  "Selling now", Rudo Moyo "Today 10:40", Tafara Nyathi "Today 12:31", Tendai Mhlanga "Now"; "Σ 6"; pager. (The board's
  seventh row, Ruvimbo Chari · Bookkeeper · Invited 2 Oct · Invited, shows on Invited and All — section "Open questions" 1.)
- `?sheet=person-new` side by side with `PersonNew.png`: invite "Ruvimbo Test", +263 77 555 0101, `ruvimbo.test@example.com`,
  Bookkeeper, All sites, PIN off → toast "Invite sent to Ruvimbo Test."; she is on Invited; a `RetailMessage` `staff-invite`
  exists (SENT, or FAILED "WhatsApp is not set up" in the preview, in which case the hand-over panel showed the link);
  opening that link in a fresh browser shows "Join Harare Bottle Store", a password joins and lands on `/retail` signed in
  as her; People now shows her Active; Activity has `RETAIL_PERSON.INVITED` and `.JOINED`.
- `?sheet=person&id=<Farai>` side by side with `PersonEdit.png`: title "Farai Moyo", sub "Cashier · Borrowdale · PIN locked
  after 5 tries", the warn read "Locked today at 08:12 after 5 wrong tries", toggle on, "Remove access", the note, Cancel,
  Save → "Farai Moyo saved. A new PIN is on its way."; his PIN is no longer locked and `mustChange` is true.
- As the manager: the Invite cards are Cashier and Stock clerk only; `POST /api/v2/retail/people` with role BOOKKEEPER
  answers 403 "Managers add cashiers and stock clerks only."; Tendai Mhlanga's sheet is read-only; no "Remove access"
  anywhere. As the cashier: `/retail/manage/people` refuses and the nav has no gear.
- Remove access for Chipo Dube (who has the open Front till shift) → the ask names "SH-… on Front till is closed without a
  count first" → toast with the shift; the Shifts list shows that shift "Not counted"; Chipo's browser session is signed
  out on its next request; Give access back → she can sign in again.
- Change Tafara Nyathi's role to Cashier as the owner, then in Tafara's open browser `GET /api/v2/retail/people` answers
  403 at once (role re-read per request); change it back.
- `?sheet=roles` side by side with `Roles.png`: the lede, six role columns with their subs, seven sections, 32 rows, D chips
  filled, live limits ("Managers approve up to US$500.").
- 390×844: People as cards; the Invite sheet full width.

### ADM-03 · Till PINs: issued, chosen on first use, locked until a new one · M

Builds migration `20261004138100_retail_till_pin_issued` (+ witness), `evaluateTillPinAttempt` without a time-out (`lockedAt`),
`RETAIL_PIN.LOCKED` + `RETAIL_PIN_LOCKED` notification (STK-04's manager PIN and SET-04's sign-in both use the evaluator),
`POST /api/v2/retail/pos/pin/change`, the `pinMustChange` claim from SET-04's `till-pin` provider, the "Choose your own
PIN" step and the locked copy on SET-04's lock screen, Change my PIN in the till settings, `seedPins()`, the ADM-03
removals.

Acceptance:
- `lib/retail/till-pin.test.ts`: five wrong → LOCKED with no expiry; a correct PIN while locked → LOCKED without a bcrypt
  compare; issuing a new PIN clears the lock.
- Two browsers (A admin as owner, B a paired till): Farai's chip on B shows "Locked" and his PIN 6024 is refused with "Too
  many tries. Ask a manager to send you a new PIN."; in A, Farai's sheet → Save with "Send a new PIN on WhatsApp" → the
  hand-over shows the PIN (preview without WhatsApp); on B, Farai types it → "Choose your own PIN" → 1593 twice → the till
  opens; People shows Till PIN "Set", Last in "Selling now"; Activity shows "Sent a new PIN" and "Chose a PIN".
- Five wrong PINs for Chipo on B → People shows her "PIN locked" and the owner has the notification "Chipo Dube’s PIN is
  locked".

### ADM-04 · Approvals and limits · M

Builds migration `20261004138200_retail_approval_settings` (+ witness), `lib/retail/settings-pages/approvals.ts`,
`GET`/`PATCH /api/v2/retail/settings/approvals`, `lib/retail/approvals/{limits,notify,waiting}.ts` (+ tests),
`GET /api/v2/retail/approvals/waiting`, the live limit sentences in the Roles sheet, `seedApprovals()`.

Acceptance:
- `/retail/manage/approvals` at 1440×1240 side by side with `ApprovalSettings.png`: Approvals current in the panel;
  sections Money out, Prices, Stock, Customers and asking with the board's values; segments in solid ink; save bar "Last
  changed by Tendai Mhlanga, 1 September."; aside "Waiting now" with REQ-0014 and CNT-0020 (once BUY-04 and STK-06 have
  registered their providers; "Nothing is waiting." before), "Who can change this · Owners only.".
- Change "Requisitions need the owner over" to 750.00 → "● 1 change not saved" → Save → "Saved just now."; the Roles sheet
  reads "Managers approve up to US$750."; `getApprovalLimits` returns 750.00; Activity › Settings shows "Changed a setting ·
  Approvals · Requisitions need the owner over: US$500.00 → US$750.00".
- As the manager every field is read-only and the bar reads "Owners only."; `PATCH` answers 403 "Your role cannot change
  approvals".
- `lib/retail/approvals/notify.test.ts`: with "WhatsApp and the app" an owner-level ask creates one notification and one
  `RetailMessage` `approval-ask` to Tendai Mhlanga's phone; with "The app only" no message; with no owner approver set,
  every active owner is asked.

### ADM-05 · Price changes that wait for the owner · M

Builds migration `20261004138300_retail_price_approvals` (+ witness),
`lib/retail/approvals/prices.ts` and its two calls inside PRD-03's `changePrices`, section 4.2's price-approval endpoints,
sheet `price-approval`, the waiting provider, notifications `RETAIL_PRICE_APPROVAL` and `RETAIL_PRICE_DECIDED`.

Acceptance:
- Owner sets "Price changes" to "Owner approves". As the manager on the Retail price worksheet, Castle Lager 340ml 1.20 →
  1.30 and Coca-Cola 500ml 0.75 → 0.70, Save → toast "2 price changes wait for Tendai Mhlanga."; the till still sells at
  1.20; the owner has "Price changes wait for you"; Approvals' aside lists "Prices on Retail, 2 products, from Tafara
  Nyathi. …"; opening it shows the two lines; "Approve 2 prices" → toast "2 prices approved. The till has them now."; the
  till sells at 1.30; Activity › Prices shows "Approved prices" and two "Changed a price … approved by Tendai Mhlanga".
- With the rule back to "Managers, no approval" and "Below cost needs the owner" on, the manager prices Castle at 0.80 (cost
  0.86) → that line waits with reason "Under cost"; "Turn down" with a note → Tafara is told; nothing changed.

### ADM-06 · Activity, overrides included · L

Builds migration `20261004138400_audit_site_and_actor` (+ witness: `siteId`, its index, the backfill),
`writeRetailAuditEvent`'s `source`/`registerName`/`siteId`/`support` from the request context (`lib/activity/context.ts`
gains host, user agent, mobile, support and device fields), `auditOverrideApproved` and its call in STK-04's
`verifyManagerPin` success path, the `retail-activity` source with database-side paging, `LIST_WORDS` (+ a test that every
`RETAIL_AUDIT_EVENTS` constant has an entry), the `entity` parent filter, `seedActivity()`, the ADM-06 removals.

Acceptance:
- `/retail/manage/activity` (Filters: When Last 30 days) side by side with `ActivityList.png`: header "Activity"; tabs
  "Everything · Overrides · Prices · Settings" with counts; toolbar "Person, record or change", "Who Anyone", "Kind Any",
  "Filters 1", count, "Newest first"; the six seeded rows with the board's words and tones — "Today 12:31 · Tafara Nyathi ·
  Manager PIN at the till · RFD-0045 · Refund US$42.00 over the US$20.00 limit · Front till", "Changed a price · CASTLE-340 ·
  US$1.20 → US$1.25, from tonight · Admin", "Count sent · CNT-0020 · 38 lines, 3 differ · Phone", "Moved to the bin ·
  Nederburg Rosé 750ml · Restorable until 2 November · Admin", "Yesterday 21:58 · Chipo Dube · Closed a shift · SH-00239 ·
  Short −US$20.00 · Front till", "2 Oct 08:15 · Changed a setting · Company · Empties and deposits: on · Admin".
- End to end: a refund over the limit at the till approved with Tafara's PIN → one new row on Overrides with that refund's
  reference and "Front till"; Who = Tafara Nyathi; the count on the Overrides tab rises by one.
- Overrides tab shows only overrides; Prices only price events; Settings only settings; Kind "People" shows the people
  events; Who "Rudo Moyo" shows only hers; the record link opens the record; a product's "All activity" lands on
  `?entity=Product:<id>` with "For Amarula Cream 750ml" and "Show everything".
- A manager limited to Harare Main Branch sees no Borrowdale event and no company settings event; the bookkeeper sees all
  and cannot act; the cashier is refused.
- Export › Spreadsheet downloads the filtered rows with the same columns.

### ADM-07 · The bin: restore within 30 days, delete for good · M

Builds the `retail-bin` source, `restore-many` and `delete` endpoints, the registry's `purge`/`listBinned`/`labelFor`/`href`
for the three kinds that exist (product, promotion, category — the other kinds come with their area units and must
implement them), `purgeExpiredBin` in the retail worker, ConfirmDialog `deleteforgood`, `seedBin()`, the ADM-07 removals.

Acceptance:
- `/retail/manage/bin` side by side with `BinList.png`: header "Bin" with the sub "Kept for 30 days, then gone for good";
  no tabs; toolbar "Name or reference", "Kind Any", "Filters", count, "Gone soonest", Group, Columns, Export; rows with
  What, Kind, Binned by, Binned, Gone for good, the "Restore" link and ⋯; "Σ 3" (Nederburg Rosé 750ml · Product · Tendai
  Mhlanga · Today · <today + 30>; PO-0029 · Order, draft · Tafara Nyathi; Happy hour (old) · Price list · Tendai Mhlanga —
  the last two once BUY-02 and PRD-05 are in).
- Restore Nederburg Rosé 750ml → toast "Restored. It is back in every list."; it is on Products and on the till; Activity
  shows "Restored from the bin". Bin it again from its record (FND-06) → it is back here with Binned "Today".
- As the owner, "Delete for good" on a promotion never sold → the ask → "Deleted for good."; the row is gone from the
  database and Activity shows "Deleted for good · By the owner"; on a product with sales → kept in the database, gone from
  the bin, `POST /bin/restore` answers 410 "It was deleted for good.". As the manager there is no "Delete for good" and the
  endpoint answers 403.
- `lib/retail/bin.test.ts`: an item binned 31 days ago is not listed; `purgeExpiredBin` with a fixed clock purges it once
  and writes one PURGED event with a null actor.

### ADM-08 · A liquor store, switched on, everywhere it shows · M

Builds the four till moments (5.11) in FLR-09/FLR-10's till, public holidays as Sundays in `isWithinLicenceHours`,
migration `20261004138500_retail_licence_reminder` (+ witness) and `remindLicenceExpiry`, the Overview "Needs action"
provider for the licence, a switch-by-switch test, the ADM-08 removals.

Acceptance:
- `lib/retail/shop-features.test.ts`: for each switch off → the till's context reports it off, the nav has no Empties
  (empties off), product forms hide case fields (cases off), `pos/sales` accepts an age-restricted line without a check
  (age check off) and outside the hours (licence hours off); General retail → all four off whatever the switches.
- On a paired till as Chipo Dube: add Johnnie Walker Black 750ml → the dialog of `Liquor.png` panel 1 ("Check ID: 18 and
  over" … "Remove it" · "18 or over" … the footnote); "18 or over" → a second whisky does not ask; the sale record shows "ID
  checked: Yes". With the shop clock set past 22:00 on a weekday (test clock): the banner of panel 2, Castle Lager 340ml
  "Not sold", Coca-Cola and Ice selling; no approval dialog appears; `pos/sales` with Castle answers its refusal.
- Six Castle Lager 340ml and twelve bottles back → the cart lines of panel 3 ("Deposit, 6 bottles 0.60", "Bottles back, 12
  −1.20", "To pay 6.60").
- With Castle singles at 0 and 4 cases, adding a single → panel 4's dialog; "Open 1 case" → 3 cases, 24 singles less the
  one sold; with "Break cases at the till" on the case, it opens without asking and shows the toast.
- With the licence expiry set to 50 days ahead, the worker run → owners notified, one WhatsApp `licence-reminder` per owner
  with a phone, Overview "Needs action" lists the licence; a second run sends nothing.

### ADM-09 · Support console: business type, features, plan and modules · M

Builds `/admin/company/[companyId]/shop` (page and its top bar), `GET`/`PATCH /api/platform-admin/companies/[companyId]/shop`,
the support audit payloads on the tenant's chain and the owner's notification, "Last changes by support", the entry points
(companies list row action "Business type and features", a link on the company page), `seedSupport()`.

Acceptance:
- Signed in on the admin host as Nyasha (`nyasha@corelith.test` allowlisted), `/admin/company/<Harare Bottle Store>/shop`
  side by side with `SupportCompany.png`: top bar "Corelith · Platform · Companies · Signed in as support: Nyasha,
  superuser"; "Company", "Harare Bottle Store", "hurudza-creative · Retail · Grow · 2 sites"; Business type cards with Liquor
  store chosen and two "Soon"; the four switches; Plan Grow; Fiscal receipts and Posting on, Sales and CRM off with its
  hint; "Why you are changing it"; "Save for this company"; aside "Act as the owner" and "Last changes by support" with
  the two seeded lines.
- Turn "Cases and singles" off with the reason "Owner asked on WhatsApp to switch off cases." → "Saved. The owner sees it in
  Activity."; on the tenant, Company shows it off, the till stops prompting for cases, the owner has the notification, and
  Activity (Kind Support) shows "Nyasha, Corelith support · Corelith support · Company · Cases and singles: off · Corelith
  support"; "Last changes by support" gains "<today> · Nyasha · Cases and singles off". Saving with an empty reason →
  "Say why. The owner reads it in Activity.".
- As a tenant owner (not a platform superuser) every `/api/platform-admin/**` call answers 403.

### ADM-10 · Act as the owner, with their yes · L

Builds migration `20261004138600_support_act_as_owner` (+ witness), `support-access` ask/open/end on the admin host, the
owner's answer page and API, the `handoff` provider's support sessions, the `CORELITH_SUPPORT` matrix row in force during a
session, the banner and the account-menu line, `expireSupportSessions` in the worker, the ADM-10 removals.

Acceptance:
- Nyasha's console → "Ask Tendai for access" with the reason → "Asked at hh:mm. Waiting for Tendai’s yes on WhatsApp."; a
  `RetailMessage` `support-ask` to +263 77 412 0098; Tendai, signed in, opens the link → "Let Corelith support into your
  admin?" → "Let them in"; the console shows "Tendai said yes at hh:mm." and "Open their admin" → a new tab on the tenant
  host signed in as Tendai Mhlanga with the banner "You are in Harare Bottle Store as Tendai Mhlanga, for Corelith support,
  until hh:mm. …".
- In that tab change a price → Activity shows Who "Nyasha, Corelith support", Where "Corelith support"; `GET
  /api/v2/retail/people` works (owner-level reads); Activity rows cannot be changed (no endpoint).
- "End it" in the banner → back to sign-in; the session row is REVOKED; a support session past 30 minutes is refused on its
  next request and marked EXPIRED by the worker; "Not now" → the console shows "Tendai said no at hh:mm.".
- The admin portal's support-access pages no longer offer Approve or Deny.

---

## Open questions

1. **People tab and rows.** The board selects "Active 6" but lists seven rows, the seventh Ruvimbo Chari (Invited). This
   spec lists six on Active and Ruvimbo on Invited and All. Confirm, or the canvas's Active should read 7.
2. **"Who can do what" entry point and size.** The nav tree files it as a sheet under People; the People board has no door
   to it. This spec adds the header sub link "Who can do what" and a 1120px `matrix` sheet size to FND-07. Confirm both.
3. **PIN lock until reset** (PersonEdit: "Locked today at 08:12 after 5 wrong tries") replaces the 15-minute self-unlock.
   STK-04, FLR-09 and SET-04 wrote "Too many tries. Try again in 15 minutes."; they change to "Too many tries. Ask a manager
   to send you a new PIN." (and 429 becomes 423). Confirm.
4. **Below cost waits** ("Any price under its cost waits for you.") — the products spec refuses a manager's below-cost price
   with 400 "Below cost needs the owner. It costs US$13.03." This spec routes it (and every manager price change under
   "Owner approves") into a `RetailPriceApproval` the owner approves (ADM-05), and PRD-03's `changePrices` calls ADM-05's
   two functions. Confirm with the products owner.
5. **W-58's "Refunds over US$" step** is not on the Approvals board; it is Till rules' "Manager PIN for refunds over"
   (SET-06). The Roles sheet links the refund limit there.
6. **"Owner approvals go to"** — the board's options include a manager and two cashiers; approvals for the owner can only
   go to an owner, so this spec offers owners only (and its inline add invites an owner, with an email).
7. **The stock clerk test account.** People has Rudo Moyo as the stock clerk and no Tendai Sibanda; the seed takes
   `tendai.stock@bottlestore.test`'s access away, and FND-03/FND-04/buying acceptance checks that use it must use
   `rudo.stock@bottlestore.test` after ADM-02's seed.
8. **Farai Moyo** works at Borrowdale on People, while foundations seeds his stale open shift on Back till at Harare Main
   Branch. Both are seeded as written; his access is to Borrowdale only from ADM-02 on (SET-04 then keeps him off Harare
   tills).
9. **Bin order.** "Gone soonest" is the board's sort, but its rows are newest first. This spec sorts gone soonest (Happy hour
   (old) first).
10. **T. Marange in the bin.** The Bin board shows him merged on 28 September; the customers seed keeps him unmerged for
    the merge demo, so the seeded bin shows three rows.
11. **2 October.** Activity says Tendai Mhlanga turned "Empties and deposits" on at 08:15 from the Admin; the support
    console says Nyasha did ("2 Oct · Nyasha · Empties and deposits on"). Both are seeded as their boards say.
12. **Support console chrome and theme.** The board draws a full-bleed page with its own top bar in Tender colours; this spec
    keeps the layout and uses the Corelith theme (the platform's product) instead of the admin portal's sidebar shell.
13. **The owner's yes** is a link in the WhatsApp message to an answer page (there is no inbound WhatsApp handling to read a
    reply). Confirm, or SET-07 needs inbound messages.
14. **Support approval for every product.** Removing the platform-side approve makes the owner's yes the only way in for
    every tenant, not only retail. Confirm for schools and the rest.
15. **Superuser's D on Company and Plan** (close a shop, end a plan) stays in the platform tools; the console does not draw
    it.
16. **Reports for cashiers and stock clerks.** The insights spec grants them `retail.reports:view`; foundations' nav and
    this matrix give Reports to Owner, Manager and Bookkeeper only. Decide.
17. **End of day has no D** on the board for Owner and Manager; the floor spec gave them everything. This spec follows the
    board.
18. **`view-own`** for requisitions is new; BUY-04's list and record accept `view` or `view-own` (scoped to the asker).
19. **Event name.** Code writes `RETAIL_SHOP.PROFILE_CHANGED`; the setup spec writes `RETAIL_SHOP_PROFILE.CHANGED`. This spec
    lists the first; one must go.
20. **What a cashier owes.** The floor spec asks for it "on the People record"; the canvas has no person record (rows open
    the PersonEdit sheet). Add a read line to the sheet, or show it on the shift and Insights only?
21. **Public holidays** count as Sundays for licence hours (the Company field is "Sundays and public holidays"); the code
    today checks Sundays only.
22. **`User.email` optional** is platform-wide. Typecheck finds the reads; product owners of schools and CRM should confirm
    nothing relies on every user having an email (sign-in by email is unaffected).
23. **Activity links from settings.** The setup spec links Company's "Activity" to `?subject=company`; this spec's (and
    FND's) parameter is `?entity=RetailSettings:company`.
24. **Onboarding staff** (SET-12) should call `invitePerson` with the owner-typed PIN so onboarding and People make the same
    person; until then SET-12 may build its own `inviteStaff`, which ADM-02 then replaces.
25. **Phones for existing users.** A phone is required for retail people; owners from signup may have none. Saving a person
    without one asks for it ("Write a mobile number such as +263 77 123 4567.").
