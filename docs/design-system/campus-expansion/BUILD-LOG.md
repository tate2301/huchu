# Build log — conduct, exams, leavers

The bundle in this folder specified fourteen screens and built none of them. This
file records what was built, in what order, and — where the specs left a question
open — which answer the build took and why. Read it beside the page specs: they
say what the screens do, this says what the code does.

Order follows each page spec's own **Build order** section.

## Decisions taken on open questions

The page specs each end with open questions. Several of them block the schema, so
they are answered here rather than left for a reader to rediscover.

**conduct Q2 — are a demerit and an incident the same row? Two tables, one link.**
`SchoolConductIncident` records an event; `SchoolMeritEntry` records a point. A
demerit may name the incident it came from (`SchoolMeritEntry.incidentId`,
nullable), and logging an incident whose category carries `demeritPoints` writes
both rows in one transaction. So a teacher performs one act, the two counts stay
independent and reconcilable, and nothing double-counts: 148 incidents and 396
demerits are both true because a demerit can also be awarded with no incident
behind it (`Litter`, `No homework`) and an incident can carry no points
(`None — the bus was late`).

**conduct Q1 — pastoral's route.** Left at `/schools/conduct/pastoral`, as drawn.
The contract is the contract; the argument for `/schools/welfare/pastoral` is
recorded in the spec and is a rename, not a rebuild. The sidebar row sits under
Welfare either way, which is the half that was load-bearing.

**conduct Q3 — the withheld row's date under `Review`.** Fixed, not reproduced,
as the spec asks: the date sits under `Written by` beneath `Not shown`, and
`Review` is empty on a withheld row.

**conduct Q4 — merits has one verb and needs four.** Built with the four:
`Award a merit` and `Record a demerit` create, a row opens the pupil's ledger,
and an entry can be reversed. A screen that lists things lets somebody create,
edit and delete them — `10-campus-screen-contract.md` is explicit, and the spec
flags its own contract as short of it.

**conduct Q5 / Q6 — `0 of 2` beside `1 of 2`, and `9` meaning two things.**
Both are drawing defects the spec names. Served counts are rendered from one
helper so the chip and the spine cannot disagree; the section note counts rows
shown out of rows matched, and the band chip counts the term.

**conduct Q10 / exams / leavers — `campusId`.** Added as a nullable column on
every new table, per the spec's own cheap answer. Nothing reads it yet.

## What is built

### Foundation — schema, permissions, navigation, gating

All three areas' tables landed in one pass, so `db push` and `prisma generate`
ran once. `prisma/schema.prisma` gained 30 models and 14 enums across three
commented blocks — conduct and pastoral, public exams, leavers and alumni —
plus four columns on `SchoolStudent` (`certifiedName`, `nationalId`,
`birthCertificateNo`, `house`) that the exam entry file and the leaving
documents require and a school roll never had.

Five permission resources, in all three places a resource has to exist:
`schools.conduct`, `schools.pastoral`, `schools.exams`, `schools.leavers`,
`schools.alumni` — the array in `lib/schools/permissions.ts`, the union in
`lib/schools/access.ts`, and the persona grants in `lib/platform/personas.ts`,
with a `WHO_CAN` entry each so a refusal names who can. Six new actions:
`award`, `tell-home`, `mark`, `enter`, `clear`, `record`.

**The tenant-admin short-circuit is now scoped.** `canSchoolRoleDo` answered
true for `SUPERADMIN` and `MANAGER` before any persona check, for every school
resource. `schools.pastoral` is now exempt through `NO_TENANT_ADMIN_SHORTCUT`,
because the `Pastoral` artboard draws the Group Head — the most senior person in
the group — as `Not cleared`. Without the exemption the screen would have been a
lie the first time a group administrator signed in.

Navigation: a new `conduct` band (Behaviour log · Detention · Merits and
demerits), `Exam series` in `results`, `Leavers` and `Alumni` at the end of
`students`, and **Pastoral notes beside Health and welfare** rather than under
Conduct. The canvas files it under a Welfare group this rail does not have; the
argument it makes — "filing it under Conduct would tell every person who opened
the menu that it was" — lands next to the medical file instead.

Gating: `schools.exams` is a billable feature key with page and API rows in the
route registry, because without them `/schools/exams` falls through to the
`/schools` catch-all, resolves to `schools.core`, and a $99-a-term add-on is
switched on for every tenant by a missing line. Leavers and alumni ride
`schools.students`. Conduct deliberately carries **no** row: it ships inside
`schools.core`, which is the recommendation on record.

All fourteen screens are registered in `scripts/campus-conformance.mjs`, so the
report tracks them instead of ignoring them.

### 1–5. Conduct and pastoral — all five screens

| Screen | Route | Shipped |
|---|---|---|
| Conduct | `/schools/conduct` | The log, the four band chips, `Tell home` as a button in the row, and `Three or more this term` on its own query |
| ConductIncident | `/schools/conduct/[incidentId]` | Ten properties, the accounts, the five-step review spine, the pupil's term, the report-card extract, and the violet alert |
| ConductMerits | `/schools/conduct/merits` | The by-pupil ledger, `What gets written down` with its two group headers, `By year group`, and four verbs rather than one |
| ConductDetention | `/schools/conduct/detention` | The register, `Gets home`, `Still to serve` totalled at the foot, the bus alert, and `The coming sessions` |
| Pastoral | `/schools/conduct/pastoral` | The readers register first, then the notes — readable and withheld, interleaved in date order |

Domain code: `lib/schools/conduct.ts`, `merits.ts`, `detention.ts`,
`gets-home.ts`, `pastoral-access.ts`, `pastoral.ts`, and the browser's side in
`lib/schools/conduct-v2.ts`. Sixteen endpoints under
`app/api/v2/schools/conduct/**`.

Three things in there are worth knowing before changing them.

**`lib/schools/pastoral-access.ts` is the only door to a note.** It runs two
queries rather than filtering one: the readable query is the only thing that
selects `body`, and the withheld query cannot return it because it does not ask
for it. The redacted row is *constructed* from three columns — id, date, band —
rather than filtered down from a note, because a deleted field is one
`JSON.stringify` away from coming back. Withheld rows are returned on purpose
and keep their place in date order; their position is information, and a list
that hid them would look complete when it is not.

**The search box is not an oracle.** A search narrows the readable half only,
so the withheld count stays a property of what exists rather than of what was
typed.

**`repeatOffenders` decides the badge tone, and the rule is not on the
artboard.** The canvas draws one pupil's `3` plain and another's `3` amber, so
the tone cannot be a threshold on the number. The rule taken: one category whose
tone is plain → plain (three latenesses on the same bus is one fact three
times); four or more → red; everything else → amber. It is commented where it is
implemented.

**`Did not turn up` does not decrement what is owed**, which is the whole
reason `Still to serve` is a column and not a second list. A moved row carries
no `Here` button, and `markEveryoneHere` skips moved rows and says so when
everybody left is moved.

Conformance: all five report zero missing structure (ConductIncident's one
remaining item is the specimen pupil's name in a section heading the code
builds). Copy coverage sits at 54–72%, which is the specimen data the report's
own header says to read as a question rather than a defect.

#### Not built here, and why

- **The parent-portal half of S-12.2.** `conductParagraph` in
  `lib/schools/conduct.ts` produces the report-card paragraph and the incident
  page renders it; wiring it into `resolveReportCard` and adding the
  parent-portal route is the next step, and the negative test that
  `resolveReportCard` never reads the pastoral table belongs with it.
- **`Ask to see it` has no decision flow.** It raises the request, notifies
  nobody automatically, and grants nothing. Who decides it and what the
  requester sees while it is pending is school policy; `conduct.md` open
  question 8 says so, and nothing has been invented here.
- **No seed data.** The five screens read an empty school until somebody logs an
  incident, and `scripts/seed-school-demo.ts` does not yet write conduct rows.

### 6–10. Public exams — all five screens

| Screen | Route | Shipped |
|---|---|---|
| Exams | `/schools/exams` | The deadline chip, the one alert, the four dates with their `Days away` bars, and the series table with Cambridge in it |
| ExamCandidates | `/schools/exams/[seriesId]/candidates` | `What is stopping an entry` first, then the roll; a verb per blocker and `Fix it` on the row |
| ExamEntries | `/schools/exams/[seriesId]/entries` | By subject and by candidate, the money per subject, the subject rule, and `Build the entry file` |
| ExamSeating | `/schools/exams/[seriesId]/seating` | This session or the whole timetable, rooms and invigilators, seats in candidate order, and the clash |
| ExamResults | `/schools/exams/[seriesId]/results` | Six-band distributions, `C or better`, the comparison against another series, and where the grades came from |

Domain code: `lib/schools/exams.ts`, `lib/schools/exam-grades.ts` and
`lib/schools/exams-v2.ts`. Ten endpoints under `app/api/v2/schools/exams/**`.

**`S-13.3` stays deferred, and the code says so in three places.**
`buildEntryFile` writes a CSV and hands it to the person who asked for it;
`SchoolExamEntryFileRun` records which file was built, from how many entries, by
whom; and the verb sits in the band as a ghost rather than as the screen's
primary action. It is not a submission receipt and must not be drawn as one.
This is the first thing somebody will try to add and the first thing a
salesperson will promise.

**The two numbers that must not be conflated** are commented where they are
stored: a centre number identifies the *school* to a board and is stable across
years; a candidate number identifies a *pupil within one centre within one
series*, is allocated by the school, and is different again for the June resit.
Both are drawn on the roll, in that order.

**The grade rule lives in one file.** `isPass` is `C or better` at Ordinary
Level and IGCSE; `gradesFor` returns A–U for Advanced Level, with no A*, no F
and no G. The column, the stat and the year-on-year comparison all count
through it, and the comparison is on pass *rates* rather than counts — a subject
sat by forty this year and sixty last is not "down twenty".

**The fee link the ledger never had.** `SchoolExamEntry.feeInvoiceId` is what
makes per-subject `Invoiced`, `Paid` and `To invoice` computable;
`SchoolFeeInvoiceLine.feeCode` is free text and could never have answered it.
`invoiceEntries` writes one invoice per family with a line per subject and
stamps the entries.

### 11–14. Leavers and alumni — all four screens

| Screen | Route | Shipped |
|---|---|---|
| Leavers | `/schools/leavers` | The queue, the five marks as one cell, `Next step` named for the job, and `Gone, still owing` |
| LeavingDocuments | `/schools/leavers/documents` | All five documents with what blocks each, and the certificate preview |
| Alumni | `/schools/alumni` | The register, three-state consent, destinations, and how much of the register is kept |
| AlumniRecord | `/schools/alumni/[alumnusId]` | The record, the public exam grades, the honours, the conduct line and the `Since school` timeline |

Domain code: `lib/schools/leavers.ts` and `lib/schools/leavers-v2.ts`. Six
endpoints under `app/api/v2/schools/{leavers,alumni}/**`.

**A leaver is a row, and the marks are stored.** `deriveClearances` reads the
five records that own the answer — the fee ledger, the library, the bed board,
the portal account and the publish window — and *proposes* each mark with the
evidence beside it. `SchoolLeaverClearance.state` is what the queue draws, so an
override survives: `DONE` against an outstanding balance is the head waiving it,
and `overrideNote` is why. A derivation-only queue would have lost that the
moment somebody wrote a book off.

**Closing refuses over an outstanding mark**, which is the whole point of the
queue, and says which marks and what to do instead. Closing writes two things in
one transaction: the pupil goes to `GRADUATED` and onto the alumni register.
A graduating pupil who is not on the register is the gap S-13.4 was written to
close.

**Contact consent has three states.** `NOT_ASKED` is not a soft no. A nullable
boolean would have collapsed "they said no" and "nobody has asked", and a school
that could not tell them apart would either pester somebody who refused or never
ask anybody at all — which is why `Consent never asked` is a band chip rather
than a filter nobody sets. A destination carries
`destinationConfirmedAt`, because a destination with no date is a rumour.

**Four of the five leaving documents are not built, and the screen says so.**
Only `schools.transfer-letter` exists in the document pipeline today. The other
four need a source key, a `SCHOOL_DOCUMENT_ACCESS` entry, a
`resolveSchoolDocument` case, a resolver and a default template — four edits
across two files each, and **no new renderer**: `lib/documents/schools-sources.ts`
says why in its own header. Rather than draw five buttons three of them cannot
honour, each row reports `Ready to raise`, `Blocked` with the mark that blocks
it, or `The template for this one has not been written yet`. The certificate on
screen is a preview; the artefact comes out of the pipeline with the school's
letterhead.

## Where it stands

- `npm run typecheck` — clean.
- `npx eslint` on every touched file — clean.
- `npx vitest run lib/schools lib/platform components/layout` — 1,024 passing,
  including `route-guard-coverage.test.ts`, which asserts that every new write
  declares who may call it.
- `node scripts/campus-conformance.mjs` — all fourteen screens routed; zero
  missing structure except items the code builds at runtime (a specimen pupil's
  name in a heading, `Seat all ten`, `Show the 207`, `All of Form 4`).
- `node scripts/campus-states-audit.mjs --gaps` — 95 of 101 complete, up from
  91. Three of the six remaining are the two new record pages and the documents
  screen, where the missing states do not apply: a record page has no filters
  and answers `RecordNotFound`, and the documents screen performs no writes.

## What is still owed

1. **Seed data.** Fourteen screens read an empty school until somebody uses
   them. `scripts/seed-school-demo.ts` writes no conduct, exam or leaver rows,
   so a demo needs each screen driven by hand first.
2. **The four leaving-document resolvers**, and the four negative tests the
   pastoral screen asks for: that `resolveReportCard` never reads the pastoral
   table, that no parent-portal route reaches it, that the reports export
   rejects a pastoral source key, and that no pastoral route sets
   `Content-Disposition: attachment`.
3. **The parent-portal half of S-12.2** — `conductParagraph` exists and the
   incident page renders it; wiring it into `resolveReportCard` and the parent
   portal is the next step.
4. **`campusId` is written by nothing.** Every new table carries the column and
   S-11.x will fill it.
5. **Packaging decisions that are not ours.** Conduct ships under
   `schools.core` on the strength of the recommendation on record; exams has a
   billable key priced at the spread of `$99 a term`; leavers and alumni ride
   `schools.students`. All three are one line each to change and all three are
   the founder's call.
