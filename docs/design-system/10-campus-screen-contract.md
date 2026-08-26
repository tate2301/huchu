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
├─ page band (sticky) ─────────────────────────────────────┤
│  [chip] [chip] [chip]              Export   Print        │   PageBand
├──────────────────────────────────────────────────────────┤
│  [tabs]  [search]  [filters]                  [actions]  │   TableControls
│  ┌────────────────────────────────────────────────────┐  │
│  │ table                                              │  │   DataTable
```

- **Primary action → app bar**, via `PageChrome`. One per screen.
- **Band → state chips**, via `PageBand`. Numbers that change. Never the page's
  own name.
- **Tabs, search, filters → one row above the table**, via `TableControls`.
- **Row actions → in the row**, via `RecordActions`.

## The primitives

| Need | Use | Where |
|---|---|---|
| App-bar title + primary action | `PageChrome` | `@/components/layout/page-chrome` |
| State chips | `PageBand`, `BandChip` | `@/components/schools/common/page-band` |
| Table's control row | `TableControls`, `TableSearch` | `@/components/schools/common/table-controls` |
| Filter by class/stream | `ClassFilter`, `classFilterParams` | `@/components/schools/common/class-filter` |
| Any other filter | `FilterSelect`, `FilterBar` | `@/components/schools/common/filter-select` |
| Which class, as a route | `GradePicker` | `@/components/schools/common/grade-picker` |
| The table | `DataTable` | `@/components/ui/data-table` |
| Row verbs | `RecordActions` | `@/components/schools/common/record-actions` |
| Loading / empty / error | `TableRowsSkeleton`, `NothingYet`, `NothingMatched`, `LoadError`, `SaveError` | `@/components/schools/common/states` |
| Person initials | `PersonAvatar` | `@/components/schools/common/person-avatar` |

**Never invent a spinner, an empty state or a filter control.** They exist.

## The exemplar

`components/schools/attendance/register-oversight-content.tsx`. It composes
PageBand + FilterBar + DataTable + states correctly and its comments explain
why the screen is built from the class ladder outward. Read it before starting.

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

## Checks before you call it done

```bash
npx tsc --noEmit -p tsconfig.json          # must be clean
npx eslint <the files you touched>          # zero new errors
node scripts/campus-conformance.mjs <Screen>  # coverage should climb
```
