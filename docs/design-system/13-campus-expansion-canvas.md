# The campus expansion canvas

`design/campus/expansion/` draws the screens Phases 2 and 3 of
`docs/expansion-plan/corelith-campus-expansion-plan.md` propose, before any of
them is built. Read `09-campus-canvas-law.md` first — that is the law, and this
canvas is held to all of it except the shell, which it corrects.

```
design/campus/lib/expansion-kit.mjs     the kit — re-exports lib/kit.mjs's content primitives,
                                        replaces its shell, adds the collector
design/campus/screens/*.mjs             the screen definitions (the source)
design/campus/build-expansion.mjs       the generator
design/campus/expansion/*.dc.html       the artboards
design/campus/expansion/canvas.json     pages, layout, annotations
design/campus/spec/<Screen>.html        emitted
design/campus/checklist/<Screen>.json   emitted
```

Run `node design/campus/build-expansion.mjs`.

## The shell: one sidebar, not two

**This is the rule that changed.** The module canvas draws a 280px workspace
sidebar, then a 200px module rail, then the page. Two navigation columns before
any content. The platform's own rules do not allow it:

- `docs/ux/pr-71-reference-design-system.md` — the shell splits into *left
  navigation rail, main workspace, optional right detail rail*. Three regions,
  one of them navigation.
- `docs/ux/platform-ux-playbook.md` — a left vertical tab rail is for a
  **multi-table context inside a page**, where only the active panel may render
  a table. It is not a second navigation column.

So the module rail folds into the sidebar as collapsible groups. That returns
232px to every screen, which is most of a table column.

| Surface | For | Width | How many |
|---|---|---|---|
| **Sidebar** | Moving between destinations. Groups collapse; the one holding the active page is open | 248px | One, per window |
| **Vertical rail** | Choosing which table a page shows, where a page has several. Icons only | 56px | One, inside a page |
| **A second sidebar** | Nothing | — | **Never** |

`verticalRail(items, active)` exists in the kit for the second row of that
table. One artboard uses it — `expansion/ShellLaw.dc.html`, drawing the fee
ledger's six segments, which is the real case in this product.

### The sidebar, top to bottom

Campus work leads, grouped the way a school is organised; the rest of the
platform follows after a rule.

| Group | Rows |
|---|---|
| *(ungrouped)* | Home · Create · School Overview |
| **Campuses** | All campuses · Campus register · Group finance · Group billing |
| **Students** | All students · Admissions · Guardians · Roll up the year · Import records · Leavers · Alumni |
| **Fees** | Fees by year group · Ledger and structures · Receipts · Refunds · Waivers |
| **Classroom** | Teachers · Attendance · Cover |
| **Conduct** | Behaviour log · Merits and demerits · Detention |
| **Welfare** | Bed board · Health and welfare · Pastoral notes |
| **Teaching** | Timetable · Homework · Subject targets · Parent meetings |
| **Results** | Results overview · Result sheets · Moderation · Publishing · Exam series |
| **Services** | Library · Transport · Notices · Tuck shop |
| **Reports & Documents** | School reports · Documents |
| *(after a rule)* | Human Resources · Payroll · Finance · Reporting · Management → Academic setup, Portals |

**The words did not change; the grouping did.** Every campus label is the string
`lib/navigation.ts` already uses. A canvas does not rename a shipped destination
quietly.

Three moves are deliberate and each says something:

- **People became Classroom.** Guardians left for Students, where they belong to
  a pupil. What is left is who stands in front of a class, whether they are
  there, and who covers when they are not.
- **Boarding became Welfare, and Pastoral notes joined it.** A pastoral note is
  not a discipline record. Filing it under Conduct would have told every person
  who opened the menu that it was.
- **Public exams folded into Results.** A head looking for November's grades does
  not first decide whether they are internal or public.

**Academic setup and Portals sit under Management**, which is where the routes
already are — classes, subjects, years and identity live under
`/management/master-data/schools/` today. Setup is not daily work and should not
hold a group. Opening it lands on a settings shell with its own left settings
nav, which is the pattern the playbook names for exactly this.

### How a row is drawn

- Group label: uppercase 10px, `.09em` tracking, `C.subtle`, with a disclosure
  chevron. Sub-items indent against a 1px vertical hairline guide.
- Row: 28px, 14px glyph, 12.5px label, `C.mid`.
- **Active: a white pill** — `C.surface`, 1px `C.border`, a barely-there shadow,
  and a 2px `C.brand` bar on the leading edge. Not a saturated brand fill; the
  sidebar sits on the page ground and the active row is the thing lifted off it.
- A proposed destination carries a 7px hollow brand ring on its right edge.

## How a page is composed

Six rules. They cost most screens a column, and they are the ones a review will check
first.

### 1. Cards are spent, not stamped

A border, a fill and a radius each say "separate object", and three of them on every block
flattens the hierarchy they were meant to build. **The default container is
`section({title, note}, children)`** — a heading on a hairline, no box. `card()` is for the
one thing on a page that genuinely floats.

A screen should carry **zero or one** cards. Four cards means three sections.

### 2. A heading is a heading

No explanatory line after it. A `note` carries state — a count, a date, a total — never an
explanation.

| | |
|---|---|
| ✗ | `section({title: 'What moves with him', note: 'this is a transfer, not an exit and a re-admission'})` |
| ✓ | `section({title: 'What moves, what stays', note: '12 lines · $580.00 owed today'})` |

What a section is *for* belongs in the canvas annotations beside the artboard, never on it.

### 3. A row is its data

No sentence under a list item. If the detail matters it is a column; if it is not worth a
column it is not worth drawing. A two-line cell is still right where the second line is
**data** — a student number under a name, a term under an invoice number. It is prose that
goes.

### 4. Forms live in dialogs

A page shows state. **Pressing a value opens the editor** — the playbook's own rule for
record pages. Use `properties(rows, {cols})` at the head of the page for what has been
chosen; values draw with a dashed underline, which is the affordance. No stack of `field()`
on the page beside the thing it changes.

Where the dialog is the screen's whole point, draw it as the artboard's `overlay`.

### 5. The design does not talk to the reader

Every sentence that explains the design, justifies a decision, or narrates what will happen
comes off the artboard. "Nothing is written until you press Move to Marondera" is the
designer explaining themselves.

**Refusals and errors stay** — they say what happened and what to do, which is the reader's
business. One line where possible.

### 6. Group by the question, not by the component

What moves, what stays and what it comes to are one question asked about twelve things, so
they are one table — two group headers and a total — not two lists and a third box holding
the arithmetic. `table()` takes group and total rows for exactly this:

```js
rows: [
  { group: 'Moves with him' },
  ['BOR-INV-00408', 'Term 2 · boarding', badge('Moves', 'brand'), money('380.00')],
  { group: 'Stays at Borrowdale' },
  ['BOR-INV-00388', 'Term 1 · fiscalised 14 May', badge('Cannot move', 'bad'), money('155.00')],
  { total: [txt('Owed at Borrowdale today'), txt('$380.00 moves · $200.00 stays'), '', mono('$580.00')] },
]
```

Before drawing two things, ask whether they are two answers to one question.

### The worked example

`StudentTransfer` in `design/campus/screens/group.mjs`. It carried two columns holding two
prose lists, a five-field form and a balance box. It now carries a five-row property block,
a one-line refusal, and one grouped table with a total. Zero cards, one column.

## Two more rules the expansion adds

### The campus in scope lives in the sidebar header

Not the app bar, and not the band. The app bar carries the page's only name
(§1); the band carries the state that changes *on this page* (§2). The campus in
scope is neither: it belongs to the whole workspace, it survives navigation, and
the sidebar header has carried a caret beside the school's name since the first
artboard was drawn.

```js
scope: { group: 'Chishawasha Trust', campus: 'Borrowdale campus' }
```

- **Omit `scope`** and the header shows the school's name alone. That is every
  tenant today, and the S-11.1 backfill gives each of them one campus without
  telling them so.
- **A named campus** draws a green mark. The scope is narrowed.
- **`campus: 'All campuses'`** draws a brand mark, not green — because it is a
  destination somebody chose, not a filter they forgot to set. That difference
  matters on the day a debt is written off.

### Campus is navigation, not a filter

The rule `S-4.6` set for year groups, for the same reason.

- A campus's list is reached **through** the campus:
  `/schools/campuses/[campusId]/students`, not `/schools/students?campus=…`.
- With **All campuses** in scope, creating anything and moving any money is
  **refused, not absent**. Draw the refusal with its sentence: a record has to
  belong to a campus, and a write-off happens where the debt is.

## Declaring a screen

```js
import { C, I, page, grid, card, table, stat, txt, mono, badge, tinyBtn,
         filterSelect, searchField, ghostBtn, defineScreen } from '../lib/expansion-kit.mjs'

export const Conduct = defineScreen(
  {
    screen: 'Conduct',                    // PascalCase; names the spec and checklist files
    route: '/schools/conduct',            // the route this drawing is a promise about
    story: 'S-12.1',                      // the proposed ledger ID
    title: 'Behaviour',                   // the app bar's only name
    caption: 'Term 2 &middot; 7 open',    // only if it carries something that changes
    railItem: 'Behaviour log',            // an exact sidebar label, or it throws
    action: { label: 'Log an incident', icon: I.plus },
    search: 'Search the behaviour log',
    scope: { group: 'Chishawasha Trust', campus: 'Borrowdale campus' },
    user: { name: 'Rudo Makoni', role: 'Deputy Head' },
    chips: [{ label: 'Home not told', value: '4', tone: 'bad' }],
    bandActions: [ghostBtn('Export', I.download)],
  },
  () => page(`…`),
)
```

`railItem` keeps its name from the module kit so a screen reads the same on both
canvases; `navItem` is accepted as an alias. Passing a label the sidebar does not
carry throws, rather than silently drawing a sidebar with nothing selected.

## The contract is emitted, not maintained

The module canvas keeps `checklist/<Screen>.json` beside the drawing, by hand.
This canvas emits it.

`expansion-kit.mjs` wraps six primitives — `table`, `card`, `stat`,
`filterSelect`, `tinyBtn`, `segments` — so each files what it drew into the
screen being rendered. `defineScreen` adds the band chips and the primary action,
then sweeps every text node out of the finished content for `allCopy`. Adding a
column to an artboard adds it to the contract in the same keystroke.

**This is why hand-rolled markup is a bug here.** A table built out of raw
`<div>`s renders identically and is invisible to the contract, so
`campus-conformance.mjs` will never ask whether anybody implemented its columns.
Compose local helpers freely for what the kit has no primitive for — a seat grid,
a cover matrix, a certificate preview — but anything that *is* a table, a card, a
stat, a filter or a row verb goes through the kit.

## Every expansion screen reports under NO PAGE, and should

```bash
node scripts/campus-conformance.mjs
```

The routes are registered in that script's `SCREENS` map, so each expansion
screen lands in:

```
  NO PAGE — the canvas draws it, nothing renders it
```

That is the right status for a proposal, and **that list is the build queue.** It
costs nothing to keep accurate, because building the route is what removes the
row. Coverage percentages for the shipped module are unaffected: a screen enters
the coverage table only once its page file exists.

## When a screen ships

1. Build the route and its content component, to `10-campus-screen-contract.md`.
   `checklist/<Screen>.json` is the contract; match the copy.
2. Run `node scripts/campus-conformance.mjs <Screen>` — it moves from NO PAGE
   into the coverage table on its own. Nothing needs editing to make that happen.
3. Take the ring off: drop the `NEW` flag on that row in `NAV`, in
   `lib/expansion-kit.mjs`, and add the destination to `lib/navigation.ts`.
4. Move the artboard from `expansion/` to the matching module page, and its row
   from `build-expansion.mjs` to `build-module.mjs`.

Steps 3 and 4 are the whole point of the ring: exactly one place says "this is a
drawing", and it stops saying it when the drawing stops being one.

## Known divergence: the module canvas still draws two sidebars

`lib/kit.mjs` `adminArtboard()` composes `sidebar()` + `rail()`, and seven of the
module artboards (Main, Overview, Students, StudentRecord, Attendance, Results,
Fees) are kept on disk from the published canvas rather than regenerated, with
the two-sidebar shell baked into their markup.

So fixing the shell there is not a one-line change to `adminArtboard`: it would
leave seven hand-made artboards disagreeing with fifty-five generated ones. The
work is (a) lift `NAV` and `moduleNav` into a shared `lib/nav.mjs` both kits
import, (b) point `adminArtboard` at it, (c) redraw those seven by hand.

Until that happens the two canvases disagree about the shell, deliberately, and
this file is the record of which one is right.
