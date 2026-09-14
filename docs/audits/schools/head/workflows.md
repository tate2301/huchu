# Head dashboard: workflow audit

Surface: governance and oversight in the school workspace. Pages `app/schools/page.tsx` (overview), `admissions`, `students/**` including `roll-up`, `guardians/**`, `attendance/**`, `results/**`, `homework`, `teaching/{lessons,resources}`, `goals`, `meetings`, `boarding/**` (bed board, allocations, leave, welfare), `messages`, `notices`, `reports`. APIs under `app/api/v2/schools/{applications,enrollments,students,year-rollup,attendance,assessments,results,assignments,goals,meetings,boarding,health,notices,messages,reports}`. Personas: `SCHOOL_ADMIN` as the head, `HOD` for departmental moderation, `REGISTRAR` for admissions and records, `WARDEN` for boarding.

Audit date: 2026-09-14. Static read of `main`, cross-checked against the roadmap (S-1.4, S-1.5, S-1.2, S-1.3, S-5.2, S-5.4, S-9.1, S-9.6, S-9.7), the governance phase 4 spec, the production-readiness audit, and the K-12 benchmark §1, §5, §6, §7, §11, §16. UI companion: `ui-ux.md` in this folder.

## 1. Verdict in one paragraph

The head's office has more working machinery than the roadmap's `todo` list suggests: an admissions pipeline with a real stage machine, a reviewable year roll-up, register oversight that knows which days are school days, a four-state results chain with HOD moderation and window-gated publishing, report cards, homework and lesson oversight, boarding with gender and capacity rules, welfare records, an office inbox, and reports with real exports. It fails the head in four ways. The dashboard is the row-count page the roadmap promised to replace, and on a first morning shows zeros. Governance actions that matter (publishing marks, editing a submitted register) are not transactional and not audited, and publishing tells no family. The role model locks the wrong people out: an HOD gets 403s across the dashboard and nav, cannot send an absence reminder, and cannot moderate at all without a linked teacher profile; welfare is gated as boarding so a day school has no health records. And the whole layer above the workflows that a head runs a school on, the board pack, behaviour, exam management, staff cover, is not there.

## 2. Docs versus code

| Claim | Source | Code reality | Verdict |
|---|---|---|---|
| S-9.1 head dashboard about the term: `todo` | roadmap | `schools-dashboard-content.tsx` already has registers to come in, waiting on somebody, homework overdue, fees this term, this week, boarding. It is closer to S-9.1 than the roadmap admits, but shows "0 · 0% · —" with zero denominators and the fee panel skeleton never resolves in the capture. | Partly built; row needs `wip`. |
| S-1.4 admissions pipeline with board and duplicate detection: `done` | roadmap | Stage machine in `admissions-stages.ts:59-70`, offer lapse, duplicates, transactional enrol. The "board" is a vertical list of stage groups with up to six inline buttons per row. | True at the model; the board is a list. |
| S-1.5 year roll-up in one reviewable batch: `done` | roadmap | Plan then apply, idempotent, transactional. Plan is never stored; no reversal path; defaults do not produce a plan on first run. | True with gaps. |
| Results chain DRAFT → SUBMITTED → HOD_APPROVED → PUBLISHED with moderation rows | phase 4 spec, production readiness | Present. Transitions write status and moderation row without a transaction; no `PlatformAuditEvent`; no notification on publish. | True, fragile. |
| Pack spec: eight-state moderation with HOD_REVIEW, ADMIN_READY | pack spec | Four states shipped. | Spec stale. |
| S-5.2 report cards gated on window and PUBLISHED sheet: `done` | roadmap | `lib/documents/schools-sources.ts:492-499`. | True. |
| S-5.4 real report exports: `done` | roadmap | CSV and PDF in `reports/export/route.ts`. | True. |
| S-9.6 notice compose with audience targeting: `todo` | roadmap | `POST /notices` with audience, class or pupil shortlist and severity exists (`lib/schools/notices.ts:129-200`); `/schools/notices` composes. In-app only. | Built; row stale. What is missing is a channel, drafts, scheduling and recall. |
| S-9.7 board reporting pack: `todo` | roadmap; marketed as "Reporting for the board" | Absent. | Accurate; overclaim on the site. |
| Marketing: "Term-end reporting is a page the head opens" | site | Reports page with four tabs and exports; no term-end pack. | Overclaim. |
| Production readiness: "Transport, library, health, canteen are absent" | Aug 4 audit | First three built. | Stale. |
| Design canvas: `HeadDashboard`, `HodModeration`, `HodPublishWindows`, `WardenDashboard` | `design/campus/leadership/*` | No stories; moderation and windows exist as admin screens. | Design without stories. |
| S-6.61: classroom work removed from admin nav; the office keeps oversight | roadmap | Mostly true; the "Scheme of work" nav item redirects office users into the teacher portal and dead-ends for anyone without a teacher profile (`app/schools/academics/syllabus/page.tsx:11`; asserted in `e2e/schools-back-office-suite.spec.ts:218`). | One leftover. |

## 3. Workflow inventory

**Overview and reporting**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| H1 | Morning overview: registers to come in, waiting on somebody, homework overdue, fees, this week, boarding | Partial | Present; zero-denominator ratios render 0%; six identical "Remind" buttons and no "remind all"; day, term and year filters ignored by the fee panel; HOD sees 403s from fees, boarding and admissions panels. |
| H2 | Enrolment, occupancy, collections, arrears reports with CSV and PDF | Implemented | Ageing disagrees with the finance page (see bursar audit). |
| H3 | Board pack (enrolment, collections, arrears, attendance, results in one document) | Missing | S-9.7. |
| H4 | Ministry and exam-board returns | Missing | No model. |
| H5 | Audit of who did what across the school | Partial | Fee actions and imports audited; results transitions, register edits, admissions decisions, roll-up, bed allocation are not. |

**Admissions and roll**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| H6 | Application pipeline ENQUIRY → … → ENROLLED, offer lapse, duplicate detection, enrol | Implemented | Six stage presses to walk one applicant; no bulk decide; no online application form; no application fee or deposit invoice. |
| H7 | Waitlist and intake capacity per year group | Partial | WAITLISTED stage exists; no capacity per class in the pipeline view. |
| H8 | Student record with notes, files, custom fields, attendance, fees, health | Implemented | Health tab 403s for REGISTRAR and HOD (boarding gate). Fees tab deep link to `/schools/finance?invoice=` is dead. |
| H9 | Year roll-up: promote, repeat, graduate, transfer | Implemented | No dry-run diff stored, no reversal, no reason capture; REGISTRAR and SCHOOL_ADMIN can run it. |
| H10 | Archive, withdraw, transfer with letter | Partial | Transfer letter exists (S-5.3). DELETE routes hard-delete students, guardians and teacher profiles behind an "archive" verb (`students/[id]/route.ts:379`). |
| H11 | Alumni | Missing | GRADUATED status only. |

**Attendance**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| H12 | Register oversight: which classes have not submitted; open, edit, delete, submit, lock from the office | Implemented | Office PATCH of a SUBMITTED register refuses only LOCKED and writes no audit row (`attendance/sessions/[id]/route.ts:97`); teachers can lock their own (`lock` uses `attendance:submit`). |
| H13 | Absence follow-up list and reminders | Partial | Send requires `reports:create`; HOD and REGISTRAR cannot. The action is a notice, not a call log. |
| H14 | Absence notification to parents | Missing | S-9.2. |
| H15 | Attendance patterns, thresholds, interventions | Missing | Follow-up is a list of repeat absentees; no threshold rule, no intervention record. |
| H16 | Lesson-by-lesson registers | Missing | Session keyed by class, stream, date. |

**Results and academics**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| H17 | Assessments and term-mark roll-up per class | Implemented | Office can create assessments and roll up; teachers roll up from the portal. |
| H18 | Sheet submit → HOD approve or request changes → publish (window) → unpublish | Implemented, fragile | Not transactional; no audit event; HOD needs `isHod` plus a class assignment or gets 403; no notification to the teacher on request-changes or to families on publish. |
| H19 | Publish windows | Implemented | CRUD in two places (grading master data and results publishing). |
| H20 | Report cards with head's comment, comment bank, acknowledgement | Partial | Document renders from the published sheet; no head's comment field, no comment bank, no parent acknowledgement. |
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
| H28 | Health records, consents, events | Implemented, mis-gated | Feature `schools.boarding` and persona `schools.boarding` (`route-registry.ts:387`, `health/[studentId]/route.ts`); a day school has no welfare screen; REGISTRAR, HOD, BURSAR cannot read allergies or consents. |
| H29 | Behaviour, merits, sanctions, safeguarding concerns | Missing | Parked S-P.1. |
| H30 | Roll calls for boarders, visitor log, sanatorium medication log | Missing | |

**Communication**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| H31 | Notices with audience, severity, class or pupil shortlist | Implemented | In-app only; no draft, schedule or recall; `reports:create` so only SCHOOL_ADMIN. |
| H32 | Office inbox: threads with families, assign, close | Implemented | Reply requires `reports:create`; only SCHOOL_ADMIN can answer. |
| H33 | Staff notices, staff absence and cover today | Missing | |
| H34 | Calendar and events with RSVP | Partial | Calendar events exist; no PATCH route; no portal view; no RSVP. |

Counts: 14 implemented (3 with control gaps), 8 partial, 0 broken, 12 missing.

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
| Audit trail of governance actions | Standard | Fees only | P1 |
| Multi-campus consolidation | Sold in the Group band | No entity | P2 (decision) |

## 5. Bugs and risks

| # | Finding | Location | Severity |
|---|---|---|---|
| B1 | Results transitions write status and moderation row without a transaction and without a platform audit event; publish sends no notification. | `results/sheets/[id]/{submit,hod-approve,hod-request-changes,publish,unpublish}/route.ts` | High |
| B2 | HOD experience: no admissions, fees or boarding grants so the dashboard and nav 403; moderation needs `isHod` plus a class assignment; HOD has no portal home either. | `personas.ts:126-136`; `hod-approve/route.ts:44-58`; `proxy.ts:59-65` | High |
| B3 | Welfare gated as boarding. | `route-registry.ts:102, 387`; `health/[studentId]/route.ts` | High |
| B4 | Office can rewrite a SUBMITTED register with no audit; a teacher can lock their own. | `attendance/sessions/[id]/route.ts:97`; `lock/route.ts` | Medium |
| B5 | Absence reminders and inbox replies need `reports:create`. | `notices/route.ts:121`; `messages/route.ts:83` | Medium |
| B6 | "Scheme of work" nav item dead-ends office users in the teacher portal. | `lib/navigation.ts:343`; `app/schools/academics/syllabus/page.tsx:11` | Medium |
| B7 | Hard deletes behind "archive" for students, guardians and teacher profiles; cascades reach invoices. | `students/[id]/route.ts:379`; `guardians/[id]/route.ts:253`; `teachers/profiles/[id]/route.ts:201` | Medium |
| B8 | Roll-up has no stored plan, no reversal and no reason. | `lib/schools/year-rollup.ts` | Medium |
| B9 | `PATCH /guardian-links/[id]` has no persona check. | `guardian-links/[id]/route.ts:46-110` | Medium |
| B10 | Unpublished marks leak to pupils through the student subjects and goals routes, breaking the head's publishing guarantee. | `portal/student/me/subjects/route.ts:68-71`; `goals-meetings.ts:110-114` | Medium |
| B11 | Lesson-plan POST accepts `teachers:edit`, so REGISTRAR can author plans. | `lesson-plans/route.ts:162` | Low |
| B12 | No browser test walks submit → approve → publish, enrol, roll-up, or leave approve. | `e2e/` | Medium |

## 6. Proposed edits

1. **Transactional, audited, notifying results transitions (B1).** Wrap status and moderation row in `prisma.$transaction`; write `schools.result.submitted/approved/returned/published/unpublished` audit events; notify the teacher on return and families on publish (S-9.4).
2. **Fix the HOD (B2).** Grant HOD `schools.admissions view` and `schools.fees view` so the dashboard renders; allow moderation by department (`SchoolTeacherProfile.department` matching the subject's department) as an alternative to a class assignment; pin HOD to the staff portal with a Department group (see the staff portal audit).
3. **A `schools.welfare` resource (B3)** with view for REGISTRAR, HOD, TEACHER (own classes), WARDEN, and edit for the nurse and warden; register health under `schools.students` in the route registry.
4. **Register edits (B4).** Audit any PATCH of a SUBMITTED session; move `lock` to `attendance:edit`.
5. **Reminders and replies (B5).** Introduce `schools.communications` with `notify` and `reply` actions granted to SCHOOL_ADMIN, REGISTRAR, BURSAR and HOD; guard notices and messages on it instead of `reports:create`.
6. **Remove the nav item (B6)** or build an office scheme-of-work view over `GET /syllabus`.
7. **Soft archive (B7)** via status and `isActive`; keep hard delete for records with no history behind a SUPERADMIN-only path.
8. **Roll-up (B8):** persist the plan as `SchoolYearRollupRun` with rows; require a reason; provide reverse.
9. **Persona check on guardian-link PATCH (B9); PUBLISHED filter on the student routes (B10); tighten lesson-plan cover to `teachers:edit` only (B11).**
10. **Browser tests (B12)** for the three governance chains.
11. **Roadmap rows:** S-9.1 and S-9.6 to `wip` with what remains; production readiness §6 corrected.

## 7. Proposed restructuring

- **The overview becomes the head's term dashboard (S-9.1)** with one hero (present today with a ten-day trend), a queue row (registers to come in, unexplained absences, sheets awaiting moderation, window closing in N days), a second row (applications to decide, offers lapsing, boarders out tonight, allergy without consent, homework overdue, pupils with no target), and the existing "waiting on somebody" queue. Every figure links to where the work is done; "Remind the 6" replaces six buttons.
- **One results workspace.** Sheets, moderation and publishing are four lists of the same rows today. One list with state tabs (Draft, Submitted, Sent back, Approved, Published) and the verbs the current persona holds; publish windows configured once, in setup.
- **Admissions as a board with one likely next verb** per card and the rest behind a menu; capacity per year group in the column header.
- **Welfare moves out of Boarding** into a Pastoral band (health, consents, and later behaviour and safeguarding), visible to day schools.
- **Communication band** (Messages, Notices, Meetings, Calendar) owned by the office, with the persona grants above.
- **Retire the pack spec's eight-state moderation** and the governance phase 4 "remaining gaps"; the roadmap is the ledger.

## 8. Proposed new workflows and features

1. **Board pack (S-9.7).** One document per term: enrolment vs capacity, attendance by year group, collections and arrears ageing, results summary by subject, boarding occupancy, staff. Generated from the existing reports through `lib/documents/`, scheduled before the board meeting.
2. **Behaviour and pastoral (un-park S-P.1).** `SchoolBehaviourEvent` (category, points, severity, sanction, witnesses, parent visibility) and `SchoolPastoralConcern` with restricted visibility. Teacher captures, head reviews, parent sees what the school allows.
3. **Absence notifications and thresholds (S-9.2).** On register submit with absences, notify guardians; attendance under a threshold for N weeks creates a follow-up task.
4. **Exam management.** `SchoolExamSession` (board, series, subject, date, room, invigilator), candidate entries with fees as invoice lines, results import for ZIMSEC and Cambridge files, certificates.
5. **Comment bank and head's comment** on report cards; parent acknowledgement recorded from the portal.
6. **Staff absence and cover today** on the dashboard from `SchoolCoverAssignment` plus a staff-absence entry for teachers without an HR record.
7. **Online application form** on the marketing host per tenant, feeding `SchoolApplication` at ENQUIRY with document upload and an application-fee invoice.
8. **Governance audit log** view on the head's dashboard: who published, who edited a submitted register, who rolled up, who allocated a bed.
9. **Calendar and events with RSVP** and iCal for staff and families.
10. **Multi-campus** as a `SchoolCampus` entity under one company with per-campus registers, structures and staff and a group roll-up in reports, if the Group band is to be sold.

## 9. Open decisions

- Un-park behaviour and discipline? It is absent from the bands and the prototypes but present in every benchmark product and in the implementation plan.
- Should HODs moderate by department or by class assignment?
- Is welfare a boarding feature or a school feature?
- Who publishes marks: office only, or teachers under rules?
- Is multi-campus a real target for the roadmap, or should the Group band copy change?
