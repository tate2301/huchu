# Building a campus admin screen

The contract every campus screen is built to. Read
`docs/design-system/09-campus-canvas-law.md` first — that is the law; this is
how it is applied in this codebase.

## Before you write anything

1. Read the spec: `design/campus/checklist/<Screen>.json`. It lists the exact
   filters, columns, cards, stats, band chips and buttons — and `allCopy`, every
   string on the artboard. **This is the contract. Match the copy.**
2. Look at the rendered screen: `design/campus/spec/<Screen>.html`.
3. Check the API exists: `app/api/v2/schools/**`. Nearly all of them do.
4. Run `node scripts/campus-conformance.mjs <Screen>` to see what is missing.

## The shape of a screen

```
app/schools/<thing>/page.tsx          server: auth guard + <ThingContent />
components/schools/<area>/<thing>-content.tsx    client: the screen
```

The page file is thin. It checks the session, redirects to `/login`, and renders
the content component inside `<div className="mx-auto w-full max-w-7xl space-y-6">`.
Everything else is the content component's job.

## Where things go

```
┌─ app bar ────────────────────────────────────────────────┐
│  Title            ⌘K search        [ PRIMARY ACTION ]    │   PageChrome
├──────────────────────────────────────────────────────────┤
│  [tabs]                                                  │ ┐
│  ────────────────────────────────────────────────────    │ ├ TableControls
│  [layout] [search] [filters]           50 of 214  [···]  │ ┘
│  table — flush, no card                                  │   DataTable
```

- **Primary action → app bar**, via `PageChrome`. One per screen.
- **Tabs → their own row**; **search and filters → the row below**. Both are
  `TableControls`; pass `tabs` and it stacks them.
- **No summary band.** Totals live on the module overview, not over a table.
  See `09-campus-canvas-law.md` §2.
- **No card around the table.** The table is the page. §5.
- **Row actions → in the row**, via `RecordActions`.

## One page, one thing

A screen is about one subject. If the page is called Allocations, every table
on it is allocations. A second table with a different subject — the gate book
under the bed list, leave under allocations — is a second page wearing the
first one's name, and it leaves the filters governing half the screen.

When two subjects are genuinely one click apart, that is what the **tab row**
is for. Boarding: Allocations · Hostels · Leave and outings.

## The primitives

| Need | Use | Where |
|---|---|---|
| App-bar title + primary action | `PageChrome` | `@/components/layout/page-chrome` |
| Tabs + search + filters | `TableControls`, `TableSearch` | `@/components/records/table-controls` |
| A verb's icon | `ActionIcon`, `ACTION_ICON` | `@/lib/schools/action-icons` |
| Filter by class/stream | `ClassFilter`, `classFilterParams` | `@/components/schools/common/class-filter` |
| Any other filter | `FilterSelect`, `FilterBar` | `@/components/schools/common/filter-select` |
| Which class, as a route | `GradePicker` | `@/components/schools/common/grade-picker` |
| The table | `DataTable` | `@/components/ui/data-table` |
| Row verbs | `RecordActions` | `@/components/schools/common/record-actions` |
| Loading / empty / error | `TableRowsSkeleton`, `CardsSkeleton`, `StatsSkeleton`, `SavingOverlay`, `NothingYet`, `NothingMatched`, `NothingLeftToDo`, `LoadError`, `SaveError` | `@/components/records/states` |
| Person initials | `PersonAvatar` | `@/components/schools/common/person-avatar` |
| State chips — **overview dashboards only** | `PageBand`, `BandChip` | `@/components/schools/common/page-band` |

Every table and every list gets a designed skeleton — one that mirrors the row
it is about to become, header and all. Never a spinner, never a bare "Loading…".
The full rules, and the three different sentences the three empty states say,
are in `11-campus-states-and-motion.md`. `node scripts/campus-states-audit.mjs
--gaps` tells you which screens are still short.

**Never invent a spinner, an empty state or a filter control.** They exist.

## Icons belong to the verb, not to the screen

A verb's mark is decided once, in `lib/schools/action-icons.tsx`, keyed by
`SchoolAction`. Do **not** pass an icon to `RecordActions` or `CreateButton`
per call site — `Edit` being a pencil on the roll and a gear on the ledger is
the thing that map exists to prevent, and it costs the reader the row.

Every `RecordVerb` already declares an `action`, so a verb gets its icon for
free. Adding a value to the `SchoolAction` union without adding it to
`ACTION_ICON` is a compile error, which is deliberate: somebody has to decide
what a new verb looks like.

**Icon and label, never icon alone.** `05-rules.md` requires colour + icon +
text for state, and the same holds for a verb. The mark makes a familiar row
scannable; it does not make an unfamiliar one readable, and a menu of bare
glyphs is a menu you have to hover to use. The only icon-only control in the
module is the `⋯` menu trigger, which carries an `aria-label`.

## The exemplar

`components/schools/boarding/boarding-allocations-content.tsx`. One subject, a
tab row over a filter row, a flush table and no band — and its comments explain
why the gate book that used to sit under it is now its own page.

For the table cells themselves, `/crm/people` remains the standard; see
`12-tables.md`.

## CRUD is not optional

A screen that lists things must let somebody create, edit and delete them.
"View-only for now" is not a deliverable. For each entity:

- **Create** — primary action in the app bar, opens a dialog or sheet.
- **Edit** — row action, same dialog seeded with the record.
- **Delete** — row action, with a confirm that names what is being deleted and
  says what else it affects.
- Every mutation invalidates its query keys and surfaces `SaveError` on failure.

Dialogs live beside their content component and are named `<thing>-form-dialog.tsx`
or `<thing>-form-sheet.tsx`. A sheet for anything with more than about six
fields; a dialog otherwise.

## Data

- Fetch with `useQuery` from `@tanstack/react-query`, via `fetchJson` from
  `@/lib/api-client`.
- Mutate with `useMutation` + `queryClient.invalidateQueries`.
- Typed helpers live in `lib/schools/*-v2.ts`. Add to those rather than
  inlining a fetch in a component.
- Query keys are `["schools", <area>, ...]`.

## Filter by class

Most screens need it. Use `ClassFilter` when the whole-school view is worth
seeing; use `GradePicker` as a route only when the unnarrowed list is ruinous
to load. When in doubt, the filter — an administrator asking "who has not paid?"
wants the school, then Form 3, then the school again.

## Copy

Take it from the checklist verbatim. The canvas's voice is plain and specific:
"Roll up the year", "Free the bed", "Take it back", "Remind the 188". Not
"Manage allocations" or "Submit". If you are inventing a screen the canvas does
not draw, match that register.

**Say pupil, not student.** The admin dashboard speaks the language of a
Zimbabwean school office. The full vocabulary — and the rule that identifiers
(`studentNo`, `/api/v2/schools/students`, the `schools.students` grant) are
deliberately left alone — is `docs/ux/schools-vocabulary.md`. Check with
`node scripts/campus-copy-audit.mjs`.

## Checks before you call it done

```bash
npx tsc --noEmit -p tsconfig.json          # must be clean
npx eslint <the files you touched>          # zero new errors
node scripts/campus-conformance.mjs <Screen>  # coverage should climb
```
