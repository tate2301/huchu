# Evidence: back-office workflow audit (code-level)

Raw code-level findings behind the admin, head and bursar workflow documents. Line numbers are as of 2026-09-14 on `main`. The persona documents cite this file; read it when you need the exact route, guard, or model behind a finding.


Scope: `app/schools/**`, `app/management/master-data/schools/**`, `app/home/schools`, `components/schools/**` (non-portal), `lib/schools/**`, `app/api/v2/schools/**` (excluding `portal/**`), Prisma school models. Static reading only (no node_modules). All paths are relative to `/home/user/huchu`.

Role model used throughout (`lib/platform/personas.ts:84-155`, `lib/schools/permissions.ts`, `lib/schools/access.ts`):

| Persona | academics | admissions | students | teachers | attendance | fees | boarding | results | reports |
|---|---|---|---|---|---|---|---|---|---|
| SCHOOL_ADMIN | all | all | all | all | all | all | all | all | all |
| REGISTRAR | view/create/edit | view/create/edit/approve | view/create/edit/archive/invite | view/create/edit | view | view | view | view | view |
| BURSAR | view | view | view/invite | — | — | view/create/edit/issue/receive-payment/waive/write-off/void/refund | — | — | view |
| HOD | view | — | view | view | view | — | — | view/moderate/request-changes/approve | view |
| TEACHER | view | — | view | — | view/capture/submit | — | — | view/capture/submit | — |
| WARDEN | — | — | view | — | view | — | view/create/edit/allocate-bed/approve-leave/check-in/check-out | — | view |

SUPERADMIN / MANAGER bypass everything (`lib/schools/permissions.ts:38-47`). Note that `schools.reports:create` exists only for SCHOOL_ADMIN — this single fact drives several findings below because notices and messages are guarded on that resource.

Two other role sets matter: `PORTAL_OVERSIGHT_ROLES` = SUPERADMIN/MANAGER/SCHOOL_ADMIN/REGISTRAR/BURSAR (`lib/schools/portal-identity.ts:33-39`) and `privilegedRoles` = the same five (`lib/schools/governance-v2.ts`). HOD, TEACHER and WARDEN are in neither.

---

## A. Page inventory

Every page under `app/schools/**` is a thin server shell that calls `getServerSession` and redirects to `/login` when absent; none of the shells apply a persona gate themselves — gating is either in the content component (via `useSchoolAccess`, `components/schools/common/use-school-access.ts`) or left to the API. Feature gating comes from `lib/platform/gating/route-registry.ts` (see Section D). "Gate" below therefore means the component-level persona gate; "API-only" means the component renders every verb and relies on the API's 403.

Status key: **Complete** = UI → API → DB with persona checks; **Partial** = something missing (UI verb without API, API without UI, redirect-only page, no gate on a mutating verb); **Broken** = a bug a user would hit.

### ADMIN (configuration & master data)

| Route | Purpose | Component | Persona gate | APIs | Status | Notes |
|---|---|---|---|---|---|---|
| `/management/master-data/schools/identity` | Student-number format, ID-card design, custom fields | `academics/identity-settings-content.tsx`, `academics/school-custom-fields-panel.tsx` | Yes — `isAdmin` mirror of `isSchoolAdmin` (`identity-settings-content.tsx:82-84`, read-only alert :157) | `GET/PUT /settings/identity`, `GET/POST/PATCH/DELETE /field-definitions` | Complete | Only page that gates its own controls (acknowledged in `lib/schools/access.ts:14-16`). Custom fields panel has no gate but API enforces `students:configure` (SCHOOL_ADMIN only). |
| `/management/master-data/schools/years` | Academic years & terms (create, activate, delete) | `academics/schools-years-content.tsx` → `schools-calendar-content.tsx` | API-only | `academic-years`, `terms` CRUD via `admin-v2.ts` | Complete | Single-active-year/term enforced by DB partial index + `activateAcademicYear`/`activateTerm` in a transaction (`lib/schools/calendar.ts:179-204`). |
| `/management/master-data/schools/periods` (`?view=rooms`) | Periods and rooms | `academics/school-day-content.tsx` | API-only | `periods`, `rooms` CRUD | Complete | |
| `/management/master-data/schools/classes` + `/[id]` | Classes, streams; class record with subjects & pupils | `classes/schools-classes-content.tsx`, `records/class-record-page.tsx`, `class-streams-panel.tsx`, `class-subjects-panel.tsx` | API-only (record actions use `RecordActions` which does gate, `common/record-actions.tsx:80-84`) | `classes`, `streams`, `teachers/assignments`, `students?classId=` | Complete | |
| `/management/master-data/schools/subjects` + `/[id]` | Subjects & syllabus record | `subjects/schools-subjects-content.tsx`, `records/subject-record-page.tsx` | API-only | `subjects` CRUD, `syllabus` | Complete | |
| `/management/master-data/schools/grading` | Grading schemes + publish windows | `academics/grading-content.tsx` | API-only | `grading-schemes` CRUD, `results/publish/windows` CRUD | Complete | Publish windows are configured here, not under `/schools/results`. |
| `/schools/academics` | — | redirect → `/management/master-data/schools/years` (`app/schools/academics/page.tsx:9`) | n/a | n/a | Partial (alias) | |
| `/schools/academics/identity` | — | redirect → master-data identity | n/a | n/a | Partial (alias) | |
| `/schools/academics/syllabus` | "Scheme of work" | redirect → `/portal/teacher/syllabus` (`app/schools/academics/syllabus/page.tsx:11`) | n/a | n/a | **Broken for non-teachers** | Nav item "Scheme of work" (`lib/navigation.ts:343`) sends the office to a teacher-portal page gated on `schools.portal.teacher` (route-registry :125) and rendered by teacher identity; the e2e sweep expects "You are not linked to a teacher profile" (`e2e/schools-back-office-suite.spec.ts:218`). A head with no teacher profile gets a dead end. |
| `/schools/classes`, `/schools/classes/[id]`, `/schools/subjects`, `/schools/subjects/[id]` | — | redirects to master-data | n/a | n/a | Partial (alias) | |
| `/schools/calendar` | Calendar events (holidays, exams…) | `academics/school-calendar-page-content.tsx` → `school-days-content.tsx` | API-only | `GET/POST /calendar`, `DELETE /calendar/[id]` | Partial | No `PATCH /calendar/[id]` route exists and the component only creates/deletes (`school-days-content.tsx:133,169,192`); editing an event = delete + recreate. |
| `/schools/timetable` | Timetable grid, auto-fill, copy-forward | `timetable/schools-timetable-content.tsx` | Yes — `canBuild = academics:create` (:467) | `timetable` CRUD, `timetable/auto-fill`, `timetable/copy-forward` | Complete | Clash detection returns all conflicts (`lib/schools/timetable.ts:135`). |
| `/schools/teachers` + `/[id]` | Teacher profiles, subjects, bulk allocation, HR link | `teachers/schools-teachers-content.tsx`, `records/teacher-record-page.tsx` | API-only (record page uses `RecordActions`) | `teachers/profiles` CRUD, `teachers/subjects`, `teachers/assignments/bulk`, `teachers/profiles/[id]/employee`, `teachers/candidates` | Complete | Profile DELETE is a hard delete (`teachers/profiles/[id]/route.ts:201`). |
| `/schools/teachers/assignments` | Class-subject-teacher assignments | `teachers/teacher-assignments-content.tsx`, `teacher-assignments-panel.tsx` | Yes — `canCreate = teachers:create` (`teacher-assignments-panel.tsx:85`) | `teachers/assignments` CRUD | Complete | |
| `/schools/staff` | Non-teaching staff (HR employees with SCHOOLS assignment) | `staff/school-staff-content.tsx`, `school-staff-sheet.tsx` | API-only | `GET/POST /staff`, `PATCH /staff/[id]` | Complete | Deliberately re-doors `/api/employees` (which 403s school roles) — `staff/route.ts` header. |
| `/schools/guardians` + `/[id]` | Guardians, links, consent flags, portal invites | `guardians/guardians-content.tsx`, `records/guardian-record-page.tsx`, `guardian-children-panel.tsx`, `guardian-portal-panel.tsx` | Yes on children panel — `canEdit = students:edit` (:177) | `guardians` CRUD, `guardian-links`, `portal-invites`, `field-definitions?entity=GUARDIAN` | Complete | Guardian DELETE is a hard delete (`guardians/[id]/route.ts:253`). |
| `/schools/imports` | CSV import: classes, students, guardians, fee structures, opening balances | `imports/schools-import-content.tsx` | Partial — fee entities disabled unless `fees:create` (:687) | `imports` (create/mapping/dry-run/commit/rollback) | Complete, with a role-composition gap (F-9) | Audit rows written on commit/rollback (`lib/schools/audit.ts:88-89`). |
| `/schools/documents` | Render report cards, invoices, class lists, registers | `documents/school-documents-content.tsx` | API-only | `assessments/term-marks`, `fees/invoices`, documents engine | Partial | Only 4 of the 8 document sources are surfaced (`school-documents-content.tsx:770-773`); receipt, statement, admission letter and transfer letter exist in `lib/documents/schools-sources.ts:47-56` but have no page here. |
| `/schools/transport` | Routes, stops, riders, boarding register | `transport/transport-content.tsx` | API-only | `transport` (+`routes/[id]`, `stops/[id]`, `riders/[id]`) | Partial | `transportBilling` is "reported rather than posted" (`lib/schools/transport.ts:255-262`) — no invoice lines. |
| `/schools/library` + `/library/loans` | Catalogue, copies, loans, fines | `library/library-content.tsx`, `library-loans-content.tsx` | API-only | `library` CRUD, `library/loans` | Complete | Fines computed (`lib/schools/library-rules.ts`) but never posted to fees. |
| `/schools/boarding/hostels` + `/boarding/[id]` | Hostels, rooms, beds | `boarding/boarding-hostels-content.tsx`, `hostel-rooms-panel.tsx`, `records/hostel-record-page.tsx` | API-only | `boarding/hostels/**` | Complete | Presentation fields require `isSchoolAdmin` (`boarding/hostels/[id]/route.ts`). |
| `/schools/notices` | Broadcast notices | `notices/schools-notices-content.tsx`, `common/send-notice-dialog.tsx` | API-only | `GET/POST /notices` | Partial | Delivery is in-app only (`lib/schools/notices.ts:169-199`) — recipients without a portal account are counted as `withoutAccount` and not reached. Requires `reports:create` = SCHOOL_ADMIN only. |
| `/schools/portal/{parent,student,teacher}` | aliases | redirects | n/a | n/a | alias | |
| `/home/schools` | Public marketing page | `app/home/schools/page.tsx` | none (public) | none | Complete | Not part of the workspace. |

### HEAD (SCHOOL_ADMIN + HOD academic governance)

| Route | Purpose | Component | Persona gate | APIs | Status | Notes |
|---|---|---|---|---|---|---|
| `/schools` | Overview dashboard | `schools-dashboard-content.tsx` (1247 l) | API-only | `attendance/oversight`, `results/sheets`, `results/publish/windows`, `applications`, `assignments/oversight`, `goals/oversight`, `meetings`, `library?overdueOnly`, `boarding/leave-requests`, `reports/occupancy`, `reports/arrears`, `reports/collections`, `health`, `notices` | Complete | Panels: registers to come in (:771), waiting on somebody (:872), homework overdue (:929), fees this term (:1021), this week (:1072), boarding (:1121). An HOD sees 403s from the fees/boarding/admissions panels since HOD lacks those grants — the component does not hide them. |
| `/schools/admissions` | Applications pipeline (kanban by stage), enrol | `admissions/admissions-board-content.tsx` | API-only | `applications` (GET/POST/PATCH), `applications/[id]/enrol` | Complete | Stage machine in `lib/schools/admissions-stages.ts:59-70`; enrol is transactional (`lib/schools/admissions.ts:253`). HOD has no `schools.admissions` grant at all — the page 403s for HOD. |
| `/schools/students` + `/[id]` + `/class/[classId]` | Roll, student record (overview/attendance/files), class roll | `students/students-list-content.tsx`, `records/student-record-page.tsx`, `students/class-students-content.tsx` | Record actions gated via `RecordActions`; list is API-only | `students` CRUD, `students/[id]/attendance`, `health/[id]`, `library/loans`, `portal-invites`, `notices` | Complete | DELETE is a hard delete when no related rows (`students/[id]/route.ts:379`), despite the verb being `archive`. |
| `/schools/students/roll-up` | Year roll-up plan/apply | `students/year-rollup-content.tsx` | API-only | `GET/POST /year-rollup` | Complete | Plan never stored; apply idempotent on enrolment unique index (`lib/schools/year-rollup.ts:1-14`); transactional. Route persona is `students:archive` (`year-rollup/route.ts:81`) so REGISTRAR and SCHOOL_ADMIN can run it. |
| `/schools/attendance` | Whole-school register oversight; office can create/edit/delete a register | `attendance/register-oversight-content.tsx` | API-only | `attendance/oversight`, `attendance/sessions` (GET/POST/PATCH/DELETE), `notices` | Complete | Office PATCH refuses only LOCKED (`attendance/sessions/[id]/route.ts:97`), so a SUBMITTED register can be silently altered by SCHOOL_ADMIN with no audit row. |
| `/schools/attendance/follow-up` | Absent-today list, send reminders | `attendance/absence-follow-up-content.tsx` | API-only | `attendance/follow-up`, `notices` | Complete for SCHOOL_ADMIN | Send is `reports:create` → HOD/REGISTRAR cannot send. |
| `/schools/results` | Results overview | `results/results-overview-content.tsx` | API-only | `results`, `results/sheets`, `results/publish/windows` | Complete | |
| `/schools/results/sheets` | Sheet list, create | `results/mark-sheets-content.tsx` | API-only | `results/sheets` | Complete | Create = `results:create` (SCHOOL_ADMIN only); teachers cannot create sheets — sheets are usually created by `rollUpTermMarks` (`lib/schools/assessments.ts:313`). |
| `/schools/results/class/[classId]` | Class results & assessments | `results/class-results-content.tsx`, `assessments/class-assessments-content.tsx` | API-only | `assessments` CRUD, `assessments/[id]/scores`, `assessments/term-marks` (GET/POST roll-up) | Complete | Roll-up refused once the sheet leaves DRAFT (:326-330). |
| `/schools/results/moderation` | HOD queue: approve / send back | `results/moderation-queue-content.tsx` | Yes — `approve || moderate` (:241-242) | `results/sheets/[id]/hod-approve`, `/hod-request-changes` | Complete | HOD persona additionally needs a `SchoolTeacherProfile.isHod` and an assignment on the class (`hod-approve/route.ts:44-58`), otherwise 403 — an HOD account without a linked teacher profile cannot moderate. |
| `/schools/results/publish` | Publish/unpublish sheets; view windows | `results/publishing-content.tsx` | API-only | `results/sheets/[id]/publish`, `/unpublish`, `results/publish/windows` | Complete | Publish requires an OPEN window (`publish/route.ts:37-50`); no parent notification on publish. |
| `/schools/results/publish/windows` | — | redirect → master-data grading (`page.tsx:9`) | n/a | n/a | alias | Nav item "Publishing windows" points at a redirect. |
| `/schools/homework` | Homework oversight, boards | `homework/homework-oversight-content.tsx`, `assignment-board-dialog.tsx` | Board message gated `reports:create` (:112) | `assignments/oversight`, `assignments/[id]`, `notices` | Complete | |
| `/schools/teaching/lessons` | Lesson plan oversight / cover | `timetable/lesson-plans-page-content.tsx`, `lesson-plans-content.tsx` | API-only | `lesson-plans` (GET/POST/DELETE) | Complete | Cover uses `teachers:edit`; no PATCH route (upsert via POST). |
| `/schools/teaching/resources` | Teaching resources | `timetable/resources-content.tsx` | API-only | `teaching-resources` CRUD | Complete | |
| `/schools/goals` | Subject targets oversight | `goals/goals-oversight-content.tsx` | Yes — `canWrite = students:edit` (:364) | `goals`, `goals/oversight` | Complete | |
| `/schools/meetings` | Parent meetings (slots/bookings) | `meetings/meetings-admin-content.tsx` | Yes — `canBook = students:edit`, `canWriteToFamilies = reports:create` (:478-480) | `meetings`, `notices` | Complete | |
| `/schools/boarding` | Bed board | `boarding/schools-boarding-content.tsx`, `bed-board-content.tsx` | API-only | `boarding`, `boarding/allocations/[id]` | Complete | |
| `/schools/boarding/allocations` | Allocations list/edit | `boarding/boarding-allocations-content.tsx`, `boarding-dialogs.tsx` | API-only | `boarding/allocations` | Complete | Gender/capacity refusals in `lib/schools/boarding-rules.ts`. |
| `/schools/boarding/leave` | Leave/outing requests: create, approve/reject, check-out/in | `boarding/boarding-leave-content.tsx`, `leave-requests-panel.tsx` | API-only | `boarding/leave-requests`, `/[id]/approve`, `/check-out`, `/check-in` | Complete | Create requires `boarding:approve-leave` (`leave-requests/route.ts` POST) — only warden/admin create requests. |
| `/schools/boarding/welfare` | Health records & events | `boarding/welfare-content.tsx` | API-only | `health`, `health/[studentId]` | Complete but mis-gated | Health is behind `schools.boarding` feature and `schools.boarding` persona (`health/[studentId]/route.ts`, route-registry :387) — a day school has no welfare screen and REGISTRAR/HOD cannot read health (F-11). |
| `/schools/messages` | Office inbox (guardian threads) | `messages/office-inbox-content.tsx` | API-only | `messages` GET/POST | Complete | POST = `reports:create` — only SCHOOL_ADMIN can reply. |
| `/schools/reports` | Enrolment/occupancy/collections/arrears + export | `reports/schools-reports-enhanced-content.tsx` | Yes — `canRemind = reports:create` (:699) | `reports/*`, `reports/export` | Complete | Export CSV/PDF (`reports/export/route.ts:35-36`). |

### BURSAR (fees & finance)

| Route | Purpose | Component | Persona gate | APIs | Status | Notes |
|---|---|---|---|---|---|---|
| `/schools/finance` | Fees by year group (grade picker), arrears CSV, reminders | `fees/fees-grade-picker.tsx` | Yes — `canRemind = fees:create` (:184) | `fees/by-class`, `reports/export?reportType=arrears`, `notices` | **Broken for BURSAR** | Reminder button is enabled by `fees:create` but posts to `/notices` which requires `reports:create` (`notices/route.ts:121`) → bursar gets 403 after composing (F-1). |
| `/schools/finance/class/[classId]` | Class finance view: issue, discard, write-off | `fees/class-fees-content.tsx` | API-only | `fees/invoices/[id]/issue`, `DELETE fees/invoices/[id]`, `write-off` | Complete | |
| `/schools/finance/ledger` (`?view=invoices|receipts|credits|refunds|waivers|structures`) | The ledger: all money verbs | `fees/schools-fees-content.tsx` (2197 l), `fee-dialogs.tsx`, `bulk-generate-invoices-dialog.tsx`, `copy-structure-dialog.tsx` | API-only | `fees/structures` CRUD + clone, `fees/invoices` create/edit/discard/issue/write-off/bulk-generate, `fees/receipts` create/void/fiscalise, `receipts/[id]/allocate`, `fees/waivers` create/edit/discard/apply, `finance/refunds` request/pay/cancel, `fees/credits` | Complete | Every money verb is wired end to end. Gaps: no route to post a DRAFT receipt (F-3); waiver "approve" is an alias of apply (F-4). |
| `/schools/finance/arrears` | Arrears & ageing, reminders | `reports/reports-arrears-content.tsx` | Yes — `canRemind = reports:create` (:445) | `reports/arrears`, `reports/export`, `notices` | Partial | Correctly disables the button for BURSAR — but that means the bursar cannot chase arrears from this screen at all. |
| `/schools/finance/{invoices,receipts,refunds,waivers}` | aliases | redirect → ledger tab | n/a | n/a | alias | e2e checks the `?view=` survives (`schools-back-office-suite.spec.ts:240`). |
| `/schools/fees` | alias | redirect → `/schools/finance` | n/a | n/a | alias | |
| `/schools/documents` (fee invoices tab) | Print invoices | see ADMIN | | | Partial | Receipts and statements have document sources but no UI (F-14). |

---

## B. API inventory

Method column shows `{resource:action}` per handler as read from `schoolPermissionDenial(...)`; `+isSchoolAdmin` = extra admin-only branch; `cvp` = `canViewAnyPortalSubject`. Tenant = every DB access scoped by `session.user.companyId` (all routes below pass unless noted). Audit = `writeSchoolAuditEvent`. Notif = writes `Notification`/`NotificationRecipient`.

### ADMIN routes

| Route | Methods | Permission | Tenant | Audit | Notes |
|---|---|---|---|---|---|
| `/academic-years`, `/[id]` | GET view · POST create · PATCH edit · DELETE archive (academics) | yes | yes | no | activation transactional in lib |
| `/terms`, `/[id]` | same | yes | yes | no | |
| `/periods`, `/[id]` | same | yes | yes | no | |
| `/rooms`, `/[id]` | same | yes | yes | no | |
| `/classes`, `/[id]` | same; PATCH `+isSchoolAdmin` for presentation | yes | yes | no | |
| `/streams`, `/[id]` | same | yes | yes | no | |
| `/subjects`, `/[id]` | same; PATCH `+isSchoolAdmin` | yes | yes | no | |
| `/syllabus` | GET view · PUT edit (academics) | yes | yes | no | transactional |
| `/grading-schemes`, `/[id]` | GET view · POST create · PATCH edit · DELETE archive (academics) | yes | yes | no | transactional; feature `schools.results` |
| `/calendar`, `/[id]` | GET view · POST create · DELETE edit (academics) | yes | yes | no | no PATCH |
| `/settings/identity` | GET view · PUT edit `+isSchoolAdmin` | yes | yes | no | |
| `/field-definitions`, `/[id]` | GET students:view · POST/PATCH/DELETE students:configure | yes | yes | no | SCHOOL_ADMIN only (configure) |
| `/staff`, `/[id]` | GET teachers:view · POST teachers:create · PATCH teachers:edit | yes | yes | no | writes HR `Employee` |
| `/teachers/[id]` | GET view · PATCH edit `+isSchoolAdmin` (teachers) | yes | yes | no | narrow profile edit (S-4.3) |
| `/teachers/profiles`, `/[id]` | GET view · POST create · PATCH edit · DELETE archive | yes | yes | no | DELETE is hard delete |
| `/teachers/profiles/[id]/employee` | GET view · PUT edit · DELETE edit | yes | yes | no | HR link/unlink |
| `/teachers/candidates` | GET view | yes | yes | no | |
| `/teachers/subjects` | GET view · POST create | yes | yes | no | |
| `/teachers/assignments`, `/[id]`, `/bulk` | GET view · POST create · PATCH edit · DELETE archive · POST bulk create | yes | yes | no | |
| `/timetable`, `/[id]`, `/auto-fill`, `/copy-forward` | GET view · POST create · PATCH edit · DELETE archive · POST create ×2 (academics) | yes | yes | no | copy-forward transactional in lib |
| `/guardians`, `/[id]` | GET students:view · POST create · PATCH edit `+isSchoolAdmin` · DELETE archive | yes | yes | no | hard delete |
| `/guardian-links` | POST students:edit + cvp | yes | yes | no | |
| `/guardian-links/[id]` | **PATCH: no `schoolPermissionDenial`** (only `cvp`, :55) · DELETE students:archive + cvp | yes | yes | no | see F-6 |
| `/portal-invites`, `/[id]/revoke` | GET students:view+cvp · POST students:create+cvp · POST revoke students:invite+cvp | yes | yes | no | |
| `/imports/**` | `importPermissionDenial` (students:view/create, + fees for FEE_STRUCTURE/OPENING_BALANCE) | yes | yes | commit & rollback (lib) | |
| `/library`, `/[id]`, `/loans` | GET academics:view · POST create · PATCH edit · DELETE archive · loans POST academics:edit | yes | yes | no | |
| `/transport`, `/routes/[id]`, `/stops/[id]`, `/riders/[id]` | GET students:view · POST students:edit · PATCH/DELETE students:edit (routes DELETE archive) | yes | yes | no | |
| `/teaching-resources`, `/[id]` | GET view · POST create · PATCH edit · DELETE archive (academics) | yes | yes | no | |
| `/lesson-plans`, `/[id]` | GET academics:view · POST academics:edit (cover: teachers:edit, :162) · DELETE academics:edit | yes | yes | no | |
| `/notices` | GET reports:view · POST reports:create | yes | yes | no | Notif: in-app only |
| `/messages` | GET reports:view · POST reports:create | yes | yes | no | |
| `/` (dashboard counts) | GET students:view | yes | yes | no | |

### HEAD routes

| Route | Methods | Permission | Tenant | Audit | Notes |
|---|---|---|---|---|---|
| `/applications`, `/[id]`, `/[id]/enrol` | GET admissions:view · POST create · PATCH edit (approve when moving to OFFERED/ACCEPTED) · POST enrol admissions:approve | yes | yes | no | `SchoolApplicationEvent` trail; enrol transactional |
| `/enrollments` | GET admissions:view · POST admissions:create | yes | yes | no | transactional |
| `/students`, `/[id]`, `/[id]/attendance` | GET students:view · POST create · PATCH edit `+isSchoolAdmin` · DELETE archive · GET attendance:view | yes | yes | no | hard delete |
| `/year-rollup` | GET students:view · POST students:archive | yes | yes | no | transactional in lib |
| `/attendance`, `/oversight`, `/follow-up` | GET attendance:view | yes | yes | no | |
| `/attendance/sessions`, `/[id]`, `/[id]/submit`, `/[id]/lock` | GET view · POST create · PATCH edit · DELETE archive · POST submit ×2 (attendance) | yes | yes | no | lock uses `submit` verb → TEACHER can lock |
| `/assessments`, `/[id]`, `/[id]/scores`, `/term-marks` | GET results:view · POST/PATCH/DELETE results:capture (moderate when LOCKED) · PUT scores capture/moderate · POST term-marks results:submit | yes | yes | no | roll-up transactional |
| `/results` | GET results:view | yes | yes | no | |
| `/results/sheets`, `/[id]` | GET view · POST results:create (+privileged) · PATCH results:edit · DELETE results:archive | yes | yes | no | POST transactional |
| `/results/sheets/[id]/submit` | POST results:submit (+teacher scope) | yes | yes | ModerationAction only | not transactional (F-7) |
| `/results/sheets/[id]/hod-approve` | POST results:moderate (+isHod & class scope for non-privileged) | yes | yes | ModerationAction | not transactional |
| `/results/sheets/[id]/hod-request-changes` | POST results:request-changes (+isHod) | yes | yes | ModerationAction | |
| `/results/sheets/[id]/publish` | POST results:publish + privileged + open window | yes | yes | ModerationAction | no notification |
| `/results/sheets/[id]/unpublish` | POST results:unpublish | yes | yes | ModerationAction | no window/role check beyond persona |
| `/results/publish/windows`, `/[id]` | GET results:view · POST/PATCH/DELETE results:publish | yes | yes | no | |
| `/assignments`, `/[id]`, `/oversight` | GET academics:view · POST results:capture/moderate · PATCH capture/moderate · POST (submission mark) capture | yes | yes | no | |
| `/goals`, `/oversight` | GET students:view · POST students:edit | yes | yes | no | |
| `/meetings` | GET students:view · POST students:edit | yes | yes | no | |
| `/boarding`, `/hostels/**`, `/allocations/**` | GET boarding:view · POST create/allocate-bed · PATCH edit/allocate-bed · DELETE archive; hostel PATCH `+isSchoolAdmin` | yes | yes | no | allocation transactional |
| `/boarding/leave-requests`, `/[id]`, `/approve`, `/check-out`, `/check-in` | GET view · POST approve-leave · PATCH edit · DELETE approve-leave · POST approve-leave · check-out · check-in | yes | yes | no | check-in/out transactional (movement log) |
| `/health`, `/[studentId]` | GET boarding:view · PUT/POST boarding:edit · DELETE boarding:archive | yes | yes | no | feature `schools.boarding` |
| `/reports/{arrears,collections,enrollment,occupancy,export}` | GET reports:view | yes | yes | no | |

### BURSAR routes

| Route | Methods | Permission | Tenant | Audit | Notes |
|---|---|---|---|---|---|
| `/fees` (= `/finance`) | GET fees:view | yes | yes | no | summary |
| `/fees/by-class`, `/fees/credits` | GET fees:view | yes | yes | no | |
| `/fees/structures` | GET view · POST create | yes | yes | **no** on POST | create is silent; edit/activate/archive are audited |
| `/fees/structures/[id]`, `/clone` | GET view · PATCH edit · DELETE archive · POST edit | yes | yes | yes | transactional |
| `/fees/invoices` (= `/finance/invoices`) | GET view · POST create | yes | yes | yes | tx; accounting event when created ISSUED |
| `/fees/invoices/[id]` | GET view · PATCH edit · DELETE void (DRAFT only) | yes | yes | yes | |
| `/fees/invoices/[id]/issue` | POST fees:issue | yes | yes | yes | tx; GL `SCHOOL_FEE_INVOICE_ISSUED` |
| `/fees/invoices/[id]/write-off` | POST fees:write-off | yes | yes | yes | tx; GL posted **after** tx (F-5); no DRAFT guard |
| `/fees/invoices/bulk-generate` | POST fees:issue | yes | yes | yes (one row per run) | per-invoice tx; duplicate live invoice skipped via partial unique index |
| `/fees/receipts` (= `/finance/receipts`) | GET view · POST receive-payment | yes | yes | yes | tx with row locks; GL + fiscalisation after tx |
| `/fees/receipts/[id]/allocate` | POST receive-payment | yes | yes | yes | tx; requires POSTED |
| `/fees/receipts/[id]/void` | POST fees:void | yes | yes | yes | tx; refuses if refunded; **no fiscal check** (F-8) |
| `/fees/receipts/[id]/fiscalise` | GET view · POST fees:issue | yes | yes | yes | manual ZIMRA resend |
| `/fees/waivers` (= `/finance/waivers`) | GET view · POST fees:create | yes | yes | yes | may be created directly as APPROVED/APPLIED (:35,197) |
| `/fees/waivers/[id]` | GET view · PATCH waive · DELETE waive | yes | yes | yes | |
| `/fees/waivers/[id]/apply` (= `/finance/waivers/[id]/approve`) | POST fees:waive | yes | yes | yes | tx; applier becomes approver (:138) — F-4 |
| `/finance/refunds` | GET view · POST fees:refund | yes | yes | yes | tx; checks available credit |
| `/finance/refunds/[id]/pay`, `/cancel` | POST fees:refund | yes | yes | yes | tx; GL after tx |

### MUTATING ROUTES WITHOUT A PERSONA CHECK

1. `app/api/v2/schools/guardian-links/[id]/route.ts:46-110` — `PATCH` changes `canReceiveFinancials` / `canReceiveAcademicResults` / `isPrimary` and is guarded only by `canViewAnyPortalSubject` (:55). That set includes BURSAR, who has no `schools.students:edit` grant; `POST /guardian-links` and `DELETE` on the same file both call `schoolPermissionDenial` first. The route-guard coverage test (`lib/schools/route-guard-coverage.test.ts:113`) passes because the file *mentions* the marker in `DELETE`.

Everything else mutating carries a `schoolPermissionDenial` (or `importPermissionDenial`) on the handler. Several verbs are, however, mapped to a resource whose grant set is narrower than the intended actors — see F-1, F-2, F-9, F-11.

---

## C. Data model

### Models (prisma/schema.prisma)

Academic ladder: `SchoolIdentitySettings` (6845), `SchoolAcademicYear` (6881), `SchoolTerm` (6904), `SchoolClass` (6944), `SchoolStream` (6983), `SchoolSubject` (7053), `SchoolClassSubject` (7082, the teacher assignment), `SchoolPeriod` (7886), `SchoolRoom` (7915), `SchoolTimetableSlot` (7951), `SchoolCalendarEvent` (8001), `SchoolSchemeOfWork` (6751), `SchoolGradingScheme` (8040), `SchoolGradingBand` (8069).

People: `SchoolStudent` (7110), `SchoolGuardian` (7186), `SchoolStudentGuardian` (7235, consent flags), `SchoolEnrollment` (7255), `SchoolTeacherProfile` (7008, `userId`, `isHod`, `isClassTeacher`, HR link), `SchoolPortalInvite` (6706). Non-teaching staff are HR `Employee` rows.

Admissions: `SchoolApplication` (8175), `SchoolApplicationEvent` (8225).

Attendance: `SchoolAttendanceSession` (7831), `SchoolAttendanceSessionLine` (7856).

Results: `SchoolAssessment` (8097), `SchoolAssessmentScore` (8132), `SchoolResultSheet` (7433), `SchoolResultLine` (7504), `SchoolResultModerationAction` (7461), `SchoolPublishWindow` (7481).

Fees: `SchoolFeeStructure` (7524), `SchoolFeeStructureLine` (7546), `SchoolFeeInvoice` (7566), `SchoolFeeInvoiceLine` (7639), `SchoolFeeReceipt` (7663), `SchoolFeeReceiptAllocation` (7714), `SchoolFeeWaiver` (7732), `SchoolFeeRefund` (7784); fiscal side `FiscalisationProviderConfig` (6155), `FiscalDay` (6195), `FiscalReceipt` (6228, 1:1 to `SchoolFeeReceipt`). All money columns are `Decimal(14,2)`, exchange rate `Decimal(12,4)`, base-currency mirror on every document.

Boarding & welfare: `SchoolHostel` (7279), `SchoolHostelRoom` (7307), `SchoolHostelBed` (7327), `SchoolBoardingAllocation` (7347), `SchoolLeaveRequest` (7374), `SchoolBoardingMovementLog` (7412), `SchoolHealthRecord` (8247), `SchoolHealthEvent` (8290).

Teaching: `SchoolAssignment` (8319), `SchoolAssignmentSubmission` (8353), `SchoolLessonPlan` (8497), `SchoolCoverAssignment` (8534), `SchoolTeachingResource` (8556), `SchoolStudentGoal` (8589), `SchoolParentMeeting` (8621).

Services: `SchoolBook` (8385), `SchoolBookCopy` (8409), `SchoolBookLoan` (8435), `SchoolBookReservation` (8471), `SchoolTransportRoute` (8650), `SchoolTransportStop` (8674), `SchoolTransportRider` (8697), `SchoolTransportBoarding` (8727).

Comms & import: `SchoolMessageThread` (6788), `SchoolMessage` (6822); notices use the platform `Notification`/`NotificationRecipient`. `SchoolImportJob` (8809), `SchoolImportRow` (8842), `SchoolImportArtifact` (8891).

### State machines (enums, 6573-6700, 8023-8175, 8744-8940)

- Student: APPLICANT → ACTIVE → SUSPENDED / GRADUATED / WITHDRAWN. Enrollment: ACTIVE / TRANSFERRED / WITHDRAWN / COMPLETED.
- Application: ENQUIRY → APPLIED → ASSESSMENT → WAITLISTED → OFFERED → ACCEPTED → ENROLLED, side exits DECLINED / WITHDRAWN (re-openable to APPLIED). Transitions enforced in `lib/schools/admissions-stages.ts:59-70`.
- Result sheet: DRAFT → SUBMITTED → HOD_APPROVED → PUBLISHED; SUBMITTED → HOD_REJECTED → (resubmit); PUBLISHED → HOD_APPROVED on unpublish. Publish window: SCHEDULED / OPEN / CLOSED.
- Attendance session: DRAFT → SUBMITTED → LOCKED. Entry: PRESENT / ABSENT / LATE / EXCUSED.
- Fee structure: DRAFT → ACTIVE → ARCHIVED. Invoice: DRAFT → ISSUED → PART_PAID → PAID; VOIDED (DRAFT discard) / WRITEOFF. Receipt: DRAFT / POSTED / VOIDED. Waiver: DRAFT → APPROVED → APPLIED; REJECTED / REVERSED. Refund: REQUESTED → PAID / CANCELLED. Payment method: CASH / BANK_TRANSFER / CARD / MOBILE_MONEY.
- Boarding allocation: ACTIVE / TRANSFERRED / ENDED. Leave: DRAFT → SUBMITTED → APPROVED → CHECKED_OUT → CHECKED_IN; REJECTED / CANCELED. Movement: CHECK_OUT / CHECK_IN / TRANSFER / BED_RELEASE.
- Import job: MAPPING → PREVIEW → COMMITTED → ROLLED_BACK; row: PENDING / CREATED / UPDATED / SKIPPED / ANOMALY / FAILED.

DB-enforced invariants that Prisma cannot express (documented in code): single active year/term partial indexes (`schema.prisma` note above `SchoolCalendarEventKind`), `SchoolFeeInvoice_live_student_term_structure_key` (`fees/_helpers.ts:28`), receipt `split_adds_up`, `refunded_within`, invoice `credit_xor_balance` (`_helpers.ts:244-253`), grading scheme weights sum to 100.

### Entities a K-12 SIS normally has that are absent

Confirmed by model grep (no `School*` model matches):

- Discipline / behaviour incidents, detentions, merits (no `Discipline`, `Behaviour`, `Detention` models; `Incident`/`HrIncident` are HR/site models).
- Scholarship / bursary schemes as first-class entities (only `SchoolFeeWaiver.waiverType = SCHOLARSHIP` per waiver; no scheme, no annual award, no sponsor).
- Sibling / family discounts (no family or household entity; guardians link per student).
- Payment plans / instalments (invoice has one `dueDate`; no schedule).
- Bank reconciliation for fee receipts (`BankReconciliation` exists for general accounting, but `SchoolFeeReceipt` has no bank-statement link).
- Exam timetables / invigilation (only `SchoolCalendarEventKind.EXAM`).
- Staff leave in the school module (HR `LeaveRequest` exists for employees; teachers with only a `SchoolTeacherProfile` and no `Employee` link are outside it).
- Substitution cover: partially — `SchoolCoverAssignment` exists.
- Extracurricular / clubs / houses / prefects — none.
- Alumni — none (GRADUATED status only).
- Document vault / consent forms — `HealthRecord` carries consent booleans (`lib/schools/health-consents.ts`); no generic consent-form entity. Record files exist through the CRM file engine (`records/record-files-tab.tsx`).
- Transport attendance: present (`SchoolTransportBoarding`).
- Asset / inventory per school, cafeteria, ID-card issuance log (card *design* is in `SchoolIdentitySettings`; no print/issue record), communication log (only notices and message threads), parent-teacher meeting bookings (present: `SchoolParentMeeting`), multi-campus (one `companyId` = one school; no campus entity).

---

## D. Navigation & gating

Nav definition: `lib/navigation.ts:279-401`, section `schools`, `featureKey: "schools.core"`, flattened groups. Workspace refs: `lib/workspaces.ts:362-476`. Route registry: `lib/platform/gating/route-registry.ts:84-110` (pages), `:346-401` (APIs). Feature catalogue: `lib/platform/feature-catalog.ts:198-208`.

Pages that exist but are not in the nav (reached only by link or redirect): `/schools/finance/class/[classId]`, `/schools/students/class/[classId]`, `/schools/results/class/[classId]`, `/schools/teachers/[id]`, `/schools/guardians/[id]`, `/schools/students/[id]`, `/schools/boarding/[id]`, `/management/master-data/schools/{classes,subjects,periods,grading}` (only `years` and `identity` are linked; the others are reached from the master-data shell), `/schools/fees`, `/schools/finance/{invoices,receipts,refunds,waivers}` (redirect aliases), `/schools/classes`, `/schools/subjects`, `/schools/academics`, `/schools/academics/identity`.

Nav items pointing at redirects or foreign pages:
- "Publishing windows" → `/schools/results/publish/windows` → redirects to `/management/master-data/schools/grading` (`app/schools/results/publish/windows/page.tsx:9`). Harmless but two nav items ("Academic setup" is `years`, this lands on `grading`) reach master data through redirects rather than direct hrefs.
- "Scheme of work" → `/schools/academics/syllabus` → redirects to `/portal/teacher/syllabus` (`app/schools/academics/syllabus/page.tsx:11`), a page gated on `schools.portal.teacher` and teacher identity. For an office user without a teacher profile this is a dead end (the e2e sweep asserts the "not linked to a teacher profile" copy). The nav comment (`lib/navigation.ts:266-270`) says classroom work is "deliberately absent", yet this item is present.
- `lib/workspaces.ts:413-417` still references `/schools/academics`, `/schools/classes`, `/schools/subjects`, `/schools/academics/identity` — all redirect stubs.

Feature keys gating pages: `/schools/finance` and `/schools/fees` → `schools.fees`; `/schools/admissions` → `schools.admissions`; `/schools/students`, `/schools/imports` → `schools.students`; `/schools/attendance` → `schools.attendance`; `/schools/boarding` (incl. `/welfare`) → `schools.boarding`; `/schools/teachers` → `schools.teachers`; `/schools/results/**` → `schools.results`; everything else (calendar, timetable, homework, goals, meetings, library, transport, notices, reports, documents, messages, guardians, staff) → `schools.core`. API keys mirror this, with two notable ones: `/api/v2/schools/health` → `schools.boarding` (so a day school cannot use welfare), and `/api/v2/schools/grading-schemes` → `schools.results` while its page is under `/management/master-data/schools` → `schools.core` (a `schools.core`-only tenant sees the grading page and gets 403s from its API).

Persona × nav: the nav is not persona-filtered. A BURSAR sees "Results", "Boarding", "Attendance" groups (no grants), a HOD sees "Fees", "Boarding", "Applications", and a WARDEN sees almost everything; each lands on a 403/empty screen. `lib/schools/access.ts` exists precisely to prevent this and is used by only 15 components (Section A).

---

## E. Business rules implemented & stub inventory

- Year roll-up: two-step plan/apply, plan never persisted, ladder from `SchoolClass.level`, classes without a level are refused, idempotent on enrolment unique index — `lib/schools/year-rollup.ts:1-80, 297`.
- Admissions: stage machine with explicit allowed transitions, offer expiry (`offerHasLapsed`), duplicate-applicant detection, enrol creates student + enrollment + application event in one transaction — `lib/schools/admissions-stages.ts:59-110`, `lib/schools/admissions.ts:80, 171, 253`.
- Calendar: one active year and one active term (DB partial index + transactional activation), term/year overlap detection, ordered-date check, current-term resolution, teaching-day derivation from calendar kinds — `lib/schools/calendar.ts:109-204, 275`, `calendar-kinds.ts`.
- Timetable: period overlap check, three-way clash detection (class/teacher/room) returning all conflicts, denormalised day/period sync, greedy first-fit auto-fill, copy-forward matched on class+stream+subject, teacher bulk allocation — `lib/schools/timetable.ts:50, 135, 305, 367, 466, 602`.
- Grading: band lookup returning null for holes, band gap/overlap validation, weighted term mark (continuous/exam/practical), default A–U bands — `lib/schools/grading.ts:34, 53, 145, 192`.
- Assessments: scheme resolution (subject → class → school default), score save with LOCKED refusal, class term-mark computation, roll-up replaces result lines and refuses once the sheet leaves DRAFT — `lib/schools/assessments.ts:42, 134, 206, 313`.
- Results governance: teacher scope check per class/stream, HOD requires `isHod` + assignment, publish requires an OPEN window matching term/class/stream, moderation trail rows — `lib/schools/governance-v2.ts`, `results/sheets/[id]/*/route.ts`.
- Fees: Decimal money everywhere (`lib/money.ts` via `lib/schools/money.ts`), exchange rate resolved per document date and refused if unknown, one live invoice per student/term/structure (partial unique index), row locks on invoices and receipts before allocation, first-fit spread across invoices with surplus held as credit, allocation refused across currency boundaries, receipt split and credit XOR balance DB checks, waiver amount ≤ balance, refund from receipt surplus or invoice credit, void refused if refunded — `app/api/v2/schools/fees/_helpers.ts:28-64, 255-398, 630-660`, `receipts/route.ts:433-570`.
- Accounting: every money event emits a source-typed journal entry with an idempotency key; period-locked postings return PENDING, others FAILED — `_helpers.ts` (`emitSchoolFeeAccountingEvent`), `lib/accounting/posting.ts:608`.
- Fiscalisation (ZIMRA): feature-flagged (`accounting.zimra.fiscalisation`), never blocks the receipt, replay endpoint for un-landed receipts, customer resolution from guardian — `lib/schools/fiscalisation.ts:49, 376, 419, 453`.
- Boarding: gender normalisation from free text, unknown gender refused from single-sex hostels, capacity refusal, transactional bed allocation and release with movement log, occupancy report — `lib/schools/boarding-rules.ts:19-53`, `lib/schools/boarding.ts:59, 228, 279`.
- Library: 3 books / 14 days / 2 renewals / 0.05 per day capped at 10, borrowing refusal on limit/fines/overdue, reservations — `lib/schools/library-rules.ts:31-81`, `lib/schools/library.ts`.
- Transport: rider add/end, per-run boarding register, billing *report* only — `lib/schools/transport.ts:35, 131, 269`.
- Health: consent keys, urgent gaps, record/event/clear, class health list — `lib/schools/health.ts`, `health-consents.ts`.
- Homework: lateness, publish, submit (LATE recorded not refused), mark, board & oversight — `lib/schools/assignments.ts`.
- Lesson plans: save/upsert, copy week forward, lay out week from timetable, cover arrangement — `lib/schools/lesson-plans.ts`.
- Goals & meetings: goal save/oversight, open slots, booking, release — `lib/schools/goals-meetings.ts`.
- Messaging & notices: thread visibility by side/assignment, unread counts, audience resolution to `NotificationRecipient` rows, "withoutAccount" count — `lib/schools/messages.ts`, `lib/schools/notices.ts:46-199`.
- Provisioning: `provisionSchool` seeds ladder/terms/fees for a new tenant; `ensureCurrentTermEnrolments` — `lib/schools/provision.ts:152, 380`.
- Teacher identity: suggest/link/unlink HR employee, link coverage — `lib/schools/teacher-identity.ts`.
- Imports: registry of mappable fields, dry-run/commit/rollback with artifacts, audit on commit/rollback — `lib/schools/import/service.ts`.

TODO / FIXME / stub inventory: a grep for `TODO|FIXME|not yet|stub|coming soon|not implemented|hard-coded` across `lib/schools`, `app/schools`, `app/api/v2/schools`, `components/schools` (non-test) returns **no engineering TODOs**; every hit is user-facing copy ("Not yet", `NothingLeftToDo`) or a doc comment. Explicit deferrals are expressed in prose instead: transport billing "belongs with the fee run in Iteration 2" (`lib/schools/transport.ts:258`); library fines are computed but never billed; notices are in-app only (`lib/schools/notices.ts:7-8`); calendar events have no edit route; DRAFT receipts have no post route.

---

## F. Concrete bugs and risks

**F-1 (Broken, BURSAR).** `components/schools/fees/fees-grade-picker.tsx:184` enables "Send reminders" on `access.can("schools.fees","create")` and opens `SendNoticeDialog` (:477-495) which POSTs `/api/v2/schools/notices` (`common/send-notice-dialog.tsx:80`). That route requires `schools.reports:create` (`app/api/v2/schools/notices/route.ts:121`), a grant only SCHOOL_ADMIN holds. A bursar composes the reminder and receives "Your role cannot create reports". Fix: either add `reports:create` to BURSAR in `lib/platform/personas.ts:106` or gate the button on `schools.reports:create` as `reports-arrears-content.tsx:445` already does — and decide which role is meant to chase fees, because today no bursar can.

**F-2 (Design gap, BURSAR/HOD).** `POST /api/v2/schools/messages` also requires `reports:create` (`messages/route.ts:83`), so a bursar cannot answer a parent's fee query and an HOD cannot reply about results; only SCHOOL_ADMIN can write in the office inbox. Same root cause as F-1.

**F-3 (Partial, BURSAR).** `POST /fees/receipts` accepts `postNow: false` and creates a DRAFT receipt (`receipts/route.ts:94, 499-503`), but there is no `PATCH`/`post` route under `fees/receipts/[id]/` (only `allocate`, `fiscalise`, `void`), and `allocate` refuses non-POSTED receipts (`allocate/route.ts:111`). A draft receipt can never be posted, allocated, or (since void requires POSTED, `void/route.ts:43`) removed. Fix: add a post route (or drop `postNow`).

**F-4 (Control weakness, BURSAR).** Waiver approval has no separation of duties. `POST /fees/waivers` may create a waiver directly as APPROVED or APPLIED (`waivers/route.ts:35, 197-221`); `/apply` moves DRAFT straight to APPLIED and stamps the caller as approver when none exists (`waivers/[id]/apply/route.ts:138`); `/finance/waivers/[id]/approve` is a re-export of `apply`. A single BURSAR can therefore grant, approve and apply a scholarship alone; SCHOOL_ADMIN is never required. The audit row names it (`lib/schools/audit.ts:56`) but does not prevent it. Fix: require `approve` from a second role (SCHOOL_ADMIN) before `apply`, or at least refuse `approvedById === createdById`.

**F-5 (Risk, BURSAR).** GL posting happens outside the money transaction in every route except bulk-generate: receipts (`receipts/route.ts:433` tx closes, `:588` emit), void (`void/route.ts:37` / `:118`), write-off (`write-off/route.ts:52` / `:92`), refund pay (`pay/route.ts:56` / `:119`). A failed or FAILED-status posting is only `console.error`ed and returned as `accounting.accountingStatus`; nothing on `SchoolFeeReceipt`/`SchoolFeeInvoice` records the journal id or failure, and there is no retry queue (the "replay" in `lib/schools/fiscalisation.ts` covers ZIMRA only). Money can be received with no ledger entry and no way to list which documents are unposted. Fix: persist `journalEntryId`/`accountingStatus` on the fee documents (as fiscalisation does with `FiscalReceipt`) and add a replay endpoint, or emit inside the transaction.

**F-6 (Missing persona check).** `PATCH /api/v2/schools/guardian-links/[id]` (`route.ts:46-110`) has no `schoolPermissionDenial`; it relies on `canViewAnyPortalSubject`, which admits BURSAR. A bursar can change which parent receives results or toggle `isPrimary`. `POST` on the sibling file uses `students:edit`. Fix: add `schoolPermissionDenial(session, "schools.students", "edit")` before :55.

**F-7 (Risk, HEAD).** Result-sheet transitions write two rows without a transaction: e.g. `publish/route.ts:60` updates status and `:75` writes the moderation action; same in `hod-approve/route.ts:62/77`, `submit`, `hod-request-changes`, `unpublish`. A failure between them leaves a PUBLISHED sheet with no trail, and the moderation trail is the only audit these routes have — no `PlatformAuditEvent` is written for publishing marks. Fix: wrap in `prisma.$transaction` and write a `schools.result.published` audit event.

**F-8 (Compliance risk, BURSAR).** `POST /fees/receipts/[id]/void` never consults `FiscalReceipt` (no `fiscal` reference in `void/route.ts`). A receipt already submitted to ZIMRA can be voided locally with no credit note or fiscal reversal, so the fiscal day and the ledger disagree. Fix: refuse void (or require a fiscal credit note path) when a linked `FiscalReceipt` is in a submitted state.

**F-9 (Role-composition gap, ADMIN/BURSAR).** `importPermissionDenial` (`app/api/v2/schools/imports/_guard.ts:19-24`) requires `students:create` *and*, for FEE_STRUCTURE/OPENING_BALANCE, `fees:create`. BURSAR lacks `students:create` and REGISTRAR lacks `fees:create`, so only SCHOOL_ADMIN can import opening balances; the UI merely disables the fee entities for non-`fees:create` users (`schools-import-content.tsx:687`) and lets a bursar start a job that will be refused. Fix: check `students` only for STUDENT/GUARDIAN/CLASS and `fees` only for the two fee entities.

**F-10 (Risk, BURSAR).** DRAFT invoices can take money. `loadInvoicesForAllocation` refuses only VOIDED/WRITEOFF (`_helpers.ts:630`), and the waiver apply query includes DRAFT (`apply/route.ts:79, 98`). A receipt allocated to a DRAFT invoice flips it to PART_PAID/PAID via `refreshFeeInvoiceBalance` (:140-160) without it ever being ISSUED, so no `SCHOOL_FEE_INVOICE_ISSUED` journal is posted while the receipt posts against receivable. Write-off likewise has no DRAFT guard (`write-off/route.ts:40-45`). Fix: restrict allocation/waiver/write-off to ISSUED/PART_PAID.

**F-11 (Mis-gating, HEAD).** Health & welfare is gated as boarding: page `/schools/boarding/welfare` → feature `schools.boarding` (route-registry :102), API `/api/v2/schools/health` → `schools.boarding` (:387) and persona `schools.boarding:view/edit` (`health/[studentId]/route.ts`). A day school has no health record screen; REGISTRAR, HOD and BURSAR (no boarding grant) cannot see medical/consent flags even for day pupils; the student overview tab's health fetch (`records/student-overview-tab.tsx`) 403s for them. Fix: introduce a `schools.welfare` resource (or gate on `schools.students`) and register health under `schools.students`.

**F-12 (Risk, HEAD).** Office edit of registers: `PATCH /attendance/sessions/[id]` refuses only LOCKED (`route.ts:97`), so SCHOOL_ADMIN can rewrite a SUBMITTED register's lines with no audit row and no status change; `POST /lock` is guarded by `attendance:submit` (TEACHER holds it), so a teacher can lock their own register, which defeats lock-as-oversight. Fix: audit edits of SUBMITTED sessions; gate `lock` on `attendance:edit` or a new `lock` verb.

**F-13 (Broken nav).** "Scheme of work" (`lib/navigation.ts:343`) → teacher-portal redirect (`app/schools/academics/syllabus/page.tsx:11`); office users without a teacher profile hit "You are not linked to a teacher profile" (asserted in `e2e/schools-back-office-suite.spec.ts:218`). Fix: remove the nav item or build an office syllabus view over `GET /syllabus` (`academics:view`).

**F-14 (Partial, BURSAR).** `lib/documents/schools-sources.ts:47-56` defines receipt, statement, admission-letter and transfer-letter PDFs, but `/schools/documents` exposes only report cards, invoices, class lists and registers (`school-documents-content.tsx:770-773`). Receipts and statements are printed only from the ledger row menus (if at all) — no batch statement run exists.

**F-15 (Hard deletes behind an "archive" verb).** `students/[id]/route.ts:379`, `guardians/[id]/route.ts:253`, `teachers/profiles/[id]/route.ts:201` call `prisma.*.delete`. Combined with `onDelete: Cascade` on `SchoolFeeInvoice.student` etc. (schema 7585-7590), the "related records" 409 (`students/[id]/route.ts:373`) is the only thing standing between a registrar and cascading a pupil's invoices away. Fix: soft-archive via `status`/`isActive`.

**F-16 (Persona/UI mismatch).** 57 content components render every verb without `useSchoolAccess` (Section A "NO GATE" set); `lib/schools/access.ts:11-16` documents this as the problem it was written to solve. The bursar's screen still shows the head's buttons and learns the answer from a 403.

**F-17 (Minor).** `/results/publish/windows` PATCH/DELETE and POST use `results:publish`, so an HOD cannot see the window calendar's edit controls (fine) but `GET` uses `results:view` (fine); `grading-schemes` API is behind `schools.results` while its page is behind `schools.core` (D above). `lesson-plans` POST accepts `academics:edit` OR `teachers:edit` (`lesson-plans/route.ts:162`), which lets REGISTRAR author lesson plans.

**F-18 (Minor, HEAD).** Publishing a sheet sends no notification to families (`publish/route.ts` writes only the moderation row); parents discover results by polling the portal. Notices (`lib/schools/notices.ts:169-199`) are in-app only — no email/SMS adapter — so "Remind the 12" reaches only families with claimed portal accounts.

---

## G. Test & e2e coverage

Unit/integration (vitest, `lib/schools/*.test.ts` and `app/api/v2/schools/fees/*.test.ts`):

| Area | Tests | Covered |
|---|---|---|
| Permissions | `permissions.test.ts` (19) | teacher cannot touch money, bursar cannot touch marks, HOD moderates, warden boarding-only, registrar records |
| Route guard presence | `route-guard-coverage.test.ts` (2) | every route file mentions a guard marker — file-level only, not per method (misses F-6) |
| Fees money | `fee-money.test.ts` (15) | Decimal columns, currency/rate/base, live-invoice index |
| Fees credit/refund | `fee-credit-refund.test.ts` (33) | overpayment → credit, spending credit, refund, audit rows, DB check constraints |
| Fees audit | `fee-audit.test.ts` (12) | invoice create/issue/bulk/write-off/waiver audit rows |
| Fees GL | `fee-ledger-posting.test.ts` (22), `fee-posting.test.ts` (5) | balanced entries per document type, idempotency, closed period → PENDING |
| Fiscalisation | `fee-fiscalisation.test.ts` (20) | on/off, failure never blocks payment, replay, customer resolver |
| Structure clone | `fee-structure-clone.test.ts` (10) | |
| Admissions | `admissions.test.ts` (26) | stage machine, numbering, duplicates, move, enrol, counts |
| Assessments/grading | `assessments.test.ts` (18), `grading.test.ts` (17) | scheme resolution, scores, term marks, roll-up, bands |
| Year roll-up | `year-rollup.test.ts` (17) | ladder, plan, apply |
| Calendar/timetable | `calendar.test.ts` (23), `calendar-kinds.test.ts` (3), `timetable.test.ts` (28) | single active year/term, overlaps, clash rules, derived columns |
| Boarding/health | `boarding.test.ts` (19), `health.test.ts` (19) | gender/capacity, allocate, occupancy, consents, events |
| Library/transport | `library.test.ts` (25), `transport.test.ts` (17) | fines, refusals, loans, reservations, riders, register, billing report |
| Teaching | `assignments.test.ts` (16), `lesson-plans.test.ts` (27), `goals-meetings.test.ts` (19) | |
| Comms | `messages.test.ts` (12), `notices.test.ts` (11) | visibility, audience |
| Identity/portal | `portal-identity.test.ts` (21), `portal-invites.test.ts` (18), `teacher-identity.test.ts` (14) | |
| Provision/import/search | `provision.test.ts` (16), `import/import.test.ts` (25), `search.test.ts` (12) | |

Risky logic with no tests: the results workflow routes (submit/approve/request-changes/publish/unpublish, window enforcement) — `results-v2.ts` header itself notes these endpoints were "written, permission-gated and tested, and then never called" but no test file references `hod-approve`; receipt void and fiscal interaction (F-8); DRAFT-invoice allocation (F-10); guardian-link PATCH permission (F-6); attendance session PATCH/lock semantics (F-12); the import permission composition (F-9); `emitSchoolFeeAccountingEvent` failure handling after commit (F-5) — the ledger tests exercise the posting engine, not the route's non-transactional call.

E2E (Playwright):
- `e2e/schools-back-office-suite.spec.ts` — a *route sweep* (`sweepTests`, :222-229): signs in as head and asserts each page renders expected copy for results (moderation, publishing, windows redirect), finance ledger/refunds/waivers tabs, lessons, resources, syllabus redirect, goals, staff, meetings, library loans, transport, master-data pages, portal aliases. No workflow is exercised (no click-through of submit → approve → publish, no receipt recorded).
- `e2e/schools-suite.spec.ts` — roll on page equals DB; fees page shows owed not billed.
- `e2e/smoke-school.spec.ts` — roll/register/fees populated; portal sign-ins.
- `e2e/schools-import-shots.spec.ts` — import choose/map/report (screenshots).
- `e2e/schools-search-shots.spec.ts` — global search.
- `e2e/finance-suite.spec.ts` — payroll posting, not school fees.
- `e2e/attendance-mark.spec.ts` — crew/site attendance (operations module), not schools.

No browser coverage for: recording a receipt, issuing/bulk-generating invoices, waivers, refunds, void, results moderation/publish transitions, admissions enrol, roll-up apply, bed allocation, leave approve/check-out, register oversight edit, notices/messages.

---

## H. Per-dashboard workflow verdict

### ADMIN

Implemented end-to-end: school identity & student-number format; ID-card design (settings only); custom fields; academic years/terms with single-active enforcement; periods & rooms; classes/streams; subjects & syllabus; grading schemes & bands; publish windows; teacher profiles, subjects, assignments (single & bulk) and HR employee link; support staff via HR; timetable (manual, auto-fill, copy-forward, clash detection); calendar events (create/delete); imports (dry-run/commit/rollback with audit); portal invites (issue/revoke) and guardian consent; hostels/rooms/beds; library catalogue; transport routes/stops/riders; notices (in-app).

Partial: calendar event *editing* (no PATCH route); documents/templates (4 of 8 sources surfaced; no template editing, no ID-card print/issue run); notices/messages delivery (no email/SMS channel); integrations (only ZIMRA fiscalisation and GL posting; no SMS/email/payment-gateway adapters visible in this module); nav hygiene (F-13, redirect-only items).

Missing: exam timetables, staff-leave view for teachers without HR link, multi-campus, asset/inventory, cafeteria.

### HEAD

Implemented end-to-end: overview dashboard; admissions pipeline (stage machine, offer lapse, enrol); enrolment moves; year roll-up; register oversight (create/edit/delete/submit/lock from office); absence follow-up (for SCHOOL_ADMIN); assessments & term-mark roll-up; result sheets → submit → HOD approve/request-changes → publish (window-enforced)/unpublish; report cards (documents page); homework oversight; lesson-plan & cover oversight; goals; parent meetings; boarding bed board, allocations, leave approve/check-out/in; welfare records/events; office inbox; reports (enrolment/occupancy/collections/arrears) with CSV/PDF export.

Partial: HOD experience — HOD lacks admissions/fees/boarding grants so the dashboard and nav 403 in places, and HOD moderation additionally demands a linked `isHod` teacher profile with a class assignment; absence follow-up and messages are SCHOOL_ADMIN-only (`reports:create`); welfare is boarding-gated (F-11); results transitions not transactional and not platform-audited (F-7); no family notification on publish (F-18); register oversight edits of submitted registers unaudited (F-12); "Scheme of work" nav dead end (F-13).

Missing: discipline/behaviour, exam timetabling, extracurricular, alumni, communication log beyond notices/threads.

### BURSAR

Implemented end-to-end: fee structures (create/edit/activate/archive/clone); invoices (create, edit/discard DRAFT, issue, bulk-generate with duplicate protection, write-off); receipts (record with first-fit or explicit allocation, credit on surplus, allocate later, void, fiscalise/replay); credits; waivers (create/edit/discard/apply); refunds (request from receipt or invoice credit, pay, cancel); arrears/ageing and collections reports; class finance view; GL posting per event with idempotency; PlatformAuditEvent for every money verb; fiscalisation with ZIMRA.

Partial: fee reminders (F-1 — button 403s for BURSAR; arrears screen disables it); parent messaging (F-2); DRAFT receipts unpostable (F-3); waiver approval without segregation (F-4); GL posting after commit with no retry/record (F-5); void ignores fiscal state (F-8); opening-balance import needs SCHOOL_ADMIN (F-9); DRAFT invoices can take allocations/waivers/write-offs (F-10); statements exist as a document source but have no page or batch run (F-14); payment methods fixed to four enum values with no method configuration or gateway; fee-structure creation not audited.

Missing: payment plans/instalments, sibling/family discounts, scholarship schemes, bank reconciliation of fee receipts, transport and library charges flowing into invoices (both compute but never bill), dunning schedule, cashier shift/till close for fees.
