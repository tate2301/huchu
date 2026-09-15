# Head dashboard: workflow audit

Surface: governance and oversight in the school workspace. Pages `app/schools/page.tsx` (overview), `admissions`, `students/**` including `roll-up`, `guardians/**`, `attendance/**`, `results/**`, `homework`, `teaching/{lessons,resources}`, `goals`, `meetings`, `boarding/**` (bed board, allocations, leave, welfare), `messages`, `notices`, `reports`. APIs under `app/api/v2/schools/{applications,enrollments,students,year-rollup,attendance,assessments,results,assignments,goals,meetings,boarding,health,notices,messages,reports}`. Personas: `SCHOOL_ADMIN` as the head, `HOD` for departmental moderation, `REGISTRAR` for admissions and records, `WARDEN` for boarding.

Audit date: 2026-09-14. Static read of `main`, cross-checked against the roadmap (S-1.4, S-1.5, S-1.2, S-1.3, S-5.2, S-5.4, S-9.1, S-9.6, S-9.7), the governance phase 4 spec, the production-readiness audit, and the K-12 benchmark §1, §5, §6, §7, §11, §16. UI companion: `ui-ux.md` in this folder.

## 1. Verdict in one paragraph

The head's office has more working machinery than the roadmap's `todo` list suggests: an admissions pipeline with a real stage machine, a reviewable year roll-up, register oversight that knows which days are school days, a four-state results chain with HOD moderation and window-gated publishing, report cards, homework and lesson oversight, boarding with gender and capacity rules, welfare records, an office inbox, and reports with real exports. It fails the head in four ways. The dashboard is the row-count page the roadmap promised to replace, and on a first morning shows zeros. Governance actions that matter (publishing marks, editing a submitted register) are not transactional and not audited, and publishing tells no family. The role model locks the wrong people out: an HOD gets 403s across the dashboard and nav, cannot send an absence reminder, and cannot moderate at all without a linked teacher profile; welfare is gated as boarding so a day school has no health records. And the whole layer above the workflows that a head runs a school on, the board pack, behaviour, exam management, staff cover, is not there.

Of those four, the role model is now largely repaired: four narrow verbs (`notify-families`, `reply`, `book-meeting`, `lock`) and a `schools.welfare` resource put each role back within reach of its own work, the sidebar is generated from one source and filtered by persona, each persona lands somewhere it can work, and a register can be locked by the office and only by the office. Welfare is a school feature now, so a day school has its health records. The dashboard is the page it was. The governance transitions are still neither transactional nor audited and still tell no family. The layer above them is still absent, and to it should be added a fault the audit did not see: the report card's publish-window gate means that at a school with no window configured, which is every seeded school, printing one throws (B14).

## Runtime check (14 September 2026)

Verified on the seeded St Marys tenant as the head (see `../reference/runtime-verification.md`). Confirmed at runtime: the head can send an in-app notice (201, with 117 of 118 families counted as `withoutAccount` and not reached) and can roll up term marks into a DRAFT sheet (247 lines written); the "Scheme of work" redirect lands the head in the teacher shell; results, attendance and overview screens behave as described. The results transition routes, the HOD experience and welfare gating were checked from source only.

Revised on 15 September 2026 against the eighteen commits that followed the audit (`01de8a3..HEAD`). A finding the work closed keeps its description and gains a line saying it is closed and what closed it; a finding the work did not reach stands as it was written; a finding the implementation proved wrong says so and says what is actually true.

## 2. Docs versus code

| Claim | Source | Code reality | Verdict |
|---|---|---|---|
| S-9.1 head dashboard about the term: `todo` | roadmap | `schools-dashboard-content.tsx` already has registers to come in, waiting on somebody, homework overdue, fees this term, this week, boarding. It is closer to S-9.1 than the roadmap admits, but shows "0 · 0% · —" with zero denominators and the fee panel skeleton never resolves in the capture. Since revised: the arrears bars are drawn by the shared ageing strip and the panel says "Nothing is owed" rather than ageing a row of zeros (`f6556ee`); the zero ratios, the six Remind buttons and the fee panel are as they were. | Partly built; row needs `wip`. |
| S-1.4 admissions pipeline with board and duplicate detection: `done` | roadmap | Stage machine in `admissions-stages.ts:59-70`, offer lapse, duplicates, transactional enrol. The "board" is a vertical list of stage groups with up to six inline buttons per row. | True at the model; the board is a list. |
| S-1.5 year roll-up in one reviewable batch: `done` | roadmap | Plan then apply, idempotent, transactional. Plan is never stored; no reversal path; defaults do not produce a plan on first run. | True with gaps. |
| Results chain DRAFT → SUBMITTED → HOD_APPROVED → PUBLISHED with moderation rows | phase 4 spec, production readiness | Present. Transitions write status and moderation row without a transaction; no `PlatformAuditEvent`; no notification on publish. | True, fragile. |
| Pack spec: eight-state moderation with HOD_REVIEW, ADMIN_READY | pack spec | Four states shipped. | Spec stale. |
| S-5.2 report cards gated on window and PUBLISHED sheet: `done` | roadmap | `lib/documents/schools-sources.ts:492-499`. The gate is unconditional: with no open window the source throws rather than rendering, and no seeded school has one (B14). | True, and unusable as seeded. |
| S-5.4 real report exports: `done` | roadmap | CSV and PDF in `reports/export/route.ts`. | True. |
| S-9.6 notice compose with audience targeting: `todo` | roadmap | `POST /notices` with audience, class or pupil shortlist and severity exists (`lib/schools/notices.ts:129-200`); `/schools/notices` composes. In-app only. Since revised: the guard moved from `reports:create` to `schools.reports notify-families` (`e5b76a5`), so the bursar, registrar, HOD and a class teacher can send one. | Built; row stale. What is missing is a channel, drafts, scheduling and recall. |
| S-9.7 board reporting pack: `todo` | roadmap; marketed as "Reporting for the board" | Absent. | Accurate; overclaim on the site. |
| Marketing: "Term-end reporting is a page the head opens" | site | Reports page with four tabs and exports; no term-end pack. | Overclaim. |
| Production readiness: "Transport, library, health, canteen are absent" | Aug 4 audit | First three built. | Stale. |
| Design canvas: `HeadDashboard`, `HodModeration`, `HodPublishWindows`, `WardenDashboard` | `design/campus/leadership/*` | No stories; moderation and windows exist as admin screens. | Design without stories. |
| S-6.61: classroom work removed from admin nav; the office keeps oversight | roadmap | Mostly true; the "Scheme of work" nav item redirects office users into the teacher portal, where the head lands as "Teacher · No classes this term" with empty pickers (`app/schools/academics/syllabus/page.tsx:11`; confirmed at runtime). Fixed in `72f9227`: the rail is derived from `lib/navigation.ts` and carries no "Scheme of work" item, and master data is reachable in a Setup band. The redirect page still exists; nothing in the school rail points at it. | Fixed. |

## 3. Workflow inventory

**Overview and reporting**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| H1 | Morning overview: registers to come in, waiting on somebody, homework overdue, fees, this week, boarding | Partial | Present; zero-denominator ratios render 0%; six identical "Remind" buttons and no "remind all"; day, term and year filters ignored by the fee panel; HOD sees 403s from fees, boarding and admissions panels. All still true: the screen fetches every panel without asking what the reader may view, and the HOD holds no `schools.fees`, `schools.admissions` or `schools.boarding` grant. The rail no longer offers the HOD the bands behind those 403s (`72f9227`), and the arrears strip is the shared one. |
| H2 | Enrolment, occupancy, collections, arrears reports with CSV and PDF | Implemented | Ageing disagrees with the finance page (see bursar audit). Fixed in `f6556ee`: one service, `lib/schools/ageing.ts`, holds the boundaries and the labels, and the overview, the arrears report, the reports page and the server's report builder all read them from it. There were four computations, not three, and they did not agree: the finance overview's SQL called a bill Current only while its due date was in the future, so a bill due today — a due date is stored at midnight — was overdue there and Current in the arrears report. The CSV and PDF export labelled its last column "120+ days" for a column that has always held everything past ninety. |
| H3 | Board pack (enrolment, collections, arrears, attendance, results in one document) | Missing | S-9.7. |
| H4 | Ministry and exam-board returns | Missing | No model. |
| H5 | Audit of who did what across the school | Partial | Fee actions and imports audited; results transitions, register edits, admissions decisions, roll-up, bed allocation are not. Since revised: correcting a register a teacher has already submitted writes `schools.attendance.session.edited` with the day before and after and the note before and after, and archiving a pupil or a teacher writes its own event (`50df723`). Results transitions, admissions decisions, roll-up and bed allocation still write nothing, and there is no screen that reads the events back. |

**Admissions and roll**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| H6 | Application pipeline ENQUIRY → … → ENROLLED, offer lapse, duplicate detection, enrol | Implemented | Six stage presses to walk one applicant; no bulk decide; no online application form; no application fee or deposit invoice. |
| H7 | Waitlist and intake capacity per year group | Partial | WAITLISTED stage exists; no capacity per class in the pipeline view. |
| H8 | Student record with notes, files, custom fields, attendance, fees, health | Implemented | Health tab 403s for REGISTRAR and HOD (boarding gate). Fees tab deep link to `/schools/finance?invoice=` is dead. The health gate is fixed: the routes ask `schools.welfare`, which the registrar, HOD, bursar, warden and class teacher hold (`c4689af`, `e5b76a5`). The dead deep link is unchanged: `/schools/finance` is the year-group picker, and the ledger it was meant to open, at `/schools/finance/ledger`, reads `view` from the query string and nothing else. |
| H9 | Year roll-up: promote, repeat, graduate, transfer | Implemented | No dry-run diff stored, no reversal, no reason capture; REGISTRAR and SCHOOL_ADMIN can run it. |
| H10 | Archive, withdraw, transfer with letter | Partial | Transfer letter exists (S-5.3). DELETE routes hard-delete students, guardians and teacher profiles behind an "archive" verb (`students/[id]/route.ts:379`). Fixed for the two that had somewhere to go (`50df723`): a pupil moves to WITHDRAWN and a teacher profile is archived, both drop off their lists by default and both stay reachable by id, and the refusal that blocked either whenever an invoice or a mark existed is gone. A guardian has no archived state on the model, so that one remains a real delete and is now restricted to an administrator — deliberately, and the screen says the record does not come back (`272edf4`). |
| H11 | Alumni | Missing | GRADUATED status only. |

**Attendance**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| H12 | Register oversight: which classes have not submitted; open, edit, delete, submit, lock from the office | Implemented | Office PATCH of a SUBMITTED register refuses only LOCKED and writes no audit row (`attendance/sessions/[id]/route.ts:97`); teachers can lock their own (`lock` uses `attendance:submit`). Both fixed in `50df723`: locking takes the new `lock` verb, which no teacher holds, and a correction to a submitted day is written to the audit log inside the same transaction as the change. Before this the board showed every class as unsubmitted, because the staff portal had no submit path at all; it has one now. The office screen gained the Lock verb on a submitted day, and a locked day reads as locked (`272edf4`). |
| H13 | Absence follow-up list and reminders | Partial | Send requires `reports:create`; HOD and REGISTRAR cannot. The action is a notice, not a call log. The grant is fixed: sending takes `notify-families`, held by the registrar, bursar, HOD and class teacher (`c4689af`, `e5b76a5`). It is still a notice and still not a call log, and there is still no "send to all" on the follow-up list. |
| H14 | Absence notification to parents | Missing | S-9.2. |
| H15 | Attendance patterns, thresholds, interventions | Missing | Follow-up is a list of repeat absentees; no threshold rule, no intervention record. |
| H16 | Lesson-by-lesson registers | Missing | Session keyed by class, stream, date. |

**Results and academics**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| H17 | Assessments and term-mark roll-up per class | Implemented | Office can create assessments and roll up; teachers roll up from the portal. |
| H18 | Sheet submit → HOD approve or request changes → publish (window) → unpublish | Implemented, fragile | Not transactional; no audit event; HOD needs `isHod` plus a class assignment or gets 403; no notification to the teacher on request-changes or to families on publish. |
| H19 | Publish windows | Implemented | CRUD in two places (grading master data and results publishing). |
| H20 | Report cards with head's comment, comment bank, acknowledgement | Broken | Document renders from the published sheet; no head's comment field, no comment bank, no parent acknowledgement. Reclassified on revision: the document does not render at all unless a publish window is open for the term and class at the moment of printing, and no seeded school has a window, so the source throws and the head gets an error instead of a report card (B14). |
| H21 | Ranking, position in class, effort grades | Missing | |
| H22 | Progress over time, at-risk flags at school level | Partial | Teacher report has at-risk per class; nothing at school or department level. |
| H23 | External exam management (ZIMSEC, Cambridge entries, fees, results import) | Missing | |
| H24 | Exam timetable and invigilation | Missing | Only a calendar event kind. |
| H25 | Homework and lesson-plan oversight, cover arrangement | Implemented | Cover accepts `academics:edit` or `teachers:edit`, so REGISTRAR can author lesson plans. |
| H26 | Goals and parent meetings oversight | Implemented | |

**Welfare, boarding, conduct**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| H27 | Bed board, allocations with gender and capacity rules, leave lifecycle with movement log | Implemented | Leave requests can only be created by roles holding `boarding:approve-leave`; parents and boarders cannot request. |
| H28 | Health records, consents, events | Implemented | Was mis-gated: feature `schools.boarding` and persona `schools.boarding` (`route-registry.ts:387`, `health/[studentId]/route.ts`); a day school had no welfare screen; REGISTRAR, HOD, BURSAR could not read allergies or consents. Fixed in `c4689af` and `e5b76a5`: welfare is its own resource, `schools.welfare`, and its feature key is `schools.students`, so a day school that has not bought boarding still has its health records and a class teacher can see an allergy on their own roll. The screen still sits inside the Boarding band in the rail, which the restructuring in §7 would move. |
| H29 | Behaviour, merits, sanctions, safeguarding concerns | Missing | Parked S-P.1. |
| H30 | Roll calls for boarders, visitor log, sanatorium medication log | Missing | |

**Communication**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| H31 | Notices with audience, severity, class or pupil shortlist | Implemented | In-app only; no draft, schedule or recall; `reports:create` so only SCHOOL_ADMIN. The grant is fixed (`e5b76a5`): the route takes `notify-families`. In-app only, and no draft, schedule or recall, stand. |
| H32 | Office inbox: threads with families, assign, close | Implemented | This finding was wrong. It read "reply requires `reports:create`; only SCHOOL_ADMIN can answer", which was wrong about the mechanism and understated the gap. There was no `reply` action on `POST /messages` for anybody: the 403 fired before the body was read, and the screen — which labelled threads "Needs a reply" — had no composer at all, only assign and close. Replies could be written from the staff portal and nowhere else, so the office's choices were to close a thread or hand a fee query to a teacher who cannot see the ledger. Fixed in `d26c31e`: answering is a `reply` grant held by the head, registrar, bursar and HOD, triage stays on `reports:create`, and the composer is hidden rather than shown and refused for a reader without the grant or on a closed thread. |
| H33 | Staff notices, staff absence and cover today | Missing | |
| H34 | Calendar and events with RSVP | Partial | Calendar events exist; no PATCH route; no portal view; no RSVP. |

Counts at the audit: 14 implemented (3 with control gaps), 8 partial, 0 broken, 12 missing. After implementation: 14 implemented (1 with a control gap, the results chain at H18), 7 partial, 1 broken (H20, the report card), 12 missing. Two of the three control gaps — the register at H12 and welfare at H28 — are closed; the report card moved out of partial and into broken because reading it against the seeded data showed it does not print at all.

## 4. Benchmark gap

| Capability | Benchmark norm | Huchu today | Priority |
|---|---|---|---|
| Term dashboard: attendance, registers, moderation queue, arrears, capacity | Standard | Row counts with zeros | P0 |
| Behaviour and pastoral | Standard | Parked | P1 (decision) |
| Absence notification and thresholds | Standard | Absent | P1 |
| Board pack and ministry returns | Standard | Absent | P1 |
| Comment bank, head's comment, report acknowledgement | Standard | Absent | P1 |
| External exam entries and results import | Regional necessity (ZIMSEC, Cambridge) | Absent | P1 |
| Staff absence and cover for today | Standard | Cover model exists, no daily view | P2 |
| Online admissions and application fee | Standard | Absent | P2 |
| Audit trail of governance actions | Standard | Fees, imports, register corrections, pupil and teacher archives; nothing reads them back | P1 |
| Multi-campus consolidation | Sold in the Group band | No entity | P2 (decision) |

## 5. Bugs and risks

| # | Finding | Location | Severity |
|---|---|---|---|
| B1 | Results transitions write status and moderation row without a transaction and without a platform audit event; publish sends no notification. | `results/sheets/[id]/{submit,hod-approve,hod-request-changes,publish,unpublish}/route.ts` | High |
| B2 | HOD experience: no admissions, fees or boarding grants so the dashboard and nav 403; moderation needs `isHod` plus a class assignment; HOD has no portal home either. Partly addressed. The rail is filtered by persona and the HOD lands on moderation (`72f9227`), so the nav no longer offers doors into a 403. The grants are unchanged, so the overview's fee, boarding and admissions panels still 403 for an HOD, and `hod-approve` still wants `isHod` plus a teaching assignment on the sheet's class. | `personas.ts:126-136`; `hod-approve/route.ts:44-58`; `proxy.ts:59-65` | High |
| B3 | Welfare gated as boarding. Fixed in `c4689af` and `e5b76a5`: a `schools.welfare` resource, and the feature key moved to `schools.students` so a day school keeps its health records. | `route-registry.ts:102, 387`; `health/[studentId]/route.ts` | High |
| B4 | Office can rewrite a SUBMITTED register with no audit; a teacher can lock their own. Fixed in `50df723`: correcting a submitted day writes `schools.attendance.session.edited` on the transaction client, and locking takes the `lock` grant, which no teacher holds. A second role test beside it that admitted the bursar, who holds no attendance grant at all, is gone. | `attendance/sessions/[id]/route.ts:97`; `lock/route.ts` | Medium |
| B5 | Absence reminders and inbox replies need `reports:create`. Half right. Reminders did need `reports:create` and now take `notify-families` (`e5b76a5`). The inbox half was wrong: there was no reply action on the route for anybody, so the 403 fired before the body was read and the gap was every office role, not the bursar alone. See H32 and B13. | `notices/route.ts:121`; `messages/route.ts:83` | Medium |
| B6 | "Scheme of work" nav item dead-ends office users in the teacher portal. Fixed in `72f9227`: the hand-written sidebar recipe that shadowed `lib/navigation.ts` is gone, the rail is derived from the navigation section and filtered by persona, and the item is not in it. | `lib/navigation.ts:343`; `app/schools/academics/syllabus/page.tsx:11` | Medium |
| B7 | Hard deletes behind "archive" for students, guardians and teacher profiles; cascades reach invoices. Fixed for pupils and teacher profiles in `50df723`, which archive instead and no longer refuse when marks or invoices exist. A guardian has no archived state on the model, so that one stays a real delete and is now an administrator's alone, said plainly on the screen. | `students/[id]/route.ts:379`; `guardians/[id]/route.ts:253`; `teachers/profiles/[id]/route.ts:201` | Medium |
| B8 | Roll-up has no stored plan, no reversal and no reason. | `lib/schools/year-rollup.ts` | Medium |
| B9 | `PATCH /guardian-links/[id]` has no persona check. Fixed in `e5b76a5`: it takes `schools.students edit`, the registrar's grant. The route-guard test now walks every exported mutating method rather than searching the file for a marker, which is how this one stayed unguarded (`4fce301`). | `guardian-links/[id]/route.ts:46-110` | Medium |
| B10 | Unpublished marks leak to pupils through the student subjects and goals routes, breaking the head's publishing guarantee. Fixed in `1b774ea`: one helper, `lib/schools/mark-visibility.ts`, enforces PUBLISHED for the student subjects route, the goals comparison and this dashboard's own goals oversight. A publish-window check was added to the parent marks route in the same commit and then deliberately reverted: no school has a window configured, so it would have hidden every published mark from every family. The window gates the report card; the sheet's status gates the portal. | `portal/student/me/subjects/route.ts:68-71`; `goals-meetings.ts:110-114` | Medium |
| B11 | Lesson-plan POST accepts `teachers:edit`, so REGISTRAR can author plans. | `lesson-plans/route.ts:162` | Low |
| B12 | No browser test walks submit → approve → publish, enrol, roll-up, or leave approve. Still true; `e2e/` is untouched. What did land is a unit-level guard-coverage test over every exported POST, PATCH, PUT and DELETE (`4fce301`), which is a different assurance: it says a method checks who is calling, not that the chain works. | `e2e/` | Medium |
| B13 | The office inbox had no reply action at all, for any role; the screen offered assign and close, labelled threads "Needs a reply", and had no composer. Recorded during implementation, because B5 above described it as a permission refusal. Fixed in `d26c31e`. | `messages/route.ts`; `office-inbox-content.tsx` | High |
| B14 | A report card cannot be printed unless a publish window is open for the term and class at that moment, and no seeded school has one, so `resolveReportCard` throws and the head sees an error. The window is a deliberate gate (S-1.3) but it is the only one, and it is enforced at print time rather than at publish time, so the school's own copy of a published result is unobtainable out of window. | `lib/documents/schools-sources.ts:535-552` | High |
| B15 | Fee documents recorded nothing about whether their ledger posting succeeded, so a bill could be issued or a receipt taken with no journal entry behind it and no way to find out. Recorded during implementation and now visible: each document carries its posting outcome, journal entry id and failure reason, and the backfilling migration surfaced 120 issued invoices on the seeded tenant with no ledger entry at all (`44c4460`). The head's collections and arrears reporting rests on those documents; the gaps themselves are still to be cleared. | `lib/schools/fee-posting-status.ts` | Medium |
| B16 | A teacher could read any class's mark sheet, homework board or term marks by quoting an id: the routes asked whether the role may read marks, which is true of every teacher, and never whose class the marks were. Recorded during implementation. Fixed in `50df723` with one shared ownership check over the teaching assignment. The office — SUPERADMIN, MANAGER, SCHOOL_ADMIN, REGISTRAR — reads every class deliberately, because scoping a registrar by teaching assignment scopes them to nothing. | `assessments/[id]/scores/route.ts`; `assessments/term-marks/route.ts`; `assignments/[id]/route.ts` | High |

## 6. Proposed edits

Numbers 3, 4, 5 and 6 are done, and 7 and 9 in part, in the commits named against the findings in §5; the rest stand. What was built differed from what was proposed in four places, and each difference is recorded under its item.

1. **Transactional, audited, notifying results transitions (B1).** Wrap status and moderation row in `prisma.$transaction`; write `schools.result.submitted/approved/returned/published/unpublished` audit events; notify the teacher on return and families on publish (S-9.4).
2. **Fix the HOD (B2).** Grant HOD `schools.admissions view` and `schools.fees view` so the dashboard renders; allow moderation by department (`SchoolTeacherProfile.department` matching the subject's department) as an alternative to a class assignment; pin HOD to the staff portal with a Department group (see the staff portal audit).
3. **A `schools.welfare` resource (B3)** with view for REGISTRAR, HOD, TEACHER (own classes), WARDEN, and edit for the nurse and warden; register health under `schools.students` in the route registry. Done as proposed.
4. **Register edits (B4).** Audit any PATCH of a SUBMITTED session; move `lock` to `attendance:edit`. Done, except that `lock` became a verb of its own rather than riding on `attendance:edit`: edit is what the office uses to correct a day, and a lock that rode on it could not have been withheld from anyone allowed to correct.
5. **Reminders and replies (B5).** Introduce `schools.communications` with `notify` and `reply` actions granted to SCHOOL_ADMIN, REGISTRAR, BURSAR and HOD; guard notices and messages on it instead of `reports:create`. Done, on `schools.reports` rather than a new resource: the actions are `notify-families` and `reply`, and triage — assigning a thread and ending it — deliberately stays on `create`, because deciding who answers a family is not the same act as answering them.
6. **Remove the nav item (B6)** or build an office scheme-of-work view over `GET /syllabus`. Done by the first route: the item is gone with the rest of the hand-written rail.
7. **Soft archive (B7)** via status and `isActive`; keep hard delete for records with no history behind a SUPERADMIN-only path. Done for pupils and teacher profiles. Not done for guardians, which have no archived state on the model; the delete is real and now an administrator's alone.
8. **Roll-up (B8):** persist the plan as `SchoolYearRollupRun` with rows; require a reason; provide reverse.
9. **Persona check on guardian-link PATCH (B9); PUBLISHED filter on the student routes (B10); tighten lesson-plan cover to `teachers:edit` only (B11).** The first two are done; the lesson-plan cover grant is untouched.
10. **Browser tests (B12)** for the three governance chains. Not done. The guard-coverage test was rewritten to walk methods rather than files, which is a different thing.
11. **Roadmap rows:** S-9.1 and S-9.6 to `wip` with what remains; production readiness §6 corrected.

## 7. Proposed restructuring

- **The overview becomes the head's term dashboard (S-9.1)** with one hero (present today with a ten-day trend), a queue row (registers to come in, unexplained absences, sheets awaiting moderation, window closing in N days), a second row (applications to decide, offers lapsing, boarders out tonight, allergy without consent, homework overdue, pupils with no target), and the existing "waiting on somebody" queue. Every figure links to where the work is done; "Remind the 6" replaces six buttons. Not done; the overview is the screen it was.
- **One results workspace.** Sheets, moderation and publishing are four lists of the same rows today. One list with state tabs (Draft, Submitted, Sent back, Approved, Published) and the verbs the current persona holds; publish windows configured once, in setup. Not done.
- **Admissions as a board with one likely next verb** per card and the rest behind a menu; capacity per year group in the column header. The verbs are done (`c65e58a`); the board is still a vertical list of stage groups and still carries no capacity.
- **Welfare moves out of Boarding** into a Pastoral band (health, consents, and later behaviour and safeguarding), visible to day schools. Half done: the permission and the feature key have moved, so a day school has the screen, but the rail still files it under Boarding, whose band is gated on `schools.boarding` — so the HOD and the bursar, who can now read a welfare record, cannot reach it from the sidebar.
- **Communication band** (Messages, Notices, Meetings, Calendar) owned by the office, with the persona grants above. The band exists in the generated rail, gated on `schools.reports`, and the grants are in place. Calendar sits in Setup.
- **Retire the pack spec's eight-state moderation** and the governance phase 4 "remaining gaps"; the roadmap is the ledger.

## 8. Proposed new workflows and features

None of these has been built, and the implementation work did not attempt them. Still absent as this document is revised: any channel out of the building — no email, no SMS, no WhatsApp, so a notice reaches only a family with a portal account; no password reset or self-service for portal accounts; no payment inside the portal, and no mobile-money merchant code on the tenant model, so the "how to pay" sheet shows only what it can source; no offline register; no board pack; no behaviour or pastoral module. Bulk issue, print, activate and approve have no endpoint, and the fee ledger ships only the one bulk verb the API can actually perform in a single call rather than fanning out browser requests to fake the rest.

1. **Board pack (S-9.7).** One document per term: enrolment vs capacity, attendance by year group, collections and arrears ageing, results summary by subject, boarding occupancy, staff. Generated from the existing reports through `lib/documents/`, scheduled before the board meeting.
2. **Behaviour and pastoral (un-park S-P.1).** `SchoolBehaviourEvent` (category, points, severity, sanction, witnesses, parent visibility) and `SchoolPastoralConcern` with restricted visibility. Teacher captures, head reviews, parent sees what the school allows.
3. **Absence notifications and thresholds (S-9.2).** On register submit with absences, notify guardians; attendance under a threshold for N weeks creates a follow-up task.
4. **Exam management.** `SchoolExamSession` (board, series, subject, date, room, invigilator), candidate entries with fees as invoice lines, results import for ZIMSEC and Cambridge files, certificates.
5. **Comment bank and head's comment** on report cards; parent acknowledgement recorded from the portal.
6. **Staff absence and cover today** on the dashboard from `SchoolCoverAssignment` plus a staff-absence entry for teachers without an HR record.
7. **Online application form** on the marketing host per tenant, feeding `SchoolApplication` at ENQUIRY with document upload and an application-fee invoice.
8. **Governance audit log** view on the head's dashboard: who published, who edited a submitted register, who rolled up, who allocated a bed. Two of those four now write an event — the register correction and, alongside it, a pupil or teacher archive — and nothing reads them back; publishing, roll-up and bed allocation still write nothing.
9. **Calendar and events with RSVP** and iCal for staff and families.
10. **Multi-campus** as a `SchoolCampus` entity under one company with per-campus registers, structures and staff and a group roll-up in reports, if the Group band is to be sold.

## 9. Open decisions

- Un-park behaviour and discipline? It is absent from the bands and the prototypes but present in every benchmark product and in the implementation plan.
- Should HODs moderate by department or by class assignment? Open: `hod-approve` still wants a teaching assignment on the sheet's class.
- Is welfare a boarding feature or a school feature? Settled: a school feature. It is its own resource with its own grants, and its feature key is `schools.students`, so a day school has it.
- Who publishes marks: office only, or teachers under rules? Open. A related question the implementation raised: should the publish window gate printing as well as publishing (B14)? The portal now answers no — the sheet's status gates what a family sees — and the report card still answers yes.
- Is multi-campus a real target for the roadmap, or should the Group band copy change?
