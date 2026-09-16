# Student portal: workflow audit

Surface: `students.<tenant>` host, routed to `app/portal/student/**`, backed by `app/api/v2/schools/portal/student/**`, `lib/schools/student-day-loader.ts`, and the shared routes `/api/v2/schools/assignments`, `/api/v2/schools/goals`, `/api/notifications`. Audience: pupils with `SchoolStudent.userId` linked to a `User` of role `STUDENT`.

Audit date: 2026-09-14. Method: static read of the code on `main`, cross-checked against the roadmap in `docs/expansion-plan/schools-roadmap.md`, the prototype contract `docs/design-system/portals/student.html`, and the K-12 benchmark in `../reference/k12-benchmark.md`. Companion UI/UX document: `ui-ux.md` in this folder.

## 1. Verdict in one paragraph

The student portal does what its twelve `done` stories claim: a pupil sees today's periods, the week's timetable, published marks with movement against last term, homework with a hand-in flow, per-subject goals, a self-service library, and a notification inbox. Identity is scoped to the signed-in pupil with hard 403s. Two things undercut it. First, unpublished marks leak through the subjects and goals routes, which contradicts the whole moderation and publishing chain. Second, the sign-in and account story the prototype promises (student ID plus PIN, forgotten PIN, biometrics, theme, notification cadence) does not exist, and the settings screen links to a password page the proxy bounces back. Homework hand-in is text or a pasted link, not a file. The portal is honest about what is not built, which is to its credit, but five roadmap stories remain open and several prototype screens have no story at all.

The first of those two is now closed. One helper enforces `PUBLISHED` for the subjects route, the goals comparison and the head's oversight of the same lines, so a mark a teacher has merely typed reaches nobody (`1b774ea`); the Help screen's promise that only published marks are shown is true on every screen for the first time. The second stands: sign-in is still email and password, there is still no reset for a pupil, and the prototype's PIN, biometrics, theme and cadence are still unbuilt — what changed is that the portal no longer names them. The settings alert explaining what the product cannot do yet and the password link the proxy bounced are gone (`4a83f7e`). Homework hand-in is untouched: text or a pasted link, no file, no thread. Five roadmap stories remain open, and to them should be added a fault the audit did not see: a report card can only be printed while a publish window is open, and no school has one, so the render route that now admits a pupil by record would throw anyway (B8).

## Runtime check (14 September 2026)

Verified on the seeded St Marys tenant as `student@stmarys.test` (see `../reference/runtime-verification.md`). B1 confirmed at runtime: after the head rolled term marks into a DRAFT sheet, `/me/subjects` returned a `currentMark` for 13 of 13 subjects while `/me/results` returned zero published lines. B2 confirmed: the password link lands back on the portal home. The library, homework and goals screens rendered as described.

Revised on 15 September 2026 against the eighteen commits that followed the audit (`01de8a3..HEAD`). A finding the work closed keeps its description and gains a line saying it is closed and what closed it; a finding the work did not reach stands as it was written; a finding the implementation proved wrong says so and says what is actually true.

## 2. Docs versus code

| Claim | Source | Code reality | Verdict |
|---|---|---|---|
| S-6.22 timetable today and week, S-6.23 open a class: `done` | roadmap | `student-timetable-screen.tsx`, `me/timetable`. | True. |
| S-6.24 assignment list with filters, S-6.25 hand in with handed-in state: `done` | roadmap | `student-homework-screen.tsx:156-191` posts `{action:"submit"}` with text and `attachmentUrl`. No file upload. LATE is recorded, not refused. | True as coded; the prototype's "attach" is a URL field. |
| S-6.26 marks for the term: `done` | roadmap | `me/results` filters `PUBLISHED`. | True. |
| S-6.28 to S-6.30 library browse, borrow, return, scan, renew, reserve: `done` | roadmap | `me/library` GET/POST. A pupil can create a loan from the phone with `issuedById` set to the pupil, with no librarian step. | True; integrity question noted in §5. |
| S-6.32 goals: `done` | roadmap | `student-goals-screen.tsx` over `/api/v2/schools/goals`. `goalsForStudent` reads result lines with no sheet-status filter. Fixed in `1b774ea`: the comparison mark comes from `lib/schools/mark-visibility.ts`, which reads published sheets only. | True; the leak is closed. |
| S-6.34 profile edit and theme: `done` | roadmap | Profile is read-only with "who owns each field"; settings says theme is "not here yet" (`student-settings-screen.tsx:79-84`). Neither is built now either. What changed in `4a83f7e` is that the screens stop saying so: the profile card states the record once and names who changes it, and settings draws only the two rows that keep a setting. | **Story marked done, not built.** |
| S-6.35 help with helpfulness feedback: `done` | roadmap | Static FAQ. No feedback control found. Still none; the office row beneath it is now a real `tel:` and `mailto:` from the tenant's contact details (`4a83f7e`). | Partly built. |
| S-6.36 own mobile shell: `done` | roadmap | `student-portal-shell.tsx`, four tabs. Since revised: a back target on every non-tab route, a side rail above 900px, a counted bell and a slot each screen puts its own bar action in (`4a83f7e`). | True. |
| S-6.20/21 PIN sign-in and recovery, S-6.27 report card, S-6.31 fines payment, S-6.33 cadence: `todo` | roadmap | Absent. Login is email + password. Unchanged, except that the render route no longer refuses a pupil the report card on grounds of role; what refuses it now is the publish window (S9, B8). | Accurate. |
| Prototype: Messages row on profile, first-run tour, signed-out screen, biometric option | `student.html` | Absent; no story. The profile's Messages row now exists, pointing at the notification inbox rather than at a teacher (`4a83f7e`); the other three are absent still. | Contract gap not tracked. |
| Profile copy: Settings has "Alerts, theme and your PIN" | `student-profile-screen.tsx:37` | None of the three exist. Fixed in `4a83f7e`: the row reads "Your sign-in and what you are told about", which is what the screen behind it holds. | Copy contradicts behaviour. |
| Help copy: only published marks are shown | `student-help-screen.tsx:23-29` | True for the Marks screen, false for Goals. Fixed in `1b774ea`: true on both, and on the subjects list behind them. | Copy contradicts behaviour on one screen. |

## 3. Workflow inventory

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| S1 | Get an account (invite, claim, set password) | Implemented | Same invite engine as parents; token handed over by hand. That engine carried an account-takeover path this document did not record: the person issuing the invite chooses the address, and naming one that already had a user let the claimer set that user's password, name and role, a teacher's sign-in included. Closed in `1f1501c` — claiming opens an account and never adopts one, refused in the route and again in the transaction. |
| S2 | Sign in (email + password) | Implemented | Prototype wants student ID + PIN. The field is still labelled "Work email" on a child's login page (`portal-login-form.tsx:164`). |
| S3 | Forgot password / change password | Missing | Settings links `/settings/profile`; `proxy.ts:469-479` redirects any STUDENT request outside `/portal/student` back to the portal. No reset route for pupils. The link is gone (`4a83f7e`), so the dead end is not reachable; the proxy behaves as described and there is still nowhere for a pupil to change a password, which makes this missing rather than broken. |
| S4 | Home: today's periods, next class | Implemented | `student-day-loader.ts`. Since revised: the loader also carries what is due, the latest published mark with its delta, books out with fines and the unread count, and Home leads with the homework (`4a83f7e`). |
| S5 | Timetable day and week; open a class | Implemented | The day picker no longer offers Saturday to a grid that draws Monday to Friday. Still no class sheet, and no week arrows: the API takes no `weekStart`. |
| S6 | Homework list with filters | Implemented | Published assignments for the pupil's class or stream. |
| S7 | Hand in homework | Partial | Text and URL only; can resubmit until marked; no file upload; no teacher feedback thread (API supports `feedback` and `sendBack`, UI shows score only). |
| S8 | Marks for the term with delta | Implemented | PUBLISHED only. The route is gated on the sheet's status and deliberately not on the publish window: a window check was written into the parent equivalent in `1b774ea` and reverted, because no school has a window configured and it would have hidden every published mark from every family. The window gates the report card; the sheet's status gates the portal. |
| S9 | Report card download | Missing | S-6.27 `todo`; document source exists (`schools.report-card`) but STUDENT cannot call the render route. The role bar is gone: `1f1501c` judges a portal caller by record, and a pupil may render their own report card and their own statement, invoice and receipt. Two things still stand between a pupil and the file — no screen offers it, and `resolveReportCard` throws unless a publish window is open for the term and class, which none is (B8). |
| S10 | Goals per subject | Implemented | Leaks unpublished current mark (§5). Fixed in `1b774ea`. |
| S11 | Library: browse, borrow, return, scan, renew, reserve | Implemented | Self-issue without a librarian. |
| S12 | Pay a library fine | Missing | S-6.31 depends on S-7.3. The fine is at least stated now, as a pill carrying the amount and where to pay it (`4a83f7e`). |
| S13 | Notifications inbox, mark read, archive | Implemented | Generic `/api/notifications`. Nothing school-side emits to a pupil except notices. The bell carries the unread count, so the inbox is at least findable (`4a83f7e`). Nothing leaves the app: there is still no email, SMS or WhatsApp channel, so a pupil who does not open the portal is told nothing. |
| S14 | Notification cadence and quiet hours | Missing | S-6.33 depends on S-9.5. The one preference that has somewhere to live, in-app alerts on or off, is wired to `/api/notifications/preferences`; cadence and quiet hours have no store. |
| S15 | Profile view | Implemented | Read-only by design. |
| S16 | Edit profile, theme | Missing | S-6.34 wrongly `done`. Neither is built; the screens no longer imply otherwise. |
| S17 | Help centre | Implemented | Static. No "did this help" control. The office row is a real `tel:` and `mailto:` where the tenant has them, and hides itself where it does not. |
| S18 | Messages with teachers | Missing | Prototype profile row; no story. The teacher portal gained a composer and a class broadcast in `e6c1864`, but a thread there is one guardian about one child; nothing addresses a pupil. |
| S19 | Learning resources / materials | Missing | `teaching-resources` GET needs `schools.academics view`; STUDENT lacks it. The four new verbs in `c4689af` went to staff roles; the STUDENT persona is unchanged. |
| S20 | Exam timetable | Missing | Only `SchoolCalendarEventKind.EXAM`. |
| S21 | Attendance view (own) | Missing | Data exists per student; no student route. |
| S22 | Fees view (own balance) | Missing | Legacy aggregate returns invoices; new shell has no screen. Product decision: many schools do not show fees to pupils. |
| S23 | Boarding leave request | Missing | `SchoolLeaveRequest` create requires `boarding:approve-leave`; boarders cannot request from the portal. |
| S24 | Report a concern / wellbeing | Missing | No model. |
| S25 | Clubs, sport, houses | Missing | No model. |
| S26 | Sign out | Implemented | |

Counts: 12 implemented, 1 partial, 13 missing. The original line read 11 implemented, 1 partial, 1 broken and 13 missing; the split was miscast by one in each direction, and S3 has since moved from broken to missing.

## 4. Benchmark gap

Graded against `../reference/k12-benchmark.md` §17, §19, §13.

| Capability | Benchmark norm | Huchu today | Priority |
|---|---|---|---|
| Assignment submission with file upload and teacher feedback | Standard | Text/link, score only | P1 |
| Learning materials per subject | Standard | Absent for pupils | P1 |
| Own attendance summary | Standard | Absent | P2 |
| Report card in app | Standard | Absent (S-6.27); the render route admits a pupil now, the publish window does not | P1 |
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
| B1 | Security and correctness: unpublished marks visible to pupils. `currentMark` in `me/subjects` reads result lines for the term with no `sheet.status = PUBLISHED` filter; `goalsForStudent` does the same. A DRAFT or HOD_REJECTED mark shows on Goals. Fixed in `1b774ea`: one helper, `lib/schools/mark-visibility.ts`, answers the question for the subjects route, the goals comparison and the head's goals oversight, so the gate cannot be present in two places and absent in the third. A test that had been asserting the bug — a sheet built with no status, which the schema defaults to DRAFT, expected to be visible — was corrected with it. | `app/api/v2/schools/portal/student/me/subjects/route.ts:68-71`; `lib/schools/goals-meetings.ts:110-114` | Medium |
| B2 | Dead "Change your password" link. Fixed in `4a83f7e` by removing it. The absence behind it is unchanged: there is no password path for a pupil, and the proxy still bounces a STUDENT out of the back-office settings shell (S3). | `components/schools/portal/student/student-settings-screen.tsx:44`; `proxy.ts:469-479` | Medium |
| B3 | Copy promises PIN, alerts and theme that do not exist. Fixed in `4a83f7e`: the profile row names what Settings actually holds, and Settings draws no row it cannot keep a setting for. | `student-profile-screen.tsx:37` | Low |
| B4 | Library self-issue: a pupil creates a loan against a copy with no librarian confirmation, moving stock in the system. Unchanged. | `me/library/route.ts:210-233` | Low |
| B5 | Legacy aggregate `GET /api/v2/schools/portal/student` returns guardians' phone and email to the pupil and is unused by the shell. Delete. Unchanged; the route and its guardian block are still there. | `app/api/v2/portal/_handlers.ts:365-560` | Low |
| B6 | No audit trail for hand-ins, loans or goal edits. Unchanged. `50df723` began writing platform audit events for the acts the office performs over a teacher — correcting a submitted register, archiving a pupil or a teacher — but nothing a pupil does in this portal writes one. | `lib/schools/audit.ts` | Low |
| B7 | Roadmap row S-6.34 marked `done` for work not present. Unchanged; the row still reads `done`. | `docs/expansion-plan/schools-roadmap.md` | Doc |
| B8 | A report card cannot be printed unless a publish window is open for the term and the pupil's class at that moment, and no seeded school has one, so `resolveReportCard` throws. Recorded during implementation, when `1f1501c` removed the role bar this document gave as the reason a pupil cannot download one (S9) and the window turned out to be the next refusal behind it. The window is a deliberate gate (S-1.3), but it is enforced at print time rather than at publish time, so a mark this portal already shows a child cannot be printed for them. | `lib/documents/schools-sources.ts:535-552` | High |
| B9 | The invite claim could take over an existing account. The inviter chooses the address an invite is sent to, so naming one that already had a user let whoever claimed the link set that user's password, name and role — a teacher's sign-in included. Recorded during implementation; this document had accepted the claim flow as the parents' engine without reading it. Fixed in `1f1501c`: claiming opens an account and never adopts one, refused both in the route and in the transaction that did the overwriting. | `lib/schools/portal-invites.ts:243-266`; `app/api/public/schools/claim/[token]/route.ts` | High |

## 6. Proposed edits

Numbers 1 and 2 are done, and 3 in part; 4, 5 and 6 stand. What was built differed from what was proposed in two places, and each difference is recorded under its item.

1. **Fix B1 now.** Add `sheet: { status: "PUBLISHED" }` to both queries and a test in `goals-meetings.test.ts` that a DRAFT line does not surface. This is a one-line change that restores the publishing guarantee. Done, as one shared helper rather than the same clause written twice, because a third caller — the head's goals oversight — had the same hole and would have been missed by a two-line fix.
2. **Give pupils a password path.** Either build a portal-local "change password" under `/portal/student/settings` or remove the link and add the "ask the office" copy the teacher portal already uses. Done by the second route: the link is gone and the sign-in row names the address and says the school office owns it. No pupil can change a password, which is the half of this the portal cannot fix alone.
3. **Correct copy** on the profile screen (B3) and the roadmap row S-6.34. The screen is corrected; the roadmap row still reads `done`.
4. **Homework feedback.** The API already carries `feedback` and `sendBack`; show them on the hand-in card so the pupil sees why work came back.
5. **Library issue confirmation.** Make a pupil's borrow a `RESERVED_FOR_PICKUP` state that the librarian confirms at the desk, or keep self-issue but mark it visibly as "collect from the library" until scanned.
6. **Delete the legacy aggregate route** (B5).

## 7. Proposed restructuring

- **Sign-in.** Replace email + password with student number + PIN for the student host (S-6.20/21). Store the PIN as a bcrypt hash on the linked `User`; add a "forgotten PIN" that the class teacher or office resets from the student record. This is the biggest usability win for younger pupils and shared devices. Not done; the login page is the shared portal form, and its field is still labelled "Work email".
- **Home should lead with what is due.** The prototype's home has "Your next class", "This week" KPIs (homework to hand in, latest mark), and recent marks. The code's home is today's periods only. Add the homework-due count and the latest published mark to Home. Done (`4a83f7e`), and further than proposed: the due list itself is the first thing on the screen, with the next class under it, and the figures ride down with the pupil's record from `student-day-loader.ts` rather than filling in from four client requests after the page has painted.
- **Merge Notifications and school news.** Notices arrive through the generic inbox; the prototype shows a "School news" banner on Home. One inbox with a Home teaser is enough. Half done: the bell and the Home tile both carry the unread count and point at the one inbox. There is no Home teaser and no banner.
- **Settings is the right place for account, alerts, appearance, privacy** (prototype's five groups). Keep the honest "not here yet" rows until each lands, but wire the two that are trivially available: browser push preference (already exists for teachers) and reduced motion. Done against the proposal in one respect and deliberately against it in another: the alerts preference is wired, but the "not here yet" rows are not kept — a row a child cannot use, explaining a gap in the product to them, was the fault behind rationale copy elsewhere in the audit, and a screen that draws only what works says the same thing without the apology.

## 8. Proposed new workflows and features

Only the first has been touched, and only in part; the other eight stand as written.

1. **Report card in the portal (S-6.27).** Reuse `schools.report-card` with a student-scoped render branch (same fix as the parent download, see parent audit B1). The render branch is done (`1f1501c`) and admits a pupil to their own report card, statement, invoice and receipt, judged by the record rather than by the role. The screen that would offer it is not built, and the publish window would refuse it if it were (B8).
2. **File upload on hand-in.** `lib/uploads/` and the record files engine exist (S-4.2). Add `SchoolAssignmentSubmission.fileId` and accept an upload from the phone camera.
3. **Learning materials.** A student-scoped read of `SchoolTeachingResource` filtered to the pupil's class subjects and `sharedWithPupils = true`.
4. **Own attendance** over `students/[id]/attendance` with the portal resolver.
5. **Messages to teachers** once S-7.1 lands; pupil to subject teacher only, visible to the office.
6. **Boarding leave request by the boarder**, parent-approved, warden-actioned; reuses `SchoolLeaveRequest` with a new `REQUESTED_BY_STUDENT` origin.
7. **Exam timetable** as a first-class `SchoolExamSession` with room and seat, surfaced in the timetable tab during exam weeks.
8. **Report a concern** (wellbeing) to a named staff role with restricted visibility. Sits with the parked behaviour/discipline decision. Welfare became a resource of its own in `c4689af`, so the staff side of this now has somewhere to live; the pupil's side has no model and no story.
9. **Fine payment** rides on S-7.3.

## 9. Open decisions

All three are still open; nothing in the implementation settled any of them.

- Should pupils ever see fee balances? The legacy aggregate exposes invoices; the new shell does not. Decide and delete the other path.
- Self-issue library loans: allowed, or reserve-then-confirm?
- Is the student host meant for primary pupils (PIN, no email) as well as secondary?
