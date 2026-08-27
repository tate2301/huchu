# Campus states and motion

Every campus screen has eight states. The canvas draws all of them in
`design/campus/module/State*.dc.html`; `components/schools/common/states.tsx`
implements them. **Never write a spinner, an empty `<p>`, or a bare "Loading…"
string.** They exist, and the audit will catch you.

Run `node scripts/campus-states-audit.mjs --gaps` to see which screens are short.

## The eight

| State | Component | When |
|---|---|---|
| Loading | `TableRowsSkeleton` / `CardsSkeleton` / `StatsSkeleton` | first read in flight |
| Nothing yet | `NothingYet` | empty and unfiltered — offers the verb that fills it |
| Nothing matched | `NothingMatched` | filters emptied it — repeats them, offers to clear |
| Nothing left to do | `NothingLeftToDo` | the queue is done — good news, no create button |
| Could not load | `LoadError` | the read failed — names what, offers retry |
| Could not save | `SaveError` | the write failed |
| Saving | `SavingOverlay` | a write in flight over what is being written |
| Not your job | `NotYourJob` / `RecordActions` disabled verb | permission |
| Not found | `RecordNotFound` | a record or route that is not there |

## Skeletons

**Every table and every list gets one.** Not a spinner, not a sentence.

```tsx
{query.isPending ? (
  <TableRowsSkeleton
    headers={["Student", "Class", "Fees", "Attendance"]}
    columns={[
      { avatar: true, twoLine: true },   // matches the real cell
      { width: 140 },
      { width: 110, badge: true },       // a status pill is a shape, not a line
      { width: 90, align: "right" },     // money and counts are right-aligned
    ]}
    rows={8}
  />
) : ...}
```

The rules, from the canvas:

- **It mirrors the real row.** Same column widths, same height, same avatar, same
  badge. Campus lists used to reflow twice and jump their columns because the
  placeholder was a generic grey block.
- **It carries the header.** Column names are known before the rows are, so draw
  them solid. Somebody can read what is coming while it comes.
- **Rows cascade in** at 40ms intervals. Twelve bars switching on together reads
  as a flash; a stagger reads as a list arriving.
- **The shimmer is the DS's own** (`.skeleton`, a 1.4s sweep). Do not add a
  second one.
- **`aria-hidden`** — a screen reader should hear the busy state, not the bars.

`CardsSkeleton` for grids that are not tables (the bed board, the shelf).
`StatsSkeleton` for a band of tiles.

## The three empties are three different sentences

This is the distinction screens get wrong most:

- `NothingYet` — **"The school has not sent a notice yet."** Offers the one verb
  that fills it. This is a school on its first day, not a failure, so it is an
  `EmptyState` and never an `Alert`.
- `NothingMatched` — **"No pupil in Form 2 matches 'chikwanda' with status
  Suspended."** Names the filters in force and offers to clear them. **Never a
  create button** — it answers a question nobody asked.
- `NothingLeftToDo` — **"Every book that is out is inside its return date."**
  Good news. No create button; there is nothing to create.

## Errors are scoped to what failed

From the canvas: *"A failed segment keeps its place in the strip and carries the
fault; the ones that loaded stay usable. A page-wide alert throws away four good
answers to report one bad one."*

So a tabbed screen whose Refunds view failed shows the fault **in that view**,
with the other four still usable. Only an unrecoverable page takes the whole
screen, and that one carries a reference somebody can quote.

## Refusals name who can

*"You do not have permission"* is a dead end. *"Only a head of department can
approve a sheet — ask Mrs Nyathi, or the head"* is a next step.

`RecordActions` does this already: a verb the person cannot use is **disabled
with the reason on it, not hidden**. Hiding it makes the screen look different
for every role and leaves a bursar wondering where yesterday's button went.

## Saving

Wrap the thing being written in `SavingOverlay`. It dims to 50% and stops taking
input, which is the interlock and not decoration: *"A save that accepts more
marks halfway through is a save that loses them."*

## Motion

Defined in `app/globals.css` under "campus motion". All of it inherits the DS's
global `prefers-reduced-motion` flattening.

| Class | Use |
|---|---|
| `campus-skeleton-row` | skeleton rows cascading in |
| `campus-row-in` | real rows arriving, same cascade so nothing jumps |
| `campus-fade-in` | a pill, toast or banner appearing |
| `campus-pulse-dot` | the heartbeat on "Saving…" |

**Motion earns its place or it goes.** It may say *something arrived*, *something
changed*, or *work is in flight*. It may not decorate a wait, draw the eye away
from the work, or run longer than `--dur-base` (200ms) for anything on a path
somebody walks repeatedly. A row that animates every time a filter changes is a
row somebody has to wait for.
