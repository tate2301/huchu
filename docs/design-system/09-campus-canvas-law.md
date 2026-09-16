# Campus canvas — the layout law

The campus admin screens are drawn on a canvas that lives in `design/campus/`.
This file is the short version of the rules those artboards are held to. Read it
before touching anything under `app/schools/**` or `components/schools/**`.

The canvas is generated, not hand-drawn:

- `design/campus/screens/*.mjs` — the screen definitions (the source)
- `design/campus/lib/kit.mjs` — the shared primitives every screen is built from
- `design/campus/build-*.mjs` — generators that emit `*/**.dc.html` + `canvas.json`
- `design/campus/checklist/<Screen>.json` — a machine-readable spec per screen:
  every filter, column, card, stat, band chip, button and string on it
- `design/campus/spec/<Screen>.html` — the rendered screen

When implementing a screen, `checklist/<Screen>.json` is the contract. It lists
the exact copy. Match it.

## 1. A page does one thing

Semantically, not atomically. "Allocations" is one thing; so is "the gate book";
so is "the fee ledger". A page is allowed as many controls, dialogs and row
verbs as that one thing needs — what it is not allowed is a *second subject*.

The test is the page's own name. If the screen is called Allocations and there
is a table on it that is not allocations, that table is on the wrong page. It
had a reason — it always does, usually "the warden is one question away from
it" — and the reason is how a screen ends up with filters that govern half of
it and a row count that counts half of it.

The answer to "they are one question away from it" is a **tab**, not a second
table. Boarding is the worked example: Allocations, Hostels, Leave and outings
are three pages behind one tab strip, one click apart, each true to its name.

## 2. A working page has no summary band

There is no strip of totals above the controls on a table screen. It was
removed everywhere.

The band was state — "Term T3", "Beds 1 of 4", "Waiting on you 0" — sitting
above filters that did not govern it, so the numbers stared back unchanged
while the table beneath them was narrowed to one child. Moving it below the
filters would have meant recomputing every chip against the filtered set, which
is a different and much larger claim than the chips were ever making.

**Summaries belong on an overview dashboard**, where summarising is the whole
job and there is no table underneath for them to disagree with. A working
screen shows the page's name, what narrows the table, and the table.

The one number that stays is the row count — "50 of 214" — and it stays because
it is not state. It is the answer to whatever the filters just asked, so it
lives on the filter row, beside the question.

`PageBand` still exists and is still correct **on `/schools` and the other
module overviews**. Reaching for it on a screen whose job is a table is the
defect this rule names.

## 3. The caption is repointed, not deleted

A caption stops explaining the title and starts carrying the state that changes
— the term, the class in view, the billing date. Where nothing changes, there is
no caption. That is most pages.

## 4. Where controls live

This is the rule that governs every table screen:

```
┌─ app bar ────────────────────────────────────────────────┐
│  Title            ⌘K search        [ PRIMARY ACTION ]    │
├──────────────────────────────────────────────────────────┤
│  [tabs]                                                  │   which population
│  ────────────────────────────────────────────────────    │
│  [layout] [search] [filters]           50 of 214  [···]  │   how it is narrowed
│  table, flush, no card                                   │
```

- **Primary action → the top app bar.** One per page. `primaryBtn`, brand fill.
  "New student", "Create invoice", "Add hostel".
- **Tabs → their own row**, above the filters, with a hairline under them.
- **Contextual search and filters → the row beneath**, directly above the table
  they control.
- **Row-level actions → in the row**, as `tinyBtn`.
- **Bulk actions → a floating bar** over the selection.

Tabs and filters are two rows because they are two questions, and people do not
ask them at once: a tab picks which records exist on the screen, a filter
narrows the set the tab chose. The second only means anything once the first is
answered, so the reading order is the thinking order. Run together they read as
one undifferentiated strip, and the segmented control at its left — which
navigates — looks like a sibling of the chips beside it, which do not.

`TableControls` renders both rows. Pass `tabs` and it stacks them; pass no tabs
and it is one row, with no wrapper.

## 5. A table is not in a card

The table is the page. A panel drawn around something that already fills the
screen is a border tracing the viewport, and it costs a gutter on each side of
the only content anybody came for.

`/crm/people` and `/crm/companies` are the reference: the control row's hairline
is the seam, and the column header runs straight off the underside of it. No
`<Card flush>`, no rounded corner around 200 rows.

A card is still right for a genuinely bounded panel — a form, a summary tile on
a dashboard, a side rail. It is wrong around the primary table of a screen.

## 6. Density

Three CSS variables, set once on the artboard root and driven by a `density`
prop (`Compact` | `Cozy`):

| var | Compact | Cozy |
|---|---|---|
| `--band-h` | 44px | 52px |
| `--row-h` | 36px | 44px |
| `--head-h` | 32px | 38px |

## 7. Tokens

Resolved values of `app/styles/tokens.css`. Use the token, not the hex.

| role | value |
|---|---|
| canvas | `#F7F8FA` |
| surface | `#FFFFFF` |
| border | `#E5E8EE` |
| text strong / body / mid / subtle | `#16181D` / `#262A33` / `#565C69` / `#8A91A0` |
| brand / brand strong / brand soft | `#0B5DF0` / `#0944C2` / `#E8EFFE` |
| ok / warn / bad | `#4A7042` / `#8A6415` / `#B83A2A` |

Type: Atkinson Hyperlegible Next, 13px/1.5 base. **Numeric and time values are
`font-mono`** (Atkinson Hyperlegible Mono), tabular-nums.

Icons are Phosphor, filled by default; bold for carets and bare marks; regular
for the magnifier. See `design/campus/lib/icons.mjs`.

## 8. Filter by class

Most campus screens are whole-school views that an administrator narrows. The
established pattern is a class-scoped route:

```
/schools/students/class/[classId]
/schools/results/class/[classId]
/schools/finance/class/[classId]
```

A screen that lists pupils, marks or money should offer the class filter rather
than forcing the picker as the only way in — `students-list-content.tsx` carries
the comment explaining why the picker-only version was wrong.

## 9. States

Every screen has eight, drawn in `module/State*.dc.html`: loading, empty, error,
denied, not found, offline, saving, dialog. `components/records/states.tsx`
implements them. Use it rather than inventing a spinner.
