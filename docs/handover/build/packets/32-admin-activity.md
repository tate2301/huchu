# 32 · Management › Activity (retail), overrides included

## Screen
- Management's Activity page, extended for a retail workspace: `/preferences/organization/activity` (the gear's Management /
  Settings surface, `PreferencesShell`). For a RETAIL workspace it draws the retail Activity list on ListFrame (source
  `retail-activity`); other products keep today's `ActivityLog`.
- Deep links: `?entity=<EntityType>:<id>` (a record's "All activity", a settings page's Activity), `?kind=support`
  (support notifications, packets 35/42), `?tab=overrides|prices|settings`.
- No `/retail/manage/activity` route and no Setup sidebar item: 98-decisions "Owner direction, 5 October" #2–#3 keep
  Activity in Management ("Things Management already has are not rebuilt in retail … activity"; "Retail pages link to the
  Management page or extend it"). The board's Management panel is drawn by Management's own rail.

## Units
ADM-06 (docs/handover/80-admin.md §W-59, §W-60, §W-62 last step, §3.3 `audit_site_and_actor`, §3.4 (writer context), §4.4,
§5.9, §7 ADM-06, seed `seedActivity()`). "Verbatim §x" = that section of `80-admin.md` is part of this packet.

## Boards
`ActivityList.png` — title "Activity", no primary. Tabs "Everything 1,204" · "Overrides 12" · "Prices 41" · "Settings 6"
(counts in mono pills; computed). Toolbar: search "Person, record or change", chips "Who Anyone", "Kind Any", "Filters" with
badge "1" (When: Last 30 days by default), count pill, "Newest first", "Group", "Columns", "Export ⌄". Columns: tick · When
(mono: "Today 12:31", "Yesterday 21…", "2 Oct 08:15") · Who · What (badge with tone: "Manager PIN at the till" warn, "Changed a
price" hollow, "Count sent" hollow, "Moved to the bin" bad, "Closed a shift" hollow, "Changed a setting" info) · Record (mono
for references "RFD-0045", "CASTLE-340", "CNT-0020", "SH-00239"; 600 weight for names "Nederburg Ros…", "Company") · Change
(muted sentence) · Where ("Front till", "Admin", "Phone") · ⋯. Σ "6". Pager "1–6 of 6 Rows per page 50".

## Workflows
- W-60 Read the audit trail (Owner): What changed · Who · When — every row verbatim §W-60 (record tab "All activity" link,
  Management › Activity, What/Who/When/Where columns, Export).
- W-59 Manager override at the till — step "Logged": one `RETAIL_OVERRIDE.APPROVED` per approved act, written in the act's
  transaction (verbatim §W-59 "Logged" row).
- W-62 last step: every `RETAIL_RECORD.EDITED` appears here ("Changed a detail", "<Label>: <from> → <to>").

## Roles
`retail.activity` (landed): Owner view, Manager view, Bookkeeper view, Superuser view (support session), Cashier/Stock clerk
none.
- Manager limited to some sites (Tafara: Harare Main Branch only) sees events whose `siteId` is one of their sites plus their
  own events; never company-wide events with no site (settings).
- Bookkeeper sees all, acts on nothing (no endpoint changes events).
- Cashier, stock clerk: no Activity item in Management; `GET /api/v2/reports/retail-activity` → 403 "Your role cannot view
  activity".
Accounts: `owner@`, `tafara.manager@`, `bookkeeper@`, `chipo.till@`, `tendai.stock@` (`@bottlestore.test`). Till override
walk: cashier `chipo.till@` at a paired till, manager Tafara's PIN 2468 (seeded by ADM-03).

## Data
Existing: `PlatformAuditEvent` (chain with `eventHash`/`prevEventHash`), `Site`, `RetailRegister`/tills (SET-03),
`User`. `lib/activity/context.ts` (`ActivityRequest`), `lib/retail/audit.ts` (`writeRetailAuditEvent`,
`writePlatformAuditEvent`).

Migration `<stamp>_audit_site_and_actor`, witness `lib/audit/audit-site-actor-migration.test.ts`: `PlatformAuditEvent.siteId
String?` (not a FK, not part of the hash) and `@@index([companyId, siteId, createdAt])`; SQL backfills `siteId` from
`payloadJson::jsonb ->> 'siteId'` where it is a UUID (guard non-JSON payloads: `payloadJson IS NOT NULL AND payloadJson ~ '^\{'`).
Witness: column, index, a row inserted before with `{"siteId": "<uuid>"}` has `siteId` after.

## Server
1. **Writer context** (verbatim §3.4 last paragraph): `ActivityRequest` gains `host`, `userAgent`, `mobile` (the
   `Sec-CH-UA-Mobile: ?1` header or a phone user agent), `supportSessionId`, `supportActorName`, `registerId` and
   `registerName` (from the session's `registerId`, SET-04's till session; name read once per request). `beginActivityRequest`
   (called from `lib/api-utils.ts`) fills host/userAgent/mobile; `validateSession` fills the session fields.
   `writeRetailAuditEvent` adds to every payload `source` (`SUPPORT` during a support session; `TILL` with a register;
   `PHONE` for a phone browser; `ADMIN` otherwise; `SYSTEM` when no request is open — the worker), `registerName` (TILL),
   `siteId` (caller's, else the register's site), `support: { name, email }` during a support session (`actorName` then
   "Nyasha (Corelith support)"). Callers may pass `source`/`siteId` explicitly. `writePlatformAuditEvent` writes the new
   column from `payload.siteId`. Never PINs, tokens or passwords in payloads.
2. **Overrides.** `lib/retail/audit.ts` `auditOverrideApproved(tx, { actor (the approver), askedBy: { id, name }, act:
   "refund"|"void"|"discount"|"drawer"|"cash-out"|"adjustment", entityType, entityId, reference, amount, limit|null, siteId,
   registerName })` → `RETAIL_OVERRIDE.APPROVED`. Called **inside the act's transaction** by every caller whose
   `approvalFor` / `replayApproval` returned an approver: `app/api/v2/retail/pos/sales/route.ts` (discount over the cashier's
   limit), `app/api/v2/retail/_services.ts` (refund, void; ~line 1197), `lib/retail/drawer-open.ts` (drawer without a sale),
   `app/api/v2/retail/pos/sync/route.ts` (replayed acts with an approver), and STK-04's stock adjustment over
   `adjustmentPinOver`. `verifyManagerPin` stays outside transactions (it may lock a PIN); the `Approval` it returns gains
   nothing secret. A static test makes forgetting impossible to merge: every source file under `app/` and `lib/` that imports
   `approvalFor`, `replayApproval` or `verifyManagerPin` (except `manager-pin.ts`) also references `auditOverrideApproved`.
3. **Source `retail-activity`** — `lib/reports/definitions/retail/activity.ts` + loader `lib/reports/loaders/retail/activity.ts`
   with database-side `page(ctx, query)` exactly as §4.4: where = `companyId` and ((`eventType` starts with `RETAIL_` and not
   `auth.*`) or `payloadJson` starts with `{"module":"retail"`); tabs Everything / Overrides (`RETAIL_OVERRIDE.APPROVED`) /
   Prices (`RETAIL_PRICE.*`, `RETAIL_PRICE_LIST.*`, `RETAIL_PRICE_APPROVAL.*`) / Settings (the list in §5.9.1); tab counts by four
   `count()`s over what the caller may see (ignoring search and filters); filters `q` (payload, reason, entityType
   case-insensitive, and actor names resolved to ids first), `who` (person id | `support` | `automatic` | `any`), `kind`
   (§5.9.2 table), `when` (period, default `30d`; Today, Yesterday, Last 7 days, Last 30 days, This month, Last month, Any time,
   a range), `where` (`any`, `admin`, `phone`, `support`, `automatic`, a till id), `site`, `entity` (parent filter
   `<EntityType>:<id>`); sorts newest/oldest; group none/day/who/what/where; order `createdAt` then `id`; site scoping for
   limited managers `OR(siteId in theirs, actor = them)` using ADM-02's `lib/retail/people/scope.ts`. Rows `{ id, when, who,
   what: { label, tone }, record: { label, mono, href|null }, change, where }`. Export through FND `POST
   /api/v2/reports/retail-activity/export` (W-55).
4. **Words.** `lib/retail/activity-words.ts` gains `LIST_WORDS` (What + tone, Record label, Change sentence) for every event
   type, verbatim §5.9.4 table, including the fallback rows; Who = `payloadJson.actorName` else the user's name by `actor`,
   "Automatic" when `actor` is null, "<First name>, Corelith support" with `payload.support`; Where from `source`/`registerName`.
   Record href: the record page (Product → `/retail/products/<id>`, RetailSale, RetailShift, RetailStockCount,
   RetailPurchaseOrder …), settings → the settings page, purged → no link (faint).

API:
| Method · path | Permission | Query | Success | Errors |
|---|---|---|---|---|
| GET `/api/v2/reports/retail-activity` | `retail.activity:view` | list query above, `page`, `size` | `ListPageResponse` (rows, `tabs`, `totals.count`) | 403 "Your role cannot view activity" |
| POST `/api/v2/reports/retail-activity/export` | `retail.activity:view` | FND 4.2 | file | FND |
No write endpoint: events cannot be changed or deleted.

## UI
- `app/preferences/organization/activity/page.tsx`: for a RETAIL workspace (session `workspaceProfile`), render
  `<PreferencesShell>` with `<ListFrame source="retail-activity" title="Activity" />` at full content width (no 620px
  `FormPage`); otherwise today's `ActivityPreferences`. `lib/preferences/nav.ts` `canViewPreferenceItem("activity")`: for RETAIL,
  `retail.activity:view` from the matrix (so managers and the bookkeeper see it); others unchanged (`isOrgAdminRole`).
- With `?entity=` the header sub reads "For <record label>" ("For Amarula Cream 750ml", "For Company settings") and the sub link
  "Show everything" clears it. Row ⋯: "Open the record", "Show only this record". Rows have no link of their own; the Record
  cell links. Totals "Σ n" (count only). Bulk "Export". Phone cards: When · Who, What badge, Record link, Change, Where right.
- Links into it: the record Activity tab's "All activity" link (`components/record-frame/record-tabs.tsx`) and the settings
  frame's Activity link (if the frame draws one) → `/preferences/organization/activity?entity=<Type>:<id>`
  (`RetailSettings:<page>` for settings). Grep for any `manage/activity` link and point it here.

## Reuse
`components/list-frame/*`, `components/preferences/preferences-shell.tsx`, `lib/activity/context.ts`, `lib/activity/describe.ts`
(generic rows' model words), `lib/retail/activity-words.ts` (FND record sentences), `lib/retail/record-activity.ts` (entity →
read right), `lib/retail/people/scope.ts` (site scope), `lib/retail/manager-pin.ts`, `lib/retail/audit.ts`.

## Remove
- For RETAIL workspaces, the generic `ActivityLog` body on `/preferences/organization/activity` (other products keep it).
- Nothing else: the route stays (it is Management's), `/api/activity` stays for other products.

## Seed
`seedActivity()` verbatim §3.6 ADM-06 table: the six board rows written through `writeRetailAuditEvent` with the board's time
and `source`, only when an equivalent event is absent and only when the owning seed made the entity (RFD-0045 — FLR-02;
CNT-0020 — STK-05/06; SH-00239 — floor seed; the Nederburg Rosé binning — ADM-07 seed; the 12:20 price change through PRD-07's
scheduling service once it exists); a missing entity skips its row with a printed warning. Tab counts are whatever the chain
holds.

## Tests
- Witness (above).
- `lib/retail/activity-words.test.ts`: every constant in `RETAIL_AUDIT_EVENTS` has a `LIST_WORDS` entry; the §5.9.4 sentences
  for override acts (refund over limit, void, discount, drawer, cash-out, adjustment), price changed (+ scheduled, + approved by),
  shift closed (short/over/balanced/not counted), settings (one toggle, one value, several "and 2 more"), support rows.
- `lib/reports/loaders/retail/activity.test.ts`: tab conditions; `kind` mapping; `who=automatic` (null actor); limited manager
  sees own + site events only, no siteless events; `entity` filter; `auth.*` excluded; paging stable with equal timestamps.
- `lib/retail/audit.test.ts`: `source` TILL/PHONE/ADMIN/SUPPORT/SYSTEM from the request context; `siteId` column written.
- `lib/retail/override-audit.test.ts`: (a) static import rule above; (b) a refund over the till-rules limit approved with a
  manager PIN writes exactly one `RETAIL_OVERRIDE.APPROVED` with actor = approver, `askedBy` = cashier, reference and amount, in
  the same transaction (roll the act back → no event); (c) a refused PIN writes none.

## Acceptance
1. Migration applied (dev + test); witness green; reseed.
2. As owner, `/preferences/organization/activity` (When: Last 30 days) vs `ActivityList.png`: title, four tabs with counts,
   toolbar words incl. "Filters 1", columns, the seeded rows whose entities exist, with the board's words and tones (e.g.
   "Yesterday 21:58 · Chipo Dube · Closed a shift · SH-00239 · Short −US$20.00 · Front till" and "2 Oct 08:15 · Changed a setting ·
   Company · Empties and deposits: on · Admin").
3. Till walk: as `chipo.till@` on a paired browser till, refund over the "Manager PIN for refunds over" limit, approve with
   Tafara's PIN → Activity › Overrides gains one row "Today hh:mm · Tafara Nyathi · Manager PIN at the till · RFD-… · Refund
   US$… over the US$… limit · Front till"; the Overrides count +1; DB: one event, `siteId` = the till's site.
4. Tabs and filters: Overrides only overrides; Prices only price events; Settings only settings; Kind "People" only
   `RETAIL_PERSON.*`; Who "Rudo Moyo" only hers; a record link opens its record; from a product's Activity tab "All activity" →
   `?entity=Product:<id>` with "For <name>" and "Show everything".
5. As `tafara.manager@` (Harare Main Branch only): no Borrowdale event, no company-settings event, own events present. As
   `bookkeeper@`: all rows, no action changes anything. As `chipo.till@`: no Activity item; API → 403 "Your role cannot view
   activity".
6. Export › Spreadsheet downloads the filtered rows with the same columns.
7. Other products: a non-retail tenant's `/preferences/organization/activity` is unchanged.
8. `npx eslint <changed>`; `npx vitest run lib/retail/activity-words.test.ts lib/retail/audit.test.ts
   lib/retail/override-audit.test.ts lib/reports/loaders/retail/activity.test.ts lib/audit`; `pnpm typecheck` alone.

## Depends on
ADM-01, ADM-02 (scope, people), FND-04/05/06 (landed); SET-04 (register on the session, landed); SET-06 (`manager-pin.ts`,
landed); STK-04 (its adjustment override gets the audit call — must be on main, else that caller is added by STK-04 later and
the static test fails it). Holds the till file lock (T) for the override calls.

## Risk
money (touches the till's refund/void/discount/drawer transactions). Pitfalls: the audit write must be inside the act's
transaction and after the act's record exists (the entity id is the refund/void sale); `siteId` must stay out of the hash; the
backfill must not fail on non-JSON payloads; generic activity rows (`module: "retail"`) are included, `auth.*` excluded.

## Open questions
- **Where the page lives (resolved):** the spec's `/retail/manage/activity` and Management-panel item conflict with the owner's
  5 October direction (#2: activity is Management's and is not rebuilt; #3: the Setup list has no Activity). Resolved by
  extending Management's own Activity page for retail workspaces; every link the specs wrote as `/retail/manage/activity…` uses
  `/preferences/organization/activity…` instead (packets 35, 42 and ADM notifications included).
- The 15-minute PIN lock wording is ADM-03's (landed); nothing here.
