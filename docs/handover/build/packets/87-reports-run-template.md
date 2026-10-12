# 87 · Reports › a template, run; save, make, change, share and delete templates (INS-08)

## Screen
`/retail/reports/[ref]` (a built-in slug such as `sales`, or a saved template's id) with the sheets `?sheet=template-save`,
`?sheet=template-edit`; and over `/retail/reports[?area=…]` the sheets `?sheet=template-new` and `?sheet=template-share&ids=<…>`,
the catalogue's primary, row ⋯ and bulk actions. Template endpoints `/api/v2/reports/templates/**`,
`/api/v2/retail/reports/templates/{share,delete}`, `GET /api/v2/retail/reports/sources`.

## Units
INS-08. Spec `70-insights-reports.md` §2 W-69, W-73, W-74, W-75, §3.4, §4.4, §5.10 (primary, ⋯, bulk), §5.12, §5.15.1–5.15.4,
§5.16, §7 INS-08. Overrides: **C-35** (Reports for owner, manager, bookkeeper; hint "Everyone who opens reports"), C-40.

## What already exists
- After packets 85–86: report faces and list-mode `face/template/rows/cols`; built-ins; `retail-report-templates` catalogue at
  `/retail/reports` with "Open" only; `GET /api/v2/retail/reports/[ref]` (`RunContext`) and `…/opened`; new access rules
  (`canSeeTemplate`, `canChangeTemplate` = maker or owner once shared, `canSaveTemplates`); `ReportTemplateUse`.
- Generic template endpoints: `POST /api/v2/reports/templates` (`templateInputSchema`: reportKey, name 1–120, description ≤ 240,
  audience, `view?`, `params`, `keepDates`), `GET/PATCH/DELETE /api/v2/reports/templates/[id]`; `lib/reports/templates.ts`
  (`createTemplate`, `updateTemplate`, `deleteTemplate`; uses `canShareWith` = manager roles); generic `TemplateSheet`
  (`components/reports/template-sheet.tsx`) for other products.
- SheetForm (`components/sheet-form/*`, `lib/workspace/sheet-kind.ts`) with field types `text, area, seg, toggle, tags, cards,
  read`; `tags` has no reorder; `secondary` is a label for Cancel-like behaviour only. ConfirmDialog + `lib/retail/asks`.
- `ReportSend` table (packet 81) — used by packet 88, not here.

## What INS-08 still adds or changes
1. **Run page** `app/retail/reports/[ref]/page.tsx` (§5.12): loads `RunContext`; posts `…/opened` once per mount; `ListFrame` with
   `source = context.source`, `face="report"`, `template=ref`; the template's query is the starting point and the URL holds every
   change (`when`, `site`, `cashier`, `type`, `q`, `sort`, `group`, `rows`, `cols`, `page`). Header via `PageChrome`: back = the area
   label ("Selling") → `/retail/reports?area=selling`; title = template name; sub = `context.sub` (built-in "Built in · {reportPeriodWords
   of the current period}, {every shop | shop name}" recomputed from the current filters; saved "{maker}’s template · {managers see it
   | everyone sees it | only you see it}"); sub link "Change the template" when `canChange` → `?sheet=template-edit`; primary "+ Save as
   a template" when `canSave` → `?sheet=template-save`. No tabs. The panel's current item is the template's **area** item: add an
   optional `navHref` to `PageChrome`'s identity that the panel uses for the current item.
2. **ListFrame additions** (lock **R**): props `face`, `template`, `back`, `sub`, `subLink`, `primary` (page-supplied header);
   Group menu gains a first section "One row for each" listing the face's rollups with a check on the current one, a separator,
   then "Group by"; Columns writes `cols` to the URL (not localStorage) when `face="report"`; search placeholder rolled up = the key
   column's label ("Shop"). Rolled-up key cells link (drill-down) as packet 85 returns them. Row ⋯ "Open". Selection bar: FND "Export
   {n}" only (packet 88 adds "Email every Monday"). States: "No sales match these filters." + "Clear the filters"; 404 "Template not
   found" as the frame's error state with "Back to {area}".
3. **Template endpoints** (`lib/reports/templates.ts`, shared paths):
   - `POST /api/v2/reports/templates` `TemplateInput` (§4.4, without `email` here): retail sources need `retail.reports:create`
     (403 "Your role cannot save report templates"); audience beyond JUST_ME needs it too (403 "Only owners and managers share
     templates"); name 1–120 and unique case-insensitively among the company's saved templates **and** the built-ins' names (400
     `fieldErrors.name` "There is already a template called Sales. Give it another name."); description ≤ 240; ≥ 1 visible column;
     `rows` ⊂ the face's rollups; period a preset or a range ≤ 366 days; fit the view to the face's columns; keep the period as the
     preset unless `keepDates` (then the resolved range "2026-10-01..2026-10-03"). One transaction: create + audit
     `RETAIL_REPORT_TEMPLATE.SAVED { source, name, audience, from: <ref or null>, email: false }`. 201 `{ template }`. Generic
     products keep today's behaviour (no audit).
   - `PATCH /api/v2/reports/templates/[id]` (`Partial<TemplateInput>` without `reportKey`): `canChangeTemplate` else 403 "Only
     whoever made it, or an owner, can change this template"; widening audience needs `canSaveTemplates`; same validation; audit
     `RETAIL_REPORT_TEMPLATE.CHANGED { changed, before, after }` and, when the audience widens, `RETAIL_REPORT_TEMPLATE.SHARED { from,
     to }`. `{ template }`.
   - `DELETE /api/v2/reports/templates/[id]`: `canChangeTemplate`; deletes; `ReportTemplateUse` and `ReportSend` rows go by cascade;
     no source row changes; audit `RETAIL_REPORT_TEMPLATE.DELETED { name, source }`. `{ deleted: true }`.
   - `POST /api/v2/retail/reports/templates/share { ids (≤200), audience }` (`retail.reports:create`): applies to saved templates the
     caller may change, skips the rest (built-ins never); per changed template the SHARED audit; `{ done, skipped }`; 400 "Validation
     failed".
   - `POST /api/v2/retail/reports/templates/delete { ids }` (`retail.reports:create`): same skipping; DELETED audits; `{ done, skipped }`.
   - `GET /api/v2/retail/reports/sources` (`retail.reports:create`, else 403 "Your role cannot save report templates") →
     `{ cards: SourceCard[] }` — the nine cards (§5.15.2 order) whose source the role reads, each with columns (key, label,
     summable, rollupOnly), rollups, periods (Today, This week, Last weekend, This month, Pick dates; none for Stock on hand and
     Customers) and defaults.
   - `RETAIL_AUDIT_EVENTS` gains `reportTemplateSaved`, `reportTemplateChanged`, `reportTemplateShared`, `reportTemplateDeleted`
     (§3.4); written only for retail sources.
4. **Sheet kinds** `lib/retail/sheet-kinds/reports.ts` (+ index line), copy from `Sheet.dc.html` `K`:
   - `template-save` (520, `retail.reports:create`): title "Save as a template"; sub "Reports › {Area} › {Template name}"; Name
     (`text`, default the suggested "{period words}, {shop words}" — "Month to date, every shop"; " (2)" when taken); What it shows
     (`area`, opt, rows 2, placeholder "One line, shown under the name in the list"); section "What it keeps": Columns (`read`, visible
     labels joined ", "), Filters (`read`, each filter in words: "Any shop, any cashier, sales, refunds and voids"), Sorted (`read`,
     half), Grouped (`read`, half: "Not grouped" / "By {group}" / "One row for each {rollup}" / "One row for each shop, by day"),
     Period (`seg` "Moves with today" · "Keep {1 to 3 October}", hint by preset — this-month "‘This month’ opens on whichever month it
     is. Keep the dates for a one-off you want to come back to."; picked dates → `read` "Keeps 1 to 3 October"; no period → no field);
     section "Who sees it": Seen by (`seg` Just me · Managers · Everyone, default Just me; hint "People only ever see the rows their
     own role lets them see, whoever made the template."; with Everyone picked the hint starts "Everyone who opens reports." — C-35).
     Footer note "It goes under {Area}. The built-in {name} stays as it was." (from a saved template: "{Template name} stays as it
     was."); Cancel; primary "Save the template". Submit POST with `view`/`params` from the page's current query; done "{name} is under
     {Area}."; `next` → `/retail/reports/<id>`; invalidates `["list","retail-report-templates"]`, `["nav-badges"]`.
   - `template-new` (wide 760, `retail.reports:create`; loads `/sources`): title "New template"; sub "Reports › Every template" (over
     an area "Reports › {Area}"); Starts from (`cards`, cols 3, the nine cards; default Sales, `&area=` → the area's first card; hint
     "Every template reads one of these. The area it goes under comes from here: {Card} goes under {Area}."); section "What it shows":
     Name (`text`, required, placeholder "Weekend takings by shop"), What it shows (`area`, opt, hint "One line, shown under the name
     in the list."), Columns (`tags`, **orderable**, options = the card's columns in the chosen shape, default the card's, placeholder
     "Add a column…", hint "Drag to reorder. Every money column totals at the foot.", ≥ 1), Period (`seg` Today · This week · Last
     weekend · This month · Pick dates, default the card's; hint "A period that moves with today, so it is right each time it
     opens."; Pick dates shows From/To `text` half "1 October 2026", error "Write a date, like 1 October 2026.", hint "These dates stay
     as they are."), One row for each (`seg` the card's rollups; changing it rebuilds Columns: key, count, then the chosen money
     columns; the first option restores defaults); section "Who sees it": Seen by as above. Footer note "It goes under {Area}, beside
     the built-in {name}."; secondary **"Open it without saving"** → closes and navigates to `/retail/reports/<built-in slug>?rows=…&cols=…&<period>=…`
     with no request; primary "Make the template". Submit POST (`view` = tags in order then the rest hidden, `rows`, the face's
     default sort for the shape — rolled up: first money column desc, "Most taken" for Sales; `params` = face defaults + period).
     Done "{name} is under {Area}."; `next` → `/retail/reports/<id>`.
   - `template-edit` (520; needs `canChange`, else the footer "Only whoever made it, or an owner, can change this template." and a
     disabled Save — `readOnly`): title = name; sub "Made by {maker} on {D Month YYYY} · opened {n} {time|times}"; Name, What it shows,
     Starts from (`read` "{card or built-in name}, under {Area}", hint "Change the columns, filters and grouping on the report itself,
     then save it here."); Seen by. Footer danger "Delete the template" (ask `templatedelete`), note "Only the template goes. Every
     {noun} stays.", Cancel, primary "Save". Submit PATCH with name, description, audience and `view`/`params` = the page's current
     query; done "{name} saved."; danger DELETE → toast "{name} deleted." → `/retail/reports?area=<slug>`.
   - `template-share` (`retail.reports:create`): title "Share {n} templates"; sub "Reports"; Seen by (`seg`, default Managers, hint as
     above); note "Built-in templates and templates you cannot change stay as they are."; primary "Share them"; done "{done}
     {template is|templates are} seen by {managers|everyone|only whoever made them} now." + " {skipped} stayed as {it was|they were}."
5. **SheetKind additions** (FND-07 files): `tags.reorder: true` (drag to reorder, keyboard Alt+←/→); a secondary action that
   navigates instead of cancelling (`secondaryHref?: (values) => string`).
6. **Asks** `lib/retail/asks/reports.ts`: `templatedelete` ("Delete {name}?" / "Only the template goes. Every {noun} stays." / "Keep
   it" / "Delete the template", bad); `templatesdelete` ("Delete {n} templates?" / "Only the templates go. Every row they read stays.
   Built-in templates stay." / "Keep them" / "Delete the templates", bad).
7. **Catalogue additions** (packet 86's spec): primary "+ New template" (`retail.reports:create`) → `?sheet=template-new` (`&area=`
   on an area page); row ⋯ "Change the template" (`canChange` → `/retail/reports/{id}?sheet=template-edit`), "Delete the template"
   (`canChange`, bad, ask `templatedelete`); bulk "Share" (`retail.reports:create` → `?sheet=template-share&ids=`), "Delete"
   (`retail.reports:create`, ask `templatesdelete` → `POST …/templates/delete`, toast "{n} templates deleted." + " {m} stayed: built-in
   templates and others’ cannot be deleted."), then FND "Export {n}".

## Boards
- `ReportSales.png`: "‹ Selling / **Sales** Built in · 1 to 3 October 2026, every shop", orange "+ Save as a template"; chips "Period
  **This month**", "Shop **Any**", "Cashier **Anyone**", "Type **Any**", "Filters" (board's "1" has nothing behind it: no badge),
  count, "Newest first", Group, Columns; columns Sale · Date · Shop · Cashier · Type · State · Discount · Total; Σ "1,284 … US$412.35
  US$18,940.60"; pager. Panel "Selling" current.
- `ReportWeekend.png`: "‹ Selling / **Weekend takings by shop** Tendai Mhlanga’s template · managers see it Change the template";
  search "Shop"; "Period Last weekend", "Shop Any", "Filters", count 3, "Most taken"; Shop · Sales · Cash · EcoCash · Card · On
  account · Taken; Σ "3 811 …".
- `ReportSaveTemplate.png`, `TemplateNew.png`, `TemplateEdit.png`: as item 4 (the email toggles they draw arrive in packet 88).

## Workflows
- W-69: open a template → narrow by period, shop, cashier, type → Σ follows the filters → export (FND).
- W-73: change columns/filters/period → "+ Save as a template" → name, keep or move dates, Seen by → "Save the template" → toast
  "Month to date, every shop is under Selling." → the new run page; catalogue lists it under Selling with "You", "Just you"; Selling
  badge 5.
- W-74: "+ New template" → card, name, columns, period, one row for each, Seen by → "Make the template" → run page in the Weekend
  shape; or "Open it without saving" → the built-in with `rows`/`cols`/period in the URL, nothing saved.
- W-75: "Change the template" → rename / Seen by → "Save" → "{name} saved."; "Delete the template" → ask → deleted; no source row
  changes. Bulk Share / Delete from the catalogue.

## Roles
Run: owner, manager, bookkeeper (C-35). Save, make, share, bulk delete: owner and manager (`retail.reports:create`); the bookkeeper
sees no "+ Save as a template" / "+ New template" and gets 403 on POST. Change/delete: the maker, or the owner once shared. Accounts
C-40: `owner@`, `tafara.manager@`, `bookkeeper@bottlestore.test`; cashier `chipo.till@` refused.

## Data
`ReportTemplate` (`view` with `rows`, `params`, `audience`), `ReportTemplateUse`, `ReportSend` (cascade only). **No schema change.**

## Server
As item 3. Route files parse, gate, call. Every write in one transaction with its audit. No money, stock or ledger effect.

## UI
Run page and sheets as above. Phone: run page uses the face's phone card; Σ one line; sheets full-screen.

## Reuse
`components/list-frame/*`, `components/sheet-form/*`, `lib/workspace/sheet-kind.ts`, `lib/retail/asks/*`, `lib/reports/templates.ts`,
`lib/reports/template-query.ts` (packet 85), `lib/reports/template-access.ts`, `words.ts#reportPeriodWords`.

## Remove
`canShareWith` (replaced by `canSaveTemplates` for retail; generic products keep the rule as "owner or manager" via the same
function); the generic `TemplateSheet`/catalogue stay for other products (spec Open question 12).

## Seed
None new (packet 86's templates).

## Tests
- `lib/reports/templates.test.ts` (test DB): save from built-in Sales keeps `this-month` unless `keepDates`; duplicate name (also
  "sales" vs built-in "Sales") → `fieldErrors.name`; bookkeeper POST → 403; Tafara's PATCH of Tendai's template → 403; owner's → 200
  with CHANGED and SHARED audits; delete removes its use and send rows and no sale.
- `lib/reports/template-query.test.ts` additions (sheet-built view: tags order, rows, default sort per shape).
- `lib/retail/sheet-kinds/reports.test.ts`: suggested name rule ("Month to date, every shop", " (2)"), filters-in-words, grouped
  words, the C-35 hint, footer notes.
- Bulk share/delete: skips built-ins and others' templates; counts.
- `components/sheet-form` test for `tags.reorder`.

## Acceptance
1. Seeded, owner, `/retail/reports/sales` beside `ReportSales.png`: header, chips, eight columns, `SALE-#####` numbers, voided rows
   "Void · Voided", Σ count/discount/total equal SQL, "1–50 of {n}"; "Shop Harare Main Branch" changes the sub to "…, Harare Main
   Branch" and the Σ; panel "Selling" current; Last opened updated.
2. W-73 beside `ReportSaveTemplate.png` (minus the toggle): sub "Reports › Selling › Sales", name "Month to date, every shop", the read
   fields, "Moves with today · Keep 1 to 3 October" with the hint, "Just me", the note → save → toast → run page at the id; catalogue
   lists it under Selling with "You" / "Just you"; Selling badge 5; audit SAVED.
3. W-74 beside `TemplateNew.png`: nine cards, Sales picked; "One row for each Shop", Period "Last weekend", columns "Shop, Sales,
   Cash, EcoCash, Card, On account, Taken", name "Weekend takings by shop, copy", Managers → "Make the template" → Weekend-shaped
   run page; "Open it without saving" opens `/retail/reports/sales?rows=site&…` and creates no row.
4. `/retail/reports/<Weekend takings by shop>` beside `ReportWeekend.png`: header and sub link, "Period Last weekend", "Most taken",
   rows Harare Main Branch and Borrowdale (two shops seeded) with Σ; a shop name drills into Sales for that shop and weekend.
5. W-75 beside `TemplateEdit.png` (minus the email toggle): "Made by Tendai Mhlanga on 14 September 2026 · opened {n} times", "Starts
   from Sales, under Selling" → rename → "{name} saved."; "Delete the template" → ask → gone; `select count(*) from "RetailSale"`
   unchanged. As Tafara: no sub link; `PATCH` → 403. As the bookkeeper: no "+ Save as a template".
6. Catalogue bulk: tick Weekend takings by shop and Sales → "Share" → Everyone → "1 template is seen by everyone now. 1 stayed as it
   was."; Sales unchanged.
7. eslint clean; vitest on the tests above; `pnpm typecheck`.

## Depends on
Packets 85 and 86 (INS-06, INS-07), FND-07 (landed: SheetForm). Locks: **R** (ListFrame), FND-07's sheet files.

## Risk
standard. Pitfalls: the run page's URL must override the template's query key by key; "Open it without saving" must not POST;
uniqueness check includes built-in names; audit only for retail sources.

## Open questions
- The "Email it every Monday at 07:00" toggles on the three sheets land in packet 88 together with the sending, so no toggle stores a
  send that nothing delivers (layering rule); the spec puts the toggle's storage in INS-08.
- C-35 wording: the board's hint stays for Just me / Managers; with Everyone it starts "Everyone who opens reports.".
- Selection-bar "Email every Monday" is packet 88; "Export {n}" stays once (spec Deviation).


> Coordinator note (2026-10-06, packet 85a): depends on **85a** + 86, not 85.
> - `GET /api/v2/retail/reports/sources` and the "Starts from" cards list only cards whose source is registered **and** has a
>   `report` face: today Items sold, Payments, Stock on hand, Stock movements, Till shifts. "Sales" is the default card only once
>   85 lands; until then the default is the first card of the area, or Items sold.
> - The run page's period filter uses the shared range picker from 90 through ListFrame. Do not add a picker of your own.
