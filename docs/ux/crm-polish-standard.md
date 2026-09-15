# The CRM polish standard

## What this is

The CRM module is the only part of this product that is finished. Not finished
as in "has no bugs" — finished as in somebody decided what each screen is for,
what it costs in pixels to say a thing, and what goes wrong if it is said the
other way. Those decisions are written down in the module's own source, mostly
in the header comments of `components/crm/records/` and `components/records/`.
This document extracts them as rules another engineer can build against, and
then measures how far the schools module and the management module are from
each one.

It is not a style guide. Colours, spacing scales and radii are settled
elsewhere (`docs/ux/platform-ux-playbook.md`, `docs/design-system/`). What is
here is the layer above that: what a surface is *for*, which arrangement it
therefore deserves, and the specific failure each rule is avoiding. A rule
without its failure is a preference; a rule with its failure is a standard.

Rules are numbered so a change can cite one. The failure clause is part of the
rule — if you find yourself keeping the rule and losing the failure, the rule
has stopped being true and should be rewritten rather than obeyed.

**Primary sources.** Where a rule restates something the code already argues,
the file is named. Read the file; it is longer and better than the summary.

---

## Part 1 — The identity cell

CRM renders a person as one compact unit: a mark, the name, and one supporting
line. The exemplar is `components/crm/records/people-content.tsx`; the shared
pieces are `RecordTableName` in `components/records/record-table.tsx`,
`DirectoryName`/`DirectoryCell` in `components/records/people-directory.tsx`
and `RecordMark` in `components/records/record-mark.tsx`.

### IDENT-1 — A person is a mark, a name and one supporting line, in one cell

The name column of a list is a single composed cell, not three columns that
happen to be adjacent. Build it from `RecordTableName` (tables) or
`DirectoryName` (directories), never by hand.

*The failure:* four lists each grew their own first column, and they drifted.
`RecordTableName`'s own header comment says it exists to stop that. A hand-rolled
name cell is how you get four different gaps between avatar and name, two
different underline treatments and one list where the subtitle is the same size
as the title.

### IDENT-2 — The supporting line is what tells two similar rows apart, and it is never blank

The second line carries the reference first, then the word of context:
`personNo · jobTitle`. The reference leads because it is the half that is
unique; the context is what tells two Tendai Moyos apart. Where there is no job
title, the reference stands alone.

*The failure, stated in `people-content.tsx`:* a job title used as the whole
subtitle leaves a blank line under every name that has no job title, and a row
with a hole in it reads as a row that failed to load. Compose the line from a
`.filter(Boolean).join(" · ")` over an array whose first element always exists.

### IDENT-3 — The supporting line is mono and a step down

`RecordTableName` sets the subtitle in `acct-caption font-mono`. The subtitle is
nearly always an identifier — a reference, a code, a phone number, a branch —
and mono is what lets the eye run down the column and catch the one that differs
by a digit.

*The failure:* at the title's size and face the subtitle reads as a second name
and doubles the apparent height of every row.

### IDENT-4 — The underline is on the title and nowhere else

The link cue is a quiet underline in `--border`, darkening to `--text-muted` on
row hover. It is painted on the title span, not on the anchor that wraps the
cell.

*The failure, from `record-table.tsx`:* a text decoration is painted by the
element that declares it and cannot be switched off by a descendant. An
underline on the wrapping link struck through the job title and the reference
under every name, and `no-underline` on the subtitle did nothing about it.

### IDENT-5 — A company name in a cell gets `block truncate` on the cell, not on the link

```tsx
<span className="block truncate">
  <EntityLink href={…} className={recordCellTone("relation")}>{name}</EntityLink>
</span>
```

*The failure, from `people-content.tsx`:* a long company name wrapped to two
lines and made its row twice as tall as its neighbours. Truncation has to be
owned by the cell, because the link is an inline child and will not clamp
itself.

### IDENT-6 — The name column is never hidden

A column picker may hide the company, the contact, the type, the count and the
owner. It may not hide the name. `PERSON_FIELDS` marks it `required: true`.

*The failure:* "a table of anonymous rows is not a table."

### IDENT-7 — A mark's colour is derived from the name, never from the row index

`RecordMark` hashes the name. The artboard cycles five pairs by row index; that
is wrong off an artboard.

*The failure, from `people-directory.tsx`:* an artboard has one page. A real
directory is paged, filtered and searched, so cycling by index repaints somebody
the moment a row above them is filtered out — and the colour stops being a thing
you can recognise a person by, which is its only job.

### IDENT-8 — An empty cell says what is missing, in words

In a directory, `DirectoryCell` requires a `missing` string: "not on file", "No
company", "Unassigned", "no contact on file". The em-dash fallback in
`RecordCell` is for tables of figures, where "we have nothing" is the whole
meaning.

*The failure:* a dash under *National ID* and a dash under *Access* are two
different facts, both of which somebody may need to act on, rendered as the same
non-answer. `DirectoryCell` makes `missing` required on purpose: "a caller that
cannot name what is absent has not finished thinking about the column."

### IDENT-9 — The same identity cell is used in every arrangement of the same records

`people-content.tsx` builds `rows` once and the board reuses them
(`rowsById.get(person.id)`), so the table, the row list and the phone board say
the same things about the same person.

*The failure:* two arrangements of one record that disagree about which facts
matter.

---

## Part 2 — List or table is a decision, not a default

Source: the header comment of `components/crm/records/record-list.tsx`, and the
one on `components/records/record-table.tsx`.

### SHAPE-1 — Ask what the surface is for before choosing its shape

> People, companies, sites are lists of things you open, not grids of numbers
> you compare.

- **A list** — a title, a supporting line, a small cluster of facts on the
  right, the whole row a link — is right for *find the thing and open it*.
- **A table** is right for a comparison surface: sortable columns, money you
  scan down a column, bulk selection, "which of these are unassigned", "what is
  closing this month".

*The failure:* a DataTable on a find-and-open surface "spends a header row and
six columns saying what one line of text would". The converse failure is real
too: a stack of two-line rows cannot answer a column question, because the facts
never line up.

### SHAPE-2 — Where both questions are genuinely asked, give the same records a second arrangement, not a second page

`LayoutSwitch` (`components/crm/records/layout-switch.tsx`) is one control, one
vocabulary, one order — **Table, List, Board** — and it is always the leftmost
thing in the options row.

*The failure:* every CRM list grew its own version with its own wording and its
own order — "Board / List" on deals, "List / Board" on people, nothing on sites
— so the first control on every page was in a different place and said a
different thing, and switching pages cost a read.

The order is doctrine, not decoration: *what am I looking at* comes before *how
is it narrowed*, which comes before *how do I find one*.

### SHAPE-3 — A table below `md` is a list

`RecordTable` takes a `mobile` slot and renders it below `md`, before the
loading and empty branches so the phone gets the list's skeleton and empty state
rather than the table's.

*The failure:* "Seven columns at 390px is a sideways scroll where every screen
shows one and a half of them, which is not a table — it is a table you have to
operate." It is rendered inside `RecordTable` rather than at each call site
because "four lists each remembering to do it is four lists where one of them
forgets."

### SHAPE-4 — A row carries facts through one resolver, so a value is the same colour everywhere

`recordCellTone(kind)` in `components/records/record-table.tsx` is the one place
a cell's ink and face are decided, and it decides on the **value**, not on the
column it landed in:

| kind | ink and face | why |
|---|---|---|
| `email`, `relation` | `--brand-strong` | both are "this is somewhere else" — the same promise, so the same blue as the info badge |
| `phone`, `code`, `date` | mono, tabular, body ink | identifiers are compared, not read |
| `money` | mono, tabular, medium, `--text-strong` | the figure the row is about |
| `number` | mono, tabular, body ink | a quantity is not money |
| `text` | body ink | |

`RecordListFact.kind` feeds the same resolver, which is why a person's email is
the same blue in a table cell, in a row list and on a board card.

*The failure:* "four lists writing 'which grey is a phone number' four times is
four lists that will eventually answer differently."

Two consequences that are part of the rule:

- an `email` is a real `mailto:` and a `relation` is a real link, so the colour
  behaves like the thing it promises; both `stopPropagation`, because the row
  lists and boards wrap everything in one link;
- a `phone` is a `tel:` only under `@media (pointer:coarse)`. On a mouse it is
  plain selectable text, rendered as two elements swapped by a media query
  rather than by a hook, "because a hook per cell is five hundred `matchMedia`
  listeners on a full page of records".

### SHAPE-5 — A state is a badge, not a tinted value

`RecordCellKind` deliberately excludes status. A state is a judgement and wants
a filled shape — `Badge` or `StatusChip`, toned from `lib/crm/tones.ts`, whose
own rule is: **a state is coloured, a category is not.** "Won" is green;
"Site contact" is neutral, because colouring a category spends the reader's
attention on something that never needs acting on. Anything genuinely a state
and still rendering grey is a bug.

### SHAPE-6 — `primary` marks the one fact worth keeping when the labels go, and a count is never it

On a phone the row shows the fact marked `primary`, without its label, and drops
the rest. A row with nothing marked shows no facts at all.

*The failure, quoted from the type:* "stripped of its label, 'Deals: 0' renders
as a bare '0' at the end of a person's name, which reads as a figure about them
without saying which. A row that says less is better than one that says
something ambiguous."

So: a deal's value, an invoice's balance, a job's percent complete are
`primary`. Counts and owners are not. Verified call sites that follow this:
`deals-board.tsx:440`, `deals-content.tsx:339`, `work-orders-content.tsx:415`,
`leads-table.tsx:363`, `documents-list-content.tsx:136`.

### SHAPE-7 — Rows are separated by space, not rules

`RecordList` uses `space-y-1` and no dividers.

*The failure:* "a divider draws a line the reader has to cross for every row; a
gap does the same separating without adding anything to look at, and the rows
stop reading as a ruled ledger."

### SHAPE-8 — Row heights are stated, and they change with the pointer

- list row: `min-h-11` (44px). `py-2.5` alone gives about 40px, "which is under
  every platform's minimum and reads as a near-miss rather than a miss".
- table row: `--table-row-min-h` (36px) on a mouse, `min-h-11` under
  `@media (pointer:coarse)`. 36px buys four more rows per screen on a register
  somebody scans all day; on touch the extra height buys a hit area rather than
  costing a row.

### SHAPE-9 — Only the first cell of a table row navigates; a chevron closes the row

Nothing else in the row is a link, so a chip in the third column is not an
accidental target and the text in a cell can be selected. The trailing chevron
is a link to the same place, `aria-hidden` and `tabIndex={-1}`.

*The failure:* the first-cell rule left a 46rem row where nothing at the end
said there was anywhere to go, so a reader who had scanned across had to scan
back.

### SHAPE-10 — Selection is opt-in, and written once per screen

`RecordList` and `RecordTable` both take the same `selection` shape
(`selectedIds`, `onChange`, `actions`), and a screen declares it once and passes
the same object to every arrangement (`people-content.tsx`).

*The failures:* "a column of checkboxes nobody uses is a column of noise" when
selection is on by default; and "two copies of a bulk action are two chances for
the table's version to keep working after the list's has been changed" when it
is declared per branch.

A bulk result reports what it did **and what it did not**: "3 skipped — they
belong to someone else", rather than letting the count quietly disagree with
what was selected.

### SHAPE-11 — A list gets a pager, not a table's pagination bar

`RecordListPager` is "Showing 1–50 of 340" and two buttons, and it renders
nothing at all when `total <= pageSize`.

*The failure:* page size, jump-to-page and a row-count select are controls for a
grid you are working through, not a list you are scanning.

### SHAPE-12 — Sort before you group

A directory grouped by first letter must be queried sorted by that letter.
`people-content.tsx` passes `sort: { field: "fullName", direction: "asc" }` for
exactly this.

*The failure:* on the default `updatedAt` order the headings came out A, S, C,
N, F — "an alphabet applied to a list that was not in alphabetical order, which
is worse than no headings at all".

A search result is ranked by relevance, not alphabet, so it stays a flat list
and the jump strip disappears.

---

## Part 3 — A record is a web, not a page

The philosophy: one record links to all the others, and following a link is
cheaper than navigating. Sources: `components/records/entity-link.tsx`,
`components/crm/records/relation-attribute.tsx`,
`components/crm/records/record-tabs.tsx`,
`components/crm/records/record-story.tsx`,
`components/records/record-attributes.tsx`,
`components/records/record-page-shell.tsx`.

### The composition, in four words

- **A property** is a fact about this record, including a single reference to
  another record. It lives in the property list at the top of the page (or in
  the standing column on a wide screen), and it is editable in place.
- **A tab** is a list-shaped relationship — the people on a deal, the guardians
  of a pupil — or one of the five sections every record has.
- **A story** is the record's timeline, assembled across every table that holds
  a piece of it.
- **A reference** is a link when there is one of it, and an embedded list when
  there are many.

### WEB-1 — Every named reference to another record is a link

`EntityLink` wraps it. Detail pages are mostly made of other records; before
this they were plain text, "so the page told you the name and then made you go
and find it".

### WEB-2 — The cue is an underline, not a colour

`underline decoration-[var(--border)] underline-offset-2`, darkening on hover.

*The failure:* "a colour shift alone is easy to miss against a page of
near-black text, and on a screen in daylight on a site it is invisible".

### WEB-3 — A plain click peeks; the modifier keys navigate

Two questions get asked of one link and they want different answers:

- *what is this?* — a plain left click opens the record beside the page and the
  page does not move. "A journey is the wrong price for a glance."
- *take me there* — ⌘/ctrl-click, shift-click, alt-click and middle-click are
  left entirely alone, so "open in a new tab" works the way it does everywhere
  else.

A link to the record you are already reading is neither: it is suppressed.
`peek={false}` opts out where the reference is the point of the row rather than
an aside.

When navigation does happen, the record being left is pushed onto the trail, so
the next page's back arrow names it "instead of a list nobody has been near".

### WEB-4 — Peekability is decided by a route parser, not by the call site

`parseRecordHref` (`lib/crm/record-ref.ts`) turns an href back into
`{ entity, id }`, strictly: query and hash are dropped, anything deeper than
three segments returns null, and a null makes the link an ordinary link. "Being
strict here is what keeps the peek from opening on things it cannot summarise."

### WEB-5 — A single reference carried as a property is a link that keeps the whole row, with a pencil at the end

`RelationAttribute`. The link takes the full width; repointing is a 28px ghost
pencil at the end. With nothing linked there is no link to protect, so the
placeholder itself is the trigger.

*The failure, costed in pixels in the component's own comment:* it used to be a
"Change" button spelled out in words, "which cost about 55px of a value column
that is only 200px wide on a phone: on a lead, 'Chitungwiza Medical Centre' and
'Chang…' both ran off the right edge of the screen, and neither could be read".

The picker is a `ResponsivePopover` — a sheet on a phone, a popover on a
desktop. A bare 320px popover at 390px "is a panel almost as wide as the screen
with nothing to anchor to".

### WEB-6 — Properties live at the top of the record, are editable in place, and have no save button

`RecordAttributes`, the Notion arrangement. Editable rows write through on blur
or Enter via `useAttributeEditor`.

*The failures:* the facts that identify a record were "living in the right rail,
which is where a reader looks last and a phone does not look at all" — and that
is the only place they get maintained; and "a property somebody changed and
forgot to save is worse than one they never changed", which is why there is no
save button here and none anywhere else on a record page.

Supporting rules that come with it:

- **one line box.** `ATTRIBUTE_ROW` is a single exported constant used by the
  label, all three value renderers and `RelationAttribute`, "so they cannot
  drift apart again". It is padding, not a `min-height`, because a min-height
  centres text in a box the label does not share and puts the two sides back out
  of line.
- **label 112px, never bold, muted ink, wrapping not truncating.** It was 144px
  everywhere, which out of a 390px screen left under 200px for the value — "the
  label, which is the half you already know, was taking more width than the half
  you came to read". It wraps because "Primary cont…" is a label somebody has to
  guess at.
- **every row gets a mark**, `Tag` as the honest fallback, one step lighter than
  the label, which is itself one step lighter than the value. "A column where
  six rows out of fourteen have a glyph and the rest start at a ragged indent
  reads as a list that has gone wrong."
- **`items-start`**, so a value that wraps hangs off its label rather than
  pushing the label into the middle of it.
- **the value is `block break-words`, not a flex child.** A flex child will not
  wrap, so an email longer than the ~200px value column ran off the screen with
  no ellipsis and no way to read the rest.
- **tone is resolved, not declared.** `resolveTone` infers: an empty value is
  muted whatever else it claims, a `mono` row is a `code` unless it says it is
  money. A call site spells out only the two things nobody can infer — that a
  number is money, and that *this* particular blank is a problem (`alert`, which
  survives emptiness because that row is why somebody opened the record).
- **a rendered `display` node goes through the tone, not around it** — otherwise
  a company drawn as an `EntityLink` is body ink on the record page and brand
  blue in the table beside it.
- **the list is sized to its container**, `@container` with `@lg:grid-cols-2`,
  not to the viewport. Keyed to the viewport, a 320px standing column got two
  columns and "USD 9,100.00" came out one character per line.

### WEB-7 — The tabs every record has are written once

`record-tabs.tsx` builds `conversationTab`, `tasksTab`, `historyTab`,
`automationTab` and `paperworkTab` from a `RecordRef`.

*The failure, stated plainly:* "A record was implemented five times — lead,
deal, company, person, site — each composing its own timeline, its own comments,
its own tasks. So a fix to 'the record page' landed on one of five and the
report came back saying it was not there, correctly. Three rounds went that
way."

Three sub-rules fall out of it:

- **one destination per question.** History, Field history and Mentions were
  three rows in the rail answering one question — "what has this record been
  through, and where else does it come up". They are genuinely different lists,
  which is why `SubSections` keeps them apart; they are not different
  destinations, which is why they no longer are. Same for Documents and Files
  under Paperwork.
- **a tab exists on every kind or on none.** The Workflows tab appears on record
  types no trigger currently reaches, because "a company page saying 'nothing is
  watching this record' is a useful answer, and a tab that appears and
  disappears depending on the record type is a tab people stop looking for".
- **tab builders are plain functions, so anything needing a hook is a hook.**
  `useRecordComments` is separate from `conversationTab` because "a hook hidden
  inside one is a rules-of-hooks bug waiting for the first conditional tab".

### WEB-8 — The record's conversation is one feed, and the composer pins to the top of it

Comments used to be their own section seven rows along the rail while notes and
calls were at the top of the timeline — "so a record's conversation was split
across two screens by a distinction (internal or not) that the reader does not
have in their head when they are looking for what somebody said".

The composer is sticky at the top of the pane: "on a lead with forty messages
the reply box was forty messages up".

### WEB-9 — The story is assembled across tables by the caller

> A story told from one table is not the story, it is whichever chapter that
> table happened to keep.

`RecordStory` takes `events: StoryEvent[]` and does not fetch. Callers merge
their own sources, "because which sources exist depends on what the record is —
a site has visits and no quotes, a person has comments and no stages".

The grammar of the feed:

- **one mark per event, and it is the kind.** No author avatar. "Two discs on
  every line, an inch apart, neither of them the thing being said" — what
  happened is what you scan a timeline for, and who did it is already the first
  word of the sentence.
- **a fixed header, then a free-length body.** Who, what and when on one line;
  the prose underneath. Inline, "the two facts a reader scans a feed for — who
  is talking and when — were mixed into the same visual run as the thing they
  said".
- **every kind somebody writes prose into gets a box** (`BOXED`: email, note,
  comment, visit, call, whatsapp, meeting), not a hand-picked few. With only
  email boxed "the frame stopped meaning 'somebody said this' and started
  meaning 'this one happened to be an email'".
- **mechanical runs fold**, and only two kinds qualify (`FOLDABLE`: stage,
  system) — deliberately narrower than `QUIET_KINDS`. A raised quotation is
  quiet *and* it is the reason somebody opened the record; "hiding it behind a
  disclosure would answer 'what happened here' with a button." A run of one is
  left alone: "replacing a single grey line with a single grey control that
  reveals it is not a saving." Folding happens **within** a day, because the day
  heading is what gives every row its date.
- **the day is the section heading and the row shows only the time.** "A full
  '8/4/2026, 9:06:53 PM' on every one of a hundred rows repeats the heading and
  adds a second nobody reads."
- **one `now` per render**, so a feed rendered across midnight does not label
  half its rows "Today" and half by date.

### WEB-10 — A reference is a link when there is one of it, an embedded list when there are many

- one → a property (`RelationAttribute`), or an `EntityLink` inside a rendered
  `display` node;
- a handful, worth seeing without leaving → `RelatedList` under the section
  rail, three lines each, each row a link;
- many, with their own verbs → a tab.

*The failure in both directions:* a list-shaped relationship squeezed into a
property row truncates to uselessness; a single reference given a whole tab is a
destination for one line of text.

### WEB-11 — Which section is open lives in the URL

`?section=documents`, not component state. Three things depend on it: the phone
back arrow and the browser back button both return to the record rather than to
the list two levels up; a link to a record's documents is a link somebody can
send; and the first paint is correct, where the alternative — `matchMedia` — has
no answer before hydration and paints the desktop shape on a phone for a frame.

### WEB-12 — Thirteen sections is a rail, not a tab strip

A tab strip wrapped onto two rows at 1440px and had to be scrolled sideways at
390px. The sections are a vertical rail beside the content on a desktop and the
same rail at the foot of the landing view on a phone, where tapping a row opens
that section full-width. Both read the same URL, so neither is a separate mode.
Tabs with no content are dropped rather than shown empty.

---

## Part 4 — Density and economy

The habit, not the instances: **measure the cost of a control against the column
it sits in, and say the measurement out loud.** CRM's comments are full of
arithmetic, and that is the point — a decision with a number in it can be
argued with, and a decision without one gets re-litigated every quarter.

### DENS-1 — Cost a control against its container before choosing its form

Worked examples already in the code, all of which should be cited rather than
re-derived:

| control | container | cost | resolution |
|---|---|---|---|
| "Change" button in words | 200px value column at 390px | ~55px, 28% | ghost pencil icon (`relation-attribute.tsx`) |
| property label | 358px phone / 340px standing column | 144px left under 200px for the value | 112px (`record-attributes.tsx`) |
| layout switch labels | narrow-desktop toolbar with six controls | three words × three segments | label hidden `sm`–`lg`, `sr-only` name kept (`layout-switch.tsx`) |
| six toolbar controls | 390px | three wrapped lines, records below the fold | one "Filter" button with a count (`view-toolbar.tsx`) |
| seven table columns | 390px | sideways scroll showing 1.5 columns | list below `md` (`record-table.tsx`) |
| three text verbs per row | `/schools/students` | 1,145px of columns in 1,129px of space | menu, or a chevron (`schools/common/record-actions.tsx`) |

### DENS-2 — A verb in a table row is an icon or a menu, never spelled out

`RecordActions` states the standard in its own comment and points at the CRM
tables as the reference: the row gets a chevron and nothing else. `layout="menu"`
collapses verbs behind one trigger. `inline` is for detail-page headers, where
the verbs are the point of the page.

### DENS-3 — A label that is dropped for space keeps an `sr-only` copy

`LayoutSwitch` paints a decorative `aria-hidden` label and carries the real name
in `sr-only`, "so the segment is announced the same at every width and never
announced twice".

### DENS-4 — The page gutter comes off a register

`table-edge-to-edge` drops the page gutter and the max-width for a table. "A
register is read across, and a page gutter either side of it is 16px of nothing
on the one axis a wide table is short of" — the cells' own padding does the
insetting.

### DENS-5 — A count is only shown when it is non-zero

`SubSections` passes `count` only where `count > 0`: "a zero is not a count
anywhere else in the product and is not one here." `RecordTabs` in the schools
module states the complement correctly for its own case: a tab renders without a
count while the count is still loading, "because a zero that turns into 218
reads as data arriving late and wrong".

---

## Part 5 — The page container, the width, and the band

Source: `components/crm/crm-page.tsx`.

### PAGE-1 — Three widths, named, in one place

```
list    a record list or dashboard      full width
detail  a record page with a side rail  full width — the rail bounds the
                                        reading column, not a cap on the page
narrow  a single column of form         max-w-3xl
```

*The failure:* widths had drifted to six values across the module — `max-w-4xl`
through `max-w-[110rem]` — "so moving between pages shifted the content under
you".

### PAGE-2 — `list` and `detail` are deliberately unbounded

`max-w-7xl` was a 1280px cap on surfaces that are almost entirely tables and
side-by-side panes: "on a 1920 screen with the sidebar open it left ~180px of
dead margin on each side". A page that genuinely needs a reading measure asks
for `narrow`, "which is the only width here that still means anything".

### PAGE-3 — The app bar names the record; the band names the view

The bar carries the page or record identity and the page's primary actions, via
`PageChrome`. A page does not repeat its own name in its body.

*The failure:* "a page that repeats its own name below a bar that already says
it is spending a band of vertical space on nothing, and the rule that band drew
was the seam between the bar and the content."

So `RecordListShell` draws **no** band: the bar already names the list. `CrmPage`
draws one only where there is a second name to state — the *section* of a setup
area — or state to pin.

### PAGE-4 — The band carries what never scrolls, and nothing else

`bandSlot` is "context the page needs permanently in view — a count, a total, a
period". The schools module states the same law correctly in
`components/schools/common/page-band.tsx`: "the band under it carries STATE …
not a second copy of the name, and not a caption explaining a word nobody
misread. Every chip here is a number that changes; anything that never changes
belongs in the heading or nowhere."

### PAGE-5 — The sticky stack is a published variable, not a guessed offset

`RecordListShell` publishes `--stack-next` and hands `--stack-top` down to its
children; table headers pin at `top-[var(--stack-top,0px)]`. It cannot be
written straight onto `--stack-top` because a custom property defined in terms
of itself is a cycle and resolves to nothing.

Two traps the code has already paid for:

- an `overflow-x: auto` box computes `overflow-y: auto` as well and becomes the
  scrolling ancestor, so a sticky header inside it silently does nothing. The
  clamp is therefore dropped at `@5xl`, and only then is the header sticky.
- `border-separate`, not `border-collapse`: a collapsed border is owned by the
  table, and a sticky head carries none of it — it detaches and floats over the
  rows with no seam.

### PAGE-6 — The toolbar and the records are flush

No gap between the options row and the table header. "The toolbar's hairline is
the seam between the controls and the records"; a gap put a strip of page
between two sticky bands and rows slid through it as they scrolled.

---

## Part 6 — The settings surface

Source: `components/crm/crm-settings-shell.tsx` with `components/crm/crm-page.tsx`.
**This pair is the target the management module is being asked to match.**

### SET-1 — The band names the section, not the module

"Pipelines", with that section's own lede — not "CRM setup", which is already
what the sidebar entry you clicked says.

*The reason, stated:* "the band is the only permanent label on the page: the
rail highlight scrolls away with the rail on a narrow window … Repeating it in
the band spends the one line that never scrolls on information the reader used
to get here."

### SET-2 — The band carries the section's primary action

The action is the one thing you can do on any setup section, "so it should sit
in the same place on all six".

### SET-3 — "saves as you go" lives in the band, and there is no sticky unsaved bar anywhere below

The note about saving "is a property of the page rather than of any panel on
it". It is hidden below `sm`.

### SET-4 — Create state is held as *which* section's flow is open, not *whether* one is

`createFor === active.id`. A boolean shared by six panels with six different
dialogs "would open the *Custom fields* dialog the moment you switched rail
entry"; holding the section id makes moving away close it by derivation, with no
effect writing state back on navigation.

### SET-5 — The client wrapper exists so the route can stay a server component

The band belongs to `CrmPage`, which sits above the content, and the active
section lives in the query string, which only a client component can read. The
route stays a server component "so the session check happens before any of this
renders".

### SET-6 — Thirteen settings sections are a responsive nav rail

Stacked, they are "five hundred pixels of navigation above the page they
navigate to". `NavRail orientation="responsive"` — rail on a desktop, scrolling
strip on a phone.

---

## Part 7 — Filters, search and narrowing

Source: `components/records/view-toolbar.tsx`, `components/crm/records/list-search.tsx`,
and the filter block in `people-content.tsx`.

### FILT-1 — Narrowing is answered in one place

One options row, read left to right:

```
[ layout ] │ [ search ] [ filter ] [ filter ] ···· 8 of 8 │ [ columns ] [ export ]
```

Search leads the narrowing controls because it is the shortest route to one
record. The filters follow, "because they are the same question asked more
slowly". Everything after the spacer is about the table rather than about which
records are in it, so it is pushed right behind a hairline.

*The failure:* the filters used to sit on a row of their own above this one, "so
'narrow it down' was answered in two places a band apart".

### FILT-2 — Switching arrangement must not move the row

Anything that only makes sense in one layout disappears from its slot rather
than reshaping the row.

### FILT-3 — A filter chip says what it is filtered *to*

`ViewToolbarChip label="Type" value="Customer"`.

*The failure:* "'Type' alone has to be opened to be read; 'Type Customer' is
read at a glance, which is the difference between a row of controls you
interrogate and one you scan."

### FILT-4 — Below `sm` the whole row goes behind one button, and the button carries the active count

"A collapsed control that hides an active filter is how a list ends up looking
empty for no visible reason." What stays on screen is the search box and the
records under it.

### FILT-5 — "Nobody" is its own filter entry

`UNASSIGNED` is offered beside the named owners rather than folded into
"Anyone": "a contact nobody owns is the one this list is most often opened to
find."

### FILT-6 — Narrowing resets to page 1

Every filter change calls `setPage(1)`. Narrowing changes what page 1 means.

### FILT-7 — A tab strip replaces the population; a filter narrows it

The schools module states this one best (`schools/records/record-tabs.tsx`):
"exactly one is ever lit, and choosing one never leaves a second control
silently in force". Where a filter and a tab could disagree, the explicit filter
wins — `students-list-content.tsx` documents this: choosing "Left — withdrawn"
while sitting on Active "has to show the withdrawn, not nothing".

### FILT-8 — The count sits in the toolbar, beside the display controls

"50 of 214" answers whatever the filters just asked, "and belongs next to the
question rather than at the foot of the table".

### FILT-9 — Tab counts and band numbers are queried separately from the rows

They must not move when the filters do: "filtering to Form 2 must not make it
look as though the school lost 700 children."

---

## Part 8 — Empty, loading, error, saving

CRM and schools have both solved this; schools states it best, in
`components/schools/common/states.tsx`. The rules are the union.

### STATE-1 — An empty list has three causes and wants three sentences

```
search returned nothing   →  "No people match that search"
filters emptied it        →  "No people match these filters"          + clear the filters
genuinely nothing yet     →  "No people yet" + the verb that fills it
```

*The failure, from `people-content.tsx`:* "'No people yet' over a list a filter
has emptied is a lie that sends somebody off to add a person they already have —
and offering 'Add the first person' there makes it an invitation to create a
duplicate."

A fourth case exists and is different again: **nothing left to do** is good news
and never offers a create button.

### STATE-2 — An empty list is an empty state, not an alert

It is not a failure.

### STATE-3 — A skeleton mirrors the row it is about to become

Never a spinner, never a generic grey block. Same height, same column widths, a
real header drawn solid because the column names are known before the rows are,
a 40ms stagger, `aria-busy` and `aria-live`. Widths are deterministic —
`Math.random()` differs between the server render and the client's and trips a
hydration mismatch.

*The failure:* campus lists "loaded" by swapping a sentence into the middle of an
empty table, which reflowed the page twice and jumped the column widths.

### STATE-4 — Load errors and save errors are different components

The verb differs: "The fee ledger would not load" with a retry, versus "That
waiver was not saved". CRM's list shell renders `Unable to load <title>` above
the records and keeps the records visible underneath.

### STATE-5 — A write in flight dims and locks the thing being written

`SavingOverlay`: 50% opacity, `pointer-events: none`, `aria-busy`, a small
status pill. "A save that accepts more marks halfway through is a save that
loses them." The same interlock is right while a filter change is in flight:
"rows from the old filter under the new one's controls are rows somebody will
read as the answer to a question they did not ask."

### STATE-6 — A refusal names the role that can

"This is the bursar's to do" is a next step; "you do not have permission" is a
dead end. A verb somebody cannot use is **disabled with the reason on it**, not
hidden — hiding it "makes the screen look different for every role and leaves a
bursar wondering where the button they saw yesterday went".

### STATE-7 — Destroying anything confirms, and the confirmation says what happens

Not "are you sure".

---

## Part 9 — The hydration contract for dates and times

Sources: `components/ui/client-date.tsx` and `ClientTime` in
`components/crm/records/record-story.tsx`.

### TIME-1 — Nothing derived from `new Date()` reaches the first paint

Before mount, render a **slice of the raw ISO string**: `slice(0, 10)` for a
date, `slice(0, 16)` with the `T` swapped for a datetime, `slice(11, 16)` for a
time. Only after hydration does the reader's locale come into it.

*The mechanism:* `useSyncExternalStore` with a server snapshot of `false` and a
client snapshot that starts `false` — not a mount effect, because that is a
render-triggering `setState`, and not `typeof window`, because that differs
between the two renders. The server bytes and the first client render are
identical, and React hydration error #418 stays away.

### TIME-2 — `ClientDate` returns a bare fragment

No wrapper element, no class hook, "so it never disturbs the layout of the cell
or the sentence it sits in". 39 files drop it inline inside table cells and text
runs.

### TIME-3 — Seconds are dropped

`toLocaleString()` carries them: "8/4/2026, 9:06:53 PM" beside every quote,
comment and logged call is "a precision nobody asked for, in a column narrow
enough that it wraps to buy it". Anything that genuinely needs seconds formats
explicitly at the call site.

### TIME-4 — A date rendered inside a client component is still server-rendered

`"use client"` does not exempt a component from the contract. Calling
`new Date(x).toLocaleDateString()` in a cell renderer is a hydration mismatch
waiting for a reader whose timezone or locale differs from the build machine's.
Use `ClientDate`, or a fixed-locale `Intl.DateTimeFormat` module constant if the
value must be identical for everyone.

### TIME-5 — A relative label is computed once per render, not per row

One `now` for every heading in a feed, "so a feed rendered across midnight does
not label half its rows 'Today' and half by date". The same reason makes `now` a
parameter of `bucketByDay` rather than a call inside it.

---

## Part 10 — Copy

### COPY-1 — Sentence case everywhere

Page titles, band titles, tab labels, column headers, buttons, menu items,
empty-state titles. "Guardian no", not "Guardian No". "Pass mark", not "Pass
Mark". Proper nouns keep their capitals.

### COPY-2 — British English

"Organisation", "colour", "recognised". The one exception is an identifier that
already exists in the schema or an API contract.

### COPY-3 — A button is an imperative, and names the thing

"New person", "Add the first person", "Assign owner", "Clear the filters". Not
"Submit", not "OK", not "Manage".

### COPY-4 — A failure says what did not happen, not what the system did

"Could not save that change". "That waiver was not saved". "3 skipped — they
belong to someone else." Never a status code, never "an error occurred".

### COPY-5 — An absence is named in words where the reader might act on it

"Unassigned", "No company", "not on file", "No contact on file". The em-dash is
reserved for a table of figures where "we have nothing" is genuinely the whole
meaning.

### COPY-6 — A trailing "Actions" column header is not a label

The column is an affordance. `RecordTable` gives it `<span className="sr-only">Open</span>`
and draws a chevron: "it is an affordance, not a field — but it still needs a
header cell, or the body rows carry one more cell than the head and every column
below it shifts by one".

### COPY-7 — No emoji in product copy

---

## Part 11 — Where CRM disagrees with itself

A specification that describes the average is useless. These are the places CRM
is inconsistent; in each, one way is right and the other is the one to change.

### INC-1 — `RecordList` still lives under `components/crm/records/`

`RecordTable`, `RecordCell`, `ViewToolbar` and the people directory were all
moved to `components/records/` for a reason stated twice in the source: "the
moment it lives in one of them the other becomes the copy that drifts". The row
list — which is the arrangement schools most needs — did not move.

**Right:** move `record-list.tsx` and `record-list-groups.tsx` to
`components/records/`. They import nothing CRM-specific today (only
`RecordCell`, `Checkbox`, `DataTableFloatingActions`).

### INC-2 — Deals passes `["BOARD", "TABLE"]` to `LayoutSwitch`

`layout-switch.tsx` exists to give the module "one control, one order, one
vocabulary", and `deals-content.tsx:298` puts Board first, which makes deals the
one page where the segments are in a different order.

**Right:** `["TABLE", "BOARD"]`. The order is Table, List, Board wherever a
subset is passed.

### INC-3 — Only `people-content.tsx` has the three-cause empty state

`companies-content.tsx:397,451` and `sites-content.tsx:171,208` collapse to two
causes; `deals-content.tsx:315,342` distinguishes the status filter but not the
search.

**Right:** the three-cause form, everywhere. Where a list has no filters yet, the
two-cause form is honest — but companies and sites also have no filter chips at
all, which is the other half of the gap.

### INC-4 — `record-list-groups.tsx` pins section headers at `top-14`

A hard-coded app-bar height, where `record-table.tsx` pins at
`top-[var(--stack-top,0px)]` off the published sticky stack.

**Right:** `--stack-top`. A hard-coded offset is exactly the guess the stack
variable was introduced to remove, and the comment in `record-table.tsx`
explains why a wrong offset "just pushes the header down the page and leaves a
band of nothing above it".

### INC-5 — `ClientTime` is a private twelve-line copy of `ClientDate`

`record-story.tsx` reimplements the hydration contract because "`ClientDate` has
no time-only mode".

**Right:** add `mode: "time"` to `ClientDate` and delete the copy. Two
implementations of one hydration contract is one that will be fixed and one that
will not.

### INC-6 — Two different components are called `RecordTabs`

`components/crm/records/record-tabs.tsx` builds a record's *sections*;
`components/schools/records/record-tabs.tsx` is a *segmented population strip*
("All 879 / Active 842"). Both are good components; the collision costs a reader
a file-path check every time either is mentioned.

**Right:** the schools one is a population strip and should say so —
`PopulationTabs` or `CutTabs`. The CRM one keeps the name, because it builds the
tabs `RecordPageShell` consumes.

### INC-7 — `parseRecordHref` only understands `/crm/`

`lib/records/registry.ts` already describes every record type in the product,
school types included, with an `href` for each. `parseRecordHref` hard-codes a
CRM-only segment map, so peek and the trail are structurally unavailable to any
other module even after it starts using `EntityLink`.

**Right:** derive the segment map from the registry. This is the single change
that unblocks the whole of the schools linking work below.

---

## Part 12 — The gap

Measured on the current tree. These are the build agents' work queue; each entry
names the rule it breaks.

### The headline numbers, verified

| | CRM | schools back office | management / preferences |
|---|---|---|---|
| files using `EntityLink` | **17** | **0** | 0 |
| files using `RecordTable` / `RecordCell` / `recordCellTone` | all lists | **0** | 0 |
| files using `ViewToolbar` or `LayoutSwitch` | all lists | **0** | 0 |
| files using `DirectoryName` / `DirectoryCell` | people | **0** | 0 |
| files using `PersonAvatar` (schools' own binding) | — | **25** | 0 |
| files using `DataTable` | — | **25** | 3 |
| back-office screens rendering a hand-rolled row list | — | **10** | 0 |
| `RecordPageShell` + `RecordAttributes` record pages | 6 | **6** | 0 |
| `RelationAttribute` call sites | **5 files, 7 uses** | **0** | 0 |
| `RecordStory` call sites | **4 record pages + `record-tabs`** | **0** | 0 |

Read that together and the shape of the work is clear. Schools has the **record
page** (six of them, on the shared shell, with editable properties) and it has
the **states** (`schools/common/states.tsx` is as good as anything in CRM). What
it does not have is the **linking web** and the **composed list**: no peek, no
trail, no repointable relation, no shared cell tone, no arrangement switch, and
an identity cell re-implemented by hand in every file that draws one.

The management module has none of it, and is additionally missing the settings
band that Part 6 describes.

---

### 12.1 — The identity cell (Part 1)

`PersonAvatar` exists and is used 25 times. What is missing is the *composed
cell* and the shared name/subtitle treatment.

**Re-implements the identity cell by hand (IDENT-1, IDENT-3, IDENT-4).** Each
of these writes its own `flex items-center gap-2|gap-3` + avatar + name + muted
subtitle, and none uses `RecordTableName` or `DirectoryName`. Subtitles are
`text-sm text-muted-foreground`, not `acct-caption font-mono`:

- `components/schools/students/students-list-content.tsx:328` (and again at
  `:664` for the mobile list)
- `components/schools/students/class-students-content.tsx:269` (and `:539`)
- `components/schools/staff/school-staff-content.tsx:151`
- `components/schools/teachers/schools-teachers-content.tsx:351`
- `components/schools/guardians/guardians-content.tsx:256`
- `components/schools/admissions/schools-admissions-content.tsx:97`
- `components/schools/boarding/boarding-allocations-content.tsx:121`
- `components/schools/reports/reports-arrears-content.tsx`
- `components/schools/fees/schools-fees-content.tsx`
- `components/schools/goals/goals-oversight-content.tsx`
- `components/schools/homework/homework-oversight-content.tsx`
- `components/schools/attendance/absence-follow-up-content.tsx`
- `components/schools/boarding/leave-requests-panel.tsx`
- `components/schools/boarding/welfare-content.tsx`
- `components/schools/library/library-loans-content.tsx`
- `components/schools/meetings/meetings-admin-content.tsx`
- `components/schools/messages/office-inbox-content.tsx`
- `components/schools/transport/transport-content.tsx`
- `components/preferences/organization/users-preferences.tsx:244` — no avatar at
  all, and the email is a `t-caption t-muted` second line rather than the
  relation blue

**No supporting line under the name at all (IDENT-2).** Two guardians called
"Moyo, T" are indistinguishable in the list that exists to tell them apart:

- `components/schools/guardians/guardians-content.tsx:256` — name cell is avatar
  + `lastName, firstName` and nothing else. The guardian number is a *separate
  first column*, which is the fact that belongs on the second line.

**Names a person with no mark at all (IDENT-1).** Back-office screens that
render person names without `PersonAvatar` or `RecordMark`:

- `components/schools/admissions/schools-admissions-content.tsx`
- `components/schools/admissions/admissions-board-content.tsx`
- `components/schools/students/year-rollup-content.tsx`
- `components/schools/boarding/boarding-leave-content.tsx`
- `components/schools/boarding/boarding-hostels-content.tsx`
- `components/schools/library/library-content.tsx`
- `components/schools/documents/school-documents-content.tsx`
- `components/schools/records/student-attendance-tab.tsx`
- `components/schools/assessments/class-assessments-content.tsx`
- `components/schools/assessments/homework-content.tsx`
- `components/schools/results/sheet-detail-dialog.tsx`

**Link ink is inconsistent within schools (IDENT-4, SHAPE-4).** Three treatments
across four directories:

- `schools-teachers-content.tsx:357` — `text-[var(--text-link)] hover:underline`
- `school-staff-content.tsx:157` — `font-medium hover:underline`, no colour
- `students-list-content.tsx:338`, `class-students-content.tsx:279` —
  `hover:underline` only, so there is no cue until the pointer arrives

All three break WEB-2: the cue must be a standing underline, not a hover-only
one.

**An email set as an identifier (SHAPE-4, IDENT-8).**

- `components/schools/teachers/schools-teachers-content.tsx:361` — renders
  `employeeCode / user.email` as one mono muted line. The code is a `code` and
  the email is an `email`; one of them should be brand blue and a `mailto:`, and
  `recordCellTone` already knows which.

---

### 12.2 — List or table (Part 2)

**Uses `DataTable` where a list is the right shape (SHAPE-1).** These are
find-and-open registers — nobody scans a column of them for a comparison — and
each spends a header row and five to seven columns on it:

- `components/schools/subjects/schools-subjects-content.tsx` — 7 columns
  (Code, Name, Type, Pass mark, Classes, Status, actions)
- `components/schools/classes/schools-classes-content.tsx` — 7 columns, twice
  (classes, then streams)
- `components/schools/notices/schools-notices-content.tsx` — 7 columns
- `components/schools/guardians/guardians-content.tsx` — 7 columns
- `components/schools/academics/schools-calendar-content.tsx`
- `components/schools/academics/school-day-content.tsx`
- `components/schools/academics/grading-content.tsx`
- `components/schools/teachers/teacher-assignments-content.tsx` — 5 columns
- `components/preferences/organization/departments-preferences.tsx`
- `components/preferences/organization/sites-preferences.tsx`

The tables that are **correctly** tables, and should be left alone: the fee
ledger, the arrears report, the mark moderation queue, the register oversight
board, the absence follow-up list, the results overview — money and counts
scanned down a column, which is exactly what SHAPE-1 reserves a table for.

**Hand-rolled row list where `RecordList` exists (SHAPE-1, INC-1).** Ten
back-office screens render their main collection as a bespoke `<ul>` of rows or
cards. They have the right *shape* and none of the shared grammar — no
`min-h-11`, no `primary` fact, no `kind` resolver, no shared skeleton:

- `components/schools/boarding/bed-board-content.tsx`
- `components/schools/boarding/boarding-hostels-content.tsx`
- `components/schools/boarding/welfare-content.tsx`
- `components/schools/library/library-content.tsx`
- `components/schools/library/library-loans-content.tsx`
- `components/schools/meetings/meetings-admin-content.tsx`
- `components/schools/messages/office-inbox-content.tsx`
- `components/schools/transport/transport-content.tsx`
- `components/schools/homework/homework-oversight-content.tsx` (mixed with a table)
- `components/schools/reports/schools-reports-enhanced-content.tsx` (mixed)

*This work is blocked on INC-1 — move `RecordList` to `components/records/`
first.*

**No arrangement switch anywhere (SHAPE-2).** `LayoutSwitch` is used 0 times
outside CRM. Every schools list is one shape, permanently, with no way to ask
the other question. The roll (`students-list-content.tsx`) is the clearest case:
it is both a directory you search and a register you compare fee standing down.

**A table with no phone fallback (SHAPE-3).** `DataTable` accepts
`mobileListRenderer`/`mobileCardRenderer`; these 15 files pass neither, so at
390px they are a sideways scroll:

- `components/schools/attendance/absence-follow-up-content.tsx`
- `components/schools/attendance/register-oversight-content.tsx`
- `components/schools/goals/goals-oversight-content.tsx`
- `components/schools/staff/school-staff-content.tsx`
- `components/schools/results/publishing-content.tsx`
- `components/schools/results/moderation-queue-content.tsx`
- `components/schools/results/results-overview-content.tsx`
- `components/schools/boarding/boarding-allocations-content.tsx`
- `components/schools/boarding/leave-requests-panel.tsx`
- `components/schools/homework/homework-oversight-content.tsx`
- `components/schools/reports/reports-arrears-content.tsx`
- `components/schools/reports/schools-reports-enhanced-content.tsx`
- `components/schools/notices/schools-notices-content.tsx`
- `components/schools/teachers/teacher-assignments-content.tsx`
- `components/schools/admissions/schools-admissions-content.tsx`

`students-list-content.tsx`, `class-students-content.tsx` and
`guardians-content.tsx` do pass one — they are the model to copy.

**No shared cell tone (SHAPE-4).** `recordCellTone` is used 0 times outside CRM,
so each schools screen decides for itself which grey a phone number is. Sample
divergences already in the tree: `guardians-content.tsx:272` sets a phone as
`font-mono text-sm tabular-nums`; `users-preferences.tsx:273` sets a date as
`t-mono`; `schools-teachers-content.tsx:361` sets an email as mono muted.

---

### 12.3 — The record web (Part 3)

**`EntityLink` appears in 17 CRM files and 0 schools files.** Nothing in schools
peeks, nothing pushes the trail, and a reference on a pupil's page is a plain
`next/link` that takes you away from what you were reading.

Highest-value call sites, in order:

1. `components/schools/records/student-record-page.tsx` — the guardians on the
   record, the class, the hostel, the invoices
2. `components/schools/records/guardian-record-page.tsx` — the children
3. `components/schools/records/class-record-page.tsx` — the teacher, the subjects
4. `components/schools/records/teacher-record-page.tsx` — the classes, the
   subjects, the HR employee record
5. `components/schools/records/hostel-record-page.tsx`,
   `subject-record-page.tsx`
6. every list name cell listed in 12.1

*Blocked on INC-7.* `parseRecordHref` returns null for every `/schools/` path,
so an `EntityLink` added today is a plain link with an underline. Fix the parser
against `lib/records/registry.ts` first; the registry already carries `href` for
`STUDENT`, `GUARDIAN`, `TEACHER`, `CLASS`, `SUBJECT` and `HOSTEL`.

**`RelationAttribute` has 0 call sites outside CRM (WEB-5).** Every single
reference a school record carries is set at creation and correctable only there.
Concrete cases: a pupil's class and hostel, a class's form teacher, a teacher's
HR employee record, a guardian's primary child. All six schools record pages
build `RecordAttribute[]` already, so this is an addition to an existing array
rather than new structure.

**The story is split across tabs, and half of it is one table (WEB-9).**
`components/schools/records/student-overview-tab.tsx` *does* assemble a
cross-table timeline — registers, marks, fees, boarding, welfare, library — with
a kind filter. It is the right idea, hand-rolled: it does not use `RecordStory`,
`StoryEvent` or `eventKindStyle`, it has no day headings, no folding of
mechanical runs, no boxing of written prose, and its dates go through a
module-level `Intl.DateTimeFormat("en-GB")` rather than the hydration contract.

Worse, the conversation is somewhere else: notes live in a separate **Notes**
tab (`SubjectNotes`), so a pupil's story is "whichever chapter that table
happened to keep" — exactly the failure `record-story.tsx` names. `WEB-8` says
these are one feed.

Files: `components/schools/records/student-overview-tab.tsx`,
`components/schools/records/student-record-page.tsx:674` (the Notes tab),
and the equivalent split on `guardian-record-page.tsx`,
`teacher-record-page.tsx`, `class-record-page.tsx`, `subject-record-page.tsx`,
`hostel-record-page.tsx`.

**No shared record tabs (WEB-7).** Each of the six schools record pages composes
its own tab array. That is the five-copies problem `record-tabs.tsx` was written
to end, one module over. A `schools/records/record-sections.ts` mirroring
`crm/records/record-tabs.tsx` — one `notesTab`, one `filesTab`, one `historyTab`
built from a `RecordRef` — is the shape.

---

### 12.4 — Density and economy (Part 4)

**Spelled-out verbs in a table row (DENS-2).** The worst offender is not in
schools:

- `components/preferences/organization/users-preferences.tsx:280` — an
  `"Actions"` column declared `width: "22rem"` holding "Permissions",
  "Deactivate"/"Activate" and more, as text buttons, in a four-column table.
  352px of a row given to verbs.
- `components/preferences/organization/departments-preferences.tsx:215`
- `components/preferences/organization/sites-preferences.tsx:225`

**`RecordActions` used inline inside a table or row list (DENS-2).** The
component's own comment says "use `menu` in a table" and names the measurement
(1,145px of columns in 1,129px of space). These call sites still pass the
default:

- `components/schools/fees/schools-fees-content.tsx` — 10 uses, 6 with `menu`;
  4 inline, and three of those sit in `"Actions"` columns (`:1004`, `:1096`, `:1186`)
- `components/schools/teachers/schools-teachers-content.tsx` — 4 uses, 3 with
  `menu`; `"Actions"` columns at `:423`, `:519`, `:610`
- `components/schools/guardians/guardians-content.tsx:302` — `"Actions"` header
- `components/schools/boarding/boarding-allocations-content.tsx`
- `components/schools/boarding/leave-requests-panel.tsx`
- `components/schools/boarding/hostel-rooms-panel.tsx` (2 uses)
- `components/schools/boarding/boarding-hostels-content.tsx`
- `components/schools/boarding/bed-board-content.tsx`
- `components/schools/library/library-content.tsx` (2 uses)
- `components/schools/library/library-loans-content.tsx`
- `components/schools/transport/transport-content.tsx` (3 uses)
- `components/schools/meetings/meetings-admin-content.tsx`
- `components/schools/messages/office-inbox-content.tsx` (2 uses)
- `components/schools/timetable/resources-content.tsx`
- `components/schools/timetable/schools-timetable-content.tsx`
- `components/schools/classes/class-streams-panel.tsx`
- `components/schools/classes/class-subjects-panel.tsx`
- `components/schools/academics/school-days-content.tsx`
- `components/schools/academics/school-custom-fields-panel.tsx`
- `components/schools/fees/class-fees-content.tsx` (1 of 2)
- `components/schools/guardians/guardian-children-panel.tsx`
- `components/schools/results/mark-sheets-content.tsx`
- `components/schools/results/class-results-content.tsx`
- `components/schools/imports/schools-import-content.tsx`
- `components/schools/teachers/teacher-assignments-panel.tsx`
- `components/schools/teachers/teacher-employee-panel.tsx` (2 uses)
- `components/schools/schools-dashboard-content.tsx`
- `components/schools/records/student-attendance-tab.tsx`

The record pages (`student-record-page.tsx`, `guardian-record-page.tsx`,
`teacher-record-page.tsx`) are the legitimate `inline` case — "the detail-page
headers, where the verbs are the point of the page" — and should be left.

**No labelled/unlabelled split for narrow desktops (DENS-3).** No schools or
management control follows the `LayoutSwitch` pattern of dropping a painted
label at a breakpoint while keeping the `sr-only` name.

---

### 12.5 — Page frame and the settings surface (Parts 5 and 6)

The management module is the specific ask here. Its shells are
`components/settings/management-shell.tsx` and
`components/preferences/preferences-shell.tsx`; its content is
`components/management/master-data/master-data-page.tsx` and
`components/preferences/organization/*`.

**No band at all (PAGE-4, SET-1, SET-2, SET-3).** Both shells register the title
with `PageChrome` — correct, PAGE-3 — and then render the section's description
as an ordinary `<p className="t-body t-muted">` that scrolls away with the
content. There is no permanent label for the section, no permanent home for the
section's primary action, and no "saves as you go".

- `components/settings/management-shell.tsx:132` — `<p>` description, no band
- `components/preferences/preferences-shell.tsx:116` — same

**What matching CRM means, concretely:** the `CrmPage` band with
`title={active.label}`, `description={active.description}`, and a `bandSlot`
carrying `saves as you go` plus the section's one create button. `CrmPage` is
already module-neutral apart from its filename; it either moves to
`components/layout/` or gains a sibling with the same three widths.

**The title is stated twice (PAGE-3).** `master-data-page.tsx:74` passes
`hideHeader` to `ManagementShell` — which only suppresses the description — and
then hands the same `title` to the DS `MasterData` assembly, which composes its
own header. So the app bar says "Job grades" and the page says it again about
sixty pixels lower.

**A hard width cap on a table surface (PAGE-2).** `management-shell.tsx:134` wraps
its content in `max-w-[96rem]`. That is the `max-w-7xl` failure one size up: a
cap on a surface that is entirely tables and a detail pane.

**No sticky stack (PAGE-5, PAGE-6).** Neither management shell publishes
`--stack-next`, so no table header in the module can pin, and the description
paragraph sits between the bar and the content as a strip that scrolls.

---

### 12.6 — Filters and narrowing (Part 7)

**No `ViewToolbar` outside CRM (FILT-1).** Schools uses
`components/schools/common/table-controls.tsx`, which states the same law
correctly — one row directly above the table, tabs then search then filters then
actions — and is a good component. The gaps against Part 7 are:

- **no "filtered to" chips (FILT-3).** `FilterSelect` renders a label above a
  trigger; the trigger shows the current value, but the label is a separate line
  rather than `label value` in one readable chip, so a row of five filters is
  ten lines of text.
- **no phone collapse and no active count (FILT-4).** `TableControls` wraps.
  `students-list-content.tsx` has its own `filtersOpen` disclosure with a
  "Filter" button and its own reasoning — which is the right instinct, done once
  in one file rather than in the shared control.
- **no count in the toolbar (FILT-8).** "50 of 214" is in the band on schools
  screens, which is the wrong place by PAGE-4: it moves when the filters move,
  so it is not state, it is an answer to the narrowing question.

Files: `components/schools/common/table-controls.tsx`,
`components/schools/common/filter-select.tsx`, and every screen that composes
them.

**Management has no filter grammar at all.** `MasterDataPage` takes `search` and
`filters` as opaque `ReactNode` slots and renders them inside the DS assembly's
toolbar; `users-preferences.tsx`, `departments-preferences.tsx` and
`sites-preferences.tsx` pass nothing.

---

### 12.7 — States (Part 8)

Schools is in good shape here and should be left alone: `states.tsx` is used by
every back-office screen, and only two files bypass it
(`components/schools/results/sheet-detail-dialog.tsx` has `NothingYet` but never
`NothingMatched`, so a filtered-empty sheet reads as an unmarked one;
`components/schools/common/grade-picker.tsx` hand-rolls an empty).

**Management has none of it.**

- `components/management/master-data/master-data-page.tsx:102-105` — the loading
  state *is* the empty state: one centred `<p>` that says "Loading…" or
  "Nothing here yet." That breaks STATE-1 (one sentence for three causes),
  STATE-2 (an empty rendered as a loading slot) and STATE-3 (no skeleton at all;
  the page reflows when the rows land).
- `components/preferences/organization/users-preferences.tsx:428`,
  `departments-preferences.tsx:293`, `sites-preferences.tsx:317` — pass
  `isLoading` to `DsDataTable` and declare no empty state, no skeleton and no
  load-error treatment.
- `components/preferences/organization/pricing-panel.tsx:169` —
  `<Skeleton className="h-64 w-full" />`, the generic grey block STATE-3 names.

There is no `SavingOverlay` equivalent anywhere in management (STATE-5), and no
permission-aware refusal copy (STATE-6) — the management screens gate on
`canMutate` and hide, where the rule is to disable with the reason.

---

### 12.8 — Dates and times (Part 9)

**`ClientDate` is used in 29 CRM files and 1 schools file** (a portal screen), out of 56 across the product.
Every other schools date is either formatted through
`lib/schools/format.ts` — which is deterministic, so safe, but fixed to one
locale — or computed in the cell renderer.

**Breaks TIME-1/TIME-4 outright** — `new Date(value).toLocaleDateString()` inside
a render, which is locale- and timezone-dependent and therefore differs between
the server render and the client's:

- `components/schools/attendance/absence-follow-up-content.tsx:191`
- `components/schools/attendance/absence-follow-up-content.tsx:206`
- `components/schools/guardians/guardian-portal-panel.tsx:39`
- `components/schools/academics/grading-content.tsx:101`

**Deterministic but locale-blind** (safe today; should move to `ClientDate` when
the module gets a reader outside one locale):

- `components/schools/results/sheet-state.tsx:92,100` — hard-coded `"en-GB"`
- `components/schools/records/student-overview-tab.tsx:205` — module-level
  `Intl.DateTimeFormat("en-GB")`, on the one timeline schools has
- `components/schools/schools-dashboard-content.tsx:1102` — `SHORT_DAY.format(new Date(...))`

**Management:** `users-preferences.tsx:273` renders `formatDate(row.updatedAt)`
in a `t-mono` span with no hydration contract; the same pattern repeats in
`departments-preferences.tsx` and `sites-preferences.tsx`.

---

### 12.9 — Copy (Part 10)

**Title case in a column header (COPY-1):**

- `components/schools/fees/schools-fees-content.tsx:715` "Invoice No",
  `:758` "Due Date", `:851` "Receipt No", `:861` "Payment Method",
  `:900` "Receipt Date", `:1049` "Refund No", `:1150` "Waiver Type",
  `:1280` "Fee Structure", `:1302` "Total Amount", `:1311` "Mandatory Amount"
- `components/schools/subjects/schools-subjects-content.tsx:175` "Pass Mark"

`guardians-content.tsx:241` ("Guardian no") is the correct form and is the one
to copy.

**A labelled "Actions" column (COPY-6, DENS-2):**

- `components/schools/fees/schools-fees-content.tsx:1004,1096,1186`
- `components/schools/guardians/guardians-content.tsx:302`
- `components/schools/teachers/schools-teachers-content.tsx:423,519,610`
- `components/preferences/organization/users-preferences.tsx:280`
- `components/preferences/organization/departments-preferences.tsx:215`
- `components/preferences/organization/sites-preferences.tsx:225`

---

## Suggested order of work

The dependencies are real, and getting them wrong means doing the linking work
twice.

1. **INC-7** — make `parseRecordHref` read `lib/records/registry.ts`. Nothing in
   12.3 works before this.
2. **INC-1** — move `record-list.tsx` and `record-list-groups.tsx` to
   `components/records/`. Nothing in the 10 hand-rolled list screens can be
   shared before this.
3. **12.1** — the identity cell, list by list. Cheapest change with the widest
   visible effect, and it forces `recordCellTone` into the module.
4. **12.5** — the management band and widths. Self-contained, and it is the pair
   the module was explicitly asked to match.
5. **12.4** — `layout="menu"` and the "Actions" columns. Mechanical, and it buys
   back the width the identity cell wants.
6. **12.2** — arrangement switch and phone fallbacks, once `RecordList` is
   shared.
7. **12.3** — `EntityLink` through the record pages, then `RelationAttribute`,
   then the story.
8. **12.7, 12.8, 12.9** — management states, the four hydration breaks, and the
   copy sweep. Independent of everything above and safe to run in parallel.

Everything in Part 11 is a CRM change and can run alongside any of it, except
INC-1 and INC-7, which gate the rest.
