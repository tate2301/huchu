# Schools back-office sidebar: information architecture

Status: decided. This is the specification four agents build from. Where the
text says "decided", it is not an opinion to be re-litigated in a pull request.

## What is wrong today

`lib/navigation.ts` declares the `schools` section as 49 destinations across 11
bands: students 5, attendance 2, teaching 5, results 5, boarding 5, fees 8,
staff 3, communication 3, services 3, setup 7, paperwork 2. `flattenGroups`
makes each band a root-level collapsible, so the rail is eleven headings and a
flat wall of links underneath whichever is open.

Two separate failures are tangled together.

**The grouping is the smaller one.** Eleven bands is too many, two of them are
named in shell words ("Setup", "Communication", "Services", "Reports and
documents") while the rest are named in school words ("Boarding", "Fees"), and
three of them — services, paperwork, setup — are bins rather than categories.

**The bigger failure is that a third of the entries are not destinations.** The
fees eight are one ledger screen and its own segmented control: five of the
eight are `/schools/finance/ledger?view=…`, which `schools-fees-content.tsx`
already renders as tabs. "Publishing windows" is a route that redirects to
`/management/master-data/schools/grading`, which is in the rail six rows further
down under a different name. "Library loans" is one half of a two-segment strip
that `components/schools/library/library-views.tsx` already draws. Counting those,
the rail is advertising ten doors onto rooms it has already advertised.

**Role shaping half-works.** `lib/workspaces.ts` filters each band through
`schoolBandResource()` and the persona's `view` grant, so the mechanism is in
place. But the band-to-resource map is too coarse to say what the grants say.
The teaching band is gated on `schools.academics`, which the bursar holds at
`view` because that same resource covers years, classes and subjects — so the
bursar's rail carries lesson plans, teaching resources and subject targets. Meanwhile
`schools.welfare` exists as a resource and four personas hold it, but the
welfare screen sits in the boarding band and is gated on `schools.boarding`,
which the bursar, the head of department and the class teacher do not hold. The
comment in `lib/platform/personas.ts` says this in as many words and the rail
has not caught up.

Counts today, derived from `PERMISSIONS_BY_PERSONA`:

| Persona | Bands | Entries |
|---|---|---|
| SUPERADMIN, MANAGER (unconstrained) | 11 | 49 |
| SCHOOL_ADMIN | 11 | 49 |
| REGISTRAR | 11 | 49 |
| HOD | 9 | 35 |
| BURSAR | 7 | 33 |
| TEACHER | 8 | 32 |
| WARDEN | 6 | 20 |

## a. The grouping

Nine groups, plus two root-level links. Every group is named with a word a
school uses about itself. The shell register — Setup, Services, Communication,
Paperwork, Admin — is gone entirely; that is the one register decision and it
holds for every label in the section.

The group order is the order a school day touches them, which is the order the
existing section already chose and which survives gating: who is here, what is
on today, what is being taught, what came of it, who is in tonight, what is
owed, who does the work, what has been said, and how it is all set up.

### Root links (rendered before every group)

`SidebarNavSections` renders ungrouped items as direct links ahead of the bands,
so these two lead the rail for everybody who can see them.

| Label | Route | Grant |
|---|---|---|
| Overview | `/schools` | none |
| School reports | `/schools/reports` | `schools.reports:view` |

"School reports", not "Reports": the reporting module's own section is called
Reports and can appear in the same rail, and two entries of one name pointing at
different things is a coin toss every time. It stays a root link rather than
joining a group because it is a destination — collections, arrears ageing,
enrolment, hostel occupancy, drawn as four views of one screen — and not a
category to expand.

### 1. Students — `schools.students`

Students, Applications, Guardians, Health and welfare, Library.

The honest category: everything the office holds **about a child**. The record,
the way in, the family behind it, the medical file, and what the child has out
of the library. This is not a bin — each entry is keyed to a pupil, and the
existing code already reasons this way: the services band is gated on
`schools.students` precisely because "everybody who can see the roll can see who
has what".

Health and welfare moves here from Boarding and is regated to
`schools.welfare`. An allergy does not care whether a child sleeps at school,
day schools have no boarding band at all, and four personas hold the welfare
grant that the boarding gate was denying them.

Library stays one entry. The loans register is the second segment of the same
screen.

### 2. The school day — `schools.attendance`

Registers, Absence follow-up, Calendar, Timetable, Transport.

The honest category: **what is happening today and whether the school is open**.
Who is in, who is not and why, what is on, when we are closed, and how they got
here. Timetable moves out of Teaching and Transport out of Services because
neither is about what is taught or about a service catalogue — a period grid and
a bus run are both the shape of a single day, and the transport screen's second
half is a register.

Calendar moves out of Setup. The academic ladder under master data is where a
year and its terms are *defined*; the calendar is the thing an office reads on a
Thursday to answer "are we open on Monday", and it changes all term.

### 3. Teaching — `schools.results`

Homework, Lesson plans, Subject targets, Teaching resources.

The honest category: **the office's view of classroom work it does not do
itself**. Every one of these is an oversight screen; the capture side lives in
the teacher portal and stays there. The registrar keeps it because arranging
cover is the one job here a teacher cannot do for herself, and the lesson-plan
screen exists for exactly that.

On the grant: `schools.academics` cannot be the gate, because it also covers the
master-data ladder and so the bursar holds it. `schools.results` is the grant
that says a person is trusted with how children are doing, and the bursar and the
warden do not hold it. See "considered and rejected" for the alternative.

### 4. Results — `schools.results`

Results, Moderation, Publishing.

The honest category: **the marking workflow, end to end**. A sheet is submitted,
moderated, sent back or approved, then published, and each of those is somebody
different's move. It stays separate from Teaching because the head of department
signs in to do exactly one thing and the word "Teaching" does not name it.

### 5. Boarding — `schools.boarding:allocate-bed`

Bed board, Allocations, Hostels, Leave and outings.

The honest category: **the house**. Where there is a free bed, who is in which
bed, what the houses are, and who is out of the gate.

The gate is the working verb, not `view`. This group exists to be worked and one
persona owns it outright; a registrar looking up whether a child boards reads it
off the pupil record's overview or the roll's Boarders tab, which is the shape
that question actually has.

### 6. Fees — `schools.fees:issue`

Fees by year group, Fee ledger, Arrears and ageing.

The honest category: **money owed to the school**. Three entries where there were
eight, because five of the eight were the ledger's own tabs.

Same reasoning on the gate as Boarding: worked by one persona, and the per-child
answer — "has this family paid?" — is the Fees tab on the pupil record, which is
where a registrar at the front desk is standing when she is asked.

### 7. Staff — `schools.teachers`

Support staff, Teaching staff.

The honest category: **the people the school employs**. Not "People": the HR
module's rail is already called that and points at a different population. Two
entries because there are two populations with different columns — the teaching
register and everybody else, who are HR employees carrying the schools
assignment.

### 8. Families — `schools.reports`

Documents, Messages, Notices, Parent meetings.

The honest category: **everything that passes between the school and a home**. A
notice goes out to many and cannot be replied to; a message is one family and
one member of staff; a meeting is a slot in somebody's evening; a document is
the thing you print and hand over. Keeping the four adjacent is how somebody
learns which one they wanted.

Documents moves here from Paperwork. Report cards, fee invoices, class lists and
attendance registers are all things a family receives, and the screen's four
views say so.

### 9. The school — `schools.academics:edit`

Classes and streams, Grading and publish windows, Import records, Records and
identity, School day and rooms, Subjects, Years and terms.

The honest category: **what the school is, as opposed to what it does**. Its
years, its classes, its subjects, its day, its grade boundaries, the shape of its
records, and — because a school arriving from another system brings its history
with it — the import screen.

The routes live under `/management/master-data/schools/…`; the job is the
school's, so the group reaches across and nobody has to learn where it was
filed. That arrangement is already in the section and is kept.

The gate is `schools.academics:edit`, which is held by SCHOOL_ADMIN and
REGISTRAR. The bursar, the head of department and the class teacher hold
`schools.academics:view` because they read the ladder all day through other
screens; none of them should be offered a door that lets them restructure the
year.

## b. What each persona sees

Grants read from `PERMISSIONS_BY_PERSONA` in `lib/platform/personas.ts`. Counts
include the two root links.

### SUPERADMIN, MANAGER — 39 entries, 11 collapsed rows

Unconstrained by `schoolAccess`, so the whole rail. Same list as SCHOOL_ADMIN.

### SCHOOL_ADMIN — 39 entries, 11 collapsed rows

Overview, School reports.
Students (5), The school day (5), Teaching (4), Results (3), Boarding (4), Fees
(3), Staff (2), Families (4), The school (7).

Still long, and correctly so: this persona is described as full schools
administration and holds every grant. The work the grouping does for them is
that the eleven headings are nine and nothing inside a heading is a second door
onto a screen already named.

### REGISTRAR — 32 entries, nine collapsed rows

Overview, School reports.
- Students (5): Students, Applications, Guardians, Health and welfare, Library
- The school day (5): Registers, Absence follow-up, Calendar, Timetable, Transport
- Teaching (4): Homework, Lesson plans, Subject targets, Teaching resources
- Results (3): Results, Moderation, Publishing
- Staff (2): Support staff, Teaching staff
- Families (4): Documents, Messages, Notices, Parent meetings
- The school (7)

Boarding and Fees are gone: she holds both at `view` only, and both have a
per-child answer on the pupil record.

This rail is still 32 rows and that is not hidden. The registrar's grants really
are most of the school at `view` or better — admissions, students, teachers,
academics at `edit`, attendance, results, reports. Narrowing it further means
narrowing the grants, which is a permissions decision and not a navigation one.
Flagged for the product owner rather than solved here.

### HOD — 24 entries, eight collapsed rows

Overview, School reports.
- Students (4): Students, Guardians, Health and welfare, Library — no Applications
  (`schools.admissions` not held)
- The school day (5)
- Teaching (4)
- Results (3)
- Staff (2)
- Families (4)

No Boarding, no Fees, no The school. Their home href, `/schools/results/moderation`,
is the second entry of the Results group.

### TEACHER — 22 entries, seven collapsed rows

Overview, School reports.
- Students (4): Students, Guardians, Health and welfare, Library
- The school day (5)
- Teaching (4)
- Results (3)
- Families (4)

No Staff, no Boarding, no Fees, no The school. Capture still happens in the
teacher portal; this is what a teacher sees if a tenant gives them back-office
access at all.

### WARDEN — 18 entries, seven collapsed rows

Overview, School reports.
- Students (4): Students, Guardians, Health and welfare, Library
- The school day (4): Registers, Absence follow-up, Calendar, Transport — no
  Timetable (`schools.academics` not held)
- Boarding (4): Bed board, Allocations, Hostels, Leave and outings
- Families (4)

Their home href, `/schools/boarding`, is the first entry of their own group.

### BURSAR — 17 entries, six collapsed rows

Overview, School reports.
- Students (5): Students, Applications, Guardians, Health and welfare, Library
- The school day (3): Calendar, Timetable, Transport — no Registers or Absence
  follow-up (`schools.attendance` not held)
- Fees (3): Fees by year group, Fee ledger, Arrears and ageing
- Families (4): Documents, Messages, Notices, Parent meetings

This is the case the brief was written about. 33 entries becomes 17, Fees is the
third group rather than the sixth band, no lesson plan or boarding row appears
anywhere, and their home href `/schools/finance` opens the group they live in.
Library stays because loans carry fines and fines are theirs; Health and welfare
stays because they hold `schools.welfare:view`.

### Summary

| Persona | Today | Proposed | Collapsed rows |
|---|---|---|---|
| SUPERADMIN, MANAGER | 49 | 39 | 11 |
| SCHOOL_ADMIN | 49 | 39 | 11 |
| REGISTRAR | 49 | 32 | 9 |
| HOD | 35 | 24 | 8 |
| TEACHER | 32 | 22 | 7 |
| WARDEN | 20 | 18 | 7 |
| BURSAR | 33 | 17 | 6 |

## c. What stops being a top-level destination

Ten entries leave the rail. Every route behind them still resolves; the column
on the right is how a person gets there.

| Leaves the rail | Route | How it is reached |
|---|---|---|
| Invoices | `/schools/finance/ledger?view=invoices` | The Invoices segment of the fee ledger. Already built. |
| Receipts | `/schools/finance/ledger?view=receipts` | The Receipts segment. Already built. |
| Credits on account | `/schools/finance/ledger?view=credits` | The Credits segment. Already built. |
| Refunds | `/schools/finance/ledger?view=refunds` | The Refunds segment. Already built. |
| Waivers | `/schools/finance/ledger?view=waivers` | The Waivers segment. Already built. |
| Publishing windows | `/schools/results/publish/windows` | Redirects to `/management/master-data/schools/grading`, which stays in the rail as "Grading and publish windows". This entry was always a second name for a row already present. |
| Library loans | `/schools/library/loans` | The "Out" segment of `components/schools/library/library-views.tsx`. Already built. |
| Roll up the year | `/schools/students/roll-up` | The link already on the roll's page band — `components/schools/students/students-list-content.tsx:523`. Already built. |
| Result sheets | `/schools/results/sheets` | Needs a screen change. See below. |
| Staff assignments | `/schools/teachers/assignments` | Needs a screen change. See below. |

Eight of the ten need no code beyond the navigation declaration. Two do.

### Needs a screen change

**Result sheets.** `MarkSheetsContent` and `ResultsOverviewContent` list the same
result sheets over the same six states; the difference is the endpoint, which
narrows to the signed-in teacher's own assignments on one and not the other.
For the office they are one screen with two doors, and only the rail links to
the second. Build the pair as segments, in the pattern
`components/schools/library/library-views.tsx` already sets: two links that look
like a segmented strip, the rail lighting up "Results" for both.

- `components/schools/results/results-views.tsx` — new, modelled on `library-views.tsx`
- `components/schools/results/results-overview-content.tsx` — render it
- `components/schools/results/mark-sheets-content.tsx` — render it

Do not move the state views. The overview's All / Entering / In review /
Queried / Ready / Published strip is a different control over a different axis
and both can coexist; the library screen does the same thing with its own
filters.

**Staff assignments.** `TeacherAssignmentsContent` is the whole-school gap list —
which class has a subject with nobody against it — and nothing but the rail
links to it. The Teaching staff screen already has an Assignments view listing
the same rows for editing. Add a link from that view to
`/schools/teachers/assignments`, labelled for what the page is for rather than
for what it contains.

- `components/schools/teachers/schools-teachers-content.tsx`

### Reached from the screen above, and staying that way

These routes are not in the rail today and do not join it. Listed so nobody
"restores" them: `/schools/students/[id]`, `/schools/guardians/[id]`,
`/schools/teachers/[id]`, `/schools/boarding/[id]`,
`/schools/students/class/[classId]`, `/schools/results/class/[classId]`,
`/schools/finance/class/[classId]`, and the subject and class record pages. Each
opens from a row on its list.

These are redirects and stay redirects: `/schools/fees`,
`/schools/finance/invoices`, `/schools/finance/receipts`,
`/schools/finance/refunds`, `/schools/finance/waivers`, `/schools/academics`,
`/schools/academics/identity`, `/schools/academics/syllabus`,
`/schools/classes`, `/schools/subjects`.

## d. What must not move

Load-bearing for somebody's daily job. A tidier diagram is not worth any of
these.

- **Registers** (`/schools/attendance`) — first entry of The school day. The
  office's morning.
- **Arrears and ageing** (`/schools/finance/arrears`) — stays a rail entry and
  does **not** become a ledger segment. "Who owes, and for how long" is a
  different question from "show me the invoices", it has its own ageing strip and
  its own primary action, and it is what a bursar opens first.
- **Fee ledger** (`/schools/finance/ledger`) — one entry, opening on Invoices.
- **Fees by year group** (`/schools/finance`) — the bursar's home href. Leads
  the Fees group.
- **Moderation** (`/schools/results/moderation`) — the head of department's home
  href and the whole of that persona's job.
- **Bed board** (`/schools/boarding`) — the warden's home href, and the only
  screen built from the beds outward, so the only one where a free bed is a row.
- **Leave and outings** (`/schools/boarding/leave`) — a four-move workflow at
  the hour a warden is least able to hunt for it.
- **Messages** (`/schools/messages`) — the office inbox. The one place a
  family's question gets an answer.
- **Students** (`/schools/students`) — the registrar's home href and the roll.
- **Health and welfare** (`/schools/boarding/welfare`) — changes group and gate,
  stays a rail entry. An allergy at speed.

All four persona home hrefs in `lib/workspaces.ts` — `/schools/finance`,
`/schools/students`, `/schools/results/moderation`, `/schools/boarding` — remain
visible rail entries for the personas they belong to. Check this before merging.

## e. Order within each group

**The rule: the group's own front page leads; everything else is alphabetical.**

Alphabetical is a decision, not a default, and it is the decision the existing
section made for a good reason: a school's rail is a reference list, nobody
reads it top to bottom, and a hand-ordered band means scanning all of it to
discover the order was somebody's opinion. That holds after the regroup, so it
is kept.

The one exception is the entry that is the group's own front page — a band's
front page is not one of its siblings. Where a group has one, it leads.

| Group | Order |
|---|---|
| Students | Students (front page), Applications, Guardians, Health and welfare, Library |
| The school day | Registers (front page), Absence follow-up, Calendar, Timetable, Transport |
| Teaching | Homework, Lesson plans, Subject targets, Teaching resources |
| Results | Results (front page), Moderation, Publishing |
| Boarding | Bed board (front page), Allocations, Hostels, Leave and outings |
| Fees | Fees by year group (front page), Fee ledger, Arrears and ageing |
| Staff | Support staff, Teaching staff |
| Families | Documents, Messages, Notices, Parent meetings |
| The school | Classes and streams, Grading and publish windows, Import records, Records and identity, School day and rooms, Subjects, Years and terms |

Two of these are worth defending because they look wrong.

**Results reads as a workflow anyway.** The front page leads and the rest falls
alphabetically into Moderation, Publishing — which is also the order the work
happens in. No exception was needed, so none is made.

**Fees leads with the picker.** `/schools/finance` is a year-group picker rather
than a list, and leading with a picker looks like a mistake. It is the fees front
page by an earlier deliberate decision, it is the bursar's home href, and the
whole-school ledger it used to open with is the second entry. Leave it.

Group order is not alphabetical and that is also deliberate: Students, The
school day, Teaching, Results, Boarding, Fees, Staff, Families, The school. It is
the order a school day touches them, and — checked against every persona in
section b — it never puts a group somebody works in behind a group they only
read.

## f. What has to change, and where

I own this document and nothing else. The work below belongs to other agents.
Files named so nobody has to guess.

**`lib/navigation.ts`**
1. Replace `SCHOOL_BANDS` with the nine groups above, in the order above.
2. Re-`group` the 39 surviving items; delete the ten that leave the rail.
3. `NavItem` gains an optional grant, so an item can override its band's:
   `{ resource: SchoolResource; action?: SchoolAction }`, defaulting to `view`.
   Needed by Health and welfare (`schools.welfare`), Applications
   (`schools.admissions`), Timetable and Calendar inside an attendance-gated
   group, Transport (`schools.students`), and School reports as a root link.
4. `SchoolNavBand` gains the same optional `action`, so Boarding can ask for
   `allocate-bed`, Fees for `issue` and The school for `edit`.
5. Replace `schoolBandResource(groupId)` with a lookup returning the whole grant.
6. Update the section comment. It currently says Overview is the single
   ungrouped exception; there are two root links now, and the eleven-band
   rationale it describes is superseded.

**`lib/workspaces.ts`**
7. `WORKSPACE_MODULES.schools.getItems` prefers an item's own grant over its
   band's, and checks the band's declared action rather than always `view`.
   Nothing else in that function changes; `buildSchoolsProfileSections` reads the
   same declaration and follows for free.

**Screens** — the two in section c.

**`components/layout/app-sidebar/sidebar-nav-sections.tsx` — no change needed.**
It already renders ungrouped items as direct links ahead of the bands, makes
each group its own independently-opening collapsible under `flattenGroups`, and
drops a band whose items have all been gated away. Every decision in this
document was made inside what that component already does.

**No new API.** Every route named here exists, every grant named here is already
in `PERMISSIONS_BY_PERSONA`, and no screen is asked to fetch anything it does not
fetch today.

## g. Considered and rejected

**Merging Teaching and Results into one seven-item "Teaching" group.** It would
have given eight groups instead of nine and both share a gate. Rejected: the head
of department signs in to moderate, and "Teaching" does not name the moderation
queue. A group exists to be recognised by the person who lives in it.

**A new `schools.teaching` resource so Teaching need not borrow
`schools.results`.** Cleaner on paper. Rejected: it is a permissions change, it
would need a matching entry for six personas, and every screen gating on
`schools.academics` today would have to be re-examined to see which half it
meant. Borrowing `schools.results` is a smaller lie than that — and it is close
to true, since the grant means "trusted with how children are doing".

**Folding "Fees by year group" into the ledger as a class filter.** Every ledger
segment already filters by year group, so the picker is arguably a sixth view.
Rejected: it was made the fees front door deliberately, chasing arrears is work a
bursar does one form at a time, and it is that persona's home href.

**Collapsing the seven master-data rows into one link to
`/management/master-data`.** The biggest single cut available. Rejected: that
index lists every module's master data, not the school's, and there is no
`/management/master-data/schools` index page to point at. Building one is
inventing a screen.

**Dropping Hostels from Boarding.** It is reachable from an allocation row via
`?hostel=`. Rejected: a school with no hostel yet has no allocation row to click
through from, and Hostels is where the first one is created.

**Keeping Library and Transport together as "Services".** Rejected on both
counts — a shell word, and a two-item group that exists because neither item fit
anywhere else. A loan belongs to a pupil and a bus run belongs to a day, so each
went where its subject is.

**Keeping "Setup" as a group name.** Rejected on register. It is the word the
shell uses about itself, the rest of the section speaks school, and picking one
register was the point.

**Ordering the groups alphabetically to match the ordering inside them.**
Rejected: inside a group the reader is looking for a word they already have in
mind, and between groups they are looking for a part of their job. Those are
different searches and they get different answers.
