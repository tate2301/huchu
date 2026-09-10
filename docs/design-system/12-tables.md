# Tables

**The CRM record table is the standard.** `components/records/record-table.tsx`.

Every list of records in this product should look like `/crm/companies` and
`/crm/leads` do. Where it does not, that is a defect with a fix, not a house
style for that module.

---

## Why that one

It was picked by looking at screenshots of every vertical side by side. The CRM
tables were the only ones you could read at a glance, and the difference is not
decoration — four decisions do the work.

### 1. A cell is drawn to what the value *is*, not to which column it landed in

`recordCellTone()` in `record-table.tsx` is the only place this is decided:

| Kind | Treatment | Why |
|---|---|---|
| `email`, `relation` | `--brand-strong` | Both are a promise that something is elsewhere. Same ink as the info badge, so a table of tinted values and a table of badges agree instead of being two colour schemes stacked. |
| `phone`, `code`, `date` | mono, `tabular-nums` | Compared, not read. Mono is what lets the eye run down a column and catch the one that differs by a digit. |
| `money` | mono, `tabular-nums`, medium, `--text-strong` | The figure the row is *about*. |
| `number` | mono, `tabular-nums`, body | A count beside money is not the point of the row. |
| `text` | body | Prose. |

One resolver, not a `cn()` per column definition. Four lists writing "which grey
is a phone number" four times is four lists that will eventually answer
differently — which is exactly what happened across schools, gold and
accounting.

### 2. Nothing is ever blank

An empty cell reads as a table that failed to load. An em-dash in the faintest
ink reads as *there is nothing here*, which is a fact worth having. `RecordCell`
does this for you.

### 3. Figures hang off the right edge

`recordCellAlign()` returns `end` for `money` and `number`, `start` for
everything else. Digits that do not line up cannot be scanned, and a column of
right-aligned prose is just as bad.

### 4. The first column carries the identity, and only it is clickable

`RecordTableName` stacks a leading mark, the name, and the record number
underneath. The rest of the row is inert on purpose: a row that is one big link
cannot hold an email you want to click or a number you want to select.

### And below `md`, it stops being a table

Seven columns at 390px is a sideways scroll showing one and a half of them —
that is not a table, it is a table you have to operate. `RecordTable` takes a
`mobile` prop and renders the module's own row list instead.

---

## Which component to reach for

They are not interchangeable and the choice is about what the screen *is*.

**`RecordTable`** — a list of records a person browses, opens and acts on.
Companies, leads, deals, students, employees, pours. Presentational: you bring
the rows, the columns and a `rowHref`.

**`DataTable`** (`components/ui/data-table.tsx`) — a worksheet. Server-side
pagination and query state, column visibility, export, expandable rows, bulk
selection, inline editing. Reach for it when the screen genuinely needs those;
they are real features and `RecordTable` does not have them.

The mistake to avoid is reading this as "68 files must become `RecordTable`".
Most of the 68 do not need a worksheet either — they picked `DataTable` because
it was the one that existed. Migrate a screen when it is a record list; leave it
when it is a worksheet.

**Either way the cells follow the standard.** `recordCellTone`,
`recordCellAlign` and `RecordCell` are exported from `record-table.tsx` and work
inside a `DataTable` column definition. A worksheet is not an excuse for a
different colour scheme.

---

## Migrating a list

1. Columns become `RecordTableColumn<T>[]`: `{ id, label, icon?, width?, align?, cell }`.
2. Every `cell` returns a `RecordCell` with the right `kind`. Resist styling
   inside the cell — if a value needs a treatment the standard has not got, add
   the kind to `recordCellTone` so every table gets it.
3. First column: `RecordTableName` with the record's mark and number.
4. Pass `rowHref`. Do not wrap the row in a link yourself.
5. Pass `mobile` — the module's existing row list, not a squeezed table.
6. States are `Badge` or `StatusChip` with a tone from `lib/crm/tones.ts`. A
   state is a judgement and wants a filled shape; the plain values either side
   of it are what `RecordCell` handles.

## Migrating a worksheet

Keep `DataTable`. Replace the cell rendering with `RecordCell` and set
`recordCellAlign` on the column. That is most of the visible difference.

---

## Progress

| Area | Component | State |
|---|---|---|
| CRM — companies, leads, deals, people, sites, work orders | `RecordTable` | Standard |
| People directory | `RecordTable` | Standard |
| Schools — students, teachers, guardians, results, boarding, attendance | `DataTable` | Row verbs on the standard (22 tables); cells still to migrate |
| Gold — pours, dispatches, receipts, prices, exceptions | `DataTable` | **To migrate** |
| HR — people | `DataTable` | Columns and verbs on the standard; cells still to migrate |
| Accounting — journals, receivables, payables, trial balance | `DataTable` | Worksheets; adopt `RecordCell` |
| Retail — catalogue, stock, purchase orders | `DataTable` | Mixed; assess per screen |

Update this table as screens move.

---

## What went wrong, and what it actually was

Three things, found by comparing screenshots and then **measuring** rather than
eyeballing — which changed the diagnosis on all three.

### Too many columns, not a broken scroll

| Screen | Columns | Table | Space | |
|---|---|---|---|---|
| `/crm/companies` | 7 | fits | 1129px | the standard |
| `/schools/students` | 9 | 1145px | 1129px | 16px over |
| `/people` | 13 | **1944px** | 923px | half off-screen |

`overflow-x: auto` was working the whole time. This was never a CSS bug: it was
column count and three inline text buttons per row. Fixed by:

- `RecordActions` gained `layout="menu"`, and the 22 school tables that render
  it in a cell now use it. `/schools/students` went 1145px → **1129px**, an
  exact fit.
- `DataTable` gained `initialColumnVisibility`, and `/people` folds six
  record-detail columns away — still one click from the Columns menu.
  1944px → **923px**, an exact fit.
- `/people` row verbs became one `⋯` menu instead of two icon buttons, taking
  the actions column from 108px to 56px.

**The rule:** a list shows what you scan by. Everything else belongs on the
record and in the Columns menu. If a row needs more than one trailing control,
it needs a menu.

### The toolbar was clipped by its own bleed

"Columns" rendered as "olumns" on `/schools/students`. Measured: the button sat
at x=310 while its ancestor `section.card` clips at x=325 with
`overflow-x: clip` — fifteen pixels, exactly the "C".

`.table-edge-to-edge` widens by `--content-gutter-x` and pulls the same back as
negative margin. On a table that is right, because the bled-out strip is empty
and only the hairline needs the extra width. On a *toolbar* it is not, because
the first control sits hard against that edge — and inside a card there is no
gutter to bleed into, so it is clipped instead.

`.band-shell` in `app/globals.css` already solved this: widen, pull back, then
restore the gutter as padding. `app/globals.css` now does the same for
`.dt-toolbar.table-edge-to-edge`. The button moved to x=326.

### `table-scroll` — a finding that was wrong

Recorded here on 2026-09-02 as "applied in `components/ui/table.tsx`, defined
nowhere". That was wrong, and the mistake is worth keeping rather than deleting.

`.table-scroll` is defined in the design system —
`node_modules/@corelithzw/react/dist/styles.css` — and loaded by
`app/globals.css:50` via `@import "@corelithzw/react/styles.css"
layer(corelith)`. It sets `overflow-x: auto`, `min-width: 0`,
`-webkit-overflow-scrolling: touch` and `overscroll-behavior-x: contain`, plus
a sticky-first-column variant and a `.capped` max-height. The comments in
`components/ui/table.tsx` and `components/ui/table-rail.tsx` say exactly this
and were correct all along.

The error was the search, not the reading: I grepped `app/globals.css` and
`styles/` and concluded from two misses that the class did not exist anywhere.
A class can come from a package. "I could not find it" and "it is not there"
are different claims, and only the first one was earned.
