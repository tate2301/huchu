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

## 1. A page is named once

From `module/Main.dc.html`, the foundation sheet:

> The module screens name every page three times before the data starts, then
> spend a fourth line explaining a word that needed no explaining.

- **The app bar carries the page's only name.** Not the module's — the sidebar
  header already says that, one column to the left.
- **The rail marks the destination.** It does not need restating below.
- **The page band never repeats the name.** It keeps its height and loses its
  words.

## 2. The band carries state, not identity

The band is `position: sticky; top: 0` and holds:

- **left** — state chips: `{label, value, tone}`. What a name could never tell
  you: how much is open, how much is late, how many are still to record.
- **right** — secondary/contextual actions (Export, Send reminders, Filter).

Tones: `plain · ok · warn · bad · brand`.

## 3. The caption is repointed, not deleted

A caption stops explaining the title and starts carrying the state that changes
— the term, the class in view, the billing date. Where nothing changes, there is
no caption. That is most pages.

## 4. Where controls live

This is the rule that governs every table screen:

- **Primary action → the top app bar.** One per page. `primaryBtn`, brand fill.
  "New student", "Create invoice", "Add hostel".
- **Tabs, contextual search and contextual filters → one row, directly above the
  table they control.** They belong to that table, so they sit with it — never
  split across the band and the card.
- **Row-level actions → in the row**, as `tinyBtn`.
- **Bulk actions → a floating bar** over the selection.

## 5. Density

Three CSS variables, set once on the artboard root and driven by a `density`
prop (`Compact` | `Cozy`):

| var | Compact | Cozy |
|---|---|---|
| `--band-h` | 44px | 52px |
| `--row-h` | 36px | 44px |
| `--head-h` | 32px | 38px |

## 6. Tokens

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

## 7. Filter by class

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

## 8. States

Every screen has eight, drawn in `module/State*.dc.html`: loading, empty, error,
denied, not found, offline, saving, dialog. `components/schools/common/states.tsx`
implements them. Use it rather than inventing a spinner.
