# Public exams

Five artboards covering ZIMSEC and Cambridge candidate registration, subject entries, seating
and results. Stories **S-13.1** (candidate registration, entries and seat numbers) and
**S-13.2** (public exam results captured against the candidate and analysed by subject). This
is the one thing every Zimbabwean secondary school does that the pack cannot do in any form: a
school running O and A Level today keeps the candidate register in a spreadsheet, types the
entry file by hand, and finds out on the last Friday in August that four children have no birth
certificate number on file. That is the highest switching cost in the product and the strongest
single reason a head moves. **Packaging: proposed as an add-on at $99 a term, from `STANDARD`
upward — seasonal, and priced as an add-on because a primary school should not pay for it.**
That price is *proposed, not decided*, and the proposal is the screen source's own: the `$99`
figure appears in the header comment of `design/campus/screens/exams.mjs` and **nowhere in the
expansion plan**, which names no price for S-13.1 at all. Open decision 4 in
`docs/expansion-plan/corelith-campus-expansion-plan.md` asks whether S-13.1 is an add-on or part
of `PREMIER`, and notes that being the strongest switching argument in the plan is an argument
both for charging for it and for giving it away.

Source: `design/campus/screens/exams.mjs`
Kit: `design/campus/lib/expansion-kit.mjs`
Artboards: `design/campus/expansion/Exams.dc.html`, `ExamCandidates.dc.html`,
`ExamEntries.dc.html`, `ExamSeating.dc.html`, `ExamResults.dc.html`

**Quoting convention.** Copy is quoted as it renders, with HTML entities resolved (`&middot;`
as `·`, `&mdash;` as an em dash, `&rsquo;` as a curly apostrophe). Where the source draws a
value in mono, tabular figures, the quote keeps the digits exactly as drawn — `$4,592.00` is
not `$4,592`. Where the source draws a string inside a badge, a mono cell, a chip or a button,
the quote is **the string alone**; adjacent cells are quoted separately rather than joined into
a sentence the artboard does not contain.

---

## S-13.3 is deferred, and these screens are drawn around that

**Direct submission to the exam authority is not drawn, and must not be added.** `SCH-DEP-02`
in `docs/expansion-plan/schools-pack-spec.md` defers "National exam authority direct submission
API" for *external dependency and policy review*, scheduled no earlier than Wave 4. The
expansion plan re-confirms it: S-13.3 is **Defer**, and "that is still true".

So these screens **produce the entry file and a human uploads it**. That is why *Build the entry
file* is a ghost band action on ExamEntries and not a card drawing an integration that does not
exist. A drawn integration is a promise, and this one cannot be kept.

This is the first thing somebody will try to add. It is also the first thing a salesperson will
promise. Neither is allowed until SCH-DEP-02 is lifted, and lifting it is a policy decision
nobody has booked.

---

## The domain, in one page

An implementer who has not sat a Zimbabwean public exam will get these screens wrong in
specific, expensive ways. The short version:

**Centre number versus candidate number.** The **centre number** identifies the *school* to the
board. It is issued by the board, stable across years, and a school that enters pupils with two
boards holds two of them: the artboards draw ZIMSEC `Centre 025419` and Cambridge
`Centre ZW254` for the same school. The **candidate number** identifies a *pupil within one
centre within one series* — four digits on these artboards, `0138` to `0255`. It is allocated by
the school, not the board; it is unique only inside centre + series; and the same pupil sitting
the June resit gets a different one. It is **not** the pupil number: `Gwatidzo, Rufaro` is
candidate `0138` and pupil `CHS-1198`, and both are drawn, in that order, in the same cell.

**Boards, series and levels.** ZIMSEC runs a **November series** — the main sitting, for
Ordinary Level (Form 4) and Advanced Level (Upper Six) — and a **June series**, which in
practice is a resit: 23 candidates and 61 entries on the artboard, against 118 and 826 in
November. **Cambridge runs alongside**, not instead: the same school enters some pupils for
IGCSE in the June series under its own centre number. That is why the series list carries a
`Board` filter, a `Level` column, and two centre numbers in the same table.

**Entry codes and fees.** Every subject carries the **board's** syllabus code, not the school's:
ZIMSEC Mathematics is `4008`, English Language `1122`, Combined Science `5008`, Shona `3159`,
Geography `2248`, History `2167`, Accounting `7707`, Agriculture `5038`, Commerce `7100`,
Physical Science `4023`. A paper within a subject appends a number — `4008/1` is Mathematics
Paper 1, which is what the ExamSeating caption and the `Paper` filter draw. The same subject
carries a *different* code with Cambridge. **The fee is charged per subject entered**, flat at
`$28.00` on these artboards, with a late penalty of `$14.00 a subject` after entries close. Ten
subjects entered is ten fees.

**Grades.** Ordinary Level and Cambridge IGCSE are graded **A\*, A, B, C, D, E, F, G and U**
(ungraded). A pass, for the purposes every head cares about, is **C or better** — which is why
`C or better` is a column and `Five or more at C` is a stat. **Advanced Level is A, B, C, D, E
and U**: no A\*, no F, no G. The distribution bar on ExamResults collapses the nine O Level
grades into **six bands** — `A*–A`, `B`, `C`, `D–E`, `F–G`, `U` — because at that width nine
bands is a stripe nobody can read and "A\* to C" is the sentence a head actually says. The
individual statement draws the real letter, not the band.

**The deadline is the argument.** A missed ZIMSEC entry deadline costs a pupil a year. There is
no appeal and no late door after the late door. That is why the deadline is **state, not
decoration** on Exams: it is the first band chip, it is the page's one alert, and the four dates
that follow it are a table of dates, days and consequences rather than a paragraph each.

---

## Before any of this can be built

None of it exists. Not one model, not one endpoint, not one feature key. This section is what
stops somebody starting on a Tuesday and finding on Thursday that the table they need was never
designed.

### Models that do not exist at all

Verified against `prisma/schema.prisma` (66 `School*` models, from `SchoolPortalInvite` at line
6702 to `SchoolImportArtifact`, which ends at line 8904). **None of the following is present:**

| Model | Exists? | What would hold |
|---|---|---|
| `SchoolExam` | **Does not exist** | — |
| `SchoolExamSeries` | **Does not exist** | Board, level, centre number, entry close date, status |
| `SchoolCandidate` | **Does not exist** | Candidate number, series, pupil, certified name, ID document |
| `SchoolExamEntry` | **Does not exist** | Candidate × subject × board code, fee, invoice link |
| `SchoolExamBoard` | **Does not exist** | ZIMSEC, Cambridge; a centre number each |
| `SchoolExamCentre` | **Does not exist** | `025419`, `ZW254` |
| `SchoolExamPaper` | **Does not exist** | `4008/1`, its date, its start time, its duration |
| `SchoolExamSession` | **Does not exist** | "Tuesday 3 November, 09:00" — the unit ExamSeating filters by |
| `SchoolExamSeat` | **Does not exist** | Seat number, room, candidate |
| `SchoolExamAccessArrangement` | **Does not exist** | 25% extra time, separate room, a reader |
| `SchoolExamResult` / `SchoolExamGrade` | **Does not exist** | A grade with no score, against a candidate and a series |
| `SchoolExamEntryFileRun` | **Does not exist** | What the *Build the entry file* verb produced, and when |
| `SchoolCampus` | **Does not exist** | Every artboard draws `scope`, and zero campus columns exist across all 66 models |

A case-insensitive grep for `exam`, `candidate`, `zimsec`, `cambridge` and `invigilat` across the
whole schema returns only the `EXAM` enum member on `SchoolCalendarEventKind` (line 8023) and on
`SchoolAssessmentKind` (line 8152), and `SchoolGradingScheme.examWeight` — all of them internal
assessment, none of them public exams. `candidate`, `zimsec`, `cambridge` and `invigilat` return
nothing at all.

### Fields that do not exist on models that do

| Need | Model | Status |
|---|---|---|
| National ID number on a pupil | `SchoolStudent` | **Does not exist.** `SchoolGuardian.nationalId` exists; the pupil has no equivalent. This is the field the largest blocker on ExamCandidates is about |
| Birth certificate number on a pupil | `SchoolStudent` | **Does not exist.** Nothing typed; `customFields Json?` is the only place it could go today, and a JSON blob cannot be a NOT NULL entry-file requirement |
| The certified name, as printed on the birth certificate | `SchoolStudent` | **Does not exist.** There is `firstName` / `lastName` and nothing to compare them against, so "Name differs from the birth certificate" has no second name to differ *from* |
| Date of birth | `SchoolStudent.dateOfBirth` | Exists, **nullable**. ZIMSEC requires it. The `Born` column draws no empty state |
| Sex | `SchoolStudent.gender` | Exists as a free `String?`. The `Sex` column draws `F` and `M`; nothing constrains the stored value to either |
| Photograph | `SchoolStudent.avatarUrl` | Exists, nullable — but its own schema comment says it falls back to initials, and it makes no promise that a set value is a *photograph of the candidate* rather than a decorative image |
| Board syllabus code for a subject | `SchoolSubject.code` | Exists and is `@@unique([companyId, code])` — but it is the **school's** code. One subject needs several board codes (ZIMSEC `4008` and a Cambridge code), which this column cannot hold |
| Exam room capacity | `SchoolRoom.capacity` | Exists, `Int?`. Usable. `SchoolRoom` relates only to `SchoolTimetableSlot`; it has no seating concept |
| Invigilator | `SchoolTeacherProfile` | Exists — but the artboard names `Sister Moyo` in the sick bay, who is not a teacher. An invigilator is either a `teacherProfileId`, an `Employee`, or free text. Undecided |
| Entry fee on an invoice line | `SchoolFeeInvoiceLine.feeCode` | Free `String`, so an entry fee **can** be billed. What does not exist is any link from a line back to an entry, so per-subject `Invoiced` / `Paid` / `To invoice` cannot be computed |
| A grade with no score | `SchoolResultLine` | `score Float` is **required**; `grade String?` is optional. A public exam grade is the reverse. And the line hangs off `SchoolResultSheet`, which is keyed to `termId` + `classId` — a series is neither |

### API endpoints that do not exist

`app/api/v2/schools/` holds 41 directories. **There is no `exams`, no `candidates`, no
`entries`, no `seating` and no `series`.** Every endpoint these five screens need is new:

```
POST   /api/v2/schools/exams/series                  does not exist
GET    /api/v2/schools/exams/series                  does not exist
GET    /api/v2/schools/exams/series/[id]/candidates  does not exist
POST   /api/v2/schools/exams/series/[id]/candidates  does not exist  (register the year group)
GET    /api/v2/schools/exams/series/[id]/blockers    does not exist
GET    /api/v2/schools/exams/series/[id]/entries     does not exist
POST   /api/v2/schools/exams/series/[id]/invoice     does not exist
POST   /api/v2/schools/exams/series/[id]/entry-file  does not exist
GET    /api/v2/schools/exams/series/[id]/seating     does not exist
POST   /api/v2/schools/exams/series/[id]/seating     does not exist  (assign seats)
GET    /api/v2/schools/exams/series/[id]/results     does not exist
POST   /api/v2/schools/exams/series/[id]/results     does not exist  (capture results)
```

Reusable and already there: `app/api/v2/schools/fees/invoices` and `.../receipts` for the money,
`app/api/v2/schools/rooms` for the rooms, `app/api/v2/schools/subjects` for the school's own
subjects, `app/api/v2/schools/students` for the pupils.

### Gating, permissions and registry — three entries that must land in the same commit

1. **`lib/platform/feature-catalog.ts` has no `schools.exams` key.** The eleven `schools.*`
   features are `core`, `admissions`, `students`, `attendance`, `fees`, `boarding`, `teachers`,
   `results`, and the three portals. A $99-a-term add-on needs its own billable key.
2. **`lib/platform/gating/route-registry.ts` has no `/schools/exams` prefix.** The catch-all
   `{ scope: "page", prefix: "/schools", featureKey: "schools.core" }` sits at line 110, so
   **`/schools/exams` would resolve to `schools.core` and be switched on for every tenant** —
   a paid add-on given away by a missing line. Matching is longest-prefix-wins — the file sorts
   its rows through `sortByPrefixLength` before `find`, so a `/schools/exams` row beats the
   catch-all wherever it is written — but the file's own convention is to list the longer prefix
   above the shorter one (`/schools/results/moderation` above `/schools/results`, both above
   `/schools`), so the new row goes above line 110 with them.
3. **`lib/schools/permissions.ts` `SCHOOL_RESOURCES` has no `schools.exams`.** `canSchoolRoleDo`
   has nothing to answer with, so every signed-in member of staff would reach the candidate roll
   — including a teacher.

### Already done, needs nothing

`scripts/campus-conformance.mjs` already registers all five routes in its `SCREENS` map
(lines 160–164), so each of the five reports under `NO PAGE — the canvas draws it, nothing
renders it` today, and leaves that list on its own when the route is built. Nothing needs
editing to make that happen.

---

## The navigation these screens add

**One row.** Not a group.

| Group | Row | Glyph | Route | State |
|---|---|---|---|---|
| **Results** | `Exam series` | `Certificate` | `/schools/exams` | `NEW` — carries the 7px hollow brand ring |

Public exams folded into **Results** deliberately: *"A head looking for November's grades does
not first decide whether they are internal or public."* The Results group's five rows, in order,
are `Results overview` · `Result sheets` · `Moderation` · `Publishing` · `Exam series`.

All five screens declare `railItem: 'Exam series'`, so the four detail routes mark the same
sidebar row as the index and none of them adds a row of its own. The ring comes off in exactly
one place — the `NEW` flag on that row in `NAV`, in `design/campus/lib/expansion-kit.mjs` (line
295) — plus the destination entering `lib/navigation.ts`, whose `results` group holds five rows
today (`Overview`, `Moderation`, `Publishing`, `Publishing windows`, `Result sheets`, at lines
353–357) and no exams row.

---

## Exams — Exam series

| | |
|---|---|
| **Route** | `/schools/exams` |
| **Story** | `S-13.1` |
| **Contract** | `design/campus/checklist/Exams.json` |
| **Artboard** | `design/campus/expansion/Exams.dc.html` |

**Who opens it, and what for.** Rudo Makoni, Deputy Head, at 07:40 on the last Monday in August
— seven days before ZIMSEC entries close. She is not browsing. She opens this page to find out
whether anything will stop the November entry going in, and she wants that answered above the
fold, before she has chosen a series.

### The chrome

- **App bar title**: `Exam series`. **No caption** — nothing on the index changes that a caption
  could carry; the state is in the band.
- **Primary action**: `New series`, plus glyph.
- **Search placeholder**: `Search series, candidates or centre numbers` — centre numbers are in
  there because a bursar reconciling a board invoice has the centre number and nothing else.
- **Band actions**: one ghost button, `Print the deadline sheet`, print glyph.

Band chips, left to right:

| Chip | Value | Tone | What the number counts |
|---|---|---|---|
| `Days to the ZIMSEC deadline` | `7` | bad (red) | Calendar days from today to the November series' entry close. First, because it is the only number that can cost a child a year |
| `Candidates` | `164` | plain | Candidates across both **open** series — 118 O Level plus 46 A Level |
| `Entry fees unpaid` | `$6,656` | warn (amber) | Invoiced entry fees not yet settled across both open series: `$4,592.00` at O Level plus `$2,064.00` at A Level |

### The layout, top to bottom

**1. Alert (bad).** The page's one alert, and the whole argument of the screen.

> Seven days to the ZIMSEC November deadline — nine of 118 O Level candidates cannot be registered

Its action is a brand `tinyBtn`: `Open the candidate roll`. Two facts joined by an em dash — the
clock and the count — and one verb. It is at the top because a deputy head who reads nothing
else must read this.

**2. Section — `ZIMSEC November 2026, Ordinary Level`**, note `entries close 31 August · 7 days`.
A `section()` (a heading on a hairline, no box), holding a four-column table of the dates that
follow the deadline.

| Column | Width | Align |
|---|---|---|
| `Deadline` | fluid | left |
| `Date` | 190 | left |
| `Days away` | fluid | left |
| `What follows` | 230 | left |

| Deadline | Date | Days away | What follows |
|---|---|---|---|
| `Entries close` | `Monday 31 August 2026` | `7 days` | `Late fee from this date` |
| `Late entries, at a penalty` | `Monday 14 September 2026` | `21 days` | `$14.00 a subject on top` |
| `Amendments and withdrawals close` | `Friday 2 October 2026` | `39 days` | `Withdrawals not refunded` |
| `Candidate schedules published` | `Friday 16 October 2026` | `53 days` | `Names checked against the roll` |

The `Days away` cell is a **local composition**, not a kit primitive — the kit has no primitive
for "a date, and how far away it is". It draws a 8px full-width rounded track in `C.muted` with a
fill, then a 62px mono figure reading `<n> days` at 11.5px/700 in the fill's colour. The
governing rule is a **60-day horizon**: `pct = clamp(4, 100, round(days / 60 × 100))`. Tone is
`C.bad` at 7 days or fewer, `C.warn` at 21 or fewer, `C.brand` beyond. It lives **inside a table
cell** so that the column still files itself into the checklist — a bar drawn beside the table
would be invisible to the contract.

**3. Section — `Series`**, note `6 series · 2 open for entries`. A control row then a table.

Control row (`rowFlex`, `align: flex-end`): segmented control `All series (6)` · `Open (2)` ·
`Results in (2)`, active `All series`; a flexible gap; `filterSelect` **Board** = `Every board`
(160px); `filterSelect` **Level** = `Every level` (160px); `searchField` `Search series` (230px).

Table columns, in order:

| Column | Width | Align |
|---|---|---|
| `Series` | fluid | left |
| `Level` | 120 | left |
| `Entries close` | 120 | left |
| `Candidates` | 88 | right |
| `Entries` | 70 | right |
| `Invoiced` | 95 | right |
| `Collected` | 100 | right |
| `Status` | 128 | left |
| *(unlabelled, row verb)* | 68 | right |

The `Series` cell is a `Certificate` glyph plus a two-line cell: the series name at 12.5px/600
over the centre number in mono at 10.5px. The glyph is `C.brandStrong` for an open series and
`C.faint` otherwise. `Collected` draws **green when it equals `Invoiced`, amber when it does
not** — the only conditional colour in the table, and it is what tells a bursar which series
still owes the board money.

| Series | Centre | Level | Entries close | Candidates | Entries | Invoiced | Collected | Status | Verb |
|---|---|---|---|---|---|---|---|---|---|
| `ZIMSEC November 2026` | `Centre 025419` | `Ordinary Level` | `31 Aug 2026` (red, 700) | `118` | `826` | `$17,332.00` | `$12,740.00` (amber) | `Open for entries` (brand) | `Open` (brand) |
| `ZIMSEC November 2026` | `Centre 025419` | `Advanced Level` | `31 Aug 2026` (red, 700) | `46` | `141` | `$9,306.00` | `$7,242.00` (amber) | `Open for entries` (brand) | `Open` (brand) |
| `ZIMSEC June 2026` | `Centre 025419 · resit` | `Ordinary Level` | `6 Feb 2026` | `23` | `61` | `$1,708.00` | `$1,708.00` (green) | `Entries closed` (warn) | `Open` |
| `Cambridge June 2026` | `Centre ZW254` | `IGCSE` | `20 Feb 2026` | `31` | `172` | `$12,040.00` | `$11,180.00` (amber) | `Results in` (ok) | `Results` |
| `ZIMSEC November 2025` | `Centre 025419` | `Ordinary Level` | `29 Aug 2025` | `112` | `687` | `$17,862.00` | `$17,862.00` (green) | `Results in` (ok) | `Results` |
| `ZIMSEC November 2024` | `Centre 025419` | `Ordinary Level` | `30 Aug 2024` | `106` | `641` | `$15,384.00` | `$15,384.00` (green) | `Archived` (plain) | `Results` |

Six rows, four boards-and-series combinations, three years. Cambridge sits in the same table as
ZIMSEC — not a separate screen, not a tab — because the school runs both and the deadline that
matters is whichever is nearest.

### The verbs

- **`New series`** (primary, app bar). Creates a series: board, level, centre number, entry
  close date. Nothing else on the page creates anything.
- **`Print the deadline sheet`** (band, ghost). Renders the four-row deadline table as a sheet
  for the staff room wall. It is a print, not an export — the audience is a noticeboard.
- **`Open the candidate roll`** (alert, brand tiny). Navigates to
  `/schools/exams/[seriesId]/candidates` for the November O Level series.
- **`Open`** (row verb, brand on an open series, plain otherwise). Navigates to that series'
  candidate roll.
- **`Results`** (row verb, plain). Navigates to `/schools/exams/[seriesId]/results`. Which verb
  a row carries is driven by the series tone: brand → `Open`, everything else → `Results`.
- The three segments and the two filters **narrow the table only**. They do not navigate.

### The refusals

None drawn. This is the index; nothing here is refused. The refusals live one level down, on
ExamCandidates and ExamEntries, where a registration or an entry is actually at stake.

### What it needs

- `SchoolExamSeries` — **does not exist**. Board, level, centre number, entry close date,
  status (`Open for entries` / `Entries closed` / `Results in` / `Archived`).
- `SchoolExamBoard` and a centre number per board — **do not exist**.
- Candidate and entry counts, and invoiced/collected totals, are aggregates over
  `SchoolCandidate` and `SchoolExamEntry`, **neither of which exists**.
- `Invoiced` and `Collected` must aggregate `SchoolFeeInvoice` / `SchoolFeeReceiptAllocation`
  **filtered to entry-fee lines**, which requires the entry↔invoice-line link that does not
  exist.
- The deadline table is four dates on the series. It is data, not configuration: ZIMSEC publishes
  them and a clerk types them in. `SchoolExamSeries` would carry four nullable `DateTime`s, or a
  child table.
- `GET /api/v2/schools/exams/series` — **does not exist**.

### States

Per `11-campus-states-and-motion.md`.

- **Loading** — a `TableRowsSkeleton` shaped like the series row, header and all, for both
  tables. Never a spinner. The band chips take `StatsSkeleton`.
- **Empty** — `NothingYet`, offering the one verb that fills it: a school that has never run a
  public exam has no series. The sentence is the screen's own, in the register the canvas uses:
  "This school has not entered a series yet." with `New series` beside it.
- **Filtered empty** — `NothingMatched`, repeating the `Board` and `Level` filters and offering
  to clear them.
- **Error** — scoped. The deadline table and the series table are two queries; if the series
  list fails, the deadline table stays usable and carries no fault. A page-wide alert throws
  away a good answer to report a bad one.
- **Denied** — the add-on is off, or the role is not cleared. Feature-off is the route
  registry's answer and lands on `/access-blocked`. Role-denied keeps the page and disables the
  verbs **with the reason on them, not hidden**.

### Copy that is doing work

1. > Seven days to the ZIMSEC November deadline — nine of 118 O Level candidates cannot be registered
2. > Late fee from this date
3. > $14.00 a subject on top
4. > Withdrawals not refunded
5. > Names checked against the roll
6. > Search series, candidates or centre numbers

---

## ExamCandidates — Candidates

| | |
|---|---|
| **Route** | `/schools/exams/[seriesId]/candidates` |
| **Story** | `S-13.1` |
| **Contract** | `design/campus/checklist/ExamCandidates.json` |
| **Artboard** | `design/campus/expansion/ExamCandidates.dc.html` |

**This is the screen the founder named, and the one that earns the $99.** Everything else here
is bookkeeping. This screen's real job is not listing 118 candidates — it is **surfacing the
nine who cannot be registered, and why**, while there is still time to fix it. A missed ZIMSEC
entry deadline costs a pupil a year, and the failure mode it exists to prevent is the one every
school knows: nobody looked at the ID column until the last Friday in August.

**Who opens it, and what for.** Rudo Makoni, Deputy Head, at 07:40, straight off the alert on
Exams — seven days out, with nine children she has not thought about yet. She has until the bell
at 07:55. She needs to know who to ring, not how many rows the table has.

### The chrome

- **App bar**: back chevron (`back: true`), title `Candidates`, caption
  `ZIMSEC November 2026 · Ordinary Level · centre 025419`. The caption carries the three things
  that change when you change series — board-and-series, level, centre number — and nothing that
  explains the title.
- **Primary action**: `Register the year group`, user-check glyph.
- **Search placeholder**: `Search the candidate roll`.
- **Band actions**: two ghost buttons — `Candidate numbers` (ID-card glyph) and `Print the roll`
  (print glyph).

Five band chips — the most on any of these five screens, because five numbers are genuinely in
play:

| Chip | Value | Tone | What the number counts |
|---|---|---|---|
| `Candidates` | `118` | plain | Pupils on this series' roll, blocked or not |
| `Ready to register` | `109` | ok (green) | Candidates with nothing stopping the entry |
| `Cannot be registered` | `9` | bad (red) | Candidates with at least one blocker. 109 + 9 = 118 |
| `Entry fees unpaid` | `$4,592.00` | warn (amber) | Invoiced entry fees not settled — 164 entries at $28.00, across 23 candidates. **Owed, not a bar** |
| `Days left` | `7` | bad (red) | The same seven days as the index, restated because this is where the work is done |

### The layout, top to bottom

**1. Section — `What is stopping an entry`**, note `9 of 118 blocked · 7 days left`, with one
section action: brand `tinyBtn` `Chase all nine`.

This was a card of four paragraphs. It is **one table** now, because "what stops an entry" is one
question asked about three kinds of obstruction. Columns:

| Column | Width | Align |
|---|---|---|
| `Blocker` | 270 | left |
| `Candidates` | fluid | left |
| `Count` | 66 | right |
| *(unlabelled, verb)* | 160 | right |

#### The blocker taxonomy, and what clears each

This is the part an implementer must get exactly right. Three blockers, nine candidates, and
they total what the table lists.

| Blocker | Who | Count | Tone | Verb | What clears it |
|---|---|---|---|---|---|
| `No ID document at all` | `Ncube, Tariro · Chidziva, Blessing · Marufu, Anesu · Kamusika, Tafadzwa` | `4` | bad | `Ring the guardians` | A national ID number **or** a birth certificate number recorded against the pupil. Either satisfies ZIMSEC; neither field exists on `SchoolStudent` today |
| `Name differs from the birth certificate` | `Sibanda, Ruvimbo · Mutasa, Tanaka · Muzengeza, Praise` | `3` | bad | `Compare and correct` | The school's recorded name and the certified name agreeing — which means both must be stored, and today only one is. The board prints what you submit; a mismatch invalidates the certificate years later |
| `No photograph` | `Gomo, Panashe · Rusike, Anodiwa` | `2` | warn | `Take the photographs` | A photograph of the candidate on file. Amber, not red, because it is the only one of the three a school can fix in an afternoon without a guardian |

Total row, drawn as the table's `total`:

| | | | |
|---|---|---|---|
| `Cannot be registered` | `Ready to register · 109` | `9 of 118` | *(empty)* |

**An unpaid entry fee is deliberately not a row in this table.** The roll shows `Mafuta, Simba`
and `Nyathi, Kudzai` as `Ready` with money owing, so **the fee does not stop a registration**.
Adding a fourth row for it would have contradicted the `109` / `9` chips and left the `Count`
column summing to 32 under a total reading 9. The money is a **column on the roll** and a **chip
in the band**, never a blocker, and the table totals exactly what it lists. An implementer who
"helpfully" adds an unpaid-fees row has broken the screen's arithmetic and its policy in one
edit.

The three tones are a priority order, not decoration: two red blockers need a phone call to a
guardian and a document that may not exist; the amber one needs a camera.

**2. Section — `The roll`**, note `118 candidates · 0138 to 0255 · 7 shown`.

Control row (`rowFlex`, `align: flex-end`): segments `The whole roll (118)` · `Blocked (9)` ·
`Registered (0)`, active `The whole roll`; flexible gap; `filterSelect` **Class** =
`All of Form 4` (150px); `filterSelect` **Status** = `Any status` (140px); `searchField`
`Name or candidate number` (230px).

`Registered (0)` is drawn as zero on purpose: seven days out, the school has entered nobody yet.
That is the normal state of this screen for most of its life.

Table columns, in order:

| Column | Width | Align | What it draws |
|---|---|---|---|
| `Cand no` | 66 | left | Four-digit candidate number, mono, `C.brandStrong`, 700. It is the key everything else on these screens joins on |
| `Pupil` | fluid | left | Initials avatar, then a two-line cell: `Lastname, Firstname` at 12.5px/600 over `pupil number · class` in mono at 10.5px |

The avatar initials are **first-name initial then surname initial**, taken off a name stored
`Lastname, Firstname` and therefore reversed from reading order: `Gwatidzo, Rufaro` draws `RG`,
not `GR`. All seven on the roll are drawn that way — `RG`, `SM`, `TN`, `KN`, `RS`, `NZ`, `PG` —
and the naive implementation gets every one of them backwards.

| `ID or birth certificate` | 175 | left | Mono, e.g. `ID 63-1102847-K-42` or `Birth cert 254112/2009`. When absent it draws an alert glyph plus `Nothing on file` in red at 11.5px/600 |
| `Born` | 90 | left | Mono date, e.g. `14 Mar 2009` |
| `Sex` | 46 | left | Mono `F` or `M` |
| `Subjects` | 76 | right | Mono count. **Amber and 700 when outside the school's 6–9 rule** — `10` and `5` on this roll |
| `Entry fees` | 120 | left | A badge: `Paid` (ok) or `$84.00 unpaid` (warn) |
| `Registration` | 150 | left | A badge: `Ready` (ok), or the blocker — `No ID document` / `Name differs` / `No photograph` |
| *(unlabelled, verb)* | 70 | right | `Open` (plain) when registration is ok, `Fix it` (brand) when it is not |

Seven of 118 rows are drawn:

| Cand no | Pupil | ID or birth certificate | Born | Sex | Subjects | Entry fees | Registration | Verb |
|---|---|---|---|---|---|---|---|---|
| `0138` | `Gwatidzo, Rufaro` · `CHS-1198 · Form 4A` | `ID 63-1102847-K-42` | `14 Mar 2009` | `F` | `8` | `Paid` | `Ready` | `Open` |
| `0139` | `Mafuta, Simba` · `CHS-1301 · Form 4B` | `Birth cert 254112/2009` | `2 Jun 2009` | `M` | `9` | `$84.00 unpaid` | `Ready` | `Open` |
| `0140` | `Ncube, Tariro` · `CHS-1226 · Form 4B` | `Nothing on file` | `21 Nov 2008` | `F` | `5` | `Paid` | `No ID document` | `Fix it` |
| `0141` | `Nyathi, Kudzai` · `CHS-1233 · Form 4A` | `ID 63-1149021-B-42` | `9 Jan 2009` | `M` | `9` | `$252.00 unpaid` | `Ready` | `Open` |
| `0142` | `Sibanda, Ruvimbo` · `CHS-1249 · Form 4A` | `Birth cert 261904/2009` | `30 Jul 2009` | `F` | `8` | `Paid` | `Name differs` | `Fix it` |
| `0143` | `Zimuto, Nyasha` · `CHS-1240 · Form 4A` | `ID 63-1156332-L-42` | `4 Feb 2009` | `F` | `10` | `Paid` | `Ready` | `Open` |
| `0144` | `Gomo, Panashe` · `CHS-1255 · Form 4B` | `ID 63-1163778-D-42` | `17 Sep 2008` | `M` | `7` | `Paid` | `No photograph` | `Fix it` |

Three things the rows are proving, and an implementer must preserve all three:

- **`0139` and `0141` are `Ready` with money owing.** The fee is not a blocker. If an
  implementation makes a debt block a registration, the school will miss the deadline for a
  reason the screen said it would not.
- **`0143 Zimuto, Nyasha` is `Ready` on ten subjects**, over the school's maximum of nine. Being
  over the subject rule is *not* a registration blocker either — it is an entry problem, and she
  reappears on ExamEntries under `Over the school maximum of nine`. The drawing deliberately
  does not contradict itself one screen later.
- **`0140 Ncube, Tariro` carries two problems at once**: `Nothing on file` (a registration
  blocker) *and* five subjects (an entry problem). She appears on both screens, in different
  tables, for different reasons.

### The verbs

- **`Register the year group`** (primary, app bar). Creates a candidate record for every pupil
  in the Form 4 cohort against this series, allocating candidate numbers in roll order. It does
  **not** create entries; subjects come next, on ExamEntries. This is the action the
  `Registered (0)` segment counts the result of.
- **`Candidate numbers`** (band, ghost). Allocates or reallocates the four-digit numbers. Doing
  this after seating has been assigned is what produces the `Registered after numbering` rows on
  ExamSeating.
- **`Print the roll`** (band, ghost). The roll as a sheet, for checking against the guardians'
  documents by hand.
- **`Chase all nine`** (section action, brand). Raises one chase per blocked candidate to the
  guardian on file — nine actions, one press, seven days out.
- **`Ring the guardians`** / **`Compare and correct`** / **`Take the photographs`** (row verbs on
  the blocker table, all brand). Each opens the work for that blocker across its candidates:
  the guardian contact list; a side-by-side of the recorded name and the certified name; the
  photograph capture queue.
- **`Fix it`** (row verb on the roll, brand). Opens that candidate's record at the field that is
  blocking them — not a generic record page.
- **`Open`** (row verb on the roll, plain). Opens the candidate record.
- The three segments and the two filters narrow the roll only.

### The refusals

The screen refuses in one place, and the sentence is the badge plus the verb beside it:

- **A candidate who `Cannot be registered` is not registered by `Register the year group`.**
  Nine of 118 are held back; the other 109 go. The screen does not offer to override, because
  the board will reject the file, not the school.
- **`Nothing on file`** is the refusal for a missing ID document. It is drawn in red at 600 with
  an alert glyph in a cell that otherwise draws a mono identifier — a blank cell would have read
  as "not loaded yet".
- **An unpaid entry fee refuses nothing.** This is the screen's most important non-refusal, and
  it is stated by drawing `$84.00 unpaid` and `Ready` in the same row.

### What it needs

- `SchoolCandidate` — **does not exist**. Candidate number, series, pupil, certified name,
  registration status.
- The blocker evaluation is derived, not stored — but every input it derives from is missing:
  - `SchoolStudent` has **no national ID field** and **no birth certificate number field**.
    `SchoolGuardian.nationalId` exists; the pupil's does not.
  - There is **no certified name** to compare `firstName`/`lastName` against.
  - `SchoolStudent.avatarUrl` exists and is nullable, and is the only candidate for "has a
    photograph" — but its schema comment says it falls back to initials, so a set value is not
    evidence of a photograph of this child.
  - `SchoolStudent.dateOfBirth` is **nullable**, and ZIMSEC requires it. There is arguably a
    fourth blocker here that the artboard does not draw.
- `Entry fees` per candidate needs entries joined to invoice lines — the link **does not exist**.
- `Subjects` per candidate is a count over `SchoolExamEntry` — **does not exist**.
- `GET /api/v2/schools/exams/series/[id]/candidates` and
  `POST .../candidates` (register the year group) — **do not exist**.
- Class filtering reuses `ClassFilter` and `classFilterParams` from
  `@/components/schools/common/class-filter`, which do exist.

### States

- **Loading** — two skeletons, shaped differently: a three-row skeleton for the blocker table and
  a roll-shaped skeleton with the avatar column for the roll. The band's five chips take
  `StatsSkeleton`.
- **Empty (no candidates)** — `NothingYet`. The series exists but nobody has been registered:
  "No pupil has been put forward for this series yet." with `Register the year group` beside it.
- **Empty (no blockers)** — this is the good one, and it is **`NothingLeftToDo`**, not
  `NothingYet`: every candidate is ready, so the blocker section shows the queue-is-done state
  with **no create button**. `Chase all nine` disappears with it. It is the only screen in this
  page where a *green* empty state is the goal.
- **Filtered empty** — `NothingMatched`, repeating `Class`, `Status` and the search term.
- **Error** — scoped per section. If the blocker query fails, the roll still draws; the blocker
  section carries the fault and the band chips for `Ready to register` and `Cannot be registered`
  draw as unknown rather than as zero. **Drawing a failed blocker count as `0` is the one error
  presentation this screen may not make** — it says "nothing is wrong" seven days out.
- **Denied** — the roll holds ID numbers and dates of birth for 118 children. A teacher does not
  open this. Denied keeps the page and disables the verbs with the reason on them, naming who
  can: a deputy head or the exams officer.

### Copy that is doing work

1. > What is stopping an entry
2. > No ID document at all
3. > Name differs from the birth certificate
4. > Nothing on file
5. > Ring the guardians
6. > Compare and correct
7. > Take the photographs
8. > Chase all nine
9. The blocker table's total row, three cells:
   > Cannot be registered
   > Ready to register · 109
   > 9 of 118
10. > 118 candidates · 0138 to 0255 · 7 shown

---

## ExamEntries — Subject entries

| | |
|---|---|
| **Route** | `/schools/exams/[seriesId]/entries` |
| **Story** | `S-13.1` |
| **Contract** | `design/campus/checklist/ExamEntries.json` |
| **Artboard** | `design/campus/expansion/ExamEntries.dc.html` |

**Who opens it, and what for.** Loveness Chirwa, the Bursar — not the deputy head. This is the
one screen of the five whose identity card in the sidebar reads `Loveness Chirwa` / `Bursar`,
and that is a specification, not a detail: subjects down and money across is a bursar's page.
She opens it mid-morning in the week before entries close, to find the entries nobody has been
billed for before the school pays the board out of its own pocket.

### The chrome

- **App bar**: back chevron, title `Subject entries`, caption
  `ZIMSEC November 2026 · Ordinary Level`.
- **Primary action**: `Invoice the entries`, receipt glyph.
- **Search placeholder**: `Search entries by subject or candidate`.
- **Band actions**: one ghost button, `Build the entry file`, download glyph. **This is where
  S-13.3's absence is visible.** It is a download, not a submit, and it must stay one.

| Chip | Value | Tone | What the number counts |
|---|---|---|---|
| `Entries` | `826` | plain | Subject entries across 118 candidates — 826 = the sum of the ten subject rows |
| `Still to invoice` | `$5,796.00` | warn | 207 entries × $28.00 never charged to a fee account |
| `Below the minimum` | `3` | bad | Candidates entered for fewer than six subjects |
| `Over the maximum` | `2` | warn | Candidates entered for more than nine |
| `Entry file built` | `24 Aug · 619 entries` | plain | When the file was last produced, and how many entries were in it. 619 of 826 — so 207 have appeared since |

That last chip is the one that makes the deferral honest: the school's record of the entry file
is *when it was built*, because nothing downstream of the download is knowable from here.

### The layout, top to bottom

**1. Property block** — `properties(rows, { cols: 3, labelW: 140 })`. Six rows across three
columns, at the head of the page, hairline between each. **These are the school's entry rule,
and pressing a value opens the editor** — §4 *Forms live in dialogs* of
`docs/design-system/13-campus-expansion-canvas.md`. Values draw with a dashed underline, which
is the affordance. They are not a card of read-only lines parked beside the table they govern.

| Label | Value |
|---|---|
| `Subjects at least` | `6` |
| `Subjects at most` | `9` |
| `Entry fee a subject` | `$28.00` |
| `English Language` | `Compulsory` |
| `Mathematics` | `Compulsory` |
| `Late entry penalty` | `$14.00 a subject` |

The minimum and maximum are the **school's** rule, not the board's — ZIMSEC will take more than
nine. That is why the section below is headed `Candidates outside the rule` and its second group
says `Over the school maximum of nine`. The compulsory subjects are why English Language and
Mathematics both sit at exactly 118 entries in the table: every candidate.

**2. Alert (warn).**

> 207 entries, $5,796.00, have never been charged to a fee account

Action: brand `tinyBtn` `Show the 207`. Warn rather than bad, because it is money not yet
collected rather than a child who cannot sit.

**3. Section — `Subjects entered`**, note `10 subjects · 826 entries · $23,128.00`.

Control row: segments `By subject (10)` · `By candidate (118)`, active `By subject`; flexible
gap; `filterSelect` **Level** = `Ordinary Level` (160px); `searchField` `Subject or code`
(210px).

Table columns:

| Column | Width | Align |
|---|---|---|
| `Subject` | fluid | left |
| `Code` | 70 | right-of-name, left-aligned; mono, `C.brandStrong`, 700 |
| `Entries` | 80 | right |
| `Total fee` | 110 | right |
| `Invoiced` | 110 | right |
| `Paid` | 110 | right |
| `To invoice` | 110 | right |

An em dash `—` in `Invoiced`, `Paid` or `To invoice` draws in `C.faint`. A real figure in
`Paid` draws green; a real figure in `To invoice` draws amber at 700.

| Subject | Code | Entries | Total fee | Invoiced | Paid | To invoice |
|---|---|---|---|---|---|---|
| `Mathematics` | `4008` | `118` | `$3,304.00` | `$3,304.00` | `$2,688.00` | `—` |
| `English Language` | `1122` | `118` | `$3,304.00` | `$3,304.00` | `$2,688.00` | `—` |
| `Combined Science` | `5008` | `112` | `$3,136.00` | `$3,136.00` | `$2,296.00` | `—` |
| `Shona` | `3159` | `104` | `$2,912.00` | `$2,912.00` | `$2,072.00` | `—` |
| `Geography` | `2248` | `96` | `$2,688.00` | `$2,688.00` | `$1,708.00` | `—` |
| `History` | `2167` | `71` | `$1,988.00` | `$1,988.00` | `$1,288.00` | `—` |
| `Accounting` | `7707` | `63` | `$1,764.00` | `—` | `—` | `$1,764.00` |
| `Agriculture` | `5038` | `58` | `$1,624.00` | `—` | `—` | `$1,624.00` |
| `Commerce` | `7100` | `52` | `$1,456.00` | `—` | `—` | `$1,456.00` |
| `Physical Science` | `4023` | `34` | `$952.00` | `—` | `—` | `$952.00` |
| **`All subjects`** *(total row)* | | `826` | `$23,128.00` | `$17,332.00` | `$12,740.00` | `$5,796.00` |

The shape of the data is the argument: **the six core subjects are fully invoiced and the four
options are not invoiced at all.** 63 + 58 + 52 + 34 = 207 entries, and 207 × $28.00 = $5,796.00
— the alert, the band chip and the total row are the same number three times, on purpose. The
four stat tiles this screen used to carry were the total row drawn a second time, so they are
gone.

**4. Section — `Candidates outside the rule`**, note `5 of 118`, with one section action: brand
`tinyBtn` `Open each one`.

Columns: `Cand no` (80) · `Pupil` (fluid) · `Pupil number` (110) · `Class` (110) · `Subjects`
(90, right) · *(unlabelled verb)* (80, right).

Two group headers, because the two ways of falling off the rule need different work:

| | Cand no | Pupil | Pupil number | Class | Subjects | Verb |
|---|---|---|---|---|---|---|
| **`Below the minimum of six`** | | | | | | |
| | `0140` | `Ncube, Tariro` | `CHS-1226` | `Form 4B` | `5` (red) | `Fix it` |
| | `0166` | `Chidziva, Blessing` | `CHS-1262` | `Form 4A` | `5` (red) | `Fix it` |
| | `0203` | `Marufu, Anesu` | `CHS-1279` | `Form 4C` | `4` (red) | `Fix it` |
| **`Over the school maximum of nine`** | | | | | | |
| | `0143` | `Zimuto, Nyasha` | `CHS-1240` | `Form 4A` | `10` (amber) | `Fix it` |
| | `0181` | `Chirwa, Kudakwashe` | `CHS-1268` | `Form 4B` | `11` (amber) | `Fix it` |

Below the minimum is red and over the maximum is amber, because one is a candidate who will not
qualify for anything and the other is a candidate whose parents are about to be billed for two
subjects the school would rather they did not take. `Zimuto, Nyasha` at ten subjects is the same
candidate drawn as `Ready` on ExamCandidates: being outside the subject rule does not stop a
registration.

### The verbs

- **`Invoice the entries`** (primary, app bar). Raises fee invoices for the 207 entries never
  charged — `$5,796.00` — against each candidate's fee account. It is the one thing on this
  screen that moves money.
- **`Build the entry file`** (band, ghost, download glyph). **Produces the file the school
  uploads to the board itself.** It does not submit. It does not call the board. It writes a
  file and stamps `Entry file built`. S-13.3 is deferred under SCH-DEP-02, and this button is the
  shape of that deferral.
- **`Show the 207`** (alert, brand). Filters the subject table to the four uninvoiced options.
- **`Open each one`** (section action, brand). Walks the five candidates outside the rule, one
  after another, rather than making the bursar find each.
- **`Fix it`** (row verb, brand). Opens that candidate's entries to add or drop a subject.
- Segments `By subject` / `By candidate` pivot the same 826 entries. `By candidate` is 118 rows
  of a person and their subjects; `By subject` is the ten rows drawn. **Both are the same table**
  — the segment does not swap in a second component.

### The refusals

- **A subject cannot be entered for a candidate who is not registered.** The screen is downstream
  of ExamCandidates by construction.
- **Values in the property block are pressed to edit, not typed on the page.** There is no form
  on this screen; `13-campus-expansion-canvas.md` §4 *Forms live in dialogs* puts it in a
  dialog and forbids "a stack of `field()` on the page beside the thing it changes".
- **`Build the entry file` refuses to be a submission.** It is a download, it is a band action
  rather than the primary, and it says `Build`, not `Send` or `Submit`. Anybody renaming it has
  promised something SCH-DEP-02 says the product cannot do.

### What it needs

- `SchoolExamEntry` — **does not exist**. Candidate × subject × board code, fee, status.
- The board syllabus code (`4008`, `1122`, …) has nowhere to live. `SchoolSubject.code` exists
  and is `@@unique([companyId, code])`, but it is the school's own code and cannot hold a
  different code per board for the same subject.
- The entry rule — minimum, maximum, fee per subject, compulsory subjects, late penalty — is six
  values per series with nowhere to go. **No model holds them.**
- `Invoiced` / `Paid` / `To invoice` per subject require a link from `SchoolFeeInvoiceLine` back
  to an entry. **That link does not exist.** `SchoolFeeInvoiceLine.feeCode` is a free `String`
  and `description` is free text, so entry fees can be *billed* today but never *reconciled* back
  to a subject.
- Invoicing must leave `feeStructureId` null. The partial unique index
  `SchoolFeeInvoice_live_student_term_structure_key` (migration
  `20260805120000_school_fee_money_decimal_currency_and_one_live_invoice`) enforces one live
  invoice per student, per term, per structure — and its schema comment says NULL
  `feeStructureId` keeps ad-hoc invoices repeatable, which is what an entry-fee invoice is.
- `Entry file built` needs a record of the last build: timestamp, entry count, and who pressed
  it. **No model holds it.**
- `POST /api/v2/schools/exams/series/[id]/invoice` and
  `POST .../entry-file` — **do not exist**.

### States

- **Loading** — the property block gets a six-row skeleton at the right column widths, not a
  spinner over the whole head of the page. The subject table gets a row-shaped skeleton
  including its total row.
- **Empty** — `NothingYet`: candidates are registered but nobody has been entered for a subject
  yet. The verb offered is the one that fills it, which is **not** `Invoice the entries` — it is
  entering subjects, reached from the candidate roll. An empty entries table must not offer to
  invoice nothing.
- **Empty (`Candidates outside the rule`)** — `NothingLeftToDo`. Every candidate is inside 6–9,
  the section shows the done state, and `Open each one` goes with it.
- **Error** — scoped. A failure computing invoiced/paid must not blank the `Entries` column: the
  entry counts and the money come from different places, and the bursar can still read how many
  entries exist.
- **Denied** — a bursar and a head open this. A class teacher does not. The `Invoice the entries`
  verb is additionally gated on the fees permission, and when it is refused the button stays
  visible and disabled with the reason on it.

### Copy that is doing work

1. > 207 entries, $5,796.00, have never been charged to a fee account
2. > Build the entry file
3. The band chip, label then value:
   > Entry file built
   > 24 Aug · 619 entries
4. Three property rows, label then value:
   > Subjects at least — 6
   > Subjects at most — 9
   > Entry fee a subject — $28.00
5. A fourth property row:
   > Late entry penalty — $14.00 a subject
6. > Candidates outside the rule
7. > Below the minimum of six
8. > Over the school maximum of nine
9. > Show the 207
10. > Open each one

---

## ExamSeating — Seating and invigilation

| | |
|---|---|
| **Route** | `/schools/exams/[seriesId]/seating` |
| **Story** | `S-13.1` |
| **Contract** | `design/campus/checklist/ExamSeating.json` |
| **Artboard** | `design/campus/expansion/ExamSeating.dc.html` |

**Who opens it, and what for.** Rudo Makoni on the Monday afternoon before the first paper,
laying out the Main Hall — and again at 08:30 on the Tuesday, when a candidate turns up who is
not on any seating list. She reads the hall as a *shape*, not as a list of forty-eight numbers,
which is why one card is spent here and nowhere else on the page.

### The chrome

- **App bar**: back chevron, title `Seating and invigilation`, caption
  `Mathematics Paper 1 (4008/1) · Tuesday 3 November, 09:00 · two hours`. The caption is the
  session — the paper, the day, the time and the duration — because every number below it is
  true only for that session.
- **Primary action**: `Assign seats`, grid glyph.
- **Search placeholder**: `Find a candidate’s seat` (curly apostrophe).
- **Band actions**: two ghost buttons — `Print the seating plan` (print glyph) and
  `Attendance sheets` (file glyph).

| Chip | Value | Tone | What the number counts |
|---|---|---|---|
| `Candidates` | `118` | plain | Candidates entered for this paper in this session |
| `Seated` | `108` | ok | Candidates with a room and a seat number |
| `Still to seat` | `10` | warn | 118 − 108 |
| `Sitting two papers at once` | `1` | bad | Candidates entered for two papers in the same session. One is one too many |

### The layout, top to bottom

**1. Alert (bad).**

> Panashe Gomo is entered for two papers at 09:00 — Mathematics 4008/1 and Geography 2248/1

Action: brand `tinyBtn` `Open the clash`. Named, both papers given, both codes given. A clash is
not a statistic; it is a child who will sit one paper and miss the other.

**2. A two-column grid**, `420px minmax(0, 1fr)`.

**Left: a card — `Main Hall`**, note `48 of 54 seats · Farai Moyo`, one action: plain `tinyBtn`
`Renumber the hall`. **This is the only card on any of these five screens.** The composition rule
is that cards are spent, not stamped, and this is what the page spends its one card on: a seat
plan is a physical object, and it is the only thing here that genuinely floats above the ground.

The seat grid is a **local composition** built from `C` tokens, because the kit has no seat-plan
primitive and a table of 48 seat numbers is unreadable. It draws, top to bottom:

- A `sectionLabel` reading `Front of the hall · invigilator’s desk`, then a hairline across the
  remaining width. Orientation first: an invigilator reads a hall from the front.
- A **five-column grid of 54 cells**, 6px gap, each 42px tall. A taken cell has a solid 1px
  border on `C.surface`; a free cell has a **dashed** border and a transparent fill. Each cell
  carries the four-digit seat number at 9px in `C.faint`, and below it either the four-digit
  candidate number at 11px/700 or the word `free` at 9.5px.
- **The clash seat is drawn in red** — `C.badBg` fill, `C.badBd` border, both numbers in `C.bad`.
  It is seat `0003`, holding candidate `0144`, Panashe Gomo. The alert at the top of the page and
  the red cell in the hall are the same fact in two forms.
- A legend: `Seated` · `Free` · `Clash`, each a 14px swatch matching the cell it describes.
- Right-aligned mono footer: `Seats 0001–0048 · candidates 0141–0194 · six placed elsewhere`.

**Seat numbering is not candidate numbering.** Seats run `0001`–`0054`; the candidates in them run
`0141`–`0194`. Ten candidates are placed outside the hall — the six on `Access arrangements` and
the four on `Still to seat` — and the hall is numbered around all ten, so **no candidate is drawn
in two rooms at once**. Six of those ten fall inside the drawn range `0141`–`0194` and are
skipped there (`0142` and `0181` on access arrangements, `0166`, `0186`, `0187` and `0188` still
to seat); the other four sit outside it (`0138`, `0139`, `0140` below, `0203` above). **That is
what the footer's `six placed elsewhere` counts** — the six skipped inside the range it names,
not the ten placed elsewhere in total. Do not "correct" it to ten.

`0141`–`0194` is 54 consecutive numbers, less those six, which is exactly the 48 taken seats. An
implementation that fills seats with a naive `candidateNumber = 137 + seat` runs `0138`–`0185`
and collides with six of the ten (`0138`, `0139`, `0140`, `0142`, `0166`, `0181`), putting six
children in two places.

**Right: a section — `Where everyone sits`**, note `108 of 118 seated · 16 places free`, one
action: brand `tinyBtn` `Seat all ten`.

Control row: segments `This session (118)` · `The whole timetable (26)`, active `This session`;
flexible gap; `filterSelect` **Session** = `Tue 3 Nov, 09:00` (160px); `filterSelect` **Paper** =
`Mathematics 4008/1` (170px); `searchField` `Name or candidate number` (190px).

`The whole timetable (26)` counts sessions, not candidates — 26 sittings across the series.

Table columns:

| Column | Width | Align |
|---|---|---|
| `Cand no` | 66 | left |
| `Room or candidate` | 176 | left |
| `Seats` | 116 | left |
| `Capacity or arrangement` | fluid | left |
| `Invigilator` | 132 | left |
| `Status` | 118 | left |

Rooms, access arrangements and the ten still to seat are **one question — where does every
candidate sit — asked about three kinds of row**, so they are one table with three group headers
and a total, not three lists. A room row leaves `Cand no` empty and draws a building glyph beside
the room name; a candidate row fills `Cand no` and draws the name plain.

| | Cand no | Room or candidate | Seats | Capacity or arrangement | Invigilator | Status |
|---|---|---|---|---|---|---|
| **`Rooms in this session`** | | | | | | |
| | | `Main Hall` | `0001–0048` | `Capacity 54 · 48 seated` | `Farai Moyo` | `Ready` (ok) |
| | | `Room 14` | `0055–0082` | `Capacity 30 · 28 seated` | `Rudo Makoni` | `Ready` (ok) |
| | | `Room 15` | `0085–0110` | `Capacity 30 · 26 seated` | `Tendai Sibanda` | `Ready` (ok) |
| | | `Library annexe` | `0115–0119` | `Capacity 8 · 5 seated` | `Nobody named` (amber) | `No invigilator` (warn) |
| | | `Sick bay` | `0123` | `Capacity 2 · 1 seated` | `Sister Moyo` | `Ready` (ok) |
| **`Access arrangements · 6 candidates`** | | | | | | |
| | `0142` | `Sibanda, Ruvimbo` | `Annexe 0115` | `25% extra time · to 11:30` | `Nobody named` | `Extra time` (brand) |
| | `0139` | `Mafuta, Simba` | `Annexe 0116` | `25% extra time · to 11:30` | `Nobody named` | `Extra time` (brand) |
| | `0181` | `Chirwa, Kudakwashe` | `Annexe 0117` | `Separate room · anxiety` | `Nobody named` | `Separate room` (brand) |
| | `0203` | `Marufu, Anesu` | `Annexe 0118` | `25% extra time · to 11:30` | `Nobody named` | `Extra time` (brand) |
| | `0138` | `Gwatidzo, Rufaro` | `Annexe 0119` | `25% extra time and a reader` | `Nobody named` | `Extra time` (brand) |
| | `0140` | `Ncube, Tariro` | `Sick bay 0123` | `Reader · does not explain` | `Sister Moyo` | `Reader` (brand) |
| **`Still to seat · 4 of 10 shown`** | | | | | | |
| | `0166` | `Chidziva, Blessing` | `—` | `Below the minimum of six` | `—` | `Not seated` (warn) |
| | `0186` | `Kamusika, Tafadzwa` | `Room 15 · 0111` | `Registered after numbering` | `—` | `Suggested` (plain) |
| | `0187` | `Rusike, Anodiwa` | `Room 15 · 0112` | `Registered after numbering` | `—` | `Suggested` (plain) |
| | `0188` | `Muzengeza, Praise` | `Room 15 · 0113` | `Registered after numbering` | `—` | `Suggested` (plain) |
| **total** | | `Five rooms · 118 candidates` | `124 places` | `108 seated · 16 free` | | `10 still to seat` (warn) |

Three things the data is saying:

- **`Library annexe` has five candidates on access arrangements and `Nobody named`.** Five of the
  six candidates who need extra time are in a room with no invigilator, and `No invigilator` is
  the only amber room status. The column and the badge are drawn separately so the fault reads
  twice.
- **`Reader · does not explain`** is the access arrangement written precisely: a reader may read
  the question aloud and may not explain it. That distinction is the difference between an access
  arrangement and malpractice, and the cell says it in four words.
- **`Registered after numbering`** is the audit trail of a real sequence: candidate numbers were
  allocated, then three more pupils were registered, so their seats are `Suggested` rather than
  assigned. `Renumber the hall` is the verb that would absorb them, at the cost of reprinting
  everything.

### The verbs

- **`Assign seats`** (primary, app bar). Allocates seats for the whole session, respecting
  capacity, access arrangements and the clash.
- **`Print the seating plan`** (band, ghost). The hall as a printed shape, for the door.
- **`Attendance sheets`** (band, ghost). One sheet per room, in seat order — the thing an
  invigilator carries.
- **`Open the clash`** (alert, brand). Opens Panashe Gomo's two entries so one can be moved to
  another session.
- **`Renumber the hall`** (card action, plain — deliberately not brand). Renumbers the Main Hall
  so the three `Suggested` seats become real. Plain because it invalidates every sheet already
  printed.
- **`Seat all ten`** (section action, brand). Accepts the suggestions and places the remaining
  candidates.
- Segments and the two filters change which session is drawn. `Session` and `Paper` move
  together — they are two views of one choice.
- **No row verbs.** The row carries the fact, not the fix.

### The refusals

- **A candidate is never drawn in two rooms.** The hall's numbering skips the ten placed
  elsewhere, and that is a constraint on the seating algorithm, not a rendering trick.
- **A clash is drawn, not resolved.** The screen refuses to pick which paper Panashe Gomo sits.
  It names both — `Mathematics 4008/1 and Geography 2248/1` — and hands the decision to a person.
- **`Below the minimum of six`** refuses a seat: `Chidziva, Blessing` has `—` in `Seats`, `—` in
  `Invigilator` and `Not seated`. A candidate who is not properly entered does not get a desk,
  and the reason the entry rule gives is repeated here verbatim rather than restated.
- **`No invigilator`** refuses `Ready`. A room with candidates and nobody named cannot be ready,
  and the status says which.

### What it needs

- `SchoolExamSession` (a paper, a date, a start time, a duration) and `SchoolExamPaper`
  (`4008/1`) — **neither exists**.
- `SchoolExamSeat` (seat number, room, candidate, session) — **does not exist**.
- `SchoolExamAccessArrangement` (extra time as a percentage and an end time, separate room, a
  reader, the reason) — **does not exist**. Nothing in the schema records any of it;
  `SchoolHealthRecord` exists but an access arrangement is not a health record and filing it as
  one would put it behind the wrong permission.
- Rooms reuse `SchoolRoom`, which **exists** with `code`, `name`, `capacity Int?` and `kind`.
  It has no relation to anything but `SchoolTimetableSlot`, so an exam room allocation is a new
  join.
- The invigilator has no home. `SchoolTeacherProfile` exists, but `Sister Moyo` is a nurse: the
  field is either a nullable `teacherProfileId`, a nullable `employeeId` (`Employee` exists in
  HR and `SchoolTeacherProfile.employeeId` already links to it), or free text. **Undecided — and
  `Nobody named` must be a real null state, not an empty string.**
- The clash check is a query, not a column: two entries for one candidate whose sessions overlap.
  It needs sessions to exist first.
- `GET` and `POST /api/v2/schools/exams/series/[id]/seating` — **do not exist**.

### States

- **Loading** — the hall card gets a 54-cell skeleton grid at the real cell size, so the card does
  not change shape when it fills. The table gets a row skeleton with its three group headers in
  place.
- **Empty** — `NothingYet`: the session exists, nobody is seated. The verb offered is
  `Assign seats`.
- **Empty (`Still to seat`)** — `NothingLeftToDo`. Everybody has a desk; the group header and
  `Seat all ten` both go.
- **Error** — scoped hard here. The hall and the table are two queries, and the hall failing must
  not take the table with it: an invigilator list is still usable without a seat plan, and the
  opposite is also true.
- **Denied** — the seating plan names which children have extra time and which has anxiety. That
  is closer to a pastoral note than to a timetable. Denied hides nothing and disables the verbs
  with the reason on them, but **the `Capacity or arrangement` column is the one cell on these
  five screens that a role check should be able to redact rather than disable.**

### Copy that is doing work

1. > Panashe Gomo is entered for two papers at 09:00 — Mathematics 4008/1 and Geography 2248/1
2. > Front of the hall · invigilator’s desk
3. > Reader · does not explain
4. > Separate room · anxiety
5. > 25% extra time and a reader
6. > Nobody named
7. > No invigilator
8. > Registered after numbering
9. > Seats 0001–0048 · candidates 0141–0194 · six placed elsewhere
10. The seating table's total row, four filled cells:
    > Five rooms · 118 candidates
    > 124 places
    > 108 seated · 16 free
    > 10 still to seat

---

## ExamResults — Public results

| | |
|---|---|
| **Route** | `/schools/exams/[seriesId]/results` |
| **Story** | `S-13.2` |
| **Contract** | `design/campus/checklist/ExamResults.json` |
| **Artboard** | `design/campus/expansion/ExamResults.dc.html` |

**Who opens it, and what for.** Two people, and the screen is split down the middle for them. A
head in late January, the week the statement arrives, asking which subjects fell and by how much
— that is the top two thirds. And the office clerk in the same week with a former pupil standing
at the counter wanting a statement for a college application — that is the bottom right. The
provenance table beside it answers the question that follows every disputed grade: *who typed
this*.

### The chrome

- **App bar**: back chevron, title `Public results`, caption
  `ZIMSEC November 2025 · Ordinary Level · 112 candidates`. Note the series: this screen is
  looking at **last** November, not the one being entered.
- **Primary action**: `Capture results`, note glyph.
- **Search placeholder**: `Name, candidate number or centre`.
- **Band actions**: two ghost buttons — `Statement of results` (file glyph) and
  `Export the analysis` (download glyph).

| Chip | Value | Tone | What the number counts |
|---|---|---|---|
| `Statement received` | `21 Jan 2026` | plain | The date the board's printed statement reached the school. A date, not a count, because it is the fact that starts everything below |
| `Against last November` | `+2 pts` | ok | Change in the whole-school C-or-better percentage against the previous November series |
| `Subjects that fell` | `2` | bad | Subjects whose C-or-better rate dropped — Mathematics (−3) and History (−4) |
| `Grades amended` | `2` | warn | Grades changed after a remark. Amber, because an amended grade is a grade somebody got wrong once |

### The layout, top to bottom

**1. A four-up stat row** (`grid(4, …)`). The only screen of the five that uses `stat()` — the
contract records four stats here and zero on the other four.

| Stat | Value | Tone | Note |
|---|---|---|---|
| `Candidates` | `112` | plain | `687 entries · 6.1 subjects each` |
| `Five or more at C` | `79` | ok | `71% · 69% last November` |
| `A* and A grades` | `64` | plain | `9.3% of all entries` |
| `Ungraded` | `23` | bad | `3.3% · nine of them in Mathematics` |

`Five or more at C` is the number a Zimbabwean head is actually measured on: five O Level passes
at C or better is the qualification threshold for A Level and for most employment. 79 of 112 is
71%. The `Ungraded` note names Mathematics rather than leaving 23 as a number, because nine
ungraded in one subject is a teaching problem and a spread of 23 across eight is not.

**2. Section — `Grades by subject`**, note `8 subjects · 687 entries · 2 fell`.

Control row: segments `By subject (8)` · `By candidate (112)`, active `By subject`; flexible gap;
`filterSelect` **Series** = `ZIMSEC November 2025` (210px); `filterSelect` **Compare with** =
`November 2024` (170px); `searchField` `Name or candidate number` (220px).

Table columns:

| Column | Width | Align |
|---|---|---|
| `Subject` | 190 | left |
| `Code` | 70 | left (mono, brand strong, 700) |
| `Sat` | 60 | right |
| `A* to U` | fluid | left — the distribution bar |
| `C or better` | 96 | right |
| `Against 2024` | 110 | right — a badge |

**The distribution bars are the table.** They are not a chart beside it. `A* to U` is a 15px
segmented bar, 4px radius, on a `C.muted` track, divided into six proportional segments — one per
band, each carrying the band name as its `title` tooltip. The bands, in order, with the tokens
they use:

| Band | Token |
|---|---|
| `A*–A` | `C.ok` |
| `B` | `C.teal` |
| `C` | `C.okBd` |
| `D–E` | `C.warnBd` |
| `F–G` | `C.orangeBd` |
| `U` | `C.badBd` |

Six bands, not nine, because at this width nine bands is a stripe nobody can read and "A\* to C"
is the sentence a head actually says.

| Subject | Code | Sat | A\*–A | B | C | D–E | F–G | U | C or better | Against 2024 |
|---|---|---|---|---|---|---|---|---|---|---|
| `Mathematics` | `4008` | `112` | 9 | 14 | 31 | 31 | 18 | 9 | `48%` | `−3 pts` (bad) |
| `English Language` | `1122` | `112` | 7 | 19 | 40 | 30 | 13 | 3 | `59%` | `+5 pts` (ok) |
| `Combined Science` | `5008` | `104` | 11 | 18 | 34 | 27 | 11 | 3 | `61%` | `+2 pts` (ok) |
| `Shona` | `3159` | `98` | 14 | 22 | 36 | 18 | 7 | 1 | `73%` | `+6 pts` (ok) |
| `Geography` | `2248` | `88` | 6 | 13 | 29 | 26 | 11 | 3 | `55%` | `+1 pts` (ok) |
| `History` | `2167` | `64` | 5 | 11 | 21 | 18 | 7 | 2 | `58%` | `−4 pts` (bad) |
| `Accounting` | `7707` | `57` | 8 | 12 | 19 | 12 | 5 | 1 | `68%` | `+3 pts` (ok) |
| `Agriculture` | `5038` | `52` | 4 | 9 | 18 | 15 | 5 | 1 | `60%` | `+2 pts` (ok) |
| **`All subjects`** | | `687` | 64 | 118 | 228 | 177 | 77 | 23 | `60%` | `2 fell` (bad) |

**The total row carries a whole-school bar**, computed by summing the eight subject rows band by
band — not a ninth hard-coded row. Its `Sat` figure is derived the same way: `ALL_BANDS` sums the
eight rows band by band and `ALL_SAT` sums those six bands, which is the `687`. These two are the
only figures on these five screens the source computes rather than states. **`60%` is not one of
them** — it is written out as a literal, and it is a rounding: 64 + 118 + 228 = 410 at C or
better over 687 entries is 59.7%. An implementation that computes it will draw `59.7%` or `60%`
depending on how it rounds, and the artboard has settled that to nought decimal places.

(The header comment in `design/campus/screens/exams.mjs` still calls `60%` "the only figure on
these screens derived rather than given". It is the one place the source contradicts itself.)

Below the table, a wrapping legend row (`rowFlex`, gap 16): six 18×10px swatches, one per band,
each labelled. The legend is outside the table because it describes a column, not a row.

`Against 2024` uses the **minus sign** `−`, not a hyphen: `−3 pts`, `−4 pts`. In tabular figures
they are different glyphs at different widths, and the wrong one breaks the column's alignment.

**3. A two-column grid**, `minmax(0, 1fr) 470px`.

**Left: section — `Where these grades came from`**, note `112 candidates · 2 amended`. Columns:
`What` (fluid) · `Who` (280) · `When` (160, right, mono).

| What | Who | When |
|---|---|---|
| `ZIMSEC statement of results` | `Centre 025419 · 112 candidates · printed` | `21 Jan 2026` |
| `Captured, 98 candidates` | `Rudo Makoni, Deputy Head` | `23 Jan 2026 14:06` |
| `Captured, 14 candidates` | `Loveness Chirwa, Bursar` | `24 Jan 2026 09:40` |
| `Checked line by line against the print` | `Elias Chikafu, Group Head` | `26 Jan 2026 08:15` |
| `Two grades amended after a remark` | `Rudo Makoni · History 2167, D to C` | `19 Feb 2026 11:02` |

98 + 14 = 112: the capture was split between two people over two days, and the table says so. The
amendment names the subject, the code and the direction — `History 2167, D to C` — because "two
grades amended" without saying which is not provenance.

**Right: section — `Muchemwa, Tinashe`**, note `0087 · centre 025419`, one action: brand
`tinyBtn` `Print the statement`. The section title **is the candidate's name** — this is the one
place on the page where a section is headed by a person. Columns: `Subject` (fluid) · `Code`
(80) · `Grade` (110, **centre-aligned**).

The `Grade` cell is a local composition: a mono chip, minimum 30px wide, 26px tall, 6px radius,
14px/700, tinted by tone — `C.okBg`/`C.ok` for a pass, `C.warnBg`/`C.warn` for a D.

| Subject | Code | Grade |
|---|---|---|
| `Shona` | `3159` | `A` |
| `Mathematics` | `4008` | `B` |
| `Combined Science` | `5008` | `B` |
| `English Language` | `1122` | `C` |
| `Geography` | `2248` | `C` |
| `History` | `2167` | `D` |
| `Accounting` | `7707` | `C` |
| **total** — `Qualifies for A Level` (graduation glyph, green, in the `Subject` cell) | *(empty)* | `6 at C or better` (ok badge) |

The total row is the only line on these five screens that renders a **judgement** rather than a
count, and it is the sentence the person at the counter came for.

### The verbs

- **`Capture results`** (primary, app bar). Types the board's printed statement into the product,
  candidate by candidate. It is the only way grades get in — see the deferral: nothing arrives
  from the board electronically.
- **`Statement of results`** (band, ghost). The board's own document, as received.
- **`Export the analysis`** (band, ghost). The subject table, for a governors' meeting.
- **`Print the statement`** (section action, brand). One candidate's statement, for the counter.
- Segments `By subject` / `By candidate` pivot the same 687 grades.
- `Series` and `Compare with` change what is compared. **`Compare with` is what makes
  `Against 2024` a column rather than a number** — change it and the column's heading changes
  with it.
- **No row verbs.** A grade is not edited from a list; an amendment is an event, and it appears
  in the provenance table when it happens.

### The refusals

- **A grade is not edited in the table.** There is no row verb and no inline edit. An amendment
  after a remark is a recorded event with a name, a subject and a time on it, which is why
  `Two grades amended after a remark` is a row in the provenance table and not a quiet update.
- **The provenance table refuses to be optional.** Every grade on this screen was typed by a
  person from a printed page, and the screen answers "who typed this" before it is asked.

### What it needs

- `SchoolExamResult` — **does not exist**. A grade against a candidate and a board code, with no
  score.
- **`SchoolResultLine` cannot be reused.** `score Float` is required and `grade String?` is
  optional — the reverse of a public exam result — and the line hangs off `SchoolResultSheet`,
  which is keyed to `termId` and `classId`. A public series is neither a term nor a class.
- A capture audit — who captured how many, when, who checked, and every amendment with its
  before and after. `SchoolResultModerationAction` exists and does exactly this shape of job for
  internal result sheets, but it is keyed to `sheetId`. **Nothing equivalent exists for a
  series.**
- `Against 2024` needs two series of the same board and level to be comparable, which means the
  board code must be stable across years. It is; the schema has nowhere to record it.
- `Five or more at C` and `Qualifies for A Level` are derived thresholds. They are **policy**,
  not arithmetic — five at C is the conventional Zimbabwean threshold, and a school may count it
  differently (with or without English, with or without Mathematics). Nothing configures it.
- `GET` and `POST /api/v2/schools/exams/series/[id]/results` — **do not exist**.
- Printing one candidate's statement should ride the existing document pipeline
  (`app/schools/documents`, the S-5.x renderer) rather than inventing a seventh renderer.

### States

- **Loading** — four `StatsSkeleton` tiles at the real tile size, then a table skeleton whose
  `A* to U` cell is a plain grey bar. A distribution bar that animates in from nothing reads as
  data.
- **Empty** — `NothingYet`: the series has candidates but the statement has not arrived, or has
  arrived and nobody has typed it. This is the most common state of this screen for ten months of
  the year, so it must be a designed state and not an accident. The verb offered is
  `Capture results`.
- **Partial** — 98 of 112 captured is a real, drawn state: the provenance table shows it in two
  rows. The stats and the distribution must say what they are computed over, not present a
  partial capture as a whole-school result.
- **Error** — scoped. The provenance table and the subject table are separate queries; either may
  fail alone.
- **Denied** — results for a series that has been published are wide; results mid-capture are
  not. `Capture results` is the verb that needs the tighter check, and it disables with the
  reason on it.

### Copy that is doing work

1. A stat tile, label then value then note:
   > Five or more at C
   > 79
   > 71% · 69% last November
2. A stat tile, label then value then note:
   > Ungraded
   > 23
   > 3.3% · nine of them in Mathematics
3. > Where these grades came from
4. > Checked line by line against the print
5. > Two grades amended after a remark
6. > Rudo Makoni · History 2167, D to C
7. > Centre 025419 · 112 candidates · printed
8. > Qualifies for A Level
9. > 6 at C or better
10. > 8 subjects · 687 entries · 2 fell

---

## Open questions

1. **Add-on at $99 a term, or part of `PREMIER`?** Open decision 4 in the expansion plan, and it
   is still open: being the strongest single switching argument in the plan is an argument both
   for charging for it and for giving it away. Until it is settled, `lib/platform/feature-catalog.ts`
   cannot get its key and `lib/platform/gating/route-registry.ts` cannot get its prefix — and
   **without that prefix `/schools/exams` falls through to the `/schools` catch-all at
   `schools.core` and is switched on, free, for every tenant.** This one blocks the first commit,
   not the last.

2. **Registration and seating contradict each other across two screens.** ExamCandidates draws
   the segment `Registered (0)` — nobody has been registered — while ExamSeating seats 108 of
   118. **Seven of the nine candidates the blocker table names as unable to be registered are
   seated or suggested anyway.** Four have a real seat: `0144 Gomo, Panashe` in the Main Hall at
   seat `0003` (and is the clash), `0142 Sibanda, Ruvimbo` at `Annexe 0115`, `0203 Marufu,
   Anesu` at `Annexe 0118`, and `0140 Ncube, Tariro` in the sick bay with a reader. Three carry
   a suggestion: `0186 Kamusika, Tafadzwa`, `0187 Rusike, Anodiwa` and `0188 Muzengeza, Praise`,
   all in Room 15. Of the remaining two, `0166 Chidziva, Blessing` is drawn `Not seated` and
   `Mutasa, Tanaka` does not appear on ExamSeating at all. Either seating does not depend on
   registration — in which case the screens should say so — or one of the two drawings is wrong.
   An implementer will have to pick, and picking wrongly makes the blocker screen decorative.

3. **Public exam grades have no home in the schema, and the nearest model actively resists
   them.** `SchoolResultLine` requires `score Float` and makes `grade String?` optional; a ZIMSEC
   result is a grade and nothing else. And the line hangs off `SchoolResultSheet`, keyed to
   `termId` + `classId`, when a series is neither. Reusing it means making a required column
   nullable on a shipped table and inventing a synthetic sheet per series; not reusing it means
   a second grade store, and then `Results overview` has two sources. This decides how S-13.2 is
   built and it has not been made.

4. **Where does a pupil's ID document actually live?** A new nullable `nationalId` and
   `birthCertificateNo` on `SchoolStudent` is the obvious answer and matches `SchoolGuardian`,
   which already carries `nationalId`. But an ID number on a child's record is data most of the
   product has no business reading, and `SchoolStudent.customFields Json?` exists precisely so a
   school can add fields without a migration. A JSON blob cannot be a NOT NULL entry-file
   requirement, so the recommendation is typed columns — but the privacy question that kept them
   off the model until now has not been answered.

5. **Who may be an invigilator?** The seating table names `Farai Moyo`, `Rudo Makoni` and
   `Tendai Sibanda` (teachers) alongside `Sister Moyo` (a nurse). `SchoolTeacherProfile` cannot
   hold the last one. The choice is a nullable `teacherProfileId`, a nullable `employeeId` into
   the HR module's `Employee`, or free text — and free text is the only one that works on day one
   for a school that has not put its non-teaching staff into the product.

6. **The entry file format is specified nowhere.** `Build the entry file` is the whole of the
   school's interface to the board, and neither the artboard nor the plan says what it contains,
   in what format, or with what encoding. ZIMSEC publishes a layout; nobody in this repo has it.
   The screen cannot be finished without it, and it is the deferral's practical cost.

7. **Two centre numbers, one school, two code systems.** The Exams table draws
   `Centre 025419` and `Centre ZW254` in the same column. A Cambridge entry for Mathematics
   carries a different syllabus code from ZIMSEC's `4008`, so `SchoolSubject` needs a per-board
   code and `SchoolSubject.code` is `@@unique([companyId, code])`. Whether a Cambridge fee is in
   the same currency as a ZIMSEC fee is not addressed anywhere, and `SchoolFeeInvoice` carries
   `currency` and `exchangeRate` because the rest of the product already knows it is not always.

8. **The A Level series is drawn and never opened.** The index lists
   `ZIMSEC November 2026 · Advanced Level` with 46 candidates, 141 entries and its own money —
   and all four detail artboards are Ordinary Level. A Level grades are A–E and U, with no A\*
   and no F/G, so the six-band distribution on ExamResults is wrong for it. Somebody will open
   that row expecting it to work.

9. **Who reads an access arrangement?** `Separate room · anxiety` and
   `25% extra time and a reader` are closer to a pastoral note than to a timetable, and the
   Conduct and Pastoral page argues that a note a parent must not see needs visibility to be the
   screen rather than a field on it. ExamSeating draws them in a plain table column with no
   visibility control at all, and prints them on the seating plan.

10. **The unpaid entry fee is a chip on three screens and a policy nowhere.** `$6,656` on Exams,
    `$4,592.00` on ExamCandidates, `$5,796.00 still to invoice` on ExamEntries. The screens are
    emphatic that an unpaid fee does not stop a registration. But somebody pays the board, and if
    a school's own policy is that it does stop a registration, nothing here lets them say so.

---

## Build order

**1. `Exams` — `/schools/exams`.** First, because it is the only route with no `[seriesId]` and
because building it is what forces the three decisions the other four inherit:
`SchoolExamSeries`, the board and centre-number model, and the feature key plus route-registry
prefix that stop the add-on being given away. It unblocks every other screen, all four of which
are children of a series that must exist first.

**2. `ExamCandidates` — `/schools/exams/[seriesId]/candidates`.** Second, because it is the
screen the product is sold on and because `SchoolCandidate` is the join everything downstream
hangs off — an entry, a seat and a result are all *a candidate's*. It also forces the hardest
schema decision on the page (question 4: where a pupil's ID document lives), and finding that out
early is worth more than any other ordering. It unblocks ExamEntries and ExamSeating.

**3. `ExamEntries` — `/schools/exams/[seriesId]/entries`.** Third, because `SchoolExamEntry`
needs candidates, and because this is where the money joins: the entry↔invoice-line link is the
one new relation into a shipped, audited, fiscalised table, and it should be built while there is
still time to get it wrong twice. It unblocks the entry file, which is the deliverable the
deferral makes the school's own responsibility.

**4. `ExamSeating` — `/schools/exams/[seriesId]/seating`.** Fourth, because it needs entries to
exist before it can detect a clash, and because it is the largest amount of genuinely new
modelling — sessions, papers, seats, access arrangements — for the smallest number of people. It
unblocks nothing; nothing waits on it.

**5. `ExamResults` — `/schools/exams/[seriesId]/results`.** Last, and it is the only one that can
genuinely be last: S-13.2 is a separate story, results arrive three months after entries close,
and a school that has entered its candidates has already had the value it paid for. It needs a
series and candidates and nothing else on this page, so it could be built in parallel with 3 and
4 by a second person if the schema decision in question 3 is made first.
