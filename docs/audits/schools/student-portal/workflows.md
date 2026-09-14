# Student portal: workflow audit

Surface: `students.<tenant>` host, routed to `app/portal/student/**`, backed by `app/api/v2/schools/portal/student/**`, `lib/schools/student-day-loader.ts`, and the shared routes `/api/v2/schools/assignments`, `/api/v2/schools/goals`, `/api/notifications`. Audience: pupils with `SchoolStudent.userId` linked to a `User` of role `STUDENT`.

Audit date: 2026-09-14. Method: static read of the code on `main`, cross-checked against the roadmap in `docs/expansion-plan/schools-roadmap.md`, the prototype contract `docs/design-system/portals/student.html`, and the K-12 benchmark in `../reference/k12-benchmark.md`. Companion UI/UX document: `ui-ux.md` in this folder.

## 1. Verdict in one paragraph

The student portal does what its twelve `done` stories claim: a pupil sees today's periods, the week's timetable, published marks with movement against last term, homework with a hand-in flow, per-subject goals, a self-service library, and a notification inbox. Identity is scoped to the signed-in pupil with hard 403s. Two things undercut it. First, unpublished marks leak through the subjects and goals routes, which contradicts the whole moderation and publishing chain. Second, the sign-in and account story the prototype promises (student ID plus PIN, forgotten PIN, biometrics, theme, notification cadence) does not exist, and the settings screen links to a password page the proxy bounces back. Homework hand-in is text or a pasted link, not a file. The portal is honest about what is not built, which is to its credit, but five roadmap stories remain open and several prototype screens have no story at all.

## Runtime check (14 September 2026)

Verified on the seeded St Marys tenant as `student@stmarys.test` (see `../reference/runtime-verification.md`). B1 confirmed at runtime: after the head rolled term marks into a DRAFT sheet, `/me/subjects` returned a `currentMark` for 13 of 13 subjects while `/me/results` returned zero published lines. B2 confirmed: the password link lands back on the portal home. The library, homework and goals screens rendered as described.

## 2. Docs versus code

| Claim | Source | Code reality | Verdict |
|---|---|---|---|
| S-6.22 timetable today and week, S-6.23 open a class: `done` | roadmap | `student-timetable-screen.tsx`, `me/timetable`. | True. |
| S-6.24 assignment list with filters, S-6.25 hand in with handed-in state: `done` | roadmap | `student-homework-screen.tsx:156-191` posts `{action:"submit"}` with text and `attachmentUrl`. No file upload. LATE is recorded, not refused. | True as coded; the prototype's "attach" is a URL field. |
| S-6.26 marks for the term: `done` | roadmap | `me/results` filters `PUBLISHED`. | True. |
| S-6.28 to S-6.30 library browse, borrow, return, scan, renew, reserve: `done` | roadmap | `me/library` GET/POST. A pupil can create a loan from the phone with `issuedById` set to the pupil, with no librarian step. | True; integrity question noted in §5. |
| S-6.32 goals: `done` | roadmap | `student-goals-screen.tsx` over `/api/v2/schools/goals`. `goalsForStudent` reads result lines with no sheet-status filter. | True, with a leak. |
| S-6.34 profile edit and theme: `done` | roadmap | Profile is read-only with "who owns each field"; settings says theme is "not here yet" (`student-settings-screen.tsx:79-84`). | **Story marked done, not built.** |
| S-6.35 help with helpfulness feedback: `done` | roadmap | Static FAQ. No feedback control found. | Partly built. |
| S-6.36 own mobile shell: `done` | roadmap | `student-portal-shell.tsx`, four tabs. | True. |
| S-6.20/21 PIN sign-in and recovery, S-6.27 report card, S-6.31 fines payment, S-6.33 cadence: `todo` | roadmap | Absent. Login is email + password. | Accurate. |
| Prototype: Messages row on profile, first-run tour, signed-out screen, biometric option | `student.html` | Absent; no story. | Contract gap not tracked. |
| Profile copy: Settings has "Alerts, theme and your PIN" | `student-profile-screen.tsx:37` | None of the three exist. | Copy contradicts behaviour. |
| Help copy: only published marks are shown | `student-help-screen.tsx:23-29` | True for the Marks screen, false for Goals. | Copy contradicts behaviour on one screen. |

## 3. Workflow inventory

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| S1 | Get an account (invite, claim, set password) | Implemented | Same invite engine as parents; token handed over by hand. |
| S2 | Sign in (email + password) | Implemented | Prototype wants student ID + PIN. |
| S3 | Forgot password / change password | Broken | Settings links `/settings/profile`; `proxy.ts:469-479` redirects any STUDENT request outside `/portal/student` back to the portal. No reset route for pupils. |
| S4 | Home: today's periods, next class | Implemented | `student-day-loader.ts`. |
| S5 | Timetable day and week; open a class | Implemented | |
| S6 | Homework list with filters | Implemented | Published assignments for the pupil's class or stream. |
| S7 | Hand in homework | Partial | Text and URL only; can resubmit until marked; no file upload; no teacher feedback thread (API supports `feedback` and `sendBack`, UI shows score only). |
| S8 | Marks for the term with delta | Implemented | PUBLISHED only. |
| S9 | Report card download | Missing | S-6.27 `todo`; document source exists (`schools.report-card`) but STUDENT cannot call the render route. |
| S10 | Goals per subject | Implemented | Leaks unpublished current mark (§5). |
| S11 | Library: browse, borrow, return, scan, renew, reserve | Implemented | Self-issue without a librarian. |
| S12 | Pay a library fine | Missing | S-6.31 depends on S-7.3. |
| S13 | Notifications inbox, mark read, archive | Implemented | Generic `/api/notifications`. Nothing school-side emits to a pupil except notices. |
| S14 | Notification cadence and quiet hours | Missing | S-6.33 depends on S-9.5. |
| S15 | Profile view | Implemented | Read-only by design. |
| S16 | Edit profile, theme | Missing | S-6.34 wrongly `done`. |
| S17 | Help centre | Implemented | Static. No "did this help" control. |
| S18 | Messages with teachers | Missing | Prototype profile row; no story. |
| S19 | Learning resources / materials | Missing | `teaching-resources` GET needs `schools.academics view`; STUDENT lacks it. |
| S20 | Exam timetable | Missing | Only `SchoolCalendarEventKind.EXAM`. |
| S21 | Attendance view (own) | Missing | Data exists per student; no student route. |
| S22 | Fees view (own balance) | Missing | Legacy aggregate returns invoices; new shell has no screen. Product decision: many schools do not show fees to pupils. |
| S23 | Boarding leave request | Missing | `SchoolLeaveRequest` create requires `boarding:approve-leave`; boarders cannot request from the portal. |
| S24 | Report a concern / wellbeing | Missing | No model. |
| S25 | Clubs, sport, houses | Missing | No model. |
| S26 | Sign out | Implemented | |

Counts: 11 implemented, 1 partial, 1 broken, 13 missing.

## 4. Benchmark gap

Graded against `../reference/k12-benchmark.md` §17, §19, §13.

| Capability | Benchmark norm | Huchu today | Priority |
|---|---|---|---|
| Assignment submission with file upload and teacher feedback | Standard | Text/link, score only | P1 |
| Learning materials per subject | Standard | Absent for pupils | P1 |
| Own attendance summary | Standard | Absent | P2 |
| Report card in app | Standard | Absent (S-6.27) | P1 |
| Exam timetable and seat | Common | Absent | P2 |
| Messages to teacher | Common | Absent | P2 |
| Simple sign-in for younger pupils (ID + PIN) | Common | Absent | P1 |
| Boarding leave request by the boarder | Common in boarding schools | Absent | P2 |
| Wellbeing / report a concern | Increasingly standard | Absent | P2 |
| Library self-service | Common | Present, arguably too permissive | Done |
| Goals and progress | Uncommon; a differentiator | Present | Done |

## 5. Bugs and risks

| # | Finding | Location | Severity |
|---|---|---|---|
| B1 | Security and correctness: unpublished marks visible to pupils. `currentMark` in `me/subjects` reads result lines for the term with no `sheet.status = PUBLISHED` filter; `goalsForStudent` does the same. A DRAFT or HOD_REJECTED mark shows on Goals. | `app/api/v2/schools/portal/student/me/subjects/route.ts:68-71`; `lib/schools/goals-meetings.ts:110-114` | Medium |
| B2 | Dead "Change your password" link. | `components/schools/portal/student/student-settings-screen.tsx:44`; `proxy.ts:469-479` | Medium |
| B3 | Copy promises PIN, alerts and theme that do not exist. | `student-profile-screen.tsx:37` | Low |
| B4 | Library self-issue: a pupil creates a loan against a copy with no librarian confirmation, moving stock in the system. | `me/library/route.ts:210-233` | Low |
| B5 | Legacy aggregate `GET /api/v2/schools/portal/student` returns guardians' phone and email to the pupil and is unused by the shell. Delete. | `app/api/v2/portal/_handlers.ts:365-560` | Low |
| B6 | No audit trail for hand-ins, loans or goal edits. | `lib/schools/audit.ts` | Low |
| B7 | Roadmap row S-6.34 marked `done` for work not present. | `docs/expansion-plan/schools-roadmap.md` | Doc |

## 6. Proposed edits

1. **Fix B1 now.** Add `sheet: { status: "PUBLISHED" }` to both queries and a test in `goals-meetings.test.ts` that a DRAFT line does not surface. This is a one-line change that restores the publishing guarantee.
2. **Give pupils a password path.** Either build a portal-local "change password" under `/portal/student/settings` or remove the link and add the "ask the office" copy the teacher portal already uses.
3. **Correct copy** on the profile screen (B3) and the roadmap row S-6.34.
4. **Homework feedback.** The API already carries `feedback` and `sendBack`; show them on the hand-in card so the pupil sees why work came back.
5. **Library issue confirmation.** Make a pupil's borrow a `RESERVED_FOR_PICKUP` state that the librarian confirms at the desk, or keep self-issue but mark it visibly as "collect from the library" until scanned.
6. **Delete the legacy aggregate route** (B5).

## 7. Proposed restructuring

- **Sign-in.** Replace email + password with student number + PIN for the student host (S-6.20/21). Store the PIN as a bcrypt hash on the linked `User`; add a "forgotten PIN" that the class teacher or office resets from the student record. This is the biggest usability win for younger pupils and shared devices.
- **Home should lead with what is due.** The prototype's home has "Your next class", "This week" KPIs (homework to hand in, latest mark), and recent marks. The code's home is today's periods only. Add the homework-due count and the latest published mark to Home.
- **Merge Notifications and school news.** Notices arrive through the generic inbox; the prototype shows a "School news" banner on Home. One inbox with a Home teaser is enough.
- **Settings is the right place for account, alerts, appearance, privacy** (prototype's five groups). Keep the honest "not here yet" rows until each lands, but wire the two that are trivially available: browser push preference (already exists for teachers) and reduced motion.

## 8. Proposed new workflows and features

1. **Report card in the portal (S-6.27).** Reuse `schools.report-card` with a student-scoped render branch (same fix as the parent download, see parent audit B1).
2. **File upload on hand-in.** `lib/uploads/` and the record files engine exist (S-4.2). Add `SchoolAssignmentSubmission.fileId` and accept an upload from the phone camera.
3. **Learning materials.** A student-scoped read of `SchoolTeachingResource` filtered to the pupil's class subjects and `sharedWithPupils = true`.
4. **Own attendance** over `students/[id]/attendance` with the portal resolver.
5. **Messages to teachers** once S-7.1 lands; pupil to subject teacher only, visible to the office.
6. **Boarding leave request by the boarder**, parent-approved, warden-actioned; reuses `SchoolLeaveRequest` with a new `REQUESTED_BY_STUDENT` origin.
7. **Exam timetable** as a first-class `SchoolExamSession` with room and seat, surfaced in the timetable tab during exam weeks.
8. **Report a concern** (wellbeing) to a named staff role with restricted visibility. Sits with the parked behaviour/discipline decision.
9. **Fine payment** rides on S-7.3.

## 9. Open decisions

- Should pupils ever see fee balances? The legacy aggregate exposes invoices; the new shell does not. Decide and delete the other path.
- Self-issue library loans: allowed, or reserve-then-confirm?
- Is the student host meant for primary pupils (PIN, no email) as well as secondary?
