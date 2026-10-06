# Custom reports

A custom report is a page of blocks that somebody builds. It is the report page
from `lib/reports/layout.ts` taken one step further. On a built-in report, every
block reads the same rows, those of the report itself. On a custom report, each
data block brings its own rows: a **query** over the report sources the person
can open. The block then shows its result as a table, a chart, headline figures
or a breakdown. Those are the same components a report's own page draws.

| Where | What |
| --- | --- |
| `/reports` | "New report" creates one; "Built here" lists the ones you can open |
| `/reports/<key>` → More → *Build a report from this one* | The report's page, rebuilt as a custom report you can change |
| `/reports/custom/<id>` | The report, read |
| `/reports/custom/<id>/edit` | The block editor |

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
      query     { name, title?, query, display, half }
        display table | chart (bars|trend, by, measure, limit) | figures | breakdown (by, limit)
```

Only the document is stored. **Rows are never stored.** Each time the report is
opened, every source it reads is fetched through `fetchReport`. That is the same
call, with the same checks, that a report's own page uses: the source's
feature, its roles, the campus grant and the workspace switching it off. So a
custom report can never show anybody a row they could not already see on that
report. A block that reads a source the reader cannot open says so ("There is
no source payroll-pay you can read"), and the rest of the page still draws.

Who can do what:

| | Maker | Manager | Anyone else |
| --- | --- | --- | --- |
| Private report | open, change, delete, share | — | — |
| Shared report | open, change, delete, unshare | open, change, delete | open, copy |

## Flow

```
editor / viewer
  │  GET /api/v2/reports/sources          the sources this person can read, with their columns
  │  checkBlocks(blocks, sources)         every query typed and checked, before any row is fetched
  │  POST /api/v2/reports/sources/rows    the rows of the sources the blocks read, once each
  │  runBlocks(...)                       every block run in the browser, blocks reading blocks in dependency order
  ▼
CustomBlockResult                         the result drawn as a report of its own (Leaf, ReportTable)
```

Checking and running are pure (`lib/reports/query`, `lib/reports/custom/run.ts`).
The editor runs them on every keystroke. Rows are only fetched again when a query
names a source the page has not loaded yet.

## The query language

A query is a pipeline. It starts with `from` and a source. Each step after that
changes the table the step before it produced. A step starts on its own line,
or after `|`.

```
-- Who is closing the most this quarter
from crm-deals
where status = "Won" and closes >= $from
aggregate won = sum(value), deals = count() by owner
sort won desc
take 10
```

The same query on one line:

```
from crm-deals | where status = "Won" | aggregate won = sum(value) by owner | sort won desc
```

### Steps

| Step | Does | Example |
| --- | --- | --- |
| `from <source>` | The rows of a report source, or another block's result | `from crm-deals`, `from @won` |
| `join <source> as <alias> on <a> = <alias>.<b>` | Adds another source's columns, matching rows on `=`. Rows that do not match are kept, with blanks | `join crm-projects as p on client = p.client` |
| `inner join …` | The same, but rows that do not match are dropped | |
| `where <condition>` | Keeps the rows that match | `where stage in ("Won", "Quoted")` |
| `derive <name> = <expr>, …` | Adds a column, or replaces one | `derive vat = value * 0.15` |
| `select <column or name = expr>, …` | Keeps only these columns, in this order | `select dealNo, client, value` |
| `drop <column>, …` | Leaves columns out | `drop phone, email` |
| `aggregate <name> = <total>, … [by <column or name = expr>, …]` | Totals the rows: into one row, or one row per group | `aggregate total = sum(value) by month = month(closes)` |
| `sort <expr> [asc\|desc], …` | Orders the rows. Blanks always go last | `sort total desc, owner` |
| `take <n>` | Keeps the first n rows | `take 20` |

### Values

- **Columns** by key (`value`), or by label in backticks (`` `Expected close` ``).
  After a join, the other source's columns are `alias.key` (`p.budget`).
- **Text** in `"double"` or `'single'` quotes. **Numbers** as `1200` or `0.15`.
  `true`, `false` and `null` are also values.
- **`$from` and `$to`**: the dates the report is open on.
- Operators: `+ - * / %`, `= != < <= > >=`, `and`, `or`, `not`, `in (…)`,
  `like "a%"` (`%` matches any run of characters and `_` matches one),
  `is null` and `is not null`.
- Text is compared without regard to case: `stage = "won"` matches "Won".
  A blank is not equal to any value, so `owner != "Rudo"` keeps the rows that
  have no owner.
- `+` joins text: `dealNo + " · " + client`. A date plus a number is a date that
  many days later. A date minus a date is the number of days between them.

### Totals

Totals are `count()`, `count(x)`, `count_distinct(x)`, `sum`, `avg`, `median`,
`min`, `max`, `first` and `last`.

In `aggregate`, each total is worked out over its group. Any other column has to
be one of the `by` columns: `aggregate total = sum(value) + value` is refused,
because `value` differs from row to row.

In `where`, `derive`, `select` and `sort`, a total covers the whole table. That
is how a share of the total is written:

```
from crm-deals
derive share = round(percent(value, sum(value)), 1)
where value > avg(value)
```

### Functions

| | |
| --- | --- |
| Numbers | `round(x, places?)`, `floor`, `ceil`, `abs`, `number(x)`, `percent(part, whole)` |
| Text | `lower`, `upper`, `trim`, `len`, `text(x)`, `concat(a, b, …)`, `substr(text, start, length?)`, `replace(text, find, with)`, `contains`, `starts_with`, `ends_with` |
| Dates | `day`, `week` (its Monday), `month` (its first day), `quarter`, `year`, `weekday`, `days_between(from, to)`, `add_days(date, n)`, `today()`, `date("2026-01-31")` |
| Choices | `if(condition, then, else?)`, `coalesce(a, b, …)` |

`week`, `month` and `quarter` return dates, so the result can be drawn as a trend:

```
from retail-sales
aggregate takings = sum(total) by month = month(date)
```

### Types

Every column has a kind: text, status, code, relation, email, phone, date,
number or money. A query is typed before it runs. A total of money is money in
the same currency. Money times a number is money, and money divided by money is
a plain number. A comparison is a yes or no. This is what lets a result draw
money as money, and a trend follow its dates.

### Blocks reading blocks

Every query block has a name, shown as `@name` beside its title. Another block
can read its result with `from @name` or `join @name as n on …`. Blocks run in
the order they depend on each other, whatever order they sit in on the page. A
block that ends up reading itself is refused.

### Limits

- A source returns at most 5,000 rows, the same limit a report has. Past it,
  the block says so: narrow the dates.
- A join stops at 50,000 rows. Past that, it is almost certainly matching on the
  wrong thing.
- A page holds up to 40 blocks, and a query up to 10,000 characters. A page can
  read up to 12 sources at once.

## Why a language, and not SQL

SQL was the obvious candidate. It was not used, for three reasons:

1. **Safety by construction.** The language can only reshape rows that a report
   source has already fetched, scoped to the workspace and checked against the
   reader's role. It has no way to name a table or reach the database. A SQL
   surface would need a second permission model for every table and column,
   and it would always be one bug away from crossing tenants.
2. **One engine everywhere.** The same pure code checks and runs a query in the
   browser, while it is typed, and anywhere else it is needed. The report system
   already works this way: the view that draws a table also writes its PDF.
3. **Steps read the way people think.** "Take the deals, keep the won ones,
   total them by owner" is the query, top to bottom. Each line can be checked
   on its own, so an error points at the line it is about, and autocomplete
   knows which columns exist at the cursor.

The pipeline shape follows PRQL and Kusto. The words follow SQL where they mean
the same thing, so someone who knows SQL can read a query on sight.

## Files

| | |
| --- | --- |
| `lib/reports/query/lexer.ts`, `parser.ts`, `ast.ts` | Text → steps |
| `lib/reports/query/compile.ts` | Steps → a checked, runnable query |
| `lib/reports/query/functions.ts` | What a query can call |
| `lib/reports/query/complete.ts` | What to suggest at the cursor |
| `lib/reports/custom/document.ts` | The stored document, starters, and a report's page as a document |
| `lib/reports/custom/run.ts` | A page's blocks, checked and run together |
| `lib/reports/custom/store.ts` | Storage and who can do what |
| `components/reports/custom/*` | Editor, viewer, block renderer, code editor |
