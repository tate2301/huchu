# Custom reports

A custom report is a page of blocks that somebody builds. It takes the report
page from `lib/reports/layout.ts` one step further. On a built-in report every
block reads the same rows, the report's own. On a custom report each data block
brings its own rows: a **SQL query** over the reports the person can open.
Each query block then shows its result as a table, a chart, headline figures or a
breakdown, drawn by the same components a report's own page uses.

| Where | What |
| --- | --- |
| `/reports` | "New report" creates one; "Built here" lists the ones you can open |
| `/reports/<key>` → More → *Build a report from this one* | The report's page, rebuilt as a custom report you can change |
| `/reports/custom/<id>` | The report, read |
| `/reports/custom/<id>/edit` | The block editor |

## Steps, or SQL

A query block opens as **steps** when its query can be said as steps: *from* a
table, *keep* the rows that match, *total* them (count, sum, average, lowest,
highest), *by* something (a date by week, month or year), *sort*, and how
many to show. Each pick rewrites the SQL, which is shown under the steps.
Switch to **SQL** to take it further by hand.

The SQL is the only thing stored. `lib/reports/sql/steps.ts` writes it from
steps, and reads SQL back as steps when it has their shape — one table, `and`ed
comparisons, named totals, a grouping that matches the columns. A query that
says more (a join, a subquery, a `case`) is not shown as steps; it stays SQL,
as it was written. Values a person types are written as quoted literals, never
spliced in, and the guard below checks what steps write like anything else.

## What the forms collect

Two sources read what site-visit forms collected, so a report can follow the
tape measure to the signed quote:

| Table | One row per |
| --- | --- |
| `crm_visit_forms` | Form filled in on a visit: what it measured (`measured`, m²), the quote its answers drafted (`drafted`) and the deal's outcome |
| `crm_visit_answers` | Answer given on site, as it reads (`answer`) and its figure where it measured something (`figure`) |

```sql
-- Square metres measured and quoted, by month
select cast(date_trunc('month', visited) as date) as month,
  sum(measured) as measured,
  sum(drafted) as quoted,
  count(*) filter (where outcome = 'Won') as won
from crm_visit_forms
group by 1
order by 1
```

## Writing a query

Every report you can open is a table. Its name is the report's key written the
way Postgres reads an unquoted name: `crm-deals` is `crm_deals`, and the column
`dealNo` is `deal_no`. The editor suggests the tables, their columns and the
functions as you type. The sources list beside the page shows every table and
column, and clicking a name copies it.

Queries are Postgres SQL. One block runs one `select` (or `with … select`):

```sql
-- Who is closing the most this quarter
select owner, sum(value) as won, count(*) as deals
from crm_deals
where status = 'Won' and closes >= period_start()
group by owner
order by won desc
limit 10
```

The dates the report is open on are `period_start()` and `period_end()`. Either
one is null when its end of the range is open.

Totals by month, for a trend:

```sql
select date_trunc('month', date)::date as month, sum(revenue) as takings
from retail_items_sold
group by 1
order by 1
```

A share of the whole, with a window:

```sql
select deal_no, value,
  round(100 * value / nullif(sum(value) over (), 0), 1) as share
from crm_deals
where value > 0
order by value desc
```

Joining two reports, matched on the customer:

```sql
select d.client, count(*) as deals, sum(d.value) as value, max(p.budget) as budget
from crm_deals d
left join crm_projects p on p.client = d.client
group by d.client
```

### Blocks reading blocks

Every query block has a name, shown as `@name` beside its title. Other blocks
can read its result as a table by that name, `select * from won`. Blocks run in
the order they read each other, whatever order they sit in on the page. A block
that ends up reading itself is refused, and so is one named like a source.

### Types

A result's columns are typed the way the report types them. A column passed
through keeps its label and kind. A `sum`, `avg`, `min`, `max`, `round` or
`coalesce` of money is still money, in the same currency. `count` is a number.
Anything else takes the type Postgres gives it: numbers are numbers, dates are
dates, and everything else is text. This is what lets a result draw money as
money and lets a trend follow its dates.

## What keeps a query safe

A query runs only after four checks, and each one stands even if the one before
it fails.

1. **The guard** (`lib/reports/sql/guard.ts`) reads the query with
   [node-sql-parser](https://github.com/taozhi8833998/node-sql-parser) in its
   Postgres dialect. It refuses anything that is not exactly one `select`,
   anything that reads a table other than the report's sources and its other
   blocks (so no `pg_catalog`, no `information_schema`), `select … into`,
   `for update`, and every function not on its list (`SQL_FUNCTIONS`). The
   list holds aggregates, windows, numbers, text and dates. It has nothing
   that reads a file, changes a setting, sleeps or runs a query of its own. The
   editor runs the guard as you type and underlines what it refuses.
2. **Where it runs** (`lib/reports/sql/engine.ts`): an in-memory Postgres,
   [PGlite](https://pglite.dev), in the browser's own worker. It holds only the
   rows its reader was already sent through `fetchReport`, the same call and
   checks a report's own page uses: the source's feature, its roles, the campus
   grant and the workspace switching it off. It cannot reach the real database
   or the network. A custom report can never show a row its reader could not
   already see on the report itself.
3. **The role it runs as.** Inside PGlite, each query runs in a read-only
   transaction under `report_reader`, a role that may only read the report
   tables. It cannot write, read files or create anything, even if something
   got past the guard. The tests run hostile queries past the guard to prove
   it.
4. **Limits** (`lib/reports/sql/client.ts`). A query gets ten seconds. Past
   that, the worker is ended, which is the only way to stop WebAssembly
   mid-query, and the next query starts a fresh one. A result stops at 50,000
   rows, and each source at the 5,000 rows a report returns.

The report's dates reach Postgres through `period_start()` and `period_end()`.
These are defined from checked dates (`YYYY-MM-DD`) only, so nothing a person
types is pasted into SQL.

## Model

```
CustomReport (one row per report)
  title, description
  shared        false: only its maker can open it. true: everyone in the workspace can.
  document      CustomDocument (lib/reports/custom/document.ts)
    period      the dates it opens on: { from, to }, each a date default or null
    blocks[]
      heading   { text, level, half }
      text      { text, half }
      query     { name, title?, query (SQL), display, half }
        display table | chart (bars|trend, by, measure, limit) | figures | breakdown (by, limit)
```

Only the document is stored. **Rows are never stored.** They are fetched each
time the report is opened.

| | Maker | Manager | Anyone else |
| --- | --- | --- | --- |
| Private report | open, change, delete, share | — | — |
| Shared report | open, change, delete, unshare | open, change, delete | open, copy |

## Flow

```
editor / viewer
  │  GET /api/v2/reports/sources          the reports this person can read, with their columns
  │  checkBlocks(blocks, tables)          every query parsed and guarded, before any row is fetched
  │  POST /api/v2/reports/sources/rows    the rows of the tables the blocks read, once each
  │  runBlocks(...)                       each block run in the tab's report database, in dependency order
  ▼
CustomBlockResult                         the result drawn as a report of its own (Leaf, ReportTable)
```

## Files

| | |
| --- | --- |
| `lib/reports/sql/schema.ts` | Sources as tables: names, column types, rows |
| `lib/reports/sql/guard.ts` | What a query may be |
| `lib/reports/sql/engine.ts` | Running a query in PGlite under the reader role |
| `lib/reports/sql/worker.ts`, `client.ts` | The worker the database lives in, and the page's side of it |
| `lib/reports/sql/columns.ts` | Typing a result's columns |
| `lib/reports/sql/completion.ts` | What the editor suggests |
| `lib/reports/sql/steps.ts` | Steps written as SQL, and SQL read back as steps |
| `lib/reports/custom/run.ts` | A page's blocks, checked and run together |
| `lib/reports/custom/document.ts`, `store.ts` | The stored document, and who can do what |
| `components/reports/custom/*` | Editor, viewer, block renderer, code editor, steps |
