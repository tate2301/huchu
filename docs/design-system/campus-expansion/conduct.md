# Conduct and pastoral

The second page of the expansion canvas. Five artboards covering stories **S-12.1**
(behaviour incidents, merits and demerits, sanctions, detention), **S-12.2** (conduct on
the report card and in the parent portal) and **S-12.3** (counselling and pastoral notes
with restricted visibility). Together they unpark **S-P.1**, which
`docs/expansion-plan/schools-roadmap.md` parked with the reason *"Sold in no band and no
add-on, and absent from all three prototypes"*. That is a fact about the price list rather
than about schools: every school in the country keeps a conduct record in some book, and a
campus product that cannot show one is visibly short of the systems it is asking a bursar
to throw away. **The recommendation on record is to fold S-12.1 into the `STANDARD` band at
no extra price** — it is small, it is expected, and it feeds the report card `STANDARD`
already sells. `docs/expansion-plan/corelith-campus-expansion-plan.md` lists that as open
decision 3, *"Which band carries discipline (S-12.1)? My recommendation is `STANDARD` at no
extra price, because a conduct record is table stakes rather than an upsell — but that is a
pricing call."* **It is the founder's to accept, and nothing below assumes it has been.**

Source: `design/campus/screens/conduct.mjs`
Kit: `design/campus/lib/expansion-kit.mjs`
Artboards: `design/campus/expansion/Conduct.dc.html`, `ConductIncident.dc.html`,
`ConductMerits.dc.html`, `ConductDetention.dc.html`, `Pastoral.dc.html`

**Quoting convention.** Copy is quoted as it renders, with HTML entities resolved
(`&mdash;` as an em dash, `&rsquo;` as a curly apostrophe, `&middot;` as a middle dot).
Where the source draws a string inside a badge, a mono cell or a button, the quote is the
string alone; the primitive is named in the prose beside it.

**Where to check a quote.** Everything inside the page body is in the screen's
`design/campus/checklist/<Screen>.json` under `allCopy`, and rendered in
`design/campus/spec/<Screen>.html`. **Chrome is not.** The app-bar title and caption live in
the checklist's `header` line; the band chip labels live in `bandChips`; and the **band
actions do not appear in either file** — `Export the log`, `Print for the file`,
`Export the term`, `Print the list` and `Who may read what` are `bandActions` on the screen
declaration and are drawn by the shell, so the only place to verify them is
`design/campus/screens/conduct.mjs`. The checklist's `buttons` array holds the primary
action plus every `tinyBtn`; a `ghostBtn` inside the page body (`See the two`,
`Mark everyone here`) reaches `allCopy` but not `buttons`.

**The shell.** All five screens sit in the shell stated once in
`docs/design-system/campus-expansion/foundation.md` — 248px sidebar with collapsible
groups, 48px app bar carrying the page's only name, sticky page band carrying state. All
five declare `scope: { group: 'Chishawasha Trust', campus: 'Borrowdale campus' }`, so every
one of them draws a **green** campus mark under the group name in the sidebar header. None
of the five is drawn at group scope, and none of them has been designed for it.

---

## Before any of this can be built

**Nothing in this page exists.** Not the tables, not the routes, not the permission
resource, not the navigation rows. This is the honest list, checked against
`prisma/schema.prisma`, `app/api/v2/schools/`, `app/schools/`, `components/schools/`,
`lib/schools/permissions.ts`, `lib/platform/personas.ts`,
`lib/platform/gating/route-registry.ts` and `lib/navigation.ts` on 16 September 2026.

### Confirmed absent

| Thing | Status |
|---|---|
| `SchoolIncident` / any conduct-incident model | **Does not exist.** No model in the schema records a pupil behaviour event |
| `SchoolMerit` / any merit or demerit model | **Does not exist** |
| `SchoolDetention` / any detention session or register model | **Does not exist** |
| `SchoolPastoralNote` / any restricted-visibility note model | **Does not exist** |
| Any per-note or per-reader access-control table | **Does not exist** |
| `app/api/v2/schools/conduct/**` | **Does not exist.** The directory has 43 entries; none is conduct, discipline, merits, detention or pastoral |
| `app/schools/conduct/**` | **Does not exist** |
| `components/schools/conduct/**` | **Does not exist** |
| `schools.conduct` or `schools.pastoral` in `SCHOOL_RESOURCES` | **Does not exist.** The list is nine resources: academics, admissions, students, teachers, attendance, fees, boarding, results, reports |
| A `schools.conduct` feature key in `lib/platform/feature-catalog.ts` | **Does not exist** |
| A nurse, deputy-head, head-of-year or group-head persona | **Does not exist.** `PersonaCode` is SCHOOL_ADMIN, REGISTRAR, BURSAR, HOD, TEACHER, WARDEN, PARENT, STUDENT plus three retail codes. Three of the four readers drawn on `Pastoral` have no persona at all |
| `campusId` anywhere in the schema | **Does not exist.** Zero occurrences; no `SchoolCampus` model. Every artboard on this page is drawn scoped to `Borrowdale campus` and no table in the product can hold that fact |

`DisciplinaryAction` in the schema is the **HR** model — staff misconduct, with
`DisciplinaryActionType`, `submittedBy`, `approvedBy` and a link to `Employee`. It is not
about pupils and must not be reused for this. The name collision is the only thing the two
share.

### Models that have to be created

Named as proposals. The shape is driven by what the artboards actually draw; where a
cheaper derivation is available it is named.

1. **`SchoolConductIncident`** — one row per event. Needs `companyId`, `termId`,
   `studentId`, `occurredAt`, `categoryId`, a one-line `summary`, `location`, `period`,
   `reportedByUserId`, `reportedAt`, `sanction`, `sanctionTone`, `homeToldAt`,
   `homeToldChannel`, `seenByUserId` / `seenAt`, `sanctionDecidedByUserId` /
   `sanctionDecidedAt`, and a human `reference` (`CI-2026-0417` is drawn as a mono
   property). `homeToldAt` being nullable is the whole point of the page — see the band
   chip `Home not told`. `SchoolHealthEvent.guardianNotified` is the existing precedent,
   with the schema comment *"Whether home was told. The question a school is asked
   afterwards."*
2. **`SchoolConductCategory`** — `Lateness`, `Phone`, `Uniform`, `Plagiarism`, `Damage`,
   `Disruption`, `Absconding`, `Fighting`, plus `Litter` and `No homework` from the merits
   screen. School-set with a tone, **not an enum**: the artboard gives different categories
   different tones and every school's list differs. The precedent is `SchoolRoom.kind`,
   whose schema comment reads *"An enum here would be a guess at every school's estate."*
3. **`SchoolConductParticipant`** — the property `Others involved` draws
   `Tariro Ncube · CHS-1292 · no sanction`. A second pupil on one incident, with her own
   sanction or none. One row per other pupil.
4. **`SchoolConductAccount`** — the two rows of *The accounts*. Author is a member of staff
   in one row and **the pupil herself** in the other (`Form 3B · the pupil`), so the author
   is polymorphic: either two nullable columns (`authorUserId`, `authorStudentId`) with a
   check constraint, or an explicit `authorKind`.
5. **The review spine** — four of its five steps (`Reported`, `Seen by the head of year`,
   `Sanction decided`, `Home told`) are columns on the incident and should be **derived,
   not stored as rows**. The fifth (`Detention served`) is a join to the detention register.
   A `SchoolConductReviewStep` table would duplicate the incident's own timestamps and let
   them drift. Recommend derivation; if a school ever needs a step the schema does not
   name, revisit then.
6. **`SchoolMeritEntry`** — `studentId`, `termId`, `kind` (`MERIT` | `DEMERIT`),
   `reasonId`, `points`, `awardedByUserId`, `awardedAt`, `note`. Every number on
   `ConductMerits` is an aggregate over this one table.
7. **`SchoolMeritReason`** — `Helping in the library`, `Top of the class test`,
   `Represented the school`, `Sports colours`, `Read at assembly`, `Helped a younger
   pupil`, and the demerit side. School-set, with a kind.
8. **`SchoolDetentionSession`** — `startsAt`, `endsAt`, `roomId`,
   `supervisorTeacherProfileId` **nullable** (`Not yet supervised` is drawn, in red, against
   `Fri 18 Sep`). `SchoolRoom` exists today and carries `code`, `name`, `capacity`, `kind`;
   it currently relates only to `SchoolTimetableSlot`, so a new relation is needed.
9. **`SchoolDetentionAward`** — `incidentId`, `studentId`, `sessionsOwed`, `awardedAt`. The
   `Session` column draws `1 of 2`, `1 of 3`, `2 of 2`, so the award carries the
   denominator and the register carries the numerator.
10. **`SchoolDetentionAttendance`** — `sessionId`, `awardId`, `studentId`, `state`
    (`HERE` | `DID_NOT_TURN_UP` | `NOT_MARKED` | `MOVED`), `markedAt`, `markedByUserId`,
    `movedToSessionId`. `Still to serve` is `sessionsOwed` minus the `HERE` count, and it
    is a **column on the register totalled at the foot**, not a second list.
11. **`SchoolPastoralNote`** — `studentId`, `authorUserId`, `writtenAt`, `body`, `band`,
    `reviewDueAt` nullable (`None needed` is drawn), `referredTo`, `referredAt`,
    `closedAt`. **The body must never be selected by a query that has not proved the caller
    is cleared for it** — see *What it needs* under `Pastoral`.
12. **`SchoolPastoralNoteReader`** — `noteId`, `userId`, `grantedByUserId`, `grantedAt`,
    `revokedAt`. This is the row-level ACL, and it is the reason a visibility enum on its
    own is not enough: `Safeguarding — named individuals` names individuals, and
    `Nothing · unless named on the note` is drawn against a Group Head.
13. **`SchoolPastoralClearance`** — per member of staff: which bands, and **which pupils**.
    Priscilla Nyathi's `Pastoral team only · Year 3 pupils` is two facts, not one. Needs
    `userId`, the bands, a pupil scope (whole school | year group | class), `grantedById`,
    `grantedAt`, `revokedAt`.
14. **`SchoolPastoralAccessRequest`** — the `Ask to see it` verb on a withheld row.
    `noteId`, `requestedByUserId`, `requestedAt`, `decidedByUserId`, `decidedAt`,
    `outcome`, `reason`.
15. **A read log.** Every open of a note body should be recorded. `PlatformAuditEvent`
    exists today, is hash-chained (`eventHash`, `prevEventHash`) and takes `companyId`
    (nullable), `eventType`, `entityType`, `entityId`, `actor` and `reason` — use it rather
    than a new table. **Write it through the existing school wrapper, not through Prisma:**
    `writeSchoolAuditEvent` in `lib/schools/audit.ts` is the entry point every privileged
    school action already uses, and its `SchoolAuditEventType` is a closed union, so a
    pastoral read means adding a member to that union rather than typing a new string.
    **Not drawn on any artboard.** Flagged as required by the subject matter, not by the
    design.

Enums to add: `SchoolMeritKind`, `SchoolDetentionState`, `SchoolPastoralBand`
(`PASTORAL_TEAM_ONLY` | `HEAD_AND_PASTORAL_TEAM` | `SAFEGUARDING_NAMED_INDIVIDUALS` — the
three bands the artboard draws, and only three).

### Fields on existing models

- **None strictly required on `SchoolStudent`.** The `Gets home` column is derived, not
  stored: `isBoarding = true` gives `Boarder`; otherwise an open `SchoolTransportRider` for
  the term (`endedAt` null) gives its `SchoolTransportRoute.code`, drawn as `Bus R2`;
  otherwise `Day`. Both transport models exist today.
- **`campusId` on every new model.** Not because anything reads it yet, but because
  retrofitting it is the S-11.1 debt this canvas is already documenting. Adding it now
  costs a column; adding it later costs a migration over a discipline record.

### Permissions and packaging

- Add resources to `SCHOOL_RESOURCES` in `lib/schools/permissions.ts`. **Two, not one** —
  `schools.conduct` and `schools.pastoral` are different resources with different readers,
  and folding pastoral into conduct is the mistake the whole `Pastoral` screen is drawn to
  prevent. `schoolPermissionDenial(session, resource, action)` is the existing entry point
  and every route uses it.
- Add grants in `lib/platform/personas.ts`. Note that the four readers named on `Pastoral`
  map onto nothing: **there is no nurse, deputy-head, head-of-year or group-head persona.**
  Today a school nurse would be a `WARDEN`, which is how `app/api/v2/schools/health/route.ts`
  guards the welfare list — its comment gives the reason verbatim: *"`schools.boarding`
  rather than `schools.students`: this is medical information about children, and the
  persona that should read it is the one responsible for their welfare, not everybody who
  can see a class list."* The same argument applies here and the same shortage of personas
  blocks it.
- **Persona grants are not enough for pastoral.** A persona grant answers "may this role
  read pastoral notes at all". It cannot answer "may this person read *this* note about
  *this* pupil". Both checks must run.
- **Route gating.** `lib/platform/gating/route-registry.ts` already ends its schools block
  with catch-alls — `{ scope: "page", prefix: "/schools", featureKey: "schools.core" }` and
  `{ scope: "api", prefix: "/api/v2/schools", featureKey: "schools.core" }`. So **if the
  recommendation is accepted and conduct ships inside `STANDARD` under `schools.core`, no
  registry edit is needed at all.** If instead conduct gets its own feature key, two rows
  must be inserted *before* those catch-alls, and a `schools.conduct` entry added to
  `lib/platform/feature-catalog.ts` and to the `ADDON_SCHOOLS_SUITE` bundle's `features`
  array in the same file. That asymmetry is itself a small argument for the recommendation.
- **Where the `STANDARD` band actually is, and what it can and cannot carry.** The band the
  recommendation names is `SCHOOL_PRICING_BANDS` in `lib/marketing/pricing.ts` —
  `COMMUNITY`, `STANDARD`, `PREMIER`, `GROUP`, each with an enrolment ceiling, a term price
  (`null` for `GROUP`, which is quoted) and a marketing `includes: string[]`. Three facts an
  implementer needs before touching it:
  1. **A band carries no feature keys.** It is consumed only by the marketing page
     (`app/home/site-components.tsx`) and its tests, and it is chosen by headcount —
     `schoolBandForEnrolment(students)` picks the first band whose `maxStudents` fits. So
     "conduct ships in `STANDARD`" is a copy change (a line in `includes`) and cannot by
     itself gate anything.
  2. **The entitlement bundle is `ADDON_SCHOOLS_SUITE`**, one bundle for all four bands.
     There is no per-band feature list today, so a feature-gated conduct would be the first
     thing that needed one.
  3. **`STANDARD` in `feature-catalog.ts` is a different `STANDARD`** — a retired platform
     tier code aliased to `GROW` in `TIER_CODE_ALIASES`. Editing it would do nothing to a
     school.

### S-12.2 has no screen of its own

It appears twice, and only twice: as the section **What the report card will say** on
`ConductIncident`, and as the row `The report card` in the **Never** group on `Pastoral`.
Implementing it means editing `resolveReportCard` in `lib/documents/schools-sources.ts`
(the `schools.report-card` source, gated on `schools.results`) to add a conduct paragraph
to its payload — and **adding a test that the same function never reads the pastoral
table.** The parent-portal half of S-12.2 means a new route under
`app/api/v2/schools/portal/parent/child/`, beside `attendance`, `fees` and `marks`, behind
the same `_guard.ts`.

---

## The navigation these screens add

Two groups are touched. The sidebar rows and glyphs are defined in `NAV` in
`design/campus/lib/expansion-kit.mjs`; all four rows carry the `NEW` flag, which draws the
7px hollow brand ring.

| Group | Row | Glyph | Route |
|---|---|---|---|
| **Conduct** *(a new group)* | Behaviour log | `Flag` | `/schools/conduct` |
| | Merits and demerits | `Star` | `/schools/conduct/merits` |
| | Detention | `Timer` | `/schools/conduct/detention` |
| **Welfare** *(Boarding, renamed)* | Bed board | `House` | *(exists)* |
| | Health and welfare | `ShieldCheck` | *(exists)* |
| | Pastoral notes | `Lock` | `/schools/conduct/pastoral` |

**Pastoral notes is filed under Welfare, not under Conduct.** That is deliberate, and
`13-campus-expansion-canvas.md` states why: *"A pastoral note is not a discipline record.
Filing it under Conduct would have told every person who opened the menu that it was."*
Its **route**, however, is `/schools/conduct/pastoral`. See open question 1.

`/schools/conduct/merits` and `/schools/conduct/detention` are static segments that will
take precedence over `/schools/conduct/[incidentId]` in Next.js routing. Incident ids are
uuids, so nothing collides in practice, but the ordering is a fact about the route tree
rather than a coincidence to rely on.

---

## Conduct — Behaviour log

| | |
|---|---|
| **Route** | `/schools/conduct` |
| **Story** | `S-12.1` |
| **Contract** | `design/campus/checklist/Conduct.json` |
| **Artboard** | `design/campus/expansion/Conduct.dc.html` |

**Who opens it, and what for.** Rudo Makoni, Deputy Head, at 07:40 on a Friday before the
bell, wanting to know which of yesterday's incidents still has nobody's decision on it and
whose parents have not been rung. She is not reading the log; she is looking for the two
rows that are unfinished.

### The chrome

- **App bar title**: `Behaviour log`. **No caption** — nothing on this page changes that a
  caption could carry that the band does not carry better.
- **Primary action**: `Log an incident`, with a plus glyph.
- **Search placeholder**: `Search the behaviour log`. It appears twice — in the app bar's
  260px field and again in the table's control row at 240px, because the second one
  belongs to the table.
- **Band action**: a ghost `Export the log` with a download glyph.

Band chips, left to right:

| Chip | Value | Tone | What the number counts |
|---|---|---|---|
| `This term` | `148` | plain | Every incident logged at Borrowdale in Term 2 |
| `No sanction decided` | `12` | warn | Incidents with no sanction recorded — the queue for a deputy head |
| `Home not told` | `9` | bad | Incidents where no guardian contact is recorded and none was marked unnecessary |
| `Three or more` | `4` | warn | Pupils with three or more incidents this term |

The chips are the argument the page comment makes: *"the parent was never informed" is the
sentence this page exists to prevent*, which is why `Home not told` is a chip, a filter and
a row verb rather than a column somebody scrolls past.

### The layout, top to bottom

**Region 1 — section `Newest first`, note `9 of 148 · Term 2`.** A section, not a card:
heading on a hairline, no box. Its control row is one `rowFlex` aligned to `flex-end`, with
four filters, a flexible spacer, then the search field.

| Filter | Default value | Width |
|---|---|---|
| `Year group` | `Every year group` | 160 |
| `What happened` | `Anything` | 150 |
| `Sanction` | `Any sanction` | 160 |
| `Home told` | `Told or not` | 140 |

Then the table. Columns verbatim, in order, all left-aligned:

| # | Column | Width | What the cell holds |
|---|---|---|---|
| 1 | `When` | 94 | Mono date and time, 11px |
| 2 | `Pupil` | 168 | Initials avatar, name at 12.5px/600, student number in mono beneath |
| 3 | `Year` | 58 | Form and stream |
| 4 | `What happened` | fluid | A category badge, then **one line of fact** at 12px |
| 5 | `Reported by` | 108 | The member of staff's name |
| 6 | `Sanction` | 140 | The sanction as text, red when its tone is `bad`; or a warn badge `Not decided` |
| 7 | `Home told` | 162 | Three shapes — see below |

Column 7 is the page. It draws one of three things:

- Home was told: an `ok` badge carrying the channel (`Portal notice`, `Phone call`) and the
  timestamp in mono beside it.
- Home was not told: a **brand `tinyBtn` reading `Tell home`**. The gap is a button, not a
  blank.
- Home did not need telling: a plain badge `Not needed`. Drawn once, against
  `None — the bus was late`.

**Region 2 — section `Three or more this term`.** No note, no controls. Columns:

| # | Column | Width | Align |
|---|---|---|---|
| 1 | `Pupil` | 200 | left |
| 2 | `Year` | 64 | left |
| 3 | `Incidents` | 92 | left — a badge, toned per row rather than per count: `bad` on Tadiwa's `4`, `warn` on Rutendo's and Simba's `3`, **`plain` on Tariro's `3`** |
| 4 | `What they were` | fluid | left |
| 5 | `Last` | 84 | left — mono |
| 6 | *(unlabelled)* | 132 | **right** — the row verb |

Total row: `Four pupils` · *(blank)* · `13` · `of 148 incidents this term` · *(blank)* ·
*(blank)*.

The fourth column is what makes this a count rather than a judgement:
`Lateness ×3 — all three the R2 bus` sits in the same table as `Fighting, Phone,
Disruption`, and the reader decides which is a problem. The screen does not.

The badge tone in column 3 says the same thing: Tariro Ncube's `3` is drawn `plain` while
Simba Mafuta's `3` is drawn `warn`, so the tone is a property of the row and not a
threshold on the number. An implementer who derives it from the count alone loses the one
distinction this table exists to draw — and the rule that decides it is **not on the
artboard**, which makes it a question for whoever builds the query, not a constant to copy.

### The verbs

| Verb | Where | What it does |
|---|---|---|
| `Log an incident` | app bar, primary | Opens the create dialog. Writes a `SchoolConductIncident` |
| `Export the log` | band, ghost | Exports the filtered list |
| `Tell home` | row, brand `tinyBtn` | Records guardian contact against the incident — stamps `homeToldAt` and `homeToldChannel`. Not a message-send on its own |
| `Open the record` | row, `tinyBtn` | Navigates to `/schools/conduct/[incidentId]` |

### The refusals

**The artboard draws none.** There is no refusal sentence anywhere on this screen — the
closest thing is the plain badge `Not needed`, which is a state rather than a refusal. Two
refusals will be needed at build time and their copy is **not in the contract**, so
whoever writes them is writing new strings and should say so in the pull request:

- Editing or deleting an incident once home has been told. A school's record of what a
  parent was told has to still be true a year later — the same rule
  `SchoolMessage`'s schema comment already states.
- Logging an incident against a pupil who is not `ACTIVE`.

### What it needs

- **Models**: `SchoolConductIncident`, `SchoolConductCategory`, `SchoolStudent` (exists),
  `SchoolClass` / `SchoolStream` (exist), `SchoolTerm` (exists). The repeats table is an
  aggregate over incidents grouped by pupil, filtered `count >= 3`.
- **Endpoints**: `GET`/`POST /api/v2/schools/conduct/incidents`,
  `POST /api/v2/schools/conduct/incidents/[incidentId]/home-told`,
  `GET /api/v2/schools/conduct/repeats`. **None exists.**
- **Permission**: `schools.conduct`, actions `view`, `create`, `edit`. **Does not exist.**

### States

Per `11-campus-states-and-motion.md`.

- **Loading**: `TableRowsSkeleton` mirroring the real row — seven headers, an avatar and
  two-line cell in column 2, a badge shape in columns 6 and 7.
- **Nothing yet**: the school has logged no incidents at all. `NothingYet`, offering
  `Log an incident`. This is the first day of a term, not a failure.
- **Nothing matched**: `NothingMatched`, naming the four filters in force and offering to
  clear them. **No create button.**
- **Nothing left to do**: relevant to the repeats section and to a filtered
  `Home told = Not told` view. Good news, no create button.
- **Could not load**: `LoadError` scoped to the section that failed. The repeats table
  failing must not take the log down with it.
- **Denied**: a teacher with `view` but not `edit` sees `Tell home` **disabled with the
  reason on it, not hidden** — `RecordActions` already does this.

### Copy that is doing work

1. > Home not told
2. > Tell home
3. > None — the bus was late
4. > Lateness ×3 — all three the R2 bus
5. > of 148 incidents this term
6. > Not decided

---

## ConductIncident — Disruption in Combined Science

| | |
|---|---|
| **Route** | `/schools/conduct/[incidentId]` |
| **Story** | `S-12.1` (and the only home S-12.2 has) |
| **Contract** | `design/campus/checklist/ConductIncident.json` |
| **Artboard** | `design/campus/expansion/ConductIncident.dc.html` |

**Who opens it, and what for.** Rudo Makoni on the Friday morning, having pressed
`Open the record` from the log, checking one thing before she sees Tadiwa's mother at
pick-up: that the sanction was recorded, that the phone call happened, and that the second
detention is on a date somebody has actually booked.

### The chrome

- **App bar title**: `Disruption in Combined Science` — the incident, not the module.
- **Caption**: `Tadiwa Marange · Form 3B · Tue 1 September`. It carries the identity the
  title does not; it changes with the record.
- **Back chevron**: present (`back: true`).
- **Search**: `null`. A record page does not search.
- **Primary action**: `Add an update`, with a note glyph.
- **Band action**: a ghost `Print for the file` with a print glyph.

| Chip | Value | Tone | What it means |
|---|---|---|---|
| `Home told` | `1 Sep 17:05` | ok | The timestamp itself is the chip's value — the question this page answers first |
| `Served` | `0 of 2` | warn | Detentions served against detentions owed |
| `Next detention` | `Fri 4 Sep 14:00` | warn | The next session this pupil is named on |
| `His term` | `4 incidents` | plain | The pupil's incident count this term |

### The layout, top to bottom

**Region 1 — a property block, two columns.** Ten rows, in source order. `properties()`
draws label beside value with a hairline between and **no box**; the value carries a dashed
underline and a pointer cursor, because **pressing a value opens its editor** — rule 4 of
the six composition rules in `13-campus-expansion-canvas.md`, *"Forms live in dialogs"*.
There is no form on this page.

| Label | Value |
|---|---|
| `Pupil` | `Tadiwa Marange · CHS-1288` |
| `What happened` | `Disruption — sent out of the laboratory` |
| `Year group` | `Form 3B` |
| `When` | `Tuesday 1 September, 11:50 · period 4` |
| `Where` | `Combined Science laboratory 2` |
| `Reported by` | `Tendai Sibanda, 11:58` |
| `Others involved` | `Tariro Ncube · CHS-1292 · no sanction` |
| `Sanction` | `Friday detention ×2` |
| `Home told` | `1 Sep 17:05 · telephone, then portal notice` |
| `Reference` | `CI-2026-0417` *(mono)* |

**Region 2 — a violet alert.** Title, verbatim:

> One pastoral note on Tadiwa is not shown here.

with a violet `tinyBtn` `Open pastoral notes`. No body text. This is the crossing point
between the two halves of the page: the discipline record is allowed to say that a pastoral
note **exists** and is not allowed to show it. Violet is the pastoral tone throughout this
page and appears nowhere else on the canvas.

**Region 3 — a two-column grid**, `minmax(0, 1fr) 380px`.

*Left column, first: section `The accounts`, note `2 · taken 1 Sep`.*

| Column | Width | Cell |
|---|---|---|
| `Who` | 190 | Name at 12.5px/600, then what they are at 11px — `Combined Science`, `Form 3B · the pupil` |
| `When` | 98 | Mono |
| `What they said` | fluid | The quotation, with curly quotation marks drawn |

Two rows: the teacher's account, then the pupil's. It is a table because it is the same
three things said twice.

*Left column, second: section `The review`, note `4 of 5 done`.* A **bespoke drawing**, not
a table — a five-step vertical spine, built from the local `spineStep` helper. Each step is
a 26px ringed glyph over a 2px connector, a title at 12.5px/700, a mono timestamp, who at
11px, and a data note at 12px. Done steps are green (`C.ok` on `C.okBg`); the undone one is
amber (`C.warn` on `C.warnBg`).

| # | Title | When | Who | Note | State |
|---|---|---|---|---|---|
| 1 | `Reported` | `1 Sep 11:58` | `Tendai Sibanda · Combined Science` | `Laboratory 2 · period 4` | done |
| 2 | `Seen by the head of year` | `1 Sep 12:30` | `Rudo Makoni · Deputy Head` | `Tadiwa and Tariro Ncube · separately` | done |
| 3 | `Sanction decided` | `1 Sep 14:05` | `Rudo Makoni · Deputy Head` | `Friday detention ×2 · 4 and 11 September` | done |
| 4 | `Home told` | `1 Sep 17:05` | `Rudo Makoni · by telephone` | `Chiedza Marange · 0772 418 336 · dates asked for in writing` | done, with two ok badges: `Phone call` and `Portal notice 17:12` |
| 5 | `Detention served` | `due Fri 4 Sep 14:00` | `Room 12 · supervised by Farai Moyo` | `1 of 2 · the second Fri 11 Sep` | **not done**, with a brand `tinyBtn` `Open the register` |

Every `note` on a step is data — a room, a phone number, a pair of dates. None of them is a
sentence about the design. A page that showed only the outcome would hide the fact that the
second detention has not been served, which is why the spine stays.

*Right column, first: section `Tadiwa this term`, note `4 incidents · 2 merits`.*

| Column | Width |
|---|---|
| `When` | 56 (mono; the current incident's date is drawn strong and 700) |
| `What` | fluid (600 on the current incident) |
| `Sanction` | 132 (a badge, warn where the outcome is unresolved) |

*Right column, second: section `What the report card will say`.* This is **S-12.2, and it
is the whole of S-12.2 on this canvas.** A bespoke drawing: a 1px bordered, 9px-radius
white block holding a `sectionLabel` reading `Conduct — Term 2` and one paragraph at
12.5px. It is deliberately **not** a `card()` — the source comment records that the card
around it was removed because it *"drew a border, a fill and a radius around a quoted
extract that already has its own"*. The heading is a hairline; the extract is the thing
that floats. This is the only card-shaped object on all five artboards, and it is a quoted
extract rather than a container.

### The verbs

| Verb | Where | What it does |
|---|---|---|
| `Add an update` | app bar, primary | Appends to the record. Never overwrites |
| `Print for the file` | band, ghost | Renders the incident for the paper file |
| `Open pastoral notes` | alert, violet `tinyBtn` | Navigates to `/schools/conduct/pastoral`. **Must not carry the note's content in the link, the URL or a preview** |
| `Open the register` | spine step 5, brand `tinyBtn` | Navigates to `/schools/conduct/detention` for the session named |
| Every property value | region 1 | Opens that field's editor |

### The refusals

One is drawn, as the alert's whole title:

> One pastoral note on Tadiwa is not shown here.

That sentence is a refusal, and it is precise about what it refuses. It says a note exists,
names the pupil, and shows nothing else — no author, no date, no band, no body. **It must
render identically for a reader who is not cleared for the note and for one who is**;
otherwise the presence or absence of detail on a discipline page becomes a side channel
into the pastoral record. The `tinyBtn` beside it navigates; it does not reveal.

Two more are needed and **not drawn**, so their copy must be written: refusing an edit to
the `Home told` property once it is set, and refusing to delete an account once given.

### What it needs

- **Models**: `SchoolConductIncident`, `SchoolConductParticipant`, `SchoolConductAccount`,
  `SchoolDetentionAward` + `SchoolDetentionSession` (for the chips `Served` and
  `Next detention` and for spine step 5), `SchoolMeritEntry` (for `2 merits` in the right
  column's note), `SchoolPastoralNote` (**for the count only** — the alert needs `exists`,
  never `body`).
- **Endpoints**: `GET`/`PATCH /api/v2/schools/conduct/incidents/[incidentId]`,
  `POST .../accounts`, `POST .../updates`, and a **count-only** pastoral endpoint that
  returns an integer and nothing else. **None exists.**
- **`lib/documents/schools-sources.ts`** — `resolveReportCard` must grow the conduct
  paragraph. Today it reads `SchoolStudent`, `SchoolTerm`, `SchoolPublishWindow`,
  `SchoolResultLine` and `SchoolSubject`, and throws *"Results for this term are not published. A report card can
  only be printed while the publish window is open."* Conduct has to respect that same
  window or the report card gains a second publication rule.

### States

- **Loading**: the property block gets its own skeleton — ten label/value rows at the right
  height; not a spinner. `TableRowsSkeleton` for both tables. The spine gets a
  `CardsSkeleton`-shaped placeholder; it is not a table.
- **Not found**: `RecordNotFound`. An incident id that is not there, or belongs to another
  campus.
- **Denied**: a teacher may read an incident she reported and not one she did not. The
  violet alert **still renders** — the existence of a pastoral note is not privileged
  information on this page; its content is.
- **Error**: scoped. The report-card extract failing must leave the accounts and the spine
  usable.
- **Saving**: `SavingOverlay` over the property being written, not over the page.

### Copy that is doing work

1. > One pastoral note on Tadiwa is not shown here.
2. > Chiedza Marange · 0772 418 336 · dates asked for in writing
3. > 1 of 2 · the second Fri 11 Sep
4. > Four incidents recorded: two for lateness, one for uniform, one for disruption in a lesson. Two Friday detentions, neither served yet. Two merits.
5. > Conduct — Term 2
6. > “I was answering Tariro. I know I should have stopped when Mr Sibanda asked me the first time.”

---

## ConductMerits — Merits and demerits

| | |
|---|---|
| **Route** | `/schools/conduct/merits` |
| **Story** | `S-12.1` |
| **Contract** | `design/campus/checklist/ConductMerits.json` |
| **Artboard** | `design/campus/expansion/ConductMerits.dc.html` |

**Who opens it, and what for.** Rudo Makoni in the week before prize giving, deciding which
pupils go on the list and whether Form 3's net of `+96` against Form 2's `+268` is a year
group with a problem or a year group whose teachers do not write things down. The second
question is the one the screen is built to make askable.

### The chrome

- **App bar title**: `Merits and demerits`. No caption.
- **Primary action**: `Award a merit`, with a star glyph.
- **Search placeholder**: `Search by pupil`.
- **Band action**: a ghost `Export the term` with a download glyph.

| Chip | Value | Tone | What the number counts |
|---|---|---|---|
| `Merits` | `1,284` | ok | Merit entries at Borrowdale in Term 2 |
| `Demerits` | `396` | warn | Demerit entries in the same term |
| `Net` | `+888` | plain | `1,284 − 396`. Deliberately untoned — a net is not good news or bad news |
| `Pupils with neither` | `214` | plain | Pupils on roll with no entry of either kind. The number nobody looks at |

### The layout, top to bottom

**Region 1 — section `By pupil`, note `8 of 628 · Term 2`.** Control row: three filters,
spacer, search field at 240.

| Filter | Default value | Width |
|---|---|---|
| `Year group` | `Every year group` | 170 |
| `Stream` | `Every stream` | 150 |
| `Sort by` | `Net, highest first` | 180 |

| # | Column | Width | Align | Cell |
|---|---|---|---|---|
| 1 | `Pupil` | 196 | left | Avatar, name, student number |
| 2 | `Year` | 62 | left | |
| 3 | `Merits` | 68 | **right** | Mono, green, 700 |
| 4 | `Demerits` | 78 | **right** | Mono, amber and 700; **grey when the value is `0`** |
| 5 | `Net` | 58 | **right** | Mono 12.5px, green when positive, red when negative |
| 6 | `The last thing recorded` | fluid | left | A `Merit`/`Demerit` badge, the reason, then the date in mono |

Column 6 is what stops the table being a scoreboard. A pupil at `−7` whose last recorded
thing is `Set out the hall for prize giving, unasked` is a different pupil from one at `−7`
whose last recorded thing is a fight, and the net alone cannot tell you which you are
looking at.

**Region 2 — a two-column grid**, `grid(2)`, of two sections.

*Left: section `What gets written down`, note `Term 2`.* One table, **two group headers and
a total** — rule 6 of `13-campus-expansion-canvas.md`, *"Group by the question, not by
the component"*, because merits and demerits are one question.

| Column | Width | Align |
|---|---|---|
| `Reason` | fluid | left |
| `Times` | 70 | **right** |
| `Share` | 150 | left — a proportional bar, 7px, rounded, sized 0–100 by the caller |

Group header 1: `Merits · 669 of 1,284`. Six rows: `Helping in the library` 212,
`Top of the class test` 168, `Represented the school` 96, `Sports colours` 74,
`Read at assembly` 61, `Helped a younger pupil` 58. Bars in green.

Group header 2: `Demerits · 396 of 396`. Six rows: `Lateness` 141, `Uniform` 96, `Phone`
54, `No homework` 48, `Disruption` 31, `Litter` 26. Bars in amber.

Total row: `Recorded this term` · `1,680` · `1,284 merits · 396 demerits`.

The group headers carry two numbers each because they are not the same number: the six
merit reasons drawn are 669 of 1,284, and the six demerit reasons are **all 396 there are**.
A school records demerits for six things and merits for many more, and the group header is
the only place that says so.

*Right: section `By year group`, note `Term 2`.* Columns `Year group` (fluid) ·
`Net` (70, right) · `Share` (150). Six rows, Form 1 to Form 6, bars in brand. Total row:
`All six year groups` · `+888` · *(blank)*.

The arithmetic reconciles in three directions and an implementer should keep it that way:
`1,284 + 396 = 1,680`; `1,284 − 396 = +888`;
`+214 +268 +96 +212 +64 +34 = +888`; the drawn merit reasons sum to 669 and the demerit
reasons to 396.

### The verbs

| Verb | Where | What it does |
|---|---|---|
| `Award a merit` | app bar, primary | Writes a `SchoolMeritEntry` with `kind = MERIT` |
| `Export the term` | band, ghost | Exports the term's ledger |

**There are no row verbs on this screen** — no `tinyBtn` anywhere, and the checklist's
`buttons` array holds exactly one string. Nothing here is opened, edited or reversed from
the list. That is an omission worth a decision, not a design intent: see open question 4.

### The refusals

**None drawn.** Nothing on this screen refuses anything. The two that will be needed — a
demerit cannot be awarded without a reason, and an entry cannot be deleted once it has
counted towards a report card — have no copy in the contract.

### What it needs

- **Models**: `SchoolMeritEntry`, `SchoolMeritReason`, `SchoolStudent`, `SchoolClass`,
  `SchoolStream`, `SchoolTerm`. The three tables are three aggregations over one table:
  by pupil, by reason, by year group.
- **Endpoints**: `GET`/`POST /api/v2/schools/conduct/merits`,
  `GET /api/v2/schools/conduct/merits/summary`. **Neither exists.**
- **Permission**: `schools.conduct`, actions `view` and `award`. A teacher should be able
  to award and not to delete.
- The `Pupils with neither` chip needs the roll, not the ledger: a count of `ACTIVE`
  `SchoolStudent` minus the distinct pupils with an entry.

### States

- **Loading**: three skeletons, one per table, each mirroring its own row — the by-pupil
  one carries four right-aligned numeric columns, the two summary ones carry a bar shape in
  the `Share` column.
- **Nothing yet**: `NothingYet` — no merit or demerit has been recorded this term. Offers
  `Award a merit`.
- **Nothing matched**: `NothingMatched`, naming the year group and stream in force.
- **Error**: scoped per section. `What gets written down` failing leaves `By pupil` usable.
- **Denied**: `Award a merit` disabled with its reason on it.

### Copy that is doing work

1. > Merits · 669 of 1,284
2. > Demerits · 396 of 396
3. > The last thing recorded
4. > Pupils with neither
5. > Set out the hall for prize giving, unasked
6. > Recorded this term

---

## ConductDetention — Detention

| | |
|---|---|
| **Route** | `/schools/conduct/detention` |
| **Story** | `S-12.1` |
| **Contract** | `design/campus/checklist/ConductDetention.json` |
| **Artboard** | `design/campus/expansion/ConductDetention.dc.html` |

**Who opens it, and what for.** Farai Moyo, English teacher, at 14:03 on Friday standing in
Room 12 with a phone, marking twelve names while the R2 bus idles outside. He is the only
classroom teacher who opens any of the five artboards — the other two identities drawn are
a deputy head and the school nurse — and the screen is drawn for a person standing up.

### The chrome

- **App bar title**: `Detention`.
- **Caption**: `Fri 4 September · 14:00 · Room 12 · Farai Moyo` — which session, where, and
  who is supervising. It changes with the session filter.
- **Search**: `null`. Twelve names do not need searching.
- **Primary action**: `Take the register`, with a file-check glyph.
- **Band action**: a ghost `Print the list` with a print glyph.
- **User**: `Farai Moyo` / `English teacher` in the identity card, not `Rudo Makoni`.

| Chip | Value | Tone | What the number counts |
|---|---|---|---|
| `Due here` | `10` | plain | Named for **this** session and not moved elsewhere |
| `Here` | `9` | ok | Marked present |
| `Not marked` | `1` | warn | Named, due, and nobody has said either way |
| `Moved to Saturday` | `2` | warn | Named on this session but serving Saturday instead |

`Here` plus `Not marked` equals `Due here`. `Due here` plus `Moved to Saturday` equals the
twelve the section note names.

### The layout, top to bottom

**Region 1 — a warn alert.** Title, verbatim:

> The R2 leaves at 14:10 — Panashe Zvobgo and Anesu Chirwa serve Saturday 12 September at 08:00 instead.

with a ghost `See the two`. No body text. It is at the top because it is the fact that
changes what the supervisor does in the next seven minutes. This is the awkward truth every
real school hits at 14:00 on a Friday: **a bus pupil and a boarder cannot serve the same
slot.**

**Region 2 — section `Who is due`, note `12 named`.** Control row: three filters, spacer,
then a ghost `Mark everyone here` with a checks glyph — a bulk verb sitting with the table
it acts on, not in the band.

| Filter | Default value | Width |
|---|---|---|
| `Session` | `Fri 4 Sep · 14:00 · Room 12` | 230 |
| `Year group` | `Every year group` | 160 |
| `Serving for` | `Anything` | 150 |

| # | Column | Width | Cell |
|---|---|---|---|
| 1 | `Pupil` | 172 | Avatar, name, student number |
| 2 | `Year` | 58 | |
| 3 | `Serving for` | fluid | The reason and the date — `Disruption — sent out of Combined Science, 1 Sep` |
| 4 | `Session` | 72 | Mono `1 of 2`, `2 of 3` — **amber when the numerator is 2 or 3**, body colour otherwise |
| 5 | `Gets home` | 96 | A glyph and a word: bed glyph for `Boarder`, bus glyph in orange for `Bus R2`, no glyph for `Day` |
| 6 | `Register` | 186 | Three shapes — see below |
| 7 | `Still to serve` | 162 | Amber text `1 more · Fri 11 Sep`, or an em dash in faint |

Column 6 draws one of three things:

- Marked present: an `ok` badge `Here` and the arrival time in mono.
- Moved: a warn badge `Moved to Saturday` and a mono `08:00`.
- Unmarked: a warn badge `Not marked` and **two `tinyBtn`s, `Here` and
  `Did not turn up`**. The decision is in the row, where the supervisor's thumb is.

Total row: `Still to serve after today` in column 1, five blanks, and
`6 sessions · 5 pupils` in mono in column 7. **What is still owed after today is a column
on the register, totalled at the foot — not a second list of the same eleven names.** The
total reconciles: Tadiwa 1, Rutendo 2, Ruvimbo 1, Panashe 1, Anesu 1.

`Gets home` is the column the alert depends on. Without it the alert reads as an arbitrary
exception; with it, the reader can see that six of the twelve are boarders for whom 14:00
costs nothing, four are day pupils, and two are on a bus that leaves in seven minutes.

**Region 3 — section `The coming sessions`, note `11 to 25 September`.**

| # | Column | Width | Align |
|---|---|---|---|
| 1 | `When` | 110 | left — mono, strong, 700 |
| 2 | `Where` | 160 | left |
| 3 | `Supervised by` | fluid | left — **red when the value is `Not yet supervised`** |
| 4 | `Named` | 80 | **right** — mono, strong |
| 5 | *(unlabelled)* | 190 | **right** — a badge, or nothing |

Four rows. The badge column carries `Moved here from today` (warn) against Sat 12 Sep and
`Needs a supervisor` (bad) against Fri 18 Sep; the two ordinary sessions draw nothing.
Total row: `Four sessions` · *(blank)* · *(blank)* · `16` · *(blank)*. `9 + 2 + 4 + 1 = 16`.

`Not yet supervised` drawn in red with `Needs a supervisor` beside it is the second thing
on this screen a person can act on today, and it is a fortnight away. That is why the
section exists at all.

### The verbs

| Verb | Where | What it does |
|---|---|---|
| `Take the register` | app bar, primary | Opens the marking flow for the session in the filter |
| `Print the list` | band, ghost | Prints the register — the thing a supervisor without a phone actually uses |
| `See the two` | alert, ghost | Filters the table to Panashe Zvobgo and Anesu Chirwa |
| `Mark everyone here` | control row, ghost | Bulk-marks every unmarked, unmoved pupil present. Must not touch the moved rows |
| `Here` | row, `tinyBtn` | Marks present, stamps the time, decrements what is owed |
| `Did not turn up` | row, `tinyBtn` | Marks absent. **Does not decrement what is owed** — that is the entire point of the `Still to serve` column |

### The refusals

One is drawn, as the alert title, and it is a refusal in effect rather than in grammar: the
school will not keep a bus pupil past 14:10, so two pupils are moved and the screen says
where to. Verbatim:

> The R2 leaves at 14:10 — Panashe Zvobgo and Anesu Chirwa serve Saturday 12 September at 08:00 instead.

The second refusal is drawn as a state rather than a sentence: a `Moved to Saturday` row
carries **no `Here` button**. You cannot mark somebody present at a session they are not
serving, and the screen enforces that by not offering it.

A third is needed and not drawn: `Mark everyone here` must refuse to mark a moved pupil,
and if somebody presses it while all remaining rows are moved, it needs a sentence.

### What it needs

- **Models**: `SchoolDetentionSession` (with a nullable supervisor),
  `SchoolDetentionAward`, `SchoolDetentionAttendance`, `SchoolConductIncident` (for
  `Serving for`), `SchoolRoom` (**exists** — `code`, `name`, `capacity`, `kind`; it needs a
  new relation), `SchoolTeacherProfile` (**exists**).
- **`Gets home` is derived**, from three existing places: `SchoolStudent.isBoarding`, then
  an open `SchoolTransportRider` for the term joined to `SchoolTransportRoute.code`, then
  `Day` as the fallback. Both transport models exist today. **This derivation is
  load-bearing for the alert** and belongs in a named helper in `lib/schools/`, not inline
  in a component.
- **Endpoints**: `GET`/`POST /api/v2/schools/conduct/detention/sessions`,
  `GET /api/v2/schools/conduct/detention/sessions/[sessionId]/register`,
  `POST .../register` (mark one), `POST .../register/bulk`, `POST .../move`.
  **None exists.**

### States

- **Loading**: `TableRowsSkeleton` with seven headers, an avatar cell, and badge shapes in
  columns 6 and 7. The alert is data-dependent and must not render a skeleton of itself —
  it is absent until the bus conflict is known.
- **Nothing yet**: no session has been scheduled. `NothingYet` offering the verb that
  schedules one.
- **Nothing left to do**: every pupil due today is marked. Good news, no create button.
  This is the state Farai Moyo is trying to reach at 14:06.
- **Nothing matched**: the `Serving for` filter emptied the list. Names the filter, offers
  to clear.
- **Denied**: a teacher who is not the named supervisor may read the register and not mark
  it — `Here` and `Did not turn up` disabled with the reason on them. Per
  `11-campus-states-and-motion.md`: *"Only a head of department can approve a sheet — ask
  Mrs Nyathi, or the head"* is the register a refusal is written in.
- **Offline**: this screen is used in a classroom on a phone. The marking verbs need the
  offline state to mean something, and nothing on the artboard says what.

### Copy that is doing work

1. > The R2 leaves at 14:10 — Panashe Zvobgo and Anesu Chirwa serve Saturday 12 September at 08:00 instead.
2. > Still to serve after today
3. > 6 sessions · 5 pupils
4. > Did not turn up
5. > Not yet supervised
6. > Needs a supervisor
7. > Moved here from today

---

## Pastoral — Pastoral notes

| | |
|---|---|
| **Route** | `/schools/conduct/pastoral` |
| **Story** | `S-12.3` |
| **Contract** | `design/campus/checklist/Pastoral.json` |
| **Artboard** | `design/campus/expansion/Pastoral.dc.html` |

**This is the screen the page exists for, and the one screen in the whole expansion pack
holding notes a parent must not see.** The plan's own recommendation reads *"Build
carefully. The one place in the pack holding notes a parent must not see. Visibility is the
whole story, not a field on it."* The canvas annotation beside the artboard ends: *"Built
any other way, this is the feature that ends up in a newspaper."*

**Who opens it, and what for.** Sister Moyo, the school nurse, on a Thursday afternoon
after a Form 4 girl's third visit to the san in a week, wanting to know whether anyone else
has written anything down about her before she writes the fourth note herself. She is not
the head. She is cleared for two of the three bands and for no pupil scope narrower than
the school, and two of the sixteen notes on the system are closed to her.

### The chrome

- **App bar title**: `Pastoral notes`.
- **No caption.** Nothing about this page's identity changes.
- **Primary action**: `Write a note`, with a note glyph.
- **Search placeholder**: `Search the notes you may read` — in the app bar and again at
  250px in the table's control row. **The placeholder is a permission statement.** It is
  not `Search pastoral notes`, and it must not be paraphrased to that: the search index
  itself is scoped, and the placeholder says so before anybody types a pupil's name into it
  and reads a result count as a signal.
- **Band action**: a single ghost `Who may read what` with a shield glyph.
- **User**: `Sister Moyo` / `School Nurse`.

| Chip | Value | Tone | What the number counts |
|---|---|---|---|
| `You may read` | `14` | plain | Notes this reader is cleared for. **Per reader, not per school** |
| `Withheld from you` | `2` | brand | Notes that exist and are closed to this reader |
| `Review overdue` | `1` | warn | Notes past their review date **among the 14 she may read** |
| `Referred on` | `4` | plain | Notes referred to somebody else — the bursar, in both drawn cases |

`Withheld from you` is shown rather than hidden, and that is a deliberate decision with a
reason: **a head who cannot read a note should still know it exists.** A count of what is
being withheld is not a leak; a silent list is a system that cannot be audited. The chip is
toned `brand` rather than `bad` — being withheld from is not an error state.

**There is no export or print action on this screen.** All four other screens have one
(`Export the log`, `Print for the file`, `Export the term`, `Print the list`). Pastoral has
a shield instead. That absence is the `Never` rule enacted in the chrome, and it must
survive implementation: **no export endpoint, no print route, no CSV, no
`schools.reports/export` source key.**

### The visibility model, precisely

This is the part an implementer must get exactly right.

**Three bands, and only three**, drawn as badges on the notes and named in the readers
table:

| Band | Badge tone | Who reads it |
|---|---|---|
| `Pastoral team only` | plain | Any cleared member of the pastoral team, within their pupil scope |
| `Head and pastoral team` | brand | The head and the pastoral team |
| `Safeguarding — named individuals` | violet | **Only the individuals named on the note.** No role, no persona, no band grant reaches it |

**Four readers, and what each may read**, drawn verbatim in the readers table:

| Who | Role | `May read` | Badge |
|---|---|---|---|
| Rudo Makoni | `Deputy Head` | `Pastoral team only · Head and pastoral team` | `Cleared` (violet) |
| Sister Moyo | `School Nurse — you` | `Pastoral team only · Head and pastoral team` | `Cleared` (violet) |
| Priscilla Nyathi | `Head of Year 3` | `Pastoral team only · Year 3 pupils` | `Cleared` (violet) |
| Elias Chikafu | `Group Head` | `Nothing · unless named on the note` | `Not cleared` (plain) |

Read those four rows carefully, because they encode **two independent axes**:

1. **Which bands.** Rudo and Sister Moyo read two of the three. Nobody in the table reads
   the third by virtue of a role.
2. **Which pupils.** Priscilla Nyathi's cell says `Pastoral team only · Year 3 pupils` —
   one band, and only for the pupils in her year. A clearance is `(bands) ∩ (pupil scope)`,
   and a system that models only the first will show a head of year a Form 1 note.

And a third mechanism sits underneath both: `Nothing · unless named on the note`. The Group
Head — the most senior person in the group — is `Not cleared`, and the only thing that can
open a note to him is being **named on that note**. Seniority does not grant access here
and must not be allowed to leak in through a tenant-admin shortcut.
`lib/schools/permissions.ts` currently short-circuits `SUPERADMIN` and `MANAGER` to `true`
for every school resource before any persona check runs. **That short-circuit must not
apply to pastoral notes.** If it does, the screen is a lie the first time a group
administrator logs in.

**Four destinations a note never reaches**, drawn as the second group of the same table,
each with `Nothing` in the `May read` column and a red `Never` badge:

| Never | Glyph |
|---|---|
| `The parent portal` | users |
| `The report card` | chart |
| `A leaving certificate or testimonial` | graduation |
| `Any export, spreadsheet or print` | download |

These are not readers with zero permissions. They are **systems**, filed in the same table
as the people because the rule is the same kind of fact. An implementer should treat each
as a code path that must not exist, and each as a test.

### The layout, top to bottom

**Region 1 — section `Who may read a pastoral note`, note `3 of 4 cleared · 4 never`.** It
comes **before the notes**, which is the composition decision the whole screen turns on:
the reader is told who can see this before they are shown anything to see. It is a table,
because the rules are data; nothing on the artboard argues for them.

| # | Column | Width | Align |
|---|---|---|---|
| 1 | `Who or where` | 320 | left |
| 2 | `May read` | fluid | left |
| 3 | *(unlabelled)* | 130 | **right** |

Rows, in order: the group header `Staff at Borrowdale · 4 of 148`, then the four readers;
then the group header `Never`, then the four destinations. One table, two group headers —
rule 6 of `13-campus-expansion-canvas.md` again, because "who may read this" is one
question asked about people and about systems.

A cleared reader's avatar is drawn violet-on-violet (`C.violetBg` / `C.violetFg`); an
uncleared one is grey on grey. The `4 of 148` in the group header is doing quiet work: four
people out of a hundred and forty-eight members of staff.

**Region 2 — section `Notes`, note `5 of 14 · 2 withheld`.** Control row: three filters,
spacer, search at 250.

| Filter | Default value | Width |
|---|---|---|
| `Year group` | `Every year group` | 160 |
| `Visibility` | `Everything you may read` | 190 |
| `Review` | `Any review date` | 160 |

The `Visibility` filter's default value is `Everything you may read`, not `Everything`. The
unfiltered state of this table is already a filtered state, and the control says so.

| # | Column | Width | Align | Cell on a readable row |
|---|---|---|---|---|
| 1 | `Pupil` | 176 | left | Avatar, name, then `CHS-1240 · Form 4A` in mono |
| 2 | `Written by` | 124 | left | Author at 12px, the note's date in mono beneath |
| 3 | `The note` | fluid | left | The body at 12px, plus an `ok` badge `Referred: …` when referred |
| 4 | `Who may read it` | 196 | left | The band badge |
| 5 | `Review` | 92 | left | Mono review date, amber when overdue; or `None needed` in faint |
| 6 | *(unlabelled)* | 96 | **right** | A `tinyBtn` `Open` |

Seven rows are drawn: five readable, two withheld, interleaved **in date order** — `3 Sep`,
`1 Sep`, `31 Aug`, **withheld `28 Aug`**, `24 Aug`, **withheld `19 Aug`**, `18 Aug`. The
withheld rows are not collected at the bottom. Their position in the sequence is itself
information — a note exists between 31 August and 24 August, and another between 24 and 18
August — and hiding that would make the list look complete when it is not.

**A withheld row draws six cells and every one of them is different:**

| Column | What the withheld row shows |
|---|---|
| `Pupil` | A lock glyph in violet, and the words `A note you may not read` at 12px/600 in violet. **Not the pupil's name, number or year group** |
| `Written by` | `Not shown`, in faint |
| `The note` | A **hatched bar** — 16px tall, 4px radius, filled with a 135° `repeating-linear-gradient` alternating `C.muted` and `C.hair` every 6px, behind a `C.borderSubtle` hairline. Not a blurred body, not a truncated body, not a character count. There is nothing behind it to reveal |
| `Who may read it` | The band badge — `Safeguarding — named individuals`, violet |
| `Review` | The note's **date** in mono, subtle |
| *(verb)* | A violet `tinyBtn` `Ask to see it` |

So: a withheld row tells you that a note exists, roughly when, and under which band, and
nothing else. It does not tell you the pupil — which matters, because the pupil is the one
fact that would let a reader infer the content from context.

**One defect to fix, not to reproduce.** The withheld row's date is placed in the fifth
cell, which is the `Review` column. On a readable row the note's date sits in
`Written by` and the fifth cell holds the review date. So a withheld row renders `28 Aug`
under a heading that says `Review`, and it is not a review date. The implementer should put
the date under `Written by`, beneath `Not shown`, and leave `Review` empty. See open
question 3.

The five readable notes, for reference — these are the strings the contract carries:

| Pupil | Author | Date | Band | Referral | Review |
|---|---|---|---|---|---|
| Nyasha Zimuto | Sister Moyo, School Nurse | 3 Sep | `Pastoral team only` | — | `17 Sep` |
| Tadiwa Marange | Rudo Makoni, Deputy Head | 1 Sep | `Head and pastoral team` | `Referred: Bursar — waiver form` | `15 Sep` |
| Tariro Ncube | Priscilla Nyathi, Head of Year 3 | 31 Aug | `Pastoral team only` | — | `None needed` |
| Kudzai Nyathi | Rudo Makoni, Deputy Head | 24 Aug | `Head and pastoral team` | — | `None needed` |
| Rutendo Chikwanda | Sister Moyo, School Nurse | 18 Aug | `Head and pastoral team` | `Referred: Bursar — hardship` | `Was due 8 Sep` (amber) |

Three of the five cross into money — a waiver form, hardship, boarding fees paid by an
uncle — and all three of those pupils (`Tadiwa Marange`, `Rutendo Chikwanda`,
`Kudzai Nyathi`) also appear on the behaviour log. That is the
argument the page makes without a sentence: `Tadiwa Marange`'s four incidents on `Conduct`
and *"His father's job ended in July. The lateness started the week the fees letter went
home."* here are the same child, and only one of the two screens explains the other.

### The verbs

| Verb | Where | What it does |
|---|---|---|
| `Write a note` | app bar, primary | Opens the compose sheet. **The band is chosen when the note is written**, not afterwards, and there should be no "change visibility" verb on a written note without a decision behind it |
| `Who may read what` | band, ghost | Opens the clearance register — who is cleared, for which bands, for which pupils |
| `Open` | readable row, `tinyBtn` | Opens the note. **This is the action that should write an audit event** |
| `Ask to see it` | withheld row, violet `tinyBtn` | Raises an access request against a note whose content the requester has not seen. It notifies the named individuals; it does not grant anything |

There is deliberately **no bulk action, no export, and no print**.

### The refusals

Every refusal on this screen is drawn as data rather than as a sentence, which is the point
the source comment makes: *"The rules are resisted by drawing them as data."*

1. **`Never`** — a red badge, four times, against `The parent portal`, `The report card`,
   `A leaving certificate or testimonial` and `Any export, spreadsheet or print`. The `May
   read` cell beside each says `Nothing`. This is the strongest refusal on the whole canvas
   and it is two words.
2. **`Not cleared`** — a plain badge against the Group Head, with the sentence
   `Nothing · unless named on the note` beside it.
3. **`A note you may not read`** — the withheld row's own label, in the pupil column where
   a name would be. It refuses in the place the thing it is refusing would have gone.
4. **`Not shown`** — the author cell of a withheld row.
5. **The absent export button.** A refusal expressed by the chrome not having it.

None of these five may be softened, reworded or made conditional. `A note you may not read`
is not `Restricted note` and not `Confidential`; it is written in the second person because
the reader, not the note, is what makes it unreadable.

### What it needs

**This section is why the screen exists. Row-level access control, not a visibility enum.**

A `band` column on `SchoolPastoralNote` is necessary and **nowhere near sufficient.** Three
of the five refusals above cannot be expressed by an enum: the named-individual band, the
per-reader pupil scope, and the four never-destinations.

- **Models**: `SchoolPastoralNote`, `SchoolPastoralNoteReader` (the per-note named
  individuals), `SchoolPastoralClearance` (per staff member: bands **and** pupil scope),
  `SchoolPastoralAccessRequest`. **None exists.** `SchoolStudent`, `SchoolClass`, `User`
  and `SchoolTeacherProfile` exist.
- **One access helper, and every read goes through it.** A single
  `lib/schools/pastoral-access.ts` exporting (a) a Prisma `where` builder that no caller may
  bypass, and (b) a projection function that returns either a full note or the redacted
  shape. **The redacted shape must be constructed, not filtered** — it is built from
  `{ id, writtenAt, band }` and never from a full note object with fields deleted, because
  a deleted field is one `JSON.stringify` away from coming back.
- **The body must never leave the database for an uncleared reader.** Not to the API layer,
  not to the server component, not into a React prop, not into a cache key, not into a
  `useQuery` payload the browser can open in devtools. Select it conditionally in the query,
  not after it.
- **Withheld rows are returned deliberately**, because the count is shown. They are a
  separate projection, not an accident of filtering.
- **The tenant-admin short-circuit must be disabled for this resource.**
  `canSchoolRoleDo` returns `true` for `SUPERADMIN` and `MANAGER` before any persona check.
  Pastoral needs its own entry point that does not.
- **Three of the four roles drawn have no persona.** There is no nurse, head-of-year or
  group-head `PersonaCode`. A clearance is not a persona anyway — it is a grant to a named
  person, made by a named person, at a recorded time, and revocable. Build the clearance
  table; do not try to express it as roles.
- **Audit every read.** `PlatformAuditEvent` exists, is hash-chained and takes `actor`,
  `eventType`, `entityType`, `entityId` and `reason`. Opening a note body is an event. **Not
  drawn on any artboard** — it is required by the subject matter.
- **Four never-destinations, as four tests:**
  1. `lib/documents/schools-sources.ts` — `resolveReportCard` must not read the pastoral
     table. Assert it. The same file also resolves a leaving certificate or testimonial if
     S-13.5 ever lands; the same assertion belongs there.
  2. `app/api/v2/schools/portal/parent/**` — no route may reach pastoral. The existing
     `_guard.ts` and `parent-scope.test.ts` are the pattern to copy.
  3. `app/api/v2/schools/reports/export/route.ts` — must reject any pastoral source key.
  4. No pastoral route may return `Content-Disposition: attachment`, and no pastoral page
     may offer a print stylesheet.
- **Endpoints**: `GET`/`POST /api/v2/schools/conduct/pastoral/notes`,
  `GET /api/v2/schools/conduct/pastoral/readers`,
  `POST /api/v2/schools/conduct/pastoral/notes/[noteId]/access-request`, and a **count-only**
  endpoint for `ConductIncident`'s alert. **None exists.**
- **Permission**: `schools.pastoral` — a **separate resource from `schools.conduct`**.
  Folding them is the mistake this screen is drawn to prevent.

### States

- **Loading**: `TableRowsSkeleton` for both tables. The notes skeleton **must not
  distinguish a withheld row from a readable one** — if the placeholder shapes differ, the
  redaction is legible before the data arrives.
- **Nothing yet**: nobody has written a pastoral note. `NothingYet`, offering `Write a
  note`.
- **Nothing matched**: `NothingMatched`, naming the filters. The count it reports must be
  the count within what this reader may see — a matched count that included withheld notes
  would turn the search box into an oracle.
- **Could not load**: `LoadError` scoped to the failing section. **A failure must fail
  closed** — a read that errors shows the error, never an unredacted fallback.
- **Denied, at the page**: a member of staff with no clearance at all gets the page, not a
  404. `NotYourJob`, naming who can — the head and the pastoral team — because
  `11-campus-states-and-motion.md` is explicit that *"You do not have permission"* is a dead
  end. Hiding the destination entirely would make a nurse think the feature does not exist.
- **Denied, at a row**: not a denied state at all. It is the withheld row, which is a
  normal, drawn, first-class part of the list.
- **Saving**: `SavingOverlay` over the compose sheet.

### Copy that is doing work

Every one of these is verbatim and none may be paraphrased.

1. > A note you may not read
2. > Not shown
3. > Nothing · unless named on the note
4. > Safeguarding — named individuals
5. > Pastoral team only · Year 3 pupils
6. > Never
7. > Nothing
8. > Any export, spreadsheet or print
9. > A leaving certificate or testimonial
10. > Search the notes you may read
11. > Everything you may read
12. > Withheld from you
13. > Who may read a pastoral note
14. > Ask to see it
15. > His father’s job ended in July. The lateness started the week the fees letter went home.

---

## Open questions

1. **Pastoral notes is filed under Welfare and routed under Conduct.** The sidebar puts the
   row in the **Welfare** group, and `13-campus-expansion-canvas.md` explains why at length:
   *"A pastoral note is not a discipline record. Filing it under Conduct would have told
   every person who opened the menu that it was."* The route is
   `/schools/conduct/pastoral`. Every argument the canvas makes about the menu applies to
   the URL — a URL is read aloud, pasted into an email and printed at the foot of a page.
   Either the route moves to `/schools/welfare/pastoral`, or the canvas owes an explanation
   for why the menu and the address may disagree. This is the single most consequential
   unresolved item on the page, because it is also the thing hardest to change after
   launch.

2. **Are a demerit and an incident the same row?** `Conduct` counts `148` incidents this
   term. `ConductMerits` counts `396` demerits. Four of the six demerit reasons —
   `Lateness`, `Uniform`, `Phone`, `Disruption` — are also incident categories on `Conduct`
   (`No homework` and `Litter` are not), and `Kudzai Nyathi`'s `Phone out in the Accounting lesson`
   appears on both screens with the same date. If they are one table read two ways, 148 and
   396 cannot both be right. If they are two tables, then logging a lateness and awarding a
   demerit for it are two separate acts a teacher must remember to perform, and neither
   screen says so. The schema cannot be drawn until this is answered, and it is the first
   question a data model has to settle.

3. **The withheld row puts the note's date under `Review`.** `redactedCells` returns the
   date as its fifth cell, and the fifth column is `Review`. On a readable row the note's
   date lives under `Written by` and `Review` holds a review date. So a withheld row shows
   `28 Aug` under a heading that means something else. It is a one-line fix in the drawing
   and a real misreading in the build — a reader could conclude that a safeguarding note is
   due for review on a date that is actually when it was written.

4. **`Award a merit` exists; nothing awards a demerit, opens a pupil, or reverses an
   entry.** `ConductMerits` has exactly one button on the whole screen. Demerits are half
   the table, half the chips and half the arithmetic, and no verb creates one. Nothing opens
   a pupil's ledger from the list. Nothing corrects an entry made in error, which is a thing
   that happens with merit points more than with anything else in a school. Per
   `10-campus-screen-contract.md`, *"A screen that lists things must let somebody create,
   edit and delete them. "View-only for now" is not a deliverable."* The contract for this
   screen does not currently satisfy the contract for screens.

5. **`Served 0 of 2` and `1 of 2 · the second Fri 11 Sep` are on the same artboard.** The
   band chip on `ConductIncident` says `0 of 2` served; the last step of the review spine
   says `1 of 2`. The screen is frozen before Friday 14:00, so the chip is right and the
   spine's `1 of 2` must mean "this step covers the first of two" — but a reader has no way
   to know that, and the two numbers sit four inches apart. One of them needs rewording.

6. **`9` means two different things on `Conduct`.** The band chip `Home not told` reads
   `9`; the section note reads `9 of 148 · Term 2`, where the 9 is the number of rows drawn.
   This is the same failure `foundation.md` records against `$41,204` and `842`, on a
   smaller number that is therefore easier to conflate.

7. **Nothing says what happens to a conduct record when a pupil leaves.** S-13.4 proposes
   leavers and alumni. A behaviour log is the record a school is most often asked for after
   a pupil has gone — by the next school, by a lawyer, by the pupil at twenty-five. Neither
   this page nor the leavers page draws a retention rule, and pastoral notes in particular
   need one before the first note is written, not after.

8. **`Ask to see it` has a button and no designed outcome.** The verb raises a request
   against a note whose content the requester has not seen. Who decides it, how quickly,
   what the requester sees while it is pending, what they see when it is refused, and
   whether the named individuals learn who asked — none of that is on any artboard, and all
   of it is policy the school sets rather than the product.

9. **Does the report card's conduct paragraph respect the publish window?**
   `resolveReportCard` throws *"Results for this term are not published. A report card can
   only be printed while the publish window is open."* Conduct has no publish window of its
   own. If the paragraph rides on the results window, a school that has not published marks
   cannot print a conduct summary; if it does not, the report card gains a second
   publication rule and a second way to leak a term's data early.

10. **Every artboard is scoped to one campus and no model can hold a campus.** All five
    declare `Borrowdale campus`, and `campusId` appears nowhere in the schema. Building
    conduct before S-11.1 means five more tables joining the backfill queue. Building it
    after means conduct waits on a group feature that most `STANDARD` schools will never
    use. The cheap answer is to add a nullable `campusId` to all five new tables now and
    ignore it until S-11.1 lands.

---

## Build order

**1. `Conduct` — the behaviour log.** It carries the models everything else reads:
`SchoolConductIncident` and `SchoolConductCategory`. Nothing else on this page can be built
without them, and it is the screen that proves the packaging argument on its own — a school
that has the log has the thing S-P.1 was parked for. **Unblocks all four of the others.**
Do not start it until open question 2 is answered; the answer decides whether it shares a
table with merits.

**2. `ConductIncident` — one incident, end to end.** It is the same models with no new
tables except `SchoolConductAccount` and `SchoolConductParticipant`, and it is where the log
becomes a record rather than a list. It also contains the whole of S-12.2, which means the
report-card change lands here. Build it second because the `Open the record` verb on
`Conduct` points at nothing until it exists. **Unblocks the report-card work and the parent
portal half of S-12.2.**

**This step ships incomplete on purpose, and the two places it is incomplete must be named
in the pull request.** `ConductIncident` as drawn also reads the detention tables (step 3)
and the pastoral table (step 5), neither of which exists yet: the band chips `Served` and
`Next detention`, spine step 5 `Detention served` with its `Open the register` verb, and the
violet alert's count all depend on them. Ship step 2 with those three surfaces absent rather
than faked — an incident page that draws `Served 0 of 2` from nothing is worse than one that
does not draw the chip — and close them in steps 3 and 5. Everything else on the page stands
on step 1's tables plus `SchoolConductAccount` and `SchoolConductParticipant`.

**3. `ConductDetention` — the register.** It needs three new tables of its own
(`SchoolDetentionSession`, `SchoolDetentionAward`, `SchoolDetentionAttendance`) and the
`Gets home` derivation, but it reads incidents rather than defining them. Build it third
because `ConductIncident`'s spine step 5 and band chips `Served` and `Next detention` are
unfinished without it — the incident page is honest about the detention only once the
register exists. **Unblocks the `Served` chip and closes the incident's review spine.**

**4. `ConductMerits` — the ledger read the other way.** Two new tables, three aggregations,
no new relationships to anything already built. It is last of the four conduct screens
because it is the only one nothing else depends on, and because open question 4 means its
scope is not yet settled. **Unblocks nothing.**

**5. `Pastoral` — last, and on its own.** It shares no model with the other four. It should
be built last not because it is least important but because it is the one that must not be
rushed into a sprint alongside four screens that are merely tables: it needs its own access
helper, its own permission resource, its own audit trail and four negative tests against
systems that already exist. Building it beside the others invites somebody to reuse
`schools.conduct` for it, which is the one mistake the screen is drawn to prevent. It needs
a named reviewer for the access model before a line is written. The one thing it does need
early is the count-only endpoint that `ConductIncident`'s violet alert calls — specify that
interface when building screen 2, and implement it here.
