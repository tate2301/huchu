# 00 Foundations: the theme, the shell and the frames every retail page sits on

Handover spec for the "Corelith data tables" canvas, version 32. This document is the
foundation the eight area specs (`01-…` to `08-…`) build on. It decides:

- the **theme**: role tokens per product, set on the root from the workspace profile, Tender
  light and dark for retail, Corelith for every other product;
- the **shell**: rail, module panel and page header, the same for every product;
- the **frames**: ListFrame, RecordFrame, SheetForm, ConfirmDialog, SettingsFrame,
  DashboardFrame, and the guided pieces (setup checklist, empty-list guide);
- the **engine** under every list: report sources from `lib/reports`, paged on the server;
- the **cross-cutting workflows**: export anything (W-55), read a record's activity (W-60),
  edit a record's details in place (W-62), move to the bin and restore (W-63), and the setup
  checklist after first-run setup (W-01, the "after" step).

Every pixel value, colour and word below comes from the boards unless it is marked
**Defined here** (the canvas shows the control but not its contents) or **G1** (the Corelith
Workspace design-system decision: a selected choice is solid ink). Copy is quoted exactly;
sentence case everywhere; British English; no exclamation marks.

Canvas sources: `scratchpad/canvas-v32/project/*.dc.html`. Board images:
`scratchpad/shots-v32/<Board>.png` (TenderUI is `scratchpad/shots/TenderUI.png`; TenderBrand
and TenderArt have no render, read their source).
Corelith Workspace (G1) reference: `scratchpad/ws/project/` (`tokens.json`,
`components/bundle.css`, `README.md`) and its checks in `scratchpad/ws/check/*.png`.

## How the area specs use this

- Every list page in an area spec is a **list source** (section 5.4) plus the copy and
  data its board shows. Area specs do not draw toolbars, pagers, totals or cells.
- Every record page is a **RecordFrame** configuration (section 5.6). Every create and edit
  form is a **SheetForm** kind (section 5.7). Every settings page is a **SettingsFrame**
  (section 5.10). Overview and Insights pages are **DashboardFrame** pages (section 5.11).
- Routes follow the nav table in section 5.3.4. An area spec that wants a different path
  changes that table, not its own page.
- Permissions are checked on the server by `lib/retail/permissions.ts`. The frames hide
  what a role cannot do; hiding is never the check.

## Decisions at a glance

1. **One layout, a theme per product.** `<html data-product="retail" data-theme="tender">`
   is set by the root layout on the server from `Company.workspaceProfile`. Components only
   read role tokens (`--ground`, `--ink`, `--line`, `--action` …). The design-system
   package's own tokens (`--canvas`, `--brand`, `--action-primary-bg` …) are pointed at the
   roles, so every screen not yet moved follows the product too.
2. **Tender dark is a person's choice** (Light, Dark, Match the device) and exists only for
   products that have a dark theme: retail. It is applied before first paint.
3. **Fonts for every product**: Atkinson Hyperlegible Next 400/500/600 for words, IBM Plex
   Mono 400/500/600 for money, references, counts and times.
4. **Selected reads as selected (G1)**: the picked segment, an on switch, a chosen chip, the
   current panel item, the current step and the current page in a pager are solid ink
   (`--sel-fill`) with white text (`--on-sel`), weight 600. Selected rows and active filters
   stay a tint. Orange is spent once per screen, on the primary action, the focus ring and
   the ticks.
5. **The shell is the canvas's**: a 56px rail (logo tile, module marks, Management at the
   bottom), a 240px module panel (title with a collapse chevron, 34px items with badges),
   and a 48px page header (back link, title, sub, sub link, actions, primary). The top app
   bar's search box, bell and check icon leave the header; the panel's search box, Help row,
   Management row and the rail avatar go. Their jobs move as listed in 5.3.6.
6. **Lists are report sources.** Each retail list is a `ReportDefinition` with a `list`
   block: columns with a cell kind, a server loader, filters, tabs, sorts, groups, bulk
   actions. `/api/v2/reports/[key]` returns one page of rows plus totals over every filtered
   row, group subtotals and tab counts. Export reuses the reports export.
7. **Sheets open over the page they came from** and are addressable: `?sheet=<kind>&id=<id>`.
8. **Activity is the audit chain.** A record's Activity tab reads `PlatformAuditEvent` for
   that entity. Inline edits, bin moves and restores write events.
9. **Routes are module-prefixed** (`/retail/products/…`, `/retail/stock/…`,
   `/retail/buying/…`, `/retail/manage/…`); the floor's pages sit at `/retail/…`. Retail
   settings leave the full-screen Settings dialog and become the Management module.

---

## 1. Boards

Canvas reading order: the "Data tables" page, then "Templates", then "Tender", then the
frame references from other pages. "Code status today" was checked against the running app
(screenshots in `scratchpad/fnd/`) and the source at `c78d01f`.

| # | Board file | Canvas title | What it is | Target route, or where it opens | Code status today | Notes |
|---|---|---|---|---|---|---|
| 1 | `Main.dc.html` | Shifts — live (press Play) | list | `/retail/shifts` | Exists but differs: `/retail/shifts` is a two-line register (shift no. + cashier, till and site stacked), no tabs/toolbar filters other than search, no sort/group/columns/export, no selection, no totals band, no pager; "42 of 42" count only; Corelith-blue theme; money printed `$368.35` | The reference list for ListFrame (section 5.5). Its header and panel predate the latest shell ("Jump to anything", bell, panel search, Help and Management rows, avatar); the shell follows `List.dc.html` (decision 5). |
| 2 | `Selected.dc.html` | Shifts — three rows selected | list (state) | `/retail/shifts` with SH-00238, SH-00236, SH-00228 ticked | Missing: no row selection | Selection bar replaces the toolbar; a tinted line above the totals sums the ticked rows. `shots-v32/Selected.png` shows the rest state (the renderer drops the wrapper's props); the ticked state is rendered at `scratchpad/fnd/Main-selected.png`. |
| 3 | `Grouped.dc.html` | Shifts — grouped by state | list (state) | `/retail/shifts?group=state` | Missing: no grouping | Group headings pinned under the column head, each with chevron, dot, label, count and subtotals. Rendered at `scratchpad/fnd/Main-grouped.png` (and Tender dark, ticked and grouped, at `scratchpad/fnd/Main-dark-selected-grouped.png`). |
| 4 | `Narrow.dc.html` | Shifts at 1024px — controls folded | list (state) | `/retail/shifts` at 1024px | Missing: no folding | View holds sort, group, columns; Filters takes Till and Cashier; Till, Duration and Opened leave the table. |
| 5 | `Anatomy.dc.html` | Anatomy of a worksheet | explainer | Rules for every list | Missing | Seven bands with heights (48, 48, 34, 36, 40/44, totals, 48). |
| 6 | `Cells.dc.html` | Form follows function — cells | explainer | The cell resolver | Partly: `components/records/record-table.tsx` `RecordCell` draws text, code, money, number, date, email, phone, relation; it has no state badge tones, signed difference, duration, owed, cover bar, and a stacked second line is used on retail registers | Section 5.4.7 is the resolver. |
| 7 | `Paging.dc.html` | Pagination, not infinite scroll | explainer | The pager rules | Missing: no retail list pages | Ten numbered rules, all in 5.4.9. |
| 8 | `Mobile.dc.html` | Shifts on a phone | list (mobile) | `/retail/shifts` at 390px | Exists but differs: the register collapses to rows but has no toolbar filters, totals line or pager | Cards, totals on one line, `‹ 1 of 7 ›`. |
| 9 | `Tokens.dc.html` | Themes per product | explainer | The theme mechanism | Missing: one Corelith-blue palette for every product (`@corelithzw/react` tokens plus `app/themes/corelith-bridge.css`) | Section 5.1. |
| 10 | `Dark.dc.html` | Shifts — Tender dark | list (state) | `/retail/shifts`, appearance Dark | Missing: the app is light-only (`components/providers/appearance-provider.tsx` accepts only "light") | Tender dark tokens in 5.1.2. |
| 11 | `Corelith.dc.html` | Shifts — Corelith theme, same layout | list (state) | Any ListFrame page in a non-retail product | Missing | Proves the layout does not change with the theme. |
| 12 | `List.dc.html` | List: every working list | template (30 kinds) | Every list page in every area | Missing as a frame; retail lists are `RecordListShell` + `ColumnList` registers | The source of the latest shell (rail, panel, header). |
| 13 | `Record.dc.html` | Record: every record | template (13 kinds, 4 confirmations) | Every record page | Exists but differs: bespoke retail record pages (e.g. `/retail/catalog/[id]` is a field list with a photo box; `/retail/purchasing/orders/[id]`) with no strip, KPI strip, chart, tab tables or details rail edited in place | Section 5.6. `LINK` maps action labels to sheets; `ASKS` holds the confirm dialogs. |
| 14 | `Sheet.dc.html` | Sheet: every create and edit form | template (66 kinds) | A side sheet over the page it came from | Exists but differs: retail forms are centred dialogs (`components/crm/records/record-dialog`, `components/retail/product-dialogs.tsx`) | Section 5.7. The board shows the `supplier` kind over the Suppliers list. |
| 15 | `TenderBrand.dc.html` | Tender — brand | explainer | Brand rules | Missing | Colours, type, voice. Tomato `#D9381B` is the mark's only; the interface uses orange. |
| 16 | `TenderArt.dc.html` | Tender — art direction | explainer | Empty states and first runs | Missing | No isometric drawings ship in the repo; the empty state uses the list's own icon instead (5.12.2). |
| 17 | `TenderUI.dc.html` | Tender — in the product | explainer | Components in Tender | Missing | Actions, states, controls, empty state. |
| 18 | `Flow.dc.html` | not placed on the canvas ("From the supplier to the owner's overview") | explainer | none | n/a | An orphan file in the project folder (no entry in `canvas.json`). Nothing to build. |
| 19 | `Guided.dc.html` | After: the setup checklist and empty-list guides | dashboard fragment + empty state | Overview `/retail` (checklist card); every list with no rows (guide) | Missing: `/retail/setup` redirects into the Settings dialog; empty lists show `NothingYet` | Section 5.12. The page around it belongs to the floor spec. |
| 20 | `CompanySettings.dc.html` | Company: the business type switches liquor features on | settings | `/retail/manage/company` | Exists but differs: business type and liquor switches are in the full-screen Settings dialog (`/retail/setup/operations` via `components/retail/shop-settings.tsx`, `shop-profile-fields.tsx`); company details in `/preferences/organization/branding` | The SettingsFrame reference (5.10). Content is W-02 (setup spec); this spec converts the page as the frame's proof. |
| 21 | `Floor.dc.html` | Overview | dashboard | `/retail` | Exists but differs: P&L cards (sales, gross, operating, net profit), a two-row Needs action table, a tenders table; no period toolbar, KPI tiles, charts, tills now, top lists; theme blue | DashboardFrame tile kinds (5.11). Content is the floor spec's. |
| 22 | `InsightsSales.dc.html` | When do we sell? | dashboard (insight) | `/retail/insights/sales` | Exists but differs: period as a dropdown chip instead of a segmented control; no "Compared with…" line or "Updated" time; heat grid blue and 24 hours; tabs as pills; table has no totals row or Export; aside links plain; no "Send me this" | DashboardFrame insight variant (5.11.3). Content is the insights spec's. |

---

## 2. Workflows

Only the workflows whose screens are frames, plus the frame behaviours every workflow
leans on. Area workflows (W-02 … W-76) are in the area specs; they reference these.

### W-55 Export anything — **Anyone** — any list or record

| Step | Who sees | What the server does |
|---|---|---|
| 1. Export | Any role that can view the list | Nothing yet. The toolbar's **Export** opens a menu headed "The 312 shifts the filters show" (count and noun from the current page response). |
| 2. Spreadsheet, CSV or PDF | same | `POST /api/v2/reports/[key]/export` with `{format, query}` (the list's current tab, filters, search, sort, group, visible columns) or, from the selection bar, `{format, query, rowIds}`. The server re-fetches the rows through the same loader under the same permission check, applies the same view (`lib/reports/view.ts` `applyView`), drops columns the role may not see (cost), and streams the file: `.xlsx` via `lib/reports/export-xlsx.ts` `buildWorkbook`, `.csv` via `exportRows`, `.pdf` via `exportDocument` with the company's document branding. File name `<title-slug>_<from>_<to>.<ext>` (`exportFileName`). |
| 2b. From a record | same | A record's ⋯ "Export as PDF" calls `GET /api/v2/retail/records/[type]/[id]/pdf` (area-owned renderer; foundations only fixes the path and the response: `application/pdf`, `attachment; filename="<ref>.pdf"`). A record tab's **Export** exports that tab's table through its own source key with the source's parent filter set (`query.filters = { shiftId: <id> }`). |

Side effects: none on data. An audit event `RETAIL_EXPORT.DOWNLOADED` `{key, format, rows}`
is written (entity `ReportSource`, id = key) so an owner can see who took the customer list
home. Permissions: the list's own read check; cost columns are stripped for roles without
`view-cost`. **Works in code today**: the reports export endpoint, for reports only; no retail
list has Export.

### W-60 Read the audit trail (record part) — **Owner; Manager for their sites; Bookkeeper** — any record › Activity

| Step | What the server does |
|---|---|
| What changed | The record's **Activity** tab calls `GET /api/v2/retail/records/[type]/[id]/activity?page=1&size=10`. The server checks the role can read the record **and** holds Activity read (owner, manager, bookkeeper per the Roles board; managers only for records on sites they manage once sites are scoped, until then all), then reads `PlatformAuditEvent` where `companyId`, `entityType`, `entityId` match, newest first. |
| Who | Each event's `payloadJson.actorName` (written by `writeRetailAuditEvent`), falling back to the user's name by `actor` id; "Automatic" when `actor` is null. |
| When | `createdAt`, drawn "3 Oct 13:12" in the company's time zone. |

The sentence for each event type comes from one table, `lib/retail/activity-words.ts`
(5.6.9). The full Activity list (Management › Activity, W-59/60) is the admin spec's.
**Works in code today**: no; events are written for sales, shifts, cash, receipts, order
close/reopen and shop profile changes, but nothing reads them per record.

### W-62 Edit a record's details — **Anyone allowed to** — any record, its details rail

| Step | UI | Server |
|---|---|---|
| Click the value | The value in the details rail turns into an input of its field type (30px, accent border) with an ink save button. Rows the role may not change render as plain text with no pen. | — |
| Change it | Typing; for an `auto` field the same autocomplete with inline add as sheets. | Lookups as in 5.7.5. |
| Enter saves, Esc cancels | Enter or the save button sends; Esc restores the old value. On success "Saved" (ok, 11px) appears under the label until another value is edited. On a refusal the message shows under the input in `--bad` and the input stays open. | `PATCH` on the record's own endpoint (area-owned, e.g. `PATCH /api/v2/retail/catalog/[id]`) with `{ "<field>": value }`. The handler checks `requireRetailPermission(session, resource, "update")`, refuses a binned record with 409 "Restore it to change it", validates with the field's zod schema, writes, and in the same transaction appends `RETAIL_RECORD.EDITED` `{entityType, entityId, field, label, from, to}` via `writeRetailAuditEvent`. Returns `{ data: <record view>, changed: [{ field, from, to }] }`. |
| Logged in Activity | The Activity tab count rises by one; the event reads "Changed Price from US$17.99 to US$18.25". | — |

**Works in code today**: partly. C7 shipped inline edit on the product record and bin
restore for products, promotions and categories, without the audit event and not in the
canvas rail.

### W-63 Delete and restore (record part) — **Managers and owners** — any record, ⋯ menu

| Step | UI | Server |
|---|---|---|
| Move to the bin | ⋯ › "Move to the bin" (danger, trash icon) with "Managers and owners only" under it. Opens the ConfirmDialog `bin` ask (5.8). | — |
| Confirm | "Move to the bin" (danger fill). | `POST /api/v2/retail/bin` `{kind, id}`. Checks the kind's delete right (owner, manager per Roles: "Bin: Owner R U D, Manager R U" — moving to the bin is the record's D, which managers and owners hold). Sets `archivedAt = now()` through the kind's own service (products also leave the till: `archiveShelfListing`), writes `RETAIL_RECORD.BINNED` `{kind, name}`, returns `{ binnedAt, keptUntil }` (`binnedAt + 30 days`). |
| Gone from lists, kept 30 days | The record stays open with the bin banner (5.6.3) and its body dimmed. Every list's loader excludes `archivedAt is not null`; lookups exclude it. | — |
| Restore from the bin or the record | Banner **Restore**. | `POST /api/v2/retail/bin/restore` `{kind, id}`. Refuses after 30 days with 410 "It has been in the bin more than 30 days". Clears `archivedAt` through the kind's service, writes `RETAIL_RECORD.RESTORED`, returns `{ restored: true }`. The banner leaves; a toast "Restored. It is back in every list." |

The bin list itself (Management › Bin) and "delete for good" (owner only) are the admin
spec's. **Works in code today**: restore for product, promotion, category via
`POST /api/v2/retail/bin` (which this spec moves to `/bin/restore`); moving to the bin is per
kind (`PATCH … {archived: true}`); no banner, no 30-day rule, no audit.

### W-01 (after) The setup checklist and empty-list guides — **Owner** — Overview, and every empty list

| Step | UI | Server |
|---|---|---|
| The card | "Finish setting up" card at the top of the Overview with a progress bar and "4 of 7". | `GET /api/v2/retail/setup/checklist` computes seven items from data (5.12.1). Owner only (403 otherwise; the card is not drawn). |
| A step | Each undone item has a button that opens the page or sheet that does it. | None; items tick themselves when their data exists. There is no manual tick. |
| Hide until tomorrow | The card hides until the next local day. | None: stored per person in `localStorage` (`huchu.retail.checklist.hiddenUntil.<companyId>`). |
| Done | When all seven are done the card is never drawn again. | Derived. |
| Empty list | A list with no rows at all shows its guide in place of the table (5.12.2). | The page response has `total = 0` and `everEmpty = true` (no rows without filters). |

**Works in code today**: no.

### F-1 Find, narrow, group and page a list (frame behaviour, every list)

1. Type in search (or press `/`): the list refetches with `q` after 250 ms idle; page resets to 1.
2. Pick a filter value from a chip, or from **Filters**: refetch, page 1, URL updated.
3. Pick a tab: refetch with `tab`, page 1.
4. Sort from the Sort button or a sortable column head; group from Group.
5. Page with the pager; change rows per page (25, 50, 100; remembered per list per person).
6. Every one of these is in the address (`?tab=&q=&<filter>=&sort=&group=&page=&size=`), so
   Back and a shared link land on the same page. Server: `GET /api/v2/reports/[key]` (4.1).

### F-2 Select and act (frame behaviour, every list with bulk actions)

1. Tick rows (Shift-click ticks a range); the selection bar replaces the toolbar.
2. "Select all 312" fetches every matching id (`idsOnly=1`, cap 5,000) and says so.
3. A bulk action opens its sheet, confirm or download with the ids. Server: the action's own
   endpoint, which receives `{ ids }` and re-checks permission and company on every id.
4. Ticks survive page changes, up to 500; the 501st tick shows a toast "You can tick up to
   500 rows. Use Select all to take every row the filters show." (**Defined here**.)

### F-3 Quick-add from an autocomplete (frame behaviour, every `auto` field)

1. Type in the field; options come from `GET /api/v2/retail/lookup/[noun]?q=`.
2. Nothing fits: "Add ‘Mixers’ as a new category" opens the inline quick-add panel.
3. "Add and use": `POST /api/v2/retail/lookup/[noun]` with the quick fields. The server runs
   the noun's own create service (the same one the noun's full sheet uses), with that
   noun's create permission, writes that service's audit event, and returns the new option,
   which the field selects.

### F-4 Choose how the app looks (frame behaviour, retail)

Account menu › Appearance › Light, Dark, Match the device. Stored in `localStorage`
`huchu.appearance`; applied before first paint by an inline script (5.1.4). No server.

---

## 3. Data

### 3.1 Models used

| Model | Used for |
|---|---|
| `Company` (`workspaceProfile`, `slug`, `name`) | Theme product, logo tile, nav profile |
| `CompanyBranding` (`legalName`, `tradingName`, `logoUrl`) | Logo tile initials and logo |
| `User` (`role`, `name`) | Nav visibility, account menu, actor names |
| `PlatformAuditEvent` | Record Activity tab, "Last changed by …" in settings, bin banner "moved by" |
| `RetailShift`, `RetailSale`, `RetailCashMovement`, `RetailRegister`, `Site` | The reference Shifts list and Shift record frame |
| `RetailRegister` | `till` lookup and quick add |
| `Product`, `RetailPromotion`, `RetailCategory` (`archivedAt`) | Bin move and restore (kinds that exist today) |
| `ReportTemplate` | Unchanged; list sources can be saved as templates through the reports spec |

### 3.2 Schema changes

One change. Everything else in this spec is code over existing models.

**PlatformAuditEvent: read a record's history by entity.** The Activity tab and "Last
changed by" query by `(companyId, entityType, entityId)`, newest first; today only
`(companyId, createdAt)` and `(eventType, createdAt)` are indexed.

```prisma
model PlatformAuditEvent {
  id            String   @id @default(uuid())
  companyId     String?
  actor         String?
  eventType     String
  entityType    String?
  entityId      String?
  reason        String?
  payloadJson   String?
  eventHash     String   @unique
  prevEventHash String?
  createdAt     DateTime @default(now())

  company Company? @relation(fields: [companyId], references: [id], onDelete: SetNull)

  @@index([companyId, createdAt])
  @@index([eventType, createdAt])
  @@index([companyId, entityType, entityId, createdAt])
}
```

Migration folder: `prisma/migrations/20261004130000_audit_entity_index/migration.sql`

```sql
-- CreateIndex
CREATE INDEX "PlatformAuditEvent_companyId_entityType_entityId_createdAt_idx"
  ON "PlatformAuditEvent"("companyId", "entityType", "entityId", "createdAt");
```

Witness test (same commit): `lib/audit/audit-entity-index-migration.test.ts` asserts, via
`pg_indexes`, that `PlatformAuditEvent_companyId_entityType_entityId_createdAt_idx` exists
on `"PlatformAuditEvent"` with columns `("companyId", "entityType", "entityId", "createdAt")`.
Apply with `npx prisma migrate deploy` and again against `DATABASE_URL_TEST`.

**Not schema** (decided, so nobody adds a table for them):

| Thing | Where it lives |
|---|---|
| Who moved a record to the bin, and when it is kept until | The latest `RETAIL_RECORD.BINNED` event for the entity, and `archivedAt + 30 days` |
| Rows per page, hidden columns, panel collapsed, checklist hidden until | `localStorage`, per person per company (`huchu.list.<key>.size`, `huchu.list.<key>.cols`, the shadcn `sidebar_state` cookie, `huchu.retail.checklist.hiddenUntil.<companyId>`) |
| Appearance (Light, Dark, Match the device) | `localStorage` `huchu.appearance`, as today |
| Nav badges, checklist items | Computed per request |

### 3.3 Audit event types added (code, `lib/retail/audit.ts` `RETAIL_AUDIT_EVENTS`)

| Constant | Event type | Payload |
|---|---|---|
| `recordEdited` | `RETAIL_RECORD.EDITED` | `{ entityType, field, label, from, to }` (money as strings, `auditAmount`) |
| `recordBinned` | `RETAIL_RECORD.BINNED` | `{ kind, name }` |
| `recordRestored` | `RETAIL_RECORD.RESTORED` | `{ kind, name }` |
| `settingsChanged` | `RETAIL_SETTINGS.CHANGED` | `{ page, changes: [{ field, label, from, to }] }`, entity `RetailSettings`, id `<page>` (e.g. `company`) |
| `exportDownloaded` | `RETAIL_EXPORT.DOWNLOADED` | `{ key, format, rows }`, entity `ReportSource`, id = source key |

`lib/retail/audit.test.ts` asserts the full list; update it in the same commit.

### 3.4 Seed and demo data

Extend `scripts/seed-retail-demo.ts` (run with
`pnpm tsx scripts/seed-retail-demo.ts --slug hurudza-creative --days 160 --reset`) so the
foundation boards show their rows on the Harare Bottle Store tenant:

| What | Today | Seed it as |
|---|---|---|
| Logo tile | "HS" from "Harare Bottle Store" | `CompanyBranding.legalName = "Hurudza Creative (Private) Limited"`, `tradingName = "Harare Bottle Store"`; the tile reads "HC" (5.3.2) |
| Main site | `MAIN` "Samora Machel Bottle Store" | `MAIN` "Harare Main Branch"; add `BORROWDALE` "Borrowdale" |
| Tills | `TILL-1` "Front till" | `TILL-1` "Front till", add `TILL-2` "Back till" (both at Harare Main Branch) |
| Shifts | 1–2 a day on Front till, 42 in 30 days, one open | Two a day for 160 days, alternating Front till (morning) and Back till (evening) — about 312 — cashiers Chipo Dube, Farai Moyo, Tafara Nyathi; variances: about one in fourteen short (−US$0.50 to −US$12.00), one in twenty over (+US$0.50 to +US$45.00), three closed without a count (`countedCash` and `variance` null), the rest balanced |
| Open shifts | one | two: Front till, Chipo Dube, opened today 07:58 (still trading); Back till, Farai Moyo, opened 52 hours before the seed time (stale). The nav badge reads "2 open" |
| Owner | Tendai Mhlanga, `SUPERADMIN` | unchanged; the "Last changed by Tendai Mhlanga, 2 October." line on Company needs one `RETAIL_SETTINGS.CHANGED` event dated 2 October by the owner |

Area specs add their own rows (suppliers, lay-bys, accounts …) to the same script.

---

## 4. API

Conventions for every endpoint here and in the area specs:

- Session via `requireRetailSession` (retail) or `validateSession`; permission via
  `requireRetailPermission(session, resource, action)` which answers 403
  `{ "error": "Your role cannot <verb> <noun>" }`.
- Success through `successResponse` (decimals serialised as numbers to two places).
- Errors through `errorResponse(message, status, details?)`:
  400 `{ error: "Validation failed", details: zodIssues }` or, for forms,
  `{ error, fieldErrors: { <field>: "<sentence>" } }`; 401 no session; 403 as above;
  404 `{ error: "<Noun> not found" }`; 409 state conflicts with a sentence the UI shows as is.
- Every query is scoped by `session.user.companyId`; ids from the client are re-checked
  against it. Every write that changes money, stock or a record's state writes its audit
  event inside the same transaction.

### 4.1 `GET /api/v2/reports/[key]` — a list page (changed)

Today it returns every row (≤5,000) and the browser applies the view. It gains a **list
mode**, entered when `page` is present. Report mode (no `page`) is unchanged for the
Reports screens.

Query parameters (list mode):

| Param | Meaning | Default |
|---|---|---|
| `page` | 1-based page | 1 |
| `size` | 25, 50 or 100 | 50 |
| `tab` | a tab key from the source | the source's first tab |
| `q` | search text, matched case-insensitively against the source's `searchKeys` | empty |
| `sort` | a sort key from the source's `sorts`, or `<column>:asc|desc` for a sortable column | the first sort |
| `group` | a column key from the source's `groups`, or `none` | the source's default, usually `none` |
| `<filterKey>` | for a `choice` filter: an option value or `any`; for a `period` filter: `today`, `yesterday`, `7d`, `30d`, `this-month`, `last-month`, `this-year`, `any`, or `YYYY-MM-DD..YYYY-MM-DD` | the filter's default |
| `cols` | comma-separated hidden column keys (only to narrow what export and search read) | from the source |
| `idsOnly` | `1` returns ids of every row that matches, not a page | — |
| `<parentKey>` | a `parent` filter (never drawn): the record a record tab or an "all" link is scoped to, e.g. `shiftId=<uuid>` | none |

Unknown params and values a source does not declare are ignored and replaced by the default
(the reports rule "only the params a source declares, each checked, each defaulted").

```ts
type ListQuery = {
  tab?: string; q?: string; sort?: string; group?: string;
  page: number; size: 25 | 50 | 100;
  filters: Record<string, string>;   // choice, period and parent filters by key
  hidden?: string[];                 // hidden column keys
};
```

Response 200:

```ts
type ListPageResponse = {
  report: ReportMeta & { list: ListSpecPublic };   // columns the role may see; choice filter options resolved for this company
  query: ListQuery;          // the query as resolved (defaults filled) — the client writes it back into the URL
  page: number;
  size: 25 | 50 | 100;
  total: number;             // rows after tab, filters and search
  pages: number;
  rows: ReportRow[];         // this page only, in order (grouped: ordered by group, then by sort)
  groups: Array<{            // null when not grouped; every group in the filtered set, in drawing order
    value: string | null;
    label: string;           // "None" for blank
    tone: Tone | null;       // from the column's tones, for the heading dot
    count: number;           // rows in the whole group, not just this page
    totals: Record<string, ReportValue>;
  }> | null;
  totals: Record<string, ReportValue>;               // over every filtered row, never just this page
  summary: Record<string, { count: number; label: string; tone: Tone }>; // state columns, e.g. { state: { count: 23, label: "to check", tone: "pending" } }
  tabs: Record<string, number> | null;               // tab key → rows in that tab, ignoring search and filters
  everEmpty: boolean;        // the source has no rows at all, whatever the filters: draw the guide
  truncated: boolean;        // only for in-memory sources past REPORT_ROW_LIMIT; see 5.4.9
};
```

`idsOnly=1` response: `{ ids: string[]; total: number; capped: boolean }` (cap 5,000).

Errors: 401; 403 `{ error: "Your role cannot view shifts" }` (the source's read check);
404 `{ error: "Report not found" }` (unknown key, or a source switched off, or one the role may
not read — the same answer, as `fetchReport` does today); 500 `{ error: "Failed to load report" }`.

Server path: `lib/reports/request.ts` gains `fetchListPage(session, key, query)`:

1. `getReport(key)`; read check `canReadReport` (feature + roles) plus the source's
   `list.read` permission (`[resource, "view"]`) through `canRetailRoleDo`.
2. Resolve the query against the spec (`lib/reports/list-query.ts` `resolveListQuery`).
3. If the loader implements `page(ctx, query)`, return its result (database-side paging for
   big sources: sales, movements, activity). Otherwise load all rows with `load(ctx, params)`
   (≤5,000), turn the query into a `ReportView` with `listQueryToView(spec, query)`, run
   `applyView`, compute `tabs` by applying each tab's conditions to the loaded rows, compute
   `summary` from the state columns, slice the page out of the ordered rows, and return.
4. Strip columns marked `requires: "view-cost"` (and their values) for roles without it.

### 4.2 `POST /api/v2/reports/[key]/export` (changed)

Body (zod):

```ts
{
  format: "xlsx" | "csv" | "pdf";
  template?: ExportTemplate;          // PDF layout, default "layout"
  query?: ListQuery;                  // list exports: exactly one of query or view
  view?: ReportView;                  // report exports (unchanged)
  params?: Record<string, string>;    // report exports (unchanged)
  rowIds?: string[];                  // ≤ 5,000: only these rows ("Export 3")
}
```

Response: the file, `Content-Disposition: attachment; filename="<slug>_<dates>.<ext>"`.
Groups print as headed sections with their subtotals; totals print as the last row.
Writes `RETAIL_EXPORT.DOWNLOADED` for retail sources. Errors: 400 "That export request could
not be read"; 403; 404 "Report not found".

### 4.3 `GET /api/v2/retail/nav/badges` (new)

The figures beside panel items. Computed per request for the caller's role; the client
caches 60 s (React Query key `["nav-badges"]`, refetch on focus, invalidated after any
mutation that changes one).

Response: `{ badges: Record<string, string> }` keyed by nav href, only non-empty ones:

```json
{ "badges": { "/retail/shifts": "2 open", "/retail/laybys": "3", "/retail/accounts": "1 overdue",
  "/retail/products/promotions": "3 on", "/retail/stock": "5 low", "/retail/stock/counts": "1 to approve",
  "/retail/buying/orders": "3 open", "/retail/buying/requisitions": "2 to approve", "/retail/buying/bills": "1 overdue",
  "/reports": "16", "/reports?area=selling": "4" } }
```

Each badge is a provider in `lib/retail/nav-badges.ts`:
`{ href, requires: [resource, action], count(ctx): Promise<number>, label(n): string }`.
A count of 0 returns nothing. Foundations ships the provider for Shifts
(`RetailShift` with `status = OPEN`, label `"<n> open"`, requires `retail.cash-control:view`,
or for a cashier their own open shift). Each area spec ships its own providers with the rule
its board implies; the table in 5.3.4 lists them all.

### 4.4 `GET /api/v2/retail/lookup/[noun]` and `POST /api/v2/retail/lookup/[noun]` (new)

The data behind every `auto` field and its inline add (F-3).

`GET ?q=<text>&limit=8&context=<json>` → `{ options: Array<{ id: string; label: string; sub: string | null }>, more: boolean }`.
Matches `label` case-insensitively, prefix matches first, then contains; excludes binned
and inactive rows; `context` narrows where a noun needs it (e.g. `{ "siteId": "…" }` for
places). 403 when the role cannot view the noun; 404 for an unknown noun.

`POST` body `{ fields: Record<string, string> }` (the noun's quick fields, keyed as in 5.7.5)
→ 201 `{ option: { id, label, sub } }`. Runs the noun's create service, with its create
permission and its audit event. 400 `{ error, fieldErrors }` (e.g. `{ name: "There is
already a category called Beer." }`).

Nouns are registered in `lib/retail/lookups.ts`:
`{ noun, read: [resource, "view"], create?: [resource, "create"], quick: QuickField[], search(ctx, q, limit, context), create?(ctx, fields) }`.
Foundations registers `till` (search `RetailRegister` by name, sub "Open" when a shift is
open on it, else "Closed"; quick fields `[["Name", ""]]`; create makes a register at the
user's default site with the next `TILL-<n>` code, permission `retail.setup:create`) and
`category` (search `RetailCategory`, sub "VAT 15%, age check" / "VAT 15%"; quick fields
`Name`, `VAT` (default "15%"), `18+ check` (default "Yes"); create via
`lib/retail/categories.ts`, permission `retail.catalog:create`). Area specs register
`supplier`, `site`, `customer`, `product`, `person`, `place`, `price list`, `account` with
their own create services.

### 4.5 `GET /api/v2/retail/records/[type]/[id]/activity` (new)

`?page=1&size=10` → 

```ts
{ total: number; rows: Array<{
    id: string; at: string;                 // ISO
    actor: { id: string | null; name: string }; // "Automatic" when null
    what: string;                           // "Changed Price from US$17.99 to US$18.25"
    tone: "ok" | "info" | "warn" | "bad" | "hollow";
    reason: string | null;
  }> }
```

`type` is the entity type as written in events (`RetailShift`, `Product`, `RetailPurchaseOrder`
…); a registry in `lib/retail/record-activity.ts` maps each type to the read check of its
record (`[resource, "view"]`) and whether the caller holds Activity read (owner, manager,
bookkeeper). 403 otherwise. 404 when the record is not this company's.

### 4.6 Bin: `POST /api/v2/retail/bin` and `POST /api/v2/retail/bin/restore` (changed)

`POST /api/v2/retail/bin` (was "restore"; now "move to the bin")
body `{ kind: BinKind, id: uuid }` → `{ binnedAt: string, keptUntil: string }`.
403 when the role lacks the kind's delete right; 404 "That is not this shop's"; 409 "It is
already in the bin"; per-kind refusals pass through (e.g. a category with products under it
answers 409 "Move or archive its 12 products first" — owned by the products spec).

`POST /api/v2/retail/bin/restore` body `{ kind, id }` → `{ restored: true }`. 403 without Bin
update (owner, manager); 404 "That is not in the bin"; 410 "It has been in the bin more than
30 days".

`GET /api/v2/retail/bin` (the Management › Bin list) stays and is the admin spec's.
`BIN_KINDS` grows as area specs make more records binnable; each kind registers
`{ kind, label, deleteRight: [resource, "delete"], move(ctx, id), restore(ctx, id), name(row) }`
in `lib/retail/bin.ts`.

### 4.7 `GET /api/v2/retail/setup/checklist` (new)

Owner only (`SUPERADMIN`; 403 for everyone else). Response:

```ts
{ done: number; total: 7; items: Array<{
    key: "shopType" | "products" | "till" | "staff" | "suppliers" | "fiscal" | "ecocash";
    label: string; done: boolean; why: string; href: string; cta: string; }> }
```

Rules in 5.12.1.

### 4.8 Shifts list bulk endpoints (new; the reference list's actions)

| Endpoint | Body | Does | Permission | Response |
|---|---|---|---|---|
| `POST /api/v2/retail/z-reports/print` | `{ shiftIds: uuid[] (≤500) }` | Finds the Z-reports of the register-days those shifts belong to (`RetailZReport` by `registerCode` + `businessDate`), renders them one per page through the existing Z-report renderer, returns one PDF | `retail.cash-control:view` | `application/pdf`; 409 `{ error: "None of these days has been closed yet." }` when no Z-report exists; when some days are not closed, header `X-Not-Closed: <n>` and the UI's toast says "<n> of these days are not closed yet." |
| `POST /api/v2/retail/z-reports/export` | `{ shiftIds, format: "csv" }` | The same Z-reports as rows: date, till, sales, takings, cash expected, counted, variance, by tender | same | `text/csv` |

"Copy shift numbers" and "Compare cashiers" need no endpoint (5.5.6).

### 4.9 Record inline edit (contract every area `PATCH` follows)

`PATCH /api/v2/retail/<resource>/[id]` body `{ "<field>": value }` (one field at a time from
the details rail; sheets may send several) →
`{ data: <the record as the page reads it>, changed: Array<{ field, from, to }> }`.
400 `{ error: "Validation failed", fieldErrors: { <field>: "<sentence>" } }`; 403; 404;
409 `{ error: "Restore it to change it" }` for a binned record. Writes `RETAIL_RECORD.EDITED`
once per changed field.

### 4.10 `GET` and `PATCH /api/v2/retail/settings/[page]` (new; the SettingsFrame contract)

One endpoint per settings page, so a page saves in one request and one transaction.
Foundations builds `company` (FND-08); the setup and admin specs add the other pages
(`payments`, `till-rules`, `receipts`, `fiscal`, `posting`, `approvals`, `loyalty`,
`billing`) on the same contract.

`GET` → `{ values: Record<string, unknown>; canEdit: boolean; lastChanged: { by: string; at: string } | null }`
(`lastChanged` from the latest `RETAIL_SETTINGS.CHANGED` event with entity
`RetailSettings`/`<page>`). Read: the roles in 5.3.4 for that page; 403 otherwise.

`PATCH` body `{ changes: Record<string, unknown> }` (only the changed fields) →
`{ values, lastChanged }`. Validates every field with the page's zod schema; 400
`{ error: "Validation failed", fieldErrors }`; 403 `{ error: "Your role cannot change company settings" }`.
Writes every changed field in one transaction and one `RETAIL_SETTINGS.CHANGED` event
`{ page, changes: [{ field, label, from, to }] }`.

`company` (owner edits; manager and bookkeeper read):

| Field | Stored in | Notes |
|---|---|---|
| `businessType` | `RetailShopProfile.businessType` via `saveShopProfile` | Also writes `RETAIL_SHOP.PROFILE_CHANGED` as today; switching seeds categories as C1/C2 do |
| `ageCheck`, `licenceHours`, `emptiesAndDeposits`, `casesAndSingles` | `RetailShopProfile` | |
| `weekdayHours`, `sundayHours` ("08:00 to 22:00") | `weekdayOpensAt`/`weekdayClosesAt`, `sundayOpensAt`/`sundayClosesAt` | Parsed "HH:MM to HH:MM"; 400 "Write it as 08:00 to 22:00." |
| `licenceNumber`, `licenceExpiresOn` | `RetailShopProfile` | Date typed "31 December 2026", stored as a date |
| `tradingName`, `legalName`, `registrationNumber`, `vatNumber`, `taxNumber`, `phone`, `email`, `address`, `logoUrl` | `CompanyBranding` (`tradingName`, `legalName`, `registrationNumber`, `vatNumber`, `taxNumber`, `phone`, `email`, `physicalAddress`, `logoUrl`) | The same fields `/preferences/organization/branding` edits |
| `currency`, `financialYearStarts` | `AccountingSettings.baseCurrency`, `fiscalYearStartMonth` | Read-only in FND-08 (drawn as `read`); the setup spec decides what changing them does |

---

## 5. UI

### 5.1 Theme (every page, every product)

#### 5.1.1 How the workspace picks it

From `Tokens.dc.html`, in its own words:

1. "The workspace's profile is its primary product: `RETAIL` is Tender, `SCHOOLS` is Campus."
   There is no Campus palette yet, so every profile other than `RETAIL` is Corelith.
2. "The root layout reads it on the server and sets `data-product` and `data-theme` on the
   page, so the first paint is already right."
3. "One CSS file per product sets every role. A typed list of the role names means a
   product cannot leave one out."
4. "Tailwind's theme maps its utilities onto the same roles, so a class like `bg-surface`
   follows the product without knowing which one it is."

Implementation:

| File | Change |
|---|---|
| `lib/theme/products.ts` (new) | `ROLE_TOKENS` (the typed list below, `as const`); `productForProfile(profile): "retail" \| "corelith"`; `themesForProduct(product): { light: "tender" \| "corelith"; dark: "tender-dark" \| null }`. |
| `lib/theme/products.test.ts` (new) | Parses `app/themes/roles.css` and asserts every theme block declares every name in `ROLE_TOKENS`, and nothing else. |
| `app/themes/roles.css` (new, unlayered) | Three blocks: `:root[data-theme="corelith"]`, `:root[data-theme="tender"]`, `:root[data-theme="tender-dark"]` with the values in 5.1.2, then one `:root[data-theme]` block pointing the package's tokens at the roles (5.1.3). Imported from `app/layout.tsx` after `corelith-bridge.css`. |
| `app/layout.tsx` | Reads the profile: `session?.user?.workspaceProfile`, else the host's company (`resolveWorkspaceIdentityForHost` gains `workspaceProfile` from `Company.workspaceProfile`). Renders `<html lang="en-GB" data-product={product} data-theme={lightTheme}>` and, in `<head>`, the inline appearance script (5.1.4). `viewport.themeColor` becomes `#faf7f4` for retail, `#f6f7f9` otherwise. |
| `lib/platform/workspace-identity.ts` | `WorkspaceIdentity.workspaceProfile: string \| null`. |
| `app/globals.css` | The hoisted Google Fonts import becomes `family=Atkinson+Hyperlegible+Next:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap` (Atkinson Hyperlegible Mono is dropped). The `@theme inline` block gains colour utilities for every role (`--color-ground: var(--ground)`, `--color-tray`, `--color-line`, `--color-line-soft`, `--color-line-strong`, `--color-ink-2`, `--color-ink-3`, `--color-faint`, `--color-action`, `--color-action-fill`, `--color-sel-fill`, `--color-on-sel`, `--color-sel-bg`, `--color-ok`, `--color-ok-soft`, `--color-info`, `--color-info-soft`, `--color-warn`, `--color-warn-soft`, `--color-bad`, `--color-bad-soft`, `--color-data`), and `--font-mono: "IBM Plex Mono", ui-monospace, Menlo, monospace`. |
| `lib/platform/branding.ts` `getBrandingCssVariables` | Stops emitting colour variables on `<body>`. A tenant's colour no longer re-tints the interface (the product theme does); the logo still shows in the logo tile and on documents. |
| `app/themes/corelith-bridge.css` | `--chrome-edge: var(--line)`; `--table-header-bg: var(--ground)`; `--table-divider: var(--line-soft)`; `--sidebar-panel-w: 240px`; `--sidebar: var(--ground)`; the three literal badge inks become `var(--ok)`, `var(--warn)`, `var(--bad)`. Nothing else: it already derives every legacy name from package tokens, which now derive from roles. |

#### 5.1.2 The roles and their values

`muted` on the canvas is `ink-3` here and `accent` is `action` (G1): the package already uses
`--muted` and `--accent` for shadcn backgrounds. New in this table beyond the canvas `.th`
blocks: `sel-fill`/`on-sel` (G1), `scrim`, `shadow-sheet`, the chart roles.

| Role | Used for (one line) | `corelith` | `tender` | `tender-dark` |
|---|---|---|---|---|
| `--ground` | Page ground; the strips that frame a table (column head, totals, group headings); panel | `#f6f7f9` | `#faf7f4` | `#171310` |
| `--surface` | Rows, sheets, cards, inputs, rail, header | `#ffffff` | `#ffffff` | `#1e1915` |
| `--hover` | A row or menu item under the pointer | `#f9fafb` | `#fbf8f5` | `#241e1a` |
| `--tray` | Count pills, tags, the currency prefix, read-only fields, segmented track | `#eef0f3` | `#f3eee9` | `#2a231f` |
| `--active` | A pressed control; the current rail mark; nav hover | `#e7e9ef` | `#efe8e2` | `#322a25` |
| `--selected` | A ticked row | `#f3f7fe` | `#fbf7f3` | `#241e1a` |
| `--line` | Band edges, card borders, rail and panel edges | `#e7e9ef` | `#ece6e0` | `#352d28` |
| `--line-soft` | Rules between rows | `#eef0f3` | `#f3eee9` | `#2a231f` |
| `--line-strong` | Control borders, the search box, button groups | `#d4d9e0` | `#ddd4cc` | `#4a403a` |
| `--ink` | Headings, the figure a row is about | `#0b0c14` | `#24140e` | `#fff8f1` |
| `--ink-2` | Body text and secondary values | `#3b3d47` | `#4a3a33` | `#e3d8d0` |
| `--ink-3` | Labels, hints, column heads, the time after a date (canvas "muted") | `#6b6d78` | `#75675f` | `#b0a39a` |
| `--faint` | Placeholders, the em dash, the row menu at rest | `#9aa1ad` | `#a89c94` | `#7d716a` |
| `--action` | Focus ring, ticks, the live marker (canvas "accent") | `#2563eb` | `#e8620f` | `#f07a2a` |
| `--action-fill` | The one primary button | `#2563eb` | `#b84a0c` | `#b84a0c` |
| `--on-action` | Text on the primary button | `#ffffff` | `#ffffff` | `#ffffff` |
| `--action-ink` | Action-coloured text: "Add ‘…’ as a new …" | `#1d4ed8` | `#a8420c` | `#f5a06a` |
| `--sel-fill` | A selected choice (G1) | `#0b0c14` | `#24140e` | `#fff8f1` |
| `--on-sel` | Text and icons on `sel-fill` | `#ffffff` | `#ffffff` | `#1e1915` |
| `--sel-bg` | Selection bar, an active filter, selected-totals line | `#e8effd` | `#f3eee9` | `#2a231f` |
| `--sel-line` | Edge of the selection bar and an active filter | `#bfd0f8` | `#ddd4cc` | `#4a403a` |
| `--sel-ink` | The value of an active filter; text on the selection bar | `#1d4ed8` | `#24140e` | `#fff8f1` |
| `--device` | The logo tile | `#2a2e37` | `#24140e` | `#0f0c0a` |
| `--info` / `--info-soft` | Still running | `#1d4ed8` / `#e8effd` | `#3d4fb8` / `#eceefb` | `#9aa7ff` / `#1f2340` |
| `--ok` / `--ok-soft` | Done, balanced, received | `#17734c` / `#e7f4ee` | `#17734c` / `#e7f4ee` | `#4cc38a` / `#15291f` |
| `--warn` / `--warn-soft` | A difference or a job not done | `#8a5a10` / `#fbf1dc` | `#8a5a10` / `#fbf1dc` | `#f0b44c` / `#33280f` |
| `--warn-dot` / `--warn-line` | Dot and outline of a warn state | `#c98a1b` / `#e3c58f` | `#e0a21a` / `#e8cf9a` | `#f0b44c` / `#5c4718` |
| `--bad` / `--bad-soft` / `--bad-dot` | Money missing, failed, destructive | `#b42318` / `#fdecea` / `#b42318` | `#a3122f` / `#fbe8ec` / `#c8203f` | `#ff7a8a` / `#3a1a20` / `#ff5c70` |
| `--data` | The one quiet series; the emphasised bar | `#4b5363` | `#4b5363` | `#b0a39a` |
| `--data-muted` | The other bars of a single series | `#8a93a3` | `#8a93a3` | `#6f645d` |
| `--data-compare` | The period before (dashed) | `#c9cdd4` | `#c9c0b8` | `#4a403a` |
| `--s1` `--s2` `--s3` `--s4` | Categorical series in fixed order: cash, EcoCash, card, ZiG | `#1baf7a` `#2a78d6` `#e87ba4` `#4a3aa7` | same as corelith | `#1baf7a` `#3b8ae6` `#d86a95` `#7a6ae0` |
| `--scrim` | Behind sheets and confirmations | `rgba(11,12,20,.32)` | `rgba(36,20,14,.32)` | `rgba(0,0,0,.55)` |
| `--shadow-float` | Menus, popovers, autocomplete lists, toasts | `0 0 0 1px #e7e9ef,0 14px 30px -18px rgba(11,12,20,.28)` | `0 0 0 1px #ece6e0,0 14px 30px -18px rgba(36,20,14,.3)` | `0 0 0 1px #352d28,0 18px 36px -16px rgba(0,0,0,.6)` |
| `--shadow-pin` | The totals band (rows run under it) | `0 -1px 0 #d4d9e0,0 -10px 18px -14px rgba(11,12,20,.35)` | `0 -1px 0 #ddd4cc,0 -10px 18px -14px rgba(36,20,14,.35)` | `0 -1px 0 #4a403a,0 -10px 18px -12px rgba(0,0,0,.55)` |
| `--shadow-sheet` | The sheet's left edge | `-24px 0 48px -24px rgba(11,12,20,.35)` | `-24px 0 48px -24px rgba(36,20,14,.35)` | `-24px 0 48px -24px rgba(0,0,0,.6)` |

The series palette was run through the dataviz validator: light passes every check with a
contrast warning for `#1baf7a` and `#e87ba4` against white, so every chart that uses them
also names each series with its value beside a swatch (the "How people paid" legend does);
the dark steps above pass every check against `#1e1915`.

#### 5.1.3 The package's tokens, pointed at the roles

In `app/themes/roles.css`, one block `:root[data-theme] { … }`:

| Package token | Becomes |
|---|---|
| `--canvas` | `var(--ground)` |
| `--surface` | the role itself (same name, same meaning) |
| `--surface-muted` | `var(--tray)` |
| `--surface-sunken` | `var(--active)` |
| `--surface-deep` | `var(--line-strong)` |
| `--border` | `var(--line)` |
| `--border-subtle` | `var(--line-soft)` |
| `--border-strong`, `--border-hover` | `var(--line-strong)` |
| `--hairline` | `var(--line)` |
| `--text-strong` | `var(--ink)` |
| `--text-body` | `var(--ink-2)` |
| `--text-muted`, `--text-subtle` | `var(--ink-3)` |
| `--text-inverse` | `var(--on-sel)` |
| `--text-link` | `var(--ink)` (links are ink, underlined in `--line-strong`) |
| `--ink`, `--ink-soft` | the role `--ink` (same name); `--ink-soft: var(--ink-2)` |
| `--brand`, `--clay` | `var(--action)` |
| `--brand-strong` | `var(--action-ink)` |
| `--brand-deeper` | `var(--action-fill)` |
| `--brand-soft`, `--brand-50`, `--brand-tint` | `var(--sel-bg)` (selection is never orange) |
| `--brand-100`, `--brand-200` | `var(--sel-line)` |
| `--action-primary-bg` | `var(--action-fill)` |
| `--action-primary-hover`, `--action-primary-pressed` | `color-mix(in oklab, var(--action-fill) 88%, #000)` |
| `--action-primary-fg` | `var(--on-action)` |
| `--action-secondary-bg` / `-bg-h` / `-fg` | `var(--surface)` / `var(--hover)` / `var(--ink)` |
| `--action-destructive-bg` / `-hover` / `-fg` | `var(--bad)` / `color-mix(in oklab, var(--bad) 88%, #000)` / `#ffffff` |
| `--tone-info` / `-bg` / `-bd` | `var(--info)` / `var(--info-soft)` / `color-mix(in oklab, var(--info) 25%, var(--surface))` |
| `--tone-success` / `-bg` / `-bd` | `var(--ok)` / `var(--ok-soft)` / `color-mix(in oklab, var(--ok) 25%, var(--surface))` |
| `--tone-warn` / `-bg` / `-bd` | `var(--warn)` / `var(--warn-soft)` / `var(--warn-line)` |
| `--tone-danger` / `-bg` / `-bd` | `var(--bad)` / `var(--bad-soft)` / `color-mix(in oklab, var(--bad) 25%, var(--surface))` |
| `--tone-neutral` / `-bg` / `-bd` | `var(--ink-3)` / `var(--tray)` / `var(--line)` |
| `--dot-attention`, `--dot-progress` | `var(--info)` |
| `--dot-ok` / `--dot-idle` | `var(--ok)` / `var(--faint)` |
| `--focus-ring` | `var(--action)`; `--focus-ring-soft: color-mix(in oklab, var(--action) 22%, transparent)` |
| `--shadow-popover` | `var(--shadow-float)` |
| `--shadow-bar-bottom` | `var(--shadow-pin)` |
| `--font-mono` | `"IBM Plex Mono", ui-monospace, Menlo, monospace` |

Package components that paint `#fff` text on `--ink` (`.check:checked`, `.avatar.ink`,
tooltips) read wrongly in Tender dark; retail screens use the workspace components (5.2)
instead, and those package classes are fixed when their call sites move.

#### 5.1.4 Light and dark

- `components/providers/appearance-provider.tsx` accepts `"light" | "dark" | "system"` when
  the product has a dark theme (`themesForProduct(product).dark !== null`), and only
  `"light"` otherwise.
- The inline script in `<head>` (before any stylesheet paints) reads
  `localStorage["huchu.appearance"]` and `document.documentElement.dataset.product`; when the
  product is `retail` and the choice is `dark`, or `system` with
  `matchMedia("(prefers-color-scheme: dark)").matches`, it sets `data-theme="tender-dark"`
  and `style.colorScheme = "dark"`. The provider keeps it in step on change and listens to
  the media query for `system`.
- The Appearance page (`/preferences/appearance`) shows "Light", "Dark", "Match the device"
  only for retail; for other products it shows nothing to choose.

#### 5.1.5 Type, size and shape

From TenderBrand, the boards' inline styles and G1:

| Thing | Value |
|---|---|
| Families | Atkinson Hyperlegible Next for every word; IBM Plex Mono for money, quantities, references, codes, phone numbers and times |
| Weights | 400, 500, 600 only |
| Sizes | 13px tables, toolbars, menus, rails; 12.5px column heads, hints, mono figures in cells; 12px badges, mono count pills, time after a date; 11px mono nav badges and axis labels; 14px form inputs and section titles; 15px page title in the header; 17px confirm title and record KPI values; 18px sheet title; 20px empty-list guide title and insight KPI values; 24px dashboard small KPI; 34px dashboard hero KPI |
| Letter spacing | −0.01em titles; −0.02em 20–34px figures; −0.03em record KPI values |
| Control heights | 32px in bars (header, toolbar, pager); 36px in sheets, settings and dialogs; 28px row menu button and in-table inputs; 44px touch targets on phones |
| Radii | 6px badges, pills, row menu; 8px controls, nav items, inputs; 10px option cards, switch rows, notes, autocomplete lists; 12px menus, panels, KPI strips, cards, confirm dialog |
| Focus | `outline: 2px solid var(--action); outline-offset: 3px` on every focusable control |

### 5.2 Workspace components (the shared primitives)

Port `scratchpad/ws/project/components/bundle.css` (Corelith Workspace, G1) into
`app/themes/workspace.css` (unlayered, imported after `roles.css`), with four corrections so it
matches the canvas: sheet width 520px and 760px wide (not 560/720); the totals band on
`--ground` with `--shadow-pin` (not `--tray`); selected rows on `--selected` (not
`--sel-bg`); the scrim from `--scrim`. Thin React wrappers live in `components/workspace/`:

| Component | File | Markup / rules |
|---|---|---|
| `Button` | `button.tsx` | `cx-btn`; variants `primary` (action-fill, on-action, 600, padding 0 14px), `secondary` (surface, line-strong border), `ghost`, `danger` (bad text, bad-soft border; stays an outline until a confirm), `danger-fill` (in confirms only); sizes `bar` 32px, `field` 36px; optional leading icon 14px. Exactly one `primary` per screen. |
| `ButtonGroup` | `button-group.tsx` | `cx-group`: joined buttons, only the ends rounded, borders overlap by 1px. Used for record actions, bulk actions, Sort/Group/Columns, the pager. |
| `Segmented` | `segmented.tsx` | G1 `cx-seg`: a `--tray` track with 3px padding, radius 10; items 30px min, radius 7, `--ink-2` 500; the chosen item `--sel-fill`/`--on-sel` 600 with `0 1px 2px rgba(0,0,0,.18)`. `role="group"`, items `aria-pressed`. Block variant fills the width (sheets, settings); inline variant for periods and chart ranges. |
| `Switch`, `SwitchRow` | `switch.tsx` | 34×20 track; on = `--sel-fill` with an `--on-sel` knob (G1, not green); `role="switch" aria-checked`. `SwitchRow`: 12px padding, `--line` border radius 10, label 500 + hint 12.5 `--ink-3`; border `--ink` when on. |
| `Chip` | `chip.tsx` | Choice chip, 30px pill; on = `--sel-fill`. |
| `OptionCard` | `option-card.tsx` | `role="radio"`; padding 14, radius 12, 1.5px `--line`; title 14/600, description 12.5 `--ink-3`; badge ("Soon") in a 20px `--tray` pill; disabled at 60% opacity; chosen = 2px `--ink` border and a ring of 5px `--sel-fill` (G1). |
| `StateBadge` | `state-badge.tsx` | 22px, padding 0 8, radius 6, 12/500, 7px dot. Tones: `ok` (ok-soft/ok/ok dot), `warn` (warn-soft/warn/warn-dot), `bad` (bad-soft/bad/bad-dot), `info` (info-soft/info/info dot), `neutral` (tray/ink-2/faint dot), `hollow` (transparent/ink-3, hollow ring in ink-3: the normal state), `pending` (surface, warn text, 1px warn-line border, hollow warn-dot ring: "Not counted"), `gold` (surface, ink-2, 1px line, warn-dot dot). Always a word with the colour. |
| `CountPill` | `count-pill.tsx` | 20px (18px in tabs), padding 0 7, radius 6, `--tray`, `--ink-2`, mono 12 (11 in tabs). |
| `OnBadge` | `count-pill.tsx` | The "how many filters are on" badge: 18px circle, `--sel-fill`/`--on-sel`, mono 11. |
| `Tabs` | `tabs.tsx` | Row 44px, `align-items: flex-end`, padding 0 16, `--line` bottom border; tab 40px, padding 0 12, 2px bottom border (`--ink` when selected, else transparent), margin-bottom −1; selected `--ink` 600, others `--ink-2` 400; each with a `CountPill`. `role="tablist"`/`tab`, `aria-selected`; arrow keys move. |
| `FilterChip` | `filter-chip.tsx` | 32px, padding 0 10, radius 8, 1px `--line`; label `--ink-3`, value 600, chevron 12. Set (not at its default "Any") = G1 `is-set`: `--sel-bg`, `--sel-line` border, value `--sel-ink`. `aria-label="Till: Any"`. |
| `Menu`, `MenuItem` | `menu.tsx` | On Radix DropdownMenu. Panel padding 6, radius 12, `--surface`, `--shadow-float`; items 34px (36 in Export), padding 0 8, radius 8, hover `--hover`; danger items `--bad`; separators 1px `--line` with 4px margin; an optional caption line 12px `--ink-3`. |
| `ConfirmDialog` | `confirm-dialog.tsx` | 5.8. |
| `Toast` | restyle `components/ui/toast` | 5.9. |
| Field primitives | `components/workspace/fields/*` | 5.7.4, shared by sheets, settings and the details rail. |
| `EmptyGuide`, `SetupChecklist` | `empty-guide.tsx`, `setup-checklist.tsx` | 5.12. |

### 5.3 The shell (every page, every product)

Boards: `List.dc.html` and `Record.dc.html` (rail, panel, header), `CompanySettings.dc.html`
(the Management panel), `Guided.dc.html`, `Floor.dc.html`, `Mobile.dc.html` (phone header).
The shell is the same for every product; only the theme differs.

#### 5.3.1 Layout

```
┌──────┬────────────────┬─────────────────────────────────────────────┐
│ rail │ module panel   │ header 48: ‹ Back / Title  sub  … actions ▣ │
│ 56px │ 240px          ├─────────────────────────────────────────────┤
│      │                │ the page (frame)                            │
└──────┴────────────────┴─────────────────────────────────────────────┘
```

Root: `display: flex; height: 100dvh; overflow: hidden; background: var(--ground);
color: var(--ink); font: 13px Atkinson Hyperlegible Next`. Main: `flex: 1; min-width: 0;
display: flex; flex-direction: column; background: var(--surface)` (dashboards set their own
body to `--ground`). Only the page's own scroll regions scroll; the header never scrolls.

#### 5.3.2 Rail (56px)

- `nav aria-label="Modules"`: width 56, `--surface`, right border 1px `--line`,
  `flex-direction: column; align-items: center; gap: 6px; padding: 8px 0`.
- **Logo tile** first: 32×32, radius 8, `--device` background, `#ffffff` text 12/600,
  margin-bottom 8. Shows the branding logo (`CompanyBranding.logoUrl`, cover-fit) when set
  and loadable; else two initials: the first letters of the first two words of
  `CompanyBranding.legalName`, ignoring words in brackets ("Hurudza Creative (Private)
  Limited" → "HC"); else of the trading name. It is a button: it opens the account menu
  (5.3.7). Accessible name "<company name>, your account".
- **Module marks**: one per module the role can see (5.3.4), 36×36, radius 8, icon 18px.
  Current module: `--active` background, `--ink` icon. Others: transparent, `--ink-3` icon;
  hover `--hover`. Each is a link to the module's first visible item, with
  `aria-label="<Module>"`, `aria-current="page"` when current, and a tooltip to the right
  with the module name.
- Spacer, then **Management** (gear, `GearSix`) at the bottom with the same styling; current
  when any `/retail/manage/…` page is open. Hidden for roles that see no Management item.
- Nothing else: no avatar, no pinned marks, no workspace marks.

#### 5.3.3 Module panel (240px)

- `nav aria-label="<Module title>"`: width 240, `--ground`, right border 1px `--line`.
- **Header** 48px, padding 0 12, gap 8: a 28px button with a 16px chevron-left (`CaretLeft`,
  stroke 2, `--ink-3`) labelled "Collapse the panel", then the module title 14/600
  ("The floor", "Products", "Stock", "Buying", "Insights", "Reports", "Management").
- **Items**: list padding 4px 10px, gap 2. Each item a link, height 34, padding 0 10,
  radius 8, gap 10, icon 16 (`--ink-3`), label 13 `--ink` flex 1, badge right. Hover
  `--active`. **Current** item (G1): `--sel-fill` background, `--on-sel` text and icon, 600,
  `aria-current="page"`. Current = longest href prefix match of the path (query-string items
  such as `/reports?area=selling` match on path **and** that param).
- **Badge**: `white-space: nowrap`, mono 11/500, `--ink-2` on `--tray`, padding 1px 6px,
  radius 6. On the current item: `rgba(255,255,255,.16)` background and `--on-sel` text.
  Values from `GET /api/v2/retail/nav/badges`.
- Below the items: the module's own extra section if it has one (the CRM's saved views slot,
  `collections`), then nothing. No search box, no New, no Help, no Management row.
- **Collapsed**: the chevron hides the panel (rail only). Clicking the current module's mark
  opens it again; `⌘B`/`Ctrl+B` toggles it. The state is the existing `sidebar_state`
  cookie.

#### 5.3.4 Retail modules, items, routes and who sees them

O owner (`SUPERADMIN`), M manager (`MANAGER`, `SHOP_MANAGER`), C cashier, S stock clerk,
B bookkeeper (`FINANCE_OFFICER`); from the Roles board (R or more on that row). "Route today"
is where the page lives now; FND-03 moves existing pages to the target route (no redirects
from the old paths). Pages that do not exist yet join the nav in the area unit that builds
them. Icons are Phosphor names (add any missing export to `lib/icons.tsx`).

| Module (rail icon) | Item | Icon | Target route | Route today | Badge (rule, owner of the provider) | O | M | C | S | B |
|---|---|---|---|---|---|---|---|---|---|---|
| The floor (`Storefront`) | Overview | `SquaresFour` | `/retail` | `/retail` | — | ✓ | ✓ | | | ✓ |
| | Sales | `Receipt` | `/retail/sales` | `/retail/sales` | — | ✓ | ✓ | own | | ✓ |
| | Shifts | `CashRegister` | `/retail/shifts` | `/retail/shifts` | "2 open": shifts `OPEN` (foundations) | ✓ | ✓ | own | | ✓ |
| | Lay-bys | `Package` | `/retail/laybys` | — | "3": active lay-bys (floor) | ✓ | ✓ | ✓ | | ✓ |
| | End of day | `Clock` | `/retail/end-of-day` | — | — | ✓ | ✓ | | | ✓ |
| | Customers | `Users` | `/retail/customers` | `/retail/customers` | — | ✓ | ✓ | ✓ | | ✓ |
| | Accounts | `Wallet` | `/retail/accounts` | — | "1 overdue": accounts past terms (customers) | ✓ | ✓ | | | ✓ |
| Products (`Tag`) | Products | `Rows` | `/retail/products` | `/retail/catalog` | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| | Price lists | `Tag` | `/retail/products/price-lists` | `/retail/merchandising/pricing` (as the Retail list's prices) | — | ✓ | ✓ | ✓ | | ✓ |
| | Promotions | `Megaphone` | `/retail/products/promotions` | `/retail/merchandising/promotions` | "3 on": running promotions (products) | ✓ | ✓ | ✓ | | ✓ |
| | Bundles and packs | `Package` | `/retail/products/bundles` | — | — | ✓ | ✓ | ✓ | | ✓ |
| | Vouchers | `Ticket` | `/retail/products/vouchers` | — | — | ✓ | ✓ | ✓ | | ✓ |
| | Categories | `Folder` | `/retail/products/categories` | `/retail/catalog/categories` | — | ✓ | ✓ | | | ✓ |
| Stock (`Stack`) | On hand | `Stack` | `/retail/stock` | `/retail/stock` | "5 low": products at or below reorder level, out included (stock) | ✓ | ✓ | | ✓ | ✓ |
| | Movements | `Clock` | `/retail/stock/movements` | `/retail/stock/movements` | — | ✓ | ✓ | | ✓ | ✓ |
| | Counts | `ClipboardText` | `/retail/stock/counts` | `/retail/stock/count` | "1 to approve": counts awaiting approval, approvers only (stock) | ✓ | ✓ | | ✓ | ✓ |
| | Transfers | `ArrowsLeftRight` | `/retail/stock/transfers` | `/retail/stock/transfers` | — | ✓ | ✓ | | ✓ | ✓ |
| | Empties | `Package` | `/retail/stock/empties` | — | — (liquor store only: shown when "Empties and deposits" is on) | ✓ | ✓ | | ✓ | ✓ |
| Buying (`TrayArrowDown`) | Suppliers | `Storefront` | `/retail/buying/suppliers` | — | — | ✓ | ✓ | | ✓ | ✓ |
| | Orders | `TrayArrowDown` | `/retail/buying/orders` | `/retail/purchasing/orders` | "3 open": orders sent or part delivered (buying) | ✓ | ✓ | | ✓ | ✓ |
| | Deliveries | `Truck` | `/retail/buying/deliveries` | `/retail/purchasing/receipts` | — | ✓ | ✓ | | ✓ | ✓ |
| | Requisitions | `Money` | `/retail/buying/requisitions` | `/retail/purchasing/requisitions` | "2 to approve": asked, for approvers only (buying) | ✓ | ✓ | own | own | ✓ |
| | Bills | `Receipt` | `/retail/buying/bills` | — | "1 overdue": bills past due (buying) | ✓ | ✓ | | | ✓ |
| Insights (`ChartBar`) | Sales, Profit, Products, Stock health, Losses, Customers, Money | `ChartBar` | `/retail/insights/{sales,profit,products,stock,losses,customers,money}` | same | — | ✓ | ✓ but not Money | | | ✓ |
| Reports (`FileText`) | Every template; Selling; Stock; Buying; Customers; Money; The floor | `FileText`, `Receipt`, `Stack`, `TrayArrowDown`, `Users`, `Money`, `CashRegister` | `/reports`, `/reports?area=selling`, `…=stock`, `…=buying`, `…=customers`, `…=money`, `…=floor` (route owned by the insights and reports spec) | `/reports` | "16", "4", "4", "2", "2", "2", "2": templates the role can open, per area (reports) | ✓ | ✓ | | | ✓ |
| Management (`GearSix`, bottom) | Company | `Storefront` | `/retail/manage/company` | Settings dialog `/retail/setup/operations` + `/preferences/organization/branding` | — | ✓ | ✓ | | | ✓ |
| | Sites | `MapPin` | `/retail/manage/sites` | — | — | ✓ | ✓ | | | ✓ |
| | Tills and devices | `DeviceMobile` | `/retail/manage/tills` | `/retail/setup/operations` | — | ✓ | ✓ | | | |
| | Payments | `Money` | `/retail/manage/payments` | — | — | ✓ | ✓ | | | ✓ |
| | Till rules | `ListChecks` | `/retail/manage/till-rules` | `/retail/setup/pos-policy` | — | ✓ | ✓ | | | |
| | Receipts | `Receipt` | `/retail/manage/receipts` | — | — | ✓ | ✓ | | | |
| | Fiscal device | `Stamp` | `/retail/manage/fiscal` | `/retail/setup/fiscal` | — | ✓ | ✓ | | | ✓ |
| | Posting to the books | `Rows` | `/retail/manage/posting` | `/retail/setup/accounting` | — | ✓ | | | | ✓ |
| | People | `Users` | `/retail/manage/people` | — | — | ✓ | ✓ | | | |
| | Approvals | `ListChecks` | `/retail/manage/approvals` | — | — | ✓ | ✓ | | | ✓ |
| | Loyalty | `Ticket` | `/retail/manage/loyalty` | — | — | ✓ | ✓ | | | |
| | Activity | `Clock` | `/retail/manage/activity` | — | — | ✓ | ✓ | | | ✓ |
| | Bin | `Trash` | `/retail/manage/bin` | `/retail/setup/bin` | — | ✓ | ✓ | | | |
| | Plan and billing | `CreditCard` | `/retail/manage/billing` | — | — | ✓ | | | | ✓ |

Rules:
- A module mark shows when at least one of its items shows. The panel lists the items in the
  order above. "own" means the item shows and the page is scoped to the person's own rows by
  its server.
- Each nav item declares `requires: Array<[RetailResource, RetailAction]>` (any of) checked
  with `canRetailRoleDo`; the columns above are the acceptance for that declaration. Where
  the matrix has no resource yet (lay-bys, accounts, settings pages, bookkeeper grants), the
  area spec that builds the page adds it; until then FND-03 uses `retail.setup:view` for
  Management items, `retail.reports:view` for Overview, Insights and Reports.
- Home after sign-in: Owner, Manager and Bookkeeper `/retail`; Cashier `/retail/shifts`;
  Stock clerk `/retail/stock`.
- `/portal/pos` leaves the panel (not on the canvas); the till is opened from the Overview
  header and the till device itself.
- The route registry (`lib/platform/gating/route-registry.ts`) carries the target prefixes:
  `/retail/products` → `retail.catalog`; `/retail/products/promotions`, `/bundles`,
  `/vouchers`, `/price-lists` → `retail.promotions`; `/retail/stock/movements` →
  `stores.movements`; `/retail/stock` → `retail.core`; `/retail/buying` →
  `retail.purchasing`; `/retail/sales` → `retail.pos`; `/retail/shifts`, `/retail/end-of-day`
  → `retail.shifts`; `/retail/customers`, `/retail/accounts` → `crm.customers`;
  `/retail/laybys` → `retail.pos`; `/retail/insights` → `retail.reports`;
  `/retail/manage/fiscal` → `accounting.zimra.fiscalisation`; `/retail/manage` →
  `retail.core`; `/retail` → `retail.core`.

#### 5.3.5 Page header (48px)

`header`: height 48, padding 0 16, gap 10 (8 on records), bottom border 1px `--line`,
`--surface`. Left to right:

1. **Back** (optional): link, 32px high, padding 0 8 0 4, radius 8, `--ink-3`, a 16px
   chevron-left (stroke 2.4) then the label ("Orders", "Selling", "End of day", "Price
   lists"); hover `--hover`; `aria-label="Back to <label>"`. Then a `/` in `--line-strong`.
2. **Title**: `h1` 15/600, one line, ellipsis.
3. **Reference** (records): mono 12 `--ink-3` ("PO-0003", "SH-00242").
   **Sub** (lists, optional): `--ink-3` ("Customers who buy now and pay later",
   "Kept for 30 days, then gone for good", "Default price list · all tills · all sites").
   **Sub link** (optional, after the sub): `--ink` underlined in `--line-strong`, offset 3px
   ("Edit the rules", "Change the template").
4. Spacer.
5. **Actions**: the page's own controls: records put their action group and ⋯ here (5.6.2);
   dashboards and settings put a secondary outline button ("Export", "Activity").
6. **Primary** (optional, one): `Button primary` 32px with a 14px plus icon on create
   actions ("+ New product", "+ Open shift"); no icon on record verbs ("Receive a delivery").

API (`components/layout/page-chrome.tsx`):

```ts
type PageIdentity = {
  title: string;
  back?: { href: string; label: string };
  reference?: string | null;   // records
  sub?: string | null;         // lists
  subLink?: { href: string; label: string } | null;
};
<PageHeader identity={…} actions={<…/>} primary={{ label, icon?: "plus", href?, sheet?, onClick? } | null} />
```

The page icon is gone from the header (the canvas has none). When a page sets no identity,
the title falls back to the current nav item's label.

#### 5.3.6 What happens to the old chrome

| Today | After | Why |
|---|---|---|
| App bar "Search ⌘K" box (`GlobalCommandBar` trigger) | Removed from the header. The command palette stays and opens with `⌘K`/`Ctrl+K` from anywhere, and from the account menu ("Search", with the `⌘K` hint). | The header carries only the page's name and its actions (Anatomy band 1). |
| Bell (`NotificationCenter`) | Removed from the header. The account menu has "Notifications" with the unread count (mono pill); it opens the same notification panel to the right of the rail. The logo tile carries a 8px `--action` dot on its top-right corner while anything is unread. | Same. The working attention signals are the panel badges and the Overview's Needs action. |
| Check icon (`OfflineStatusButton`) | Removed from the header. The account menu has "This device" with the status word ("Ready", "Offline", "Syncing", "Needs attention", "Update available") and its tone dot; it opens `OfflineRuntimePanel`. When the status is anything but Ready, the logo tile's dot is `--warn` (`--bad` for Needs attention). The till (`/portal/pos`) keeps its own indicator. | Selling offline is the till's job (W-44); the back office rarely is. |
| Panel "Search ⌘K" box and "New" | Removed. | Not on the latest boards. Every list has its own search; every page its own primary. |
| Panel "Help" row | Moves into the account menu ("Help", `/help`). | |
| Panel "Management" row | Becomes the rail's bottom mark (5.3.2). | |
| Rail avatar (`RailAvatar`, `RailAccount` popover) | Removed. Its menu becomes the account menu on the logo tile. | |
| Pinned marks (`use-pins.ts`, pin buttons on rows) | Removed. | Not on the canvas. |
| The map view (panel listing areas when you go "back") and the `flat` shape | Removed; the panel always shows the current module. The chevron collapses. | |
| Workspace switcher on the company mark | Moves into the account menu ("Switch to …", one row per workspace) when there is more than one. | |
| Sidebar trigger in the header | Removed; the panel chevron and `⌘B` replace it. On phones the header's menu button opens the drawer (5.3.8). | |

#### 5.3.7 Account menu (on the logo tile)

`Menu` to the right of the rail, aligned to the tile, width 260:

1. Header block: name 13/600, email 13 `--ink-3`, company name 12 `--ink-3`.
2. Separator. "Search" (`⌘K` mono hint right). "Notifications" (unread pill right when
   >0). "This device" (status word right).
3. Separator. "Profile" `/preferences/profile`; "Appearance" `/preferences/appearance`
   (retail: Light, Dark, Match the device); "Guided tips" (switch on the right, as today);
   "Help" `/help`.
4. Separator, only with more than one workspace: "Switch to <workspace>" rows.
5. Separator. "Sign out" (`--bad`).

#### 5.3.8 Narrow screens

- ≥1100px: rail + panel (panel state from the cookie).
- 720–1099px: rail only by default; the panel opens over the page (overlay, `--shadow-float`
  on its right edge) from the chevron or the current mark, and closes on navigation.
- <720px (Mobile board): no rail or panel. Header 48: a 44px menu button ("Open the menu",
  `List` icon 20px, `--ink-2`), the title 16/600, and the primary as a 44px icon button with
  a 22px plus in `--action` (`aria-label` = the primary's label). The menu button opens a
  drawer from the left (rail + panel, 296px, `--scrim` behind). Record actions fold into ⋯.

#### 5.3.9 Files that change

| File | Change |
|---|---|
| `components/layout/app-shell.tsx` | Root becomes rail + panel + main per 5.3.1; mounts `PageHeader` instead of `Navbar`; mounts `GlobalCommandBar` headless; drops the `--canvas` main padding wrapper for frame pages (frames own their padding). Retail routes are no longer settings-surface routes. |
| `components/layout/navbar.tsx` | Deleted; replaced by `components/layout/page-header.tsx` (5.3.5). |
| `components/layout/page-chrome.tsx` | New `PageIdentity` (5.3.5); `primary` slot. |
| `components/layout/app-sidebar.tsx` | Builds the rail model with role visibility and badges; no `RailAccount`; passes `accountMenu` to the logo tile. |
| `components/layout/workspace-rail/workspace-rail.tsx`, `switcher-rail.tsx`, `rail-panel.tsx`, `rail-row.tsx`, `workspace-rail.module.css` | Rewritten to 5.3.2–5.3.3: logo tile + module marks + Management; panel header with chevron; 34px rows with badges and G1 current state. |
| `components/layout/workspace-rail/use-pins.ts`, `rail-avatar.tsx` | Deleted. |
| `components/layout/account-menu.tsx` (new) | 5.3.7. |
| `components/layout/mobile-nav.tsx` (new) | The phone drawer. |
| `components/layout/command-bar/global-command-bar.tsx` | No trigger button; exposes `open()` for the account menu. |
| `components/layout/offline-status-button.tsx` | Becomes `offline-status-row.tsx` (the account-menu row). |
| `lib/rail/model.ts`, `lib/rail/areas.ts` | One shape: areas = modules; no pin capacity, no flat/map shape. Retail area ids, labels and icons per 5.3.4; `manage` added. |
| `lib/workspaces.ts` (`WORKSPACE_PROFILE_RECIPES.RETAIL`) | Sections `retail-floor`, `retail-products`, `retail-stock`, `retail-buy`, `retail-control`, `retail-reports`, `retail-manage` with the refs in 5.3.4; `/portal/pos` removed from the floor; `preferredHomeHref` per role. `SUPPORT_ITEMS` no longer rendered in the panel. |
| `lib/navigation.ts` (`retail` section) | Items with target hrefs, canvas labels ("Price lists", "Bundles and packs", "Tills and devices" …), icons and `requires`. |
| `lib/retail/nav-badges.ts` (new), `app/api/v2/retail/nav/badges/route.ts` (new) | 4.3. |
| `lib/platform/gating/route-registry.ts` | Prefixes in 5.3.4. |
| `lib/primary-actions.ts` | Retail hrefs updated to target routes. |
| `lib/settings/management-nav.ts` | Retail entries (`/retail/setup/**`) removed from the settings surface. |
| `components/layout/app-sidebar/sidebar-helpers.ts` | `getActiveNavHref` matches query-string items on path and their params. |
| `components/layout/breadcrumbs.tsx` | Title fallback reads the new nav. |

### 5.4 ListFrame (every working list)

Boards: `Main`, `Selected`, `Grouped`, `Narrow`, `Mobile`, `Dark`, `Corelith`, `Anatomy`,
`Cells`, `Paging`, `List`. "The page is the table. Everything about the table sits in the
strip directly above it or the strip directly below it, and both stay on screen while the
rows scroll between them."

#### 5.4.1 Bands, top to bottom

| # | Band | Height | Ground | Job |
|---|---|---|---|---|
| 1 | Header (5.3.5) | 48 | `--surface`, bottom `--line` | "The page's name and its one primary action. Nothing about the rows lives here." |
| — | Tabs (when the source has tabs) | 44 | `--surface`, bottom `--line` | Which slice of the subject (5.4.3) |
| 2 | Toolbar, or the selection bar | 48 | `--surface` / `--sel-bg` | Find, narrow, count, how the rows are shown, what leaves the page (5.4.4) |
| 3 | Column head | 34 | `--ground`, bottom `--line` | Pinned under the toolbar (sticky top 0 inside the scroll box) |
| 4 | Group heading (grouped only) | 36 | `--ground`, top and bottom `--line` | Pinned under the column head (sticky top 34) while its rows pass |
| 5 | Rows | 40 (44 on `pointer: coarse`) | `--surface`, bottom `--line-soft` | One line each |
| 6 | Totals (+ selected totals line) | 40 (+36) | `--ground`, `--shadow-pin` | Pinned to the bottom of the rows (sticky bottom 0); "the only band with a shadow" |
| 7 | Pager | 48 | `--surface`, top `--line` | Where you are, pages, Back to top |
| — | Save bar (inline edits only) | 52 | `--tray`, top `--line-strong` | Between the rows and the pager (5.4.10) |

The scroll box is the region between bands 2 and 7 (`flex: 1; min-height: 0; overflow:
auto`); inside it the table has `min-width` = the sum of its tracks, so a list too wide for
its box scrolls sideways in its own box. Tables are never inside cards.

#### 5.4.2 The list source (what an area spec writes)

A list is a `ReportDefinition` (`lib/reports/types.ts`) with a `list` block, registered in
`lib/reports/definitions/retail/<area>.ts` with its loader in
`lib/reports/loaders/retail/<area>.ts` (one file per area so area units do not collide).
`catalog: false` keeps a working list out of the Reports catalogue.

```ts
type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "hollow" | "pending" | "gold";

type CellKind =
  | "link"      // the row's name, the only link: sans 600, ink, underlined in --line-strong
  | "ref"       // a reference that links: mono 12.5/500 underlined (SH-00242, PO-0003, GRN-0004)
  | "text"      // plain: a person, a place
  | "muted"     // secondary text in --ink-2
  | "mono"      // codes, phone numbers: mono 12.5 --ink
  | "num"       // a count: mono 12.5 --ink-2, right
  | "date"      // "15 August 2026" + optional time from timeKey in mono 12 --ink-3
  | "when"      // short date and time, all mono 12.5: "3 Oct 13:12"
  | "money"     // the figure the row is about: mono 12.5/500 --ink, right
  | "diff"      // a signed difference: pill (see 5.4.7)
  | "owed"      // an amount to act on: mono 12.5/500 --warn on --warn-soft pill, right
  | "zero"      // a figure that does not matter here: mono 12.5 --ink-3, right
  | "state"     // a judgement: StateBadge with the column's tones
  | "bar"       // a meter + its words: cover in days
  | "duration"  // "7h 00m", running and stale variants
  | "edit-money"; // an editable price (5.4.10)

type ListColumn = ReportColumn & {          // key, label, kind, currency?, hidden?, total?
  cell: CellKind;
  width: string;                            // grid track: "104px" | "minmax(132px,1fr)"
  align?: "start" | "end";                  // default end for num, money, diff, owed, zero, edit-money
  priority?: 1 | 2 | 3;                     // 3 leaves at ≤1140px of table width, 2 at ≤940px
  sortable?: boolean;
  tones?: Record<string, Tone>;             // state: value → tone
  summary?: { tones: Tone[]; label: string }; // totals band: "23 to check"
  diff?: "variance" | "gain";               // variance: − bad, + warn; gain: + ok
  timeKey?: string;                         // date: the row key with the time
  href?: RowTemplate;                       // link/ref: default list.rowHref
  bar?: { pctKey: string; warnBelow: number }; // bar: fill % key; --warn-dot under it
  requires?: "view-cost";                   // dropped for roles that may not see cost
};

type ListFilter =
  | { key: string; label: string; type: "choice"; any: string;  // "Any", "Anyone", "All sites"
      options?: ReportOption[]; optionsFromLoader?: boolean;
      column?: string;   // set: applied as a view condition (in-memory sources); unset: passed to the loader
      primary?: boolean; // on the toolbar row; otherwise inside Filters
      default?: string }
  | { key: string; label: string; type: "period"; any: string;  // "Any time"
      column: string; primary?: boolean; default?: PeriodPreset }
  | { key: string; type: "parent"; column: string };            // never drawn: record tabs and "all" links

type PeriodPreset = "today" | "yesterday" | "7d" | "30d" | "this-month" | "last-month" | "this-year" | "any";

type ListSpec = {
  noun: string;                                      // "shifts" — in Export's caption, empty states, aria
  read: Array<[RetailResource, RetailAction]>;       // any of
  scopeOwn?: { roles: string[]; column: string };    // e.g. cashiers see only rows where cashierId = me
  search: { placeholder: string; keys: string[] };   // "Shift, cashier or till"
  tabs?: Array<{ key: string; label: string; where: Condition[] }>;
  filters: ListFilter[];
  sorts: Array<{ key: string; label: string; rules: SortRule[] }>; // first is the default
  groups?: string[];                                 // column keys offered under Group
  defaultGroup?: string;
  columns: ListColumn[];
  rowHref: RowTemplate;                              // "/retail/shifts/{id}"
  rowMenu?: ListAction[];
  bulk?: Array<ListAction | { key: "export" }>;      // in order; `more: true` starts in ⋯
  primary?: { label: string; icon?: "plus"; requires: [RetailResource, RetailAction]; sheet?: string; href?: string };
  card: { title: string; badge?: string; figure: string; meta: RowTemplate; figure2?: string }; // phone
  empty: EmptyGuideSpec;                             // 5.12.2
  edit?: { column: string; endpoint: string; changedLabel: string; note: string; save: string }; // 5.4.10
  catalog?: boolean;                                 // default false for lists
};

type ListAction = {
  key: string; label: string; tone?: "bad"; more?: boolean;
  requires: Array<[RetailResource, RetailAction]>;
  when?: Condition[];                                // row menu: only for rows that match
  do:
    | { sheet: string }                              // opens ?sheet=<kind>&ids=<…>
    | { href: RowTemplate }
    | { confirm: ConfirmSpec; endpoint: string }     // POST { ids }
    | { download: string }                           // POST { ids } → file
    | { copy: string };                              // copies that column's values, comma-separated
};

type ReportLoader = {
  load(ctx, params): Promise<ReportLoadResult>;      // all rows ≤ 5,000 (in-memory sources)
  options?(ctx): Promise<Record<string, ReportOption[]>>;
  page?(ctx, query: ResolvedListQuery): Promise<ListPageResult>; // database-side (big sources)
};
```

Rules a source must follow: rows are flat values (`ReportRow`), money as numbers with the
column's `currency`; every row has `id`; binned rows (`archivedAt` set) never come back;
everything is the caller's company only; cost columns carry `requires: "view-cost"`.
Database-side `page()` is required for sources that can pass 5,000 rows (sales, movements,
activity); it must honour the same query (tab, filters, search, sort, group, page) and return
totals over every filtered row via `aggregate`/`groupBy`, never by adding up a page.

#### 5.4.3 Tabs

Tabs component (5.2), between the header and the toolbar, only when the source declares
tabs. Each tab carries the number of rows in it, ignoring search and filters (so the numbers
are the sizes of the tabs: "Selling 15 · Low stock 4 · Archived 2 · All 17"). Changing tab
resets to page 1 and keeps filters and search. A tab is not a filter: it never shows on the
Filters badge.

#### 5.4.4 Toolbar

`div role="toolbar" aria-label="<Title>"`, height 48, padding 0 16, gap 6, bottom `--line`,
container `tb` (CSS `container: tb / inline-size`). Left to right:

1. **Search**: `label`, `flex: 0 1 240px; min-width: 120px`, 32px, 1px `--line-strong`,
   radius 8, padding 0 10, gap 8, `--ink-3`: search icon 14, `input` (placeholder from the
   source, e.g. "Shift, cashier or till", `aria-label="Search <noun>"`), and a key hint `/`
   (mono 11, 1px `--line` border, radius 4, padding 0 5). `/` anywhere on the page focuses it;
   Esc clears it. Debounced 250 ms.
2. **Primary filter chips** (`primary: true`): `FilterChip` "Till Any ⌄", "Cashier Anyone ⌄".
   Clicking opens a `Menu` of the options with a check on the current one and the `any`
   option first; a period filter's menu lists "Today", "Yesterday", "Last 7 days", "Last 30
   days", "This month", "Last month", "This year", "Any time", then "Choose dates…" which
   shows two date inputs and "Apply".
3. **Filters**: 32px button, padding 0 10, 1px `--line-strong`, funnel icon 14, "Filters",
   500, then `OnBadge` with the number of filters not at their `any` value (counting every
   filter once the primary ones have folded in). `aria-label="More filters, 1 on"`,
   `aria-expanded`. Opens the **Filters popover**: `role="dialog" aria-label="Filters"`,
   320px, padding 8, radius 12, `--shadow-float`, anchored 40px below the button's left edge;
   a 32px header row "Filters" (600) and "Clear all" (underlined `--ink-2`); then one 36px row
   per filter: label (90px, `--ink-3`), value 600, chevron-right 12. A filter not at its `any`
   value has `--sel-bg` and `--sel-ink`. A row opens the same option menu as its chip,
   nested. The primary filters appear here only once they fold (≤860px).
4. Spacer.
5. **Count**: `CountPill` with `total` ("312"); then **Clear** (underlined `--ink-2`, 32px)
   when any filter is off its default or search has text; then a 1×20 `--line` divider
   (margin 0 4).
6. **View controls** (`ButtonGroup`, `role="group" aria-label="How the rows are shown"`), each
   32px, 1px `--line`, `--ink-2`:
   - **Sort**: arrows icon + the current sort's label ("Newest first", "Name A–Z", "Most
     spent", "Least cover first"). Menu: the source's sorts with a check.
   - **Group**: lines icon + "Group" + the current group's label in 600 ("Group None",
     "Group State"); while grouped the button is `--active` with `--ink` text. Menu: "None"
     and the source's groups.
   - **Columns**: columns icon + "Columns". Menu: a checkbox per column (the first column is
     not hideable), "Show all" at the foot. Hidden columns persist per person per list
     (`localStorage huchu.list.<key>.cols`).
7. **Export**: 32px button, download icon, "Export", chevron 12. `Menu` 260px headed (12px
   `--ink-3`, padding 6 8 8) "The <total> <noun> the filters show"; items 36px with the
   extension right-aligned in mono 11 `--ink-3`: "Spreadsheet" `.xlsx`, "Comma-separated"
   `.csv`, "PDF, ready to print" `.pdf`. Picking one downloads (W-55).

Folding (container queries on `tb`, from Main):

| Toolbar width | What folds |
|---|---|
| ≤ 1060px | Sort, Group and Columns leave; a **View** button (sliders icon, "View") appears in their place, opening a 240px menu with three 34px rows: "Sort" (70px `--ink-3` label) + current label 600; "Group" + current; "Columns" + "Choose". |
| ≤ 860px | The primary filter chips leave the row and appear at the top of the Filters popover. In the selection bar, the second action folds into ⋯. |
| ≤ 720px | The `/` hint, the "Rows per page" label and the "Back to top" text leave. The third selection action folds. |
| ≤ 640px | The count, Clear and the divider leave (also "Select all <n>"). |

Controls never wrap or spill; filters scroll sideways with the table only on phones (5.4.12).

#### 5.4.5 Selection bar

When at least one row is ticked the toolbar is replaced (same 48px) by
`div role="toolbar" aria-label="Selected <noun>"`: `--sel-bg`, bottom 1px `--sel-line`,
padding 0 16, gap 6.

1. 32px icon button × (`aria-label="Clear the selection"`, `--sel-ink`).
2. "<n> selected" (600, `--sel-ink`, the number in mono).
3. "Select all <total>" (underlined, `--sel-ink`) when not every matching row is ticked:
   fetches every matching id (`idsOnly=1`); afterwards the label reads "All <total>
   selected" and bulk actions receive those ids.
4. A 1×20 `--sel-line` divider (margin 0 6).
5. `ButtonGroup role="group" aria-label="Actions for the selection"`: the source's bulk
   actions in order, each 32px, 1px `--sel-line`, `--surface`, icon 14 + label; "Export <n>"
   where the source places `{ key: "export" }` (it opens the Export menu scoped to the ticked
   rows); then a 34×32 ⋯ (`aria-label="More actions for the selection"`) holding the actions
   marked `more` plus any that folded, in a 240px `Menu`.

Bulk actions the role may not do are not drawn. Esc clears the selection.

#### 5.4.6 The table

`div role="table" aria-label="<Title>" aria-rowcount="<total>"`; every row `role="row"` is a
CSS grid on `40px <the columns' widths> 44px` (tick, columns, row menu). Cells `role="cell"`,
`min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis`, padding 0 10
(end-aligned 0 14 0 10; the last figure column 0 20 0 10), with `title` = the full value.

- **Column head**: `role="columnheader"`, 12.5/500 `--ink-3`, sentence case. Tick column:
  padding-left 14, a 16px checkbox "Select every <noun> on this page" (`accent-color:
  var(--action)`), checked when every row on the page is ticked. A sortable column is a
  button; the sorted column is `--ink` with a 12px chevron (down = descending) and
  `aria-sort`. First click sorts text A–Z, figures and dates high to low; the second
  reverses; the Sort button then reads "<Column>, A–Z" / "<Column>, Z–A" / "<Column>,
  highest first" / "<Column>, lowest first" unless the order equals a named sort.
- **Group heading** (grouped): tick cell holds a 14px chevron that folds the group (folded
  groups keep their heading and count); then, spanning to the first figure column, an 8px
  dot in the group value's tone (only when the grouped column has tones), the label 600
  `--ink`, and a `CountPill` with the group's count; then each figure column's subtotal in
  mono 12.5 (money 600, differences in their colour); "None" for blank values. Headings come
  from `groups` in the response, so counts and subtotals are the whole group's.
- **Row**: 40px (44 coarse), bottom `--line-soft`, `--surface`; hover `--hover` (the row menu
  icon darkens to `--ink-2`); ticked `--selected` with `aria-selected="true"`. Tick cell:
  padding-left 14, checkbox "Select <row name>". The row name or reference is the only link
  (cell `link` or `ref`); the rest of the row can be selected and copied. Row menu cell: a
  28px ⋯ button (`--faint`, radius 6) "Actions for <row name>" opening the source's
  `rowMenu` (`Menu`, 240px).
- Shift-click on a tick ticks the range from the last tick.

#### 5.4.7 Cells (the resolver)

One component, `components/list-frame/list-cell.tsx`, used by lists, record tabs and
reports. "Colour is only for things someone has to act on, and it always comes with a word or
a sign."

| Kind | Drawn | Example |
|---|---|---|
| `ref` | mono 12.5/500 `--ink`, underlined `--line-strong` offset 3 | SH-00240 |
| `link` | sans 13/600 `--ink`, underlined `--line-strong` offset 3 | Amarula Cream 750ml |
| `text` | 13 `--ink` | Chipo Dube |
| `muted` | 13 `--ink-2` | Front till, Spirits |
| `mono` | mono 12.5 `--ink` | AMARULA-750, +263 77 412 3388 |
| `num` | mono 12.5 `--ink-2`, right | 96 |
| `date` | the day in 13 `--ink` ("15 August 2026"), then a space and the time in mono 12 `--ink-3` ("18:14") when `timeKey` is set | 15 August 2026 18:14 |
| `when` | mono 12.5 `--ink`: "3 Oct 13:12" | 3 Oct 13:12 |
| `money` | mono 12.5/500 `--ink`, right | US$886.85 |
| `diff` | mono 12.5/500 in a pill (padding 2 6, radius 6): negative `--bad` on `--bad-soft`; positive `--warn` on `--warn-soft` (`variance`) or `--ok` on `--ok-soft` (`gain`); zero `--ink-3` with no pill. Always signed: "−US$7.15", "+US$3.17", "US$0.00" | −US$7.15 |
| `owed` | mono 12.5/500 `--warn` on `--warn-soft` pill, right | 1 |
| `zero` | mono 12.5 `--ink-3`, right | US$28.80 |
| `state` | `StateBadge` in the column's tone for that value | ● Short |
| `bar` | flex row gap 8: a 6px track (`--tray`, radius 3) filled to `pctKey`% in `--data`, or `--warn-dot` under `warnBelow`; then the words in mono 12 `--ink-2` | ▬▬▭ 6 days |
| `duration` | mono 12 in a pill (padding 2 6, radius 6): running = `--info` text with a 6px `--info` live dot ringed 3px `--info-soft`; stale (open longer than 12 hours) = `--warn` on `--warn-soft`; done = `--ink-2`. `title`: "Still trading, open for 6h 12m" / "Open for 52h 50m, longer than a shift" / "Ran for 7h 00m" | ● 6h 12m |
| `edit-money` | 5.4.10 | |
| nothing | "—" in `--faint`, never blank, never "0" for "not yet" | — |

"Nothing wraps and nothing spills into the next column. Text gets one line, an ellipsis and
its full value on hover. Figures, references and states never truncate: their columns are
sized for the largest expected value."

#### 5.4.8 Totals band

`div role="rowgroup"`, sticky bottom 0, z 3, `--shadow-pin`. It sums "everything the filters
let through, not just this page", from the response's `totals` and `summary`, in the same
grid as the rows so figures line up to the pixel.

- **Selected line** (only while rows are ticked): 36px, `--sel-bg`, `--sel-ink`, bottom 1px
  `--sel-line`, `aria-label="Totals for the selected <noun>"`: tick cell a 16px check-square
  icon in `--action`; first column the ticked count in mono 12.5/600; figure columns the same
  aggregates over the ticked rows (computed in the browser from the ticked rows it holds; after
  "Select all" it equals the totals line).
- **Totals line**: 40px, `--ground`, `aria-label="Totals for every <noun> the filters let
  through"`: tick cell "Σ" (mono 14/600 `--ink-3`, `aria-hidden`); first column the count
  (mono 12.5/600); a state column with a `summary` shows a `pending`-style badge with the
  count in mono and the label ("23 to check"); figure columns their total (mono 12.5/600;
  counts `--ink-2`; a `diff` total coloured by its sign: "−US$186.42" in `--bad`); other
  cells empty.
- Lists whose columns have no totals still draw the band with Σ and the count.

#### 5.4.9 Pager

`nav aria-label="Pages"`, 48px, padding 0 16, gap 12, top 1px `--line`, `--surface`,
container `tb`. Three slots so the page buttons never move:

1. Left (`flex: 1 1 0`): "<from>–<to> of <total>" (figures mono `--ink`, words `--ink-3`), then
   "Rows per page" (`--ink-3`) and a 30px select (mono 12, 1px `--line`, radius 8) with 25, 50,
   100.
2. Middle: `ButtonGroup aria-label="Pages"`: ‹ (34×32, "Previous page"), page buttons
   (min-width 34, 32px, mono 12; current `--sel-fill`/`--on-sel` 600 with
   `aria-current="page"` (G1); others `--surface` `--ink-2`), › ("Next page"). Up to seven
   pages show all; more show 1, …, current−1, current, current+1, …, last. Disabled arrows
   `--faint`.
3. Right (`flex: 1 1 0; justify-content: flex-end`): "Back to top ⌃" (32px outline) once the
   scroll box has scrolled more than its own height; it scrolls the table, not the window.

The rules (Paging board), all required:

1. 50 rows by default, with 25, 50 or 100 to choose. Each list remembers your choice
   (`localStorage huchu.list.<key>.size`).
2. Page, rows per page, sort, filters and grouping are in the address. Open a record and come
   back, and you land on the same page.
3. Changing a filter goes back to page 1.
4. Changing page scrolls the table, not the window, back to its first row.
5. Back to top appears after one screen of scrolling, in the pager's right-hand slot.
6. Ticked rows stay ticked when you change page, up to 500.
7. "Select all 312" selects what the filters let through, not only this page, and says so.
8. Totals always cover the whole filtered set. They come from the server.
9. On a phone the pager shrinks to ‹ 2 of 7 › and the totals shrink to one line.
10. Keyboard: J and K move between rows, Space ticks, Enter opens.

#### 5.4.10 Editable cells and the save bar

For lists whose job is typing values (the Retail price list, `PricesList.dc.html`):

- `edit-money` cell: a 28px pill, padding 0 8, radius 6, 1px `--line-strong`, `--surface`,
  mono 12.5: "US$" in `--ink-3`, then an input 64px wide, 600, right-aligned,
  `inputmode="decimal"`, `aria-label="New price for <row name>"`. Changed and unsaved: the
  pill turns `--warn-soft` with a `--warn-line` border, and the source may swap another
  cell for a `warn` StateBadge "Not saved". Derived cells (margin) recompute as you type
  through the source's `derive(row, value)` (a pure function in the definition file).
- **Save bar** (`role="region" aria-label="Unsaved changes"`): 52px, padding 0 16, gap 10,
  top 1px `--line-strong`, `--tray`: "<n> <changedLabel>" (600, number mono: "3 prices
  changed"), the source's note in `--ink-3` ("The till picks them up the moment you save.
  Margins update as you type."), spacer, "Discard" (secondary 32px), the source's save label
  as primary ("Save prices"). Save sends `PATCH <edit.endpoint>` `{ changes: [{ id, value }] }`
  in one transaction (area-owned); on success the bar leaves, a toast confirms, the list
  refetches; on 400 each refused row keeps its pill and shows the message as the cell's
  `title`, and a toast says "<n> prices were not saved."
- Leaving the page with edits opens ConfirmDialog: "Leave without saving?" / "<n> changes on
  <Title> are not saved." / keep "Keep editing" / go "Discard changes" (danger). **Defined
  here.**

#### 5.4.11 Loading, empty, no match, error

| State | What shows |
|---|---|
| First load | Header, tabs (counts "—"), toolbar (count "—"), the column head, then 12 skeleton rows: 40px rows with `--tray` bars 10px tall, radius 4, 40–80% of each cell; totals "Σ" and "—"; pager "— of —". |
| Refetch (filter, sort, page) | The current rows stay at 60% opacity under a 2px `--action` progress line along the top of the scroll box until the new page arrives. |
| Nothing at all (`everEmpty`) | Tabs and toolbar hide; the scroll box shows the source's **EmptyGuide** (5.12.2), centred, max-width 640, padding 40; totals and pager hide. The header's primary stays. |
| Nothing matches | The column head stays; under it a 160px block, centred: "No <noun> match these filters." (14, `--ink-2`) and a secondary "Clear filters". Totals hide; pager reads "0 of 0" with no page buttons. |
| Error | The same block: "The <noun> could not be loaded." (14, `--ink-2`), the server's message (12.5 `--ink-3`), secondary "Try again". |
| No permission (403) | The page body (under the header): "Your role cannot view <noun>." (14 `--ink-2`) and, for a page reached by a link, "Back to <first module item>". |
| Truncated in-memory source | A 36px band above the totals, `--warn-soft`/`--warn`: "Showing the first 5,000 <noun>. Narrow the dates to see the rest." (A source that can pass 5,000 must implement `page()`; this band is the guard, not the design.) |

#### 5.4.12 On a phone (<720px, Mobile board)

- Header per 5.3.8 ("≡ Shifts +").
- Toolbar 52px, padding 0 12, gap 8: search 40px (`flex: 1`, 1px `--line-strong`, radius 8,
  16px icon, placeholder "Search <noun>"), then "Filters" 40px (`--tray`, 1px
  `--line-strong`, 500, count in mono 12) which opens a bottom sheet with every filter and
  the tabs as a first "Show" row, plus Sort and Group rows.
- Rows become **cards** (links to the record): grid `minmax(0,1fr) auto`, gap 4 12, padding
  12 16, bottom 1px `--line-soft`. Line 1: the card `title` (600, ellipsis) with the `badge`
  StateBadge (20px) beside it; right: the `figure` in mono 500. Line 2: the `meta` template in
  mono 12 `--ink-3` ("SH-00242 · Front · 6h 12m live"); right: `figure2` as its cell kind
  (mono 12/500 diff pill).
- Footer (`--shadow-pin` above it): totals on one 36px line (`--ground`, 13): the count in
  mono 600 left; the money totals right in mono 600 (differences coloured). Pager 52px:
  44px ‹, "1 of 7" centred (figures mono), 44px ›, and a 44px Back to top (1px `--line`,
  radius 8).
- Long-press a card ticks it and shows the selection bar (the bulk group folds into ⋯).

#### 5.4.13 Keyboard and accessibility

`/` focuses search; J and K move a visible focus ring between rows; Space ticks; Enter
opens the row link; Shift+click ticks a range; Esc clears the selection, closes menus,
clears search (in that order). Focus ring 2px `--action`, offset 3px. Every icon-only
control has an `aria-label`. Colour is never the only signal (states have words, differences
have signs).

#### 5.4.14 Address

`?tab=&q=&<filter>=&sort=&group=&page=&size=` (defaults omitted). The frame reads the URL
on load, writes with `router.replace` on every change (no history entry per keystroke;
page changes push). `size` and hidden columns also persist per person; the URL wins.

#### 5.4.15 Files

| File | |
|---|---|
| `lib/reports/types.ts` | `Tone`, `CellKind`, `ListColumn`, `ListFilter`, `ListSpec`, `ListAction`, `ListQuery`, `ResolvedListQuery`, `ListPageResult`; `ReportDefinition.list?: ListSpec`; `ReportLoader.page?` |
| `lib/reports/list-query.ts` (+ `.test.ts`) | `parseListQuery(searchParams)`, `resolveListQuery(spec, query, now, timeZone)`, `listQueryToView(spec, resolved)`, `pageOf(applied, page, size)`, `tabCounts(spec, rows)`, `summaries(spec, rows)`, `periodRange(preset, now, timeZone)` |
| `lib/reports/request.ts` | `fetchListPage(session, key, query)` |
| `app/api/v2/reports/[key]/route.ts`, `app/api/v2/reports/[key]/export/route.ts` | 4.1, 4.2 |
| `lib/workspace/format.ts` (+ test) | `formatMoney(n, currency)` → "US$1,284.60" / "ZiG 1,284.60"; `formatSigned(n, currency)` → "−US$7.15" (U+2212), "+US$3.17", "US$0.00"; `formatCount(n)` → "8,412"; `formatDay(date)` → "15 August 2026"; `formatTime` → "18:14"; `formatWhen` → "3 Oct 13:12" (month table Jan … Dec, never "Sept"); `formatDuration(min)` → "6h 12m", "52h 50m", "7h 00m"; all in the company's time zone (default `Africa/Harare`) |
| `components/list-frame/*` | `list-frame.tsx`, `use-list-query.ts`, `list-tabs.tsx`, `list-toolbar.tsx`, `filters-popover.tsx`, `view-menu.tsx`, `columns-menu.tsx`, `export-menu.tsx`, `selection-bar.tsx`, `list-table.tsx`, `list-cell.tsx`, `group-heading.tsx`, `totals-band.tsx`, `list-pager.tsx`, `list-cards.tsx`, `save-bar.tsx`, `list-states.tsx` |
| `app/themes/workspace.css` | The `cx-` classes, including the container queries above |

Usage in a page:

```tsx
// app/retail/shifts/page.tsx
export default function ShiftsPage() {
  return <ListFrame source="retail-shifts" title="Shifts" />;
}
```

### 5.5 The reference list: Shifts (`/retail/shifts`)

Boards: `Main.png` (rest), `fnd/Main-selected.png` (three ticked), `fnd/Main-grouped.png` (by state),
`Narrow.png` (1024px), `Mobile.png` (phone), `Dark.png`, `Corelith.png`. Source key
`retail-shifts`, definition in `lib/reports/definitions/retail/floor.ts`, loader in-memory
in `lib/reports/loaders/retail/floor.ts`.

#### 5.5.1 Header

Title "Shifts". No back, no sub. Primary "+ Open shift" → `?sheet=shift-open` (5.7.8;
requires `retail.cash-control:open-shift` for managers, or `retail.sell:open-shift` for a
cashier opening their own). Panel: The floor › Shifts current, badge "2 open".

#### 5.5.2 Toolbar

Search placeholder "Shift, cashier or till" (keys: shift number, cashier, till).

| Filter | Where | Options | Default | Applied |
|---|---|---|---|---|
| Till | row | "Any", then every register (`RetailRegister.name`) at the company | Any | `till` column |
| Cashier | row | "Anyone", then everyone who has opened a shift, by name | Anyone | `cashierId` |
| State | Filters | "Any", "Open", "Short", "Over", "Not counted", "Balanced" | Any | `state` column |
| Opened | Filters | the period presets, "Any time" | **Last 30 days** (so the Filters badge reads 1, as on the board) | `openedAt` |
| Variance | Filters | "Any", "Short only", "Over only", "Any difference" (**Defined here**) | Any | `variance` < 0, > 0, ≠ 0 |
| Takings | Filters | "Any", "Under US$100", "US$100 to US$500", "Over US$500" (**Defined here**) | Any | `takings` |

Sorts: "Newest first" (opened, descending; default), "Oldest first", "Most taken" (takings
descending), "Biggest difference" (absolute variance descending) — the last three
**Defined here**. Groups: "State", "Cashier", "Till" (Grouped board: State). No tabs.

#### 5.5.3 Columns (grid `40px 104px minmax(132px,1fr) 96px 124px 160px 104px 64px 128px 136px 44px`, min width 1132px)

| Column | Key | Cell | Align | Priority | Value |
|---|---|---|---|---|---|
| Shift | `shiftNo` | `ref` → `/retail/shifts/{id}` | start | 1 | "SH-00242" |
| Cashier | `cashier` | `text` | start | 1 | `RetailShift.cashierName` |
| Till | `till` | `muted` | start | 3 | `registerName` |
| State | `state` | `state`, tones Open `info`, Short `bad`, Over `warn`, Not counted `pending`, Balanced `hollow`; summary `{ tones: [bad, warn, pending], label: "to check" }` | start | 1 | `OPEN` → Open; closed with `countedCash` null → Not counted; `variance` < 0 → Short; > 0 → Over; = 0 → Balanced |
| Opened | `openedAt` | `date`, `timeKey: openedTime`, sortable, sorted descending by default | start | 2 | "19 August 2026" + "03:56" |
| Duration | `durationMinutes` | `duration` (running when open ≤ 12h; stale when open > 12h; done when closed) | start | 3 | `closedAt − openedAt`, or now − `openedAt` |
| Sales | `sales` | `num`, total sum | end | 1 | count of posted sales on the shift |
| Takings | `takings` | `money`, total sum, sortable | end | 1 | the shift's takings as the shift record shows them (posted sales net of refunds and voids, base currency) |
| Variance | `variance` | `diff: variance`, total sum | end (padding right 20) | 1 | `RetailShift.variance`; "—" when open or not counted |

At ≤1140px of table width Till and Duration leave (min width 932px); at ≤940px Opened leaves
too (724px) — the Narrow board.

Totals line example (Main): "Σ 312 · 23 to check · 8,412 · US$71,904.35 · −US$186.42".

#### 5.5.4 Selection (Selected board)

"3 selected · Select all 312 │ Print Z-reports · Export 3 · Copy shift numbers · ⋯" with ⋯
holding "Download Z-reports as CSV" and "Compare cashiers"; the selected line sums the three
rows (count 3, sales, takings, variance).

| Action | Does | Requires |
|---|---|---|
| Print Z-reports | `POST /api/v2/retail/z-reports/print { shiftIds }` → opens the PDF in a new tab; toast "<n> of these days are not closed yet." when the header says so | `retail.cash-control:view` |
| Export <n> | Export menu over the ticked rows | read |
| Copy shift numbers | Clipboard "SH-00238, SH-00236, SH-00228"; toast "3 shift numbers copied." (**Defined here**) | read |
| Download Z-reports as CSV (⋯) | `POST /api/v2/retail/z-reports/export { shiftIds, format: "csv" }` | `retail.cash-control:view` |
| Compare cashiers (⋯) | Opens `/retail/insights/sales?tab=cashier&from=<earliest opened>&to=<latest>` | `retail.reports:view` |

#### 5.5.5 Row menu (**Defined here**)

"Open"; for open shifts "Record cash in or out" (`?sheet=cash-move&id=`), "Count and close"
(`?sheet=shift-close&id=`), "Print X-report"; for closed shifts "Print Z-report". Each item
only for roles that may do it.

#### 5.5.6 Permissions

Owner, Manager, Bookkeeper: every shift. Cashier: only their own (`scopeOwn` on `cashierId`;
the Cashier filter is hidden for them). Stock clerk: 403.

#### 5.5.7 Empty, phone

Empty guide (TenderUI board): icon `CashRegister` in a 48px `--tray` tile, "No shifts yet",
"A shift starts when a cashier opens a till with its float. Each one closes with a count.",
primary "+ Open shift". Phone card: title cashier, badge state, figure takings, meta
"{shiftNo} · {till first word} · {duration, with ' live' when running | short date}",
figure2 variance.

### 5.6 RecordFrame (every record)

Boards: `Record.png` (the order kind), `ShiftRecord.png` (the shift kind), `Product.png`
(chips-only strip, a photo card in the rail, a line chart), `OrderRemove.png` and siblings
(the confirmations). "A record: an app bar with the way back, the name, the reference, its
actions as one group with ⋯, and its primary action; a strip with where it has got to and its
headline figure; its figures; its lines; its details rail, edited in place."

#### 5.6.1 Structure

```
header 48   ‹ Shifts / Front till SH-00242        [Record cash in or out|Print X-report|⋯] [Count and close]
bin banner 48 (only when binned)
strip 48    (✓ Opened)—(● Trading)—( Counted)—( Closed)  [Chipo Dube] [● Open 6h 12m]   Should be in the drawer US$201.50
body        main (padding 20 24, gap 20)                                 │ rail 320 (padding 20, gap 24)
            KPI strip · chart panel · tabs + table + footer              │ meter or photo · detail groups
```

Body: `display: grid; grid-template-columns: minmax(0,1fr) 320px; flex: 1; min-height: 0`;
the main column scrolls (`overflow: auto`), the rail scrolls on its own. Under 1100px the rail
moves under the main column (full width, top border `--line`); under 720px the KPI strip wraps
to two columns.

#### 5.6.2 Header

5.3.5 with back (the list: "Shifts", "Orders", "Customers"), title (the record's name:
"Front till", "Delta Beverages", "Tapiwa Marange", "SALE-31866"), reference (mono:
"SH-00242", "PO-0003", "CUS-00141", or for a sale "Front till · Chipo Dube"), then:

- **Action group** (`ButtonGroup role="group" aria-label="Actions"`): up to three actions as
  32px outline links (1px `--line-strong`, padding 0 12), each opening its sheet or page per
  the kind's `LINK` map ("Record cash in or out" → `?sheet=cash-move`), then a 34×32 ⋯
  ("More actions", `aria-expanded`).
- **⋯ menu** (240px, aligned right under the button): the kind's `more` items (danger ones in
  `--bad`); a separator; for binnable kinds "Move to the bin" (`--bad`, 14px trash icon) with
  "Managers and owners only" under it (12px `--ink-3`, padding 2 8 6 30). Items the role may
  not do are not drawn; "Move to the bin" is drawn only for roles with the kind's delete right.
  The first `more` item on every kind is "Export as PDF".
- **Primary** (optional): one verb ("Count and close", "Receive a delivery",
  "Approve US$1,940.00"). On phones the group and the primary fold into ⋯ with the primary as
  the first item.

#### 5.6.3 Bin banner (binned records)

`div role="status"`, 48px, padding 0 16, gap 10, `--bad-soft`, `--bad` text, bottom 1px
`color-mix(in oklab, var(--bad) 22%, var(--bad-soft))`: trash icon 16, text "**In the bin**
since 3 October, 14:52, moved by you. Kept until 2 November, then gone for good. Nothing
sold, paid or counted against it changes." ("moved by <name>" when someone else; dates in the
company's time zone from the latest `RETAIL_RECORD.BINNED` event), spacer, "Restore" (32px,
1px `--bad` border, `--surface`, `--bad` 600). The body below is at 45% opacity with
`pointer-events: none`; the header's actions hide except ⋯ › "Export as PDF". After 30 days the
record opens read-only with "**In the bin** since … It is past 30 days and can no longer be
restored." (no button).

#### 5.6.4 Strip

`div role="toolbar" aria-label="<title>"`, 48px, padding 0 16, gap 8, `--ground`, bottom 1px
`--line`:

- **Steps** (optional, `ol aria-label="Where it has got to"`): 26px pills, padding 0 10 0 6,
  radius 99, gap 6 to a 16px circle, joined by 12×1px `--line-strong` connectors. Done:
  `--surface`, 1px `--line`, `--ink-2`, circle `--ok` filled with a white ✓ (10px). Current
  (G1): `--sel-fill` pill with `--on-sel` text 600 and a ring circle in `--on-sel`,
  `aria-current="step"`. To do: transparent, `--ink-3`, a hollow `--faint` ring.
- **Chips**: 24px, padding 0 8, radius 6, 12/500: `plain` (`--surface`, `--ink-2`, 1px
  `--line`), `gold` (`--surface`, `--ink`, 1px `--line`, `--warn-dot` dot), `warn`, `bad`,
  `info`, `ok` (their soft ground and colour with a 7px dot).
- Spacer, then the **figure**: label in `--ink-3` ("Should be in the drawer", "Still to come",
  "Selling at", "Points", "Total") and the value in mono 15/600 (`--warn` when the kind marks
  it so, e.g. "Still to come US$384.00").

#### 5.6.5 Main column

1. **KPI strip** (`section aria-label="Summary"`): a grid of 4 or 5 equal columns, 1px
   `--line`, radius 12, overflow hidden; tiles padding 12 14, separated by 1px `--line` left
   borders; label 12.5 `--ink-3`; value mono 17/600, −0.03em, `--ink`; note 12 `--ink-3` with
   a leading mono figure in `--ok`, `--bad`, `--warn` or `--ink-2` ("+18% on the 12 before",
   "49 days ago, usually 3"). All one line with ellipsis.
2. **Chart panel** (optional, `section`): 1px `--line`, radius 12. Header 48 on `--ground`:
   `h2` 14/600, a unit in `--ink-3` ("US$", "% of what was ordered") or a chip ("Around 9
   October, in 6 days"), spacer, then either an inline `Segmented` range ("3 months",
   "12 months", "All time") or a right-aligned sentence ("Selling about 2.1 a day"). Body:
   a 150px plot (5.11.4 bar rules; a line chart for stock over time) with a dashed grid at
   top and middle, a solid `--line-strong` baseline, y labels mono 11 `--ink-3`, x labels
   mono 11 under the plot, hover tooltip (`--surface`, radius 8, `--shadow-float`: label 12
   `--ink-3`, value mono 600). Optional footer 44px, top `--line`: a sentence and a link
   ("Order 24 by Monday to cover the next two weeks; Delta delivers in 2 days." · "Add to an
   order"). A kind without a meaningful range draws no range control (the shift record's
   chart is one day: no range).
3. **Tabs + table**: `Tabs` (40px tabs with counts, no padding row) with an "Export"
   button (28px, download icon) at the right; under it a table with the ListFrame cells
   (5.4.7): head 34 on `--ground`, rows 40 with `--line-soft` rules, and a totals row 40 on
   `--ground` with a top 1px `--line-strong` ("Σ 4 sales · 10 · cash US$21.50 · EcoCash
   US$14.00 · card US$6.00 · US$41.50"). Up to 10 rows, newest first. Footer 44px: "1–4 of 4"
   (figures mono) and, right, the link to everything ("All sales on this shift", "Order
   history", "All movements") which opens the full list filtered to this record. Each tab is
   a list source opened with its `parent` filter set to this record (`shiftId=<id>`), so
   Export and the "all" link reuse it. The **Activity** tab is built in (5.6.8).

#### 5.6.6 Details rail

`aside aria-label="Details"`: `--surface`, left 1px `--line`, padding 20, gap 24.

- Optional top card: a **meter** (padding 16, 1px `--line`, radius 12: label 12.5 `--ink-3`,
  value mono 18/600, 6px bar in `--data` on `--tray`, note 12.5 `--ink-3`) or a **photo**
  (the photo field, 5.7.4, with "Add a photo" / "The till shows it on the product button").
- **Groups**: `h3` 13/600 with, on the first group that has an editable row, a hint "click any
  value to change it" (12 `--ink-3`, 400). Rows: grid `110px minmax(0,1fr)`, gap 12, min-height
  36, bottom 1px `--line-soft`; key 12.5 `--ink-3`; value 13 `--ink` (mono for figures, codes,
  dates with times), wrapping (`overflow-wrap: anywhere`).
- **Editable row**: the value is a button (`.ev`: full width, min-height 30, padding 4 6,
  margin 0 −6, radius 6, `cursor: text`, hover `--hover`) with a 13px pencil that appears on
  hover and focus (`--faint`); `aria-label="Edit <key>: <value>"`.
- **Editing**: the row shows the field's control at 30px (text input with 1px `--action`
  border, money with its prefix, `auto` with lookups and quick add, `seg` as a compact
  segmented control, date input) and a 30px `--ink` save button with a white check
  ("Save <key>"). Enter or the button saves (W-62); Esc cancels. While saving the button
  shows a spinner. On success the value updates and "Saved" (11px `--ok`) shows under the key
  until another row is edited. On error the message shows under the control in 12px `--bad`.
- Rows the role may not change render as plain text (no pen, no hint).

#### 5.6.7 Configuration (what an area spec writes)

```ts
type RecordKind = {
  type: string;                       // entity type in audit events: "RetailShift"
  back: { label: string; href: string };
  load: (id) => Promise<RecordView>;  // GET /api/v2/retail/<resource>/[id]
  title(r): string; reference?(r): string;
  actions: RecordAction[];            // ≤ 3 in the group
  more: RecordAction[];               // ⋯ items; "Export as PDF" first
  primary?: RecordAction;
  binnable?: BinKind;                 // adds "Move to the bin" and the banner
  steps?(r): Array<{ label: string; state: "done" | "now" | "todo" }>;
  chips?(r): Array<{ label: string; tone: "plain" | "gold" | "warn" | "bad" | "info" | "ok" }>;
  figure?(r): { label: string; value: string; tone?: "warn" };
  kpis(r): Array<{ label: string; value: string; delta?: string; deltaTone?: "ok" | "bad" | "warn"; note: string }>;
  chart?: ChartPanelSpec;
  tabs: Array<{ key: string; label: string; source: string; parent: string /* the source's parent filter key */; allLink: { label: string; href(r): string } } | { key: "activity"; label: "Activity" }>;
  railTop?: { meter(r) } | { photo: FieldSpec };
  rail: Array<{ title: string; rows: Array<{ key: string; label: string; value(r): string; mono?: boolean;
                 edit?: { field: FieldSpec; endpoint(r): string; requires: [RetailResource, RetailAction] } }> }>;
};
type RecordAction = { label: string; tone?: "bad"; requires: Array<[RetailResource, RetailAction]>;
  do: { sheet: string } | { href: string } | { confirm: AskKey; endpoint: string } | { download: string } };
```

Page code: `app/retail/shifts/[id]/page.tsx` → `<RecordFrame kind="shift" id={id} />`.
Files: `components/record-frame/{record-frame,record-header,bin-banner,record-strip,kpi-strip,chart-panel,record-tabs,details-rail,detail-row}.tsx`,
`lib/retail/record-kinds/<area>.ts` (one per area), `lib/retail/record-activity.ts`.

#### 5.6.8 Activity tab

Built into every record (`{ key: "activity", label: "Activity" }`), shown to owner, manager
and bookkeeper. Table: "When" (`when`, 150px), "What" (dot in the event's tone + sentence),
"By" (`text`, 160px); footer "1–10 of 37" and "All activity" → `/retail/manage/activity?
entity=<type>:<id>`. Data from 4.5.

#### 5.6.9 Event sentences (`lib/retail/activity-words.ts`)

| Event | Sentence | Tone |
|---|---|---|
| `RETAIL_RECORD.EDITED` | "Changed <label> from <from> to <to>" ("Changed Price from US$17.99 to US$18.25"); empty from: "Set <label> to <to>" | `info` |
| `RETAIL_RECORD.BINNED` | "Moved to the bin" | `bad` |
| `RETAIL_RECORD.RESTORED` | "Restored from the bin" | `ok` |
| `RETAIL_SETTINGS.CHANGED` | "Changed <labels joined by ', '>" | `info` |
| `RETAIL_SHIFT.OPENED` | "Opened with a float of <amount>" | `info` |
| `RETAIL_SHIFT.CLOSED` | "Counted and closed, <short by US$7.15 \| over by US$3.17 \| balanced>" | `bad` / `warn` / `ok` |
| `RETAIL_CASH.MOVED` | "<Dropped US$200.00 to the safe \| Put US$50.00 in \| Paid out US$20.00>" | `hollow` |
| `RETAIL_SALE.POSTED` / `REFUNDED` / `VOIDED` | "Sold SALE-31862 for US$13.00" / "Refunded …" / "Voided …" | `ok` / `warn` / `bad` |
| `RETAIL_GOODS.RECEIVED` | "Received GRN-0004, <n> units" | `ok` |
| `RETAIL_PURCHASE_ORDER.CLOSED` / `REOPENED` | "Closed with what came, <n> units not delivered" / "Reopened" | `hollow` |
| `RETAIL_SHOP.PROFILE_CHANGED` | "Changed the business type to <type>" or "Turned <feature> on/off" | `info` |
| any other | the event type's last segment in sentence case | `hollow` |

Area specs add sentences for their events in the same table.

#### 5.6.10 The reference record: Shift (`/retail/shifts/[id]`)

FND-06 renders the existing shift page on RecordFrame with the board's frame (ShiftRecord.png):
back "Shifts"; title = till name; reference = shift number; actions "Record cash in or out",
"Print X-report" (for an open shift; "Print Z-report" when closed); ⋯ "Export as PDF",
"Message the cashier", "Sign off the difference", "Close without counting" (`--bad`);
primary "Count and close" (open) — each opens the floor spec's sheet; the FND unit wires
only "Export as PDF", "Print X-report" and the existing close flow. Steps Opened · Trading ·
Counted · Closed; chips cashier (plain) and "Open 6h 12m" (`info`; "Short US$7.15" `bad`,
"Over US$3.17" `warn`, "Balanced" `ok` once closed); figure "Should be in the drawer
US$201.50" (expected cash). KPIs Takings, Opening float, Cash in and out, Should be in the
drawer, Counted. Chart "Takings per hour" (US$, no range). Tabs Sales, Cash in and out, How
people paid, Activity. Rail groups Shift (Till, Site, Cashier, Opened), Cash up (Opening
float, Cash sales, To the safe, Expected, Counted), Drawer (Last opened, No-sale opens) —
read-only, so no hint. Not binnable.

The product record (`/retail/products/[id]`, Product.png) is the reference for the editable
rail and the bin: FND-06 moves its existing fields into the rail groups Price (Price, Cost,
VAT, Price lists), Stock (Reorder at, Reorder, Supplier, Sold as) and Details (Name, Code,
Barcode, Category, ID check, Deposit), edited in place on the existing
`PATCH /api/v2/retail/catalog/[id]` (path moves with the products spec), with "Move to the
bin" and the banner. The products spec adds its strip, KPIs, chart and tabs.

### 5.7 SheetForm (every create and edit form)

Board: `Sheet.png` (supplier kind over Suppliers), and the 66 kinds in `Sheet.dc.html` `K`.

#### 5.7.1 Opening and closing

- A sheet opens over the page it came from: the page stays rendered underneath, a `--scrim`
  covers it, and the sheet slides in from the right (200 ms `--ease-out`; 150 ms out).
- Its state is in the address: `?sheet=<kind>` plus `&id=<record id>` for edits, `&ids=<…>`
  for bulk actions (comma-separated, ≤500, else the ids are kept in memory and the URL carries
  `ids=selection`), and any prefill the opener passes (`&supplierId=…`). Back closes it.
  Refreshing reopens it.
- Close: the × button ("Close"), Esc, clicking the scrim, or the secondary "Cancel". With
  unsaved input, closing asks: ConfirmDialog "Discard this <title in lower case>?" /
  "What you typed is not saved." / keep "Keep editing" / go "Discard" (danger). **Defined
  here.**
- Focus moves to the first field on open and back to the opener on close; focus is trapped
  inside (`role="dialog" aria-modal="true" aria-labelledby` the title). Built on
  `components/ui/sheet.tsx`'s Radix engine with new chrome.

#### 5.7.2 Chrome

| Part | Spec |
|---|---|
| Width | 520px; 760px for kinds marked `wide` (the ones with lines or cards in two columns); full width under 720px |
| Header | 64px, padding 0 20 0 24, bottom 1px `--line`: title `h2` 18/600 −0.01em (one line), sub 12.5 `--ink-3` under it (a breadcrumb "Buying › Suppliers" or a sentence "Adds it to Products, On hand and the Retail price list"), × button 32px `--ink-3` |
| Steps (multi-step kinds) | `ol aria-label="What happens next"`, padding 12 24, `--ground`, bottom `--line`, gap 6: 18px numbered circles (mono 10): done `--ink` filled with ✓; current `--ink` filled with its number, label `--ink` 600; to do a `--faint` ring, label `--ink-3`; 14×1px connectors |
| Body | scrolls; padding 4 24 24 |
| Guide note (optional) | margin-top 20, padding 12 14, radius 10, `--info-soft`, `--info`, line-height 1.45 |
| Sections | padding-top 20; every section after the first: margin-top 20 and a top 1px `--line`; optional title `h3` 14/600; gap 14 between title and fields; fields in a two-column grid, gap 14 12; a full field spans both, a `half` field one |
| Folded section | a 40px button, 1px dashed `--line-strong`, radius 10: "+" 14px, the label 500 ("More details") and the hint in `--ink-3` ("Barcode, cost, supplier, opening stock, reorder"); click unfolds it in place |
| Conditional section | `when: [field, value]`: shown only while that field has that value |
| Footer | 68px, padding 0 24, gap 12, top 1px `--line`, `--ground`: optional danger button (left, `--bad`, trash icon 14, no border), the note (`--ink-3`, `flex: 1`, line-height 1.4) or the saved line, the secondary (36px outline; "Cancel" unless the kind says otherwise, e.g. "Add, then another"), the primary (36px `--action-fill`, 600: "Add supplier", "Open it", "Record it") |

#### 5.7.3 Submitting

1. Primary: the client validates required fields (a field without `opt` is required; the
   first empty one gets focus and "<Label> is needed." under it in 12.5 `--bad`), then
   sends the kind's request. The primary shows a spinner and the sheet is inert until the
   answer.
2. Success: the sheet closes, the page refetches what it shows (React Query invalidation of
   the list and record keys the kind names), and a toast shows the kind's `done` sentence
   ("Afdis Distillers added. It is in every supplier field now."). For a create the toast has
   "Open" when the new record has a page. "Add, then another" keeps the sheet open, clears it,
   keeps the defaults, and shows the `done` sentence in the footer in place of the note
   (`--ok`, 500, a check-circle 16px).
3. 400 with `fieldErrors`: each message under its field in `--bad`; the sheet stays open;
   focus to the first. 400 without: the message in the footer in `--bad` in place of the note.
   403: the footer reads "Your role cannot <verb> <noun>." 409: the message as given.
4. Danger button: opens its ConfirmDialog (5.8) and, when confirmed, sends the kind's danger
   request; success closes the sheet with its own toast.

#### 5.7.4 Field types (`components/workspace/fields/*`, shared with settings and the rail)

Label: 13/500 `--ink`, then "  optional" in 400 `--ink-3` when `opt`. Hint under the control:
12.5 `--ink-3` (`--warn` when the field is marked `warn`), line-height 1.4. Toggles, lines and
`nolabel` fields draw no label above.

| `t` | Control | Rules |
|---|---|---|
| `text` | 36px input, padding 0 10, 1px `--line-strong`, radius 8, 14px; mono when `mono`; right-aligned when `mono` and `right`; placeholder `--faint` | Plain text, phone, codes, numbers typed as text (opening stock, reorder at). |
| `money` | 36px group: a currency prefix (`--tray`, `--ink-2`, mono 12.5, right border 1px `--line-strong`) then an input in mono 14/600, right-aligned, placeholder "0.00", `inputmode="decimal"` | `cur` overrides the sheet's currency ("ZiG"). Sends a string with two decimals. |
| `read` | 36px min, padding 0 10, radius 8, `--tray`, 600; mono and right when marked; `tone` ok/warn colours the text | Computed or fixed values ("Tafara Nyathi, 12:31"). Not sent. |
| `area` | textarea, `rows × 22px` min height, padding 8 10, 14/1.45, resize vertical | |
| `auto` | Combobox (5.7.5) | Sends the chosen option's id. |
| `seg` | `Segmented` block, items 36px tall (G1 track) | Sends the chosen label's value. |
| `toggle` | `SwitchRow`: 34×20 switch, label 500, hint 12.5 `--ink-3` | Sends a boolean. |
| `cards` | `role="radiogroup"` grid of `cols` (default 2), gap 10, of `OptionCard`s; a card with badge "Soon" is disabled | Sends the card's value. |
| `tags` | 40px min box, 1px `--line-strong`, radius 8, padding 6, wrapping: 26px tags (`--tray`, padding 0 4 0 10, × 20px "Remove <tag>"), then an input (min 140px); Enter adds | Sends string[]. |
| `photo` | 76px drop zone, 1.5px dashed `--line-strong`, radius 10, `--ground`: the value line 500 ("Add your logo") and "Drop it here, or take one on a phone" 12 `--ink-3`; with a file: the image cover-fit with "Change" and "Remove" | Uploads through the existing catalogue image route pattern (`app/api/v2/retail/catalog/image/route.ts`): `POST` multipart → `{ url }`; sends the url. |
| `lines` | Table, 1px `--line`, radius 10: head 34 `--ground` (Product · <ql, "Quantity"> · <cl, "Cost"> · Value · ×), grid `minmax(0,1fr) 96px 104px 112px 36px`; rows 48: name 500 + sub 12 (`--ink-3`, `--warn` when flagged); quantity input 72×30 mono 13/600 right, `inputmode="numeric"`; cost mono `--ink-2`; value mono; × 28px "Remove <name>". Then an add row 44px: "+" and an input "Add a product: search, scan, or add a new one" — an `auto` over the `product` noun (scanning a barcode into it picks the product). Totals 40px `--ground`, mono 600: "Σ <n> lines", quantity total, value total | Sends `[{ productId, quantity, cost }]`. Values recompute as you type. |

#### 5.7.5 Autocomplete with inline add (`auto`)

- Closed: 36px box (1px `--line-strong`, radius 8, padding 0 10, gap 8) with the input
  (`role="combobox" aria-autocomplete="list" aria-expanded`) and a 14px chevron in `--ink-3`.
  Open: the border is `--action`.
- List (`role="listbox"`): 40px below, full width, padding 6, radius 10, `--shadow-float`;
  options 36px min (`role="option"`, padding 0 8, radius 8, hover `--hover`): label (flex 1,
  ellipsis) and sub (12 `--ink-3`). Up to 8 from `GET /api/v2/retail/lookup/<noun>?q=`;
  arrow keys move, Enter picks. "Nothing matches." (`--ink-3`, padding 6 8) when empty.
  Then a 1px `--line` rule and the add option (36px, `--action-ink`, 600, "+" 14px): "Add
  ‘<typed text>’ as a new <noun>" when something is typed that is not an option, else "Add a
  new <noun>".
- Add: the list closes and an inline panel opens under the field (padding 12, 1px
  `--line-strong`, radius 10, `--ground`, gap 10): "New <noun>" (600), one labelled input per
  quick field (the first prefilled with the typed text, placeholders from the quick field:
  "+263 7", "15%", "Yes"), then "Cancel" (32px outline) and "Add and use" (32px `--ink`
  fill, white, 600). "Add and use" → `POST /api/v2/retail/lookup/<noun>`; on success the
  field holds the new option and the panel closes; on 400 the messages show under the quick
  inputs.
- Roles without the noun's create right see no add option.

#### 5.7.6 Configuration (what an area spec writes)

The `K` entries are the schema: `lib/retail/sheet-kinds/<area>.ts` exports
`Record<string, SheetKind>`:

```ts
type SheetKind = {
  title: string | ((ctx) => string); sub: string | ((ctx) => string);
  wide?: boolean; steps?: string[]; at?: number; guide?: string;
  sections: Array<{ title?: string; fold?: [label: string, hint: string]; when?: [field: string, value: string];
    fields: FieldSpec[] }>;
  cur: "US$" | "ZiG";
  note: string; done: string | ((result) => string);
  primary: string; secondary?: string; danger?: { label: string; ask: AskKey; request: Request };
  load?: (ctx) => Promise<Record<string, unknown>>;     // edit kinds: current values
  submit: (values, ctx) => Request;                      // { method, url, body }
  invalidate: string[][];                                // React Query keys to refetch
  requires: Array<[RetailResource, RetailAction]>;
};
type FieldSpec = { id: string; t: "text" | "auto" | "seg" | "toggle" | "money" | "area" | "tags" | "cards" | "lines" | "read" | "photo";
  l: string; v?: unknown; p?: string; h?: string | ((values) => string); half?: boolean; opt?: boolean; mono?: boolean; right?: boolean;
  tone?: "ok" | "warn"; warn?: boolean; o?: string[] | Array<[label: string, sub?: string, badge?: string]>; cols?: number; rows?: number;
  noun?: string; quick?: Array<[label: string, placeholder: string]>; ql?: string; cl?: string; cur?: "US$" | "ZiG"; nolabel?: boolean;
  schema: ZodType };                                     // the same schema the endpoint uses
```

`components/sheet-form/sheet-form.tsx` renders any kind; `components/sheet-form/sheet-host.tsx`
(mounted once in the shell) reads `?sheet=` and opens it.

#### 5.7.7 What the sheet kinds look like on the canvas

66 kinds in `Sheet.dc.html` (`K`): field counts — text 103, seg 70, auto 56, read 37, toggle 34,
money 29, area 18, lines 12, tags 12, photo 8, cards 7; 13 are wide, 15 have a danger button,
5 have steps. Each area spec copies its kinds' titles, subs, fields, notes, primaries and
done sentences verbatim from `K`.

#### 5.7.8 The reference sheet: Open a shift (`?sheet=shift-open` over `/retail/shifts`)

From `K.shiftopen` (ShiftOpen.png): title "Open a shift", sub "The floor › Shifts"; fields
Till (`auto`, noun "till", options from lookups with sub "Open"/"Closed", quick field Name),
Cashier (`auto`, noun "person", options people who may sell with their role as sub; quick add
is the admin spec's `person` noun — until it exists the field has no add option), Opening
float (`money`, half, default the last close's left float, hint "Counted in. Last close left
US$100.00."), ZiG float (`money`, `cur: "ZiG"`, half — drawn by FND-07 only once the floor
spec has added a ZiG float to `RetailShift`; until then the field is absent); note "Cashiers
usually open from the till with their PIN. This is for when a manager opens it for them.";
primary "Open it"; done "SH-00243 open on the back till for Kuda Banda." built from the
response. Submits to `POST /api/v2/retail/shifts`, which today opens a shift for the caller
only; FND-07 adds `cashierId` to its body (`openShiftSchema`): allowed when the caller holds
`retail.cash-control:update` (owner, manager) or equals the caller; the shift's
`cashierId`/`cashierName` are that person's; the audit event's actor stays the caller. It
refuses 409 "Back till already has an open shift." when the register has an open shift, and
400 "<name> cannot sell at a till." for a person without `retail.sell:open-shift`. The floor
spec owns the shift workflows; FND-07 builds this sheet as the frame's proof.

### 5.8 ConfirmDialog (Record `ASKS`)

Before anything hard to undo. `role="alertdialog"`, `aria-labelledby`/`aria-describedby`;
centred over `--scrim`; 440px (full width minus 32 on phones), radius 12, `--surface`,
`--shadow-float`, padding 24, gap 12. Title `h2` 17/600; body `p` 14/1.5 `--ink-2` saying
what happens, what it changes and whether it can be undone; actions right-aligned, gap 8,
margin-top 8: keep (36px outline) and go (36px fill: `--bad` for destructive, `--action-fill`
otherwise, white 600). Focus starts on keep; Esc keeps. While the request runs, go shows a
spinner; an error shows under the body in `--bad` and the dialog stays.

The four asks on the Record board (texts built from the record):

| Key | Title | Body | Keep | Go | Fill |
|---|---|---|---|---|---|
| `bin` | "Move <title> to the bin?" | "It leaves every list and search today. Anything sold, paid or counted against it stays exactly as it is. You can restore it from the bin until <date + 30 days>." | "Keep it" | "Move to the bin" | bad |
| `closeshort` | "Close <ref> with what came?" | "<n> units across <m> lines are still to come. Closing stops expecting them: the order is done at <value>, <supplier> is billed for what was delivered, and the lines stop showing as late. You can reopen it until a bill is recorded against it." | "Keep waiting" | "Close the order" | action |
| `removeorder` | "Remove <ref>?" | "Nothing has come against it and it was never sent, so nothing in stock or in the books changes. It goes to the bin for 30 days; <supplier> is not told." | "Keep it" | "Remove the order" | bad |
| `cancelreq` | "Cancel <ref>?" | "<amount> for order <po> is no longer asked for. <asker>, who asked, gets a message, and the order goes back to unpaid. Nothing was paid out, so no cash moves." | "Keep it" | "Cancel the requisition" | bad |

Area specs add their asks to `lib/retail/asks.ts` in the same shape.

### 5.9 Toast

The done message after a sheet, a bulk action or a confirm. Bottom-left of the main column
(above the pager on lists), 16px from the edges; `--surface`, 1px `--line`, radius 12,
`--shadow-float`, padding 12 14, max-width 420; a 16px check-circle in `--ok` (or a warn
triangle in `--warn` for partial results), the sentence 14 `--ink`, an optional action
("Open", "Undo" where the action supports it) as an underlined button. Stays 5 s, longer on
hover; `role="status"`. One at a time; a new one replaces the old. Restyle
`components/ui/toast.tsx` / `use-toast.ts`; no new library.

### 5.10 SettingsFrame (every Management settings page)

Board: `CompanySettings.png`. Pages: Company, Payments, Till rules, Receipts, Fiscal device,
Posting to the books, Approvals, Loyalty, Plan and billing (their content is in the setup and
admin specs). List-shaped Management pages (Sites, Tills and devices, People, Activity, Bin)
are ListFrames.

#### 5.10.1 Layout

- Header (5.3.5): title ("Company"); a secondary outline button "Activity" that opens
  `/retail/manage/activity?entity=RetailSettings:<page>`; no primary (the save bar saves).
- Body: grid `minmax(0,1fr) 320px`, `grid-template-rows: minmax(0,1fr)`.
- Main column: a scroll region (padding 4 32 32) holding the form, `max-width: 680px`; the
  form's sections and fields are exactly the sheet's (5.7.2 sections, 5.7.4 fields), with
  section titles on every section ("Business type", "Liquor store features", "The business",
  "Money") and conditional sections (`when`: "Liquor store features" only while the business
  type is Liquor store).
- **Save bar** (bottom of the main column, not the window): 60px, padding 0 32, gap 10, top
  1px `--line`, `--ground`.
  - Clean: one line in `--ink-3`: "Last changed by Tendai Mhlanga, 2 October." (from
    `lastChanged`; "Saved just now." for a minute after a save; nothing when never changed).
  - Dirty: an 8px `--warn-dot` dot, "<n> change(s) not saved" (500; "1 change", "2
    changes"), spacer, "Discard" (36px outline), "Save changes" (36px primary).
  - Saving: the primary shows a spinner. Errors: under each field, and "<n> changes not saved"
    stays. Success: toast-free; the bar returns to clean ("Saved just now.").
  - Leaving with changes: ConfirmDialog "Leave without saving?" / "<n> changes on <Title>
    are not saved." / "Keep editing" / "Discard changes" (danger). **Defined here.**
- **Aside**: `--ground`, left 1px `--line`, padding 24, gap 22, scrolls. Sections separated by
  a top 1px `--line` and padding-top 22: `h2` 14/600, then either a list (gap 8; each item a
  6px `--faint` dot and a line in `--ink-2`, line-height 1.45) or a paragraph (`--ink-2`,
  line-height 1.5). Company's aside: "What the business type changes" (four bullets: "The
  categories you start with, and whether each needs an age check." · "The starter catalogue
  offered when you add products." · "The features on this page, each of which you can turn
  off." · "Nothing you have already sold, bought or priced."), "Who can change this" ("Owners
  only. Every change shows in Activity with who made it."), "More shop types" ("Pharmacy and
  restaurant and bar are on the way. Tell us what you run and we will tell you when it is
  ready.").
- **Read-only** (`canEdit: false`): every field renders as `read`, no save bar actions; the
  bar's line reads the page's "who can change this" sentence ("Owners only. Every change shows
  in Activity with who made it.").
- Under 1100px the aside moves under the form; under 720px the main padding is 16.

#### 5.10.2 Files and use

`components/settings-frame/{settings-frame,save-bar,settings-aside}.tsx`;
`lib/retail/settings-pages/<page>.ts` exports `{ title, sections: SheetKind["sections"],
aside: Array<{ title: string; bullets?: string[]; text?: string }>, whoCanChange: string,
schema }`. Page: `app/retail/manage/company/page.tsx` → `<SettingsFrame page="company" />`.

#### 5.10.3 The reference page: Company

Fields, verbatim from the board: **Business type** — cards ("General retail" / "Groceries,
hardware, clothing: anything sold by the unit."; "Liquor store" / "Beer, wine and spirits. Age
checks, licence hours, empties and cases."; "Pharmacy" / "Prescriptions, batches and expiry
dates." / Soon; "Restaurant and bar" / "Tables, tabs and the kitchen." / Soon), no label, hint
"It sets the categories and starter catalogue you begin with, and the features below.
Products, prices and sales are never changed by switching." **Liquor store features** (when
Liquor store) — toggle "Age check at the till" ("The till asks the cashier to check ID before
it sells anything in a category marked 18+."); toggle "Licence trading hours" ("The till
stops selling alcohol outside your licence hours. Soft drinks and snacks still sell."); text
half mono "Mondays to Saturdays" ("08:00 to 22:00"); text half mono "Sundays and public
holidays" ("10:00 to 18:00"); toggle "Empties and deposits" ("Charge a deposit on returnable
bottles and crates, refund it when they come back, and claim it from the supplier."); toggle
"Cases and singles" ("Sell a whole case or break it into singles. Stock is counted in
singles."); text half mono "Liquor licence number" ("HRE/BL/2024/0711"); text half "Licence
expires" ("31 December 2026", hint "You are reminded 60 days before."). **The business** —
"Trading name", "Legal name", "Registration number" (half, mono), "VAT number" (half, mono),
"Tax number (BP)" (half, mono), "Phone" (half, mono), "Email", "Address" (area, 2 rows),
"Logo" (photo, "Add your logo", hint "On receipts, orders and statements."). **Money** —
"Prices in" (seg US$ · ZiG, half), "Financial year starts" (text, half, "1 January") — both
read-only in FND-08.

### 5.11 DashboardFrame (Overview and Insights)

Boards: `Floor.png` (Overview), `InsightsSales.png` (an insight). Chart rules from the dataviz
method: one axis per chart; a single series in `--data` (emphasis) and `--data-muted` (the
rest); the period before in `--data-compare` dashed; categorical series `--s1`…`--s4` in that
fixed order, colour following the entity (cash is always `--s1`, EcoCash `--s2`, card `--s3`,
ZiG `--s4`), never cycled; 4px rounded data ends on the value side, anchored to the baseline;
2px gaps between bars and stacked segments; lines 2px; grids dashed `--line`; axis labels mono
11 `--ink-3`; text in ink tokens, never the series colour; every chart has a hover tooltip
(per bar, per cell, or a crosshair on lines) and a table or legend with values, so identity is
never colour alone.

#### 5.11.1 The Overview variant (Floor board)

- Main background `--ground`. Header (surface): title "Overview" and the primary ("+ Open
  shift").
- Toolbar 48px on `--surface`, padding 0 16, gap 8, bottom `--line`: a period `Segmented`
  ("Today", "This week", "This month"), a site `FilterChip` ("Site Harare Main Branch", options
  the sites and "All sites"), spacer, a live line in `--ink-3`: a 6px `--ok` dot ringed 3px
  `--ok-soft`, "Live · Saturday 3 October 2026 · 14:42" (time mono), refreshing every 60 s.
- Grid: `repeat(12, minmax(0,1fr))`, gap 16, padding 20 24 32, `align-content: start`.
- Tile kinds (`components/dashboard-frame/*`), all `--surface`, 1px `--line`, radius 12:
  - **Hero KPI** (span 6, padding 20, gap 6): `h2` 13/500 `--ink-3` with the value under it in
    mono 34/600 −0.02em `--ink` ("Takings today" / "US$1,284.60"); a line with a delta pill
    (mono 500, `--ok` on `--ok-soft`, or `--bad` on `--bad-soft`) and a comparison in
    `--ink-3` ("on last Saturday by this hour (US$1,187.20)"); a 72px area sparkline (today:
    2px `--data` line over a 10% `--data` fill; last week: 1.5px dashed `--data-compare`); hour
    labels mono 11; a legend ("Today" solid, "Last Saturday" dashed).
  - **Small KPI** (span 2): label 13/500 `--ink-3`, value mono 24/600, a note 12.5 `--ink-3`
    with a leading signed figure in its tone ("+11 on last Saturday"), then a 40px row of seven
    bars (last bar `--data`, others `--data-compare`, gap 3, radius 3 3 0 0) and "Last 7 days"
    11px.
  - **Panel** (span n, overflow hidden): header 48 on `--ground`, bottom `--line`: `h2`
    14/600, then a `CountPill` (a `--bad-soft`/`--bad` pill for "Needs action") or a muted
    qualifier ("today", "below level", "this week", "last 30 days"), spacer, and a link
    (underlined) or a figure (mono 600). Bodies:
    - **Action list**: rows min 52px, padding 8 16, grid `20px 1fr auto 16px`: an 8px tone dot,
      title 500 + meta 12.5 `--ink-3`, a figure mono 500 in its tone, a chevron; each row a link.
    - **Status list** (tills now): rows padding 14 16: name 600 + StateBadge; right: figure
      mono 600; meta 12.5 `--ink-3`; right: secondary figure mono 12 `--ink-3`.
    - **Bar chart** (takings by day): 180px plot with gridlines, 30 bars gap 2, the last bar
      `--data`, others `--data-muted`, tooltip (day, value, "<n> sales"), date labels.
    - **Share bar** (how people paid): a 16px stacked bar with 2px gaps, ends rounded 4px, in
      `--s1`…`--s4`, then legend rows (10px swatch, name, value mono 500, share mono 12
      `--ink-3`).
    - **Rank list** (top products, stock to reorder, cashiers): header row 12 `--ink-3`; rows
      padding 10 16: name 500 + value mono 500 (tone when it matters); a 4px bar (`--data`, or
      `--warn-dot` for low stock) + meta mono 12 `--ink-3`.
- Empty: a tile with no data shows its title and "Nothing yet today." in `--ink-3`
  (**Defined here**); the checklist (5.12.1) leads the grid while setup is unfinished.

#### 5.11.2 Data contract

Every dashboard tile reads one endpoint per page that returns all tiles' data for the period
and site (`GET /api/v2/retail/overview?period=today&siteId=` — the floor spec;
`GET /api/v2/retail/insights/[topic]?period=&siteId=` — exists, the insights spec). The frame
needs only: `{ period, site, updatedAt, tiles: Record<tileKey, TileData> }`.

#### 5.11.3 The insight variant (InsightsSales board)

- Header: the insight's short name ("Sales") and a secondary "Export" (PDF of the page and
  the table as `.xlsx`).
- Toolbar 48 on `--ground`: period `Segmented` ("Today", "7 days", "30 days", "This month"),
  a site `FilterChip` ("Site All sites"), the comparison in `--ink-3` ("Compared with the 30
  days before"), spacer, "Updated 14:42".
- Body grid `minmax(0,1fr) 320px`. Main (padding 20 24, gap 20): a KPI strip (4 tiles as
  5.6.5, value mono 20/600 −0.02em); the **question panel** (1px `--line`, radius 12): a header
  min 52px on `--ground` with the question `h2` 15/600 ("When do we sell?") over the unit line
  12.5 `--ink-3` ("Takings by day and hour, last 30 days, average a day") and an optional
  legend right; the chart (a heat grid here: 14 trading hours × 7 days, cells 30px high, gap
  3, radius 4, `--data` at 8%…100% by value, tooltip "Fri 18:00 · US$412.00", a "Quieter →
  Busier" scale); then **tabs + table** (5.6.5) with an "Export" button ("By category", "By
  till", "By cashier") and a Σ totals row.
- Aside (`--ground`, padding 20, gap 20): "What it says" (bullets with 6px `--ink` dots),
  "Do something about it" (links drawn as 36px outline rows with a chevron), "Send me this"
  (W-56; the insights spec): the line "This page, as a picture and three lines, every Monday
  at 07:00 on WhatsApp." and "Send it every Monday" (outline, 600); once on, "Every Monday at
  07:00 on WhatsApp, to +263 77 412 0098." in `--ok`.

Files: `components/dashboard-frame/{dashboard-frame,period-toolbar,hero-kpi,kpi-tile,panel,action-list,status-list,bar-chart,area-sparkline,share-bar,rank-list,heat-grid,question-panel,insight-aside}.tsx`.
`components/retail/insights/heat-grid.tsx` and `insight-bars.tsx` move into the frame.

### 5.12 Guided: the setup checklist and empty-list guides

Board: `Guided.png`. "Every empty list teaches its job in three steps. Once it has a row, the
guide is gone and the list is just a list."

#### 5.12.1 Setup checklist (Overview, owner only)

Card (`--surface`, 1px `--line`, radius 12, overflow hidden), the first item of the Overview
grid, spanning 6 columns, until every item is done:

- Head (padding 18 20, gap 12, bottom `--line`): "Finish setting up" (`h2` 16/600) over a
  progress line (a 6px `--tray` track, radius 99, filled `--ok` to done/7, then "4 of 7" with
  figures mono `--ink`); right: "Hide until tomorrow" (ghost, `--ink-3`).
- Items (`ul`; each `li` padding 12 20, gap 12, bottom `--line-soft`): a 22px circle — done:
  `--ok` filled with a white check; to do: 1.5px `--line-strong` ring — then the label (500;
  done: `--ink-3` with a line through it) over the why (12.5 `--ink-3`, one line); right, for
  undone items only, the call to action (30px outline link).
- Foot: "This card sits at the top of the overview until everything is ticked, then it goes
  for good. Nothing on it stops you selling." (padding 14 20, `--ink-3`).

| Key | Label | Done when | Why (done) | Why (to do) | Link · CTA (to do) |
|---|---|---|---|---|---|
| `shopType` | Pick the shop type | a `RetailShopProfile` row exists | the type ("Liquor store") | "It sets your categories, catalogue and features." | `/retail/manage/company` · "Pick it" |
| `products` | Add your products | ≥1 active product | "137 products, all on sale" ("<n> products, <m> off sale" when some are) | "Tick them from the catalogue and set the price." | `/retail/products?sheet=product-new` · "Add products" |
| `till` | Pair a till | ≥1 register paired with a device (setup spec; until device pairing exists: ≥1 active register) | "Front till, CounterMini" (till, device) | "Pair the till, choose how people pay." | `/retail/manage/tills` · "Pair a till" |
| `staff` | Invite your staff | ≥1 other active person with a till PIN | "3 people with PINs" | "Staff and PINs, sent on WhatsApp." | `/retail/manage/people` · "Invite" |
| `suppliers` | Add your suppliers | ≥1 supplier (buying spec's model) | "<n> suppliers" | "So low stock turns into an order in a tap." | `/retail/buying/suppliers?sheet=supplier-new` · "Add a supplier" |
| `fiscal` | Connect the fiscal device | a fiscal device registered and signing (setup spec) | "<device>, signing receipts" | "ZIMRA needs every receipt signed." | `/retail/manage/fiscal` · "Connect" |
| `ecocash` | Add your EcoCash merchant code | the payments settings hold an EcoCash merchant code (setup spec) | "EcoCash <code>" | "So EcoCash payments confirm on their own." | `/retail/manage/payments` · "Add it" |

Done items carry no button (as on the board; the label is struck through and the why says
what was done). An item whose data model does not exist yet counts as not done and its button
opens the page that will hold it. The undone buttons on the board read "Add a supplier",
"Connect", "Add it"; the four others ("Pick it", "Add products", "Pair a till", "Invite") are
**Defined here**.

#### 5.12.2 Empty-list guide

`components/workspace/empty-guide.tsx`, drawn by ListFrame when `everEmpty`:

- Container: padding 40 40 36, gap 20, max-width 640.
- Title: a question, 20/600 −0.02em ("Who do you buy from?"), with one line under it (1.5,
  `--ink-2`: "Add a supplier once, and ordering becomes a tap from anything running low.").
- Steps (optional, `ol`, gap 12): a 24px `--tray` circle with the number (mono 11/600), then
  a sentence: the first clause bold 600 and the rest `--ink-2` ("**Add them with a name and a
  WhatsApp number.** Terms and bank details can wait.").
- Actions (gap 8): primary (36px, "Add your first supplier"), optional secondary outline
  ("Import a spreadsheet").
- Without steps (TenderUI): the list's own icon in a 48px `--tray` tile, radius 12, the title
  as a statement ("No shifts yet"), one line, the primary.

`EmptyGuideSpec = { icon?: Icon; title: string; line: string; steps?: Array<[bold: string,
rest: string]>; primary: { label: string; sheet?: string; href?: string }; secondary?: { label:
string; href: string } }`. Each list source carries its own; the Suppliers one above is the
buying spec's to adopt verbatim.

### 5.13 Words, numbers and dates (every frame)

- Money as the till prints it: "US$886.85"; thousands with commas; negative with U+2212 and
  no space: "−US$7.15"; a difference always signed: "+US$3.17"; zero "US$0.00"; ZiG "ZiG
  1,284.60". Mono, right-aligned in tables.
- Counts mono with commas ("8,412"); percentages "28.6%", "+6.1%", "−2.4%".
- Long dates "15 August 2026"; short "3 Oct" (three-letter months, "Sep" never "Sept");
  times "18:14" (24-hour, mono, muted after a date); date-times in tables "3 Oct 13:12";
  durations "7h 00m". Always the company's time zone.
- Nothing yet: "—". Never a blank cell.
- Buttons are verbs that name their object; British English; sentence case; no exclamation
  marks; no emoji; name the till, the person and the figure ("Till 2 is short US$7.15").

---

## 6. What to remove

No redirects from old paths, no compatibility layers. Each removal lands in the unit named.

| Remove | Replaced by | Unit |
|---|---|---|
| `components/layout/navbar.tsx` (the app bar with page icon, "Search ⌘K" trigger, `OfflineStatusButton`, `NotificationCenter`, `SidebarTrigger`) | `components/layout/page-header.tsx`; account menu rows | FND-03 |
| The `GlobalCommandBar` trigger button (the component stays, headless) | `⌘K` and the account menu's "Search" | FND-03 |
| `components/layout/workspace-rail/use-pins.ts`, pin buttons in `rail-row.tsx`, `pinCapacity` in `lib/rail/model.ts` | nothing (not on the canvas) | FND-03 |
| `components/layout/workspace-rail/rail-avatar.tsx`, `RailAccount` in `app-sidebar.tsx` | `components/layout/account-menu.tsx` on the logo tile | FND-03 |
| The panel's Search and New buttons (`rail-panel.tsx` tools), the panel shelf of Help + Management rows, the area-map view, the `flat` rail shape, `RailFlyout` | the 5.3.3 panel; Management mark on the rail | FND-03 |
| `/portal/pos` from the retail floor section in `lib/workspaces.ts` | the Overview header and the till | FND-03 |
| Old retail page paths: `app/retail/catalog/**` → `app/retail/products/**`; `app/retail/catalog/categories` → `app/retail/products/categories`; `app/retail/merchandising/pricing` → `app/retail/products/price-lists`; `app/retail/merchandising/promotions` → `app/retail/products/promotions`; `app/retail/stock/count` → `app/retail/stock/counts`; `app/retail/purchasing/orders/**` → `app/retail/buying/orders/**`; `app/retail/purchasing/receipts` → `app/retail/buying/deliveries`; `app/retail/purchasing/requisitions/**` → `app/retail/buying/requisitions/**` (moved with `git mv`, links updated) | the same pages at the target routes until their area unit rebuilds them | FND-03 |
| `app/retail/purchasing/page.tsx`, `app/retail/insights/page.tsx`, `app/retail/setup/page.tsx`, `app/retail/setup/branding/page.tsx` (redirect-only pages) | module marks link to the first item directly | FND-03 |
| `app/retail/setup/{operations,pos-policy,fiscal,accounting,bin}` and their entries in `lib/settings/management-nav.ts` (the retail half of the full-screen Settings dialog) | `app/retail/manage/{tills,till-rules,fiscal,posting,bin}` inside the shell (moved as they are; their area units rebuild them on the frames) | FND-03 |
| Old prefixes in `lib/platform/gating/route-registry.ts` (`/retail/catalog`, `/retail/setup/bin`, `/retail/purchasing`, `/retail/merchandising`, `/retail/setup/fiscal`) and old hrefs in `lib/primary-actions.ts` | 5.3.4 prefixes | FND-03 |
| Colour output of `getBrandingCssVariables` (`lib/platform/branding.ts`) | the product theme | FND-01 |
| The Atkinson Hyperlegible Mono font import in `app/globals.css` | IBM Plex Mono | FND-01 |
| The light-only restriction in `components/providers/appearance-provider.tsx` | 5.1.4 | FND-01 |
| `app/retail/shifts/page.tsx` as it is (two-line register, client-side search, `RecordListShell`) and the `GET` handler of `app/api/v2/retail/shifts/route.ts` (its only caller) | `<ListFrame source="retail-shifts" />` and `GET /api/v2/reports/retail-shifts` | FND-05 |
| `app/retail/shifts/[id]/page.tsx` as it is | `<RecordFrame kind="shift" />` | FND-06 |
| The product record's field-list layout in `app/retail/products/[id]/page.tsx` (moved from `catalog/[id]`) and per-kind archive calls from its menu | RecordFrame rail and the generic bin endpoints | FND-06 |
| `POST /api/v2/retail/bin` meaning "restore" | `POST /api/v2/retail/bin/restore`; `POST /api/v2/retail/bin` now moves to the bin | FND-06 |
| `components/retail/shop-settings.tsx`, `components/retail/shop-profile-fields.tsx` and the shop profile block in `/preferences/organization` (`organization-overview-preferences.tsx`) | `/retail/manage/company` (SettingsFrame) | FND-08 |
| `components/retail/insights/heat-grid.tsx`, `insight-bars.tsx` (moved), the period dropdown on insight pages | `components/dashboard-frame/*` | FND-09 |
| `NothingYet` usage on retail lists | `EmptyGuide` | FND-10 |
| `components/retail/retail-shell.tsx`, retail imports of `components/crm/records/record-list-shell`, `components/management/ui` (`ColumnList` …), `components/crm/records/record-dialog`, `components/retail/product-dialogs.tsx`, `components/retail/category-dialog.tsx` | the frames, once the last area page has moved | FND-11 |

Kept on purpose: `components/ui/data-table.tsx`, `components/records/*` and
`RecordPageShell` (other products use them until they adopt the frames);
`components/ui/sheet.tsx` (its Radix engine hosts the SheetForm chrome).

---

## 7. Build units

In build order (FND-04 depends on nothing and can run beside FND-01 to FND-03). Every unit: `pnpm typecheck` passes (one at a time on this machine),
`npx eslint <changed files>` has no new errors, the named tests pass, screenshots taken with
`scratchpad/smoke/lib.js` as `owner@bottlestore.test` (and the other roles named) at 1440×960
unless stated, compared side by side with the board PNG.

| Unit | Title | Size | Depends on | Boards | Workflows | Routes |
|---|---|---|---|---|---|---|
| FND-01 | Theme: role tokens per product, Tender light and dark, the type pair | M | — | Tokens, Dark, Corelith, TenderUI, TenderBrand | F-4 | every page |
| FND-02 | Workspace components (G1 selected state) | M | FND-01 | TenderUI, Cells, Record (confirm) | — | — |
| FND-03 | The shell: rail, panel, header, account menu, nav, routes | L | FND-01, FND-02 | List, Record, CompanySettings, Guided, Floor, Mobile | F-1 (address) | every retail route |
| FND-04 | List engine on report sources (server) | M | — | Paging, Anatomy | W-55 | `/api/v2/reports/[key]`, `/export` |
| FND-05 | ListFrame and the Shifts list | L | FND-02, FND-03, FND-04 | Main, Selected, Grouped, Narrow, Mobile, Dark, Corelith, Anatomy, Cells, Paging, List | W-55, F-1, F-2 | `/retail/shifts` |
| FND-06 | RecordFrame, edit in place, Activity, bin | L | FND-02, FND-03, FND-04 | Record, ShiftRecord, Product, OrderRemove | W-60, W-62, W-63 | `/retail/shifts/[id]`, `/retail/products/[id]` |
| FND-07 | SheetForm, lookups with inline add, Open a shift | L | FND-02, FND-05 | Sheet, ShiftOpen, ProductNew | F-3 | `/retail/shifts?sheet=shift-open` |
| FND-08 | SettingsFrame and Management › Company | M | FND-03, FND-06, FND-07 | CompanySettings | W-02 (frame) | `/retail/manage/company` |
| FND-09 | DashboardFrame and Insights › Sales | M | FND-02, FND-03, FND-04 | InsightsSales, Floor | W-52 (frame) | `/retail/insights/sales` |
| FND-10 | Guided: setup checklist and empty-list guides | S | FND-02, FND-03, FND-05 | Guided, TenderUI | W-01 (after) | `/retail` |
| FND-11 | Retire the old retail frames | S | FND-05 … FND-10, and every area unit that moves a page | — | — | every retail route |

### FND-01 Theme: role tokens per product, Tender light and dark, the type pair — M

Builds 5.1. Files: `lib/theme/products.ts` (+ test), `app/themes/roles.css`, `app/layout.tsx`,
`lib/platform/workspace-identity.ts`, `app/globals.css`, `app/themes/corelith-bridge.css`,
`components/providers/appearance-provider.tsx`, `components/preferences/account/appearance-preferences.tsx`,
`lib/platform/branding.ts`.

Acceptance:
- `lib/theme/products.test.ts`: every theme block in `roles.css` declares exactly `ROLE_TOKENS`.
- On `/retail` (existing page) as the owner: `<html data-product="retail" data-theme="tender">`
  in the server HTML; computed `--ground` `#faf7f4`, `--action-fill` `#b84a0c`; the existing
  "New product" button on `/retail/products` paints `#b84a0c` with white text; focus ring
  `#e8620f`; body font Atkinson Hyperlegible Next, a mono figure IBM Plex Mono. Compare the
  colours with `Tokens.png` (Retail, light column).
- Appearance › Dark, reload: the first paint is already dark (no white flash in a screenshot
  taken at `domcontentloaded`), `--ground` `#171310`, matching `Dark.png`'s greys.
- A tenant whose profile is not RETAIL renders `data-theme="corelith"`, primary `#2563eb`
  (`Corelith.png` colours) and offers no Dark choice.

### FND-02 Workspace components (Corelith Workspace layer, G1 selected state) — M

Builds 5.2: `app/themes/workspace.css` and `components/workspace/*` (Button, ButtonGroup,
Segmented, Switch, SwitchRow, Chip, OptionCard, StateBadge, CountPill, OnBadge, Tabs,
FilterChip, Menu, ConfirmDialog, field primitives), toast restyle (5.9).

Acceptance:
- Render tests (`components/workspace/*.test.tsx`, `renderToStaticMarkup`): StateBadge emits
  the right tone class for all eight tones and always a text node; Segmented marks exactly one
  item `aria-pressed="true"`; Switch `role="switch"` with `aria-checked`; Tabs one
  `aria-selected="true"`.
- Visual parity in Tender light and dark with `scratchpad/ws/check/{Button,Chips,Confirm,Fields,Nav,OptionCard,SegmentedToggle,States,Switch,Tabs,Toolbar}-tender.png`
  and `-tender-dark.png`, and with the Actions, States and Controls blocks of
  `shots/TenderUI.png`, checked on the first pages that use them (FND-03, FND-05).

### FND-03 The shell: rail, module panel, page header, account menu, nav and routes — L

Builds 5.3 and 4.3 (with the Shifts badge provider). Moves the existing retail pages to their
target routes (section 6) and removes the old chrome.

Acceptance:
- Owner on `/retail`: the left 296px matches `Guided.png`/`Floor.png` (HC tile on `#24140e`,
  six module marks with The floor current on `--active`, the gear at the bottom; panel "‹ The
  floor" with Overview current in solid ink, Sales, Shifts with "1 open" (2 after FND-05's
  seed), Customers; only routes that exist are listed). Header: "Overview" and no search box,
  bell or check icon.
- On `/retail/manage/tills` the gear is current and the panel reads "Management" with the
  items that exist, matching the panel in `CompanySettings.png`.
- Every target route in 5.3.4 that has a page loads; every old path (`/retail/catalog`,
  `/retail/purchasing/orders`, `/retail/setup/operations` …) answers 404.
- Cashier (`chipo.till@bottlestore.test`): lands on `/retail/shifts`; sees The floor (Sales,
  Shifts, Customers), Products (Products, Price lists, Promotions), Buying (Requisitions); no
  gear, no Stock, no Insights. Stock clerk (`tendai.stock@`): lands on `/retail/stock`; sees
  Products (Products), Stock, Buying (Orders, Deliveries, Requisitions). Manager
  (`tafara.manager@`): Insights without Money.
- The HC tile opens the account menu (Search, Notifications, This device, Profile,
  Appearance, Guided tips, Help, Sign out); `⌘K` opens the palette; the chevron and `⌘B`
  collapse and reopen the panel; at 390×844 the header is "≡ <title> +" and ≡ opens the
  drawer (`Mobile.png` header).
- `lib/rail/*.test.ts`, `lib/workspaces` tests and `lib/platform/gating/*.test.ts` updated and
  passing; `GET /api/v2/retail/nav/badges` returns `{ "/retail/shifts": "<n> open" }`.

### FND-04 List engine on report sources, server side — M

Builds 4.1, 4.2, 5.4.2 types, `lib/reports/list-query.ts`, `fetchListPage`,
`lib/workspace/format.ts`, the `retail-shifts` source and loader (5.5 columns, filters,
sorts, groups, totals, summary), `RETAIL_EXPORT.DOWNLOADED`.

Acceptance:
- `lib/reports/list-query.test.ts`: period presets resolve in `Africa/Harare` ("Last 30
  days" on 3 October 2026 = 4 September 00:00 to 3 October 23:59 local); tab counts ignore
  search and filters; totals cover every filtered row (page 2 of 7 returns the same totals as
  page 1); grouped pages are ordered by group then sort and each group carries its whole
  count and subtotals; `idsOnly` caps at 5,000; a `requires: "view-cost"` column is absent
  for CASHIER; unknown filter values fall back to the default.
- `lib/workspace/format.test.ts`: "US$1,284.60", "−US$7.15", "+US$3.17", "US$0.00", "3 Oct
  13:12", "30 Sep" (not "Sept"), "15 August 2026", "52h 50m".
- On the seeded tenant: `GET /api/v2/reports/retail-shifts?page=1&size=50&opened=any`
  returns `total` equal to `select count(*) from "RetailShift"` for the company, `totals.takings`
  equal to the SQL sum of the same definition, `summary.state.label = "to check"`; as
  `tendai.stock@bottlestore.test` it answers 403 "Your role cannot view shifts".
- `POST /api/v2/reports/retail-shifts/export` `{format:"xlsx", query}` returns a workbook
  whose data rows equal `total` and whose totals row equals the API's totals; one
  `RETAIL_EXPORT.DOWNLOADED` event is written.

### FND-05 ListFrame and the Shifts list — L

Builds 5.4 UI (`components/list-frame/*`), 5.5, the 4.8 bulk endpoints, the seed in 3.4.

Acceptance (on the reseeded tenant):
- `/retail/shifts` (Opened: Any time) side by side with `Main.png`: header "Shifts" and "+
  Open shift"; toolbar search "Shift, cashier or till" with `/`, "Till Any", "Cashier Anyone",
  "Filters" (badge only when a filter is on), count, Clear, "Newest first | Group None |
  Columns", "Export ⌄"; column head on the ground with "Opened ⌄" in ink; 40px rows with
  SH-numbers as mono links, Open (indigo), Short (crimson), Over (amber), Not counted (amber
  outline), Balanced (hollow) badges, the 52h stale duration in amber and the running one with
  a live dot, variances as signed pills; the pinned totals line "Σ <n> · <k> to check · sales
  · takings · variance" with the variance total in crimson; pager "1–50 of <n> · Rows per page
  50 · ‹ 1 2 3 … › ·". Default view (Opened: Last 30 days) shows "Filters 1".
- Tick SH-rows → `scratchpad/fnd/Main-selected.png` (the Selected board's state): selection bar "3 selected · Select all <n> │ Print Z-reports
  · Export 3 · Copy shift numbers · ⋯", rows on `--selected` with orange ticks, the tinted
  selected-totals line above Σ.
- Group › State → `scratchpad/fnd/Main-grouped.png` (the Grouped board's state): headings with dot, label, count and subtotals, pinned while
  scrolling.
- 1024×960 → `Narrow.png`: View button, Filters holding Till and Cashier, Till, Duration and
  Opened columns gone. 390×844 → `Mobile.png`: cards, totals on one line, "‹ 1 of n ›",
  Back to top button. Dark → `Dark.png`.
- End to end: Till = Back till, Opened = Any time → the count and totals equal SQL for that
  till; page 3 copied as a URL opens on page 3 with the same filters; Export › Spreadsheet
  downloads `<n>` rows; Print Z-reports on three closed shifts opens a PDF; Copy shift numbers
  puts "SH-…, SH-…, SH-…" on the clipboard; the cashier sees only their own shifts and no
  Cashier filter; the stock clerk sees "Your role cannot view shifts."; a tenant with no
  shifts shows "No shifts yet".

### FND-06 RecordFrame, edit in place, Activity and the bin — L

Builds 5.6, 5.8, 4.5, 4.6, 4.9, 3.2 (migration `20261004130000_audit_entity_index` +
witness test), 3.3 events, `lib/retail/activity-words.ts`, the generic bin registry; moves the
shift record and the product record onto the frame (5.6.10).

Acceptance:
- `lib/audit/audit-entity-index-migration.test.ts` passes after `npx prisma migrate deploy`
  on the dev and test databases.
- `/retail/shifts/<the open Front till shift>` side by side with `ShiftRecord.png`: "‹ Shifts
  / Front till SH-0…", "Record cash in or out | Print X-report | ⋯" and "Count and close";
  strip with ✓ Opened, Trading in solid ink, Counted, Closed, the cashier chip and "Open <d>"
  in indigo, "Should be in the drawer US$…"; five KPI tiles; "Takings per hour" bars with
  hover tooltip; tabs Sales, Cash in and out, How people paid, Activity with counts; the sales
  table with its Σ row and "All sales on this shift"; the read-only rail (Shift, Cash up,
  Drawer).
- `/retail/products/<Amarula Cream 750ml>`: the rail matches `Product.png`'s groups; click
  Price, type 18.50, Enter → "Saved", the list and the till show US$18.50, the Activity tab
  shows "Changed Price from US$18.25 to US$18.50 · Tendai Mhlanga"; Esc cancels; as the
  cashier there is no pen and no hint.
- ⋯ › "Move to the bin" (manager) → the `bin` confirm with the board's words → banner "In the
  bin since <today>, <time>, moved by you. Kept until <+30 days>, then gone for good. …", the
  product is absent from `/retail/products` and from `GET /api/v2/retail/pos/catalog`;
  Restore → banner gone, product back, toast "Restored. It is back in every list.";
  `RETAIL_RECORD.BINNED` and `RESTORED` written. As the cashier the menu has no "Move to the
  bin". `POST /api/v2/retail/bin/restore` on an item binned 31 days ago answers 410.

### FND-07 SheetForm, lookups with inline add, and Open a shift — L

Builds 5.7, 4.4 (`till`, `category` nouns), the sheet host and URL state, the `cashierId`
addition to `POST /api/v2/retail/shifts`.

Acceptance:
- `/retail/shifts?sheet=shift-open` side by side with `ShiftOpen.png` and the chrome of
  `Sheet.png`: 520px sheet over the dimmed Shifts list, 64px header "Open a shift" / "The
  floor › Shifts", fields Till, Cashier, Opening float, the note, "Cancel" and "Open it".
- As the manager: Till "Back till", Cashier "Farai Moyo", float 100.00 → the sheet closes,
  the toast reads "SH-<n> open on the back till for Farai Moyo.", the list's first row is that
  shift (Open), the nav badge rises by one; the audit event's actor is Tafara Nyathi and the
  shift's cashier Farai Moyo. A second open on the same till answers "Back till already has an
  open shift." in the footer.
- Till field: type "Kora" → "Add ‘Kora’ as a new till" → "New till" panel with Name "Kora" →
  "Add and use" → a `RetailRegister` "Kora" (`TILL-3`) exists and is selected.
- Empty Till on submit → "Till is needed." under it. Refresh keeps the sheet open; Back closes
  it; typing then Esc asks "Discard this open a shift?" (keep / discard).
- `lib/retail/lookups.test.ts`: `category` quick add creates a category with VAT 15% and the
  age check, refuses a duplicate name with a field error, and refuses a cashier with 403.

### FND-08 SettingsFrame and Management › Company — M

Builds 5.10 and 4.10 (`company`).

Acceptance:
- `/retail/manage/company` at 1440×1720 side by side with `CompanySettings.png`: Management
  panel with Company current; header "Company" with "Activity"; Business type cards with
  Liquor store chosen (2px ink outline, filled ring) and Pharmacy and Restaurant and bar dimmed
  with "Soon"; Liquor store features with four switches on in solid ink, the hours, licence
  fields; The business; Logo drop zone; Money; aside with the three sections; save bar "Last
  changed by Tendai Mhlanga, 2 October.".
- Turn "Cases and singles" off → "● 1 change not saved · Discard · Save changes" → save →
  "Saved just now."; the till (`GET /api/v2/retail/pos/context`) reports cases off;
  `RETAIL_SETTINGS.CHANGED` and `RETAIL_SHOP.PROFILE_CHANGED` written; the Activity button
  shows them. Choosing General retail hides Liquor store features.
- As the manager every field is read-only and the bar reads "Owners only. Every change shows
  in Activity with who made it."; a `PATCH` as the manager answers 403.

### FND-09 DashboardFrame and Insights › Sales — M

Builds 5.11 (frame, tile kinds, insight variant) and moves `/retail/insights/sales` onto it
(data from the existing `GET /api/v2/retail/insights/sales`; other topics adopt it in the
insights spec).

Acceptance:
- `/retail/insights/sales` side by side with `InsightsSales.png`: header "Sales" and
  "Export"; toolbar "Today | 7 days | 30 days | This month" with 30 days in solid ink, "Site
  All sites", "Compared with the 30 days before", "Updated hh:mm"; four KPI tiles in US$; "When
  do we sell?" heat grid in the single `--data` hue with tooltips and "Quieter → Busier"; tabs
  "By category | By till | By cashier" with Export and a Σ row; the aside "What it says", "Do
  something about it", "Send me this".
- Tile kinds render in tests with Floor.png's shapes: hero KPI with sparkline and legend,
  small KPI with seven bars, action list, status list, bar chart with 30 bars and a darker
  last bar, share bar in `--s1`…`--s4` with legend values, rank list.

### FND-10 Guided: setup checklist and empty-list guides — S

Builds 5.12 and 4.7; puts the checklist at the top of the existing `/retail` page; ListFrame
draws the empty guide.

Acceptance:
- `GET /api/v2/retail/setup/checklist` on the seeded tenant: shop type, products, till and
  staff done; suppliers, fiscal device and EcoCash not; the card on `/retail` matches the left
  card of `Guided.png` ("Finish setting up", green bar, "4 of 7", the struck-through done rows
  with their whys, "Add a supplier", "Connect", "Add it", the foot line). As the manager there
  is no card and the endpoint answers 403.
- "Hide until tomorrow" hides it until the next local day (reload keeps it hidden).
- A list with no rows (a new tenant's Shifts) shows its guide; the guide component renders
  the Suppliers guide of `Guided.png` (title, line, three numbered steps, "Add your first
  supplier", "Import a spreadsheet") in a render test.

### FND-11 Retire the old retail frames — S

Runs last, after the area units have moved their pages. Removes the FND-11 rows of section 6.

Acceptance: `grep -r "retail-shell\|record-list-shell\|management/ui\|record-dialog\|product-dialogs\|category-dialog" app/retail components/retail`
returns nothing; `pnpm typecheck` and `pnpm lint` pass; every retail nav item opens on every
role without a console error.

---

## Open questions

1. Notifications leave the header for every product and live in the account menu with a dot
   on the logo tile (the canvas has no bell on its latest boards). Confirm for the products
   that rely on the bell today.
2. Pinned rail marks and the area map are removed for every product (not on the canvas).
   Confirm nobody depends on pins.
3. A tenant's branding colour no longer re-tints the interface; the product theme does, and
   the logo stays. Confirm.
4. IBM Plex Mono replaces Atkinson Hyperlegible Mono in every product (the canvas uses Plex
   in all three themes).
5. The route table in 5.3.4 is canonical; area specs written in parallel may have named
   other paths and must be reconciled to it (or it to them) before build.
6. Shifts defaults to "Opened: Last 30 days" so the Filters badge reads 1 as on the board;
   the board's 312 is sample data. Keep the default, or default to "Any time"?
7. `FINANCE_OFFICER` (bookkeeper) has no grants in `lib/retail/permissions.ts`; the nav
   table gives the Roles board's visibility, which needs the admin spec to add the grants.
8. Choices marked **Defined here** (Shifts' Variance and Takings filter options, its extra
   sorts and row menu, the unsaved-changes dialogs, the 500-tick toast, the checklist's four
   undone buttons, "Nothing yet today." on empty tiles) have no board; a canvas pass may
   want to draw them.
9. Where G1 (Corelith Workspace) and the canvas differ beyond the selected state (G1: rows on
   `sel-bg`, sheet 560/720px, totals on `tray`), this spec follows the canvas. Confirm.
10. The record template draws a "3 months · 12 months · All time" range on every chart,
    including the one-day shift record; this spec draws a range only where the kind has one.
