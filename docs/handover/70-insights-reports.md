# 70 Insights and reports: the seven questions, and Reports by template

Handover spec for canvas page **"07 Insights and reports"** of the "Corelith data tables" canvas, version 32. Lede from the
workflow map: "Each insight page answers one question an owner actually asks, in the order they ask it: am I making money,
when am I busy, what sells, where is it leaking. Reports are their own place: templates by area, built in or saved by the
team."

This spec covers the 14 boards on that page (seven insight pages, seven Reports boards), workflows **W-51 to W-56, W-69 and
W-73 to W-75**, the insights half of W-53 and W-54 (their other screens belong to the floor, stock, products and buying
specs), and the Reports and Insights rows of the foundations nav table (FND 5.3.4), which name this spec as the route owner.

Read first: `docs/handover/00-foundations.md` (frames, list engine, DashboardFrame 5.11), `50-floor.md` (takings, sales,
shifts), `30-stock.md` (stock reasons, levels, stockouts, empties), `40-buying.md` (bills, money accounts, requisitions),
`20-products.md` (promotions, prices), `10-setup.md` (shop hours, till rules, outbox, plan). The brief's rules apply: the canvas
chooses the direction; every figure comes from Postgres through real routes; every button does what the board and the workflow
map say, on the server; no backward compatibility.

Canvas sources: `scratchpad/canvas-v32/project/*.dc.html` (insight boards are hand-built; Reports boards are `List` kinds
`reports`, `reportsstock`, `salesreport`, `weekendreport` and `Sheet` kinds `templatesave`, `templatenew`, `templateedit`).
Board images: `scratchpad/shots-v32/<Board>.png`. Screenshots of today's pages (owner, 1440×1000, code at `c78d01f`):
`scratchpad/smoke/ins70/insight-{sales,profit,products,stock,losses,customers,money}-full.png`, `reports.png`,
`reports-new-template.png`, `report-sales-full.png`, `report-sales-save.png`, `manager-insight-money.png`.

## How to read this spec

- **Frames** come from foundations and are referenced, never re-specified. Aliases used here and in the unit list:

  | Alias | Foundations unit(s) | What it gives this spec |
  |---|---|---|
  | `FND-THEME` | FND-01 | Tender tokens (`--data`, `--data-muted`, `--s1`…`--s4`, tones), the type pair |
  | `FND-SHELL` | FND-03 (with FND-02 components) | Rail, module panel with badges, 48px header (back, title, sub, sub link, actions, primary), nav table 5.3.4, `GET /api/v2/retail/nav/badges` |
  | `FND-LIST` | FND-04 + FND-05 | List sources (`ReportDefinition.list`), list mode of `GET /api/v2/reports/[key]`, tabs, toolbar, filters, sort/group/columns, Export (W-55), selection bar, row ⋯, cells 5.4.7, totals band, pager, phone cards, empty guide |
  | `FND-SHEET` | FND-07 | SheetForm, `?sheet=` host, field types (`text`, `area`, `seg`, `toggle`, `tags`, `cards`, `read`), ConfirmDialog (5.8) |
  | `FND-DASH` | FND-09 | DashboardFrame, the **insight variant** (5.11.3): period toolbar, KPI strip, question panel, tabs + table, aside; heat grid, bars, columns charts; Insights › Sales moved onto the frame on today's API |

- **Other areas' units** are named by their ids: `SET-01`…`SET-10`, `PRD-07`, `PRD-09`, `STK-01`…`STK-09`, `BUY-01`…`BUY-09`,
  `FLR-01`…`FLR-08`. Areas whose specs are not written yet are named by area and noun: `CUS:customers` (customer list source
  `retail-customers`, the customer record, members and points), `CUS:accounts` (accounts list source `retail-accounts`, owed and
  overdue, "Take a payment"), `CUS:message` (the `message` sheet), `CUS:loyalty` (Management › Loyalty), `ADM:people`
  (Management › People).
- **Defined here** marks a choice the canvas shows the control for but not its contents. **Deviation** marks a place where this
  spec deliberately does not copy the board and says why.
- Copy in quotes is exact, sentence case, British English. Money "US$34,918.40", negative "−US$43.79" (U+2212); dates "6 October"
  in insight tables (the year only when it is not this year), "28 September 2026" in report lists; times "14:42" in the
  company's zone (Africa/Harare); everything else per foundations 5.13.
- Every write: session through `requireRetailSession` (or `validateSession` on the shared `/api/v2/reports/**` routes),
  permission through `requireRetailPermission` (`lib/retail/permissions.ts`), company scope on every query, audit event
  (`lib/retail/audit.ts`) **in the same transaction**. Insights and reports write no stock and post nothing to the ledger; the
  actions they link to post through their own specs' services.

## Decisions at a glance

1. **Routes.** Foundations 5.3.4 leaves the Reports route to this spec. Reports moves into the retail module like every other
   retail page (foundations decision 9): **`/retail/reports`**, not `/reports`. The generic `/reports` stays for the other
   products (mining, schools, CRM) and is untouched by this spec except for the shared template rules (decision 7).

   | Page | Route |
   |---|---|
   | Insights, one per question | `/retail/insights/{sales,profit,products,stock,losses,customers,money}` (`?period=today\|7d\|30d\|month`, or `?from=YYYY-MM-DD&to=YYYY-MM-DD`; `&siteId=<id>\|all`; `&tab=<table id>`) |
   | Reports › Every template | `/retail/reports` |
   | Reports › an area | `/retail/reports?area=selling\|stock\|buying\|customers\|money\|floor` |
   | A template, run | `/retail/reports/[ref]` — `ref` is a built-in slug (`sales`, `discounts-given` …) or a saved template's id; list query params override the template's (FND 4.1 params plus `rows` and `cols`) |

   Sheets (`lib/retail/sheet-kinds/reports.ts`, `lib/retail/sheet-kinds/insights.ts`): `template-new` (over `/retail/reports`),
   `template-save` and `template-edit` (over a run page), `template-share` (bulk, **Defined here**), `report-send` (**Defined
   here**), `insight-send` (**Defined here**).

2. **Insights are DashboardFrame pages on one endpoint per page.** `GET /api/v2/retail/insights/[topic]` returns everything the
   page draws for the period and site: four KPIs with their deltas already worded, the question chart, every tab's table with
   its Σ row, up to three "What it says" sentences, up to three "Do something about it" links, and the person's "Send me this"
   state. The page computes nothing. The 7/30/90-day `days` parameter goes; the periods are the board's: Today, 7 days, 30 days
   (default), This month, each compared with the same span before it.

3. **One drawing for screen, PDF and WhatsApp.** The question panel's charts are plain SVG/HTML components (no client-only
   drawing); the page renders them with hover tooltips, and the server renders the same components with
   `renderToStaticMarkup` for the page PDF and for the weekly picture (`renderPngFromHtml`, a sibling of `renderPdfFromHtml` in
   `lib/documents/pdf-renderer.ts`).

4. **"Send me this" and the weekly template email are one model, `ReportSend`.** A send is a subject (an insight topic, or a
   template), a channel (WhatsApp or email), a weekday and a time, and either one recipient (a personal send) or none (a
   template's own email, to everyone who sees the template, worked out at each send). The retail worker
   (`scripts/retail-worker.ts`, SET-07's) runs due sends every five minutes. WhatsApp goes through SET-07's `RetailMessage`
   outbox (a picture plus three lines); email goes through `lib/email/send.ts` with the PDF attached and is logged as a
   `RetailMessage` with channel EMAIL.

5. **A report is a list source seen through a report face.** Every Reports template reads a list source (FND 5.4.2). A source
   gains an optional `report` block — a second `ListSpec` over the same loader with the Reports board's filters, labels,
   columns, sorts and **"One row for each"** options. Sources other areas already build (`retail-sales`, `retail-shifts`,
   `retail-stock-on-hand`, `retail-stock-movements`, `retail-orders`, `retail-bills`, `retail-requisitions`, `retail-empties`,
   `retail-customers`, `retail-accounts`) get their report face from this spec; two sources are new and report-only
   (`retail-items-sold`, `retail-payments`). List mode gains `face=report`, `template=<ref>`, `rows=<keys>` (roll up: one row
   for each value, money and counts summed) and `cols=<keys in order>`.

6. **Built-in templates are code; the team's are rows.** Thirteen built-ins live in `lib/reports/definitions/retail/templates.ts`
   (slug, name, summary, area, source, audience label, query). Saved templates stay `ReportTemplate` rows (the model added in
   `c78d01f`), keeping their view and params JSON; the view gains an optional `rows`. How often each template is opened, built
   in or saved, is a new `ReportTemplateUse` row per template.

7. **Who sees and changes a template** (W-73, W-75, and the sheets' hint "People only ever see the rows their own role lets them
   see, whoever made the template."):
   - **Just me**: only whoever made it. **Managers**: owners, managers and the bookkeeper (`SUPERADMIN`, `MANAGER`,
     `SHOP_MANAGER`, `FINANCE_OFFICER`). **Everyone**: also cashiers and stock clerks. Built-ins carry the board's label
     (Everyone or Managers) and are enforced the same way.
   - A template is listed only when its audience includes the person **and** the person's role may read its source; rows are
     always the source's rows for that role (a cashier opening "Sales" sees their own sales; a stock clerk never sees cost).
   - Saving and making templates, and sharing them: owners and managers (`retail.reports:create`; W-73, W-74).
   - Changing, re-sharing, the weekly email and deleting: **whoever made it, or an owner** once it is shared (W-75). This
     replaces `c78d01f`'s "or a manager" in `lib/reports/template-access.ts` for every product.
   - So the Reports module shows for cashiers and stock clerks when at least one template is theirs to open (with the seed:
     cashiers see Sales, Items sold and Customer spend; stock clerks see Stock on hand and Empties owed by supplier). **Defined
     here**; W-69 names owner, manager and bookkeeper as the people who run reports, which this does not change.

8. **Insights are owner, manager and bookkeeper; Money is owner and bookkeeper** (Roles board: "Insights R R R – – R", "Managers
   do not see Money."). Two resources: `retail.insights:view` and `retail.money:view`. `retail.reports` stops meaning "the
   trading dashboard" and means Reports.

9. **Findings are rules, not prose.** "What it says" and "Do something about it" are generated by named rules per page
   (section 5), each with its condition, its sentence with holes, and its link. A rule whose condition fails says nothing; a
   page with no rule firing says "Not enough trade in these dates to say." and keeps one fallback link.

---

## 1. Boards

Canvas reading order of page "07 Insights and reports" (row 1: W-52/W-56, row 2: W-53, row 3: Reports), then boards in this
area's workflows that live on other pages. "Code status today" was checked against the source at `c78d01f` and the running app
(screenshots named in the header).

| # | Board file | Canvas title | What it is | Target route, or where it opens | Code status today | Notes |
|---|---|---|---|---|---|---|
| 1 | `InsightsSales.dc.html` | When do we sell? | dashboard (insight) | `/retail/insights/sales` | **Exists but differs** (`insight-sales-full.png`): generic shell with blue theme; period is a dropdown chip "Period Last 30 days" (7/30/90 days) instead of the segmented "Today · 7 days · 30 days · This month"; no Site chip, no "Compared with the 30 days before", no "Updated 14:42", no header "Export"; KPI strip unboxed, money as "$16,562" (rounded, `$`), every delta as a percentage ("+1748.0%"); heat grid 24 hours (00–23) in blue, unit "on an average week" (board: 14 trading hours, `--data` grey, "average a day", Quieter/Busier scale); tabs as pills, table has no Σ row and no Export, till and cashier tables lack "Against before"; findings are plain sentences of other shapes; actions are two blue links ("See the sales", "Plan a promotion for the quiet hours"); no "Send me this". | FND-09 moves the page onto the frame; INS-01 replaces the API contract and the content; INS-05 adds Export and Send me this. |
| 2 | `InsightsProfit.dc.html` | What do we actually make? | dashboard (insight) | `/retail/insights/profit` | **Exists but differs** (`insight-profit-full.png`): KPI "Lost to stock counts" (board "Lost to breakage and counts"), margin delta as "−0.9%" (board "−0.4 pts"), "Given away in promotions" with no "back for each US$1"; bars right; tabs "Earning least / Earning most" (board "Products earning least / most"); columns Sold, Sales ex VAT, Margin, Profit (board Price, Cost, Margin, Profit, 30 days); actions "Change prices", "Set margins you aim for" (board "Raise Two Keys and Gordon’s to target margin", "See whether the festive promotion paid"). | INS-01 |
| 3 | `InsightsProducts.dc.html` | W-54  Where is our cash sitting? Dead stock | dashboard (insight) | `/retail/insights/products` | **Exists but differs** (`insight-products-full.png`): KPI "Out of stock · now" (board "Out of stock days" against before); chart as horizontal bars (board vertical columns with a US$ axis), last bucket "Over 90 days, or never" (board "Over 90 days"); "Not sold in 60 days" table has no "Do" column and no Σ row; actions "Run a promotion on what is not selling", "Order from suppliers". | INS-02 (W-54) |
| 4 | `InsightsStock.dc.html` | Are we stocked right? | dashboard (insight) | `/retail/insights/stock` | **Exists but differs** (`insight-stock-full.png`): bars have no aim mark and no "Aim: 14 days, plus supplier lead time" note; verdict thresholds differ (Too little under 7 days); tabs "Out of stock / Too much" (board "Ran out this month / Too much"); columns Out for, Sales missed, Sold a day, Reorder at (board Out for, On hand, Sales missed, Do); KPI "Stock at cost" has no "on a month ago". | INS-02 |
| 5 | `InsightsLosses.dc.html` | W-53  Where is money leaking? | dashboard (insight) | `/retail/insights/losses` | **Exists but differs** (`insight-losses-full.png`): three loss kinds (Stock counts, Drawer differences, Refunds and voids) where the board has four (Count differences, Breakage, Drawer differences, Refunds and voids); one column per week of the period (5) instead of eight weeks; one table "By cashier" without "No-sale opens" and without the "By product" and "By till" tabs, no Export, no Σ; KPI notes "7 shifts short", "15 of them" (board "5 shifts out", "7 over the PIN limit: 2"); counts read only `ADJUSTMENT` movements. | INS-03 (W-53) |
| 6 | `InsightsCustomers.dc.html` | Who comes back? | dashboard (insight) | `/retail/insights/customers` | **Exists but differs** (`insight-customers-full.png`): members are guessed from `customerName` ≠ "walk-in" (board: customers on the loyalty ledger); chart stacked (board side by side); table columns Customer, Last came, Visits 12 months, Spend (board adds Points); no links to the customer. | INS-03 |
| 7 | `InsightsMoney.dc.html` | Where is the cash going? | dashboard (insight) | `/retail/insights/money` | **Exists but differs** (`insight-money-full.png`, `manager-insight-money.png`): KPIs Cash in open tills, On order from suppliers, Requisitions to pay, Bottle deposits held (board Cash at hand, Owed to suppliers, Owed to you, Requisitions out); one table "Still to pay or come" of orders and requisitions (board "Due in the next 14 days" of bills, requisitions and the plan, and "Where the cash is"); **a manager can open it** (board: "Managers do not see Money"). | INS-04 |
| 8 | `ReportsList.dc.html` | W-69  Reports: every template, by area, built in or the team’s | list (`List` kind `reports`) | `/retail/reports` | **Exists but differs** (`reports.png`): `/reports` is a generic catalogue page in the generic shell (title "Reports", blue "New template"); tabs All / Built in / Made by your team / Just yours, a search box and an "Every area" select; columns Template, What it shows, Area, Made by, Seen by (no Last opened); no selection, bulk, Σ row, sort, pager or Export; only four retail built-ins (Sales, Items sold, Till shifts, Stock on hand). **In the running preview the page fails** with "Reports did not load · Failed to list report templates": the dev server's Prisma client predates `ReportTemplate` (`prisma.reportTemplate` is undefined in `lib/reports/templates.ts:108`); the code is right and works after a `prisma generate` + server restart. | INS-07 |
| 9 | `ReportsStock.dc.html` | An area: the Stock templates | list (`List` kind `reportsstock`) | `/retail/reports?area=stock` | **Missing**: an area is only a select on `/reports`; no area page, no "Made by" filter, no panel items with counts. | INS-07 |
| 10 | `ReportSales.dc.html` | W-69  A built-in template, run: narrow, total, export | list (`List` kind `salesreport`) | `/retail/reports/sales` | **Exists but differs** (`report-sales-full.png`): `/reports/retail-sales` is the generic `ReportScreen`: back "Reports", a "Date Sep 27 – Oct 4" range chip, search, "Filter", a grouping select, "Columns 8/11", a figures row (Rows, Before discount, Discount, Tax, Total), three charts (Takings over time, By cashier, By shop), an upper-case table, "Save as a template", a blue "Export" dropdown of PDF layouts, ⋯ "Arrange the page". No Period/Shop/Cashier/Type chips, no Σ totals band, no pager, no sub "Built in · 1 to 3 October 2026, every shop", money without `US$`, sale numbers `S-000930`. | INS-06 (source), INS-08 (page) |
| 11 | `ReportSaveTemplate.dc.html` | W-73  Save what is on screen as a template | sheet (`templatesave`) over the run page | `?sheet=template-save` over `/retail/reports/sales` | **Exists but differs** (`report-sales-save.png`): `TemplateSheet` mode "save": no breadcrumb sub, name defaults to "Sales, my view", Filters read "None", Sorted "Date, highest first", dates seg "Move with today · Keep 2026-09-27 to 2026-10-04", no "Email it every Monday at 07:00" toggle, no footer note; done "{name} is under {area}". | INS-08 |
| 12 | `TemplateNew.dc.html` | W-74  A template from scratch: what it reads, columns, who sees it | sheet (`templatenew`, wide) over Every template | `?sheet=template-new` over `/retail/reports` | **Exists but differs** (`reports-new-template.png` cannot open in the preview because the catalogue fails): `TemplateSheet` mode "new" has a select of reports for "Starts from", Name, What it shows, Seen by; no source cards, no Columns, Period or "One row for each", no email toggle, no "Open it without saving". | INS-08 |
| 13 | `ReportWeekend.dc.html` | A team template, opened | list (`List` kind `weekendreport`) | `/retail/reports/<template id>` | **Exists but differs**: a template opens as `/reports/retail-sales?template=<id>` in the generic screen with a line "Tendai Mhlanga’s template on Sales · managers see it"; there is no "One row for each" (the sales report cannot show one row per shop), no payment columns (Cash, EcoCash, Card, On account, Taken), no "Last weekend" period and no seeded team template. | INS-06, INS-08 |
| 14 | `TemplateEdit.dc.html` | W-75  Change, share, email or delete a template | sheet (`templateedit`) over the template | `?sheet=template-edit` over `/retail/reports/<template id>` | **Exists but differs**: `TemplateSheet` mode "edit": sub "{Yours \| Made by X}, on {report}" (board "Made by Tendai Mhlanga on 14 September 2026 · opened 22 times"); Name, What it shows, Seen by; no "Starts from" read field, no email toggle; danger "Delete the template" with a confirm whose body differs. Changing is allowed to "a manager once it is shared" (board: whoever made it, or an owner). | INS-08, INS-09 |
| 15 | `WfInsights.dc.html` (page "Workflows") | 07 Insights | explainer | none | n/a | The workflow map of this area (`WorkflowMap` area `insights`): the source of section 2. |
| 16 | `Floor.dc.html` (page "05 Selling and the floor") | Overview | dashboard | `/retail` | floor spec (FLR-08) | W-51's only screen. Nothing to build here (section 2). |
| 17 | `ShiftRecord.dc.html`, `CountNew.dc.html` | (floor, stock pages) | record, sheet | `/retail/shifts/[id]`, `?sheet=count-new` over `/retail/stock/counts` | floor and stock specs | W-53's other screens. This spec only links into them (section 5.6). |
| 18 | `PromotionNew.dc.html`, `ReturnNew.dc.html` | (products, buying pages) | sheets | `?sheet=promotion-new` over Promotions; `?sheet=return-new` over the supplier | products and buying specs | W-54's other screens. This spec links into them with prefill (section 5.4). |
| 19 | `List.dc.html`, `ProductsList.dc.html` | List: every working list; Products | list frame, list | every list | foundations, products spec | W-55's screens: Export lives in the frame (FND W-55). |
| 20 | (`InsightsMap.dc.html`) | "All insights" (`imap` in `WorkflowMap` `S`) | — | — | **No board file exists** | Referenced only from the workflow map's screen keys and no flow uses it. Nothing to build. |

Boards the insight pages link to ("Do something about it", "Do" cells, row links), all owned by other specs; this spec owns
the link and its prefill (section 5):

| From | Link text on the board | Board | Target route here | Owner of the target |
|---|---|---|---|---|
| Sales | "Put two cashiers on Friday 16:00 to 21:00" | `PeopleList` | `/retail/manage/people` | ADM:people |
| Sales | "Run a happy hour on quiet weekday afternoons" | `PriceListNew` | `/retail/products/price-lists?sheet=price-list-new` | PRD-05 |
| Profit | "Raise Two Keys and Gordon’s to target margin" | `BulkPrice` | `/retail/products?sheet=bulk-price&list=<default list id>&ids=<product ids>&how=margin` | PRD-07 |
| Profit | "See whether the festive promotion paid" | `PromotionRecord` | `/retail/products/promotions/<id>` | PRD-09 |
| Profit, Products, Stock | product names | `Product` | `/retail/products/<id>` | PRD-04 |
| Products | "Run a promotion", "Promote the slow spirits" | `PromotionNew` | `/retail/products/promotions?sheet=promotion-new&productIds=<…>` | PRD-09 (reads `productIds`, see 5.4) |
| Products | "Return to supplier", "Send the rosé back to Mukuru Wines" | `ReturnNew` | `/retail/buying/suppliers/<id>?sheet=return-new&supplierId=<id>&productIds=<…>` | BUY-09 |
| Products | "Write it off" | `StockAdjust` | `/retail/products/<id>?sheet=stock-adjust&productId=<id>&why=broken` | STK-04 (reads `why`, see 5.4) |
| Products | "Stop reordering what does not sell" | `Reorder` | `/retail/stock?sheet=reorder-levels&ids=<stock line ids>` | STK-02 |
| Stock | "Order it", "Order less wine next time" | `OrderNew` | `/retail/buying/orders?sheet=order-new&productIds=<…>` (or `&supplierId=<id>`) | BUY-02 |
| Stock | "Raise reorder level", "Raise reorder levels for beer and ice" | `Reorder` | `/retail/stock?sheet=reorder-levels&ids=<stock line ids>` | STK-02 |
| Losses | "Count the spirits shelf again" | `CountNew` | `/retail/stock/counts?sheet=count-new&categoryIds=<id>` | STK-05 (reads `categoryIds`, see 5.6) |
| Losses | "Look at Chipo’s Friday shifts" | `ShiftRecord` | `/retail/shifts?cashier=<user id>&state=short&opened=30d` | FND-LIST / FLR-03 |
| Losses | "Require a PIN to open the drawer" | `TillRules` | `/retail/manage/till-rules` | SET-06 |
| Customers | customer names | `CustomerRecord` | `/retail/customers/<id>` | CUS:customers |
| Customers | "Message the 96 with their points balance" | `MessageNew` | `/retail/customers?sheet=message&segment=lapsed-30` | CUS:message |
| Customers | "Change what a point is worth" | `LoyaltySettings` | `/retail/manage/loyalty` | CUS:loyalty |
| Money | "INV-88120", "SZ-4471" | `BillEdit` | `/retail/buying/bills?sheet=bill-edit&id=<bill id>` | BUY-07 |
| Money | "REQ-0014" | `RequisitionRecord` | `/retail/buying/requisitions/<id>` | BUY-04 |
| Money | "Plan" | `BillingSettings` | `/retail/manage/billing` | SET-10 |
| Money | "Chase Mbare Sports Club" | `CustPayment` | `/retail/accounts/<customer id>?sheet=customer-payment` | CUS:accounts |
| Money | "Pay Delta Beverages" | `PaymentNew` | `/retail/buying/suppliers/<id>?sheet=payment-new&supplierId=<id>` | BUY-07 |

---

## 2. Workflows

Definitions from `WorkflowMap.dc.html` (`A.insights`), verbatim: `[id, name, who, starts from, steps, guided, screens]`.

### W-51 The morning look — **Owner** — starts "Overview"

Steps: Needs action · Yesterday against last week · Tills now. Screens: overview (`Floor`).

The whole workflow is the Overview, built by the floor spec (FLR-08, its section 2 "W-51"): `GET /api/v2/retail/overview?period=today&siteId=`
returns Needs action (each row linked to its workflow), the Today tile against the same weekday last week by this hour, the
30-day bars and Tills now. Permission: the Overview's own read (floor spec; owner, manager, bookkeeper). This spec adds
nothing and builds nothing; the Overview's tiles and the Insights pages share the floor's takings function
(`lib/retail/floor/takings.ts#sumTakings`) so "Takings" on the Overview and on Insights › Sales never disagree.
**Works today: partly** (P&L cards and a two-row Needs action; see the floor spec).

### W-52 Weekly review — **Owner** — starts "Insights"

Steps: Sales · Profit · Products · Losses. Screens: isales, iprofit, iproducts, istock, ilosses, icust, imoney.

| Step | What the owner does | What the server does |
|---|---|---|
| Open Insights | Rail mark Insights → panel lists Sales, Profit, Products, Stock health, Losses, Customers, Money (Money only for owner and bookkeeper). The mark opens Sales. | Nav (FND-SHELL) shows items whose `requires` pass: `retail.insights:view`, Money `retail.money:view`. No badges. |
| Sales | Reads the KPIs against the period before, the heat grid, the category table; switches the period or the site; changes tab. | `GET /api/v2/retail/insights/sales?period=30d&siteId=all` (`retail.insights:view`). Reads posted sales and their lines in the window and the window before (section 3.7 "Takings"); the shop's trading hours (`RetailShopProfile`, SET-01) decide the heat grid's hours. Pure read; no audit. |
| Profit | Reads gross profit and margin by category against each category's target; the products earning least. Follows "Raise … to target margin" or "See whether the … promotion paid". | `GET …/insights/profit`. Lines' `lineTotal − taxAmount` and `costTotal`; `promotionDiscount` (PRD-09) for "Given away in promotions"; `StockMovement` reasons COUNT, BROKEN, OWN_USE and transfer losses (STK) for "Lost to breakage and counts"; `RetailCategory.targetMarginPercent` (PRD-02). |
| Products | Reads where the cash sits by days since last sold; the dead stock list with what to do about each. | `GET …/insights/products` (W-54). |
| (Stock health) | Days of cover by category against the 14-day aim; what ran out and what is overstocked. | `GET …/insights/stock`. Reads `stockLevel()`, `daysOfCover`, `COVER_AIM` from `lib/retail/stock/levels.ts` (STK-01) and the stockout estimate (`lib/retail/stockouts.ts`). |
| Losses | Reads what leaked by kind and by person (W-53). | `GET …/insights/losses`. |
| (Customers, Money) | Who comes back; where the cash is going (owner and bookkeeper). | `GET …/insights/customers`, `GET …/insights/money` (`retail.money:view`; a manager gets 403 "Your role cannot view the money page"). |

Other screens: none change; every page is a read. Exports and Send me this are W-55 and W-56.
**Works today: partly** — all seven pages load real figures (section 1 rows 1–7 list how each differs); manager can open Money.

### W-53 Investigate a loss — **Owner** — starts "Insights › Losses"

Steps: Who and which till · Open the shifts · Open the sales. Screens: ilosses, shift, countnew.

| Step | What the owner does | What the server does |
|---|---|---|
| Who and which till | On Losses, reads the stacked weekly columns, then the "By cashier" tab (Drawer differences, Refunds, Voids, No-sale opens) and "By till". | `GET /api/v2/retail/insights/losses?period=30d&siteId=all&tab=cashier` (`retail.insights:view`). Drawer differences from closed shifts' `variance` (FLR-04) by `cashierId`/register; refunds = REFUND documents, voids = SALE documents voided (FLR-01/02), by the cashier who rang them; no-sale opens = `PlatformAuditEvent` `RETAIL_DRAWER.OPENED` (SET-06/FLR-09) by actor; counts and breakage by product from `StockMovement` (STK-01 reasons). |
| Open the shifts | Clicks a cashier's name (or "Look at Chipo’s Friday shifts"). | Navigates to `/retail/shifts?cashier=<user id>&state=short&opened=30d` (the Shifts list, FND-LIST, scoped by its own read). From a row the shift record `/retail/shifts/[id]` (FLR-03): its count, sign-off and sales. |
| Open the sales | Clicks a cashier's Refunds or Voids figure. | Navigates to `/retail/sales?tab=refunds&cashier=<user id>&when=30d` (or `tab=voids`) — the floor's Sales list (FLR-01). From a row the sale record. |
| (Count again) | "Count the spirits shelf again". | Opens `?sheet=count-new&categoryIds=<id>` over `/retail/stock/counts` (STK-05): starting the count is the stock spec's `POST /api/v2/retail/stock/counts` (its audit, notification to the counter). |

Side effects: none from Insights; the linked pages do their own. **Works today: partly** (Losses by cashier exists; no links,
no till tab, no no-sale opens, no breakage kind).

### W-54 Find dead stock and free the cash — **Owner, manager** — starts "Insights › Products"

Steps: Not sold in 60 days · Promote, return or write off. Screens: iproducts, promonew, returnnew.

| Step | Who | What the server does |
|---|---|---|
| Not sold in 60 days | Owner, manager (bookkeeper reads too) | `GET /api/v2/retail/insights/products` returns tab `idle`: every product (not archived, on hand > 0 at the selected site or sites) whose last posted SALE line is more than 60 days before the end of the period, or that never sold since it was set up more than 60 days ago; sorted by cash in it (on hand × unit cost) descending; each row carries its "Do" link chosen by the rule in 5.4. |
| Promote | Manager (`retail.promotions:create`) | "Run a promotion" → `?sheet=promotion-new&productIds=<id>` (one product) or "Promote the slow spirits" (`productIds` of the idle products in that category). Saving is PRD-09's `POST /api/v2/retail/promotions` (scope PRODUCTS, the products; audit `RETAIL_PROMOTION.CREATED`). Next load: the products still show here until they sell; once a sale posts, "Last sold" moves and they leave the list. |
| Return | Manager (`retail.purchasing:create` per BUY-09) | "Return to supplier" → `?sheet=return-new&supplierId=<id>&productIds=<id>` over the supplier record (lines prefilled at on hand). Saving is BUY-09's `POST /api/v2/retail/buying/returns`: stock off now (`StockMovement` reason SUPPLIER_RETURN, reference `RTN-…`), a debit note expected, audit `RETAIL_SUPPLIER_RETURN.BOOKED`. Next load: on hand drops, the product leaves "Not sold in 60 days" when it reaches 0, "Cash in it" and the KPI fall. |
| Write off | Manager or stock clerk (`retail.adjustments:create`, STK-04) | "Write it off" → `?sheet=stock-adjust&productId=<id>&why=broken` over the product. Saving is STK-04's `POST /api/v2/retail/stock/adjustments` (reason BROKEN; journal `RETAIL_STOCK_ADJUSTMENT` LOSS Dr Breakage and losses / Cr Stock through `postRetailJournal`; manager PIN over the approvals limit; audit `RETAIL_STOCK.ADJUSTED`). Next load: the product leaves the list; Insights › Losses shows the value under Breakage and Profit's "Lost to breakage and counts" rises. |
| (Stop reordering) | Manager (`retail.stock:update`) | "Stop reordering what does not sell" → `?sheet=reorder-levels&ids=<stock line ids of idle products with a reorder level>` (STK-02 `PUT /api/v2/retail/stock/reorder`). |

**Works today: partly** (the idle list exists without its Do column; the three sheets are other specs' and mostly missing).

### W-55 Export anything — **Anyone** — starts "Any list or record"

Steps: Export · Spreadsheet, CSV or PDF. Screens: list, products.

Foundations owns the list and record parts (FND W-55: `POST /api/v2/reports/[key]/export`, `RETAIL_EXPORT.DOWNLOADED`). This
spec adds:

| Where | What the person does | What the server does |
|---|---|---|
| An insight page, header "Export" | Menu headed "This page, last 30 days": "PDF, ready to print" `.pdf` (the whole page), "Spreadsheet" `.xlsx` (every tab's table, one sheet each). **Defined here.** | `POST /api/v2/retail/insights/[topic]/export` `{ what: "page" \| "tables", format, period, siteId }` (`retail.insights:view`, Money also `retail.money:view`). Re-computes the insight under the caller's permissions (never from the browser), renders the page with the shared chart components into the document shell (`renderDocumentShell` + `renderPdfFromHtml`, A4 landscape, company branding) or builds the workbook (`exceljs`, as `lib/reports/export-xlsx.ts` does: a title row, the period line, then each table with its Σ row). File `<topic>_<from>_<to>.<ext>` ("sales_2026-09-04_2026-10-03.pdf"). Audit `RETAIL_EXPORT.DOWNLOADED { key: "insight-sales", format, what }`. |
| An insight table's "Export" | Menu headed "The 6 categories the table shows": Spreadsheet `.xlsx`, Comma-separated `.csv`, PDF, ready to print `.pdf`. | Same endpoint with `{ what: "table", table: "category", format }`. |
| A report run page (W-69) | FND toolbar Export, or "Export <n>" on a selection. | FND 4.2 with `query.face = "report"`, `query.template = <ref>`, `rows`, `cols`; the file is exactly the rolled-up, filtered table with its Σ row. |
| The Reports catalogue | FND toolbar Export ("The 16 templates the filters show"). | FND 4.2 on `retail-report-templates`. |

**Works today: partly** (generic reports export CSV, XLSX and PDF layouts; insight pages and retail lists cannot export).

### W-56 Get a report every week — **Owner** — starts "Any insight page, or a report"

Steps: Send me this · WhatsApp or email · Day and time. Screens: isales, reports.

| Step | What the person does | What the server does |
|---|---|---|
| Send me this (insight) | In the aside, "Send it every Monday". | `POST /api/v2/retail/sends { subject: "INSIGHT", ref: "sales", options: { period: "30d", siteId: "all" } }` (`retail.insights:view`; Money also `retail.money:view`). Creates a `ReportSend` for the caller: channel WHATSAPP when `User.phone` is set, else EMAIL; weekday 1 (Monday); time "07:00"; `nextRunAt` = next Monday 07:00 Africa/Harare. Unique per (company, subject, ref, recipient): a second press returns the existing send (200). Audit `RETAIL_REPORT_SEND.STARTED { subject, ref, channel, weekday, time }`. The aside now reads "Every Monday at 07:00 on WhatsApp, to +263 77 412 0098." in `--ok` with "Change" after it. |
| WhatsApp or email · Day and time | "Change" opens `?sheet=insight-send&topic=sales`: Channel, Day, At; or "Stop sending". | `PATCH /api/v2/retail/sends/[id] { channel, weekday, time }` (own send only, else 404 "Send not found"); recomputes `nextRunAt`; audit `RETAIL_REPORT_SEND.CHANGED`. "Stop sending" → `DELETE /api/v2/retail/sends/[id]`; audit `RETAIL_REPORT_SEND.STOPPED`. Channel WhatsApp without a phone → 400 `fieldErrors.channel` "Add your phone number in Profile to get it on WhatsApp." |
| Each Monday (the worker) | — | `scripts/retail-worker.ts` every 5 minutes runs `runDueSends(now)` (`lib/retail/sends/run.ts`): claims each send with `nextRunAt ≤ now` by an `UPDATE … SET "nextRunAt" = <next week> WHERE id = $1 AND "nextRunAt" = $old` (so two workers never send twice); re-checks the recipient still holds the permission (else deletes the send and notifies them "Your Monday Sales picture stopped: your role cannot see it any more."); loads the insight for the stored period and site **as the recipient**; renders the picture (KPI strip + question panel, 1080×1350 PNG via `renderPngFromHtml`), uploads it (`uploadFileToBlob`, folder `insight-pictures`); WhatsApp: a `RetailMessage { channel: WHATSAPP, to: phone, template: "insight-weekly", body, mediaUrl }` QUEUED for SET-07's outbox drain (body: "Sales, last 30 days" then the three "What it says" lines as "• …", then the page link); email: sends at once through `lib/email/send.ts` (subject "Sales, last 30 days", the three lines in the HTML, the PNG inline and attached) and logs a `RetailMessage { channel: EMAIL, status: SENT \| FAILED }`. Sets `lastSentAt`, `lastRecipients`, clears or sets `lastError`. On failure: `Notification` to the recipient "Your Monday Sales picture did not go: <reason>." (**Defined here**). |
| From a report | A template's own weekly email (toggle in `template-save`, `template-new`, `template-edit`), the catalogue's bulk "Email every Monday", or a run page's selection bar "Email every Monday" (`report-send` sheet). | Template email: `ReportSend { subject: TEMPLATE, ref: <template id>, templateId, channel: EMAIL, recipientId: null }` created/removed by the template endpoints (W-73/74/75). Personal: `POST /api/v2/retail/sends { subject: "TEMPLATE", ref }`. The worker resolves recipients (template email: every active user with an email whom the template's audience includes and whose role reads the source; personal: the one person), fetches the template's rows **as each recipient** for the period resolved at send time, renders the PDF (`exportDocument("layout", …)` + `renderPdfFromHtml`) and emails it ("Weekend takings by shop, 25 to 27 September.pdf", subject "Weekend takings by shop — 25 to 27 September"), one `RetailMessage` EMAIL per recipient. |

**Works today: no.** Nothing sends on a schedule (task D4 was never done).

### W-69 Run a report and export it — **Owner, manager, bookkeeper** — starts "Reports"

Steps: Pick the area, then the template · Narrow by period, shop and person · Totals follow the filters · Spreadsheet, CSV or
PDF. Screens: reports, reportsstock, report.

| Step | What the person does | What the server does |
|---|---|---|
| Pick the area, then the template | Rail mark Reports → Every template (or an area from the panel: Selling 4, Stock 4, …); clicks a template's name. | Catalogue: `GET /api/v2/reports/retail-report-templates?page=1&size=50&tab=all[&area=stock]` (FND list mode): the 13 built-ins and the saved templates the caller may see (decision 7), with Last opened from `ReportTemplateUse`. Badges: `GET /api/v2/retail/nav/badges` → `reports: { all, selling, stock, buying, customers, money, floor }`. Opening a template: `GET /api/v2/retail/reports/[ref]` (header context and the template's query; 404 "Template not found" when the caller may not open it), then `POST /api/v2/retail/reports/[ref]/opened` (upserts `ReportTemplateUse`: `opens + 1`, `lastOpenedAt = now`, `lastOpenedById`). |
| Narrow by period, shop and person | Changes Period, Shop, Cashier, Type; searches; sorts; groups; picks columns; picks "One row for each". | `GET /api/v2/reports/retail-sales?face=report&template=sales&page=1&size=50&when=this-month&site=any&cashier=any&type=any[&rows=site][&cols=…]` — FND 4.1 list mode on the source's report face: the template's query underneath, the URL's params on top; the source's own read check and row scope (a cashier sees their own sales) apply. The run page writes the query into the URL; the header sub follows ("Built in · 1 to 3 October 2026, every shop"). |
| Totals follow the filters | Reads the Σ band. | `totals` over every filtered (and rolled-up) row, never the page; the count is the rows shown ("1,284" sales, or "3" shops when one row for each shop). Voided sales are left out of money totals (floor deviation). |
| Spreadsheet, CSV or PDF | Export menu, or "Export <n>" on a selection. | FND 4.2 with the same query; `RETAIL_EXPORT.DOWNLOADED { key: "retail-sales", template: "sales", format, rows }`. |

Permissions: the catalogue and run pages need `retail.reports:view` (all five roles; decision 7 narrows what each sees);
the rows need the source's read. **Works today: partly** (`/reports` and the generic report screen; section 1 rows 8, 10).

### W-73 Save a report as a template — **Owner, manager** — starts "Any report"

Steps: Change columns, filters and period · Save as a template · Name it, choose who sees it · It lists under its area.
Screens: report, templatesave, reports.

| Step | What the person does | What the server does |
|---|---|---|
| Change columns, filters and period | On any run page (built-in or saved). | Reads only (W-69). |
| Save as a template | Header primary "+ Save as a template" → `?sheet=template-save` over the page. | The sheet loads nothing; it describes the on-screen query ("What it keeps"). |
| Name it, choose who sees it | Name (suggested "Month to date, every shop"), What it shows, Period ("Moves with today" / "Keep 1 to 3 October"), Seen by, "Email it every Monday at 07:00". "Save the template". | `POST /api/v2/reports/templates { reportKey: "retail-sales", name, description, audience: "JUST_ME" \| "MANAGERS" \| "EVERYONE", view, params, keepDates, email: { on } }` (`retail.reports:create` → 403 "Your role cannot save report templates"). Validates name 1–120, unique among the company's saved templates and the built-ins' names case-insensitively (400 `fieldErrors.name` "There is already a template called Sales. Give it another name."), description ≤ 240, at least one column, `rows` among the face's options, the period a preset or a range of at most 366 days. Fits the view to the face's columns; keeps the period filter as the preset unless `keepDates` (then the resolved range `2026-10-01..2026-10-03`). Creates `ReportTemplate`; when `email.on`, a `ReportSend` (TEMPLATE, EMAIL, Monday 07:00, `recipientId` null, `templateId`). Audit `RETAIL_REPORT_TEMPLATE.SAVED { source, name, audience, from: "sales", email }`. 201 `{ template }`. |
| It lists under its area | Toast "Month to date, every shop is under Selling."; the page moves to `/retail/reports/<new id>`. | The catalogue and the panel badge (Selling 5, Every template 17) include it for everyone its audience allows. The built-in "Sales" is unchanged. |

**Works today: partly** (save from the generic screen, without the email, suggested name, breadcrumb or note).

### W-74 Make a template from scratch — **Owner, manager** — starts "Reports › New template"

Steps: Pick what it reads · Columns, period, one row for each · Who sees it, and a weekly email. Screens: reports,
templatenew, weekend.

| Step | What the person does | What the server does |
|---|---|---|
| Pick what it reads | "+ New template" → `?sheet=template-new` (wide). Picks one of nine "Starts from" cards (default Sales; on an area page the area's first card). | `GET /api/v2/retail/reports/sources` (`retail.reports:create`): the nine cards with each face's columns (key, label, kind, whether it can be summed), its "One row for each" options, period options and default query, filtered to sources the caller's role may read. |
| Columns, period, one row for each | Name, What it shows, Columns (tags, in order), Period, One row for each. | Nothing until saved. The footer note follows the card: "It goes under Selling, beside the built-in Sales." |
| Who sees it, and a weekly email | Seen by; "Email it every Monday at 07:00". "Make the template", or "Open it without saving". | "Make the template": `POST /api/v2/reports/templates` as in W-73 with `view` built from the sheet (`columns` = the tags in order then the rest hidden; `rows` = the chosen key, or none for "Sale"; sort = the face's default for that shape) and `params` = the face's default filters plus the period. Toast "Weekend takings by shop is under Selling."; navigates to `/retail/reports/<id>` (the `ReportWeekend` board). "Open it without saving": no request; navigates to `/retail/reports/<the card's built-in>?rows=…&cols=…&<period filter>=…` so the person can look before saving. |

**Works today: partly** (generic "New template" picks a report and saves its own view; nothing else).

### W-75 Change, share or delete a template — **Whoever made it, or an owner** — starts "A template › Change the template"

Steps: Rename it · Who sees it · Email it every Monday · Delete: no rows are lost. Screens: weekend, templateedit.

| Step | What the person does | What the server does |
|---|---|---|
| Open | Header sub link "Change the template" (shown only when `canChange`) → `?sheet=template-edit`. | `GET /api/v2/retail/reports/[id]` already returned `canChange`, `createdAt`, `opens`, `email` (on, weekday, time, recipients, last sent). |
| Rename it · Who sees it · Email it every Monday | Name, What it shows, Seen by, the email toggle (and "Change the day" → Day, At). "Save". | `PATCH /api/v2/reports/templates/[id] { name, description, audience, view, params, email: { on, weekday, time } }`. Allowed: the maker, or `SUPERADMIN` when the template is shared; else 403 "Only whoever made it, or an owner, can change this template". Sharing beyond Just me needs `retail.reports:create`. `view`/`params` are the page's current query, so whatever was changed on the report is saved here ("Change the columns, filters and grouping on the report itself, then save it here."). Email on → upsert the template's `ReportSend` (recipient null); off → delete it. Audit `RETAIL_REPORT_TEMPLATE.CHANGED { changed: ["name", "audience", "view", "email"] }` (and `…SHARED { from, to }` when the audience widens). Toast "Weekend takings by shop saved." |
| Delete: no rows are lost | Footer danger "Delete the template" → ConfirmDialog `templatedelete`. | `DELETE /api/v2/reports/templates/[id]`: deletes the template; its `ReportTemplateUse` row and `ReportSend` rows go with it (foreign keys, cascade). No source row changes. Audit `RETAIL_REPORT_TEMPLATE.DELETED { name, source }`. Toast "Weekend takings by shop deleted."; navigates to `/retail/reports?area=selling`. |
| (Many at once) | Catalogue selection: "Share", "Email every Monday", "Delete". | `POST /api/v2/retail/reports/templates/share { ids, audience }`, `…/email { refs }`, `…/delete { ids }` — each applies to the templates the caller may change and skips the rest (built-ins are never shared or deleted), returning `{ done, skipped }`. |

**Works today: partly** (rename, re-share and delete in the generic sheet; the rule is "or a manager"; no email).

### Workflows that already work, in one line each

| W | Works today | Missing |
|---|---|---|
| W-51 | Floor's | (floor spec) |
| W-52 | Seven pages with real figures | Periods, site, comparisons as worded, frame, totals, the board's tables, findings and actions, Money closed to managers |
| W-53 | Losses by cashier | Four kinds, by till, by product, no-sale opens, links into shifts and sales |
| W-54 | The idle list | "Do" per row, prefilled sheets, Σ |
| W-55 | Generic report export | Insight exports; retail report faces |
| W-56 | — | Everything |
| W-69 | Generic catalogue and report screen | Retail module, areas, 13 built-ins, report faces, one row for each, Σ band, pager, last opened |
| W-73 | Generic save | Suggested name, keep dates as the board words it, email, note, breadcrumb |
| W-74 | Generic new | Cards, columns, period, one row for each, email, open without saving |
| W-75 | Generic edit and delete | Owner rule, email, opened count, "Starts from" |

---

## 3. Data

### 3.1 Models used

| Model | Used for | Owner of changes |
|---|---|---|
| `RetailSale`, `RetailSaleLine`, `RetailSalePayment` | Takings, baskets, categories, margin, promotions given away, refunds and voids, members, payments, the sales and items-sold sources | floor (FLR-01 `customerId`, `approvedById`), setup (SET-04 `registerId`), products (PRD-09 `promotionId`, `promotionDiscount`); **this spec** adds `RetailSaleLine.shelfPrice` (3.2.2) |
| `RetailShift` | Drawer differences, tills now, the shifts source | floor (FLR-03/04) |
| `StockMovement` (`reason`, `reference`, `change`, `balanceAfter`), `InventoryItem` | Count differences, breakage, own use, stockouts, stock value a month ago, cover | stock (STK-01) |
| `RetailStockTransferLine.quantityLost` | Transfer losses (Breakage) | stock (STK-07/08) |
| `RetailEmptiesEntry` | The empties source (team template "Empties owed by supplier") | stock (STK-09) |
| `Product`, `RetailCategory` (`targetMarginPercent`) | Names, prices, target margins | products (PRD-02, PRD-04) |
| `RetailPromotion` | "See whether the festive promotion paid", "Given away in promotions" | products (PRD-09) |
| `Vendor`, `PurchaseBill`, `PurchasePayment`, `RetailPurchaseOrder`, `RetailGoodsReceipt` | Owed to suppliers, due bills, money out, orders and bills sources, the "Return to supplier" rule | buying (BUY-01, BUY-02, BUY-06, BUY-07) |
| `BankAccount`, `BankTransaction` (money accounts) | Cash at hand, Where the cash is | buying (BUY-05) |
| `CrmRequisition` | Requisitions out, due requisitions, the requisitions source | buying (BUY-04, BUY-05) |
| `Customer` and the loyalty ledger; customer accounts | Members, points, owed to you | CUS:customers, CUS:accounts |
| `RetailShopProfile` (opening hours, licence hours) | Heat grid hours, "Sundays stop at 18:00 by licence" | setup (SET-01) |
| `RetailTillRules` (`drawerOpenWithoutSale`) | "Require a PIN to open the drawer" | setup (SET-06) |
| `CompanySubscription` | The plan's next bill on Money | setup (SET-10) |
| `PlatformAuditEvent` `RETAIL_DRAWER.OPENED` | No-sale opens | setup (SET-06) writes it |
| `RetailMessage` | WhatsApp pictures and the email log of weekly sends | setup (SET-07); **this spec** adds `mediaUrl` (3.2.1) |
| `ReportTemplate`, `ReportTemplateAudience` | Saved templates | exists (`c78d01f`); unchanged columns |
| `ReportSend` | Send me this; template weekly emails | **new** (3.2.1) |
| `ReportTemplateUse` | Last opened, opened N times | **new** (3.2.3) |
| `User` (`phone`, `email`, `role`, `isActive`) | Who gets a send; who sees a template | existing |

### 3.2 Schema changes, by migration

Each migration ships in its unit's commit with its witness test, is applied with `npx prisma migrate deploy` and again with
`set -a; . ./.env; set +a; DATABASE_URL="$DATABASE_URL_TEST" npx prisma migrate deploy`. Never `prisma db push`.

#### 3.2.1 `20261004137000_report_sends` (INS-05) · witness `lib/reports/report-sends-migration.test.ts`

```prisma
/// How a weekly send reaches its person.
enum ReportSendChannel {
  WHATSAPP
  EMAIL
}

/// What a weekly send is of.
enum ReportSendSubject {
  /// An Insights page, as a picture and three lines ("Send me this").
  INSIGHT
  /// A report template, as a PDF.
  TEMPLATE
}

/// A weekly send: an insight page to one person, a template to one person, or a template's own
/// email to everyone who sees it. The retail worker sends what is due and moves `nextRunAt` on a week.
model ReportSend {
  id             String            @id @default(uuid())
  companyId      String
  subject        ReportSendSubject
  /// INSIGHT: the topic ("sales" … "money"). TEMPLATE: "builtin:<slug>" or the ReportTemplate id.
  subjectRef     String
  /// TEMPLATE on a saved template: the template, so deleting it deletes its sends.
  templateId     String?
  /// INSIGHT: { period, siteId } as the page showed when it was turned on.
  options        Json              @default("{}")
  channel        ReportSendChannel
  /// ISO weekday, 1 Monday … 7 Sunday.
  weekday        Int               @default(1)
  /// "07:00", in the company's time zone.
  time           String            @default("07:00")
  /// The one person it goes to. Null on a template's own weekly email: everyone the template's
  /// audience includes and whose role reads its source, worked out at each send.
  recipientId    String?
  createdById    String
  nextRunAt      DateTime
  lastSentAt     DateTime?
  /// How many people the last send reached ("Sent to 3 managers.").
  lastRecipients Int?
  lastError      String?
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt

  company   Company         @relation(fields: [companyId], references: [id], onDelete: Cascade)
  template  ReportTemplate? @relation(fields: [templateId], references: [id], onDelete: Cascade)
  recipient User?           @relation("ReportSendRecipient", fields: [recipientId], references: [id], onDelete: Cascade)
  createdBy User            @relation("ReportSendCreatedBy", fields: [createdById], references: [id], onDelete: Cascade)

  @@unique([companyId, subject, subjectRef, recipientId])
  @@index([nextRunAt])
  @@index([templateId])
}

model ReportTemplate {
  // … existing …
  sends ReportSend[]
}

model RetailMessage {
  // … SET-07's columns …
  /// A picture sent with the message (WhatsApp image; its body is the caption). Insights' weekly picture.
  mediaUrl String?
}

enum NotificationType {
  // … existing …
  RETAIL_REPORT_SEND
}

enum NotificationEntityType {
  // … existing …
  RETAIL_REPORT_SEND
}
```

Back-relations: `Company.reportSends`, `User.reportSendsReceived` (`"ReportSendRecipient"`), `User.reportSendsMade`
(`"ReportSendCreatedBy"`). SQL after the DDL: Postgres treats NULLs as distinct in the unique index, so a template's own email
(recipient null) needs its own partial index: `CREATE UNIQUE INDEX "ReportSend_template_own_key" ON "ReportSend"("companyId",
"subject", "subjectRef") WHERE "recipientId" IS NULL;` and `ALTER TABLE "ReportSend" ADD CONSTRAINT "ReportSend_weekday_check"
CHECK ("weekday" BETWEEN 1 AND 7)`, `ADD CONSTRAINT "ReportSend_time_check" CHECK ("time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')`.
The `RetailMessage.mediaUrl` column needs SET-07's migration (`RetailMessage`) applied first; INS-05 depends on SET-07.
Witness: both new enums and their values, the two added notification enum values; the table, every column with type and nullability; the unique index, the partial unique
index (inserting two own emails for one template fails; two personal sends for two people succeed); both checks; the three
foreign keys and their `ON DELETE CASCADE`; the `nextRunAt` index; `RetailMessage.mediaUrl` nullable text.

#### 3.2.2 `20261004137100_retail_sale_line_shelf_price` (INS-06) · witness `lib/retail/sale-line-shelf-price-migration.test.ts`

```prisma
model RetailSaleLine {
  // … existing, and PRD-09's promotionId, promotionDiscount …
  /// The price the till offered before the cashier changed it or gave a discount at the till. Null when
  /// the line sold at the price the till offered (a promotion's discount alone leaves it null). The
  /// "Discounts given" template reads it, with the sale's approver (FLR-01's `approvedById`).
  shelfPrice Decimal? @db.Decimal(14, 2)
}
```

SQL: backfill `shelfPrice = unitPrice + (discountAmount − promotionDiscount) / quantity` for historical lines whose
`discountAmount > promotionDiscount` and `quantity <> 0` (a manual discount happened), rounded to cents. Writes from now on:
`POST /api/v2/retail/pos/sales` (the till, where SET-06 checks `maxCashierDiscountPercent`) sets `shelfPrice` on any line whose
price was changed or that carries a manual discount, and sets the sale's `approvedById`/`approvedByName` (FLR-01's columns) when
the discount needed a manager PIN. Witness: the column (numeric(14,2), nullable) and the backfill on a fixture line (unit price
1.00, discount 0.20, promotion discount 0.05, quantity 3 → shelf price 1.05).

#### 3.2.3 `20261004137200_report_template_uses` (INS-07) · witness `lib/reports/report-template-uses-migration.test.ts`

```prisma
/// How often a report template is opened in a workspace, built in or saved: the catalogue's
/// "Last opened" and the edit sheet's "opened 22 times". One row per template per company.
model ReportTemplateUse {
  id             String          @id @default(uuid())
  companyId      String
  /// "builtin:<slug>" for a built-in template, the ReportTemplate id for a saved one.
  templateRef    String
  templateId     String?
  opens          Int             @default(0)
  lastOpenedAt   DateTime
  lastOpenedById String?

  company      Company         @relation(fields: [companyId], references: [id], onDelete: Cascade)
  template     ReportTemplate? @relation(fields: [templateId], references: [id], onDelete: Cascade)
  lastOpenedBy User?           @relation("ReportTemplateUseLastOpenedBy", fields: [lastOpenedById], references: [id], onDelete: SetNull)

  @@unique([companyId, templateRef])
  @@index([templateId])
}

model ReportTemplate {
  // … existing …
  uses ReportTemplateUse[]
}
```

Back-relations: `Company.reportTemplateUses`, `User.reportTemplatesOpened`. Witness: table, columns, the unique pair, the
two cascades and the set-null; deleting a template deletes its use row.

No other schema changes. Saved templates keep `ReportTemplate.view` (a `ReportView`, which gains the optional `rows: string[]`
in code, `lib/reports/types.ts`) and `params` (the face's filter values by key); `lib/reports/template-query.ts` converts both
ways between that storage and the list query (`toTemplateQuery`, `fromTemplateQuery`).

### 3.3 Permissions (`lib/retail/permissions.ts`)

| Resource | Owner `SUPERADMIN` | Manager `MANAGER`, `SHOP_MANAGER` | Cashier | Stock clerk | Bookkeeper `FINANCE_OFFICER` |
|---|---|---|---|---|---|
| `retail.insights` (new; label "insights") | view | view | – | – | view |
| `retail.money` (new; label "the money page") | view | – | – | – | view |
| `retail.reports` (changed; label "reports") | view, create, update, delete | view, create, update, delete | view | view | view |

Code rules on top of the matrix (`lib/reports/template-access.ts`, shared with the generic `/reports`):

```ts
export const TEMPLATE_MANAGER_ROLES = ["SUPERADMIN", "MANAGER", "SHOP_MANAGER", "FINANCE_OFFICER"] as const;

/** Listed for this person: theirs, or its audience includes their role. Its source must also be readable (checked by the caller). */
export function canSeeTemplate(t: { audience; createdById }, p: { id; role }): boolean;
//   JUST_ME → p.id === createdById; MANAGERS → maker or TEMPLATE_MANAGER_ROLES.includes(role); EVERYONE → true

/** W-75: whoever made it, or an owner once it is shared. */
export function canChangeTemplate(t, p): boolean;   // maker || (role === "SUPERADMIN" && audience !== "JUST_ME")

/** W-73: saving and sharing are owners' and managers'. */
export function canSaveTemplates(role): boolean;    // canRetailRoleDo(role, "retail.reports", "create")
```

Built-in templates use the same `canSeeTemplate` with their board label (`EVERYONE` or `MANAGERS`) and no maker. Uses:
Insights nav items and `GET /insights/[topic]` need `retail.insights:view`; Money also `retail.money:view` (403 "Your role
cannot view the money page"). The Reports module and its endpoints need `retail.reports:view`; the visible set is narrowed by
`canSeeTemplate` and each source's read. FND-03's interim use of `retail.reports:view` for the Overview and Insights nav items
ends: Insights items require `retail.insights:view`; the Overview item requires the floor's own read or, until FLR-08 sets
one, `retail.insights:view`. FND 5.5.4's Shifts ⋯ "Compare cashiers" requires `retail.insights:view`.
`lib/retail/permissions.test.ts` asserts the three rows cell by cell; `lib/reports/template-access.test.ts` (exists) is
rewritten for the rules above; `lib/retail/route-guard-coverage.test.ts` gains every new route.

### 3.4 Audit events (`lib/retail/audit.ts`, `RETAIL_AUDIT_EVENTS`)

| Constant | Event | Entity | Payload |
|---|---|---|---|
| `reportTemplateSaved` | `RETAIL_REPORT_TEMPLATE.SAVED` | `ReportTemplate` | `{ source, name, audience, from: <ref or null>, email: boolean }` |
| `reportTemplateChanged` | `RETAIL_REPORT_TEMPLATE.CHANGED` | `ReportTemplate` | `{ changed: string[], before, after }` |
| `reportTemplateShared` | `RETAIL_REPORT_TEMPLATE.SHARED` | `ReportTemplate` | `{ from, to }` (audience) |
| `reportTemplateDeleted` | `RETAIL_REPORT_TEMPLATE.DELETED` | `ReportTemplate` | `{ name, source }` |
| `reportSendStarted` | `RETAIL_REPORT_SEND.STARTED` | `ReportSend` | `{ subject, ref, channel, weekday, time, recipientId }` |
| `reportSendChanged` | `RETAIL_REPORT_SEND.CHANGED` | `ReportSend` | `{ before, after }` |
| `reportSendStopped` | `RETAIL_REPORT_SEND.STOPPED` | `ReportSend` | `{ subject, ref }` |
| (FND) `exportDownloaded` | `RETAIL_EXPORT.DOWNLOADED` | `ReportSource` | `{ key, template?, format, rows?, what? }` — insight exports use key `insight-<topic>` |

Audit is written only for retail sources (`reportKey` starting `retail-`); the generic `/reports` writes none, as today.
Activity tabs do not exist for templates (they have no record page).

### 3.5 Notifications (`emitRetailNotification`, `lib/notifications.ts`)

| When | To | Title | Body |
|---|---|---|---|
| A weekly send fails | its recipient (personal), or the template's maker (template email) | "Your Monday {name} did not go" | the reason ("WhatsApp is not set up.", "No email address for Ruvimbo Chari.") |
| A personal send is stopped because the person lost the right to see it | the recipient | "Your Monday {name} stopped" | "Your role cannot see it any more." |

`{name}` is "Sales picture" for an insight, the template's name for a template. **Defined here.** Type `RETAIL_REPORT_SEND`
(new value in `NotificationType`, added in 3.2.1's migration; entity type `RETAIL_REPORT_SEND`).

### 3.6 Words and numbers (`lib/retail/insights/words.ts`, + test)

| Function | Gives |
|---|---|
| `periodWords(period)` | today → "today"; 7d → "last 7 days"; 30d → "last 30 days"; month → "this month"; a range → "1 to 3 October" |
| `compareWords(period)` | "Compared with the day before" · "the 7 days before" · "the 30 days before" · "the month before" · "the 3 days before" (prefixed "Compared with ") |
| `beforeNote(period)` | "on the day before" · "on the 7 days before" · "on the 30 days before" · "on the month before" |
| `signedMoney(n)` | "+US$0.18", "−US$27.65", "US$0.00" |
| `signedPercent(x)` | "+6.1%", "−2.4%" (one decimal) |
| `points(x)` | "+3 pts", "−0.4 pts", "+0.2 pts" (one decimal, ".0" dropped) |
| `times(x)` | "2.3×" |
| `share(x)` | "38%", "71%" (no decimals; for shares of a whole) |
| `rate(x)` | "24.1%", "8.4%" (one decimal; for margins and rates) |
| `days(n)` | "1 day", "6 days" |
| `dayMonth(date)` | "28 July", "6 October" (the year added when not this year: "30 June 2025") |
| `lastOpenedLabel(date, now)` | "Today, 08:12", "Yesterday, 17:40", else "28 September 2026" |
| `reportPeriodWords(range)` | "1 to 3 October 2026", "28 September to 3 October 2026", "3 October 2026", "any time" |
| `shareWords(x)` | ≥ 0.5 "half", ≥ 0.33 "a third", ≥ 0.25 "a quarter", else "{n}%" |
| `countWords(n)` | 1 "once", 2 "twice", 3–10 "three times" … "ten times", else "{n} times" |
| `ordinal(n)` | "busiest", "second-busiest", "third-busiest" … |
| `andList(items)` | "beer and ice", "Two Keys and Gordon’s", "a, b and c" |

Money in KPIs and tables is full cents ("US$34,918.40"); chart axes are whole ("US$20,000"). Every figure in mono.

### 3.7 What each figure is

"The window" is the selected period ending now (Today: since 00:00; 7 days and 30 days: now minus 7 or 30 × 24 hours; This
month: since the 1st at 00:00; a range: from 00:00 to 23:59:59 local); "before" is the same span immediately before it (for
This month: the previous month's 1st to the same day and time). "Sites" is the site filter (all, or one site's id) applied to
every model that has a site. All in base currency (`baseAmount`, money accounts in USD).

**Shared** (`lib/retail/insights/figures.ts`):
- **Takings** = the floor's `sumTakings` (FLR-01): Σ `RetailSale.baseAmount` over SALE (posted or voided), VOID (negative) and
  REFUND (negative) documents posted in the window. Deposits and vouchers sold are outside it.
- **Baskets** = SALE documents posted in the window and not voided. **Items** = Σ |quantity| of their lines.
- **Line takings** (for splits by category or product) = `lineTotal` of lines of posted, not voided SALE documents, minus
  `lineTotal` of REFUND lines; Σ over all lines equals Takings.
- **Revenue** = line takings less `taxAmount`; **cost** = `costTotal` (refund lines negative); **gross profit** = revenue − cost;
  **margin** = profit ÷ revenue.
- **Unit cost** = the stock line's `unitCost`; **price** = the product's price on the default price list (PRD-05).
- **Member** = a sale with `customerId` whose customer is a loyalty member (CUS:customers `isMember`); every other sale is a
  walk-in.

**Sales**: Takings; Sales = baskets; Average basket = takings ÷ baskets; Items a basket = items ÷ baskets (one decimal). Heat
grid cell (weekday d, hour h) = takings posted on d between h:00 and h:59 ÷ the number of days d in the window ("average a
day"); hours = the earliest opening hour to the latest closing hour in `RetailShopProfile` (08 to 21 for the seeded shop);
a cell outside that weekday's hours is "Closed". Category table: line takings by `Product.retailCategoryId` ("No category"
when none); Share of line takings; Against before = relative change of the category's line takings (null → "New"); Baskets
= distinct SALE documents with a line in that category; the Σ row's baskets = all baskets (distinct, not summed). Till table:
by `RetailSale.registerId` (SET-04; "No till" when null); Cashier table: by `cashierId` name.

**Profit**: Gross profit (relative change); Margin (change in points); Given away in promotions = Σ `promotionDiscount` of
SALE lines in the window, "back for each US$1" = line takings of lines that carried a promotion ÷ given away; Lost to breakage
and counts = Σ |value| of `StockMovement`s in the window with reason BROKEN or OWN_USE (negative change) plus COUNT movements'
net shortfall per count document, plus `quantityLost × unitCost` of transfer lines lost in the window; its delta is the money
change against before (up is bad). Category bars: gross profit by category with "<margin> margin", warn when under
`targetMarginPercent`. Product tables: products with ≥ 1 unit sold and revenue > 0 in the window; Price, Cost now; Margin over
the window; Profit over the window. Margin tone: bad when more than 8 points under the category's target (with no target:
under 10%); warn when under the target (no target: under 20%).

**Products**: Products selling = distinct products sold in the window, "of {n}" = active products with a stock line at the
sites; Not sold in 60 days (W-54) count and cash; Top 20 products = gross profit of the 20 most profitable products ÷ all
gross profit in the window; Out of stock days = Σ over products that sold in the 90 days before the window ends of the days in
the window on which every stock line of the product at the sites ended the day at ≤ 0 (from `balanceAfter`), against before
(fewer is good). Chart: on hand value at cost by days since the product's last posted SALE line: "This week" (0–7), "8 to 30
days", "31 to 60 days", "61 to 90 days", "Over 90 days" (also never sold).

**Stock health**: Stock at cost = Σ max(on hand, 0) × unit cost at the sites; "on a month ago" = against Σ of each line's
`balanceAfter` as at 30 days ago (the last movement before then; none → 0) × unit cost now; Days of cover = stock at cost ÷
(cost of goods sold in the window ÷ days in the window), whole days; Running low = `stockLevel()` LOW lines (STK-01); Sales
missed = Σ `missedSales` (existing `lib/retail/stockouts.ts`) in the window. Category bars: category stock at cost ÷ category
cost sold per day; verdict under 10 days "Too little" (warn), 10–21 "About right", 22–42 "Too much" (warn), over 42 "Far too
much" (bad); the mark at `COVER_AIM` = 14 (STK-01 `levels.ts`). Ran out: products whose stock at the sites hit ≤ 0 in the
window and that sold in the 90 days before; Out for = days at ≤ 0 within the window; On hand = now; Sales missed per product.
Too much: products with cover over 42 days, or on hand > 0 and nothing sold in the window.

**Losses** (four kinds per week and in total): Count differences = per count document, the net value of its COUNT movements
when negative; Breakage = BROKEN and OWN_USE movement values and transfer lines lost; Drawer differences = Σ |variance| of
shifts closed in the window with variance < 0; Refunds and voids = Σ |baseAmount| of REFUND documents and voided SALE
documents in the window. Lost = the four added; Of takings = lost ÷ takings (change in points). KPI "Drawer differences" =
net Σ variance of shifts closed in the window (shorts and overs), delta = shifts with variance ≠ 0 ("5", "shifts out"). KPI
"Refunds and voids" = their value, delta = how many, note "over the PIN limit: {n}" = those with `approvedById` set (FLR-02:
a manager's approval was needed). No-sale opens = `RETAIL_DRAWER.OPENED` events in the window by the cashier (till). Chart: the
eight weeks (Monday to Sunday) ending with the window's end, labelled by their Monday ("28 Sep").

**Customers**: Takings from members = member takings ÷ takings (share), delta in points; Members who came back = members with
a SALE in the window and one in the 12 months before it, delta against the same count for the window before; Member basket =
member takings ÷ member baskets, delta "{x}×" = member basket ÷ walk-in basket, note "a walk-in basket"; Not seen in 30 days =
members who bought in the last 12 months but not in the last 30 days, delta = that count now minus that count at the window's
start (more is bad). Chart: member and walk-in takings in each of the last eight weeks, side by side. Points = the customer's
points balance (CUS:customers).

**Money** (owner and bookkeeper): Cash at hand = Σ balances of money accounts (BUY-05 `BankAccount` CASH, BANK, MOBILE) + Σ
(expected cash − opening float) of open shifts at the sites; Owed to suppliers = Σ (total − paid) of unpaid `PurchaseBill`s,
delta the overdue part (due before today); Owed to you = Σ owed on customer accounts (CUS:accounts), delta the overdue part;
Requisitions out = Σ (approved amount or asked) of requisitions SUBMITTED or APPROVED, delta = SUBMITTED count, note "to
approve". Chart: each of the last eight weeks, In = payments taken on posted sales (every tender except On account, Voucher
and Lay-by redeemed) + customer account payments + lay-by payments − refunds paid back in money; Out = supplier payments
(`PurchasePayment`) + requisition payouts (money-account transactions of kind payout) + the plan's paid bills. Due in the next
14 days: unpaid bills due by today + 14 (overdue first), requisitions SUBMITTED or APPROVED needed by today + 14 (Who = the
pay-to, else the order's supplier, else the asker), the plan's next bill when it falls within 14 days. Where the cash is: each
money account's balance and "In the tills now". The site filter applies to sales, tills and requisitions with a site; bills,
customer accounts, money accounts and the plan are the whole business's.

### 3.8 Seed and demo data — extend `scripts/seed-retail-demo.ts`

One idempotent function per unit, called from `main()` after the other areas' seeds (they make the sales history, stock
ledger, counts, transfers, empties, suppliers, bills, requisitions, money accounts, customers and accounts the pages read).
Run: `pnpm tsx scripts/seed-retail-demo.ts --slug hurudza-creative --days 160 --reset`. Dates are offsets from the run; shown
for a run on Saturday 3 October 2026 at 14:42.

| Unit | Seed |
|---|---|
| INS-01 | Nothing of its own. The Sales and Profit pages read FLR-01's 160 days of sales, PRD-09's promotions (the festive promotion on spirits gives "Given away in promotions") and STK-04's adjustments. |
| INS-02 | `seedDeadStock()`: supplier **Mukuru Wines** (`Vendor`, next free code, "Wine", pays On delivery) if missing; products if missing, each with a stock line at Harare Main Branch and one historical sale line on the date given (appended to a seeded sale of that day so takings stay realistic): **Nederburg Rosé 750ml** (`NEDROSE-750`, Wine, price US$13.20, cost US$9.90, 12 on hand, supplier Mukuru Wines, a posted delivery from Mukuru Wines of 24 on today − 110, last sold today − 93 "2 July"); **Hennessy VS 700ml** (`HENNESSY-700`, Spirits, price US$46.80, cost US$38.90, 4 on hand, no delivery in 120 days, last sold today − 76 "19 July"); **Sparletta Pine Nut 2l** (`SPARLETTA-2L`, Soft drinks, price US$4.50, cost US$3.40, 18 on hand, last sold today − 95 "30 June"). So "Not sold in 60 days" lists them with the board's Do words: "Return to supplier" (rosé), "Run a promotion" (Hennessy), "Write it off" (Sparletta). The board's "Bols Brandy 750ml" is archived by the products seed (PRD `BOLS-750`), so it does not list (Open questions). |
| INS-03 | Nothing of its own (FLR-04/05 shifts and differences, FLR-02 refunds and voids, STK-05/06 counts, STK-07/08 transfers, SET-06 drawer opens, CUS members). |
| INS-04 | Nothing of its own (BUY-05 money accounts, BUY-07 bills: INV-88120 overdue, SZ-4471 due 6 October; BUY-04 REQ-0014 needed 6 October; SET-10 plan; CUS accounts: Mbare Sports Club owes US$212.40 overdue). |
| INS-05 | `User.phone` for Tendai Mhlanga "+263 77 412 0098" and Tafara Nyathi "+263 77 301 2290" (the People board). No insight send is seeded: the boards show "Send it every Monday". |
| INS-07 | `seedReportTemplates()`: user **Rufaro Ndlovu** (`rufaro.manager@bottlestore.test`, `MANAGER`, `isActive` false — one of the People board's "No access 2") if missing. Three saved templates: **Weekend takings by shop** (Tendai Mhlanga, `MANAGERS`, created today − 19 "14 September 2026", description "Friday 17:00 to Sunday close, each shop, by payment", source `retail-sales`, query `when=last-weekend`, rows `site`, cols Shop, Sales, Cash, EcoCash, Card, On account, Taken, sort "Most taken"); **Empties owed by supplier** (Rufaro Ndlovu, `EVERYONE`, description "Bottles and crates out, and the deposit each supplier holds", source `retail-empties`, `kind=supplier`, rows `supplier`, cols Supplier, Bottles, Crates, Deposit); **Voids and refunds by cashier** (Tafara Nyathi, `JUST_ME`, description "Who voided or refunded what, this month", source `retail-shifts`, `opened=this-month`, rows `cashier`, cols Cashier, Shifts, Refunds, Voids, No-sale opens). `ReportTemplateUse` rows: Sales today 08:12; Items sold today − 1 17:40; Weekend takings by shop 22 opens, today − 5 07:05; Discounts given today − 5 11:20; Stock on hand today − 1 09:15; Count differences today − 3 10:02; Stock movements today − 2 15:30; Empties owed by supplier today − 1 16:20; Orders and deliveries today − 2 09:40; Supplier spend today − 3 16:05; Customer spend today − 6 12:10; Accounts owed today 07:30; Takings by payment today 08:02; Requisitions paid today − 1 13:45; Till shifts today 07:58; Voids and refunds by cashier today − 4 18:20. |
| INS-09 | `seedReportSends()`: the Weekend template's own email (`TEMPLATE`, `EMAIL`, weekday 1, "07:00", recipient null, created by Tendai Mhlanga, `lastSentAt` the last Monday 07:00 before the run, `lastRecipients` 3, `nextRunAt` the next Monday 07:00), so the edit sheet reads "Sent to 3 managers. Last sent Monday at 07:00." (Tendai Mhlanga, Tafara Nyathi and PRD-01's bookkeeper are the active Managers-audience people with an email). |

---

## 4. API

Conventions are FND section 4's. Insights and sends live under `/api/v2/retail/**` (`requireRetailSession`,
`requireRetailPermission`). Templates keep their shared paths `/api/v2/reports/templates/**` (`validateSession`; the generic
`/reports` uses them too) and retail-only reads live under `/api/v2/retail/reports/**`. Services: `lib/retail/insights/*.ts`
(one file per topic plus `figures.ts`, `periods.ts`, `findings.ts`, `words.ts`, `render.tsx`), `lib/retail/sends/*.ts`,
`lib/reports/templates.ts`, `lib/reports/template-access.ts`, `lib/reports/template-query.ts`,
`lib/reports/definitions/retail/templates.ts`, `lib/reports/definitions/retail/reports.ts`,
`lib/reports/loaders/retail/reports.ts`; each with its `.test.ts`. Route files only parse, gate and call.

### 4.1 Insights

| Method | Path | Permission | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/v2/retail/insights/[topic]` (changed) | `retail.insights:view`; topic `money` also `retail.money:view` | query `period` = `today` \| `7d` \| `30d` \| `month` (default `30d`); or `from`, `to` (`YYYY-MM-DD`, both, from ≤ to, at most 366 days apart; they win over `period`); `siteId` = a site id of the company or `all` (default `all`) | `InsightResponse` (below) | 404 "There is no such insight"; 400 "Choose dates no more than a year apart" / "That site is not this business’s"; 403 "Your role cannot view insights" / "Your role cannot view the money page" |
| POST | `/api/v2/retail/insights/[topic]/export` (new) | as GET | `{ what: "page" \| "tables" \| "table"; table?: string; format: "pdf" \| "xlsx" \| "csv"; period?; from?; to?; siteId? }` — `page` only as pdf; `tables` only as xlsx; `table` any format | the file: `Content-Disposition: attachment; filename="sales_2026-09-04_2026-10-03.pdf"` | 400 "That export request could not be read"; 404 "There is no such table" |

```ts
type InsightPeriod = "today" | "7d" | "30d" | "month";

type InsightResponse = {
  topic: "sales" | "profit" | "products" | "stock" | "losses" | "customers" | "money";
  title: string;                       // "Sales", "Stock health"
  period: InsightPeriod | { from: string; to: string };
  compareWords: string;                // "Compared with the 30 days before"
  site: { value: string; label: string; options: Array<{ value: string; label: string }> } | null; // null: one site, no chip
  updatedAt: string;                   // ISO; drawn "Updated 14:42"
  kpis: Array<{
    label: string;                     // "Takings"
    value: number; format: "money" | "count" | "rate" | "share" | "days" | "ratio";
    delta: { text: string; tone: "ok" | "bad" | "warn" | null } | null;  // "+6.1%" ok; "of 214" null
    note: string | null;               // "on the 30 days before", "baskets"
  }>;                                  // always four
  question: string;                    // "When do we sell?"
  unit: string;                        // "Takings by day and hour, last 30 days, average a day"
  legend: Array<{ label: string; series: "s1" | "s2" | "s3" | "s4" | "data" | "muted" }> | null;
  chart:
    | { kind: "heat"; rows: string[]; columns: string[]; values: Array<Array<number | null>>; format: "money" } // null = closed
    | { kind: "bars"; rows: Array<{ id: string; label: string; value: number; text: string; note: string | null;
        tone: "warn" | "bad" | null }>; mark?: { value: number; note: string } }
    | { kind: "columns"; stacked: boolean; max: number; series: Array<{ key: string; label: string; color: "s1" | "s2" | "s3" | "s4" | "data" | "muted" }>;
        groups: Array<{ label: string; values: Record<string, number> }>; format: "money" };
  emptyChart: string | null;           // "Nothing sold in these dates." when the window has no trade
  tables: Array<{
    id: string; label: string;          // "category", "By category"
    columns: Array<{ id: string; label: string; align: "start" | "end"; width: string }>;
    rows: Array<{ id: string; cells: Record<string, Cell> }>;
    total: { label: string; cells: Record<string, Cell> } | null;     // "Σ 6 categories"
    more: number;                        // rows beyond the first ten (a "Show all 14" row); 0 when none
    empty: string;                       // "No sales in these dates."
    exportCaption: string;               // "The 6 categories the table shows"
  }>;
  findings: string[];                  // ≤ 3; empty → "Not enough trade in these dates to say."
  actions: Array<{ label: string; href: string }>; // 1–3
  send: SendView | null;               // the caller's own send of this topic
  sendWords: string;                   // "This page, as a picture and three lines, every Monday at 07:00 on WhatsApp." ("… by email." without a phone)
};

type Cell = {
  text: string;                        // already written: "US$14,204.10", "40.7%", "6 days", "28 July"
  kind: "link" | "text" | "num" | "money" | "rate" | "date" | "action" | "muted";
  tone?: "ok" | "bad" | "warn";
  href?: string;                       // link and action cells
  mono?: boolean;
};
```

The table's rows are capped at 10 with `more` telling the page how many it left out; `GET …?tab=<id>&all=1` returns that tab's
every row (the "Show all" row). Nothing is cached; the response must come back within 1.5 s on the seeded tenant
(acceptance in 7).

### 4.2 Weekly sends

| Method | Path | Permission | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/v2/retail/sends?subject=INSIGHT&ref=sales` (new) | insight: as the insight's GET; template: may open it | — | `{ send: SendView \| null; defaults: { channel; to: string; words: string } }` | 404 "Template not found" |
| POST | `/api/v2/retail/sends` (new) | same | `{ subject: "INSIGHT" \| "TEMPLATE"; ref: string; channel?: "WHATSAPP" \| "EMAIL"; weekday?: 1–7; time?: "HH:MM"; options?: { period?; siteId? } }` | 201 `{ send }`; 200 `{ send }` when it existed | 400 `fieldErrors.channel` "Add your phone number in Profile to get it on WhatsApp."; `fieldErrors.time` "Write a time like 07:00." |
| PATCH | `/api/v2/retail/sends/[id]` (new) | the recipient only | `{ channel?; weekday?; time? }` | `{ send }` | 404 "Send not found"; 400 as POST |
| DELETE | `/api/v2/retail/sends/[id]` (new) | the recipient only | — | `{ stopped: true }` | 404 "Send not found" |

```ts
type SendView = {
  id: string; subject: "INSIGHT" | "TEMPLATE"; ref: string;
  channel: "WHATSAPP" | "EMAIL"; weekday: number; time: string;
  to: string;                          // "+263 77 412 0098" or "owner@bottlestore.test"
  words: string;                       // "Every Monday at 07:00 on WhatsApp, to +263 77 412 0098." · "Every Wednesday at 08:00 by email, to owner@bottlestore.test."
  lastSentAt: string | null; nextRunAt: string;
};
```

For TEMPLATE, `ref` is the run page's ref (a built-in slug or a template id); the server stores a built-in as
`builtin:<slug>` in `subjectRef` and a saved one with `templateId` set. Template own emails are not reachable here; they change
through the template endpoints (4.4). The worker:
`lib/retail/sends/run.ts#runDueSends(now)` called from `scripts/retail-worker.ts` every 5 minutes (SET-07's worker; this spec adds
the job); `lib/retail/sends/next-run.ts#nextRunAt(weekday, time, after, zone)` (pure, tested across a DST-free zone and a
Sunday-to-Monday boundary).

### 4.3 Report sources (list mode, FND 4.1 and 4.2 extended)

| Method | Path | Change |
|---|---|---|
| GET | `/api/v2/reports/[key]` | List mode accepts `face=report` (use the source's `report` spec instead of its `list` spec; 404 "Report not found" when the source has no report face), `template=<ref>` (the template's query underneath the URL's params; the template must be visible to the caller and read this source, else 404 "Template not found"), `rows=<key>[,<key>]` (one row for each; must be among the face's rollups, else ignored), `cols=<key>,…` (visible columns in order; the first column cannot be hidden; unknown keys dropped). The response's `report.list.columns` describe the shape returned (rolled-up columns when `rows` is set). |
| POST | `/api/v2/reports/[key]/export` | `query` may carry `face`, `template`, `rows`, `cols`; the file is the same shape as the screen. |

```ts
// lib/reports/types.ts additions
type ReportFace = ListSpec & {
  area: "selling" | "stock" | "buying" | "customers" | "money" | "floor";
  card?: { label: string; line: string; builtIn: string };   // the nine "Starts from" cards; builtIn = the slug named in the note
  rollups: Array<{ key: string; label: string }>;           // "One row for each": first entry is the unrolled row ("Sale")
  rollupOnly?: string[];                                     // columns that exist only rolled up ("Sales", "Shifts")
};
type ReportDefinition = ReportMeta & { /* … */ list?: ListSpec; report?: ReportFace };
type ReportView = { /* … */ rows?: string[] };              // stored on ReportTemplate.view
type ListQuery = { /* … FND … */ face?: "list" | "report"; template?: string; rows?: string[]; cols?: string[] };
```

Rolling up (`lib/reports/rollup.ts#rollUp(rows, face, keys)` for in-memory sources; database-side sources implement it in
their `page()` with `GROUP BY`): rows are grouped by the key columns' values after tab, filters and search; each group becomes
one row whose id is the key values joined with "|", whose key cells are the group's values, whose `rollupOnly` count column is
the number of source rows (sales: SALE documents not voided), whose `number` and `money` columns are summed (or their declared
total), and whose other columns are dropped. Sort applies to the rolled-up rows ("Newest first" by the latest date in each
group). Totals are over the rolled-up rows. A key cell links to the face's built-in with that value as a filter and the same
period (Weekend takings: "Harare Main Branch" → `/retail/reports/sales?site=<id>&when=last-weekend`).

Period presets gain `this-week` (Monday 00:00 to now) and `last-weekend` (the most recent Friday 17:00 to Sunday 23:59:59 that
has ended) in `lib/reports/list-query.ts` (FND-04), with menu labels "This week" and "Last weekend".

### 4.4 Reports module

| Method | Path | Permission | Request | Response | Errors |
|---|---|---|---|---|---|
| GET | `/api/v2/reports/retail-report-templates?…` (new source) | `retail.reports:view` | FND list query; parent filter `area`; filters `seenBy`, `madeBy`; tabs `all`, `built-in`, `team`, `mine` | FND list page | — |
| GET | `/api/v2/retail/reports/sources` (new) | `retail.reports:create` | — | `{ cards: SourceCard[] }` | 403 "Your role cannot save report templates" |
| GET | `/api/v2/retail/reports/[ref]` (new) | `retail.reports:view` + `canSeeTemplate` + the source's read | — | `RunContext` | 404 "Template not found" |
| POST | `/api/v2/retail/reports/[ref]/opened` (new) | as GET | — | 204 | 404 |
| POST | `/api/v2/reports/templates` (changed) | `retail.reports:create` for retail sources (generic: as today) | `TemplateInput` | 201 `{ template: ReportTemplateRecord }` | 400 `{ error, fieldErrors }`; 403 "Your role cannot save report templates" / "Only owners and managers share templates"; 404 "Report not found" |
| GET | `/api/v2/reports/templates/[id]` | as today, with the new visibility rule | — | `{ template }` | 404 |
| PATCH | `/api/v2/reports/templates/[id]` (changed) | `canChangeTemplate`; widening audience needs `canSaveTemplates` | `Partial<TemplateInput>` without `reportKey` | `{ template }` | 403 "Only whoever made it, or an owner, can change this template"; 400; 404 |
| DELETE | `/api/v2/reports/templates/[id]` (changed) | `canChangeTemplate` | — | `{ deleted: true }` | 403 as PATCH; 404 |
| POST | `/api/v2/retail/reports/templates/share` (new) | `retail.reports:create` | `{ ids: string[] (≤ 200); audience }` | `{ done: number; skipped: number }` | 400 "Validation failed" |
| POST | `/api/v2/retail/reports/templates/email` (new) | `retail.reports:view` | `{ refs: string[] (≤ 200) }` | `{ templates: number; personal: number }` — a saved template the caller may change gets its own email turned on; anything else gets a personal send to the caller | 400 |
| POST | `/api/v2/retail/reports/templates/delete` (new) | `retail.reports:create` | `{ ids: string[] }` | `{ done: number; skipped: number }` | 400 |
| GET | `/api/v2/retail/nav/badges` (FND, extended) | — | — | adds `reports: { all, selling, stock, buying, customers, money, floor }` | — |

```ts
type TemplateInput = {
  reportKey: string;                   // the source: "retail-sales"
  name: string;                        // 1–120, unique in the company with the built-ins' names (case-insensitive)
  description?: string | null;         // ≤ 240
  audience: "JUST_ME" | "MANAGERS" | "EVERYONE";
  view: ReportView;                    // columns (order + hidden), search, sort, groupBy, rows
  params: Record<string, string>;      // the face's filter values: when=this-month, site=any …
  keepDates?: boolean;                 // true: the period filter is stored as the resolved range
  email?: { on: boolean; weekday?: number; time?: string };
};

type ReportTemplateRecord = {          // lib/reports/template-access.ts, extended
  id; reportKey; reportTitle; area; name; description; view; params; audience;
  madeBy: string; madeById: string; mine: boolean; canChange: boolean;
  createdAt: string; updatedAt: string;
  opens: number; lastOpenedAt: string | null;
  email: { on: boolean; weekday: number; time: string; recipients: number; lastSentAt: string | null } | null;
};

type RunContext = {
  ref: string; builtIn: boolean;
  name: string; description: string | null;
  area: { slug: string; label: string };          // { "selling", "Selling" }
  source: string;                                  // "retail-sales"
  audience: "JUST_ME" | "MANAGERS" | "EVERYONE";
  sub: string;                                     // "Built in · 1 to 3 October 2026, every shop" | "Tendai Mhlanga’s template · managers see it"
  canChange: boolean; canSave: boolean;
  madeBy: string | null; createdAt: string | null; opens: number;
  query: TemplateQuery;                            // the template's defaults (the page's URL overrides them)
  email: ReportTemplateRecord["email"];            // saved templates the caller may change
  mySend: SendView | null;                         // the caller's personal weekly email of it
};

type TemplateQuery = { filters: Record<string, string>; q: string; sort: string; group: string; rows: string[]; cols: string[] };

type SourceCard = {
  key: string; label: string; line: string; area: { slug; label }; builtIn: { slug: string; name: string };
  columns: Array<{ key: string; label: string; summable: boolean; rollupOnly: boolean }>;
  rollups: Array<{ key: string; label: string }>;
  periods: Array<{ value: string; label: string }>;   // Today, This week, Last weekend, This month, Pick dates (when the face has a period)
  defaults: TemplateQuery;
};
```

`retail-report-templates` source (in-memory, `lib/reports/loaders/retail/reports.ts`): the visible built-ins and saved
templates for the caller (decision 7); row `{ id: ref, name, summary, area, areaSlug, madeBy, madeById, builtIn, seenBy,
seenByKey, lastOpened, lastOpenedAt, canChange, href }`. Its spec is in 5.10. `catalog: false` (it is the catalogue itself).

---

## 5. UI per page

Every page sits in the shell (FND-SHELL). Insights pages are the DashboardFrame insight variant (FND-DASH 5.11.3; board
measurements there and in `InsightsSales.dc.html`); this section gives each page's content. Reports pages are ListFrame pages
(FND-LIST 5.4) and SheetForm sheets (FND-SHEET 5.7).

### 5.1 What every insight page shares

**Nav.** Rail mark "Insights" (`ChartBar`), current. Panel "Insights": Sales, Profit, Products, Stock health, Losses,
Customers, Money (each `ChartBar` 16px; Money only with `retail.money:view`); the page's item current. No badges.

**Header** (48px): title = the page's short name ("Sales", "Profit", "Products", "Stock health", "Losses", "Customers",
"Money"); no back, no sub; actions: one outline button "Export" (32px). No primary.

- Export menu (**Defined here**, 260px, FND export menu styling): heading "This page, {periodWords}" ("This page, last 30
  days"); items "PDF, ready to print" `.pdf` (what: page) and "Spreadsheet" `.xlsx` (what: tables). Picking one downloads
  through 4.1; while it runs the button shows a spinner and is inert; a failure toasts "The export did not work. Try again."

**Toolbar** (48px, `--ground`):
1. Period `Segmented`: "Today", "7 days", "30 days", "This month" (default "30 days"); the URL's `period` follows. With
   `from`/`to` in the URL (the Shifts list's "Compare cashiers"), no segment is selected and a 32px chip "1 to 3 October ×"
   (`FilterChip` with a clear) sits after the group; × goes back to 30 days. **Defined here.**
2. Site `FilterChip` "Site All sites" (options "All sites", then each open site by name); hidden when the company has one site.
3. `compareWords` in `--ink-3` ("Compared with the 30 days before").
4. Spacer; "Updated {HH:MM}" in `--ink-3` from `updatedAt`.

**Main column** (padding 20 24, gap 20):
1. KPI strip: four tiles in one bordered box (radius 12, tiles split by 1px `--line`): label 12.5 `--ink-3` (one line,
   ellipsis), value mono 20/600 −0.02em, a line 12 `--ink-3`: the delta in mono in its tone (`--ok`, `--bad`, `--warn`, or
   `--ink-3` when null) then the note.
2. Question panel: header (min 52px, `--ground`) with `question` (h2 15/600) over `unit` (12.5 `--ink-3`), legend on the
   right when the response has one; then the chart (heat grid, bars or columns per the topic, FND-DASH components). Every cell
   or bar has a tooltip (label 12 `--ink-3`, value mono 600). `emptyChart` replaces the chart when set, in `--ink-3`, 120px
   high.
3. Tabs + table: a tablist (40px tabs, current underlined 2px `--ink`, 600; others `--ink-3`) with the table's "Export" on the
   right (28px outline, opens the FND export menu headed `exportCaption`: Spreadsheet `.xlsx`, Comma-separated `.csv`, PDF,
   ready to print `.pdf`). One table, full width, not in a card: header row 34 on `--ground`, rows 42, Σ row 42 on `--ground`
   with a 1px `--line-strong` top border and 600. Numbers mono and right-aligned. When `more` > 0 a 40px row under the last
   row reads "Show all {n}" (underlined `--ink-2`), which fetches `&all=1` for that tab. The tab is in the URL (`?tab=`).
   A table with one tab still shows its tab row (as the boards do).

**Aside** (320px, `--ground`, left border, padding 20, gap 20; sections after the first have a top border and padding-top 20):
1. "What it says": up to three bullets (6px `--ink` dot, `--ink-2`, line-height 1.45). None → "Not enough trade in these
   dates to say." in `--ink-3`.
2. "Do something about it": each action a 36px-min outline row (radius 8, padding 6 12, label then a 14px chevron), a link.
3. "Send me this" (W-56): off → `sendWords` in `--ink-2` and the outline button "Send it every Monday" (34px, 600); pressing
   it posts (4.2) and turns into the on state without a toast. On → `send.words` in `--ok` 500 ("Every Monday at 07:00 on
   WhatsApp, to +263 77 412 0098.") followed by "Change" (underlined `--ink-2`, **Defined here**) which opens
   `?sheet=insight-send&topic=<topic>`. Failure → the button stays and a line in `--bad` gives the error.

**States.** Loading: the toolbar is live; the KPI box, a 240px chart block and six table rows are `Skeleton`s; the aside shows
three skeleton lines per section. Error: `Alert` tone danger "This insight would not load" with the message and "Try again".
A window with no trade: KPIs show their zero values with null deltas, `emptyChart`, every table's `empty` line, the findings
fallback, and the page's fallback action.

**Narrow and phone.** Under 1100px the aside moves under the main column (full width, same order). Under 720px (Mobile board
rules): the toolbar scrolls sideways (period group, site chip; the compare line and "Updated" move under the toolbar as one
12.5 line); the KPI box becomes 2 × 2; the heat grid scrolls sideways with its day labels pinned; bar and column charts keep
the full width; tables become FND phone cards (title = first column, figure = the last money column, meta = the other columns
joined with " · "); the Σ row becomes one line under the cards.

**Permissions in the page.** A manager reaching `/retail/insights/money` gets the frame's 403 state ("Your role cannot view
the money page") and the panel has no Money item. Cashiers and stock clerks have no Insights mark; the routes answer 403.

### 5.2 Sales — `/retail/insights/sales` (board `InsightsSales.png`) · INS-01

**KPIs** (board values for the seeded 30 days in brackets):

| Label | Value | Delta (text, tone) | Note |
|---|---|---|---|
| "Takings" | money ("US$34,918.40") | relative change, `signedPercent` ("+6.1%"), ok when up, bad when down | `beforeNote` ("on the 30 days before") |
| "Sales" | count ("3,862") | relative change ("+4.0%"), up ok | "baskets" |
| "Average basket" | money ("US$9.04") | money change, `signedMoney` ("+US$0.18"), up ok | — |
| "Items a basket" | ratio, one decimal ("2.7") | change, one decimal ("−0.1"), down bad | — |

A delta is null (and the note too, for Takings) when the window before had no trade.

**Chart** (heat): question "When do we sell?"; unit "Takings by day and hour, {periodWords}, average a day" (Today: "Takings
by hour, today"); no legend. Rows "Mon" … "Sun" (Today: today's weekday only); columns the trading hours "08" … "21"
(two-digit, mono 11); cells 30px high, gap 3, radius 4, `--data` at 8% + 92% × value ÷ max; a closed cell (`null`) is `--tray`
with tooltip "Closed"; tooltip "Fri 18:00" / "US$342.00"; under the grid "Quieter" — a 140×8px gradient — "Busier".

**Tabs and tables** (default "By category"):

| Tab | Columns (width, align) | Σ row |
|---|---|---|
| "By category" | "Category" (1fr, start, text) · "Takings" (140px, end, money) · "Share" (110px, end, rate) · "Against before" (120px, end, `signedPercent`, ok ≥ 0, bad < 0; "New" muted when null) · "Baskets" (110px, end, num) | "Σ {n} categories" · total takings · "100%" · overall change · all baskets |
| "By till" | "Till" · "Takings" · "Share" · "Against before" · "Baskets" | "Σ {n} tills" · … |
| "By cashier" | "Cashier" · "Takings" · "Share" · "Against before" · "Baskets" | "Σ {n} cashiers" · … |

Rows are sorted by takings, highest first; no row links (the board has none). `empty` "No sales in these dates.";
`exportCaption` "The {n} categories the table shows" (tills, cashiers).

**What it says** (`lib/retail/insights/findings/sales.ts`, in this order, each only when its condition holds):
1. *Peak.* Find the three consecutive trading hours with the most takings summed over the two weekdays that take most in
   them. When that window's takings are at least a quarter of the week's: "{Day1} and {Day2} {evenings|afternoons|mornings},
   {HH:00} to {HH:00}, bring in {shareWords} of the week." (evenings from 17:00, afternoons from 12:00). Board: "Friday and
   Saturday evenings, 17:00 to 20:00, bring in a third of the week."
2. *Quiet mornings.* When the average takings an hour on Monday to Friday before 10:00 are under half the overall hourly
   average: "Weekday mornings before 10:00 take less than US${that average rounded up to 10} an hour: one till is enough."
   Board: "… less than US$70 an hour: one till is enough."
3. *Riser.* The three-hour window (any day) whose takings grew most against before, when it is now in the top three windows:
   "{Day} {HH:00} to {HH:00} is now the {ordinal} slot." prefixed with "{Day}s stop at {HH:MM} by licence; " when the shop
   profile has licence hours that day (liquor store). Board: "Sundays stop at 18:00 by licence; Sunday 12:00 to 15:00 is now
   the third-busiest slot."

**Do something about it**:
1. When finding 1 fired: "Put two cashiers on {busiest day} {HH:00} to {HH:00}" (the busiest day's hours whose takings are
   at least 60% of its peak hour, widened by one hour before) → `/retail/manage/people`. Board: "Put two cashiers on Friday
   16:00 to 21:00".
2. When the quietest weekday afternoon block (12:00–17:00, Monday to Thursday) takes under half the afternoon average of
   Friday and Saturday: "Run a happy hour on quiet weekday afternoons" → `/retail/products/price-lists?sheet=price-list-new`.
3. Fallback when neither fired: "See the sales" → `/retail/sales`.

### 5.3 Profit — `/retail/insights/profit` (board `InsightsProfit.png`) · INS-01

**KPIs**:

| Label | Value | Delta | Note |
|---|---|---|---|
| "Gross profit" | money ("US$8,412.30") | relative change ("+4.2%"), up ok | `beforeNote` |
| "Margin" | rate ("24.1%") | `points` ("−0.4 pts"), up ok, down bad | — |
| "Given away in promotions" | money ("US$284.00") | money, no tone ("US$6.76") | "back for each US$1" (null delta and note when nothing was given away) |
| "Lost to breakage and counts" | money ("US$167.20") | money change ("+US$40.10"), up bad, down ok | — |

**Chart** (bars): question "What do we actually make?"; unit "Gross profit by category, {periodWords}, with margin"; rows by
gross profit, highest first; label (`--ink`, 160px), a 12px bar on a `--tray` track (`--data`, radius 4), then on the right
the value (mono 600, "US$3,410.20") over "{rate} margin" (12 `--ink-3`, `--warn` when under the category's target). No mark.

**Tabs and tables** (default "Products earning least"; no Σ row, as on the board):

| Tab | Columns | Rows |
|---|---|---|
| "Products earning least" | "Product" (1fr, link → `/retail/products/{id}`) · "Price" (end, money) · "Cost" (end, money) · "Margin" (end, rate, tone per 3.7) · "Profit, {period short}" (end, money; "Profit, 30 days", "Profit, 7 days", "Profit, today", "Profit, this month") | lowest margin first, 10 |
| "Products earning most" | same | most profit first, 10 |

`empty` "Nothing sold in these dates."; `exportCaption` "The {n} products the table shows". The cost column needs
`retail.catalog:view-cost` (owner, manager, bookkeeper all hold it).

**What it says** (`findings/profit.ts`):
1. *Earns least among the big ones.* Of the three categories with the most takings, the one with the lowest margin, when it
   is under the shop's overall margin: "{Category} sell well but earn least" and, when a promotion gave away more than 5% of
   that category's line takings in the window: ": the {promotion word} promotion took margin from {margin without the
   promotion} to {margin}." else ".". Board: "Spirits sell well but earn least: the festive promotion took margin from 24% to
   21.7%." ({promotion word} = the first word of the promotion's name in lower case: "Festive season US$2 off spirits"
   → "festive"; margin without the promotion = (revenue + promotion discount ex VAT − cost) ÷ (revenue + promotion discount ex
   VAT), written `share` when whole, else `rate`).
2. *Below target.* The product sold in the window with the lowest margin under its category's target: "{Product short name}
   earns {rate}, below your {target}% target for {category in lower case}." and, when its unit cost rose in the window (its two
   latest posted delivery lines at different costs), " {Supplier short name} raised its cost in {Month}." Board: "Two Keys
   earns 8.4%, below your 22% target for spirits. Afdis raised its cost in September." (short name = the product name without
   its size; supplier short name = its first word).
3. *Best margin.* The category with the best margin among those with at least 5% of line takings: "{Category} earn the best
   margin. They are {share of line takings}% of takings and could be more." Board: "Ciders earn the best margin. They are 10%
   of takings and could be more." (the category's first word when it has "and").

**Do something about it**:
1. When products are under target: "Raise {andList of up to two short names} to target margin" → `/retail/products?sheet=bulk-price&list=<default list id>&ids=<their ids>&how=margin`.
2. When finding 1 named a promotion: "See whether the {promotion word} promotion paid" →
   `/retail/products/promotions/<id>`. Board: "See whether the festive promotion paid".
3. Fallback: "Set margins you aim for" → `/retail/products/categories`.

### 5.4 Products — `/retail/insights/products` (board `InsightsProducts.png`) · INS-02 · W-54

**KPIs**:

| Label | Value | Delta | Note |
|---|---|---|---|
| "Products selling" | count ("186") | "of {active products}" no tone ("of 214") | "sold in {period short}" ("sold in 30 days") |
| "Not sold in 60 days" | count ("14") | money of their cash, bad ("US$1,204.30") | "sitting on the shelf" |
| "Top 20 products" | share ("71%") | — | "of profit" |
| "Out of stock days" | count ("9") | change in days, ok when fewer ("−4") | `beforeNote` |

**Chart** (columns, one series `--data`): question "Where is our cash sitting?"; unit "Stock value at cost, by days since
each product last sold"; five columns "This week", "8 to 30 days", "31 to 60 days", "61 to 90 days", "Over 90 days"; y axis
0, half, max (max = the value rounded up to a round step: 20,000 → "US$20,000", "US$10,000", "0"); tooltip "31 to 60 days" /
"US$2,980.00". The period does not change this chart (it is about the shelf now); the unit says so.

**Tabs and tables** (default "Not sold in 60 days"):

| Tab | Columns | Σ row |
|---|---|---|
| "Not sold in 60 days" | "Product" (1fr, link → `/retail/products/{id}`) · "Last sold" (140px, start, `dayMonth`, "Never" muted) · "On hand" (100px, end, num) · "Cash in it" (120px, end, money) · "Do" (160px, start, action link) | "Σ {n} products" · — · on hand · cash · — |
| "Best sellers" | "Product" · "Sold" (num) · "Takings" (money) · "Profit" (money) · "Share of profit" (rate) | "Σ {n} products" · sold · takings · profit · share |
| "Slow movers" | "Product" · "Sold" (num) · "On hand" (num) · "Days of cover" (`days`) · "Cash in it" (money) · "Do" | "Σ {n} products" · sold · on hand · — · cash · — |

Rows: idle by cash in it (highest first); best sellers by takings in the window (top 20); slow movers = products on hand that
sold at least one but no more than `max(2, days ÷ 15)` units in the window, by cash in it. `empty`: "Everything on the shelf
has sold in the last 60 days." · "Nothing sold in these dates." · "Nothing is selling slowly."

**"Do" rule** (W-54, `findings/products.ts#deadStockAction`, in this order):
1. The product's supplier (`Product.supplierId`) delivered it in the last 120 days (a posted `RetailGoodsReceipt` line): "Return
   to supplier" → `/retail/buying/suppliers/<supplierId>?sheet=return-new&supplierId=<id>&productIds=<id>`.
2. Its unit cost is under US$5.00: "Write it off" → `/retail/products/<id>?sheet=stock-adjust&productId=<id>&why=broken`.
3. Otherwise: "Run a promotion" → `/retail/products/promotions?sheet=promotion-new&productIds=<id>`.
Links show only to roles that may act (promotion: `retail.promotions:create`; return: `retail.purchasing:create`; write off:
`retail.adjustments:create`); otherwise the cell is "—". Prefill contracts other specs must honour (listed in their units'
dependencies): `promotion-new` reads `productIds` (Applies to "Some products" with those products; Name empty) — PRD-09;
`stock-adjust` reads `why=broken` (Why "Broken or spoilt" picked) — STK-04; `return-new` reads `productIds` (lines prefilled at
on hand; Why "Not ordered" left for the person) — BUY-09 (already in its spec).

**What it says** (`findings/products.ts`):
1. When any are idle: "{money} is sitting in {n} {product|products} that {has|have} not sold in 60 days." Board: "US$1,204.30
   is sitting in 14 products that have not sold in 60 days."
2. When at least two idle products in one category cost over US$30: "{countWords-as-number} of them are {category in lower
   case} over US$30" and, when at least half of their last 12 months' units sold in one calendar month, " that sold well only
   in {Month}", then ".". Board: "Three of them are spirits over US$30 that sold well only in December." (the count as a
   capitalised word, "Two" … "Ten", then digits).
3. When there is profit in the window: "{Twenty|n} products make {share} of profit; none of them ran out this month." or "…; {n}
   of them ran out this month." (ran out = hit 0 in the window). Board: "Twenty products make 71% of profit; none of them ran
   out this month."

**Do something about it**:
1. When finding 2 fired: "Promote the slow {category in lower case}" → `promotion-new` with those products' ids.
2. When an idle product qualifies for return: "Send the {product short word in lower case} back to {supplier}" →
   `return-new` for the idle product with the most cash in it that qualifies. Board: "Send the rosé back to Mukuru Wines"
   (short word = the product name's last word before its size: "Nederburg Rosé 750ml" → "rosé").
3. When idle products have a reorder level set: "Stop reordering what does not sell" →
   `/retail/stock?sheet=reorder-levels&ids=<their stock line ids>`.
Fallback: "See what is on hand" → `/retail/stock`.

### 5.5 Stock health — `/retail/insights/stock` (board `InsightsStock.png`) · INS-02

**KPIs**:

| Label | Value | Delta | Note |
|---|---|---|---|
| "Stock at cost" | money ("US$31,798.00") | money change against a month ago, no tone ("+US$1,210.00") | "on a month ago" |
| "Days of cover" | count of days ("23") | — | "at {this month’s \| the last 7 days’ \| today’s} sales" ("this month’s" for 30 days and This month) |
| "Running low" | count ("7") | — | "below reorder level" |
| "Sales missed" | money ("US$212.40") | — | "estimated, while out of stock" |

**Chart** (bars with a mark): question "Are we stocked right?"; unit "Days of cover by category, against the 14 days you aim
for"; rows by category (the order of the categories' takings, highest first); bar = days (track max = the largest value or
twice the aim, whichever is more), a 2px `--ink` mark at 14 on every row; right: "{n} days" (mono 600) over the verdict (12;
"Too little" `--warn`, "About right" `--ink-3`, "Too much" `--warn`, "Far too much" `--bad`); under the rows a line with a
2px × 12px `--ink` mark and "Aim: 14 days, plus supplier lead time" (12.5 `--ink-3`). Categories with nothing sold in the
window are left out.

**Tabs and tables** (default "Ran out this month"; no Σ row, as on the board):

| Tab | Columns | Rows |
|---|---|---|
| "Ran out {today \| this week \| this month}" (30 days and This month → "this month") | "Product" (link) · "Out for" (end, `days`) · "On hand" (end, num) · "Sales missed" (end, money, bad when > 0) · "Do" (action) | most missed first |
| "Too much" | "Product" (link) · "Days of cover" (end, `days`, warn; "Not selling" when none sold) · "On hand" (end, num) · "Cash in it" (end, money) · "Do" | most cash first |

"Do": Ran out with on hand ≤ 0 → "Order it" → `/retail/buying/orders?sheet=order-new&productIds=<id>`; back in stock →
"Raise reorder level" → `/retail/stock?sheet=reorder-levels&ids=<line ids>`; Too much → "Order less" →
`/retail/stock?sheet=reorder-levels&ids=<line ids>`. Each only with the role's right (`retail.purchasing:create`,
`retail.stock:update`). `empty`: "Nothing ran out in these dates." · "Nothing is overstocked."

**What it says** (`findings/stock.ts`):
1. The category with the least cover, when under 10 days: "{Category} runs out on {weekday it sold most}s: {n} days of cover
   against 14" plus, when one of its products ran out in the window, ", and {product short word} ran out {countWords}" then
   ".". Board: "Beer runs out on Saturdays: 9 days of cover against 14, and Castle ran out once."
2. The category with the most cover, when over 42 days: "{Category} has {n} days of cover. {money, whole dollars} is tied up in
   it." Board: "Wine has 64 days of cover. US$2,140 is tied up in it."
3. When sales were missed: "Running out cost an estimated {money, whole dollars} in sales {this month|this week|today}."
   Board: "Running out cost an estimated US$212 in sales this month."

**Do something about it**:
1. When finding 1 fired: "Raise reorder levels for {andList of the under-10-day categories, lower case}" →
   `/retail/stock?sheet=reorder-levels&ids=<their lines with sales>`. Board: "Raise reorder levels for beer and ice".
2. When finding 2 fired: "Order less {category in lower case} next time" →
   `/retail/buying/orders?sheet=order-new&supplierId=<the category's main supplier>`. Board: "Order less wine next time".
Fallback: "See what is running low" → `/retail/stock?level=low`.

### 5.6 Losses — `/retail/insights/losses` (board `InsightsLosses.png`) · INS-03 · W-53

**KPIs**:

| Label | Value | Delta | Note |
|---|---|---|---|
| "Lost {in 30 days \| in 7 days \| today \| this month}" | money ("US$412.60") | money change, up bad ("+US$88.10") | `beforeNote` |
| "Of takings" | rate ("1.2%") | `points`, up bad ("+0.2 pts") | — |
| "Drawer differences" | signed money ("−US$43.79") | count of shifts with a difference, no tone ("5") | "shifts out" ("shift out" for 1) |
| "Refunds and voids" | money ("US$96.20") | count, no tone ("7") | "over the PIN limit: {n}" |

**Chart** (columns, stacked): question "Where is money leaking?"; unit "Losses each week, by kind"; legend "Count differences"
(`--s2`), "Breakage" (`--s1`), "Drawer differences" (`--s3`), "Refunds and voids" (`--s4`), stacked bottom-up in that order;
eight weeks labelled by their Monday ("10 Aug" … "28 Sep"); 2px gaps between segments, 4px rounded top; tooltip "28 Sep ·
Breakage" / "US$26.00". The period does not change the eight weeks; the KPIs and tables follow the period.

**Tabs and tables** (default "By cashier"):

| Tab | Columns | Σ row |
|---|---|---|
| "By cashier" | "Cashier" (1fr, link → `/retail/shifts?cashier=<id>&opened=<period>`) · "Drawer differences" (140px, end, signed money, bad < 0) · "Refunds" (110px, end, money, link → `/retail/sales?tab=refunds&cashier=<id>&when=<period>`) · "Voids" (110px, end, money, link → `/retail/sales?tab=voids&cashier=<id>&when=<period>`) · "No-sale opens" (110px, end, num, warn ≥ 3) | "Σ {n} cashiers" · net · refunds · voids · opens |
| "By product" (**Defined here**) | "Product" (link) · "Count differences" · "Breakage" · "Refunds" · "Lost" (all end, money) | "Σ {n} products" · each sum |
| "By till" (**Defined here**) | "Till" · "Drawer differences" · "Refunds" · "Voids" · "No-sale opens" | "Σ {n} tills" · each sum |

Rows: cashiers who had a shift, refund, void or drawer open in the window, most short first; products with any loss, most lost
first; tills likewise. The period in the links is the page's (`30d` → `opened=30d`; a range → `opened=2026-09-04..2026-10-03`).
`empty` "No losses in these dates."

**What it says** (`findings/losses.ts`):
1. When the last two weeks lost at least 1.5 × the two weeks before: "Losses have {doubled|risen by half|tripled} in the last two
   weeks, mostly from {the biggest kind, lower case}" plus, for count differences or breakage, " on the {category of most of
   it, lower case} shelf" then ".". Board: "Losses have doubled in the last two weeks, mostly from count differences on the
   spirits shelf."
2. The cashier short most often (two or more short shifts in the window): "{Cashier} has been short {countWords} {this month|this
   week|today}" plus, when all those shifts were on one weekday and closed after 17:00, ", all on {Weekday} evenings" then ".".
   Board: "Chipo Dube has been short three times this month, all on Friday evenings."
3. The cashier with the most no-sale opens (two or more): "{Cashier} opened the drawer without a sale {countWords}." Board:
   "Farai Moyo opened the drawer without a sale four times."

**Do something about it**:
1. When finding 1 named a shelf: "Count the {category, lower case} shelf again" →
   `/retail/stock/counts?sheet=count-new&categoryIds=<id>` (STK-05 reads `categoryIds`: What "Some categories" with that one).
2. When finding 2 fired: "Look at {Cashier first name}’s {Weekday} shifts" (or "… shifts" without a weekday) →
   `/retail/shifts?cashier=<id>&state=short&opened=<period>`. Board: "Look at Chipo’s Friday shifts".
3. When there were no-sale opens and the till rules let the drawer open without a PIN
   (`RetailTillRules.drawerOpenWithoutSale` true): "Require a PIN to open the drawer" → `/retail/manage/till-rules`.
Fallback: "Look at the shifts" → `/retail/shifts`.

### 5.7 Customers — `/retail/insights/customers` (board `InsightsCustomers.png`) · INS-03

**KPIs**:

| Label | Value | Delta | Note |
|---|---|---|---|
| "Takings from members" | share ("38%") | `points` ("+3 pts"), up ok | "of all takings" |
| "Members who came back" | count ("412") | change, up ok ("+22") | "in {period short}" ("in 30 days") |
| "Member basket" | money ("US$14.20") | `times`, no tone ("2.3×") | "a walk-in basket" |
| "Not seen in 30 days" | count ("96") | change, up bad ("+11") | "members" |

**Chart** (columns, side by side): question "Who comes back?"; unit "Takings each week, members against walk-ins"; legend
"Members" (`--s2`), "Walk-ins" (`--data-muted`); eight weeks; two 28px bars per week; y axis like 5.4.

**Tabs and tables** (default "Not seen in 30 days"; no Σ row):

| Tab | Columns | Rows |
|---|---|---|
| "Not seen in 30 days" | "Customer" (1fr, link → `/retail/customers/{id}`) · "Last came" (start, `dayMonth`) · "Visits" (end, num; 12 months) · "Spend, 12 months" (end, money) · "Points" (end, num) | most spent first |
| "Best customers" | "Customer" (link) · "Visits" (end, num; in the window) · "Spend, {period short}" (end, money) · "Points" (end, num) · "Last came" | most spent in the window first |

`empty` "Every member has been in within 30 days." · "No members bought in these dates."

**What it says** (`findings/customers.ts`):
1. "Members spend {x} times more a visit" plus, when the members' share rose in at least six of the eight weeks, ", and their
   share is growing every week" then ".". Board: "Members spend 2.3 times more a visit, and their share is growing every week."
2. When members are lapsed: "{n} members have not been in for 30 days" plus, when some are in the top 20 by 12-month spend,
   ", including {countWords-as-number, lower case} of your top 20" then ".". Board: "96 members have not been in for 30 days,
   including three of your top 20."
3. When at least half the lapsed members' last sale carried a promotion and fell on one weekday: "Most lapsed members last came
   on a {Weekday} promotion." Board: "Most lapsed members last came on a Saturday promotion."

**Do something about it**:
1. When members are lapsed: "Message the {n} with their points balance" → `/retail/customers?sheet=message&segment=lapsed-30`
   (CUS:message reads `segment`).
2. "Change what a point is worth" → `/retail/manage/loyalty` (owners only: `CUS:loyalty`'s right; hidden otherwise).
Fallback: "See the customers" → `/retail/customers`.

### 5.8 Money — `/retail/insights/money` (board `InsightsMoney.png`) · INS-04 · owner and bookkeeper

**KPIs**:

| Label | Value | Delta | Note |
|---|---|---|---|
| "Cash at hand" | money ("US$4,812.40") | — | "safe, tills and bank" |
| "Owed to suppliers" | money ("US$1,031.20") | money overdue, bad ("US$216.00"; null when none) | "overdue" |
| "Owed to you" | money ("US$1,213.80") | money overdue, bad ("US$212.40") | "overdue" |
| "Requisitions out" | money ("US$2,964.80") | count asked, no tone ("2") | "to approve" |

**Chart** (columns, side by side): question "Where is the cash going?"; unit "Money in and out each week"; legend "In: sales
and payments" (`--s1`), "Out: suppliers and expenses" (`--s4`); eight weeks.

**Tabs and tables** (default "Due in the next 14 days"):

| Tab | Columns | Σ row |
|---|---|---|
| "Due in the next 14 days" | "What" (1fr, link: a bill number → `/retail/buying/bills?sheet=bill-edit&id=<id>`; a requisition number → `/retail/buying/requisitions/<id>`; "Plan" → `/retail/manage/billing`) · "Who" (140px, text: supplier, pay-to, or "Tender") · "Due" (140px, start: "Overdue" bad, else `dayMonth`) · "Amount" (140px, end, money) | "Σ {n}" · — · — · amount |
| "Where the cash is" (**Defined here**) | "Where" (1fr: each money account's name, then "In the tills now") · "Kind" ("Cash", "Bank", "Mobile money", "Tills") · "Amount" (end, money) | "Σ {n}" · — · amount |

Rows: overdue first, then by due date. `empty` "Nothing falls due in the next 14 days." · "No money accounts yet."

**What it says** (`findings/money.ts`):
1. The latest week where out exceeded in: "More went out than came in during the week of {D Month}: the {supplier first word}
   {category of most of its lines, lower case} order." when that week's biggest out was a supplier payment for one order, else
   "More went out than came in during the week of {D Month}." Board: "More went out than came in during the week of 14
   September: the Afdis spirits order."
2. "{money, whole dollars} falls due in the next 14 days; cash at hand {covers it|does not cover it}." Board: "US$2,516 falls due
   in the next 14 days; cash at hand covers it."
3. The customer account most overdue: "{Customer} owes {money} overdue; chase it before paying {the first overdue or soonest
   bill's supplier first word}." Board: "Mbare Sports Club owes US$212.40 overdue; chase it before paying Delta."

**Do something about it**:
1. When finding 3 fired: "Chase {Customer}" → `/retail/accounts/<customer id>?sheet=customer-payment` (CUS:accounts).
2. The soonest due bill's supplier: "Pay {Supplier}" → `/retail/buying/suppliers/<id>?sheet=payment-new&supplierId=<id>`.
Fallback: "See the bills" → `/retail/buying/bills`.

**Deviation**: the board lists "Plan · Tender · 1 November · US$49.00" under "Due in the next 14 days" while the run date is 3
October; the plan row shows only when its bill falls within the 14 days.

### 5.9 The Reports module (nav) · INS-07

Rail mark "Reports" (`FileText`), after Insights. Panel "Reports" (board `ReportsList.png`, left):

| Item | Icon | Route | Badge |
|---|---|---|---|
| "Every template" | `FileText` | `/retail/reports` | every template the person may open ("16") |
| "Selling" | `Receipt` | `/retail/reports?area=selling` | that area's count ("4") |
| "Stock" | `Stack` | `/retail/reports?area=stock` | "4" |
| "Buying" | `TrayArrowDown` | `/retail/reports?area=buying` | "2" |
| "Customers" | `Users` | `/retail/reports?area=customers` | "2" |
| "Money" | `Money` | `/retail/reports?area=money` | "2" |
| "The floor" | `CashRegister` | `/retail/reports?area=floor` | "2" |

Badges are plain counts (mono, `--tray` pill as FND 5.3.3), from `GET /api/v2/retail/nav/badges` → `reports`. An area item
whose count is 0 for this person is hidden; the module mark shows when "Every template" counts at least one (`retail.reports:view`
for all five roles; decision 7). The current item: "Every template" on `/retail/reports`; the area's item on `?area=` and on a
run page of that area's template (`ReportSales.png`: "Selling" current). This replaces FND 5.3.4's Reports row (routes
`/reports…` → `/retail/reports…`; roles O, M, B → all five, narrowed by template).

### 5.10 Every template — `/retail/reports` (board `ReportsList.png`) · INS-07

ListFrame, source `retail-report-templates`, noun "templates".

**Header**: title "Every template"; sub "Open one to run it. Change what it shows, then save it as your own."; no back;
primary "+ New template" (`retail.reports:create`) → `?sheet=template-new`.

**Tabs** (own row; counts ignore search and filters): "All" · "Built in" · "Made by your team" · "Just yours" (all; built-ins;
saved templates; saved templates the person made). With the seed, as Tafara Nyathi: 16 · 13 · 3 · 1 (**Deviation**: the board
reads "Built in 12" beside 16 rows of which 13 are built in; counts are computed).

**Toolbar**: search "Template, or what it shows" (name, summary); "Seen by Anyone" (choice: "Anyone", "Everyone", "Managers",
"Just you"); "Filters" (holds "Made by": "Anyone", "Built in", "You", then each maker by name); count; Clear; sort "Area, then
name" (default), "Name A–Z", "Last opened" (**Defined here**); Group ("None", "Area", "Seen by"); Columns; Export.

**Columns** (grid `40px minmax(190px,1.1fr) minmax(280px,2fr) 110px 150px 130px 150px 44px`, min width 1120px):

| Column | Key | Cell | Align | Priority | Value |
|---|---|---|---|---|---|
| Template | `name` | `link` → `/retail/reports/{id}` (600) | start | 1 | "Sales", "Weekend takings by shop" |
| What it shows | `summary` | `text` (one line, ellipsis) | start | 2 | the built-in's summary or the template's description; a saved template without one: "On {built-in name of its source}" |
| Area | `area` | `muted` | start | 3 | "Selling", "Stock", "Buying", "Customers", "Money", "The floor" |
| Made by | `madeBy` | `text`; "Built in" as `zero`-style faint | start | 2 | "Built in", "Tendai Mhlanga", "You" |
| Seen by | `seenBy` | `state`: "Everyone" hollow, "Managers" hollow, "Just you" neutral | start | 1 | |
| Last opened | `lastOpened` | `text` (`lastOpenedLabel`), sorts by `lastOpenedAt` | start | 2 | "Today, 08:12", "Yesterday, 17:40", "28 September 2026"; never → "—" |

Area order for "Area, then name": Selling, Stock, Buying, Customers, Money, The floor; then name A–Z (**Deviation**: the
board's rows within Selling are not in name order).

**Totals band**: "Σ 16" (count only).

**Selection bar** (board order): "Share" (`retail.reports:create` → `?sheet=template-share&ids=<…>`), "Email every Monday"
(→ `POST /api/v2/retail/reports/templates/email { refs }`, toast "{n} templates go out every Monday at 07:00."), "Delete"
(`retail.reports:create`; ask `templatesdelete` → `POST …/templates/delete`, toast "{n} templates deleted." plus " {m} stayed:
built-in templates and others’ cannot be deleted." when skipped), then FND "Export {n}".

**Row ⋯** (**Defined here**): "Open"; "Change the template" (`canChange`; → `/retail/reports/{id}?sheet=template-edit`);
"Email it every Monday" / "Stop the Monday email" (`canChange`, saved: PATCH `email.on`); "Email me every Monday" / "Stop
emailing me" (otherwise: `?sheet=report-send&ref={id}` over the run page / `DELETE /api/v2/retail/sends/[id]`); "Delete the
template" (`canChange`, bad; ask `templatedelete`).

**Empty**: never empty while built-ins exist. No match: FND's "No templates match these filters." + "Clear the filters".
"Just yours" with none: the empty line "Nothing of yours yet. Open any report, change what it shows, then choose Save as a
template." **Phone**: card title name, badge seen by, meta "{area} · {made by}", figure the last opened text.

### 5.11 An area — `/retail/reports?area=stock` (board `ReportsStock.png`) · INS-07

The same source with the parent filter `area`. Differences from 5.10:
- Title = the area ("Stock"); sub by area: Stock "Templates that read stock on hand, movements and counts" (board); Selling
  "Templates that read sales, refunds and the items sold"; Buying "Templates that read orders, deliveries and bills";
  Customers "Templates that read customers, what they spend and what they owe"; Money "Templates that read payments and
  requisitions"; The floor "Templates that read till shifts, refunds and voids" (**Defined here**, in the board's shape).
- Tabs count within the area ("All 4 · Built in 3 · Made by your team 1 · Just yours 0" for Stock).
- Toolbar row: "Made by Anyone" and "Seen by Anyone" both on the row (ListFrame page option `rowFilters: ["madeBy","seenBy"]`,
  added to FND-05 by INS-07; Every template passes `["seenBy"]`).
- Sort default "Name A–Z".
- No Area column (grid `40px minmax(190px,1.1fr) minmax(280px,2fr) 150px 130px 150px 44px`, min width 1040px).
- "+ New template" opens `?sheet=template-new&area=stock` (the first card of the area selected: Stock on hand).
- Σ "4".

### 5.12 A template, run — `/retail/reports/[ref]` (boards `ReportSales.png`, `ReportWeekend.png`) · INS-08

ListFrame over the template's source in report mode: `source = RunContext.source`, `face = "report"`, `template = ref`; the
template's query is the starting point and the URL holds every change (`when`, `site`, `cashier`, `type`, `q`, `sort`,
`group`, `rows`, `cols`, `page`). Opening the page posts `…/[ref]/opened` once.

**Header**: back = the area ("Selling") → `/retail/reports?area=selling`, then "/"; title = the template's name ("Sales",
"Weekend takings by shop"); sub = `RunContext.sub`:
- built-in: "Built in · {reportPeriodWords of the current period}, {every shop | the shop's name}" ("Built in · 1 to 3 October
  2026, every shop"); sources without a period: "Built in · {every shop | name}"; without a shop filter: "Built in ·
  {period}";
- saved: "{maker}’s template · {managers see it | everyone sees it | only you see it}" ("Tendai Mhlanga’s template · managers
  see it"), the maker's name even when it is the viewer;
- sub link "Change the template" (saved and `canChange`) → `?sheet=template-edit`.
Primary "+ Save as a template" (`canSave`) → `?sheet=template-save`. No tabs.

**Toolbar**: the face's search placeholder (rolled up: the key column's label, searching the key values: "Shop"); the face's row
filters (Sales: "Period This month", "Shop Any", "Cashier Anyone", "Type Any"); "Filters" (the face's other filters); count;
Clear; sort; "Group" — its menu gains a first section "One row for each" listing the face's rollups with a check on the
current one ("Sale", "Day", "Shop", "Cashier", "Till"), a separator, then "Group by" as FND (**Defined here**: the board does
not show where the shape is changed on a report); Columns — the face's columns available in the current shape, written to
`cols` in the URL, not to `localStorage`; Export.

**Table**: the face's columns (5.14) in the template's order; Σ band per FND (rolled up: "Σ 3" then each summed column — "811",
"US$4,226.75" …). Row link: the face's `rowHref` (a sale → `/retail/sales/{id}`); rolled up, the key cell drills down to the
face's built-in filtered by that value and the same period. Row ⋯: "Open" (**Defined here**).

**Selection bar**: "Email every Monday" (→ `?sheet=report-send&ref={ref}`), then FND "Export {n}". **Deviation**: the board's
bulk list `['Export', 'Email every Monday']` beside the frame's own "Export {n}" would show Export twice; the frame's stays.

**States** (FND 5.4.11): loading; "No sales match these filters." + "Clear the filters"; the source's 403 for a role that lost
the right; 404 "Template not found" as the frame's error state with a link "Back to {area}". **Phone**: the face's card.

**Deviation**: `ReportSales.png` shows "Filters 1" while nothing in the built-in's query is off its default; the badge counts
real filters, so the built-in Sales reads "Filters".

### 5.13 The built-in templates (`lib/reports/definitions/retail/templates.ts`) · INS-06

| Slug | Name | What it shows (summary) | Area | Source | Seen by | Query (filters · rows · columns · sort · group) |
|---|---|---|---|---|---|---|
| `sales` | Sales | Every sale, refund and void, by day, shop and cashier | Selling | `retail-sales` | Everyone | `when=this-month` · — · Sale, Date, Shop, Cashier, Type, State, Discount, Total · Newest first · none |
| `items-sold` | Items sold | Each line sold: quantity, price, revenue and margin | Selling | `retail-items-sold` | Everyone | `when=30d` · — · Item, Date, Quantity, Price, Revenue, Cost, Margin · Newest first · none |
| `discounts-given` | Discounts given | Every discount and price change at the till, and who allowed it | Selling | `retail-items-sold` | Managers | `when=this-month`, `discounted=yes` · — · Date, Sale, Item, Cashier, Shelf price, Price, Discount, Allowed by, Why · Newest first · none |
| `stock-on-hand` | Stock on hand | What is on the shelf at cost and at price, by shop | Stock | `retail-stock-on-hand` | Everyone | — · — · Product, Category, Shop, On hand, Value at cost, Value at price · Most value first · Shop |
| `count-differences` | Count differences | What each count found short or over, at cost | Stock | `retail-stock-movements` | Managers | `when=30d`, `kind=counts` · Reference · Reference, Movements, Short at cost, Over at cost, Value at cost · Newest first · none |
| `stock-movements` | Stock movements | Every receipt, sale, adjustment and transfer, by product | Stock | `retail-stock-movements` | Managers | `when=30d` · — · When, Product, What happened, Reference, Change, Value at cost · Newest first · Product |
| `orders-and-deliveries` | Orders and deliveries | What was ordered, what came and what is still due | Buying | `retail-orders` | Managers | `raised=this-year` · — · Order, Supplier, Raised, Expected, State, Ordered, Came, Still due · Newest first · none |
| `supplier-spend` | Supplier spend | What each supplier was paid and is owed, by month | Buying | `retail-bills` | Managers | `billed=this-year` · Month, Supplier · Month, Supplier, Billed, Paid, Owed · Newest first · Month |
| `customer-spend` | Customer spend | Spend, visits and points for each customer | Customers | `retail-customers` | Everyone | — · — · Customer, Phone, Tier, Visits, Last visit, Points, Spend, 12 months · Most spent · none |
| `accounts-owed` | Accounts owed | Who owes the shop, how much and for how long | Customers | `retail-accounts` | Managers | `state=owing` · — · Customer, Limit, Owed, Overdue, Owed for, Last paid · Most owed · none |
| `takings-by-payment` | Takings by payment | Cash, EcoCash, card and account, by day and till | Money | `retail-payments` | Managers | `when=this-month` · Day, Till · Day, Till, Cash, EcoCash, Card, On account, Other, Taken · Newest first · Day |
| `requisitions-paid` | Requisitions paid | Cash asked for, who approved it and what it was spent on | Money | `retail-requisitions` | Managers | `asked=this-year`, `state=paid` · — · Requisition, What for, Asked by, Approved by, Paid, Spent, Back, Paid on · Newest first · none |
| `till-shifts` | Till shifts | Each shift: float, takings, counted, short or over | The floor | `retail-shifts` | Managers | `opened=30d` · — · Shift, Till, Cashier, Opened, Float, Takings, Expected, Counted, Short or over · Newest first · none |

The nine "Starts from" cards and the built-in each names in its note: Sales → Sales; Items sold → Items sold; Payments → Takings
by payment; Stock on hand → Stock on hand; Stock movements → Stock movements; Orders and deliveries → Orders and deliveries;
Customers → Customer spend; Till shifts → Till shifts; Requisitions → Requisitions paid. `retail-bills`, `retail-accounts` and
`retail-empties` have report faces but no card (**Deviation** from the card hint "Every template reads one of these": three
templates read sources a person cannot start from; they can still be saved from).

### 5.14 Report faces, by source · INS-06

Each face lists: noun · search · row filters · Filters popover · columns (key "Label" cell, width; `·h` hidden by default; `$`
needs `retail.catalog:view-cost`) · sorts · groups · one row for each · read. Totals: money and number columns sum unless
noted. Choice filters always start with their `any` option ("Any", "Anyone", "All sites" → here "Any" as the board's "Shop
Any"). Period filters list "Today", "Yesterday", "This week", "Last weekend", "Last 7 days", "Last 30 days", "This month",
"Last month", "This year", "Any time", "Choose dates…".

**`retail-sales`** (floor's source; database-side `page()` extended with `GROUP BY` for `rows`) — Selling, card "Sales" /
"Each sale, refund and void":
- noun "sales"; search "Sale, cashier or customer" (sale number, cashier, customer).
- Row: "Period" (`when`, default per template), "Shop" (`site`), "Cashier" (`cashier`; hidden for a cashier), "Type" (`type`:
  "Sale", "Refund", "Void"). Popover: "Till" (`till`), "Paid with" (`paidWith`, the floor's tender list).
- Columns: `saleNo` "Sale" ref → `/retail/sales/{id}` 130px · `date` "Date" date 160px · `site` "Shop" text 170px · `cashier`
  "Cashier" muted 140px · `type` "Type" text 100px (SALE posted "Sale", SALE voided "Void", REFUND "Refund"; VOID documents never
  list) · `state` "State" state 110px ("Posted" hollow, "Voided" bad) · `discount` "Discount" money 110px · `total` "Total"
  money 120px (a voided sale's total in `--ink-3`, left out of the Σ) · `till` "Till" muted 120px ·h · `customer` "Customer"
  text 1fr ·h · `items` "Items" num 70px ·h · `cash` "Cash", `ecocash` "EcoCash", `card` "Card", `account` "On account",
  `zig` "ZiG" (in US$), `other` "Other" money 130px each ·h (the sale's payments by tender) · `taken` "Taken" money 140px ·h
  (Σ of its payments) · `tax` "Tax" money ·h · `sales` "Sales" num 90px, rollup only (SALE documents not voided).
- Sorts: "Newest first", "Oldest first", "Biggest first", "Most taken" (rolled up: by `taken`).
- Groups: Shop, Cashier, Till, Type, Day.
- One row for each: "Sale" (none), "Day", "Shop", "Cashier", "Till".
- Read: floor's (`retail.sell:view` or `retail.cash-control:view`; cashiers their own).

**`retail-items-sold`** (new, this spec; database-side `page()` in `lib/reports/loaders/retail/reports.ts`) — Selling, card
"Items sold" / "Each line, with its margin":
- noun "items"; search "Product, sale or cashier".
- Row: "Period" (`when`), "Shop" (`site`), "Cashier" (`cashier`), "Category" (`category`). Popover: "Discounted"
  (`discounted`: "Any", "Discounted or price changed" = `yes`), "Promotion" (`promotion`: "Any", "None", each promotion).
- Rows: lines of posted SALE (not voided) and REFUND documents (negative), from `RetailSaleLine`.
- Columns: `item` "Item" link → `/retail/products/{productId}` minmax(180px,1.4fr) · `date` "Date" date 150px · `saleNo` "Sale"
  ref → `/retail/sales/{saleId}` 120px · `cashier` "Cashier" muted 130px · `category` "Category" muted 130px ·h · `site` "Shop"
  ·h · `quantity` "Quantity" num 90px · `shelfPrice` "Shelf price" money 110px ·h · `unitPrice` "Price" money 100px (total: avg)
  · `discount` "Discount" money 100px ·h (manual part: `discountAmount − promotionDiscount`) · `revenue` "Revenue" money 120px
  (ex VAT) · `cost` "Cost" money 110px $ · `margin` "Margin" money 110px $ · `marginRate` "Margin %" rate 90px $ ·h (total:
  revenue-weighted) · `allowedBy` "Allowed by" text 140px ·h (the sale's `approvedByName`, else the cashier) · `why` "Why" muted
  ·h (the sale's `overrideReason`) · `promotion` "Promotion" muted ·h · `lines` "Lines" num, rollup only.
- Sorts: "Newest first", "Most revenue", "Most sold", "Lowest margin".
- Groups: Item, Category, Cashier, Shop, Day.
- One row for each: "Line" (none), "Product", "Category", "Day", "Shop", "Cashier".
- Read: as `retail-sales`.

**`retail-payments`** (new, this spec; database-side) — Money, card "Payments" / "Each payment taken, by till":
- noun "payments"; search "Sale or reference".
- Row: "Period" (`when`), "Shop" (`site`), "Till" (`till`), "Paid with" (`tender`). Popover: "Cashier".
- Rows: `RetailSalePayment` of posted SALE and REFUND documents (refunds negative), voided sales left out.
- Columns: `when` "When" when 130px · `saleNo` "Sale" ref 120px · `till` "Till" text 120px · `site` "Shop" muted ·h ·
  `cashier` "Cashier" muted 130px · `tender` "Paid with" text 120px · `reference` "Reference" mono 140px ·h · `amount`
  "Amount" money 120px (US$; ZiG at the sale's rate) · `cash`, `ecocash`, `card`, `account`, `zig`, `other` money ·h · `taken`
  "Taken" money ·h (= amount) · `payments` "Payments" num, rollup only · `day` "Day" date ·h (for rows).
- Sorts: "Newest first", "Biggest first". Groups: Till, Paid with, Shop, Day.
- One row for each: "Payment" (none), "Day", "Till", "Paid with", "Shop".
- Read: as `retail-sales`.

**`retail-stock-on-hand`** (stock's) — Stock, card "Stock on hand" / "Each product at each shop":
- noun "stock lines"; search "Product, code or barcode". Row: "Shop" (`site`), "Category" (`category`), "Level" (`level`: "Out",
  "Low", "Too much", "In stock"). No period.
- Columns: `product` "Product" link · `code` "Code" mono ·h · `category` "Category" muted 140px · `site` "Shop" text 160px ·
  `onHand` "On hand" num 100px · `reorderAt` "Reorder at" num ·h · `unitCost` "Unit cost" money ·h $ · `value` "Value at cost"
  money 140px $ · `price` "Price" money ·h · `valueAtPrice` "Value at price" money 140px (on hand × price; added to the loader by
  INS-06) · `level` "Level" state ·h · `products` "Products" num, rollup only.
- Sorts: "Most value first", "Name A–Z", "Least cover first". Groups: Shop, Category, Level.
- One row for each: "Product at a shop" (none), "Product", "Category", "Shop". Read: stock's.

**`retail-stock-movements`** (stock's) — Stock, card "Stock movements" / "Each receipt, sale, count and transfer":
- noun "movements"; search "Product or reference". Row: "Period" (`when`), "Shop" (`site`), "What happened" (`kind`: "Sales",
  "Deliveries", "Counts" = `counts`, "Breakage and own use", "Transfers", "Cases broken", "Corrections", "Returns to
  suppliers"). Popover: "Product".
- Columns: `when` "When" when 130px · `product` "Product" link · `kind` "What happened" text 170px (STK's movement words) ·
  `reference` "Reference" ref 120px (to the document) · `by` "By" muted ·h · `change` "Change" diff 90px · `value` "Value at
  cost" money 130px $ (signed) · `short` "Short at cost" money ·h $ · `over` "Over at cost" money ·h $ · `site` "Shop" ·h ·
  `movements` "Movements" num, rollup only.
- Sorts: "Newest first", "Biggest value first". Groups: Product, What happened, Shop, Day.
- One row for each: "Movement" (none), "Product", "What happened", "Reference", "Day". Read: stock's.

**`retail-orders`** (buying's) — Buying, card "Orders and deliveries" / "What was ordered and what came":
- noun "orders"; search "Order or supplier". Row: "Raised" (`raised`, period), "Supplier" (`supplier`), "State" (`state`:
  "Not sent", "Sent", "Part delivered", "Received", "Closed", "Cancelled").
- Columns: `poNo` "Order" ref 110px · `supplier` "Supplier" text 1fr · `raised` "Raised" date 140px · `expected` "Expected"
  date 140px · `state` "State" state 130px (buying's tones) · `ordered` "Ordered" money 120px · `came` "Came" money 120px ·
  `due` "Still due" money 120px · `month` "Month" text ·h ("September 2026") · `orders` "Orders" num, rollup only.
- Sorts: "Newest first", "Most still due". Groups: Supplier, State, Month. One row for each: "Order" (none), "Supplier",
  "Month". Read: buying's.

**`retail-bills`** (buying's; no card) — Buying:
- noun "bills"; search "Bill number or supplier". Row: "Billed" (`billed`, period), "Supplier" (`supplier`), "Due" (`due`:
  "Overdue", "This week", "Next 30 days").
- Columns: `billNumber` "Bill" ref → `?sheet=bill-edit&id={id}` 120px · `supplier` "Supplier" text 1fr · `billed` "Billed"
  date 140px · `due` "Due" date 140px · `month` "Month" text 140px ·h (the billed month) · `amount` "Billed" money 120px ·
  `paid` "Paid" money 120px · `owed` "Owed" owed 120px · `bills` "Bills" num, rollup only.
- One row for each: "Bill" (none), "Supplier", "Month". Read: buying's (`retail.bills:view`).

**`retail-customers`** (CUS:customers) — Customers, card "Customers" / "Spend, visits, points and what is owed":
- noun "customers"; search "Name, phone or card". Row: "Tier" (`tier`), "Last visit" (`lastVisit`: "This week", "This
  month", "Not in 30 days", "Not in 90 days").
- Columns (as the Customers list board): `name` "Customer" link · `phone` "Phone" mono · `tier` "Tier" state · `visits`
  "Visits" num · `lastVisit` "Last visit" date · `points` "Points" num · `spend12` "Spend, 12 months" money · `owed` "Owed"
  money ·h · `customers` "Customers" num, rollup only.
- Sorts: "Most spent", "Name A–Z", "Last visit". One row for each: "Customer" (none), "Tier". Read: CUS's.

**`retail-accounts`** (CUS:accounts; no card) — Customers:
- noun "accounts"; Row: "State" (`state`: "Owing" = `owing`, "Overdue").
- Columns (as the Accounts list board): `name` "Customer" link · `limit` "Limit" money · `owed` "Owed" money · `overdue`
  "Overdue" owed · `paysIn` "Pays in" text · `owedFor` "Owed for" text ("24 days"; oldest unpaid, **Defined here**) ·
  `lastPaid` "Last paid" date · `state` "State" state ·h.
- Sorts: "Most owed". One row for each: "Account" (none). Read: CUS's.

**`retail-shifts`** (FND's; in-memory) — The floor, card "Till shifts" / "Each shift, counted against expected":
- noun "shifts"; search "Shift, cashier or till". Row: "Period" (`opened`), "Shop" (`site`), "Till" (`till`), "Cashier"
  (`cashier`). Popover: "State".
- Columns: `shiftNo` "Shift" ref 110px · `till` "Till" muted 120px · `cashier` "Cashier" text 140px · `openedAt` "Opened" date
  with time 160px · `state` "State" state 120px (FND tones) · `float` "Float" money 110px · `takings` "Takings" money 120px ·
  `expected` "Expected" money 120px · `counted` "Counted" money 120px · `variance` "Short or over" diff 130px · `refunds`
  "Refunds" money ·h · `voids` "Voids" money ·h · `noSaleOpens` "No-sale opens" num ·h (added to the loader by INS-06:
  refunds and voids rung on the shift, `RETAIL_DRAWER.OPENED` events on it) · `shifts` "Shifts" num, rollup only.
- Sorts: "Newest first", "Biggest difference". Groups: Till, Cashier, State, Day. One row for each: "Shift" (none),
  "Cashier", "Till", "Day". Read: FND's.

**`retail-requisitions`** (buying's) — Money, card "Requisitions" / "Cash asked for, approved and paid":
- noun "requisitions"; search "Requisition, what for or who". Row: "Asked" (`asked`, period), "State" (`state`: "Asked",
  "Approved", "Paid out", "Accounted for", "Paid out or accounted for" = `paid`, "Rejected", "Cancelled"), "Asked by"
  (`askedBy`). Popover: "What for" (expense type).
- Columns: `reqNo` "Requisition" ref 120px · `whatFor` "What for" text 1fr · `askedBy` "Asked by" text 140px · `approvedBy`
  "Approved by" muted 140px · `state` "State" state 130px · `amount` "Asked" money ·h · `approved` "Approved" money ·h · `paid`
  "Paid" money 110px · `spent` "Spent" money 110px · `back` "Back" money 100px · `paidOn` "Paid on" date 140px · `month`
  "Month" ·h · `requisitions` "Requisitions" num, rollup only.
- One row for each: "Requisition" (none), "Asked by", "What for", "Month". Read: buying's.

**`retail-empties`** (stock's; no card) — Stock:
- noun "entries"; Row: "Period" (`when`), "What happened" (`kind`: the stock spec's five, plus "Returns and credits" =
  `supplier`), "Supplier" (`supplier`), "Shop" (`site`).
- Columns: `when` "When" when · `kind` "What happened" state · `who` "Who" text · `supplier` "Supplier" text ·h · `bottles`
  "Bottles" num · `crates` "Crates" num · `deposit` "Deposit" money · `reference` "Reference" ref · `entries` "Entries" num,
  rollup only.
- One row for each: "Entry" (none), "Supplier", "What happened", "Day". Read: stock's.

### 5.15 Sheets (`lib/retail/sheet-kinds/reports.ts`, `lib/retail/sheet-kinds/insights.ts`)

Chrome, fields and submitting are FND-SHEET's. Copy from `Sheet.dc.html` `K` where the board has it.

#### 5.15.1 Save as a template — `?sheet=template-save` over a run page (board `ReportSaveTemplate.png`) · INS-08

Kind `template-save` (`K.templatesave`). Requires `retail.reports:create`. Width 520.

- **Header**: title "Save as a template"; sub "Reports › {Area} › {Template name}" ("Reports › Selling › Sales").
- **Section 1** (no title):
  - "Name" — `text`, required, 1–120; default the suggested name "{period words}, {shop words}" ("Month to date, every shop") (period: today "Today", this-week "This week", last-weekend "Last weekend", 7d "Last 7 days",
    30d "Last 30 days", this-month "Month to date", last-month "Last month", this-year "Year to date", a range "1 to 3 October",
    any "All time"; shop: "every shop" or the shop's name; a source without a shop filter: the period alone), " (2)" added
    when the name is taken. **Defined here** (the board shows the result, not the rule).
  - "What it shows" — `area`, optional, rows 2, placeholder "One line, shown under the name in the list", ≤ 240.
- **Section "What it keeps"**:
  - "Columns" — `read`: the visible column labels in order joined ", " ("Sale, Date, Shop, Cashier, Type, State, Discount,
    Total").
  - "Filters" — `read`: each filter in words, joined ", ", first letter capital: Shop any "any shop", a shop "Harare Main
    Branch"; Cashier any "any cashier", a person "Chipo Dube’s"; Type any "sales, refunds and voids", one type "sales only",
    "refunds only", "voids only"; Till, Paid with, Category likewise ("any till", "paid by EcoCash"); search "matching “Castle”";
    the period is not here (it has its own field). Board: "Any shop, any cashier, sales, refunds and voids".
  - "Sorted" — `read`, half: the sort's label ("Newest first").
  - "Grouped" — `read`, half: "Not grouped", "By {group label in lower case}", or "One row for each {rollup label in lower
    case}" (with both: "One row for each shop, by day").
  - "Period" — `seg` "Moves with today" · "Keep {range without the year}" ("Keep 1 to 3 October"), default "Moves with today";
    hint by preset: this-month "‘This month’ opens on whichever month it is. Keep the dates for a one-off you want to come
    back to." (board); today "‘Today’ opens on whichever day it is. …"; this-week "‘This week’ opens on whichever week it is.
    …"; last-weekend "‘Last weekend’ opens on whichever weekend has just gone. …"; 7d/30d "‘Last 30 days’ opens on the 30 days
    before it is opened. …"; last-month, this-year likewise. When the run has picked dates: a `read` "Keeps 1 to 3 October"
    instead of the seg; a source without a period: no Period field.
- **Section "Who sees it"**:
  - "Seen by" — `seg` "Just me" · "Managers" · "Everyone", default "Just me"; hint "People only ever see the rows their own role
    lets them see, whoever made the template."
  - `toggle` "Email it every Monday at 07:00", default off; hint "As a PDF, to the people who see it. Change the day in the
    template later."
- **Footer**: note "It goes under {Area}. The built-in {built-in name} stays as it was." (board: "It goes under Selling. The
  built-in Sales stays as it was."; from a saved template: "It goes under Selling. {Template name} stays as it was."); "Cancel";
  primary "Save the template".
- **Submit**: `POST /api/v2/reports/templates` with `reportKey` = the source, `view`/`params` from the page's current query,
  `keepDates` = the Period seg's second option, `email.on` = the toggle. Field errors map to "Name" and the footer. Done
  "{name} is under {Area}." (board: "Month to date, every shop is under Selling."); the page goes to `/retail/reports/<id>`.
  Invalidates `["list","retail-report-templates"]`, `["nav-badges"]`.

#### 5.15.2 New template — `?sheet=template-new` over Every template or an area (board `TemplateNew.png`) · INS-08

Kind `template-new` (`K.templatenew`), wide (760). Requires `retail.reports:create`. Loads `GET /api/v2/retail/reports/sources`.

- **Header**: title "New template"; sub "Reports › Every template" (over an area: "Reports › {Area}").
- **Section 1**: "Starts from" — `cards`, cols 3, the nine cards in this order with label and line: "Sales" "Each sale, refund
  and void"; "Items sold" "Each line, with its margin"; "Payments" "Each payment taken, by till"; "Stock on hand" "Each product at
  each shop"; "Stock movements" "Each receipt, sale, count and transfer"; "Orders and deliveries" "What was ordered and what
  came"; "Customers" "Spend, visits, points and what is owed"; "Till shifts" "Each shift, counted against expected";
  "Requisitions" "Cash asked for, approved and paid". Cards whose source the person's role cannot read are left out. Default
  "Sales" (`&area=` → the area's first card). Hint "Every template reads one of these. The area it goes under comes from here:
  {Card} goes under {Area}." (board: "… Sales goes under Selling.").
- **Section "What it shows"**:
  - "Name" — `text`, required, empty (placeholder "Weekend takings by shop", **Defined here**: the board's value as the
    example).
  - "What it shows" — `area`, optional, rows 2; hint "One line, shown under the name in the list."
  - "Columns" — `tags`, orderable (drag; FND-07's `tags` gains `reorder: true` in INS-08), options = the card's columns
    available in the chosen shape, default the card's default columns; placeholder "Add a column…"; hint "Drag to reorder.
    Every money column totals at the foot."; at least one.
  - "Period" — `seg` "Today" · "This week" · "Last weekend" · "This month" · "Pick dates", default the card's (Sales: "This
    month"); hint "A period that moves with today, so it is right each time it opens."; "Pick dates" shows "From" and "To"
    (`text`, half each, "1 October 2026"; parsed to `YYYY-MM-DD`; error "Write a date, like 1 October 2026.") and the hint
    "These dates stay as they are." (**Defined here**). Cards without a period (Stock on hand, Customers): no Period field.
  - "One row for each" — `seg` with the card's options (Sales: "Sale" · "Day" · "Shop" · "Cashier" · "Till"), default the
    first. Changing it rebuilds Columns: the key column first, the count column next ("Sales"), then the money columns that were
    chosen; back to the first option restores the card's defaults. (**Defined here**.)
- **Section "Who sees it"**: "Seen by" (`seg` as 5.15.1, default "Just me"); `toggle` "Email it every Monday at 07:00"
  (as 5.15.1).
- **Footer**: note "It goes under {Area}, beside the built-in {built-in name}." (board: "It goes under Selling, beside the
  built-in Sales."); secondary "Open it without saving" → closes the sheet and goes to `/retail/reports/<built-in slug>` with
  the sheet's period, `rows` and `cols` in the URL (nothing saved, no request); primary "Make the template".
- **Submit**: `POST /api/v2/reports/templates` (`reportKey` = the card's source; `view` = columns in order then the rest
  hidden, `rows`, the face's default sort for that shape (rolled up: by the first money column, highest first; "Most taken" for
  Sales); `params` = the face's default filters plus the period). Done "{name} is under {Area}." (board: "Weekend takings by
  shop is under Selling."); goes to `/retail/reports/<id>`.

#### 5.15.3 Change the template — `?sheet=template-edit` over a saved template (board `TemplateEdit.png`) · INS-08, INS-09

Kind `template-edit` (`K.templateedit`). Requires `canChange` (the sub link is not shown otherwise; a direct URL shows the
footer "Only whoever made it, or an owner, can change this template." and a disabled "Save").

- **Header**: title = the template's name; sub "Made by {maker} on {D Month YYYY} · opened {n} {time|times}" (board: "Made by
  Tendai Mhlanga on 14 September 2026 · opened 22 times").
- **Section 1**: "Name" (`text`, required); "What it shows" (`area`, optional, rows 2); "Starts from" (`read`: "{card label or
  built-in name}, under {Area}" — "Sales, under Selling"; hint "Change the columns, filters and grouping on the report itself,
  then save it here.").
- **Section "Who sees it"**: "Seen by" (`seg`, the current audience); `toggle` "Email it every {Weekday} at {HH:MM}" (the
  stored day and time; Monday 07:00 by default) with hint: on and sent "Sent to {n} {managers|manager|people|person}. Last sent
  {Weekday} at {HH:MM}." (Just me: "Sent to you. Last sent …"; board: "Sent to 3 managers. Last sent Monday at 07:00."); on and
  never sent "Goes to {n} {managers|people}. First on {Weekday} {D Month} at {HH:MM}."; off "As a PDF, to the people who see it.
  Change the day in the template later." While on, after the hint, a link "Change the day" (**Defined here**) shows "Day" (`seg`
  "Mon" … "Sun") and "At" (`text`, mono, half, "07:00", error "Write a time like 07:00."). The board's state (link closed)
  draws exactly as `TemplateEdit.png`.
- **Footer**: danger "Delete the template" (ask `templatedelete`); note "Only the template goes. Every {noun} stays." (sale,
  shift, movement, order, bill, customer, account, requisition, entry — the source's row noun; board "Every sale stays.");
  "Cancel"; primary "Save".
- **Submit**: `PATCH /api/v2/reports/templates/[id]` with name, description, audience, `view`/`params` = the page's current
  query, `email { on, weekday, time }`. Done "{name} saved." (board: "Weekend takings by shop saved."). Danger: `DELETE`, toast
  "{name} deleted.", go to `/retail/reports?area=<slug>`.

#### 5.15.4 Share templates — `?sheet=template-share&ids=<…>` over a Reports list (**Defined here**) · INS-08

Requires `retail.reports:create`. Title "Share {n} templates"; sub "Reports". Field "Seen by" (`seg` "Just me" · "Managers" ·
"Everyone", default "Managers"; hint "People only ever see the rows their own role lets them see, whoever made the template.").
Note "Built-in templates and templates you cannot change stay as they are." Primary "Share them". Submit `POST
/api/v2/retail/reports/templates/share`. Done "{done} templates are seen by {managers|everyone|only whoever made them} now."
plus " {skipped} stayed as they were." when any were skipped.

#### 5.15.5 Email me every Monday — `?sheet=report-send&ref=<ref>` over a run page (**Defined here**) · INS-09

Requires `retail.reports:view` and the template visible. Title "Email me every Monday"; sub the template's name. Fields: "To"
(`read`, the person's email); "Day" (`seg` "Mon" … "Sun", default "Mon"); "At" (`text`, mono, half, default "07:00", hint "In
Harare time."). Note "Sends the whole report as a PDF, not just the rows ticked." Primary "Send it every Monday" (new) or "Save"
(existing); danger "Stop sending" (existing; ask `sendstop`). Submit `POST`/`PATCH /api/v2/retail/sends`. Done "{name} goes to
you every {Weekday} at {HH:MM}."

#### 5.15.6 Send me this — `?sheet=insight-send&topic=<topic>` over an insight page (**Defined here**) · INS-05

Requires the insight's permissions and an existing send (the page's "Change" link only shows then). Title "Send me this"; sub
"Insights › {Title}". Fields: "How" (`seg` "WhatsApp" · "Email"; "WhatsApp" disabled with the hint "Add your phone number in
Profile to get it on WhatsApp." when the person has no phone); "To" (`read`, the phone or the email for the chosen way);
"Day" (`seg` "Mon" … "Sun"); "At" (`text`, mono, half, hint "In Harare time."). Note "This page, as a picture and three lines."
Danger "Stop sending" (ask `sendstop`). Primary "Save". Submit `PATCH /api/v2/retail/sends/[id]`. Done "{Title} goes to you
every {Weekday} at {HH:MM} on {WhatsApp|email}." (Board-shaped: "Sales goes to you every Monday at 07:00 on WhatsApp.")

### 5.16 Confirmations (FND 5.8 ConfirmDialog; `ASKS` entries in `lib/retail/asks/reports.ts`)

| Key | Title | Body | Keep | Go | Tone |
|---|---|---|---|---|---|
| `templatedelete` | "Delete {name}?" | "Only the template goes. Every {noun} stays." | "Keep it" | "Delete the template" | bad |
| `templatesdelete` | "Delete {n} templates?" | "Only the templates go. Every row they read stays. Built-in templates stay." | "Keep them" | "Delete the templates" | bad |
| `sendstop` | "Stop sending {name}?" | "Nothing else changes. You can turn it on again from the page." | "Keep sending" | "Stop sending" | bad |

All three **Defined here**; `templatedelete`'s body is the sheet's own note.

---

## 6. What to remove

No backward compatibility: each row goes in the unit named, in the same commit as its replacement. No redirects.

| Today | Replaced by | Unit |
|---|---|---|
| `lib/retail/insights.ts` (1,349 lines: `INSIGHT_PERIODS` [7, 30, 90], `insightWindow(days)`, the `Insight` type with numeric KPI changes, `lossesFromCounts` reading `movementType: "ADJUSTMENT"`, the `isMember` name heuristic, every table and action with old routes) and `lib/retail/insights.test.ts` | `lib/retail/insights/{index,periods,figures,words,findings/*,sales,profit,products,stock,losses,customers,money,render}.ts` and their tests. INS-01 moves all seven topics onto the new contract (the five it does not rebuild keep their current figures, re-shaped) and deletes the old file; INS-02…04 rebuild the rest | INS-01 (then INS-02, INS-03, INS-04) |
| The `days` query parameter and `retail.reports:view` gate in `app/api/v2/retail/insights/[topic]/route.ts` | `period`, `from`, `to`, `siteId`; `retail.insights:view` (+ `retail.money:view`) | INS-01 |
| `components/retail/insights/format.ts` (`formatFigure` "$16,562", `formatChange` percentages for every delta) | deltas and notes worded on the server (`words.ts`); FND-DASH draws text | INS-01 |
| The page body of `app/retail/insights/[topic]/page.tsx` (RetailShell, `ViewToolbarFilter` period, KPI row, `ColumnList` tables, plain-link aside) | the insight variant (FND-09 starts the move with Sales; INS-01 completes it for every topic) | FND-09, INS-01 |
| Action links to `/retail/merchandising/*`, `/retail/setup/pos-policy`, `/retail/stock/count`, `/retail/purchasing/*`, `/retail/catalog/*` inside insights | the routes in section 1's link table | INS-01…04 |
| The `retail.reports` comment "the trading dashboard" and its use as the Insights and Overview nav gate (FND-03 interim) and as Shifts ⋯ "Compare cashiers"'s gate | `retail.insights` (Insights, Compare cashiers), the floor's own read (Overview), `retail.reports` = Reports | INS-01 (Insights items, Compare cashiers), INS-07 (Reports items) |
| The RETAIL workspace's "Reports" section (`lib/workspaces.ts` id `retail-reports`, ref `/reports`; `lib/rail/areas.ts` and `components/layout/app-sidebar/sidebar-helpers.ts` entries) and FND 5.3.4's Reports row with `/reports…` routes | the Reports module of 5.9 at `/retail/reports…` | INS-07 |
| `lib/reports/definitions/retail.ts` (`RETAIL_REPORTS`: `retail-sales`, `retail-items-sold`, `retail-stock`, `retail-shifts` as generic catalogue reports with charts layouts) and `lib/reports/loaders/retail.ts` (`loadSales` with `S-000930` numbers and unsigned voids, `loadItemsSold`, `loadStock`, `loadTills`) — whatever of them FND-04, FLR-01 and STK-02 have not already removed | list sources with report faces: `retail-sales`, `retail-shifts` (floor and foundations files), `retail-stock-on-hand` (stock; replaces `retail-stock`), `retail-items-sold` and `retail-payments` (`lib/reports/definitions/retail/reports.ts`, `lib/reports/loaders/retail/reports.ts`) | INS-06 |
| Report mode (`GET /api/v2/reports/[key]` without `page`) serving retail list sources, so `/reports/retail-sales` opened the generic screen | report mode answers 404 "Report not found" for any source with a `list` or `report` spec; retail reports open only at `/retail/reports/[ref]` | INS-06 |
| `canChangeTemplate`'s "or a manager once it is shared" and `canSeeTemplate`'s `isOrgAdminRole` for Managers in `lib/reports/template-access.ts` (both products) | "or an owner once it is shared"; Managers = owner, managers, bookkeeper (3.3) | INS-07 |
| `listTemplates` listing every template for the generic `/reports` | generic `/reports` lists only templates on sources without a `report` face; retail templates list only at `/retail/reports` | INS-07 |
| `ReportsList`'s generic hrefs `/reports/{key}?template={id}` for retail templates | `/retail/reports/{id}` | INS-07 |

Kept on purpose: the generic `/reports` pages, `ReportScreen`, `ReportCatalog`, `TemplateSheet`, the arranger and report
settings — they serve the other products (mining, schools, CRM, people) and are not on this canvas (Open questions 12).

---

## 7. Build units

In build order. Every unit: at most one migration with its witness test in the same commit (applied to the dev and test
databases); `pnpm typecheck` passes (one at a time on this machine); `npx eslint <changed files>` has no new errors; the named
tests pass (`npx vitest run …`); screenshots with `scratchpad/smoke/lib.js` at 1440×960 as `owner@bottlestore.test` unless
another person is named (manager `tafara.manager@bottlestore.test`, cashier `chipo.till@bottlestore.test`, stock clerk
`tendai.stock@bottlestore.test`, bookkeeper `bookkeeper@bottlestore.test`, password `RetailDemo123!`), compared side by side
with the board PNG (`scratchpad/shots-v32/<Board>.png`). "Seeded" means `pnpm tsx scripts/seed-retail-demo.ts --slug
hurudza-creative --days 160 --reset` with every earlier area's seed functions in place.

| Unit | Title | Size | Depends on | Boards | Workflows | Routes |
|---|---|---|---|---|---|---|
| INS-01 | Insights contract, Sales and Profit | L | FND-DASH (FND-09), FND-SHELL, FLR-01, SET-01, SET-04, PRD-02, PRD-09, STK-01, STK-04, STK-07 | InsightsSales, InsightsProfit | W-52 | `/retail/insights/sales`, `/retail/insights/profit`, `GET /api/v2/retail/insights/[topic]` |
| INS-02 | Products and Stock health; dead stock | L | INS-01, STK-02, STK-03, BUY-01, BUY-02, BUY-06, BUY-09, PRD-09, STK-04 | InsightsProducts, InsightsStock | W-52, W-54 | `/retail/insights/products`, `/retail/insights/stock` |
| INS-03 | Losses and Customers; investigate a loss | L | INS-01, FLR-02, FLR-04, FLR-05, SET-06, STK-05, STK-06, STK-08, CUS:customers, CUS:message | InsightsLosses, InsightsCustomers | W-52, W-53 | `/retail/insights/losses`, `/retail/insights/customers` |
| INS-04 | Money | M | INS-01, BUY-04, BUY-05, BUY-07, SET-10, CUS:accounts | InsightsMoney | W-52 | `/retail/insights/money` |
| INS-05 | Insight exports and Send me this | L | INS-01, SET-07, FND-SHEET | all seven Insights boards (header Export, table Export, aside "Send me this") | W-55, W-56 | `POST /api/v2/retail/insights/[topic]/export`, `/api/v2/retail/sends`, `?sheet=insight-send` |
| INS-06 | Report sources: faces, one row for each, built-in templates | L | FND-LIST, FLR-01, STK-02, STK-03, STK-09, BUY-02, BUY-04, BUY-07, CUS:customers, CUS:accounts, SET-06 | ReportSales, ReportWeekend (their data) | W-69 | `GET /api/v2/reports/[key]?face=report…`, `POST /api/v2/reports/[key]/export` |
| INS-07 | Reports module: every template, areas, nav, who sees what | M | INS-06, FND-SHELL, FND-LIST | ReportsList, ReportsStock | W-69 | `/retail/reports`, `/retail/reports?area=…` |
| INS-08 | Run a template; save, make, change, share and delete templates | L | INS-07, FND-SHEET | ReportSales, ReportSaveTemplate, TemplateNew, ReportWeekend, TemplateEdit | W-69, W-73, W-74, W-75 | `/retail/reports/[ref]`, `?sheet=template-save`, `?sheet=template-new`, `?sheet=template-edit`, `?sheet=template-share` |
| INS-09 | Weekly report emails | M | INS-05, INS-08 | TemplateEdit, ReportSaveTemplate, TemplateNew (the toggle), ReportsList and ReportSales (bulk "Email every Monday") | W-56 | `?sheet=report-send`, `POST /api/v2/retail/reports/templates/email` |

### INS-01 · Insights contract, Sales and Profit · L

- **Builds**: `lib/retail/insights/*` (3.6, 3.7, 4.1) with all seven topics on the new `InsightResponse` (Products, Stock,
  Losses, Customers and Money re-shaped from today's builders, unchanged in substance until their units); the route with
  `period`/`from`/`to`/`siteId`/`tab`/`all`; permissions `retail.insights`, `retail.money` (3.3) and the nav items' `requires`;
  Sales and Profit content exactly as 5.2 and 5.3 (KPIs, charts, tabs, Σ rows, findings rules, actions); the page wired to
  FND-DASH's insight variant for all seven topics (period segmented control, site chip, compare line, Updated, tabs with `?tab=`,
  "Show all"). The header "Export" and the aside "Send me this" are not drawn until INS-05 (FND-DASH takes them as optional
  props).
- **Tests**: `lib/retail/insights/periods.test.ts` (on Saturday 3 October 2026 14:42 Africa/Harare: Today = 3 Oct 00:00–14:42,
  before = 2 Oct 00:00–14:42; 30 days = 3 Sep 14:42–3 Oct 14:42; This month = 1 Oct 00:00–14:42 against 1 Sep 00:00–3 Sep
  14:42; a range 1–3 Oct = 1 Oct 00:00–3 Oct 23:59:59 against 28–30 Sep); `words.test.ts` (every row of 3.6); 
  `findings/sales.test.ts` and `findings/profit.test.ts` reproduce the boards' sentences from fixtures ("Friday and Saturday
  evenings, 17:00 to 20:00, bring in a third of the week.", "Weekday mornings before 10:00 take less than US$70 an hour: one
  till is enough.", "Sundays stop at 18:00 by licence; Sunday 12:00 to 15:00 is now the third-busiest slot.", "Spirits sell
  well but earn least: the festive promotion took margin from 24% to 21.7%.", "Two Keys earns 8.4%, below your 22% target for
  spirits. Afdis raised its cost in September.", "Ciders earn the best margin. They are 10% of takings and could be more.");
  `sales.test.ts` against the test database (Σ of the category table = Takings; a voided sale counts in neither baskets nor
  takings; a refund lowers its category); `lib/retail/permissions.test.ts` rows; route guard coverage.
- **Acceptance**:
  - Seeded, `/retail/insights/sales` beside `InsightsSales.png`: header "Sales"; "Today · 7 days · 30 days · This month" with 30
    days in solid ink, "Site All sites", "Compared with the 30 days before", "Updated hh:mm"; KPIs "Takings", "Sales", "Average
    basket", "Items a basket" with deltas worded like the board ("+6.1%", "+US$0.18", "−0.1"); a 7 × 14 grid "08"–"21" with
    Sunday 08, 09 and 18–21 drawn closed; "Quieter → Busier"; tabs "By category · By till · By cashier"; "Σ 6 categories"
    whose takings equal `select sum("baseAmount") from "RetailSale" where …` for the same window (floor's takings definition);
    the aside's three headed sections minus "Send me this".
  - Switching to "Today", "7 days", "This month" and "Site Borrowdale" changes the URL, the figures and the compare line; the
    figures equal the same SQL for those windows; the response arrives within 1.5 s (Network panel, warm server).
  - `/retail/insights/profit` beside `InsightsProfit.png`: the four KPIs with "−0.4 pts"-style margin delta and "back for each
    US$1"; bars with "{x}% margin" in warn under target; tabs "Products earning least · Products earning most" with Price,
    Cost, Margin, "Profit, 30 days"; clicking a product opens `/retail/products/<id>`; "Raise … to target margin" opens the
    bulk-price sheet with those products.
  - As the manager: Sales and Profit open; the panel has no Money; `/retail/insights/money` shows "Your role cannot view the
    money page". As the bookkeeper: all seven. As the cashier: no Insights mark; `GET /api/v2/retail/insights/sales` → 403
    "Feature disabled: retail.reports" (the route registry refuses the cashier's template before the route runs; the route's own
    "Your role cannot view insights" is the second line).

### INS-02 · Products and Stock health; dead stock · L

- **Builds**: Products and Stock health exactly as 5.4 and 5.5 (KPIs, column and bar charts with the aim mark, tabs and Σ rows,
  the "Do" rule, findings, actions); out-of-stock days and stock a month ago from `balanceAfter`; seed `seedDeadStock()` (3.8).
  The prefill contracts it relies on are checked in its tests: `promotion-new` reads `productIds` (PRD-09), `stock-adjust`
  reads `why` (STK-04), `return-new` reads `productIds` (BUY-09) — if a dependency has not built its part, this unit adds it to
  that sheet kind's loader.
- **Tests**: `findings/products.test.ts`, `findings/stock.test.ts` (board sentences from fixtures: "US$1,204.30 is sitting in 14
  products that have not sold in 60 days.", "Three of them are spirits over US$30 that sold well only in December.", "Twenty
  products make 71% of profit; none of them ran out this month.", "Beer runs out on Saturdays: 9 days of cover against 14, and
  Castle ran out once.", "Wine has 64 days of cover. US$2,140 is tied up in it.", "Running out cost an estimated US$212 in sales
  this month."); `products.test.ts` (the "Do" rule: a product delivered by its supplier 110 days ago → return; cost US$3.40 →
  write off; otherwise promotion; archived products never list; out-of-stock days count a day only when every line is at 0).
- **Acceptance**:
  - Seeded, `/retail/insights/products` beside `InsightsProducts.png`: five columns "This week" … "Over 90 days" on a US$ axis;
    "Not sold in 60 days" lists Nederburg Rosé 750ml ("2 July", 12, US$118.80, "Return to supplier"), Hennessy VS 700ml ("19
    July", 4, US$155.60, "Run a promotion"), Sparletta Pine Nut 2l ("30 June", 18, US$61.20, "Write it off") among the rows,
    "Σ {n} products" with on hand and cash sums equal to SQL.
  - W-54 end to end: "Write it off" on Sparletta opens the adjust sheet with "Broken or spoilt" picked and 18 → save (manager
    PIN as STK-04 asks) → back on Products, Sparletta has left the list, the KPI's cash fell by US$61.20; Losses › "Breakage"
    for this week rose by US$61.20; Profit's "Lost to breakage and counts" rose by the same. "Return to supplier" on the rosé
    opens `return-new` over Mukuru Wines with 12 × Nederburg Rosé 750ml; booking it takes it off stock and off the list.
    "Run a promotion" on Hennessy opens `promotion-new` with "Some products" and Hennessy VS 700ml.
  - `/retail/insights/stock` beside `InsightsStock.png`: bars with the 14-day mark and "Aim: 14 days, plus supplier lead time";
    "Ran out this month" shows Jaggermeister 750ml "6 days", 0, its missed sales, "Order it" → `order-new` with it.
  - As the manager both pages open; the Do links show; as the bookkeeper the Do cells read "—".

### INS-03 · Losses and Customers; investigate a loss · L

- **Builds**: Losses and Customers exactly as 5.6 and 5.7; the four loss kinds by week; the three Losses tabs with their links;
  no-sale opens from `RETAIL_DRAWER.OPENED`; members from CUS's `isMember`; findings and actions.
- **Tests**: `findings/losses.test.ts`, `findings/customers.test.ts` (board sentences: "Losses have doubled in the last two
  weeks, mostly from count differences on the spirits shelf.", "Chipo Dube has been short three times this month, all on Friday
  evenings.", "Farai Moyo opened the drawer without a sale four times.", "Members spend 2.3 times more a visit, and their share
  is growing every week.", "96 members have not been in for 30 days, including three of your top 20.", "Most lapsed members last
  came on a Saturday promotion."); `losses.test.ts` against the test database (a count of −2 at US$12.40 lands in Count
  differences US$24.80 in its week; a BROKEN adjustment in Breakage; a short shift's variance in Drawer differences and in its
  cashier's row; a refund and a voided sale in Refunds and voids; a drawer-open event raises No-sale opens).
- **Acceptance**:
  - Seeded, `/retail/insights/losses` beside `InsightsLosses.png`: four-colour stacked columns for eight weeks with the legend;
    KPIs "Lost in 30 days", "Of takings", "Drawer differences" (signed, "{n} shifts out"), "Refunds and voids" ("over the PIN
    limit: {n}"); "By cashier" rows equal the shifts' variances by cashier (SQL) and "Σ {n} cashiers".
  - W-53 end to end: click "Chipo Dube" → the Shifts list filtered to Chipo, short, last 30 days; back; click her Refunds
    figure → the Sales list on Refunds filtered to Chipo; "By till" lists Front till, Back till, Handheld 1;
    "Count the spirits shelf again" opens `count-new` with Spirits.
  - `/retail/insights/customers` beside `InsightsCustomers.png`: side-by-side weekly columns Members / Walk-ins; "Not seen in 30
    days" rows link to customer records; "Message the {n} with their points balance" opens the message sheet for that segment.

### INS-04 · Money · M

- **Builds**: Money exactly as 5.8 (cash at hand from money accounts and open drawers; owed both ways; requisitions out; in and
  out by week; "Due in the next 14 days" and "Where the cash is"; findings; actions); `retail.money:view` gate.
- **Tests**: `findings/money.test.ts` (board sentences: "More went out than came in during the week of 14 September: the Afdis
  spirits order.", "US$2,516 falls due in the next 14 days; cash at hand covers it.", "Mbare Sports Club owes US$212.40 overdue;
  chase it before paying Delta."); `money.test.ts` against the test database (an unpaid bill due yesterday is Overdue and in the
  overdue delta; a paid bill is not; a submitted requisition counts in "to approve").
- **Acceptance**: seeded, as the owner and as the bookkeeper, `/retail/insights/money` beside `InsightsMoney.png`: "Owed to
  suppliers US$1,031.20" with "US$216.00 overdue" (BUY seed), "Owed to you" with its overdue (CUS seed); "Due in the next 14
  days" rows INV-88120 Delta Beverages "Overdue" US$216.00, SZ-4471 Schweppes Zimbabwe "6 October" US$311.20, REQ-0014 Afdis
  Distillers "6 October" US$1,940.00, "Σ" equal to their sum; the links open the bill sheet, the requisition and Plan and
  billing; "Where the cash is" lists Office safe, Front till float, CBZ current account, EcoCash merchant, In the tills now
  summing to "Cash at hand". As the manager: no Money item, 403 page.

### INS-05 · Insight exports and Send me this · L

- **Builds**: migration `20261004137000_report_sends` + witness; `ReportSend` service (`lib/retail/sends/*`: create, change,
  stop, `nextRunAt`, `runDueSends` for INSIGHT subjects, failure notifications); the worker job in `scripts/retail-worker.ts`;
  `renderPngFromHtml`; `lib/retail/insights/render.tsx` (KPI strip + question panel as static markup, shared with the page);
  the export endpoint (page PDF, tables XLSX, one table XLSX/CSV/PDF) and `RETAIL_EXPORT.DOWNLOADED`; the header Export menu
  and the table Export menus on all seven pages; the aside "Send me this" (off, on with "Change"), `insight-send` sheet,
  `sendstop` ask; `/api/v2/retail/sends` endpoints; seed phones (3.8). WhatsApp media through SET-07's
  `lib/messaging/whatsapp.ts` gains `sendImage(to, url, caption)` and the outbox drain sends `mediaUrl` messages with it.
- **Tests**: `lib/reports/report-sends-migration.test.ts`; `lib/retail/sends/next-run.test.ts` (Monday 07:00 after Saturday
  14:42 is 5 October 07:00; after Monday 07:00 exactly is the next Monday; Sunday 23:30 → Monday 07:00 next day);
  `lib/retail/sends/run.test.ts` against the test database (two workers claiming the same send send once; a recipient who lost
  `retail.money:view` has their Money send deleted and a notification; WhatsApp queues a `RetailMessage` with `mediaUrl` and
  the body "Sales, last 30 days\n• …\n• …\n• …\n<link>"); `render.test.tsx` (the heat grid, bars and columns render as static
  markup with no client hooks); export route test (the page PDF is a PDF; the tables workbook has one sheet per tab with its Σ
  row).
- **Acceptance**: seeded, as the owner on `/retail/insights/sales`: header "Export" opens "This page, last 30 days" with the PDF
  and the spreadsheet; the PDF shows the KPIs, the grid and the category table; the table's "Export" opens "The 6 categories the
  table shows" and the CSV has 6 rows and a total line. The aside reads exactly as the board; "Send it every Monday" turns it
  into "Every Monday at 07:00 on WhatsApp, to +263 77 412 0098." with "Change"; "Change" → Email, Wed, 08:00 → "Every Wednesday
  at 08:00 by email, to owner@bottlestore.test."; "Stop sending" → back to the button. A `runDueSends` call with the clock at
  the next send time queues one WhatsApp message (or sends one email) whose picture shows the grid. Every other insight page
  has the same Export and aside; a manager's "Send it every Monday" on Money is impossible (no page).

### INS-06 · Report sources: faces, one row for each, built-in templates · L

- **Builds**: `report` faces (5.14) on every listed source and the two new sources (`retail-items-sold`, `retail-payments`) with
  database-side `page()`; list mode `face`, `template`, `rows`, `cols` (4.3) in `lib/reports/list-query.ts` /
  `fetchListPage`; `lib/reports/rollup.ts` and `GROUP BY` support in the sales, items-sold and payments `page()`s; period presets
  `this-week`, `last-weekend`; the per-tender columns on sales, `valueAtPrice` on stock on hand, refunds/voids/no-sale opens on
  shifts; the 13 built-ins (5.13) in `lib/reports/definitions/retail/templates.ts`; `lib/reports/template-query.ts`; migration
  `20261004137100_retail_sale_line_shelf_price` + witness and the till's `shelfPrice` write; report mode refusing list sources;
  removal of `lib/reports/definitions/retail.ts` and `lib/reports/loaders/retail.ts` (section 6).
- **Tests**: `lib/retail/sale-line-shelf-price-migration.test.ts`; `lib/reports/rollup.test.ts` (one row per shop with Sales =
  non-voided SALE count, money summed, totals over the rolled-up rows, key-cell drill-down href); `lib/reports/list-query.test.ts`
  additions (`last-weekend` on Saturday 3 October 2026 14:42 = Friday 25 September 17:00 to Sunday 27 September 23:59:59; on
  Monday 5 October = Friday 2 October 17:00 to Sunday 4 October 23:59:59; `this-week` = Monday 00:00 to now; `cols` keeps order
  and never hides the first column; `rows` outside the face's options is ignored);
  `lib/reports/loaders/retail/reports.test.ts` against the test database (items sold Σ revenue for 30 days equals Profit's
  revenue; payments by tender sum to the takings paid; a line sold at a changed price lists in "Discounts given" with its shelf
  price and approver); `app/api/v2/retail/pos/sales` test (a line with a price changed at the till stores `shelfPrice`).
- **Acceptance**: seeded, `GET /api/v2/reports/retail-sales?face=report&template=sales&page=1&size=50` returns the board's eight
  columns, `total` = this month's SALE and REFUND documents (VOID reversals excluded), `totals.total` equal to SQL with voided
  sales left out; `&rows=site&when=last-weekend&cols=site,sales,cash,ecocash,card,account,taken` returns one row per shop that
  sold last weekend whose cash+EcoCash+card+on account = taken; `POST …/export` with that query returns a workbook of the same
  rows and Σ. `/reports` (generic) no longer lists Sales, Items sold, Till shifts or Stock on hand for the tenant;
  `/reports/retail-sales` answers 404.

### INS-07 · Reports module: every template, areas, nav, who sees what · M

- **Builds**: migration `20261004137200_report_template_uses` + witness; the `retail-report-templates` source (5.10, 5.11);
  `/retail/reports` (Every template and area pages with `rowFilters`); the Reports module nav and badges (5.9); `GET
  /api/v2/retail/reports/[ref]` and `…/opened`; `template-access.ts` rules (3.3) for both products; generic `listTemplates`
  narrowed; the retail permissions row; `seedReportTemplates()` (3.8).
- **Tests**: `lib/reports/report-template-uses-migration.test.ts`; `lib/reports/template-access.test.ts` rewritten (the maker
  changes their own; the owner changes Tendai's shared template and not Tafara's Just me one; Tafara cannot change Tendai's;
  Managers includes the bookkeeper, not a cashier; Everyone includes a cashier); `lib/reports/loaders/retail/reports-catalog.test.ts`
  (as each of the five people, the rows and tab counts below; a template on a source the role cannot read never lists).
- **Acceptance**: seeded, as Tafara Nyathi, `/retail/reports` beside `ReportsList.png`: title "Every template" with the sub,
  "+ New template", tabs "All 16 · Built in 13 · Made by your team 3 · Just yours 1", "Seen by Anyone", the 16 rows in area
  order with "Built in" faint, "Tendai Mhlanga", "Rufaro Ndlovu", "You", the Seen by badges ("Just you" neutral), Last opened
  labels, "Σ 16", "1–16 of 16"; panel "Every template 16 · Selling 4 · Stock 4 · Buying 2 · Customers 2 · Money 2 · The floor
  2". `/retail/reports?area=stock` beside `ReportsStock.png`: title "Stock", its sub, tabs "All 4 · Built in 3 · Made by your
  team 1 · Just yours 0", "Made by Anyone", "Seen by Anyone", "Name A–Z", four rows without an Area column. Opening "Stock on
  hand" makes its Last opened "Today, hh:mm". As Chipo Dube (cashier): Reports shows "Every template 3", "Selling 2", "Customers
  1"; as Tendai Sibanda (stock clerk): Stock on hand and Empties owed by supplier; as the bookkeeper: 15 (no "Voids and refunds
  by cashier"); as the owner: 15 (Tafara's Just me template is not his).

### INS-08 · Run a template; save, make, change, share and delete templates · L

- **Builds**: `/retail/reports/[ref]` (5.12) on ListFrame with the template's query in the URL, the sub and sub link, "One row
  for each" in the Group menu, drill-down; sheets `template-save`, `template-new`, `template-edit`, `template-share` (5.15.1–4)
  and asks (5.16); `POST/PATCH/DELETE /api/v2/reports/templates` changes (4.4: name uniqueness, email on/off writing
  `ReportSend` rows, audit) and the bulk share/delete endpoints; `GET /api/v2/retail/reports/sources`; FND-07's `tags` reorder.
- **Tests**: `lib/reports/templates.test.ts` against the test database (save from the built-in Sales keeps `this-month` unless
  keep dates; a duplicate name → `fieldErrors.name`; a manager's Everyone template is listed for a cashier; deleting removes its
  use and send rows and no sale; the bookkeeper's POST → 403; Tafara's PATCH of Tendai's template → 403; the owner's → 200);
  `template-query.test.ts` (view/params ↔ query round trip, including `rows` and column order); sheet kind schema tests.
- **Acceptance**:
  - Seeded, as the owner, `/retail/reports/sales` beside `ReportSales.png`: "‹ Selling / Sales Built in · 1 to 3 October
    2026, every shop" (the dates of the run's month), "+ Save as a template", chips "Period This month · Shop Any · Cashier
    Anyone · Type Any", the eight columns, sale numbers `SALE-#####`, voided rows "Void · Voided", Σ count, discount and total
    equal to SQL, "1–50 of {n}". "Shop Harare Main Branch" changes the sub to "…, Harare Main Branch" and the Σ.
  - W-73: "+ Save as a template" beside `ReportSaveTemplate.png` (sub "Reports › Selling › Sales", name "Month to date, every
    shop", the read fields "Sale, Date, Shop, Cashier, Type, State, Discount, Total", "Any shop, any cashier, sales, refunds and
    voids", "Newest first", "Not grouped", "Moves with today · Keep 1 to 3 October" with the board's hint, "Just me", the toggle,
    the note) → "Save the template" → toast "Month to date, every shop is under Selling." → the page at its id; Every template
    shows it under Selling with "You" and "Just you"; Selling's badge 5.
  - W-74: "+ New template" beside `TemplateNew.png` (nine cards, Sales picked, the fields, the note) → pick "One row for each
    Shop", Period "Last weekend", columns "Shop, Sales, Cash, EcoCash, Card, On account, Taken", name "Weekend takings by shop,
    copy", Managers → "Make the template" → the run page in the `ReportWeekend` shape; "Open it without saving" instead opens
    `/retail/reports/sales?rows=site&…` with nothing saved.
  - `/retail/reports/<Weekend takings by shop>` beside `ReportWeekend.png`: "‹ Selling / Weekend takings by shop Tendai
    Mhlanga’s template · managers see it Change the template", "+ Save as a template", search "Shop", "Period Last weekend",
    "Shop Any", sort "Most taken", rows Harare Main Branch and Borrowdale (the seed has two shops; Open questions 9) with Sales,
    Cash, EcoCash, Card, On account, Taken, and the Σ row; a shop name drills into Sales for that shop and weekend.
  - W-75: "Change the template" beside `TemplateEdit.png` (title, "Made by Tendai Mhlanga on 14 September 2026 · opened {n}
    times", "Starts from Sales, under Selling" and its hint, "Seen by Managers", the toggle, "Delete the template", the note,
    "Save") → rename → "Weekend takings by shop saved."; "Delete the template" → `templatedelete` → gone from the catalogue; the
    sales count in SQL is unchanged. As Tafara the sub link is absent and `PATCH` answers 403; as the bookkeeper no "+ Save as a
    template".
  - Catalogue bulk: tick Weekend takings by shop and Sales → "Share" → Everyone → "1 template is seen by everyone now. 1 stayed
    as it was." (singular and plural forms throughout, **Defined here**); Sales (built in) is unchanged.

### INS-09 · Weekly report emails · M

- **Builds**: `runDueSends` for TEMPLATE subjects (recipients by audience and source read, rows as each recipient, PDF via
  `exportDocument` + `renderPdfFromHtml`, email with the attachment, one `RetailMessage` EMAIL per recipient, `lastRecipients`);
  the edit sheet's email hints and "Change the day"; `report-send` sheet (5.15.5); the catalogue's and run page's bulk "Email
  every Monday"; the row ⋯ email items; `seedReportSends()` (3.8).
- **Tests**: `lib/retail/sends/run-templates.test.ts` against the test database (a Managers template reaches the owner, the
  manager and the bookkeeper and not a cashier; a cashier recipient of an Everyone Sales template gets only their own sales in
  the PDF; a missing email → `lastError` and a notification to the maker; the PDF's Σ row equals the run page's).
- **Acceptance**: seeded, as the owner, the Weekend template's edit sheet matches `TemplateEdit.png` exactly including "Sent to 3
  managers. Last sent Monday at 07:00."; "Change the day" → Wed, 08:00 → Save → the toggle reads "Email it every Wednesday at
  08:00"; with the clock at that time `runDueSends` writes three EMAIL messages (Tendai Mhlanga, Tafara Nyathi, the
  bookkeeper) each with "Weekend takings by shop, 25 to 27 September.pdf"; the catalogue's bulk "Email every Monday" on Sales and
  Weekend takings by shop → "2 templates go out every Monday at 07:00." (one personal send for Sales, the template's own email
  for the Weekend one); the run page selection's "Email every Monday" opens "Email me every Monday" with "To" the owner's email.

---

## Open questions

1. **Everyone includes cashiers and stock clerks** (decision 7), so Reports appears for them when a template is theirs. W-69
   names owner, manager and bookkeeper as who runs reports, and FND 5.3.4 hid Reports from cashiers and stock clerks. The sheet
   hint "People only ever see the rows their own role lets them see" only means something if they can open templates.
2. **Managers includes the bookkeeper**, so the board's "Managers" built-ins (Takings by payment, Requisitions paid, Supplier
   spend, …) reach the person W-69 names. The label stays "Managers".
3. **Built-in count**: the board's tab "Built in 12" sits beside 13 built-in rows; counts are computed (13).
4. **Last opened**: the board mixes "Monday, 07:05" with "28 September 2026" for the same week and "2 October 2026" with
   "Yesterday, 17:40" for the same day; this spec uses Today/Yesterday words and full dates otherwise.
5. **Rufaro Ndlovu** is not on the People board (the setup spec raises the same for till pairing); seeded as an inactive manager
   (the board's "No access 2"). The admin spec's seed should agree.
6. **Owner's phone**: the People board and the insight boards say "+263 77 412 0098"; the buying seed gives "+263 77 100 2001".
   This spec seeds the People board's.
7. **"Jaggermeister 750ml"** is the boards' and the stock seed's spelling of Jägermeister; kept for screenshot parity.
8. **Bols Brandy 750ml** is on the dead-stock board but archived in the products seed, so it cannot list.
9. **Avondale** (the Weekend board's third shop) is created in the setup spec's acceptance, not seeded; the Weekend template shows
   two shops on a fresh seed.
10. **Plan row on Money**: drawn under "Due in the next 14 days" with a date 29 days away; shown only when it falls due within 14.
11. **"Filters 1"** on `ReportSales.png` has nothing behind it; the badge counts real filters.
12. **Two template interfaces**: the generic `/reports` keeps its catalogue and sheet for the other products over the same
    `ReportTemplate` model. Should the other products move onto ListFrame Reports later (one interface)?
13. **Sources without cards**: Supplier spend, Accounts owed and Empties owed by supplier read sources that are not among the nine
    "Starts from" cards; the card hint says "Every template reads one of these."
14. **"Email every Monday" on a run page's selection bar** acts on the whole report (5.15.5 says so); the board offers it as a
    bulk action.
15. **Prefill contracts** other specs must honour: `promotion-new` `productIds` (PRD-09), `stock-adjust` `why` (STK-04),
    `count-new` `categoryIds` (STK-05), the customers spec's `message` sheet `segment=lapsed-30` and its "Take a payment" sheet
    key (`customer-payment` assumed), `order-new` `supplierId` (BUY-02).
16. **Shelf price at the till**: `pos/sales` belongs to SET-06/FLR-09; INS-06 adds the `shelfPrice` write there.
17. **FND-09 draws "Export" and "Send me this"** in its acceptance; this spec asks FND-DASH to take them as optional props so
    INS-01 can ship without dead buttons until INS-05.
18. **Days of cover note**: "at this month’s sales" with 30 days selected (as the board) although the window is 30 days.
