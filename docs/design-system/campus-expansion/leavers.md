# Campus expansion canvas — Leavers and alumni

The fifth page of the expansion canvas, and the only one that finishes something
rather than starting it. `lib/schools/year-rollup.ts` already promotes, repeats,
graduates, transfers and withdraws a pupil at the end of a year — `applyYearRollUp`
at line 297 sets `SchoolStudent.status` to `GRADUATED` or `WITHDRAWN`, nulls
`currentClassId` and `currentStreamId`, and closes the enrolment. After that the
record falls out of view rather than out of the database. It is still findable —
`components/schools/students/students-list-content.tsx` has an `all` tab and a status
select whose options include `Left — completed` and `Left — withdrawn` — but it opens
on its `active` tab, no tab is a leavers tab, and every class- and enrolment-scoped
list loses the pupil anyway because `currentClassId` is now null. So the record is
reachable and nothing points at it. Nothing owns the week between a child's last day
and the day the school can honestly say they have gone: the book that is still out,
the $210 that is still owed, the bed nobody freed, the portal account still able to
sign in, and the
certificate the next school is waiting for. These four artboards are that week, and
then the register the week produces.

Two stories. **S-13.4** — *"Leavers and alumni — a pupil who has left is a record,
not a deletion"* — is Leavers, Alumni and AlumniRecord. **S-13.5** — *"School-leaving
certificate and testimonial documents"* — is LeavingDocuments, and is small on
purpose: it rides the S-5.x document pipeline rather than growing a renderer of its
own.

**Packaging is not decided.** `SCHOOL_PRICING_BANDS` in `lib/marketing/pricing.ts`
has four bands (Community $249, Standard $549, Premier $949, Group quoted) and
`SCHOOL_ADD_ONS` has four add-ons (Transport & routes $79, ZIMRA fiscalisation $49,
Custom branding & domain $79, Data migration $199). None of the eight mentions
leavers, alumni or leaving documents. The expansion plan's recommendation column for
S-13.4 reads *"**Build.** S-1.5 already promotes, repeats, graduates and transfers;
graduating currently leads nowhere"* — a reason, not a band. Only S-12.1 names a band
(*"**Build.** Fold into `STANDARD`: table stakes, not an upsell"*). S-13.1 does not
either: its row is *"**Build.** The one thing every Zimbabwean secondary school does
that the pack cannot…"*, and the plan's open decision 4 is *"Is ZIMSEC registration
(S-13.1) an add-on or part of `PREMIER`?"* The $99 a term attached to S-13.1 lives in
`exams.md` and `foundation.md` and is that canvas's own proposal, not a plan
decision. A packaging call has to be made before this is costed.
The honest argument is that S-13.5 belongs wherever S-13.4 lands, because a leaving
queue whose last mark cannot be made is not shippable.

Source: `design/campus/screens/leavers.mjs`
Kit: `design/campus/lib/expansion-kit.mjs`
Artboards: `design/campus/expansion/Leavers.dc.html`, `Alumni.dc.html`,
`AlumniRecord.dc.html`, `LeavingDocuments.dc.html`
Canvas page: `leavers` — *"Leavers and alumni"*

**Quoting convention.** Copy is quoted as it renders, with HTML entities resolved
(`&middot;` as a middle dot, `&mdash;` as an em dash). Where the source wraps a
phrase in `<b>` the emphasis is preserved, because the emphasis is part of what the
sentence does.

All four screens declare `scope: { group: 'Chishawasha Trust', campus: 'Borrowdale
campus' }` and `user: { name: 'Rudo Makoni', role: 'Deputy Head' }`. The shell is the
one described once in `docs/design-system/campus-expansion/foundation.md` — 248px
sidebar, 48px app bar, sticky band, `page()` content. It is not restated here.

---

## Before any of this can be built

This is the section that stops somebody starting on a Tuesday. **Almost nothing
these four screens need exists.** The schema has been read; what follows is what is
actually in `prisma/schema.prisma` today.

### What exists and can be used as-is

| Model / module | What it gives these screens |
|---|---|
| `SchoolStudent` | `status: SchoolStudentStatus` — `APPLICANT · ACTIVE · SUSPENDED · GRADUATED · WITHDRAWN`. `isBoarding: Boolean`. `userId: String?` (the portal account). `studentNo`, `admissionNo`, `dateOfBirth`, `admissionDate`, `customFields: Json?` |
| `SchoolEnrollment` | `status: ACTIVE · TRANSFERRED · WITHDRAWN · COMPLETED` and `endedAt: DateTime?`. **This is the only place a leaving date lives today**, and it is a term-scoped enrolment date, not a last day |
| `SchoolFeeInvoice` | `balanceAmount`, `status` — the fees mark, and the `$210.00 on INV-2026-0509` on LeavingDocuments |
| `SchoolBookLoan` | `returnedAt: DateTime?`, `dueAt`, `fineAmount` — the library mark |
| `SchoolBoardingAllocation` | `status: ACTIVE · TRANSFERRED · ENDED`, `endDate: DateTime?` — the bed mark |
| `SchoolPortalInvite` | `claimedAt`, `revokedAt` — with `SchoolStudent.userId`, the portal mark |
| `SchoolPublishWindow`, `SchoolResultSheet`, `SchoolResultLine` | the *Results publish 4 Dec 2026* hold on the statement of results |
| `DocumentTemplate`, `DocumentTemplateVersion`, `DocumentRenderJob`, `DocumentArtifact` | the whole S-5.x pipeline the leaving documents ride |
| `lib/documents/schools-sources.ts` | the eight school document resolvers, `SCHOOL_DOCUMENT_SOURCE_KEYS` and `SCHOOL_DOCUMENT_ACCESS` |
| `lib/schools/year-rollup.ts` | `applyYearRollUp` — what puts a pupil into this queue in the first place |

### What does not exist at all

**No leaver model.** There is no `SchoolLeaver`, no `SchoolLeaverClearance`, no
clearance row of any kind. The five marks that the Leavers queue is built around have
nowhere to be recorded — they can each be *derived* from the models above, but
"derived" means the queue is a five-way join recomputed on every read, and a mark
somebody deliberately overrode (a book written off, a fee waived by the head) has
nowhere to be stored. **Decide this first**, because every other line in this document
depends on it.

**No leaving fields on `SchoolStudent`.** There is no `leavingDate`, no `lastDay`, no
`leavingReason`, no `leftAt`. The `Last day` column (`27 Nov 2026`, `10 Sep 2026`, …)
has no source. The nearest thing is `SchoolEnrollment.endedAt`, which
`applyYearRollUp` sets to `new Date()` — the day the office pressed the button, not
the child's last day.

**No leaving-reason vocabulary.** The queue draws seven reasons verbatim —
`Completed Form 4`, `Completed Upper 6`, `Fees`, `Transferred to another school`,
`Moved abroad`, `Expelled`, `Withdrawn by guardian`. `SchoolStudentStatus` carries
five values and **has no `EXPELLED` and no `TRANSFERRED`**; `SchoolEnrollmentStatus`
has `TRANSFERRED` but that means *moved class*, not *left the school*. The reason is
a second axis from the status and needs its own enum or column.

**No alumni model.** No `SchoolAlumnus`, no alumni table, no view. The Alumni register
is drawn as 1,412 people; the only way to produce that list today is
`SchoolStudent where status in (GRADUATED, WITHDRAWN)`, which means the alumni
register and the student register are the same table filtered — a decision that has
to be made deliberately, not discovered.

**No contact consent.** Nothing in the schema records whether a former pupil may be
written to. The only `consent*` columns anywhere are on `SchoolHealthRecord`
(`consentFirstAid`, `consentEmergencyTreatment`, `consentPhotography`,
`consentOutings`, `consentGivenBy`, `consentGivenAt`) — a different record, a
different subject and a different meaning. The three-state model the screens require
(`May contact` / `No contact` / `Not asked`) does not exist, and the third state is
the one that matters: a nullable boolean would collapse *"they said no"* and
*"nobody has asked"* into one answer, which is the exact mistake the Alumni screen is
drawn to prevent.

**No destination.** `Where they went` — `Transferred &middot; Prince Edward School`,
`Employed &middot; Old Mutual, Harare`, `University of Zimbabwe &middot; BSc
Accounting`, `Unknown` — has no field and no vocabulary. The Alumni band chip
`Destination unknown` counts 1,121 of 1,412 against a column that does not exist.

**No alumni timeline.** The `Since school` table on AlumniRecord — seven entries,
each with a date, a sentence, an optional document reference and who recorded it —
has no model. There is no `SchoolAlumniUpdate`.

**No house, no prizes, no colours.** `Nyanga House &middot; boarder from Form 3` and
`2017 Accounting prize &middot; 2018 full colours, hockey &middot; 2019 Head of
Nyanga House` have nowhere to live. A grep for `house`, `prize`, `colours` across the
schema returns nothing school-related. `SchoolStudent.customFields: Json?` could
carry house, but a prize list is a collection and does not belong in a JSON blob on
the pupil.

**No conduct model.** AlumniRecord's `Conduct` row — `Clear &middot; two merits in
Upper Sixth` — depends on **S-12.1**, which is also unbuilt. There is no
`SchoolConductIncident`, no merits and no demerits in the schema.

**No public-exam model.** The whole `Public exam results` table on AlumniRecord —
subject, level, grade, points, series — depends on **S-13.1 / S-13.2**, unbuilt.
There is no candidate model, no ZIMSEC anything, and `SchoolResultLine` is internal
marks against a `SchoolResultSheet`, keyed by `subjectCode` with a `Float` score and
a free-text `grade: String?`. `Grade` is the one column of the five that has a home;
`Level`, `Points` and `Series` have none, and nothing can express `7 at B or better`
or a points total.

**No campus.** `campusId` does not appear anywhere in `prisma/schema.prisma`. The
`scope` in the sidebar header, `BOR/LC/2026/0184`, and `Borrowdale campus` on the
certificate all depend on **S-11.1**. These screens can be built single-campus and
will need the campus prefix retrofitted; the document number format is the place that
will hurt.

**No endpoints.** `app/api/v2/schools/leavers/` does not exist.
`app/api/v2/schools/alumni/` does not exist, and nothing under
`app/api/v2/schools/` mentions leavers, alumni or clearance. The one `consent*`
endpoint there is `app/api/v2/schools/health/[studentId]/route.ts`, which writes the
four `SchoolHealthRecord` booleans — a different consent, as below.

**No pages.** `app/schools/leavers/` and `app/schools/alumni/` do not exist. All four
screens are currently reported by `node scripts/campus-conformance.mjs` under
**NO PAGE**, which is correct — their routes are registered in that script's
`SCREENS` map at lines 167–170.

**No permission resource.** `SCHOOL_RESOURCES` in `lib/schools/permissions.ts` is
nine values and contains no `schools.leavers` and no `schools.alumni`. The nearest is
`schools.students`, which is what the transfer letter already uses. Adding a resource
is three files, not one: the array in `lib/schools/permissions.ts`, the identical
nine-value `SchoolResource` union in `lib/schools/access.ts`, and the persona grants
in `lib/platform/personas.ts`. `lib/schools/access.ts` also carries `whoCan(resource,
action)` over a `WHO_CAN` map — *"the bursar"*, *"the warden"*, *"the registrar"*,
*"the head of department"* — which is the shipped mechanism for the naming-who-can
sentence every **Denied** state below asks for, and it is the thing to extend rather
than `schoolPermissionDenial`.

**No feature key.** There is no `schools.leavers` or `schools.alumni` in the feature
catalogue, which is the same fact as "packaging is not decided" stated in the place a
migration would have to touch.

### The document pipeline — do not build a seventh renderer

`lib/documents/schools-sources.ts` is the S-5.x pipeline's school half. Its own
header says it plainly:

> These are resolvers for the shared document pipeline
> (`lib/documents/source-registry.ts`), not a second one. That pipeline already owns
> the branded template, the tenant's letterhead, the PDF renderer and the template
> editor a school can change the wording in; a school-specific renderer would be a
> second layout to keep in step with the first and a second place for a logo to go
> missing.

`SCHOOL_DOCUMENT_SOURCE_KEYS` holds **eight** keys today — the expansion plan's
S-13.5 row says six, and it is out of date:

```
schools.fee.invoice · schools.fee.receipt · schools.fee.statement ·
schools.report-card · schools.admission-letter · schools.transfer-letter ·
schools.class-list · schools.attendance-register
```

Of the five documents LeavingDocuments draws, exactly one already exists:
**`schools.transfer-letter`** is the Transfer certificate, resolved by
`resolveTransferLetter` at `lib/documents/schools-sources.ts:710`. The other four —
`School-leaving certificate`, `Testimonial`, `Statement of results` and
`Fees-clearance letter` — **do not exist as source keys**. Adding each is four
edits across two files, and no new renderer:

1. a key in `SCHOOL_DOCUMENT_SOURCE_KEYS`;
2. an entry in `SCHOOL_DOCUMENT_ACCESS` giving it a `feature` and a `SchoolResource`.
   That map is typed `Record<SchoolDocumentSourceKey, …>`, so a key added without an
   entry fails to compile at the map's own declaration in
   `lib/documents/schools-sources.ts`. That is deliberate;
3. a `case` in `resolveSchoolDocument`, whose `switch` carries no `default` and whose
   return type is `Promise<Resolution>` — an unhandled key is a compile error there
   for the same reason;
4. a resolver returning a `Resolution` whose `payload` is a
   `UniversalDocumentPayload`, plus a default template in
   `lib/documents/default-template-catalog.ts` — `letterTemplate(...)` for the three
   letters, as `schools.transfer-letter` does with `letterTemplate("Transfer Letter")`.

The certificate drawn on the artboard is a **preview**, not a renderer. It is a
bespoke local helper in `leavers.mjs` at A4 proportion so a reader can see what the
page produces; the artefact itself comes out of the pipeline.

### The checklist, as a checklist

- [ ] Decide packaging — which band or add-on, at what price.
- [ ] Decide whether a leaver is a row (`SchoolLeaver`) or a computed join. Everything below assumes a row.
- [ ] `SchoolLeaver` — student, last day, reason, opened by, closed at, closed by.
- [ ] Clearance — five marks, each with a state (`done` / `todo` / `n/a`), who made it, when, and an override note.
- [ ] A leaving-reason enum, and whether `EXPELLED` joins `SchoolStudentStatus`.
- [ ] Alumni — a model or an agreed view over `SchoolStudent`.
- [ ] Contact consent — three states, plus who gave it and when.
- [ ] Destination — a field, a vocabulary, and a "last confirmed" date.
- [ ] `SchoolAlumniUpdate` — the `Since school` timeline.
- [ ] Four new document source keys, their access entries, their `resolveSchoolDocument` cases, resolvers and default templates.
- [ ] `GET/POST /api/v2/schools/leavers`, `/leavers/[id]/clearance`, `/leavers/[id]/documents`.
- [ ] `GET/POST /api/v2/schools/alumni`, `/alumni/[id]`, `/alumni/[id]/timeline`, `/alumni/[id]/consent`.
- [ ] `schools.leavers` and `schools.alumni` in `lib/schools/permissions.ts`, `lib/schools/access.ts` and `lib/platform/personas.ts` — all three — plus their `WHO_CAN` entries; or an agreed decision to ride `schools.students`.
- [ ] House, prizes and colours — or accept that AlumniRecord ships with three blank rows.
- [ ] S-12.1 for the Conduct row and S-13.1/S-13.2 for the exam table, or accept both as unset.

---

## The navigation these screens add

Two rows, both joining **Students**, a group that already exists. From `NAV` in
`design/campus/lib/expansion-kit.mjs`:

| Row | Glyph | Route | Ring |
|---|---|---|---|
| `Leavers` | `SignOut` | `/schools/leavers` | yes — proposed |
| `Alumni` | `GraduationCap` | `/schools/alumni` | yes — proposed |

They sit at the end of the group, after `All students · Admissions · Guardians ·
Roll up the year · Import records`. The order is the order of the year: a pupil is
admitted, taught, rolled up, and then leaves.

`AlumniRecord` declares `railItem: 'Alumni'` and `LeavingDocuments` declares
`railItem: 'Leavers'` — both are children, and neither adds a row. Passing a label
the sidebar does not carry throws at build time.

The 7px hollow brand ring comes off in one place when a row ships: drop the `NEW`
flag on that row in `NAV`, and add the destination to `lib/navigation.ts`, which
carries neither string today.

---

## Leavers — Leavers

| | |
|---|---|
| **Route** | `/schools/leavers` |
| **Story** | `S-13.4` |
| **Contract** | `design/campus/checklist/Leavers.json` |
| **Artboard** | `design/campus/expansion/Leavers.dc.html` |

**Who opens it, and what for.** Rudo Makoni, Deputy Head, on the Monday of the last
week of Michaelmas term, with nine Form 4s and Upper Sixths who finished on the 27th
and a bursar who wants to know which of them walked out owing money. She is not
looking for a pupil; she is looking for the **partial** ones — the seven who are
nearly gone, because a leaver who is nearly gone is the one that costs the school
something.

### The chrome

- **App bar title**: `Leavers`. No caption.
- **Primary action**: `Record a leaver`, plus glyph. For the pupil who left without
  going through the roll-up — most leavers arrive from `applyYearRollUp`, but a
  family that moves abroad in September does not wait for December.
- **Search placeholder**: `Search the leaving queue`.
- **Band action**: a ghost `Export the queue` with a download glyph.

Band chips, left to right:

| Chip | Value | Tone | What the number counts |
|---|---|---|---|
| `In the queue` | `9` | plain | Leavers not yet closed, at this campus |
| `Not cleared` | `7` | warn | Of those nine, the ones with at least one applicable mark still outstanding |
| `Owing on exit` | `$1,240.00` | bad | Sum of the balances on the three queue rows whose fees mark is outstanding — `$210.00 + $620.00 + $410.00` |
| `Documents outstanding` | `6` | warn | Queue rows whose documents mark is not made |

`In the queue` less `Not cleared` is two, which is the `2 of 9 cleared` in the first
section's note. The three figures are one arithmetic and must stay one.

### The layout, top to bottom

**Region 1 — section `The leaving queue`, note `2 of 9 cleared`.** A section, not a
card: a 12.5px heading on a hairline with a mono note beside it, no box. It holds a
`stack` of two things at a 10px gap.

*The control row* — a `rowFlex` aligned `flex-end`. The alignment governs the three
filter selects; the segment strip opts out of it, because `segments()` carries its
own `align-self: flex-start` and so sits level with the filter *labels*, not with
their boxes. That is the kit's behaviour, not this screen's choice:

| Control | Contents | Default |
|---|---|---|
| Segments | `Still open` `9` · `Closed this year` `14` | `Still open` |
| Filter | `Year group` | `The whole school` |
| Filter | `Reason` | `Any reason` |
| Filter | `Clearance` | `Any state` |

`Closed this year` is drawn as a segment rather than a filter because a closed leaver
is a different population, not a narrowing of this one — the row verbs do not apply
to it.

*The table.* Six columns, verbatim and in order:

| # | Column | Width | Align | Cell |
|---|---|---|---|---|
| 1 | `Pupil` | fluid | left | 24px initials avatar (`avatar()`'s default; the 22px square belongs to the clearance marks), name at 12.5px/600, admission number in mono at 10.5px beneath |
| 2 | `Year group` | 100px | left | 12px, `C.mid` |
| 3 | `Leaving because` | 200px | left | 12px, ellipsised; **red** (`C.bad`) when the reason is `Expelled` or `Fees`, otherwise `C.mid` |
| 4 | `Last day` | 100px | left | mono 11.5px |
| 5 | `Fees · Library · Bed · Portal · Docs` | 215px | left | the five marks and the count — see below |
| 6 | `Next step` | 150px | right | one `tinyBtn`, tone-coded |

The fifth column's header **is the legend**. An earlier pass carried a card
explaining what each mark meant and who makes it; the header already names the five
in order, so the card went. Nothing else on this screen explains the marks, which is
deliberate — canvas rule 5.

**Region 2 — section `Gone, still owing`, note `7 former pupils &middot; $2,910.00`.**
The bursar's question, and the reason the page has two sections rather than one
filtered list: *who is still in the queue* and *who has already gone owing money* are
two populations with two totals.

Four columns:

| # | Column | Width | Align |
|---|---|---|---|
| 1 | `Former pupil` | fluid | left — name at 12.5px/600 over the admission number in mono, no avatar |
| 2 | `Left because` | 260px | left |
| 3 | `Last day` | 110px | left, mono |
| 4 | `Still owed` | 110px | right, mono, `C.bad`, 700 |

Four named rows, then a fifth reading `Three others` / `Each under $200.00` / `—` /
`$420.00`, then a `{ total: … }` row ruled off above: `Seven former pupils` and
`$2,910.00`. The fifth row is a real design decision — a list of former pupils owing
$60 is not worth seven rows, and the total has to still be right.

Note the absence of a `Next step` column here. Nothing on this table is actionable:
they are gone.

### The clearance model — the part worth specifying hardest

Five marks in one 22px-square group, drawn left to right in the order the school
works them, then a 3px gap and a mono count. Composed locally in `leavers.mjs`
because the kit has no primitive for a group of small states read as one thing; built
from `icon`, `mono` and `C` so it cannot drift from the tokens.

**Three states, and the third is the point.**

| State | Fill | Border | Glyph |
|---|---|---|---|
| `done` | `C.okBg` | `C.okBd` | the mark's own glyph in `C.ok` |
| `todo` | `C.warnBg` | `C.warnBd` | the mark's own glyph in `C.warn` |
| `na` | `C.hair` | `C.borderSubtle` | an 8 × 1.5px dash in `C.faint` — **no glyph** |

*A mark that cannot apply is a dash, not a failure.* A day pupil has no bed. Drawing
that as an outstanding step would teach the office to ignore the column within a
week, so it is drawn as a dash and the count says `3 of 4`.

**The count.** `${done} of ${applies}`, where `applies` is the number of marks not in
state `na`. Green (`C.ok`, 700) when `done === applies`, amber (`C.warn`, 700)
otherwise. Nine rows are drawn and every count is arithmetically consistent with its
marks: `2 of 5`, `2 of 5`, `1 of 4`, `4 of 5`, `3 of 4`, `2 of 4`, `3 of 4`,
`4 of 4`, `5 of 5`.

**The five marks, who they apply to, and what sets each.**

| # | Mark (tooltip, verbatim) | Glyph | Applies to | What sets it | Source today |
|---|---|---|---|---|---|
| 1 | `Fees settled` | `CurrencyDollar` | everyone | every invoice for this pupil has `balanceAmount` zero — by a receipt, a waiver, a write-off, or a credit | `SchoolFeeInvoice.balanceAmount`, `status in (ISSUED, PART_PAID)` |
| 2 | `Library returned` | `Books` | everyone | every `SchoolBookLoan` for this pupil has `returnedAt` set. A pupil who never borrowed is **done**, not n/a | `SchoolBookLoan.returnedAt` |
| 3 | `Bed freed` | `Bed` | **boarders only** | the boarding allocation is ended — status `ENDED`, `endDate` set. A day pupil gets the dash | `SchoolStudent.isBoarding`, `SchoolBoardingAllocation.status` / `.endDate` |
| 4 | `Portal closed` | `Lock` | everyone with an account or an unclaimed invite | the portal account is disabled and any outstanding invite is revoked | `SchoolStudent.userId`, `SchoolPortalInvite.claimedAt` / `.revokedAt` |
| 5 | `Documents raised` | `FileText` | everyone | **every** leaving document that applies to this leaver has been raised — not one of them | LeavingDocuments; no model today |

**As drawn, the bed is the only mark that is ever `na`.** Across all nine rows the
dash appears at index 2 and nowhere else. That is a decision the drawing makes and
the implementer must not quietly generalise: if library or portal are also allowed to
be n/a, that is a new rule and it changes every count on the screen. See Open
questions.

**A leaver is not closed until every mark that applies is made.** That is the whole
rule, and the count is what makes it legible. `5 of 5` and `4 of 4` are both closed;
`4 of 5` is not.

### The verbs

`Next step` is not "Edit". **The row's verb names the next undone mark, in the
column's own order.** That is a rule, not a guess, which is why the marks are drawn
in the order the school works them.

| Next undone mark | Verb drawn | Tone | What it does |
|---|---|---|---|
| Fees | `Chase $210.00` · `Chase $620.00` · `Chase $410.00` | bad | Opens the ledger against this pupil's outstanding invoice. **The amount is in the label** |
| Library | `Take the book back` | warn | Opens the loan so the copy can be returned or written off |
| Bed | *not drawn* | — | No queue row's first undone mark is the bed, so the string does not exist yet. **Do not invent it** |
| Portal | `Close the portal` | brand | Disables the account and revokes any outstanding invite |
| Documents | `Raise the documents` | brand | Navigates to `/schools/leavers/documents` for this leaver |
| none — all applicable marks made | `Close the record` | plain | Closes the leaver. The record moves from `Still open` to `Closed this year` and the person becomes an alumnus |

Plus the app bar's `Record a leaver`, and the band's `Export the queue`.

The tone ladder does work: bad for money, warn for a thing the school owns and has
not got back, brand for an action the office simply has not done yet, plain for the
one that finishes it. A screen of red rows and one plain row reads correctly at
arm's length.

### The refusals

**Leavers draws no refusal sentence.** The refusal is structural: `Close the record`
appears only on rows where every applicable mark is made, so the screen never offers
to close a leaver it would then have to refuse. That is the right behaviour for a
queue and the wrong behaviour for an API — the same rule has to be enforced on the
server, and when it refuses there it needs a sentence, which this artboard does not
provide. See Open questions.

Two softer refusals are drawn:

- **`Gone, still owing` has no verbs at all.** The four named rows and the summary
  row carry nothing pressable. Money owed by somebody who has gone is a debtor
  question, not a leaving question, and this table is here to be read and exported.
- **A dash is not a button.** An `na` mark has no glyph, no tone and nothing to
  press. A day pupil's bed cannot be freed.

### What it needs

**Models.** `SchoolStudent` (status, `isBoarding`), `SchoolEnrollment` (`endedAt`),
`SchoolFeeInvoice` (`balanceAmount`), `SchoolBookLoan` (`returnedAt`),
`SchoolBoardingAllocation` (`status`, `endDate`), `SchoolPortalInvite`
(`claimedAt`, `revokedAt`).

**Does not exist:** the leaver row itself; the clearance marks; `Last day`;
`Leaving because` and its vocabulary; `Closed this year` as a state; anything
recording *who* made a mark and *when*.

**Endpoints.** `GET /api/v2/schools/leavers` (filters: year group, reason, clearance
state, open/closed) — **does not exist**. `PATCH
/api/v2/schools/leavers/[id]/clearance` — **does not exist**. `POST
/api/v2/schools/leavers` for `Record a leaver` — **does not exist**. The export
rides `runDocumentExport` with a `ui.table.*` source key, which does exist.

**Reused.** `applyYearRollUp` in `lib/schools/year-rollup.ts:297` is what feeds this
queue; the roll-up's own UI at `components/schools/students/year-rollup-content.tsx`
labels the `GRADUATE` action **`Leaving`**, and that is the moment a leaver should be
created.

### States

Per `11-campus-states-and-motion.md`.

- **Loading** — `TableRowsSkeleton` for both tables, headers solid. The queue's
  fifth column is a five-square shape, not a line: draw it as five 22px blocks so the
  row does not reflow when the marks arrive. Rows cascade at 40ms.
- **Nothing yet** — `NothingYet`, offering `Record a leaver`. A school in its first
  year has no leavers and that is not a failure.
- **Nothing left to do** — `NothingLeftToDo` when every leaver in the queue is
  cleared. Good news, **no create button**. This is the state the screen exists to
  reach, and it is the one most likely to be skipped.
- **Nothing matched** — `NothingMatched`, naming the filters in force
  (`Year group`, `Reason`, `Clearance`) and offering to clear them. Never a create
  button.
- **Error** — `LoadError` scoped to the section that failed. `Gone, still owing`
  failing must not take `The leaving queue` down with it; they are two reads.
- **Denied** — a teacher. There is no `schools.leavers` resource, so the check will
  ride `schools.students` until one is added, and `schoolPermissionDenial` returns
  `` `Your role cannot ${action} ${resource without "schools."}` `` — *"Your role
  cannot view students"* — which is not good enough here. The verb is disabled with
  the reason on it, never hidden, and the reason should name who can: the deputy
  head, or the bursar for the money marks. The mechanism for that already exists —
  `whoCan(resource, action)` over the `WHO_CAN` map in `lib/schools/access.ts`, which
  already answers *"the bursar"* for `schools.fees` — and it needs entries for
  whatever resource the money marks end up checking.

### Copy that is doing work

1. > Fees · Library · Bed · Portal · Docs
2. > 2 of 9 cleared
3. > Take the book back
4. > Close the record
5. > Chase $210.00
6. > Gone, still owing
7. > Three others — Each under $200.00
8. > Seven former pupils

---

## Alumni — Alumni

| | |
|---|---|
| **Route** | `/schools/alumni` |
| **Story** | `S-13.4` |
| **Contract** | `design/campus/checklist/Alumni.json` |
| **Artboard** | `design/campus/expansion/Alumni.dc.html` |

**Who opens it, and what for.** The deputy head in February, three weeks before the
centenary dinner, having been asked how many former pupils the school can actually
write to. The answer she came for is not the list — it is the second section. She
finds out that 687 of 1,412 have never been asked, and that only 21% of the register
has a destination against it, and both of those are the school's own fault and
fixable.

### The chrome

- **App bar title**: `Alumni`. No caption.
- **No primary action.** Deliberate: you do not create an alumnus. One is produced by
  closing a leaver, which happens on the other screen.
- **Search placeholder**: `Search the alumni register`.
- **Band action**: a ghost `Export the register` with a download glyph.

| Chip | Value | Tone | What the number counts |
|---|---|---|---|
| `On the register` | `1,412` | plain | Everyone who has left this campus and been closed |
| `Left this year` | `62` | plain | The current leaving year's cohort — the same 62 as `Class of 2026`'s denominator |
| `Destination unknown` | `1,121` | warn | `1,412 − 291`; people with no destination recorded |
| `Consent never asked` | `687` | warn | People whose consent state is `Not asked` — not people who said no |

The last two are the page's argument, stated before anything is drawn.

### The layout, top to bottom

**Region 1 — section `Everyone who has left`, note `8 shown &middot; newest first`.**

*The control row*, a `rowFlex` aligned `flex-end`, with a spacer pushing the search
right:

| Control | Contents | Width |
|---|---|---|
| Filter `Class of` | `Any year` | 130px |
| Filter `House` | `Any house` | 150px |
| Filter `Destination` | `Any destination` | 170px |
| Filter `Consent` | `Any consent` | 150px |
| *spacer* | — | flexible |
| Search field | `Name or admission number` | 230px |

**This screen carries two search boxes** — the app bar's `Search the alumni register`
and this one. That is not obviously wrong (the app bar's is global, this one narrows
the table) but it is the only screen on this page that does it. See Open questions.

*The table.* Seven columns:

| # | Column | Width | Align | Cell |
|---|---|---|---|---|
| 1 | `Name` | fluid | left | name at 12.5px/600 over the admission number in mono |
| 2 | `Class of` | 70px | left | mono 11.5px, 700, `C.body` — the leaving year |
| 3 | `Last year group` | 105px | left | 12px, `C.mid` |
| 4 | `Results on leaving` | 160px | left | 12px, ellipsised. Greyed to `C.subtle` when it reads `Left before O-Levels` |
| 5 | `Where they went` | 200px | left | 12px, ellipsised. **Amber** (`C.warn`) when it reads `Unknown`, otherwise `C.body` |
| 6 | `Contact consent` | 112px | left | a badge — `May contact` ok, `No contact` bad, `Not asked` plain |
| 7 | *(unnamed)* | 130px | right | one `tinyBtn`, or nothing |

The seventh column has an **empty label**. That is correct and must be preserved: a
verb column names itself by its buttons, and every button in it is different.

**Region 2 — section `How much of the register is kept`, note `604 contactable
&middot; 291 destinations`.** One table, two group headers and a total. Consent and
destination coverage are two ways of asking one question — *how much of this register
is actually usable* — so canvas rule 6 makes them one structure. An earlier pass put
three stats above this table repeating the same figures; they came off.

Four columns:

| # | Column | Width | Align |
|---|---|---|---|
| 1 | `Measure` | fluid | left |
| 2 | `Count` | 90px | right, mono 700 |
| 3 | `Of` | 90px | right, mono |
| 4 | `Share` | 220px | left — a 6px rounded bar filled to the percentage, then the percentage in mono at 38px fixed width |

Group `Contact consent`:

| Measure | Count | Of | Share | Bar tone |
|---|---|---|---|---|
| `May contact` (ok badge) | `604` | `1,412` | `43%` | ok |
| `No contact` (bad badge) | `121` | `1,412` | `9%` | bad |
| `Not asked` (plain badge) | `687` | `1,412` | `49%` | **warn** |

`Not asked` draws its badge plain and its bar amber. That is not an inconsistency: as
a *state* it is neutral, and as a *proportion of the register* it is the problem.

Group `Destination recorded, by leaving year`:

| Measure | Count | Of | Share | Bar tone |
|---|---|---|---|---|
| `Class of 2026` | `41` | `62` | `66%` | ok |
| `Class of 2025` | `48` | `96` | `50%` | warn |
| `Class of 2024` | `21` | `88` | `24%` | bad |
| `2023 and earlier` | `181` | `1,166` | `16%` | bad |

Total row: `Destination recorded, whole register` · `291` · `1,412` · `21%`, warn.

Both groups sum to 1,412, and the four year rows sum to 291. The falling-off shape is
the point: a school that asks on the way out keeps two thirds, a school that
remembers four years later keeps a sixth.

**A contract note.** `table()` files a `{ group: … }` header into the checklist's
`cards` array, so `Alumni.json` lists four "cards" when the screen has two sections
and zero cards. `Contact consent` and `Destination recorded, by leaving year` are
group headers, not containers. Do not build them as cards.

### The verbs

There is no primary action. Every verb on this screen is in the seventh column, and
**which verb a row gets is determined first by consent and only then by
destination**:

| Consent | Destination | Verb | Tone |
|---|---|---|---|
| `No contact` | anything | **none — the cell is empty** | — |
| `Not asked` | anything | `Ask for consent` | brand |
| `May contact` | `Unknown` | `Where did they go?` | brand |
| `May contact` | recorded | `Add an update` | plain |

Plus the band's `Export the register`, and the row itself, which navigates to
`/schools/alumni/[alumnusId]`.

### The refusals

**The refusal on this screen is an empty cell.** A person who has said `No contact`
gets no verb — not a disabled one, not a greyed one, none. There is no `Ask for
consent` to press on somebody who has already answered, because asking again is the
thing they said no to.

That is the only refusal drawn, and it is drawn without a sentence. It is also the
one place where this page departs from `11-campus-states-and-motion.md`, which says a
verb somebody cannot use is *disabled with the reason on it, not hidden* — but that
rule is about **permission**, and this is about **consent**. The office is not being
refused; the former pupil already answered. An implementer should not "fix" this by
adding a disabled button.

The implied refusal the screen does not draw: an export or a bulk mail must exclude
`No contact` and `Not asked`, which is 808 of 1,412. `Export the register` has no
copy saying so.

### What it needs

**Models.** `SchoolStudent` filtered to `status in (GRADUATED, WITHDRAWN)` is the
only source of a register today.

**Does not exist:** an alumni model or agreed view; contact consent in any form —
three states, who gave it, when; `Where they went` and its vocabulary; `Results on
leaving` as a stored summary (derivable from `SchoolResultLine` for internal marks,
but `8 O-Levels &middot; 5 at B or better` is a public-exam summary and depends on
S-13.2); `House`, which the filter row offers and nothing stores.

**Endpoints.** `GET /api/v2/schools/alumni` — **does not exist**.
`PATCH /api/v2/schools/alumni/[id]/consent` — **does not exist**.
`GET /api/v2/schools/alumni/coverage` for the second table — **does not exist**.
The second table is aggregate and should not be computed client-side from a page of
eight rows.

### States

- **Loading** — `TableRowsSkeleton` for the register (two-line first cell, a badge
  shape in column six, a button shape in column seven) and a second skeleton for the
  coverage table whose fourth column is a bar, not a line.
- **Nothing yet** — `NothingYet`. **No create button** — you cannot create an
  alumnus. The sentence has to point at the leaving queue instead: the register fills
  when a leaver is closed.
- **Nothing matched** — `NothingMatched`, naming the four filters and the search term.
- **Error** — `LoadError` per section. The coverage table failing must leave the
  register usable; it is the more expensive read of the two.
- **Denied** — an alumni register is every former pupil's email address and mobile
  number. `schools.students` is the nearest existing resource and is too broad: a
  teacher can read students. This needs its own resource before it ships.

### Copy that is doing work

1. > How much of the register is kept
2. > Consent never asked
3. > Not asked
4. > No contact
5. > Where did they go?
6. > Destination recorded, whole register
7. > Left before O-Levels

---

## AlumniRecord — Rutendo Chikafu

| | |
|---|---|
| **Route** | `/schools/alumni/[alumnusId]` |
| **Story** | `S-13.4` |
| **Contract** | `design/campus/checklist/AlumniRecord.json` |
| **Artboard** | `design/campus/expansion/AlumniRecord.dc.html` |

**Who opens it, and what for.** The deputy head at half past four, asked by a former
pupil — now seven years out, an accountant — for a testimonial to attach to a job
application. She needs two things at once: the facts that go on the testimonial, and
confidence that none of them has been quietly edited since 2019.

### The chrome

- **App bar title**: `Rutendo Chikafu` — the record's own name, canvas law §1. No
  caption.
- **Back chevron** present (`back: true`).
- **No search** (`search: null`). A record page searches nothing.
- **Primary action**: `Add to the timeline`, plus glyph.
- **Band action**: a ghost `Print a testimonial` with a printer glyph.

| Chip | Value | Tone | What it means |
|---|---|---|---|
| `Class of` | `2019` | plain | Leaving year |
| `Consent` | `May contact` | ok | The same three-state consent the register badges |
| `Contact last confirmed` | `3 Mar 2026` | plain | The date of the most recent timeline entry recorded by a member of staff |

`Print a testimonial` is a band action and not the primary action, because the
primary action on a living person's record is keeping it true.

### The layout, top to bottom

**Region 1 — a property block, two columns, twelve rows, no heading.** Drawn by a
local `facts()` helper rather than the kit's `properties()`, because the kit draws
every value pressable and this record has two halves.

**History is closed; contact is open.** The school record — years, results, prizes,
conduct — cannot be edited here, because a testimonial rests on it. That boundary is
**drawn, not written**: a closed value has no dashed underline, no pointer cursor,
and carries an 11px lock glyph in `C.faint` at the end of its row. An open value
keeps the dashed underline and the pointer and opens its editor when pressed. **No
sentence on this artboard says which is which.** An earlier pass had an alert
explaining it; it came off.

Closed — eight rows, each with a lock:

| Label | Value |
|---|---|
| `Left` | `December 2019 &middot; Upper Sixth, Arts` |
| `At the school` | `January 2014 to December 2019 &middot; six years` |
| `House` | `Nyanga House &middot; boarder from Form 3` |
| `Admission number` | `CHS-0788` *(mono)* |
| `Results` | `3 A-Levels &middot; 13 points &middot; ZIMSEC November 2019` |
| `Conduct` | `Clear &middot; two merits in Upper Sixth` |
| `Prizes and colours` | `2017 Accounting prize &middot; 2018 full colours, hockey &middot; 2019 Head of Nyanga House` |
| `Guardian at the time` | `Miriam Chikafu &middot; mother &middot; +263 77 412 8890` |

Open — four rows, pressable:

| Label | Value |
|---|---|
| `Email` | `rutendo.chikafu@gmail.com` |
| `Mobile` | `+263 77 233 4180` |
| `Town` | `Harare` |
| `Contact consent` | `May contact &middot; given 14 December 2019` |

The split is exactly right and worth stating: the closed half is **what the school
did**, the open half is **what is still true about a living person**. `Guardian at
the time` is closed for the same reason — it is a fact about 2019, not a current
contact.

**Region 2 — section `Public exam results`, note `ZIMSEC &middot; 13 points`.** Five
columns:

| # | Column | Width | Align | Cell |
|---|---|---|---|---|
| 1 | `Subject` | fluid | left | 12px/600 `C.strong`; the summary row `Nine subjects` drops to weight 400 and `C.mid` |
| 2 | `Level` | 110px | left | 12px `C.mid` |
| 3 | `Grade` | 170px | **centre** | a badge when the grade is one or two characters (`A` ok, `B` plain); plain 11.5px text when longer |
| 4 | `Points` | 80px | right | mono 12px, 700 |
| 5 | `Series` | 140px | left | mono 11.5px |

| Subject | Level | Grade | Points | Series |
|---|---|---|---|---|
| `Accounting` | `A-Level` | `A` | `5` | `November 2019` |
| `Economics` | `A-Level` | `B` | `4` | `November 2019` |
| `Mathematics` | `A-Level` | `B` | `4` | `November 2019` |
| `Nine subjects` | `O-Level` | `7 at B or better` | `—` | `November 2017` |

The three A-Levels total 13 points, which is the section note and the band's story.
The O-Level line is deliberately a **summary row, not nine rows**: nobody writing a
testimonial reads nine O-Level grades, and a record page that makes them scroll past
them is showing storage rather than a record.

**Region 3 — section `Since school`, note `7 entries &middot; 3 documents raised`.**
One chronology, newest first. The document register and the life timeline were drawn
as two lists in the first pass; they are one sequence, so they are one table.

| # | Column | Width | Align | Cell |
|---|---|---|---|---|
| 1 | `When` | 90px | left | mono 11px, 700, `C.mid` |
| 2 | `What` | fluid | left | 12px `C.body` |
| 3 | `Reference` | 180px | left | mono 11px — the document number, or `—` |
| 4 | `Recorded` | 200px | left | mono 11px — who and when |

| When | What | Reference | Recorded |
|---|---|---|---|
| `Mar 2026` | `Qualified — BSc Accounting, University of Zimbabwe, upper second` | `—` | `Rudo Makoni · 3 Mar 2026` |
| `Sep 2024` | `Treasurer of the university accounting society` | `—` | `Rudo Makoni · 11 Oct 2024` |
| `Feb 2022` | `Started BSc Accounting, University of Zimbabwe` | `—` | `Office · 2 Feb 2022` |
| `Jan 2022` | `Testimonial raised` | `BOR/TS/2022/0009` | `17 Jan 2022` |
| `Jan 2020` | `Statement of results raised` | `BOR/SR/2020/0044` | `28 Jan 2020` |
| `Dec 2019` | `School-leaving certificate raised` | `BOR/LC/2019/0221` | `12 Dec 2019` |
| `Dec 2019` | `Left Upper Sixth` | `—` | `From the leaving queue` |

The last row is the join to the other three screens: the timeline's first entry is
written by closing a leaver, and it says so. The three document rows are written by
the pipeline when a document is raised, not by a person — which is why their
`Recorded` cell is a date alone, with no name.

Document number format: `BOR` (campus code) `/` `LC` `SR` `TS` (document type) `/`
year `/` a four-digit sequence. The campus prefix depends on S-11.1.

### The verbs

- **`Add to the timeline`** (app bar, primary). Opens a dialog writing a new
  chronology entry — date, sentence, and the recording user taken from the session.
- **`Print a testimonial`** (band, ghost). Renders through the document pipeline
  against this record.
- **Pressing any open value** — `Email`, `Mobile`, `Town`, `Contact consent` — opens
  its editor. Canvas rule 4: forms live in dialogs, and the value is the affordance.
- **No row verbs** in either table.

### The refusals

**Eight facts refuse to be edited, and say so with a lock rather than a sentence.**
The school record is closed because a testimonial rests on it. Pressing a locked
value does nothing at all — there is no disabled dialog, no toast.

This is the screen's best idea and its biggest build risk. A lock glyph and an
absent underline are a visual affordance with **no accessible equivalent** on the
artboard. The implementation must give each locked row a programmatic one —
`aria-disabled`, and a title or description naming the reason — without putting a
sentence back on the page. See Open questions.

A second refusal is implied and not drawn: with consent `No contact`, the contact
half should not be editable into a mailing list, and `Print a testimonial` should
still work — a testimonial is handed to the person, not posted to them.

### What it needs

**Models.** `SchoolStudent` (`studentNo`, `dateOfBirth`, `admissionDate`,
`isBoarding`), `SchoolEnrollment` (the year range), `SchoolGuardian` +
`SchoolStudentGuardian` (`Guardian at the time`).

**Does not exist:**

- The alumnus itself, and its `Class of`.
- `House` — no model, no field. `SchoolStudent.customFields: Json?` could carry it.
- `Prizes and colours` — no model. A collection, so not a JSON field on the pupil.
- `Conduct` — no conduct model anywhere in the schema. **Blocked on S-12.1.**
- `Public exam results` — no candidate, no series, no public-exam grade.
  `SchoolResultLine` is internal marks against a `SchoolResultSheet`, keyed by
  `subjectCode` with a `Float` score, and cannot express `7 at B or better` or a
  ZIMSEC points total. **Blocked on S-13.1 / S-13.2.**
- `Since school` — no timeline model.
- `Contact last confirmed` — no field.
- Document numbers — `DocumentArtifact` has `fileName`, `blobUrl`, `sha256` and
  `byteSize` but **no human reference number**; `BOR/TS/2022/0009` has nowhere to be
  stored, and a leaving document must be quotable by number.

**Endpoints.** `GET /api/v2/schools/alumni/[id]` — **does not exist**.
`POST /api/v2/schools/alumni/[id]/timeline` — **does not exist**.
`PATCH /api/v2/schools/alumni/[id]` for the four open fields — **does not exist**.
`POST /api/documents/render` with a `schools.testimonial` source key — the route
exists; the source key **does not**.

### States

- **Loading** — the property block gets a skeleton with the same twelve rows, two
  columns and 150px label gutter, so nothing reflows. `TableRowsSkeleton` for both
  tables.
- **Nothing yet** — only the `Since school` table can be empty, and on a recent
  leaver it usually is: one entry, `Left Upper Sixth`. `NothingYet` offering
  `Add to the timeline`. A blank `Public exam results` is not an empty state but an
  unset one — it says the school has not captured a public result for this person.
- **Error** — `LoadError` scoped. The exam table failing must not take the property
  block down; the property block is what the testimonial is written from.
- **Not found** — `RecordNotFound` for an `alumnusId` that is not there, or for a
  pupil who is still `ACTIVE` and therefore is not an alumnus. The second case is
  worth its own sentence.
- **Denied** — same reasoning as Alumni. This page holds a living person's mobile
  number.

### Copy that is doing work

1. > At the school — January 2014 to December 2019 &middot; six years
2. > Guardian at the time
3. > Contact consent — May contact &middot; given 14 December 2019
4. > Nine subjects — 7 at B or better
5. > Left Upper Sixth — From the leaving queue
6. > Qualified — BSc Accounting, University of Zimbabwe, upper second
7. > Since school — 7 entries &middot; 3 documents raised

---

## LeavingDocuments — Leaving documents

| | |
|---|---|
| **Route** | `/schools/leavers/documents` |
| **Story** | `S-13.5` |
| **Contract** | `design/campus/checklist/LeavingDocuments.json` |
| **Artboard** | `design/campus/expansion/LeavingDocuments.dc.html` |

**Who opens it, and what for.** The same deputy head, three minutes after pressing
`Raise the documents` on Nyasha Zimuto's row in the queue. Nyasha's father is at the
counter asking for the leaving certificate, and she needs to know in one glance why
it has not been printed and what has to happen before it can be.

### The chrome

- **App bar title**: `Leaving documents`.
- **Caption**: `Nyasha Zimuto &middot; CHS-1240 &middot; Form 4A`. The only caption
  on this page, and it is doing the work canvas law §3 describes — the title names
  the page, the caption names which leaver.
- **Back chevron** present. **No search** — five rows do not need one.
- **Primary action**: `Raise the certificate`, file glyph. It is the page's name as
  a verb, and on this leaver it is the one thing that is blocked.
- **No band actions.**

| Chip | Value | Tone | What it counts |
|---|---|---|---|
| `Raised` | `1` | ok | Documents already produced — the testimonial |
| `Ready to raise` | `1` | brand | Documents with nothing holding them — the transfer certificate |
| `Blocked` | `3` | bad | Documents with a hold against them |
| `Owing` | `$210.00` | bad | This leaver's outstanding balance, the same figure as their queue row |

`1 + 1 + 3 = 5`, and the section note says `1 raised &middot; 1 ready &middot; 3 held`.

### The layout, top to bottom

One `grid` of `minmax(0, 1fr) 540px`, aligned to the start. Left column, the work;
right column, the artefact.

**Left region 1 — an alert, tone bad.** Title:

> `$210.00 outstanding on INV-2026-0509 — two documents held`

with two `tinyBtn`s on its right: `Record a payment` (brand) and `Waive it` (plain).
It sits above the table because it is the reason three of its five rows read
`Blocked` — or rather two of them, which is the point of the sentence: the third
block is the results window, and the alert is careful to claim only the two it caused.

**Left region 2 — section `The five documents`, note `1 raised &middot; 1 ready
&middot; 3 held`.** Five columns:

| # | Column | Width | Align | Cell |
|---|---|---|---|---|
| 1 | `Document` | fluid | left | 12.5px/600 `C.strong`, ellipsised |
| 2 | `State` | 96px | left | a badge — `Blocked` bad, `Ready to raise` brand, `Raised` ok |
| 3 | `Detail` | 180px | left | 11.5px; **red** (`C.bad`) when the state is `Blocked`, `C.mid` otherwise |
| 4 | `Signed by` | 135px | left | 11.5px `C.mid`, ellipsised |
| 5 | *(unnamed)* | 120px | right | one `tinyBtn` |

The five rows, verbatim:

| Document | State | Detail | Signed by | Verb |
|---|---|---|---|---|
| `School-leaving certificate` | `Blocked` | `$210.00 on INV-2026-0509` | `The Head, or the Deputy` | `Record a payment` *(brand)* |
| `Transfer certificate` | `Ready to raise` | `The fee hold is off for transfers` | `The Head` | `Raise it` |
| `Testimonial` | `Raised` | `Raised 2 Sep 2026 &middot; Rudo Makoni` | `The Head` | `Print again` |
| `Statement of results` | `Blocked` | `Results publish 4 Dec 2026` | `The Examinations Officer` | `Open publishing` |
| `Fees-clearance letter` | `Blocked` | `$210.00 owed` | `The Bursar` | `Open the ledger` |

`Detail` and `Signed by` are the two cards an earlier pass drew — *what holds this
document* and *who signs it* — folded into the columns they always were. Canvas
rule 3: if the detail matters it is a column.

**Right region — section `The certificate`**, note `A4 &middot; BOR/LC/2026/0184
&middot; held`, with a single `Print` tinyBtn as a section action. Inside it, a
bespoke A4 preview (`aspect-ratio: 1 / 1.414`) drawn on the page ground with a soft
drop shadow and **not inside a card** — the paper already floats, and a border around
a drawing of a bordered sheet is two objects saying the same thing. This is the one
bespoke drawing on the page, and it is allowed because it is the artefact the page
exists to produce.

The preview, top to bottom: a 42px ringed monogram `CH`; `CHISHAWASHA HIGH SCHOOL`;
`Borrowdale campus &middot; Harare &middot; Zimbabwe`; a full-width dark rule;
`SCHOOL LEAVING CERTIFICATE` and `No. BOR/LC/2026/0184`; then the body —

> This is to certify that
>
> **NYASHA ZIMUTO**
>
> admission number `CHS-1240`, born 8 April 2010, was a pupil of this school from
> **January 2023 to November 2026**, leaving from Form 4A having completed the
> Ordinary Level course.

then a ruled block of two labelled paragraphs:

> **RESULTS** — Sat ZIMSEC Ordinary Level in November 2026, eight subjects. A full
> statement of results is issued separately once the board publishes.

> **CONDUCT** — Her conduct throughout was good. No disciplinary matter is recorded
> against her.

then, pushed to the foot, a signature rule over `Mrs R. Makoni` / `Deputy Head, for
the Head of School` / `Dated 27 November 2026`, beside a 74px dashed circle reading
`School` `seal`.

Note the RESULTS paragraph: the certificate itself says the statement of results
comes later. That is why the statement is a separate row in the table with a separate
hold, and why a certificate held for fees and a statement held for publishing are two
different problems.

### The verbs

| Verb | Where | Tone | What it does |
|---|---|---|---|
| `Raise the certificate` | app bar, primary | — | Raises the leaving certificate through the pipeline. Blocked on this leaver |
| `Record a payment` | alert | brand | Opens the receipt dialog against `INV-2026-0509` |
| `Waive it` | alert | plain | Opens the waiver dialog. The head's decision, not the office's |
| `Record a payment` | row 1 | brand | Same as the alert's — the row repeats it so the fix is reachable from the thing it unblocks |
| `Raise it` | row 2 | plain | Renders the transfer certificate |
| `Print again` | row 3 | plain | Re-renders the already-raised testimonial. **Not "Raise"** — it exists |
| `Open publishing` | row 4 | plain | Navigates to the results publishing screen |
| `Open the ledger` | row 5 | plain | Navigates to this pupil's fee ledger |
| `Print` | section action, right | plain | Prints the certificate preview |

Three of the five row verbs are navigations to the screen that owns the hold. That is
the pattern: **a blocked document's verb goes to where the block can be cleared**, not
to a disabled button.

### The refusals

Every refusal on this screen names the rule that caused it, on the row it stops:

- **School-leaving certificate** — `$210.00 on INV-2026-0509`
- **Statement of results** — `Results publish 4 Dec 2026`
- **Fees-clearance letter** — `$210.00 owed`
- and above them: `$210.00 outstanding on INV-2026-0509 — two documents held`

*A disabled button with nothing beside it is how an office learns to telephone the
bursar instead of reading the screen.* Every `Blocked` state has a `Detail` cell, and
every `Detail` cell is red.

**The one refusal that is a permission, not a hold:** `Fees-clearance letter` is
signed by `The Bursar` and `School-leaving certificate` by `The Head, or the Deputy`.
`Signed by` is drawn as information, but it is a permission statement — the office
clerk who opens this page cannot sign either. What the screen does when the reader is
not the signer is not drawn. See Open questions.

**And the refusal that is not made:** the `Transfer certificate` is `Ready to raise`
while $210.00 is owed, and the cell says why —

> The fee hold is off for transfers

That is not the product being inconsistent. A child changing school is not the debt's
hostage, and the shipped transfer letter already takes this position: `resolveTransferLetter`
at `lib/documents/schools-sources.ts:710` prints the outstanding balance on the letter
and issues it anyway, with a comment saying so —

> It states what the next school actually asks for — that the child was here, which
> class they reached, and **whether the family owes anything**, because a transfer
> letter issued over an unpaid balance is a decision a school makes deliberately, not
> one a document should hide.

**But this is a policy the school sets, not a rule the product imposes.** Some
schools will refuse a transfer certificate over arrears. It belongs in settings, and
somebody has to design it. See Open questions.

### What it needs

**Models.** `SchoolFeeInvoice` (`invoiceNo`, `balanceAmount`, `status`) for the hold
and the alert; `SchoolPublishWindow` (`openAt`, `status`) for the results hold;
`DocumentTemplate` / `DocumentTemplateVersion` / `DocumentRenderJob` /
`DocumentArtifact` for raising and re-printing.

**Endpoints.** `POST /api/documents/render` — **exists**, at
`app/api/documents/render/route.ts`, and gates on
`SCHOOL_DOCUMENT_ACCESS[sourceKey]`'s feature and resource.
`GET /api/v2/schools/leavers/[id]/documents` — **does not exist**.

**Source keys.** `schools.transfer-letter` — **exists**.
`schools.leaving-certificate`, `schools.testimonial`, `schools.statement-of-results`,
`schools.fees-clearance` — **none of these exists**. Four new entries in
`SCHOOL_DOCUMENT_SOURCE_KEYS`, four in `SCHOOL_DOCUMENT_ACCESS`, four resolvers, four
default templates. **No new renderer.**

**Does not exist:** the document reference number (`BOR/LC/2026/0184`) — see
AlumniRecord; a raised-document record linking a leaver to a `DocumentArtifact`; the
signer rule behind `Signed by`; the per-document hold model itself.

`Raised 2 Sep 2026 &middot; Rudo Makoni` is half-served already: `DocumentRenderJob`
carries `requestedById: String?`, `queuedAt` and `finishedAt`, so both the name and
the date can be read today. What is missing is only the join — nothing records which
artifact satisfied which of this leaver's five documents, so the row cannot find its
job.

### States

- **Loading** — `TableRowsSkeleton` with a badge shape in column two and a button
  shape in column five; the certificate pane gets a `CardsSkeleton` at the same
  aspect ratio so the 540px column does not collapse and re-expand.
- **Nothing yet** — does not occur. The five documents are a fixed set; a leaver with
  none raised shows five rows, not an empty state. **Do not add one.**
- **Nothing left to do** — worth having: all five raised, nothing held. The
  certificate pane is the natural place to say so.
- **Saving** — `SavingOverlay` over the table while a render is in flight. A render
  takes seconds, and a second press produces a second artifact.
- **Error** — `SaveError` on a failed render, quoting the job reference. The
  `LoadError` for the table is scoped: the certificate preview failing must not hide
  the five rows, because the five rows are what tell you why it did.
- **Denied** — the interesting one on this page. A clerk may open it and press
  nothing that requires a signature. The disabled verb carries the reason and names
  who can — the `Signed by` column already holds that string.

### Copy that is doing work

1. > $210.00 outstanding on INV-2026-0509 — two documents held
2. > The fee hold is off for transfers
3. > The Head, or the Deputy
4. > Results publish 4 Dec 2026
5. > A full statement of results is issued separately once the board publishes.
6. > Her conduct throughout was good. No disciplinary matter is recorded against her.
7. > Deputy Head, for the Head of School
8. > Print again

---

## Open questions

1. **The fee hold on a transfer certificate is a policy, and there is no setting for
   it.** The screen states the position — *"The fee hold is off for transfers"* — and
   the shipped `resolveTransferLetter` already agrees with it. But a school that
   refuses a transfer certificate over arrears is not doing something wrong, and the
   product must not decide for it. This needs a designed setting: per document type,
   does a fee balance hold it, and who may override. That is at least a settings
   screen row, a column on whatever holds the five document types, and a refusal
   sentence for the override. Until it exists, `The fee hold is off for transfers` is
   hard-coded copy asserting one school's policy on every school.

2. **Is a leaver a row, or a five-way join?** Everything else follows from this. A
   computed queue needs no migration and is always current, but has nowhere to record
   who made a mark, when, or why a mark was overridden — and "the bursar wrote the
   book off on Friday" is exactly the fact an office argues about. A `SchoolLeaver`
   row with five clearance marks is more schema and needs reconciling against the
   underlying truth. The drawing assumes marks can be *made*, which points at rows.

3. **Which marks may be `na`, and who decides?** As drawn, only the bed — the dash
   appears at index 2 on five rows and nowhere else. Library and portal are arguably
   the same shape (a pupil who never borrowed; a pupil who never claimed a portal
   invite), and whether those read `done` or `—` changes every count on the screen
   and the meaning of `Not cleared 7`. The document says `done` for a pupil who never
   borrowed; that is a decision made here and it should be confirmed.

4. **The bed verb has never been drawn.** The row-verb rule is "name the next undone
   mark", and five of the six cases have a drawn string. The bed's does not, because
   no sample row has the bed as its first undone mark. `Free the bed` is the obvious
   guess and matches the module canvas's boarding copy, but it is a guess, and this
   document will not invent one.

5. **Two screens count this year's leavers differently.** Leavers draws
   `Still open 9` + `Closed this year 14` = 23 leavers this year at Borrowdale.
   Alumni draws `Left this year 62`, and `Class of 2026` has 62 as its denominator.
   Same campus, same year, two numbers. Either the queue is term-scoped and the
   register is year-scoped — in which case the chips should say so — or one of them
   is wrong.

6. **`Documents raised` is one mark for five documents.** The fifth clearance mark is
   binary, but LeavingDocuments shows a leaver with one raised, one ready and three
   held. Nyasha Zimuto's mark is `todo` with a testimonial already raised, so the
   mark plainly means *all applicable documents*. What makes a document *applicable*
   is not defined anywhere: a transfer certificate is not applicable to a pupil who
   completed Form 4, and a statement of results is not applicable to a Form 2 leaver.
   That rule is the real content of the fifth mark and it is undrawn.

7. **What a locked fact does when pressed, and what a screen reader hears.**
   AlumniRecord's whole argument is that the boundary is drawn rather than written —
   a lock glyph and an absent dashed underline. That is a purely visual affordance.
   The build needs a programmatic equivalent that does not put an explanatory
   sentence back on the page, and a decision about what a press does: nothing at all
   (as drawn), or a one-line refusal.

8. **`Signed by` is drawn as information and read as permission.** Four strings are
   drawn — `The Head, or the Deputy`, `The Head`, `The Examinations Officer`,
   `The Bursar` — and none maps to anything in `SCHOOL_RESOURCES`, which has nine
   values and no signer concept. The nearest shipped thing is `WHO_CAN` in
   `lib/schools/access.ts`, which is keyed by resource **and action** and answers
   *who can do this*, not *who signs this*. Either those four strings are decoration
   on a certificate template, or they are an authorisation model, and the screen does
   not say which.

9. **Alumni has two search boxes.** `Search the alumni register` in the app bar and
   `Name or admission number` in the control row. No other screen on this page does
   this. Either the app bar's search is global (and should be doing something
   different from the table's) or one of them is redundant.

10. **`Statement of results` — whose results?** The row's hold reads `Results publish
    4 Dec 2026` and its verb is `Open publishing`, which points at the shipped
    internal-results publishing screen and its `SchoolPublishWindow`. But the
    certificate's own RESULTS paragraph says the statement follows *"once the board
    publishes"* — ZIMSEC, which does not exist in the schema and depends on S-13.2.
    Internal and public results are two different documents held by two different
    gates, and the row is drawn as one.

11. **Three rows of AlumniRecord have no possible source, and two of them are blocked
    on other stories.** `Conduct` needs S-12.1; `Public exam results` needs S-13.1 and
    S-13.2; `House` and `Prizes and colours` need models nobody has proposed. A build
    of AlumniRecord that ships today ships four unset rows out of twelve and an empty
    table. That may be acceptable — but it should be a decision, not a discovery, and
    the unset state needs designing.

12. **Packaging.** Not decided, and it is the first sentence of a build estimate.
    Whether leavers and alumni fold into `STANDARD` at no extra price (the S-12.1
    argument — every school does this) or become an add-on beside ZIMSEC (the S-13.1
    argument — this is the reason to switch) changes the feature key, the entitlement
    check on every route, and whether `schools.leavers` exists as a resource at all.

---

## Build order

**1. `SchoolLeaver` and the clearance model.** Not a screen. Answer Open question 2,
then Open questions 3 and 6, then write the migration — nullable, backfilled,
dual-written, as `docs/expansion-plan/corelith-campus-expansion-plan.md` requires for
every schema change on a live product. Add `leavingDate`, the reason vocabulary, and
the five marks. Hook it to `applyYearRollUp` so a `GRADUATE` or `WITHDRAW` decision
creates a leaver rather than ending at a status change — **and only those two.**
`applyYearRollUp`'s third action, `TRANSFER`, is a move *within* the school: it
creates a new `SchoolEnrollment` in `toClassId` and marks the old one `TRANSFERRED`,
leaving `SchoolStudent.status` untouched. A `TRANSFER` decision must not create a
leaver. Which means the drawn reason `Transferred to another school` has no roll-up
path at all and can only arrive through `Record a leaver` — the queue's fourth row is
a leaver the roll-up cannot produce, and that is a gap in the reason vocabulary, not
in the screen. **Nothing else on this page
can start until this lands**, and getting it wrong is a second migration on a table
every school's data flows through.

**2. Leavers.** The queue is the page's centre and the only screen whose value does
not depend on another story. It needs no alumni model, no consent, no destination, no
conduct, no public exams — only the five marks and the fee, loan, allocation and
invite reads that already exist. It also proves the clearance model against a real
office before anything else is built on it. It unblocks LeavingDocuments (which its
fifth mark points at) and Alumni (which its `Close the record` verb fills).

**3. LeavingDocuments.** Second because `Close the record` cannot be pressed until the
documents mark can be made, and the fifth mark is the one that most often is not.
Four source keys, four access entries, four resolvers, four default templates, and no
new renderer — the smallest screen on the page, provided nobody starts writing a
sixth PDF layout. It unblocks a leaver actually closing, which is what produces the
first alumnus.

**4. Alumni.** Third because it is the register the first three produce, and a
register with nothing in it is not testable. Needs the consent model and the
destination field — both new, both small, both entirely its own. The coverage table
is the screen's argument and should be built as a server-side aggregate, not summed
from a page of rows.

**5. AlumniRecord.** Last, because it is the most blocked: `Conduct` on S-12.1,
`Public exam results` on S-13.1 and S-13.2, `House` and `Prizes and colours` on
nothing at all. Build the property block, the open/closed split and the `Since
school` timeline first — those are the parts that work today — and let the exam table
and the conduct row arrive when their stories do. The closed/open boundary is this
page's best idea and deserves to be built when there is time to get the accessible
equivalent right, not in the last week.
