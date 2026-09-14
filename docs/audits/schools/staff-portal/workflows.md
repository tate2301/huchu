# Staff (teacher) portal: workflow audit

Surface: `staff.<tenant>` host, routed to `app/portal/teacher/**`, backed by `app/api/v2/schools/portal/teacher/**`, `lib/schools/teacher-day-loader.ts`, `teacher-day.ts`, `teacher-reports.ts`, and the shared routes under `/api/v2/schools/{assessments,assignments,meetings,notices,syllabus,teaching-resources}`. Audience: staff with a `SchoolTeacherProfile` whose `userId` is the signed-in `User` of role `TEACHER` (HOD and WARDEN have no portal home today).

Audit date: 2026-09-14. Method: static read of the code on `main`, cross-checked against the roadmap, the prototype `docs/design-system/portals/teacher.html`, and the K-12 benchmark. Companion UI/UX document: `ui-ux.md` in this folder.

Note on naming: the docs call this the teacher portal; the user's brief calls it the staff portal. The host prefix is `staff.` (`lib/platform/portal-hosts.ts:29-34`), which is the better name, because non-teaching staff, HODs and wardens will need a home too. This document uses "staff portal" for the surface and "teacher" for the persona.

## 1. Verdict in one paragraph

The staff portal is the most complete of the three portals and the roadmap's own priority. Today, register capture, assessment marks, marks book with roll-up, homework authoring and marking, lesson planning with copy-forward, timetable with cover shown, link-only resources, reports, meetings, and message replies all work and are scoped to the teacher's own assignments. It fails its user in four places that matter daily. A register saved here never leaves DRAFT because there is no submit, so the office board and the parent app both show every class as unsubmitted. Two prototype actions (open a parents' evening, "tell the family" from reports) always 403 because the TEACHER persona lacks the grant the shared route checks. The result-sheet chain after roll-up (submit, HOD moderation, publish, edits after rejection) lives only in the admin workspace, so a teacher cannot see where their marks are or why they came back. And the term-marks roll-up route is permission-checked but not ownership-checked, so a teacher can roll up any class. Eight stories are open; three of them (messaging, custom columns, publish to parents) are the ones teachers ask for first.

## Runtime check (14 September 2026)

Verified on the seeded St Marys tenant as `wellington.mabika@stmarys.test` (role TEACHER, Business Studies and Physics, see `../reference/runtime-verification.md`). Confirmed at runtime: B1 (saving a 20-pupil register returns a session with status DRAFT and the screen has no submit control), B2 (`POST /meetings` returns 403 "Your role cannot edit students"), B3 (`POST /notices` returns 403 "Your role cannot create reports"), B4 (term marks and assessments for a class this teacher does not teach return 200), and the absence of any start-thread or broadcast control on Messages. Inconclusive: the bell badge (this teacher had no papers to mark).

## 2. Docs versus code

| Claim | Source | Code reality | Verdict |
|---|---|---|---|
| S-6.41 register with mark-all and per-pupil override: `done` | roadmap | Save works (`me/attendance`). No submit; session stays DRAFT (`route.ts:106-118`). Only the office can submit or lock. | Half the workflow. The acceptance signal never mentions submit, which is how it passed. |
| S-6.43 gradebook cell by cell with autosave: `done` | roadmap | `teacher-marks-screen.tsx` saves scores per assessment; cannot create an assessment from the portal. | True with a gap. |
| S-6.45 papers-to-mark queue: `done` | roadmap | Present on Today and Homework. | True. |
| S-6.56 parent meetings: `done` | roadmap | Read works; open evening and release slot POST to `/api/v2/schools/meetings` which requires `schools.students edit`. TEACHER holds `view` only. | **Marked done, mutations broken.** |
| S-6.57 teacher reports: `done` | roadmap | Report loads; "tell the family" posts to `/notices` which requires `schools.reports create`. TEACHER has no reports grant. | **Marked done, action broken.** |
| S-6.58 five settings panels: `done` | roadmap | Two preferences work; everything else is `NotYetAvailable` (`teacher-settings-screen.tsx:85-108, 384-410`). | Honest UI, wrong roadmap status. |
| S-6.47 parent message threads: `todo` | roadmap | `/portal/teacher/messages` exists with reply; no start-thread UI. Settings copy still says messaging is not built (`:283`). | More built than the row says; copy stale. |
| S-6.55 resource library with upload: `done` | roadmap | Links only; upload "arrives with the documents work" (`teacher-files-screen.tsx:404-408`). | **Marked done, upload absent.** |
| S-6.53 cover lessons: `todo` | roadmap | Cover is shown on the timetable; arranging cover is office-only by design (`me/lessons/route.ts:318-321`). | Accurate. |
| S-6.42 attendance history, S-6.44 custom columns, S-6.46 publish to parents, S-6.48/49 quick replies and broadcast, S-6.59 shared-device lock: `todo` | roadmap | Absent. | Accurate. |
| Prototype: 14-item rail including Messages with unread count, Marks book at-risk, Reports cohort analytics, Security with 2FA and sign-out-all, Privacy with export and audit | `teacher.html` | Rail has the items; several panels are placeholders. | Partial parity. |
| Help copy: "Access to pupil records is written to an audit trail" | `teacher-help-screen.tsx:222-228` | No portal route writes an audit row. | Copy contradicts behaviour. |
| `live-capabilities.md`: teacher portal is "attendance visibility, marks visibility" | system reference | Capture and entry both exist. | Stale doc. |

## 3. Workflow inventory

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| T1 | Get an account | Partial | No invite flow for teachers; office creates a `User` and a `SchoolTeacherProfile` with `userId`. Optional HR link via `teacher-identity.ts`. |
| T2 | Sign in; shared-device sign-out; idle lock | Partial | Password sign-in works. Shared-device and auto-lock are `NotYetAvailable`. |
| T3 | Today: lessons, right now / next, unmarked registers, marking pile | Implemented | `me/today`. |
| T4 | Take the register | Partial | Save to DRAFT only. No submit, no lock, no per-lesson register (keyed by class, stream, date), no offline queue. |
| T5 | Attendance history | Missing | S-6.42. |
| T6 | Create an assessment | Missing in portal | `POST /assessments` allows TEACHER; no UI. Assessments are created in the admin class-results screen. |
| T7 | Enter marks for an assessment | Implemented | Absent flag supported. |
| T8 | Marks book: term marks, roll up to sheet | Implemented | Roll-up not scoped to own class (§5). |
| T9 | Submit sheet, see HOD comments, fix after rejection, see publish state | Missing in portal | Routes exist under `/results/sheets/[id]/*` and are called only from admin screens. `me/marks` (edit after HOD_REJECTED) has no caller. |
| T10 | Custom assessment column | Missing | S-6.44. |
| T11 | Publish marks to parents under the school's rules | Missing | S-6.46; publishing is SCHOOL_ADMIN only and window-gated. |
| T12 | Report-card comments, comment bank | Missing | `SchoolResultLine.remarks` writable via `me/marks`; no UI. |
| T13 | Set homework, publish, withdraw, mark | Implemented | Feedback text and send-back supported by API, not by the screen. |
| T14 | Lesson plans, lay out week, copy last week | Implemented | |
| T15 | Scheme of work | Read-only by design | Write needs `academics edit` (HOD or office). |
| T16 | Resources: browse, add link, upload file | Partial | Links only. |
| T17 | Timetable week with cover shown | Implemented | |
| T18 | Request cover / report absence | Missing | Office arranges cover. |
| T19 | Messages: reply to a family | Implemented | Office queue (`teacherProfileId: null`) visible to every teacher. |
| T20 | Messages: start a thread, quick replies, class broadcast, attachments | Missing | API `start` exists; no UI. S-6.48/49 and S-7.1. |
| T21 | Reports: attendance rate, marks distribution, homework rate, trend, at-risk | Implemented | |
| T22 | Reports: "tell the family" | Broken | 403 (`notices/route.ts:121` vs `personas.ts:137-142`). |
| T23 | Parents' evening: view slots and bookings | Implemented | |
| T24 | Parents' evening: open evening, release slot | Broken | 403 (`meetings/route.ts:93` vs `personas.ts:139`). |
| T25 | Profile | Implemented | Read-only with field ownership shown. |
| T26 | Settings: notifications, publishing rules, appearance, security, privacy | Partial | Two toggles work; rest `NotYetAvailable`. |
| T27 | Help | Implemented | One false claim (audit trail). |
| T28 | Behaviour incidents, merits | Missing | Parked S-P.1. |
| T29 | Seating plans, pupil notes, medical alerts in the register | Missing | Health data exists but the register roll does not show allergy or medical flags. |
| T30 | Leave requests, payslips, staff notices (non-teaching staff needs) | Missing | HR module has leave; no bridge for staff without an `Employee` link. |
| T31 | HOD moderation queue in the portal | Missing | HOD is not pinned to any portal (`proxy.ts:59-65`); moderation lives in admin. |

Counts: 11 implemented, 5 partial, 2 broken, 13 missing.

## 4. Benchmark gap

Graded against `../reference/k12-benchmark.md` §5, §6, §8, §10.

| Capability | Benchmark norm | Huchu today | Priority |
|---|---|---|---|
| Register: take, submit, lock; lesson-by-lesson option; medical flags on the roll | Standard | Save only; no flags | P0 |
| Gradebook with weighting, custom columns, import from sheet | Standard | Fixed assessments from office; no columns | P1 |
| Visible mark-sheet status and HOD feedback | Standard | Absent from the portal | P0 |
| Report-card comments with comment bank | Standard | Absent | P1 |
| Two-way messaging with parents, class broadcast | Standard | Reply only | P1 |
| Behaviour and merits | Standard | Parked | P2 (decision) |
| Cover request and staff absence | Common | Absent | P2 |
| Resource upload | Standard | Link only | P1 |
| Offline register | Standard in low-connectivity markets; sold on the site | Absent | P1 |
| Shared-device safety (idle lock, sign out everywhere) | Common | Absent | P2 |
| Own timetable, lesson plans, copy forward | Standard | Present | Done |
| Cohort analytics for the teacher | Uncommon; differentiator | Present | Done |

## 5. Bugs and risks

| # | Finding | Location | Severity |
|---|---|---|---|
| B1 | Register never leaves DRAFT from the portal. No submit control; `me/attendance` only upserts DRAFT. Office board and parent app both read "not submitted". | `app/api/v2/schools/portal/teacher/me/attendance/route.ts:106-118`; `teacher-register-screen.tsx` | High |
| B2 | Parents' evening open and release always 403 for TEACHER. | `teacher-meetings-screen.tsx:205-260`; `meetings/route.ts:93`; `personas.ts:139` | High |
| B3 | Reports "tell the family" always 403 for TEACHER. | `teacher-reports-screen.tsx:232-247`; `notices/route.ts:121`; `personas.ts:137-142` | High |
| B4 | Security: term-marks roll-up and read are permission-checked but not ownership-checked; a teacher can create a DRAFT sheet for a colleague's class and read any class's term marks. Same for `GET /assessments/[id]/scores` and `GET /assignments/[id]`. | `assessments/term-marks/route.ts:41-100`; `assessments/[id]/scores/route.ts:48-100`; `assignments/[id]/route.ts:55-63` | Medium |
| B5 | Security and privacy: every teacher can read every office-addressed parent thread, and can start a thread with any guardian in the school, not only guardians of pupils taught. | `lib/schools/messages.ts:133-149, 201-210`; `me/messages/route.ts:98-110` | Medium |
| B6 | A teacher can lock their own register (`lock` is guarded by `attendance:submit`, which TEACHER holds), defeating lock as oversight. | `attendance/sessions/[id]/lock/route.ts` | Low |
| B7 | Stale copy: settings says parent messaging is not built while the Messages screen exists. | `teacher-settings-screen.tsx:283` | Low |
| B8 | Dead API surface: `me/marks` and `handleTeacherPortalGet` have no caller. | `app/api/v2/schools/portal/teacher/me/marks/route.ts`; `app/api/v2/portal/_handlers.ts` | Low |
| B9 | HOD cannot reach the portal; `PORTAL_HOME_BY_ROLE` has no HOD entry and moderation additionally needs an `isHod` teacher profile with a class assignment. | `proxy.ts:59-65`; `results/sheets/[id]/hod-approve/route.ts:44-58` | Medium |
| B10 | Service worker sits in front of `/api/v2` on installed PWAs; e2e blocks it to get the portal past the skeleton. | `public/sw.js`; `e2e/teacher-portal-shots.spec.ts:30-35` | Medium |
| B11 | Help promises an audit trail that no portal route writes. | `teacher-help-screen.tsx:222-228`; `lib/schools/audit.ts` | Low |
| B12 | Roadmap rows S-6.55, S-6.56, S-6.57, S-6.58 marked `done` with parts missing or broken. | roadmap | Doc |

## 6. Proposed edits

1. **Add "Submit register" (B1).** A second button after save that calls the existing `/attendance/sessions/[id]/submit`; keep save-as-draft for partial entry. Show the state chip (Draft, Submitted, Locked) on the register and on Today's "unmarked" list. Move `lock` to `attendance:edit` (B6).
2. **Fix the two 403s (B2, B3) at the persona, not the button.** Add to TEACHER: `schools.students` action `book-meeting` (new verb, narrower than `edit`) and `schools.reports` action `notify-family` (new verb, narrower than `create`), then guard `POST /meetings` (open, release, book) and the family-notice path on those. Blanket `edit` and `create` would let a teacher edit pupils and write school-wide notices.
3. **Scope the roll-up and reads (B4).** Reuse the `ownedClassSubject` check from `me/lessons/route.ts:96-113` in `term-marks`, `scores` GET and `assignments/[id]` GET for non-moderators.
4. **Narrow message visibility (B5).** Office-queue threads visible only to the class teacher of the child named and to office roles; `start` restricted to guardians of pupils in the teacher's class subjects.
5. **Surface sheet status in the marks book.** After roll-up show Draft / Submitted / Sent back with HOD note / Approved / Published, with Submit and Fix-and-resubmit calling the existing sheet routes and `me/marks`. This closes T9 without new backend work.
6. **Delete dead handlers (B8)**, fix copy (B7, B11), correct roadmap rows (B12).
7. **Scope the service worker (B10)** to the marketing and static routes, or register it only on the tenant workspace, until offline is designed.

## 7. Proposed restructuring

- **Rename the portal "Staff" in code and docs** to match the host and make room for HOD, warden and non-teaching staff homes. Route stays `/portal/teacher` until a migration is worth it, but the shell's role switch should not assume every user teaches.
- **HOD mode in the staff portal.** An HOD is a teacher with extra duties. Pin HOD to the staff portal, add a "Department" group to the rail with the moderation queue (reuse `moderation-queue-content.tsx` logic behind `me/department/sheets`) and the scheme-of-work editor the teacher screen already renders read-only. This removes the need for HODs to use the admin workspace.
- **Rail grouping.** The prototype groups Daily work (Today, Attendance, Enter marks, Marks book, Messages, Timetable), More (Lesson plans, Homework, Shared files, Reports, Meetings), Account. Keep it, but put an unread badge on Messages and a "to submit" count on Attendance.
- **Register keyed by lesson, not by day.** `SchoolAttendanceSession` is keyed by class, stream and date. Secondary schools take a register per period; the prototype's register screen is "Form 2A · Mathematics". Add an optional `timetableSlotId` to the session so subject registers are possible without breaking day registers.
- **Marks entry and Marks book are one screen** with a column picker, not two rail items, once S-6.44 lands.

## 8. Proposed new workflows and features

1. **Result-sheet lifecycle in the portal** (T9): status, HOD note, resubmit; notification to the teacher on HOD action.
2. **Custom assessment columns and weighting (S-6.44)** with the school's scheme as the default and a per-column override.
3. **Comment bank and report-card comments (T12)**: `SchoolCommentBank` per subject and grade band; comments written into `SchoolResultLine.remarks` before submit; head's comment at publish.
4. **Messaging (S-7.1, S-6.47 to 49)**: start thread with a family from the register or marks book, class broadcast, quick replies, attachment via `lib/uploads/`.
5. **Resource upload (T16)** through the record files engine.
6. **Offline register (S-8.1)**: register the staff portal in `lib/offline/module-registry.ts`; outbox the submit; resolve duplicates on `(classId, streamId, date)`.
7. **Medical and safeguarding flags on the roll (T29)** from `SchoolHealthRecord` (allergy, urgent gap) with restricted detail.
8. **Cover request and staff absence (T18)**: teacher reports absence with dates; office arranges cover using the existing `SchoolCoverAssignment`; the covering teacher sees the lesson plan.
9. **Behaviour and merits** if S-P.1 is un-parked: `SchoolBehaviourEvent` with category, points, sanction, parent visibility.
10. **Shared-device safety (S-6.59)**: idle lock and sign out everywhere, using the session list the parent stories also need.

## 9. Open decisions

- Is the register per day or per lesson? The model says day; the prototype says lesson. Decide before offline work fixes the key.
- Who publishes marks to parents: the teacher under rules (S-6.46) or only the office (today)? The prototype has "Send marks to parents"; the roadmap says publishing is admin work.
- Do HODs get a portal home, or stay in the admin workspace?
- Un-park behaviour and merits? Every teacher-facing benchmark product has it.
