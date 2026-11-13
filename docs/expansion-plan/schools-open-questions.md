# Schools — open questions and caveats

Things I decided on your behalf so the work could continue, and things I could
not decide at all. Nothing here blocks the build; everything here is a call you
may want to make differently.

Each entry says what I did, why, and what changing it would cost.

---

## Decisions I made, reversible

### 1. A calendar event's kind decides whether the school is open

`HOLIDAY`, `PUBLIC_HOLIDAY`, `HALF_TERM` and `STAFF_ONLY` default to *closed*;
`EXAM` and `EVENT` default to *open*. The flag is still a separate column an
author can override per event — a speech day that closes lessons is an `EVENT`
with the flag turned off.

Cost to change: a one-line map in `lib/schools/calendar.ts`
(`defaultIsTeachingDay`). Existing rows keep whatever flag they were saved with.

### 2. Saturday and Sunday are closed unless an event says otherwise

Saturday school is normal here, so I did not hard-code a five-day week — but I
did make the weekend the default. A school that teaches every Saturday has to
enter a recurring teaching event, which is tedious.

The alternative is a per-school "teaching days of the week" setting. I did not
build it because it is a settings screen, a migration and a UI for something
that may affect zero of your schools. Say the word and it is half a day.

### 3. Overlapping grade bands are refused in code, not by the database

Two bands covering the same mark give one score two grades. Postgres can make
that unrepresentable — `EXCLUDE USING gist ("schemeId" WITH =,
numrange("minScore","maxScore",'[]') WITH &&)` — but only with the `btree_gist`
extension, and `prisma migrate deploy` already has a known failure on an empty
database. Requiring an extension raises the cost of a failed deploy above the
cost of this bug, so the rule lives in `findBandProblems` and the one route that
writes bands calls it.

Cost to change: one migration, one `CREATE EXTENSION`. Say the word if your
Postgres has `btree_gist` and you would rather have the constraint.

### 4. An absent child is left out of the average, not scored zero

Off sick for one of three tests, she is marked on the other two. The alternative
— an absence scores zero — is what some schools do, and it is a policy, not a
bug either way. If yours counts absences as zero, it is a flag on the grading
scheme and about an hour's work.

### 5. A subject with no exam yet reports its continuous mark whole

Mid-term, before any paper has been sat, a 30/70 scheme would otherwise report a
child who scored 80 on everything set as having 24. The mark carries a caveat
saying which side is missing. The alternative is to report nothing until both
sides exist, which makes the screen useless for two thirds of the term.

### 6. The teacher, parent and student portal navigations point at pages that do not exist

`/portal/teacher/classes`, `/portal/teacher/moderation`, `/portal/parent/fees`
and nine others are links in `lib/platform/gating/portal-isolation.ts` with no
route behind them. They are Iteration 6, and they will be built there. Until
then a portal user clicking them gets a 404.

I fixed the one that was a typo rather than a missing page —
`/portal/teacher/registers` should have been `/portal/teacher/register` — and
left the rest, because stripping the nav now means rebuilding it in three
commits' time. **If you would rather the nav only showed what exists, say so and
it is ten minutes.**

### 7. Portals must not use the dashboard shell — done

`/portal/**` already bypassed the dashboard chrome in `app-shell.tsx`; what was
missing was a shell of its own. The teacher portal now has one, built from the
design system's `AppShell` + `NavRail` rather than hand-rolled, with the class
list held above the navigation so every screen agrees which lesson it is
looking at. The student portal's is next.


### 8. Provisioning creates students with a current class but no enrolment rows

Found by the year roll-up, which reads `SchoolEnrollment` — the record of who
was in which class in which term — and correctly found nobody in the demo
tenant. Every seeded student has a `currentClassId` and no enrolment.

Rather than have the roll-up silently do nothing, it falls back to each
student's current year group and says so on screen. That is the honest
behaviour, but the underlying gap is real: without enrolment rows the school has
no history of who was where, so "which class was she in last year" has no
answer.

The fix is to have `provisionSchool` (and any bulk student import) write an
enrolment alongside the student. Half a day, and it wants a backfill for
existing tenants. **Worth doing before a real school goes live** — say the word.

### 9. The teacher portal wears the tenant's brand, not the prototype's purple

`teacher.html` sets its own purple accent (`--te-brand: #6D28D9`) to mark the
portal as a distinct surface. I did not copy the hex. Two rules in
`docs/design-system/05-rules.md` point the other way — "never hard-code a hex"
and "pick the role token" — and the workspace branding system already paints
`--brand` per tenant, so a hard-coded purple would ignore a school's own colours
on the one surface its staff use most.

The portal therefore uses `--brand` and reads blue by default, purple for a
school whose branding is purple. If you want the portal to be purple *because
it is a portal*, that is a per-surface accent token rather than a literal, and
it wants adding to the design system rather than to this repo.

Cost to change: one token declaration on the portal shell.

### 10. Parent messaging has no model yet

Both prototypes have it — the teacher's Messages screen and the parent's
notice replies — and the roadmap already carries it as S-7.1, deliberately as
one primitive rather than three. It needs a thread model, an attachment path
and realtime delivery, which is a domain of its own rather than a screen.

The teacher portal's Messages screen is therefore the one place I cannot build
to the prototype from what exists. I will build it when S-7.1 lands rather than
faking a thread list against notices.

### 11. Where classroom work went

Acting on your instruction, these leave the admin dashboard for the teacher
portal: lesson plans, teaching resources, homework, mark capture, the register
itself. The office keeps what it actually does — who has *not* marked, marks
moderation, publishing, and every admissions, fees, boarding, welfare and
transport screen.

Two calls inside that I want to flag:

- **The master timetable stays with the office.** A teacher sees their week; a
  timetabler builds everybody's. Same tables, two screens.
- **Library is split.** Borrowing and browsing are a student portal screen;
  the catalogue, stock and fines are the librarian's, which is office work.


### 12. Three app-wide bugs the portal build turned up

None of these are schools defects, but all three were breaking the portal, so
they are fixed. Recording them because they affect every module.

**Node's `navigator` made the server think it was offline.** Node 18 and later
define a global `navigator` carrying little more than `userAgent`. The offline
layer guarded on `typeof navigator === "undefined"`, which passed on the
server, read `navigator.onLine` as `undefined`, and concluded the machine was
offline. Every authenticated page server-rendered the offline guard, the client
rendered the app, and React threw the page away on hydration. Guarded on
`onLine` itself now, in `hooks/use-offline-connectivity.ts` and
`lib/offline/connectivity.ts`.

**The design system's `Toaster` renders nothing on the server and a viewport on
the client**, which is the same mismatch one layer down. It is gated on
`useSyncExternalStore` with a server snapshot of `false` so the first client
render matches. Worth reporting upstream. Two obvious-looking fixes are wrong:
`dynamic(…, { ssr: false })` suspends during hydration and the commit never
lands, and a `useState`+`useEffect` mount flag is a cascading render the
compiler's lint rejects.

**A TanStack Query `useQuery` mounted in a Next layout does not re-render when
it resolves.** The request returned 200 with the right body, the `queryFn`
promise resolved, and the observer never notified React — the screen sat on its
skeleton until something else forced a render. The same query in a *page*
component is fine. The teacher portal now loads its day on the server in the
layout and hands it to the client provider as `initialData`, which is better
anyway. **If you see a portal screen stuck loading, this is the first thing to
suspect.** I have not found the root cause and it deserves one.


### 13. A fourth shipped bug: no pupil or parent could reach their portal

`schools.portal.student` and `schools.portal.parent` both depend on
`schools.core` (`lib/platform/gating/feature-dependencies.ts`), and the
`STUDENT` and `PARENT` entries in `lib/platform/user-entitlements.ts` granted
the portal key without it. Every request resolved to "requires schools.core"
and bounced to `/access-blocked` — on every tenant, for every pupil and every
parent, since the entitlement list was written.

The teacher was fine because `TEACHER` inherits the shared schools prefix.

`schools.core` is added to both lists now. It grants nothing on its own: the
admin pages are gated on `schools.students`, `schools.fees` and the rest, which
are still absent from those two lists, and a portal user's records are resolved
from their own linked account regardless of any feature key.

**Worth checking whether any real tenant has parents or pupils who have been
quietly locked out.**


### 14. Three things Iteration 2 left open for you

**The printable documents screen hard-codes twenty colours.**
`components/schools/documents/school-documents-content.tsx` uses `#e5e7eb`,
`#f9fafb`, `#6b7280` and `#000` in inline styles. It predates this work
(`d03b444`), and there is a real argument for it — a print target does not
inherit the app's cascade, and a fee statement that comes out of a printer
grey-on-grey is worse than one that ignores the token system. But nothing in
the file says that, so it reads as an oversight rather than a decision.

Either it wants a comment marking it a deliberate print exception, or the
tokens want resolving to literals at build time. **Your call which.**

**Six bursar actions were writing no audit event**, against DoD item 7:
issuing an invoice, writing one off, bulk generation, creating an invoice,
approving a waiver and applying one. All six change what a parent owes, and a
school that cannot answer "who wrote off this $400" has no answer at all. This
is being closed now rather than left, but it is worth knowing it was possible
to ship six privileged money actions with no trail — the DoD says every
privileged action, and nothing enforces it the way
`route-guard-coverage.test.ts` enforces the guards. **A coverage test for audit
events would stop this recurring.**

**`prisma migrate deploy` still cannot build this database.** S-3.2 already
tracks it, but Iteration 2 made it concrete: the dev database has no
`_prisma_migrations` table at all, because it was built by `db push`. Every
migration this project has written has been applied by hand with `psql`. They
are all replayable in principle — but nobody has ever proved it, and the first
person to find out will be whoever provisions the first real school.

_Closed by S-3.2. It was worse than this paragraph guessed: the history was
missing forty tables, and two Gold-module migrations had been quietly
disagreeing with the schema since May. See entry 15._

---

### 15. What replaying the migration history turned up

Three things worth your attention, all found by S-3.2 and none of them
schools defects.

**Forty tables were never migrated.** The whole CRM and product-catalogue
schema was built with `prisma db push` and no migration was ever written. Seven
later migrations alter those tables, so the history stopped dead at
2026-07-28 on any database that had not been built by `db push`. The catch-up
reconstructs the schema as it stood that day — current form minus everything
the later seven add — so those seven were left untouched and still do exactly
what they say.

**Two migrations had drifted from the schema they claim to write.**
`add_correction_models` gave `id` a database default and `createdAt` a wider
type than `prisma/schema/core.prisma` declares. More interesting:
`add_company_id_to_buyer_receipt` deliberately created
`BuyerReceipt_companyId_receiptNumber_key` as a *partial* index — `WHERE
"companyId" IS NOT NULL`, with a comment explaining why — but Prisma has no way
to express an index predicate, so the schema declares a plain `@@unique` and a
`db push` database has always had the full index. The two have behaved
identically in practice, because Postgres treats NULLs in a unique index as
distinct, which is exactly what the predicate was there to arrange. Converged
on the full index, since that is what the schema means and what every existing
database already has. **If you have a Postgres partial index you actually need,
it cannot live in `schema.prisma` and this will happen again** — it wants a
comment on the migration saying so, and a line in the replay script's expected
drift.

**The dev database is now baselined.** 56 migrations resolved as applied,
`prisma migrate status` clean. Applying migrations by hand with `psql` should
stop; `prisma migrate deploy` works now, and
`scripts/verify-migration-replay.sh` will tell you the moment it stops working
again. **Run it whenever you add a migration** — the reason this got forty
tables deep is that nothing ever checked.

_One unrelated observation while running the suite: `lib/schools/provision.test.ts`
failed once and passed on a re-run and in isolation. It provisions against the
shared dev database, so it contends with whatever else is running. Not
investigated._

---

### 16. What the importer decided, and what it left open

**A student number is required.** S-3.3 matches a re-run on it, and a school
with no student numbers cannot be matched reliably by anything else — name and
date of birth collide in every family with twins. A file without them is
refused rather than given generated numbers that would duplicate on the second
run.

**An opening balance is an invoice, with a null `feeStructureId`.** Deliberate:
that keeps it outside S-2.4's one-live-invoice partial index, so a
brought-forward balance cannot block the term's first real bill. It carries a
line coded `OPENING_BALANCE`, which is how a re-run recognises one that is
already there. **A cross-currency opening balance is brought over at a rate of
1 and flagged**, not converted — the figure is what the school states it is,
and restating it at today's rate would change what a family owes. If schools
turn out to arrive with mixed-currency arrears often, this wants a rate column
in the file rather than a guess.

**Rollback stops rather than cascades.** If somebody has since put a mark, a
receipt or a bed against an imported pupil, the delete fails and the whole
rollback rolls back. That is the right default — at that point the import is no
longer the only thing that wrote there — but it means a rollback gets harder the
longer it is left, and nothing warns about that yet.

**The commit is synchronous, capped at 5000 rows and 5 MB.** Gold's is too. A
school larger than that has to split the file by year group, which is also how
they would check it. If a 20,000-pupil group turns up, this needs a queue, and
that is a bigger change than raising the cap.

**Not built: an undo for a *partial* commit.** A row that fails is recorded as
FAILED and the rest go in, which is the right behaviour — one malformed student
must not strand the other 1,999. Re-running the same job retries only the failed
rows. But there is no way to undo just the rows that succeeded in one particular
run; rollback is all-or-nothing per job.

---

_The changelog for this work lives in the roadmap; this file is a wall, not a
log._

---

### 17. What Iteration 4 found, and what it deliberately did not do

**The demo tenant had no enrolments at all.** Every pupil in `chisipite-demo`
had `currentClassId` set and zero `SchoolEnrollment` rows — the exact hole
`provisionSchool` leaves, seen on live data rather than in a test. It was fixed
by running the S-3.3 importer over the existing roll, which reported five
students updated and wrote the five missing enrolments. **`provisionSchool`
itself is still wrong** and will do it again to the next school provisioned that
way; it wants the same two lines the importer's student handler has.

**Four record tabs are missing on purpose.** Tasks, comments, files and
mentions identify their subject with a nullable foreign key per kind
(`CrmTask.leadId`/`dealId`/`clientId`/`personId`/`siteId`, and six on
`CrmRecordFile`). A school record cannot be a subject until S-4.2 re-keys them
onto `(subjectType, subjectId)`. **Do not add `studentId` to those tables as a
shortcut** — six school types across three tables is eighteen nullable foreign
keys, and `isValidParent` becomes an eleven-way field comparison. `CrmFollower`
and `CrmListMember` already use the generic `(entity, recordId)` pair, so the
codebase contains both idioms with a written rationale for each; the re-key is
making the three stragglers match the two that got it right.

**`CrmFieldEntity` is the next thing to land, and it is one line.** It is a
Prisma enum with PERSON/COMPANY/LEAD/DEAL/SITE/WORK_ORDER, and it gates custom
fields, lists, followers and the merge dialog. Adding the six school types
unblocks S-4.4 and part of S-4.2 at once. The student record page already asks
for `entity=STUDENT` definitions and tolerates the empty answer, so nothing
needs editing there when it lands.

**Date properties are read-only in a record page, everywhere.** Not a schools
decision — `RecordAttributes` has exactly two widgets, a text box and a popover
select, so `DATE`, `DATETIME`, `CHECKBOX` and the select types fall to formatted
read-only text. A box that accepts "next tuesday" into a date column is worse
than no editor, so this is right for now, but "date of birth" being
uneditable on a pupil's own page is the kind of gap a registrar notices. A date
picker in a property row is its own piece of work and would serve custom `DATE`
fields at the same time.

**Five more record types to go.** Guardian, teacher, class, subject and hostel
still have hand-rolled pages (or none, for subject). They are now a tab array
each, not a page each — the student page is the template.

---

### 18. The feature gate, not the data model, is what keeps schools out

This bit twice in one afternoon and will bite again, so it is worth stating as a
rule: **every `/api/v2/crm/**` route is gated on a `crm.*` feature, and no school
tenant has one.** Making a school record a legal value in a shared enum changes
the data model and changes nothing about who can reach it.

- S-4.4 hit it on `/api/v2/crm/field-definitions` (`crm.settings`). Fixed with a
  schools door onto the same engine — `/api/v2/schools/field-definitions`,
  narrowed so a schools session can only ever touch school record types.
- S-4.2 hit it on `/api/v2/crm/files` and `/api/v2/crm/comments` (`crm.core`).
  Filing a document against a student returns `Feature disabled: crm.core`, even
  though the storage now supports it perfectly well.

**Done for files and comments.** `/api/v2/records/{files,comments}` gate per
subject type via `app/api/v2/records/_guard.ts`, and they are deliberately absent
from the route registry — an entry there could name only one feature, which is the
trap. `/api/v2/records/tasks` is the same shape when tasks get a UI.

**The one thing to be careful about**: because those routes are unregistered, the
platform feature gate does not run for them at all, and the handler's own guard is
the only thing standing there. `lib/schools/route-guard-coverage.test.ts` now scans
`app/api/v2/records` as well as the schools routes for exactly this reason. Do not
add a route under `/api/v2/records` without `guardRecordSubject`.

Verified over HTTP, negative included: a school tenant asking for a `DEAL` subject
through the neutral door is still refused `Feature disabled: crm.core`.

### 19. Do not drop the legacy subject columns yet

S-4.2 is deliberately additive. `CrmTask`, `CrmComment` and `CrmRecordFile` carry
both the old nullable-foreign-key-per-kind columns and the new
`(subjectType, subjectId)` pair, and `subjectWhere` matches either. Before you
drop the old ones:

1. Run `npx tsx scripts/backfill-record-subjects.ts` (dry run), then `--apply`.
2. Deal with any rows it reports as naming no record at all. They are already
   unreachable from every record page, and after the drop there is nothing left
   to work out what they were about.
3. Decide whether the narrowest-first precedence for a multi-subject row is what
   you want — deal, lead, company, person, site, rep. Until the drop the other
   columns are still there, so a different answer is still available.

The drop also makes `subjectType`/`subjectId` non-nullable, which is worth doing
in the same migration: a nullable subject is how a task ends up about nothing,
and the old schema allowed exactly that.

### 20. The test suite flakes under parallel load

Three separate runs this session reported one or two failures that passed on
re-run and in isolation: `lib/schools/provision.test.ts` once, two CRM files
once, two unnamed files once. They all write to the shared dev database, so they
contend with whatever else vitest is running.

Nothing is wrong with the assertions. The risk is that this trains everyone to
re-run a red suite until it is green, which is how a real failure gets waved
through. It wants either a database per worker or a serialised project for the
tests that touch Postgres.

---

### 21. Every authenticated page threw its tree away on hydration — FIXED

Not a schools defect, not introduced by Iteration 4, and worth fixing before
anyone measures performance.

The sidebar's module switcher renders a **different module on the server than on
the client**. React's mismatch report names both sides:

```
<span className="truncate">
+   School Operations
-   {"Scrap & Recycling"}
```

— along with two different `<path d="…">` values, i.e. a different icon too. It
is the `data-sidebar="menu-button"` inside the sidebar's dropdown trigger.

Because the mismatch is in the shell rather than in a page, **every authenticated
page is affected**. Confirmed on three: the new student record page, the new
guardian record page, and `/schools/students`, which Iteration 4 never touched —
all three report exactly one hydration failure, which is how I know it is
inherited rather than mine. React responds by regenerating that whole tree on the
client.

Repro:

```ts
page.on("pageerror", (e) => { if (/Hydration failed/.test(e.message)) count += 1; });
await page.goto("/schools/students");
```

This is the third bug of its exact class in this repo — caveat 12 records two
already fixed, `navigator.onLine` reading the *server* as offline and the design
system's `Toaster` rendering nothing on the server and a viewport on the client.
The pattern is a shell component deriving state that only exists in the browser
and rendering it directly instead of after mount. Whatever picks the active
module is doing the same thing; it wants resolving on the server (from the
hostname or the session, both of which are available there) or deferring to an
effect.

**Fixed.** The cause was one line missing in `app/layout.tsx`: `SessionProvider`
was mounted with no `session` prop, so `useSession()` had no data during SSR.
`getWorkspaceSidebarModel` falls back to the first profile when handed no role and
no features — hence Scrap & Recycling on the server and School Operations in the
browser, icon included. The sidebar was only the visible casualty; the nav filter,
the command bar's module bands and the quick actions all read the same three
fields and all rendered their signed-out shape into the HTML.

The fix resolves the session on the server — the layout is already dynamic, so it
costs a decode — and hands it to the provider, which then treats it as the initial
value instead of fetching on mount. That removes the opening
`/api/auth/session` round trip as well.

Guarded two ways, because neither alone would have caught it: `e2e/hydration.spec.ts`
walks eight school pages at both viewports and fails on any `pageerror`, and
asserts the *server* HTML carries the school's workspace; and
`components/providers/session-ssr.test.ts` asserts the wiring itself, since a prop
that looks unused is easy to tidy away and nothing else fails loudly when it goes.

One thing this diagnosis exposed, worth knowing: when Postgres is unreachable the
JWT session callback throws (`getCompanyFeatureMap` reads four tables), so the
server resolves no session at all. Before the fix that produced this exact
mismatch on every page; after it, the app renders signed-out until the database
returns, which is at least honest.
