# Campus expansion canvas — Foundation

The first page of the expansion canvas. Three artboards: one document sheet that
states the rules the other twenty-four screens are held to, and two app screens
that demonstrate the two rules the sheet cannot prove in prose — where a second
navigation surface is allowed, and where the campus in scope lives.

Source: `design/campus/screens/expansion-foundation.mjs`
Kit: `design/campus/lib/expansion-kit.mjs`
Artboards: `design/campus/expansion/Main.dc.html`, `ShellLaw.dc.html`, `CampusScope.dc.html`

**Quoting convention.** Copy is quoted as it renders, with HTML entities resolved
(`&mdash;` as an em dash, `&rsquo;` as a curly apostrophe). Where the source wraps a
phrase in `<b>` or `<span class="mono">` the emphasis is preserved in the quote,
because the emphasis is part of what the sentence does.

---

## The shell every screen sits in

Stated once. It applies to **ShellLaw** and **CampusScope**. It does not apply to
**ExpansionMain**, which is a document sheet with no chrome at all — see its entry.

**Sidebar, 248px.** Sits on the page ground (`#F7F8FA`), separated from the workspace
by a 1px `borderStrong` rule. Three stacked parts:

- A **48px workspace header**: a 26px dark rounded tile with a graduation-cap glyph, the
  group's name at 13px/600, and — only when the screen declares a `scope` — a second line
  beneath it carrying a 5px dot and the campus in scope at 10.5px/600. A caret sits at the
  right edge. The dot is **green** for a named campus and **brand blue** for `All campuses`.
  Omit `scope` entirely and the header shows the school's name alone, which is what every
  tenant sees today.
- A **scrolling list of destinations**, grouped. Group labels are uppercase 10px with `.09em`
  tracking and a disclosure chevron. **The group holding the active page is open; every other
  group is shut.** Rows are 28px with a 14px glyph and a 12.5px label. The active row is a
  white pill — surface fill, 1px border, a barely-there shadow, and a 2px brand bar on its
  leading edge — not a saturated fill. A destination that does not exist yet carries a 7px
  hollow brand ring on its right edge.
- An **identity card** pinned to the bottom: initials avatar, name, role, overflow dots.
  Default `Rudo Makoni` / `Deputy Head`.

The eleven groups, in order: *(ungrouped)* Home, Create · *(ungrouped)* School Overview ·
**Campuses** · **Students** · **Fees** · **Classroom** · **Conduct** · **Welfare** ·
**Teaching** · **Results** · **Services** · **Reports & Documents** · then a rule, then
*(ungrouped)* Human Resources, Payroll, Finance, Reporting, Management (with children
Academic setup and Portals).

**There is no second sidebar.** That is the whole point of this page.

**App bar, 48px.** A 30px panel control at the left (a back chevron when a screen declares
`back`), then the page's only name at 13.5px/700, then an optional caption at 11.5px behind
a hairline divider, then a flexible gap, then a 260px search field carrying a magnifier, a
placeholder and a `⌘K` key cap, then a bell, then at most one primary action.

**Sticky page band.** `position: sticky`, height driven by the density token
(`44px` compact, `52px` cosy). State chips on the left as `{label, value, tone}`; secondary
actions pushed right. It never carries the page's name.

**Content.** `page()` — 12px top padding, 16px sides, 24px bottom, a 12px vertical gap
between regions.

---

## ExpansionMain — no app bar (a document sheet)

- **Route**: none. **Story**: none.
- **Not a screen.** It is not declared through `defineScreen`, so it emits no
  `spec/ExpansionMain.html` and no `checklist/ExpansionMain.json`. It has no sidebar, no app
  bar, no band and no search. It is a 1180 × 1980 page of paper, flagged `print: 'flow'` in
  `canvas.json` so it prints as a document rather than as an artboard.

**Who opens it, and what they came to do.** Whoever has been asked to approve or kill twenty-four
unbuilt screens — a design lead or the engineer who will be asked to cost them — opening the
canvas cold on a Tuesday with no context beyond the expansion plan. They came to find out what
is being proposed and on whose authority, and they will decide in the first thirty seconds
whether the shell change is a land grab or a correction. The sheet is built so the second
question is answered before the first.

### Layout, top to bottom

**1. Masthead** — a two-column block over a 2px dark rule.

Left, up to 760px wide: an eyebrow, `Corelith Campus · Expansion canvas · Sheet 1`; then the
title at 34px; then a lede paragraph at 14px.

> **One sidebar, and twenty-four screens behind it**

> Phases 2 and 3 of the expansion plan propose five new areas of the campus product. Drawing
> them made the shell’s own problem obvious first: the module puts two sidebars in front of
> every screen, and the platform’s layout rules allow one.

Right, right-aligned: a label `Navigation columns`, then a 30px mono figure reading
`2` (red) `→` (faint) `1` (green), then `and +232px of content`. It is a scorecard, and it is
the only number on the sheet that is allowed to be large. It sits here rather than in §1
because the argument has to land before the diagram is read, not after.

**2. Section 1 — "One sidebar, not two"**

Each section is headed by a 20px dark square carrying its number and a 17px heading, with a
12.5px lede indented 30px to align under the heading text. Section 1's lede:

> The module canvas draws a 280px workspace sidebar, then a 200px module rail, then the page.
> That is two navigation columns before any content, and the platform has already written down
> that it is wrong.

Below it, a **before/after diagram drawn to a third scale**. Two labelled groups of 128px-tall
blocks side by side:

| Group heading | Blocks (label / sub) | Fill |
|---|---|---|
| **The module canvas today — two sidebars** (red) | `Workspace sidebar` / `280px` | brand-soft |
| | `Module rail` / `200px` | red — this is the block being condemned |
| | `Content` / `1120px` | white |
| **This canvas — one** (green) | `Sidebar` / `248px` | brand-soft |
| | `Content` / `1352px` | white |

The scale is honest: 280 + 200 + 1120 and 248 + 1352 both total 1600, the artboard width of
every other screen on the canvas.

Beneath the diagram, a two-column grid of two bordered cards.

*Card: **What the rules already say***

> `pr-71-reference-design-system.md` splits the shell into a left navigation rail, a main
> workspace and an optional right detail rail. Three regions, one of them navigation.

> `platform-ux-playbook.md` does describe a left vertical tab rail — for a multi-table context
> **inside** a page, where only the active panel may render a table. It is not a second
> navigation column, and using it as one borrows a rule from where it does not apply.

*Card: **Where a second surface is genuinely needed***

> It is a **vertical rail**: 56px, icons, no labels. Never a second labelled sidebar.

> Nothing on this canvas needs one for navigation. The artboard beside this sheet draws the one
> real case — the fee ledger’s six segments — so the rule is a drawing rather than a sentence to
> be taken on trust.

> The 200px the rail gives back is not empty space. It is most of a table column, on every screen
> in the module.

The two cards are a citation and a concession, in that order. The citation has to come first
because the change is otherwise a preference.

**3. Section 2 — "So the rail becomes groups in the sidebar"**

Lede:

> Campus work leads, grouped the way a school is organised; the rest of the platform follows
> after a rule. Groups collapse — the one holding the page you are on is open, the rest are
> shut — which is what keeps forty-one destinations inside one column. Drawn here with
> everything open, which is not how it ships.

A two-column layout: a **248px sidebar preview** on the left, drawn at full width with every
group expanded and no active row, and a column of prose and cards on the right. Drawing it open
contradicts the shipped behaviour on purpose, and the lede says so in its own last sentence.

The right column, in order:

> **The words did not change; the grouping did.** Every campus label is the string
> `lib/navigation.ts` already uses. A canvas is not allowed to rename a shipped destination
> quietly, so it has not.

*Card: **Three groups moved, and each move says something***

> **People became Classroom.** Guardians left for Students, where they belong to a pupil. What is
> left is who stands in front of a class, whether they are there, and who covers when they are not.

> **Boarding became Welfare, and Pastoral notes joined it.** A pastoral note is not a discipline
> record. Filing it under Conduct would have told every person who opened the menu that it was.

> **Public exams folded into Results.** A head looking for November’s grades does not first decide
> whether they are internal or public.

*Card: **Academic setup and Portals sit under Management***

> Which is where the routes already are: classes, subjects, years and identity all live under
> `/management/master-data/schools/` today. Setup is not daily work and should not hold a group in
> the sidebar. Opening it lands on a settings shell with its own left settings nav — the pattern the
> playbook names for exactly this.

Then, outside any card, a single closing line:

> **A hollow ring marks a destination that does not exist yet.** Said once, here; no artboard repeats
> it. When a row ships, the ring comes off in one place.

**4. Section 3 — "What is behind those groups"**

Lede:

> Five areas, each traceable to a row in `docs/expansion-plan/corelith-campus-expansion-plan.md`.
> Two are debt — sold in a band or an add-on today and not built — and three are new capability that
> needs a packaging decision before a line is written.

A four-column table. Columns, verbatim: **Area** (190px) · **Stories** (130px) · **Screens** (74px,
right-aligned) · **Why it exists** (fluid).

| Area | Stories | Screens | Why it exists |
|---|---|---|---|
| Group and campuses | `S-11.1 – S-11.7` | `6` | **Debt.** The GROUP band sells multi-campus consolidation. No `School*` model carries a campus. |
| Conduct and pastoral | `S-12.1 – S-12.3` | `5` | Unparks `S-P.1`. Every school keeps a conduct record; recommended into STANDARD at no extra price. |
| Public exams | `S-13.1 – S-13.2` | `5` | The one thing every Zimbabwean secondary school does that the pack cannot. Add-on, $99 a term. |
| Leavers and alumni | `S-13.4 – S-13.5` | `4` | `S-1.5` already graduates a pupil. Graduating currently leads nowhere. |
| Campus operations | `S-14.1, S-14.3` | `4` | **Debt.** The fiscalisation add-on promises receipts for “tuck shop and uniform sales”. Neither exists. |

The Screens column sums to 24, which is the number in the title. This is the only place on the page
that connects the headline to the artboards; it is a table because it is one, and because the editor
needs to be able to check each row against the plan.

**5. Section 4 — "Where the campus in scope lives"**

Lede:

> In the sidebar header, under the group name. Not the app bar, not the band. The app bar carries the
> page’s only name (canvas law §1); the band carries the state that changes on this page (§2). The
> campus in scope is neither: it belongs to the whole workspace, it survives navigation, and the header
> has carried a caret beside the school’s name since the first artboard.

Three side-by-side specimens, each a 48px workspace header drawn in isolation with a caption above and
a note below:

| Caption | Org line | Campus line | Note below |
|---|---|---|---|
| One school, as it ships today | Chishawasha High | *(none)* | Nothing changes. This is every tenant on the product now, and the S-11.1 backfill gives each of them one campus without telling them so. |
| A group, one campus in scope | Chishawasha Trust | Borrowdale campus (green dot) | The green mark says the scope is narrowed. Every list, every total and every action below it is Borrowdale only. |
| A group, all campuses | Chishawasha Trust | All campuses (brand dot) | Brand rather than green, because this is a destination somebody chose — not a filter they forgot to set. |

Three specimens rather than one annotated diagram, because the argument is about a colour difference
that only reads when the two colours are adjacent.

**6. Section 5 — "Campus is navigation, not a filter"**

Lede, one line: *The rule `S-4.6` set for year groups, for the same reason.* Two cards side by side.

*Card: **A campus’s list is reached through the campus***

> `/schools/campuses/[campusId]/students`, not `/schools/students?campus=…`. A bursar at Borrowdale has
> one campus, lands in it, and never sees another campus’s money by accident — not because a filter
> defaulted correctly, but because there was no other campus in the route.

*Card: **“All campuses” is a destination, not a default***

> It is a row somebody chose, drawn in brand rather than green. That difference matters on the day a debt
> is written off: “I thought I was in Borrowdale” has to be impossible to say.

**7. Section 6 — "The contract is emitted, not maintained"**

Lede:

> The module canvas keeps `checklist/<Screen>.json` as a second artefact beside the drawing. This canvas
> emits it.

Then a paragraph and a brand-toned alert.

> Every table column, card title, stat, filter, band chip and button is filed by the primitive that draws
> it, so the contract cannot drift from the artboard. Adding a column to a drawing adds it to the contract
> in the same keystroke.

*Alert (brand), title:* **Every screen on this canvas reports under NO PAGE — and should**

> Run `node scripts/campus-conformance.mjs`. “The canvas draws it, nothing renders it” is the right status
> for a proposal, and that list is the build queue. It shrinks as the work lands, because building the route
> is what removes the row.

### The verbs

None. The sheet has no buttons, no links, no rows to act on and no primary action. It is read, argued with,
and then either approved or not.

### The refusals

The sheet refuses on behalf of every other screen, in three sentences:

- A second labelled sidebar: *Never*, restated on ShellLaw as a table row.
- Renaming a shipped destination: *A canvas is not allowed to rename a shipped destination quietly, so it
  has not.*
- Reaching a campus's list through a query parameter: `/schools/campuses/[campusId]/students`, not
  `/schools/students?campus=…`.

### The copy that is doing work

1. > Drawing them made the shell’s own problem obvious first: the module puts two sidebars in front of every
   > screen, and the platform’s layout rules allow one.
2. > It is not a second navigation column, and using it as one borrows a rule from where it does not apply.
3. > The 200px the rail gives back is not empty space. It is most of a table column, on every screen in the module.
4. > **Boarding became Welfare, and Pastoral notes joined it.** A pastoral note is not a discipline record.
   > Filing it under Conduct would have told every person who opened the menu that it was.
5. > It is a row somebody chose, drawn in brand rather than green. That difference matters on the day a debt is
   > written off: “I thought I was in Borrowdale” has to be impossible to say.
6. > “The canvas draws it, nothing renders it” is the right status for a proposal, and that list is the build queue.

---

## ShellLaw — Ledger

- **Route**: `null` — the checklist declares no route, which is the point: nothing renders this yet.
- **Story**: `S-11.3`.

**Who opens it, and what they came to do.** The fiction is a Borrowdale bursar in the fee ledger at
mid-morning in Term 2, looking at invoices with $41,204 outstanding. The actual reader is whoever has just
read §1 of the sheet and wants to see the vertical rail in a page that has a genuine reason for one, rather
than in a diagram. The screen is therefore doing two jobs at once: it is a working ledger page, and it is the
exhibit for a layout rule.

**App bar.** Title `Ledger`. Caption `Term 2 · invoices`. Search placeholder `Search invoices`. Bell present.
**No primary action** — a ledger page that argues about layout does not also get a "New invoice" button.

**Sidebar.** Group `Chishawasha Trust`, campus `Borrowdale campus` with a green dot. Active destination
`Ledger and structures`, which means the **Fees** group is open and the other ten are shut. Identity card falls
back to `Rudo Makoni` / `Deputy Head`.

**Band.**

| Chip | Value | Tone | What the number means |
|---|---|---|---|
| `Outstanding` | `$41,204` | bad (red) | Money owed to Borrowdale on invoices issued and not settled |
| `Issued this term` | `842` | plain | Count of invoices raised in Term 2 at this campus |

Band action, right-aligned: a ghost **Export** button with a download glyph.

### Layout, top to bottom

The content region is a **horizontal flex with a minimum height of 600px**, split into two:

**Left — the 56px vertical rail.** Six 36px icon tiles, no labels, stacked with a 4px gap on a white surface
behind a hairline. The active tile is filled brand-soft with a brand-strong glyph. The six, in order, with the
glyph each uses and the label carried only in its `title` tooltip:

| Position | Label (tooltip only) | Glyph |
|---|---|---|
| 1 (active) | Invoices | Receipt |
| 2 | Receipts | CurrencyDollar |
| 3 | Credit on account | Wallet |
| 4 | Refunds | ArrowsClockwise |
| 5 | Waivers | Scales |
| 6 | Fee structures | Rows |

It is here rather than in the sidebar because these six are not destinations — they are six tables belonging to
one page, and the playbook's multi-table rule is what governs them.

**Right — the page**, at standard `page()` padding.

*Card + table: **When a second navigation surface is allowed***

Columns: **Surface** (190px) · **What it is for** (fluid) · **Width** (80px, right-aligned) · **How many** (150px).

| Surface | What it is for | Width | How many |
|---|---|---|---|
| Sidebar | Moving between destinations. Groups collapse; one is open. | `248px` | One, per window *(green, 600)* |
| Vertical rail | Choosing which table a page shows, where a page has several. Icons only — naming them is the page’s job, not the rail’s. | `56px` | One, inside a page |
| A second sidebar | Nothing. Two labelled columns make a reader decide twice which list they are navigating with. | `—` | **Never** *(red badge)* |

The table sits to the right of the rail so that the row describing a vertical rail is horizontally level with an
actual vertical rail. That adjacency is the entire composition.

*Alert (plain, information glyph): **This is the real case, not a demonstration***

It is directly below the table rather than above it because it answers the objection the table provokes — that the
rail was invented to justify the rule.

### The verbs

- **Export** (band, ghost). Exports the invoice list currently shown.
- The six rail tiles. Each swaps the single table the page renders; only the active panel may draw a table.
- No row verbs. No bulk actions. No primary action.

### The refusals

- **A second sidebar: `Never`.** The refusal is a red badge in a table cell, and the reason is the cell beside it:
  *Nothing. Two labelled columns make a reader decide twice which list they are navigating with.*
- **The rail refuses to carry labels.** *Icons only — naming them is the page’s job, not the rail’s.*
- **Only one table at a time.** *only the active panel may render a table.*

### The copy that is doing work

1. > Nothing. Two labelled columns make a reader decide twice which list they are navigating with.
2. > Choosing which table a page shows, where a page has several. Icons only — naming them is the page’s job, not the rail’s.
3. > Moving between destinations. Groups collapse; one is open.
4. > The fee ledger is one component behind six segments, and the playbook is explicit: a multi-table context uses a left
   > vertical tab rail, and only the active panel may render a table. Six icons and one table — not six more labels in a
   > column of their own.
5. > This is the real case, not a demonstration

---

## CampusScope — All campuses

- **Route**: `null`.
- **Story**: `S-11.3`.

**Who opens it, and what they came to do.** Elias Chikafu, Group Head of Chishawasha Trust, at about 07:50 on a Monday
in Term 2. He has four campuses and rights over all four. He opens the workspace at group level to see whether anything
went wrong over the weekend, notices three registers not taken at Marondera, and then clicks the caret in the sidebar
header to drop into Marondera — which is the moment this artboard freezes.

**App bar.** Title `All campuses`. Caption `Term 2 · 1,842 pupils`. Search placeholder `Search across four campuses`.
Bell present. **No primary action** — deliberately, because at group scope there is nothing you are allowed to create.

**Sidebar.** Group `Chishawasha Trust`, campus `All campuses` with a **brand** dot rather than green. Active destination
`All campuses`, so the **Campuses** group is open. Identity card: `Elias Chikafu` / `Group Head`.

**Band.**

| Chip | Value | Tone | What the number means |
|---|---|---|---|
| `Campuses` | `4` | plain | How many campuses the group holds |
| `In scope` | `All` | brand | Which of those four the page is reading — matching the brand dot in the header |

No band actions.

### Layout, top to bottom

**Region 1 — the campus popover, drawn open, over a scrim.** The artboard's overlay: a 300px card anchored at
`left: 12px; top: 52px` — directly beneath the sidebar header it belongs to — over a `rgba(22,24,29,.16)` scrim covering
the whole screen. It is the first thing described because it is the first thing seen; everything behind it is dimmed.

Header block: a section label reading `CHISHAWASHA TRUST`, then a 11.5px line:

> Four campuses, 1,842 pupils. You may act on all four.

Then five rows. Each row is a glyph, a name, a mono sub-line, and a right-aligned mono count:

| Row | Sub-line | Count | State |
|---|---|---|---|
| All campuses | `Consolidated — read and report` | `1,842` | selected — brand-soft fill, check glyph, brand-strong label |
| Borrowdale campus | `BOR · Primary and secondary` | `842` | building glyph |
| Marondera campus | `MAR · Secondary, boarding` | `514` | building glyph |
| Ruwa campus | `RUW · Primary` | `331` | building glyph |
| Norton campus | `NOR · Primary, opened Term 1` | `155` | building glyph |

The four campus counts sum to 1,842. The sub-lines carry the campus code, which is what will prefix an invoice number.

Footer: a ghost **Manage campuses** button with a settings glyph on the left, and the mono shortcut `⌘⇧C` on the right.

**Region 2 — a four-up stat row.** Behind the scrim, the first content region:

| Stat | Value | Tone | Note |
|---|---|---|---|
| `Pupils` | `1,842` | plain | — |
| `Collected this term` | `68%` | ok (green) | — |
| `Arrears over 60 days` | `$41,204` | bad (red) | — |
| `Registers not taken` | `3` | warn (amber) | `Marondera · this morning` |

The stat row is here rather than in the band because these are the group's figures, not this page's state, and because the
fourth one has to be able to name a campus in its note — a band chip has nowhere to put that.

**Region 3 — one card with a three-column table: "What the selector changes".**

Columns: **Surface** (280px) · **One campus in scope** (fluid) · **All campuses in scope** (fluid).

| Surface | One campus in scope | All campuses in scope |
|---|---|---|
| Lists and records | That campus only. | Every campus, with a campus column that cannot be sorted away. |
| Totals and reports | That campus’s figures. | Consolidated, with the per-campus split one click down. |
| Creating anything | Lands on that campus. | **Refused** — A record has to belong to a campus. Pick one first. |
| Money moving | Allowed, audited against that campus. | **Refused** — Read and report only. A write-off happens where the debt is. |

It is a table because the argument is a two-by-four comparison, and it sits directly beneath the stats because the stats are
the very consolidation the last two rows say you may look at but not act on.

### The verbs

- **Five popover rows.** Each navigates — it changes the route, not a filter. Choosing `Borrowdale campus` lands the same
  destination at `/schools/campuses/[campusId]/…`; choosing `All campuses` is itself a destination.
- **Manage campuses** (popover footer, ghost). Opens the campus register.
- **⌘⇧C** (popover footer, mono). Reopens this selector from anywhere.
- No primary action, no band actions, no row verbs in the table, no bulk actions.

### The refusals

Both refusals are drawn as a red `Refused` badge in the "All campuses in scope" column, each followed by the sentence that
explains it:

- **Creating anything** — *A record has to belong to a campus. Pick one first.*
- **Money moving** — *Read and report only. A write-off happens where the debt is.*

A third, softer refusal sits in the first row: at group scope the campus column **cannot be sorted away**, so you can never
lose track of which campus a row belongs to.

### The copy that is doing work

1. > Four campuses, 1,842 pupils. You may act on all four.
2. > Consolidated — read and report
3. > Every campus, with a campus column that cannot be sorted away.
4. > A record has to belong to a campus. Pick one first.
5. > Read and report only. A write-off happens where the debt is.
6. > Marondera · this morning

---

## Open questions

1. **Two screens, one number, and no way to tell them apart.** `$41,204` appears on ShellLaw as the band chip
   `Outstanding` for **Borrowdale alone**, and on CampusScope as the stat `Arrears over 60 days` for **all four campuses**.
   `842` appears on ShellLaw as `Issued this term` (invoices) and in the CampusScope popover as Borrowdale's pupil count.
   A reader moving between the two artboards will read one figure as the other. Either the numbers should differ, or the
   coincidence should be deliberate and labelled.

2. **The band contradicts the refusal it sits above.** CampusScope says money may not move at group scope, and ShellLaw —
   scoped to one campus — is the screen where it may. But CampusScope's band chip `In scope: All` is drawn in brand, the
   same brand used for the active state on the rail and for the selected popover row. Brand is carrying three meanings on
   one page: *chosen destination*, *currently active*, and *this is the permissive-looking state that is actually the
   restricted one*. Green means narrowed and blue means wide open, which is the opposite of what a traffic-light reading
   suggests. The sheet argues for this in §4 and §5; it is worth testing whether the argument survives contact with a
   bursar who has not read the sheet.

3. **The six rail segments are named nowhere a reader can see them.** On ShellLaw the vertical rail's labels exist only as
   `title` tooltips, and the card beside it never lists them — the alert just says "six segments". On a static artboard, and
   on a printed sheet, the six icons are unidentifiable. The rule *naming them is the page’s job, not the rail’s* is stated,
   but the page does not then do that job on this artboard.

4. **The rail scrolls.** The vertical rail is rendered inside the scroll container, beneath the sticky band. On a long
   invoice list it scrolls out of view, taking the only means of switching segments with it. The sidebar has its own scroll
   region; the rail does not.

5. **The contract does not record every button, although §6 says it does.** §6 claims *"Every table column, card title, stat,
   filter, band chip and button is filed by the primitive that draws it."* `ghostBtn` is re-exported unchanged and is not
   instrumented, so ShellLaw's **Export** and CampusScope's **Manage campuses** are absent from both checklists —
   `"buttons": []` on each. Only the app bar's primary `action`, `tinyBtn` and `segments` are filed. Either the claim needs
   qualifying or `ghostBtn` needs instrumenting.

6. **The sheet itself has no contract.** ExpansionMain is the artboard carrying the most copy on the canvas, and it emits no
   spec and no checklist because it is not a `defineScreen`. Nothing checks that the numbers in its §3 table still match the
   number of artboards built per page, and nothing checks its copy at all.

7. **Title drift between the sheet and the canvas.** The sheet's own H1 is *"One sidebar, and twenty-four screens behind it"*;
   `canvas.json` titles the same artboard *"One sidebar, and what sits behind it"*. The second is what a reader sees in the
   canvas chrome, the first is what they see on the page.

8. **Two counting claims that do not agree.** The `exp-intro` annotation beside this page says the expansion *"adds three rail
   groups and thirteen rows, four of which join groups that already exist."* Thirteen proposed rows is right. But
   **Campuses** and **Conduct** are the only genuinely new groups — **Welfare** is Boarding renamed — and the rows joining
   existing groups are Leavers, Alumni, Cover, Pastoral notes, Exam series and Tuck shop, which is six, not four.

9. **What happens to a single-campus school that never becomes a group.** §4's first specimen says *"Nothing changes"* and the
   backfill gives each tenant one campus *"without telling them so"*. That is the right answer for today, but nothing on this
   page draws the moment the second campus is added — the first time the header grows a second line for a school that has
   never seen one. That is the only scope transition a real customer will actually experience, and it is not on the canvas.

10. **"All campuses" is both a destination in the sidebar and a row in the popover.** It appears twice with the same label:
    as the active nav row under the **Campuses** group, and as the selected row in the scope popover. They are arguably the
    same thing, but a reader who selects it in the popover and then sees it highlighted in the sidebar may reasonably wonder
    whether they are two controls or one.
