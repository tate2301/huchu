# Evidence: portal workflow audit (code-level)

Raw code-level findings behind the parent, student and staff portal workflow documents. Line numbers are as of 2026-09-14 on `main`.


Static code read only (no node_modules, nothing executed). All paths are relative to `/home/user/huchu`. Line numbers are from the files as read on this pass.

Legend for status columns: **Implemented** = end-to-end, backed by a real API and real writes; **Partial** = works but with named gaps, dead controls, or one leg missing; **Broken** = the control exists in the UI but the API it calls will refuse or the link goes nowhere; **Missing** = not present at all.

---

## A. Identity & access flow

### A.1 Host routing and portal isolation

| Concern | Evidence | Verdict |
|---|---|---|
| Portal hosts | `lib/platform/portal-hosts.ts:11-40` — `students.<tenant>` → `/portal/student`, `parents.<tenant>` (alias `guardian.`) → `/portal/parent`, `staff.<tenant>` → `/portal/teacher`, `pos.` → `/portal/pos`. Aliases redirect to the canonical prefix (`proxy.ts:422-424`). | OK |
| Public path ↔ internal path rewrite | `proxy.ts:417-460`: on a portal host `/` and `/login` are rewritten to `<portalPath>` / `<portalPath>/login` (`portal-hosts.ts:99-112`). Signed-out → `/login` with callback (`proxy.ts:449-451`). | OK, but see e2e note below — the rewrite is **not exercised** by the harness. |
| Role → portal home pinning | `proxy.ts:59-65` (`PORTAL_HOME_BY_ROLE`: PARENT/STUDENT/TEACHER/POS) and `proxy.ts:469-479`: a portal-role token requesting any page outside its own `/portal/<x>` is redirected to its portal home. | OK for tenant-host paths. **Gap:** on a *portal host* the branch at `proxy.ts:417-460` returns (rewrite) before the role check at `:469`, so a PARENT token on `staff.<tenant>` is rewritten into `/portal/teacher/**`. The teacher layout then loads with `teacher: null` (`lib/schools/teacher-day-loader.ts:24-27`) and every screen shows "not linked to a teacher profile". No data leak, but no redirect to the right portal either. |
| HOD | `HOD` is a real persona (`lib/platform/personas.ts:126-136`) but is **absent** from `PORTAL_HOME_BY_ROLE` (`proxy.ts:59-65`), and `portal-isolation.ts:37` says "HODs use teacher portal". An HOD user is not pinned to any portal and lands in the workspace; the teacher portal has no moderation screen (see D). |
| `/api/*` and the proxy | `proxy.ts:659-666` — the matcher **excludes** `/api` except platform-admin/gold/payroll/compliance. Every `/api/v2/schools/portal/**` route therefore relies solely on `validateSession` → `requireApiAuthLean` → `resolveAccessContext` (`lib/api-utils.ts:25-29`, `lib/auth-core/access.ts:118-160`), which does tenant-host, role-route and **feature** checks. | OK |
| Feature gating | `lib/platform/gating/route-registry.ts:123-126, 391-400` map `/portal/<x>` and `/api/v2/schools/portal/<x>` to `schools.portal.<x>`, which depends on `schools.core` + `portal.core` (`feature-dependencies.ts:50-52`). A tenant without the add-on gets `FEATURE_DISABLED` on the layout guard. | OK |
| Dead navigation catalogue | `lib/platform/gating/portal-isolation.ts:165-200` lists routes that do not exist: `/portal/parent/students`, `/portal/parent/receipts`, `/portal/student/attendance`, `/portal/student/results`, `/portal/student/fees`, `/portal/teacher/classes`, `/portal/teacher/moderation`, `/portal/teacher/approvals`. The module is imported nowhere (grep), so it is dead code — but `e2e/school-portal-gaps-suite.spec.ts:30-33` cites it as the reason `/portal/teacher/register` must keep redirecting. |

### A.2 How a parent or student gets an account (invite → claim → login)

1. **Issue.** Staff with `canViewAnyPortalSubject` (SUPERADMIN/MANAGER/SCHOOL_ADMIN/REGISTRAR/BURSAR — `lib/schools/portal-identity.ts:33-43`) *and* `schools.students create` call `POST /api/v2/schools/portal-invites` (`app/api/v2/schools/portal-invites/route.ts:129-192`), batch of 1–500 `{subject: STUDENT|GUARDIAN, subjectId, sentTo}`. `issuePortalInvite` (`lib/schools/portal-invites.ts:78-134`) refuses a record that already has `userId` (409), **revokes any outstanding invite for the same subject** (`:107-116`), stores only the sha256 of a 32-byte token, 14-day TTL (`:22`).
2. **Delivery is manual.** The plaintext tokens are returned once in the response (`route.ts:182-184`). The back-office dialog (`components/schools/portal/portal-invite-dialog.tsx:117-133`) says "Copy these links now… the school cannot recover them" and renders `${origin}/c/${token}`. **No email, SMS or WhatsApp send exists** — the claim page comment ("arrives as a WhatsApp link", `app/c/[token]/page.tsx:13-15`) describes a human forwarding it.
3. **Claim.** Public page `app/c/[token]/page.tsx` → `components/schools/portal/claim-portal-account-content.tsx` → `GET/POST /api/public/schools/claim/[token]` (`app/api/public/schools/claim/[token]/route.ts`). GET returns one uniform 404 for unknown/expired/used/revoked (`:39-44`); POST distinguishes 404/409/410 (`portal-invites.ts:225-236`). `claimPortalInvite` runs in one transaction: creates or reuses the `User` by `sentTo` email, sets bcrypt(12) password (min length 10, `:26`), sets `role` to STUDENT/PARENT, writes `SchoolStudent.userId` / `SchoolGuardian.userId`, stamps `claimedAt`. A user whose email already exists **in another tenant** is refused (`:251-256`).
4. **Login.** `/portal/<x>/login` pages (`app/portal/*/login/page.tsx`) all render the shared `components/auth/portal-login-form.tsx` (email + password + remember-me) against NextAuth credentials. Rate limiting exists on credentials sign-in (`lib/auth.ts:438-452`). After sign-in, `proxy.ts:469-479` pins the role to its portal.
5. **Identity at runtime.** Every parent/student route resolves the subject **only** through `resolvePortalGuardian` / `resolvePortalStudent` (`lib/schools/portal-identity.ts:70-125`) keyed on `(companyId, userId)`. A non-oversight caller who passes any `guardianId`/`studentId` gets a hard 403 ("forbidden"), never a fallback. The module's own header (`:11-19`) documents the previous email/studentNo matching breach this replaced.

### A.3 Multi-child households

`lib/schools/parent-household-loader.ts:135-397` loads every `SchoolStudentGuardian` link for the resolved guardian (`:193-216`), ordered primary-first, and computes per child: fees (only if `canReceiveFinancials`, `:243-266`), this-term attendance counts (`:266-278`, not consent-gated), `hasPublishedMarks` (only if `canReceiveAcademicResults`, `:279-287`), today's lessons (`:288-331`). The chosen child lives in `localStorage` (`components/schools/portal/parent/parent-portal-context.tsx:27`) and is never read from the URL. Per-child screens call `/child/*?childId=` and every one goes through `scopeToChild` (`app/api/v2/schools/portal/parent/child/_guard.ts:24-63`): guardian from session → link must exist → consent flag for the data kind. "Not your child" and "no such child" return the identical 403 (`:52-56`), pinned by `parent-scope.test.ts:248-261`.

### A.4 How a teacher gets an account and maps to a record

- There is **no invite/claim flow for teachers**: `SchoolPortalInviteSubject` is `STUDENT | GUARDIAN` only (`portal-invites.ts:82`, schema `prisma/schema.prisma:6706-6730`). A teacher is a `User` with role `TEACHER` created by an administrator, plus a `SchoolTeacherProfile` whose `userId` is required (`schema.prisma:7008-7011`), created via `POST /api/v2/schools/teachers/profiles` (`app/api/v2/schools/teachers/profiles/route.ts:117`).
- The portal resolves the caller with `getTeacherProfile(companyId, userId)` and requires `isActive` (`lib/schools/governance-v2.ts:16-28`). No profile → `teacher: null` and every screen shows the "ask the office to link your account" empty state (`teacher-today-content.tsx:59-66`).
- **Employee link** is optional and deliberate: `SchoolTeacherProfile.employeeId` nullable+unique (`schema.prisma:7018`); `lib/schools/teacher-identity.ts:52-173` suggests (same login = certain, exact name = likely) and links only on a person's click, refusing cross-tenant, already-linked and different-login employees. The portal reads `employee.jobTitle` for the profile card (`teacher-day-loader.ts:29-38`).
- Privileged staff (SUPERADMIN/MANAGER/SCHOOL_ADMIN/REGISTRAR/BURSAR, `governance-v2.ts:4-10`) are waved through ownership checks on register/lessons/attendance/marks routes, but since they have no profile the *portal* shows them the empty state (`e2e/teacher-portal-shots.spec.ts:8-12` notes this).

### A.5 Gaps

| Gap | Evidence | Severity |
|---|---|---|
| **No self-service password reset / forgot-password for any portal.** | `portal-login-form.tsx` has no reset link. Only `POST /api/users/password-reset` exists and it is SUPERADMIN-only (`app/api/users/password-reset/route.ts:26`). Teacher settings says so (`teacher-settings-screen.tsx:384-389`); teacher help says so (`teacher-help-screen.tsx:~198`). | High (ops burden; a parent who forgets a password must contact the office). |
| **Student "Change your password" link is dead.** | `student-settings-screen.tsx:44` links to `/settings/profile`; `proxy.ts:469-479` redirects any STUDENT-role request outside `/portal/student` back to `/portal/student`. | Medium (UI lies). |
| No self-signup, no OTP/WhatsApp/SMS sign-in, no MFA, no device/session list. | Only credentials strategy on `portal-login` surface (`app/portal/*/login/page.tsx:20-24`); teacher settings marks 2FA / sign-out-everywhere / auto-lock "Not yet available" (`teacher-settings-screen.tsx:107-109, 390-410`). | Medium |
| **Claim can overwrite an existing same-tenant account's password and role.** | `portal-invites.ts:243-263`: if a `User` with `sentTo` email exists in the same company, the claim `update`s its `password` and sets `role` to PARENT/STUDENT. An inviter (REGISTRAR/BURSAR has `schools.students create`) who addresses a guardian invite to a staff member's email holds the token, claims it, and thereby resets that staff account's password and demotes it. Also, the invite is not tied to the *user* the email belongs to. | Medium (privileged-account lockout by lower-privileged staff). |
| Invite expiry / revocation | 14 days (`portal-invites.ts:22`); revoke = `POST /portal-invites/[id]/revoke` (needs `schools.students invite` + oversight role, `revoke/route.ts:21-26`); re-issue auto-revokes (`:107-116`). Expired/revoked/claimed all → 404 on GET. | OK |
| Claim endpoints have **no rate limit** (token is 256-bit so enumeration is impractical; password POST could be hammered). | `app/api/public/schools/claim/[token]/route.ts` | Low |
| No portal-specific "wrong portal" check at sign-in. | `lib/auth.ts:567-579` refuses non-cashiers on the POS host; there is no equivalent for `parents.`/`students.`/`staff.` hosts. A TEACHER can sign in on `parents.<tenant>` and gets an empty parent shell. | Low |
| Guardian at two schools needs two accounts (documented). | `portal-invites.ts:248-256` | Info |
| Cross-tenant leakage checks | `_guard.ts` always filters `companyId` from session; `parent-scope.test.ts` drives real handlers against Postgres for own/stranger/missing child, both consent flags, and unpublished sheets (`:233-345`). Tests are DB-integration (need `DATABASE_URL`) and only cover `child/fees|marks|attendance` — not `children/[studentId]/*`, messages, notices, or any student/teacher route. | OK / coverage gap |

---

## B. Parent portal (`app/portal/parent/(shell)/**`, host `parents.<tenant>`)

Layout `app/portal/parent/(shell)/layout.tsx:18-43`: `requirePageAuth` then `loadParentHousehold` on the server; `ParentPortalProvider` + `ParentPortalShell` (4 bottom tabs Home/Fees/News/You, child-switcher chip, bell — `parent-portal-shell.tsx:43-48, 82-110`).

### B.1 Page table

| Route | Purpose | Data source | Actions | Status | Notes |
|---|---|---|---|---|---|
| `/portal/parent` | Home: greeting, term week, child hero (fees paid bar, attendance %, marks ready), today's lessons, 3 latest notices | Household from layout; `GET /api/v2/schools/portal/parent/notices` (`parent-home-screen.tsx:74-78`) | Links to attendance/notices | Implemented | "Marks: Ready / Not yet" (`:230`). |
| `/portal/parent/fees` | Statement per child: invoices with lines, paid, balance; receipts list | `GET /child/fees?childId=` (`parent-fees-screen.tsx:78-85`) | "Download this bill" (`:271`), receipt download (`:307` text) | **Broken download** | `PrintDocumentButton` → `POST /api/documents/render` → `canSchoolRoleDo(role,"schools.fees","view")` (`app/api/documents/render/route.ts:101-108`). PARENT persona has only `schools.portal.parent` (`personas.ts:160-162`) → always **403 "Your role cannot view fees"**. No pay-now (`:36-38` "there is no payment flow in this portal"). |
| `/portal/parent/attendance` | This term's register days for the child, newest first, with "not yet submitted" for DRAFT registers | `GET /child/attendance?childId=` | None | Implemented | Because the teacher portal never submits a register (see D), most days will read "not yet submitted" (`parent-attendance-screen.tsx:148, 161-168`). |
| `/portal/parent/marks` | Published marks grouped by term with pass mark | `GET /child/marks?childId=` | "Download report card" (`parent-marks-screen.tsx:173`) | **Broken download** | Same render-route refusal (resource `schools.results`). Marks list itself respects `PUBLISHED` status only (`child/marks/route.ts:40-46`); the **publish window** is enforced only in the report-card document (`lib/documents/schools-sources.ts:492-499`), not in this JSON route. |
| `/portal/parent/notices` | School news with read state; mark one/all read | `GET/POST /parent/notices` | Mark read | Implemented | In-app only. |
| `/portal/parent/messages` | Threads with the school; open thread; reply; "Write to the school" (new thread to the office, `teacherProfileId: null`) | `GET/POST /parent/messages` (`parent-messages-screen.tsx:68-106`) | Start thread, reply | Implemented (two-way, to office only) | Parent cannot pick a teacher in the UI (API allows `teacherProfileId`). Reached from the You tab, not a bottom tab. |
| `/portal/parent/profile` | Guardian contact details (read-only), children list (select), links, sign out | Household | Select child; `signOut` (`parent-profile-screen.tsx:161`) | Partial | No edit of phone/email/address. |
| `/portal/parent/help` | Static FAQ | — | — | Implemented | FAQ claims statements/receipts "download as PDFs" (`parent-help-screen.tsx:28`) — false for a PARENT role today. |

### B.2 API table (`app/api/v2/schools/portal/parent/**`)

| Route | Methods | Returns / mutates | Scoping | Validation | Notes |
|---|---|---|---|---|---|
| `/parent` | GET | Aggregate: guardian, children+links, attendance profiles, published result lines, boarding allocations, invoices, notices, summary (`app/api/v2/portal/_handlers.ts:119-363`) | Session guardian; `guardianId` honoured only for oversight roles (403 otherwise); consent flags via `studentIdsWithConsent` (`:229-230`) | zod | Legacy aggregate; the new shell does not call it. |
| `/parent/children` | GET | Guardian + linked children | Same as above | none on query | |
| `/parent/children/[studentId]/fees` | GET | All invoices (incl. VOIDED) + receipts + Decimal sums | Non-oversight: guardian link + `financials` consent (`:25-59`). Oversight roles: **any student in tenant** (intended) | none | Legacy; new UI uses `/child/fees`. |
| `/parent/children/[studentId]/results` | GET | Published result lines | Link + `academic-results` consent | none | Legacy. |
| `/parent/child/attendance` | GET | Session lines (≤200) with register status | `scopeToChild(needs:null)` | `termId` raw string, not validated | |
| `/parent/child/fees` | GET | Non-DRAFT, non-VOIDED invoices with lines; POSTED receipts; money as strings | `scopeToChild(needs:"financials")` | — | |
| `/parent/child/marks` | GET | Lines on `PUBLISHED` sheets, with subject pass mark | `scopeToChild(needs:"academic-results")` | `termId` raw | No publish-window check. |
| `/parent/messages` | GET, POST | Threads / thread detail (marks read); start / reply | Guardian from session; thread ownership checked in `lib/schools/messages.ts:201-210, 329-334` | zod (subject ≤160, body ≤4000) | `startThread` does not verify a client-supplied `teacherProfileId` belongs to the tenant (`messages.ts:250-310`). |
| `/parent/notices` | GET, POST | Recipient rows for this user; mark read (ids or all) | `userId` from session | zod | |

No portal parent route writes an audit event (`lib/schools/audit.ts:21-69` only defines fee/import events; no portal route imports it). No rate limiting beyond sign-in.

### B.3 Workflow verdicts

| Workflow | Verdict |
|---|---|
| Home / children switcher / multi-child | Implemented |
| Attendance (day-level, term) | Implemented (but "not yet submitted" everywhere until office submits) |
| Marks — published only, consent flag | Implemented; publish windows not respected in JSON route |
| Fees — statement, invoice lines, receipts | Implemented (read) |
| Download invoice / receipt / report card PDF | **Broken for PARENT role** (render route role check) |
| Pay online | Missing (payments seam exists in `lib/payments/*`, `docs/payments/*`, but nothing in the parent portal references it) |
| Notices (in-app) | Implemented |
| Messages (two-way with office) | Implemented; cannot address a named teacher from UI; no attachments |
| Profile / update contact details | Missing (read-only) |
| Consent forms, absence notification, book parents' evening, view timetable (beyond today), view homework, discipline/behaviour, boarding leave | Missing. (Meetings API has a `book` action — `app/api/v2/schools/meetings/route.ts:122-131` — but it needs `schools.students edit`, which PARENT lacks, and there is no parent screen.) |
| Sign out | Implemented (`next-auth signOut`) |

### B.4 Concrete bugs / risks

1. **Download buttons always fail** — `components/schools/portal/parent/parent-fees-screen.tsx:269-273`, `parent-marks-screen.tsx:171-176` → `app/api/documents/render/route.ts:101-108` + `lib/platform/personas.ts:160-162`. Help text promises PDFs (`parent-help-screen.tsx:28`).
2. `lib/schools/messages.ts:250-310` accepts arbitrary `teacherProfileId` on `startThread` (no `companyId` check) — parent client sends `null`, but the API surface allows a foreign id.
3. `child/attendance/route.ts:36-41` passes raw `termId` into the where clause (scoped by `studentId`, so no leak; just unvalidated).
4. Legacy `/parent/children/[studentId]/*` and `/parent` aggregate duplicate the newer `/child/*` guard logic inline instead of using `scopeToChild` (drift risk the guard file itself warns about, `_guard.ts:15-18`).

---

## C. Student portal (`app/portal/student/(shell)/**`, host `students.<tenant>`)

Layout `app/portal/student/(shell)/layout.tsx:19-43`: `requirePageAuth` + `loadStudentDay` (`lib/schools/student-day-loader.ts:18-118` — own record by `userId`, current term, today's periods with lessons). Shell: 4 tabs Home/Timetable/Marks/Profile, bell → notifications (`student-portal-shell.tsx:37-42, 75-93`).

### C.1 Page table

| Route | Purpose | Data source | Actions | Status | Notes |
|---|---|---|---|---|---|
| `/portal/student` | Home: today's periods, links | Layout day | — | Implemented | |
| `/portal/student/timetable` | Week by day | `GET /student/me/timetable` (`student-timetable-screen.tsx:74`) | — | Implemented | |
| `/portal/student/marks` | Published results by term, delta vs previous | `GET /student/me/results` + `/me/subjects` for names (`student-marks-screen.tsx:118-143`) | — | Implemented | `/me/results` returns PUBLISHED only. |
| `/portal/student/homework` | Assignments with own submission; hand in (text + link) | `GET /student/me/homework`; `POST /api/v2/schools/assignments/[id]` `{action:"submit"}` (`student-homework-screen.tsx:156-191`) | Submit / resubmit / late | Partial | **No file upload** — `attachmentUrl` is a pasted link (`lib/schools/assignments.ts:84-129`). Can change until marked. |
| `/portal/student/goals` | Per-subject target with baseline and current mark | `GET /api/v2/schools/goals`, `GET /me/subjects`, `POST /goals` (`student-goals-screen.tsx:127-167`) | Set/change goal | Implemented — **but leaks unpublished marks** (see C.4) | |
| `/portal/student/library` | Shelf with availability, own loans, fines, reservations | `GET/POST /student/me/library` | Borrow, return, renew, reserve | Implemented | Pupil can "borrow" from the phone with no librarian (`me/library/route.ts:210-233`, `issuedById` = the pupil). Fines cannot be paid here (documented `:193-196`). |
| `/portal/student/notifications` | Notification centre inbox; mark read; archive | generic `/api/notifications` (`student-notifications-screen.tsx:72-90`) | Mark read, clear | Implemented | Feature-disabled state handled (`:106-114`). |
| `/portal/student/profile` | Read-only record with "who owns each field" | Layout day | Links | Implemented (read-only) | Copy says Settings has "Alerts, theme and your PIN" (`student-profile-screen.tsx:37`) — none exist. |
| `/portal/student/settings` | Sign-in email, password link, notifications link | — | — | Partial | "Change your password" → `/settings/profile` is **redirected back to the portal** by `proxy.ts:469-479`. PIN/theme/cadence explicitly "not here yet" (`:79-84`). |
| `/portal/student/help` | Static FAQ | — | — | Implemented | |

### C.2 API table (`app/api/v2/schools/portal/student/**`)

| Route | Methods | Returns / mutates | Scoping | Notes |
|---|---|---|---|---|
| `/student` | GET | Aggregate (enrolments, guardians incl. phone/email, boarding, published results, invoices, notices) (`_handlers.ts:365-560`) | Session student; `studentId`/`studentNo` only for privileged (403 otherwise `:380-382`) | Legacy; not used by new shell. Returns guardians' phone/email to the pupil. |
| `/student/me/homework` | GET | Published assignments for the pupil's class/stream + own submission | `resolvePortalStudent` | Term from query (validated uuid, company-checked). |
| `/student/me/library` | GET, POST | Catalogue/loans/fines/reservations; borrow/return/renew/reserve | Own student; loan ownership checked (`:239-243`) | Rules in `lib/schools/library.ts`. |
| `/student/me/results` | GET | PUBLISHED result lines (≤300) | `resolvePortalStudent` (`studentId` param → 403 for portal role) | |
| `/student/me/subjects` | GET | Taught subjects this term with `currentMark` | Own student | **`currentMark` reads `schoolResultLine` where `sheet: { termId }` with NO status filter (`me/subjects/route.ts:68-71`)** → unpublished DRAFT/SUBMITTED marks surface. Same in `goalsForStudent` (`lib/schools/goals-meetings.ts:110-114`). |
| `/student/me/timetable` | GET | Slots for own class/stream | Own student | |

Shared routes the student portal calls: `POST /api/v2/schools/assignments/[id]` submit (student resolved from session, `[id]/route.ts:160-185`); `GET/POST /api/v2/schools/goals` (student from session unless staff, `goals/route.ts:52-70, 96-115`); `/api/notifications*` (allowed for all roles, `role-routes.ts:12-20`).

### C.3 Workflow verdicts

| Workflow | Verdict |
|---|---|
| Home, timetable, marks (published) | Implemented |
| Homework view + submit (text/link) | Partial — no upload, no teacher feedback thread |
| Goals | Implemented (with unpublished-mark leak) |
| Library self-service | Implemented (physically optimistic) |
| Notifications | Implemented (in-app) |
| Profile / settings | Read-only; password link dead; PIN/theme/cadence missing |
| Assignments file upload, learning resources/materials, exam timetable, fee visibility, attendance view, boarding leave request, wellbeing/report-a-concern, clubs | **Missing** (no screen, no student-scoped API; `teaching-resources` GET needs `schools.academics view`, which STUDENT lacks) |

### C.4 Concrete bugs / risks

1. **Unpublished marks visible to pupils** via `/student/me/subjects` (`route.ts:68-71`) and `/api/v2/schools/goals` → `goalsForStudent` (`goals-meetings.ts:110-114`). Contradicts the PUBLISHED gate everywhere else (`me/results/route.ts:37-42`, help text `student-help-screen.tsx:23-29`). Medium.
2. Dead password link (`student-settings-screen.tsx:44`).
3. Legacy `/api/v2/schools/portal/student` returns guardians' phone and email to the pupil (`_handlers.ts:~420-435`) — arguably fine, but unused by the UI and broader than the new routes.

---

## D. Staff / Teacher portal (`app/portal/teacher/(shell)/**`, host `staff.<tenant>`)

Layout `app/portal/teacher/(shell)/layout.tsx:28-52`: `requirePageAuth` + `loadTeacherDay` (profile, term, classes with roll sizes, today's periods with register state, workload — `lib/schools/teacher-day-loader.ts`, `teacher-day.ts`). Provider re-fetches `/teacher/me/today` after mutations (`teacher-portal-context.tsx:109-113`). Shell: class rail (selection shared by all screens), Daily / More / Account nav (`teacher-portal-shell.tsx:54-90`), Online/Offline chip (`:125, :262-266`), sign-out via `/api/auth/signout` (`:250-254`).

### D.1 Page table

| Route | Purpose | Data source | Actions | Status | Notes |
|---|---|---|---|---|---|
| `/portal/teacher` | Today: greeting, periods incl. free, "Right now / Next", unmarked registers, marking pile | Layout day / `me/today` | Links | Implemented | |
| `/portal/teacher/attendance` (`/register` redirects here, `register/page.tsx:8-10`) | Take the register for the rail's class on a date | `GET me/register?classSubjectId&onDate`; `POST me/attendance` (`teacher-register-screen.tsx:111-190`) | Mark each pupil, mark all, save | **Partial** | Save leaves the session `DRAFT` (`me/attendance/route.ts:106-118`). **There is no Submit button** and the portal never calls `/attendance/sessions/[id]/submit` (grep: only back-office). Locking is office-only. Consequence: parents see "not yet submitted" indefinitely and the office register board shows every class as unsubmitted. Offline: explicit "nothing queues" warning (`:229-240`). |
| `/portal/teacher/marks` | Enter scores for one assessment (absent flag) | `GET /api/v2/schools/assessments?classSubjectId`, `GET /assessments/[id]/scores`, `PUT …/scores` (`teacher-marks-screen.tsx:73-149`) | Save scores | Implemented | Cannot **create** an assessment from this screen (`POST /assessments` exists and TEACHER may call it, but no UI). |
| `/portal/teacher/marks-book` | Term mark per pupil (continuous/exam/grade/caveat); roll up to result sheet | `GET /assessments/term-marks?classId&classSubjectId`; `POST /assessments/term-marks` (`teacher-marks-book-screen.tsx:81-114`) | "Send to the result sheet" (enabled when `schools.results submit` — TEACHER has it, `personas.ts:141`) | Implemented | After roll-up the sheet is DRAFT; **submitting the sheet** (`/results/sheets/[id]/submit`), HOD approve/request-changes, publish and unpublish all live in the **admin** Results screens. The teacher portal has no "my sheets / status / HOD comments" view; `teacherPortalGet` (`_handlers.ts:~580-720`) returns sheet queue counts but nothing calls it. Edits after `HOD_REJECTED` are possible via `me/marks` (`:44-46`) but no screen calls `me/marks` either (grep: unused). |
| `/portal/teacher/messages` | Threads with families (own + office queue), reply | `GET/POST me/messages` (`teacher-messages-screen.tsx:83-105`) | Reply | Partial | **No "start a conversation" UI** (API `action:"start"` exists, `me/messages/route.ts:98-110`). Cannot close/assign a thread (office-only helpers `messages.ts:367-433`). Settings still says "Parent messaging is not built in this portal yet" (`teacher-settings-screen.tsx:283`) — stale. |
| `/portal/teacher/timetable` | Own week grid with cover | `GET me/timetable?weekStart` (`teacher-timetable-screen.tsx:174`) | Week nav; "lay out" link to lessons | Implemented | |
| `/portal/teacher/lessons` | Weekly planner per class: save plan, lay out week from scheme, copy last week | `GET/POST me/lessons` (`teacher-lessons-screen.tsx:232-320`) | Save, lay-out-week, copy-week | Implemented | Cover requests deliberately absent (`me/lessons/route.ts:318-321`). |
| `/portal/teacher/syllabus` | Scheme of work, week by week | `GET /api/v2/schools/syllabus`; `PUT` gated on `schools.academics edit` (`scheme-of-work-content.tsx:60-61, 165-190`) | Read; write only for HOD/office | Partial (read-only for TEACHER by design) | |
| `/portal/teacher/homework` | Set homework (draft/publish), board per piece, mark submissions | `GET me/homework`; `GET/POST/PATCH /api/v2/schools/assignments*` (`teacher-homework-screen.tsx:177-256`) | Create, publish/withdraw, mark score | Implemented | Feedback text/sendBack supported by API (`[id]/route.ts:186-196`) but the screen only sends `score`. |
| `/portal/teacher/files` | Department shelf + add a **link** | `GET /api/v2/schools/teaching-resources`; `POST me/resources` (`teacher-files-screen.tsx:119-200`) | Add link | Partial | "Links only for now… uploading the file itself arrives with the documents work" (`:404-408`; `me/resources/route.ts:12-18`). |
| `/portal/teacher/reports` | Attendance rate, marks distribution, homework rate, weekly trend, at-risk list; "tell the family" | `GET me/reports`; `POST /api/v2/schools/notices` (`teacher-reports-screen.tsx:197-257`) | Send notice to a child's guardians | **Broken action** | `POST /notices` requires `schools.reports create` (`app/api/v2/schools/notices/route.ts:121`); TEACHER persona has no `schools.reports` grant at all (`personas.ts:137-142`) → 403 "Your role cannot create reports". |
| `/portal/teacher/meetings` | Parents' evening: calendar, slots, booked/free; open an evening; release a slot | `GET /api/v2/schools/meetings?from&to&mine=true`; `POST /meetings` open/release (`teacher-meetings-screen.tsx:153-260`) | Open evening, release | **Broken actions** | `POST /meetings` requires `schools.students edit` (`meetings/route.ts:93`); TEACHER has only `view` (`personas.ts:139`) → both mutations 403. Reading works. Booking is not offered to teachers or parents. |
| `/portal/teacher/profile` | Read-only staff record, teaching load, who owns each field | Layout day | — | Implemented (read-only by design, `teacher-profile-screen.tsx:18-60`) | |
| `/portal/teacher/settings` | Notification prefs (in-app, browser push via `UserNotificationPreference`), sign out, everything else "Not yet available" | `/api/notifications/preferences` | Toggle 2 prefs; sign out | Partial | Absence alerts / digest / quiet hours / announcements / theme / password / 2FA / sign-out-everywhere / auto-lock all `NotYetAvailable` (`:85-108, 384-410`). |
| `/portal/teacher/help` | FAQ | — | — | Implemented | States offline "Not yet" (`:206-215`) and no self-service password (`:~198`). |

### D.2 API table (`app/api/v2/schools/portal/teacher/**`)

| Route | Methods | Mutates / returns | Scoping | Validation | Notes |
|---|---|---|---|---|---|
| `/teacher` | GET | Result sheets (paged) within own assignments + queue counts + notices (`_handlers.ts`) | Assignment scope via `buildAssignedResultSheetWhere`; privileged see all | zod | Unused by shell. |
| `/teacher/me/today` | GET | `loadTeacherDay` | Own profile | zod | |
| `/teacher/me/classes` | GET | Assignments | Own profile; privileged get `[]` | none | |
| `/teacher/me/register` | GET | Roll with marks for a class-subject/date | Own active assignment or privileged (`:35-50`) | zod | |
| `/teacher/me/attendance` | POST | Upsert session (DRAFT) + lines; refuses LOCKED (`:119-120`) | Own assignment on term/class/stream (`:57-76`); pupils must be in class (`:78-92`) | zod (≤400 entries) | Never sets SUBMITTED. |
| `/teacher/me/marks` | POST | Upsert result lines on DRAFT/HOD_REJECTED sheet | Own assignment (`:48-67`) | zod ≤600 | **No UI calls it.** |
| `/teacher/me/homework` | GET | Assignments for own classes with counts | Own classes via `teacherClasses` | zod | |
| `/teacher/me/lessons` | GET, POST | Week grid; save / copy-week / lay-out-week | `ownedClassSubject` (`:96-113`) | zod | |
| `/teacher/me/messages` | GET, POST | Threads (own + office); open; start; reply | Own profile; office threads (`teacherProfileId: null`) readable by **every** teacher (`messages.ts:133-149, 205-206`) | zod | `start` accepts any `guardianId` in the tenant, not only guardians of pupils taught (`me/messages/route.ts:98-110`, `messages.ts:260-264`). |
| `/teacher/me/reports` | GET | `teacherReport` for own classes | Own profile only; privileged not waved through (`:21-26`) | zod | |
| `/teacher/me/resources` | POST | Create link resource stamped with own profile | Subject/class company-checked | zod url | |
| `/teacher/me/timetable` | GET | Own week + cover | Own profile | zod | |

Shared routes reached from the teacher portal and their scoping for a TEACHER:

| Route | Guard | Ownership | Finding |
|---|---|---|---|
| `GET /api/v2/schools/assessments` | `schools.results view` | Non-moderators forced to own `teacherProfileId` (`assessments/route.ts:111-117`) | OK |
| `GET /assessments/[id]/scores` | `schools.results view` | **None** (`[id]/scores/route.ts:48-100`) — any teacher can read any class's scores by id | Low-Med (staff-to-staff) |
| `PUT /assessments/[id]/scores` | `capture` | Own class unless `moderate` (`:151-153`) | OK |
| `GET /assessments/term-marks` | `view` | **None** — any `classId`/`classSubjectId` | Low-Med |
| `POST /assessments/term-marks` | `submit` | **None** (`term-marks/route.ts:85-100`; `rollUpTermMarks` only refuses if a non-DRAFT sheet exists, `assessments.ts:325-335`) — a teacher can roll up **any** class's marks onto a result sheet | Medium |
| `GET /assignments/[id]` (board with every pupil's submission) | `schools.academics view` | **None** (`[id]/route.ts:55-63`) | Low-Med |
| `POST /assignments`, `PATCH/POST /assignments/[id]` | `results capture` | Own class unless `moderate` | OK |
| `GET /meetings` | `students view` | `teacherProfileId` param honoured for anyone (`meetings/route.ts:63-72`) → read colleagues' bookings incl. guardian names | Low |
| `POST /meetings` | `students edit` | — | **TEACHER denied** |
| `POST /notices` | `reports create` | — | **TEACHER denied** |
| `GET/PUT /syllabus` | `academics view / edit` | — | Read OK; write HOD/office (UI honest) |
| `GET /teaching-resources` | `academics view` | shared or own (`:58-63`) | OK |

### D.3 Workflow depth — what a teacher CAN and CANNOT do

| Workflow | Verdict | Detail |
|---|---|---|
| Today view | Implemented | |
| Register capture | Partial | Save works; **no submit, no lock**, no offline queue, no per-lesson (subject) register — session keyed by class/stream/date. |
| Assessment marks entry | Implemented | Cannot create assessments in the portal. |
| Marks book / term marks / roll-up | Implemented | Roll-up not scoped to own class (see D.2). |
| Result sheet submit → HOD moderation → publish | **Missing from the portal** | Submit/approve/reject/publish/unpublish exist only under `/api/v2/schools/results/sheets/[id]/*` and admin screens. Teacher cannot see sheet status or HOD comments; `me/marks` (edit after HOD_REJECTED) has no UI. |
| Homework set / publish / mark | Implemented | No written feedback / send-back in UI. |
| Lesson plans | Implemented | |
| Scheme of work | Read-only for TEACHER | |
| Resources | Links only; no upload | |
| Timetable (with cover shown) | Implemented | Cannot request cover. |
| Parent meetings | Read works; **open/release 403** | No booking. |
| Messages to parents | Reply only; **no start-thread UI**; office queue visible to all teachers | |
| Reports | Read works; **"tell the family" 403** | |
| Report-card comments / comment bank | Missing | `SchoolResultLine.remarks` writable via `me/marks` but no UI. |
| Behaviour incidents, seating plans, cover/leave requests, gradebook weighting UI, parent communication history, department/HOD moderation queue, own audit trail | Missing | Settings/help name several of these as not built. |
| Profile / password / 2FA | Read-only; not built | |

### D.4 Concrete bugs / risks

1. Meetings mutations 403 for TEACHER — `teacher-meetings-screen.tsx:205-260` vs `meetings/route.ts:93` vs `personas.ts:139`.
2. Reports "tell the family" 403 for TEACHER — `teacher-reports-screen.tsx:232-247` vs `notices/route.ts:121` vs `personas.ts:137-142`.
3. Register never leaves DRAFT from the portal — `me/attendance/route.ts:106-118`; parent copy `parent-attendance-screen.tsx:161-168`.
4. Term-marks roll-up / read not scoped to the caller's classes — `term-marks/route.ts:41-100`.
5. Stale copy: settings says parent messaging is not built (`teacher-settings-screen.tsx:283`) while `/portal/teacher/messages` exists.
6. `me/marks` route and `handleTeacherPortalGet` have no caller (dead API surface).
7. `HOD` role cannot reach the teacher portal at all (`proxy.ts:59-65`) and would fail `getTeacherProfile` unless also given a profile; the "HOD hat" mentioned in `scheme-of-work-content.tsx:39-43` has no login path in this portal.

---

## E. Cross-portal

### E.1 Notifications & channels

| Trigger | Exists? | Channel | Evidence |
|---|---|---|---|
| School notice (office → parents/students/teachers, optional class/pupil shortlist) | Yes | **In-app only** (`Notification` + `NotificationRecipient`) | `lib/schools/notices.ts:129-200`; types `SCHOOL_NOTICE_*` (`prisma/schema.prisma:2783-2786`); `POST /api/v2/schools/notices` (`reports create`). |
| Results published | **No** | — | `results/sheets/[id]/publish/route.ts` has no notification call (grep). |
| Invoice issued / receipt posted / fee reminder | **No** automatic trigger | — | `lib/schools/fees-v2.ts`, fees routes: no notification emission. Arrears board can send a targeted notice manually (notices.ts `studentIds`). |
| Absence | **No** automatic alert | — | `attendance/follow-up` is an office list of repeat absentees, not a push (`follow-up/route.ts:8-26`). |
| Messages (thread reply) | No notification; unread badge derived from thread read timestamps (`messages.ts:51-60`). | In-app | |
| Homework set / marked | No | — | |
| Email / SMS / WhatsApp | **None** for school portals. `lib/notifications.ts` has only HR/CRM/gold/permit/work-order emitters (`:539-1326`). Invite links are copied by hand (`portal-invite-dialog.tsx:117-133`). Browser web-push preference exists (`teacher-settings-screen.tsx:125-135`) but no school event produces a push. |

### E.2 Offline / PWA

- Only the teacher shell and register import `useOfflineConnectivity` (`teacher-portal-shell.tsx:7,125`; `teacher-register-screen.tsx:25,88`), which is just `navigator.onLine` (`hooks/use-offline-connectivity.ts:21-26`). No `lib/offline/*` outbox, sync engine or module registration is used by any school portal; `lib/offline/workflow-catalog.ts:32-43` and `module-registry.ts:365-371` register **POS only**.
- The register screen and help say so honestly: "Nothing here queues the save — the teacher portal is not one of the offline modules" (`teacher-register-screen.tsx:229-240`; `teacher-help-screen.tsx:206-215`).
- `public/sw.js` is the generic app SW; `e2e/teacher-portal-shots.spec.ts:30-35` **blocks service workers** because once installed it sits in front of `/api/v2` and hangs the portal on a skeleton — a real interaction risk for portal users on installed PWAs.
- Parent and student portals have no offline handling at all.

### E.3 In-workspace mirrors

`app/schools/portal/{parent,student,teacher}/page.tsx` are three-line `redirect("/portal/<x>")` stubs. They are feature-gated to the same keys (`route-registry.ts:107-109`) and asserted by `e2e/schools-back-office-suite.spec.ts:203-211`. No drift — there is no duplicated UI. (For a staff user the redirect lands on the real portal, which then shows the "not linked" state, since the portal loaders resolve the caller's own record.)

### E.4 e2e coverage

| Spec | Portal flows with browser coverage |
|---|---|
| `e2e/smoke-school.spec.ts:60-88` | Sign-in for student, parent, teacher (URL assertion only). |
| `e2e/teacher-portal-shots.spec.ts:46-60` | 13 teacher screens load past skeleton at tablet+desktop: today, attendance, marks, marks-book, timetable, lessons, homework, files, meetings, reports, profile, settings, help. Readiness = text match; **no mutation exercised**. Service workers blocked. |
| `e2e/school-portal-gaps-suite.spec.ts` | Teacher: `/messages` empty state, `/register` → `/attendance` redirect, `/syllabus` read-only refusal text. Parent: `/messages` empty state. The file name refers to the four screens the shot spec *misses* ("gaps" in shot coverage), and it also documents two product facts: teachers may not edit the scheme (`:40-46`) and the legacy nav still links `/register` (`:30-33`). |
| `e2e/teacher-link-shots.spec.ts` | Back-office teacher↔HR link page, not the portal. |
| `e2e/schools-suite.spec.ts:16` | Admin side only; explicitly defers portals to smoke. |
| `e2e/marketing-shots.spec.ts:141,153` | Screenshots of parent/student home. |
| Not covered anywhere | Invite issue → claim → first login; register save; marks save; roll-up; homework set/mark; student hand-in; library borrow; parent fees/marks/attendance screens; any 403 negative test; the **portal-host rewrite** (`e2e/_support/fixtures.ts:157-178` records that under preview nomination portal hosts serve the tenant sign-in form and the suite drives portals by internal path). Student portal has no per-screen spec at all. |

### E.5 TODO / placeholder inventory (portal + portal-API code)

Grep for `TODO|FIXME|not yet|coming soon|placeholder|stub|mock|hard-coded` across `app/portal`, `components/schools/portal`, `app/api/v2/schools/portal`, `app/api/v2/portal`, and the portal libs found **no TODO/FIXME markers**. What exists is deliberate "not built" copy:

| File:line | Text |
|---|---|
| `components/schools/portal/teacher/teacher-settings-screen.tsx:107-109` | `NotYetAvailable` badge — used for absence alerts, daily digest, quiet hours, announcements, publish window, grade-in-messages, theme, reduced motion, compact rows, change password, 2FA, sign out everywhere, automatic lock, photograph, export data. |
| `teacher-settings-screen.tsx:283` | "Parent messaging is not built in this portal yet" (stale). |
| `teacher-settings-screen.tsx:319` | "A dark one is not built". |
| `teacher-settings-screen.tsx:347-350` | "no self-service password change… no second factor… no device session list". |
| `teacher-help-screen.tsx:206-215` | Offline: "Not yet. Nothing queues on the device". |
| `teacher-files-screen.tsx:404-408`; `me/resources/route.ts:12-18` | "Links only for now… uploading the file itself arrives with the documents work". |
| `teacher-register-screen.tsx:229-240` | "the teacher portal is not one of the offline modules". |
| `student-settings-screen.tsx:16-22, 79-84` | PIN, notification cadence, theme "not here yet". |
| `student-profile-screen.tsx:37` | Settings subtitle "Alerts, theme and your PIN" (none exist). |
| `student-portal shell/settings page.tsx:3` | "with what is not built named as such". |
| `parent-fees-screen.tsx:36-38` | "there is no payment flow in this portal". |
| `parent-home-screen.tsx:230` | "Ready" / "Not yet" marks indicator (data-driven, fine). |
| `parent-attendance-screen.tsx:148,161-168` | "not yet submitted" for DRAFT registers. |
| `me/library/route.ts:193-196` | "Settling a fine is deliberately absent". |
| `me/lessons/route.ts:318-321` | "Arranging cover is deliberately absent". |
| `lib/platform/gating/portal-isolation.ts:165-200` | Hard-coded nav to non-existent routes (dead module). |
| `app/portal/pos/overview|customers/page.tsx:4` | "Was a redirect stub" (POS, out of scope). |

---

## F. Security findings

| # | Finding | Location | Severity |
|---|---|---|---|
| F1 | **Unpublished marks exposed to pupils.** `currentMark` in `/api/v2/schools/portal/student/me/subjects` and `goalsForStudent` read result lines for the term with no `sheet.status = PUBLISHED` filter, so DRAFT/SUBMITTED/HOD_REJECTED marks appear on the Goals screen. | `app/api/v2/schools/portal/student/me/subjects/route.ts:68-71`; `lib/schools/goals-meetings.ts:110-114`; UI `student-goals-screen.tsx:127-138` | **Medium** (breaks the moderation/publish guarantee; child sees a grade "that never was" — the exact failure `child/marks/route.ts:8-15` warns about). |
| F2 | **Claim can hijack/demote an existing same-tenant account.** Any staff who can issue invites (`schools.students create` + oversight role: REGISTRAR, BURSAR, SCHOOL_ADMIN…) chooses `sentTo`; claiming resets that user's password and sets role to PARENT/STUDENT if the email already exists in the tenant. | `lib/schools/portal-invites.ts:243-273`; issuer check `app/api/v2/schools/portal-invites/route.ts:135-140` | **Medium** (lockout/demotion of a higher-privileged account; also lets the inviter know a working password for that email). Fix: refuse when `existing` exists with a non-portal role or when `existing.id` is already linked; or require the invite email to be unused. |
| F3 | **Teacher can roll up any class's term marks onto a result sheet, and read any class's term marks / assessment scores / homework board.** Permission is checked, ownership is not. | `app/api/v2/schools/assessments/term-marks/route.ts:41-100`; `assessments/[id]/scores/route.ts:48-100` (GET); `assignments/[id]/route.ts:55-63` (GET) | **Medium** (staff-to-staff within tenant; write side can create a DRAFT sheet for a colleague's class). |
| F4 | **Every teacher can read every office-addressed parent thread** (`teacherProfileId: null`) including the child named and full message bodies, and can start a thread with **any** guardian in the school. | `lib/schools/messages.ts:133-149, 201-210`; `app/api/v2/schools/portal/teacher/me/messages/route.ts:67-72, 98-110` | **Low–Medium** (privacy/safeguarding: a supply teacher sees the whole office inbox). Design note in code acknowledges the office-queue choice. |
| F5 | `startThread` writes a client-supplied `teacherProfileId` without a `companyId` check (parent API accepts it; parent UI sends null). | `lib/schools/messages.ts:250-310`; `app/api/v2/schools/portal/parent/messages/route.ts:23-31` | **Low** (FK only; cross-tenant id would attach a foreign staff id to a thread; `threadsForStaff` is company-filtered so it would not surface, but the row is wrong). |
| F6 | Meetings schedule readable for any `teacherProfileId` in tenant by any `schools.students view` holder (all teachers), exposing guardian names/notes on bookings. | `app/api/v2/schools/meetings/route.ts:57-72`; `lib/schools/goals-meetings.ts:~490-520` | **Low** |
| F7 | Portal mutations are not audited. `SchoolAuditEventType` covers fees/import only; no portal route writes an audit row (register save, marks, homework, messages, library loans). Teacher help promises "Access to pupil records is written to an audit trail". | `lib/schools/audit.ts:21-69`; grep of `app/api/v2/schools/portal/**`; `teacher-help-screen.tsx:222-228` | **Low** (traceability). |
| F8 | Library self-issue: a pupil can create a loan against a copy from the phone (`issuedById` = the pupil), moving physical stock in the system without a librarian. | `app/api/v2/schools/portal/student/me/library/route.ts:210-233` | **Low** (integrity). |
| F9 | Parent role cannot render any school document, so the two portal download buttons always fail (functional, not a leak). Conversely the render route has **no row-level check** for school documents — any role holding `schools.fees view` (BURSAR etc.) can render any invoice/receipt by id; fine for staff, but if PARENT were simply granted `schools.fees view` it would become an IDOR. Any future fix must add a guardian-link check. | `app/api/documents/render/route.ts:101-108`; `lib/documents/schools-sources.ts:77-93`; `personas.ts:160-162` | **High (functional)** / **design note** |
| F10 | On a portal host the proxy rewrites before the role→portal check, so a PARENT/STUDENT token on `staff.<tenant>` (or a TEACHER on `parents.`) is served the other portal's shell (empty). No cross-role data because loaders resolve the caller's own record, but no redirect and no sign-in refusal (unlike POS `lib/auth.ts:567-579`). | `proxy.ts:417-460` vs `:469-479` | **Low** |
| F11 | No rate limit on `/api/public/schools/claim/[token]` GET/POST (token space 2^256 → enumeration infeasible; password-set POST not throttled). | `app/api/public/schools/claim/[token]/route.ts` | **Low** |
| F12 | Legacy aggregate routes (`/api/v2/schools/portal/parent`, `/student`, `/parent/children/[studentId]/*`) re-implement scoping inline instead of `scopeToChild`, and the student aggregate returns guardians' phone/email to the pupil. They are unused by the new shells but remain reachable. | `app/api/v2/portal/_handlers.ts:119-560`; `parent/children/[studentId]/{fees,results}/route.ts` | **Low** (drift risk; candidates for removal). |
| F13 | Parent `child/marks` honours only `sheet.status = PUBLISHED`; the term/class **publish window** (`SchoolResultPublishWindow`) is enforced only for the report-card PDF (`schools-sources.ts:492-499`), so a sheet published before the window opens is visible in JSON but refused as a PDF. | `app/api/v2/schools/portal/parent/child/marks/route.ts:40-46`; `results/sheets/[id]/publish/route.ts:55` (publish itself requires an open window, which narrows the exposure to windows later closed) | **Low** |

### Positive controls worth keeping

- Single identity resolver with hard-403 on any foreign id (`portal-identity.ts:70-125`), used by every new route.
- Consent flags enforced server-side per child, with an integration test that drives real handlers (`parent-scope.test.ts`).
- Invite tokens hashed, single-use, superseded on re-issue, uniform 404 on lookup; cross-tenant email refused.
- Teacher write routes (`me/attendance`, `me/marks`, `me/lessons`, `me/register`, `assessments PUT scores`, `assignments POST/PATCH`) all check the caller's own `SchoolClassSubject` assignment, and refuse LOCKED registers / non-DRAFT sheets.
- Money crosses the wire as strings (`child/fees/route.ts:19-22, 83-111`).
