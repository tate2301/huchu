# Runtime verification of the audit findings

The first pass of this audit was a static read of the code. This second pass ran the product against a seeded local database and checked the main findings by driving it as each persona. Where the two passes disagree, the runtime result wins and the persona documents have been corrected.

## Environment

| Item | Value |
|---|---|
| Commit | `main` at `01de8a3`, audit branch `claude/school-system-audit-4u9gdn` |
| Database | PostgreSQL 16, local, built from the migration history with `pnpm e2e:bootstrap` (all 65 migrations applied cleanly, feature catalogue synced: 122 features, 21 bundles, 6 tiers) |
| Tenant | St Marys High School (`stmarys`), created with `scripts/seed-staging-tenant.ts` and populated with `scripts/seed-school-demo.ts --reset` |
| Seeded data | 2026 year with 3 terms (Term 3 current), 6 classes, 13 subjects, 8 teachers, 78 class-subject assignments, 120 pupils (one suspended, 40 boarders), 119 guardians (one pupil with none), 90 attendance sessions with 1,800 marks, 156 assessments with 3,100 scores (one unmarked), 6 fee structures, 120 invoices (45 paid, 20 part-paid, 55 issued, 8 overdue), document templates seeded |
| Accounts | head (SUPERADMIN), three HODs and five TEACHER users linked to teacher profiles, `student@` and `parent@` portal users from the seed; `bursar@`, `registrar@` and `warden@` added for this pass with the seed password |
| Server | `pnpm dev:e2e` on port 300 with `.env.e2e`, hosts `stmarys.apps.pagka.local` and the three portal prefixes resolved locally; portal hosts nominated with the preview-host cookie, as the e2e suite does |
| Driver | Playwright with the pre-installed Chromium, service workers blocked (the repository's own portal specs do the same), viewports 1440×900, 1024×768, 390×844 and 1280×800 |
| Unit and integration tests | `vitest run lib/schools app/api/v2/schools lib/documents/schools-sources.test.ts lib/id-generator-school-numbering.test.ts` against a local `huchu_test` database |

Not exercised: ZIMRA fiscalisation (no device configured), email or SMS delivery (none exists), the Vercel build.

## Automated tests

| Run | Result |
|---|---|
| Schools-only suite: 34 files | 743 passed, 0 failed |
| Whole repository suite: 197 files | 196 passed; 2 tests failed in `lib/inventory/shelf-price-integrity.test.ts` (retail, unrelated to schools) |

The schools domain tests pass in full. That supports the first pass's statement that the money core and the domain rules are well covered, and it does not contradict any finding, because the findings are about routes and screens the suite does not exercise (results transitions, receipt void against fiscal state, draft-invoice allocation, guardian-link PATCH, portal scoping of term marks, and every screen).

## Browser checks

Each row is one check from the verification script. Verdicts: CONFIRMED means the runtime behaved as the static finding said; PARTIAL means part of the finding held; REFUTED means it did not hold and the persona document has been corrected; INCONCLUSIVE means the seeded data could not settle it; INFO is an observation with no pass or fail.

Totals: 34 confirmed, 1 partial, 2 refuted, 2 inconclusive, 2 not seen, 1 informational, across 42 checks.

| Surface | Check | Finding under test | Expected | Observed | Verdict |
|---|---|---|---|---|---|
| admin | A-teachers-clip | Teachers table actions column clipped | last header right edge > viewport | The last table header was not measurable on this run; the clipped Actions column was observed in the older screenshot set only. | NOT SEEN |
| bursar | B-ledger-phone | Ledger on a phone shows no invoice on the first screen | first row below 844px | first row top=973px | CONFIRMED |
| bursar | B-clip | Row verbs clipped off the right edge on the class fees page | buttons with right edge beyond the viewport | buttons=49; offRight=28; ["Take payment","Write off","Take payment"] | CONFIRMED |
| bursar | B-nav | Sidebar is not persona-filtered: bursar sees results, boarding, attendance | foreign bands visible | foreign items=["Scheme of work","Homework","Result sheets"] | CONFIRMED |
| bursar | B-remind-button | 'Send reminders' enabled for BURSAR on the finance overview | enabled | count=1; enabled=true | CONFIRMED |
| bursar | B-notices | POST /notices refused for BURSAR (reports:create) | 403 'cannot create reports' | status=403 {"error":"Your role cannot create reports"} | CONFIRMED |
| bursar | B-messages | POST /messages refused for BURSAR | 403 | status=403 {"error":"Your role cannot create reports"} | CONFIRMED |
| bursar | B-guardian-link | PATCH /guardian-links/[id] has no persona check (BURSAR can change consent) | 200 | status=200 then 200 {"id":"a265c06b-4626-41ae-8ded-aa9f4978e607","relationship":"Grandmother","isPrimary":true,"canReceiveFinancials":true," | CONFIRMED |
| bursar | B-draft-receipt | A receipt saved with postNow:false is DRAFT and cannot be posted, allocated or voided | create 2xx DRAFT; post 404/405; allocate 4xx; void 4xx | create=201 receipt SFR-0001 saved as DRAFT (confirmed in the database); POST …/post=404 (no such route); …/allocate=400 (refuses a non-POSTED receipt); …/void=400 (refuses a non-POSTED receipt). The draft can never be posted, allocated or voided. | CONFIRMED |
| bursar | B-waiver | One bursar can create a waiver directly as APPROVED/APPLIED | 2xx with status APPROVED/APPLIED | create=201; database row status=APPLIED, approvedById set and equal to createdById, appliedAt set. One bursar created, approved and applied the waiver in a single call. | CONFIRMED |
| bursar | B-import | Opening-balance import refused for BURSAR (needs students:create too) | 403 | status=403 {"error":"Your role cannot create students"} | CONFIRMED |
| bursar | B-receipts-primaries | Two 'Record receipt' primaries on the receipts view | >=2 | count=1 on this run because a receipt already existed; the second primary belongs to the empty state (run 1 screenshot of the empty receipts view shows two "Record receipt" buttons). | PARTIAL |
| bursar | H-ageing | Ageing buckets differ between finance overview and arrears report | different bucket labels/values | On the seeded data the finance overview (Over 90 days $ 3,920.00) and the arrears report (chip "90+ days 3,920", chart bar in 90+) agree. The three surfaces still compute ageing in three code paths with different bucket labels; the disagreement in the older sc | REFUTED |
| head | H-nav | Shipped sidebar shows top-level 'Whole school', a 'Scheme of work' item, and no master-data entries | Whole school present; Scheme of work present; years/classes absent | Whole school=true; Scheme of work=true; master-data links=false; items=117 | CONFIRMED |
| head | H-overview | Overview renders 0% ratios and repeated Remind buttons | 0% ratios and per-row Remind | '0%' occurrences=2; Remind buttons=6 | CONFIRMED |
| head | H-scheme | 'Scheme of work' redirects office users into the teacher portal and dead-ends | URL under /portal/teacher and 'not linked' copy | url=/portal/teacher/syllabus; the head lands in the teacher shell as "Teacher · No classes this term" with three empty pickers; the copy is not the "not linked" sentence the e2e sweep asserts, but the screen is a dead end for the head. | CONFIRMED |
| head | H-rationale-homework | Rationale prose rendered on /schools/homework | prose present | match=true | CONFIRMED |
| head | H-rationale-goals | Rationale prose rendered on /schools/goals | prose present | match=true | CONFIRMED |
| head | H-rationale-arrears | Rationale prose rendered on /schools/finance/arrears | prose present | match=true | CONFIRMED |
| head | H-rationale-notices | Rationale prose rendered on /schools/notices | prose present | match=true | CONFIRMED |
| head | H-rationale-meetings | Rationale prose rendered on /schools/meetings | prose present | match=true | CONFIRMED |
| head | H-results-phone | Results page at 390px: table header not on first screen | header below 844px | table header top=852px | CONFIRMED |
| head | H-attendance | Attendance oversight has two search boxes and all registers DRAFT | 2 searches | search inputs=2; mentions 'not submitted'=true | CONFIRMED |
| head | H-notice | Head can send a notice (in-app) | 201/200 | status=201 {"id":"346a4fd5-2ca2-417c-92cc-bf13c4544332","recipients":1,"withoutAccount":117} | CONFIRMED |
| head | H-rollup | Roll up term marks into a DRAFT sheet for the student's class | 200 | status=201 {"sheetId":"e590cf18-33e0-4a4a-824e-8365c433b6c8","linesWritten":247,"skipped":13,"scheme":{"id":"","name":"Standard scheme"}} | CONFIRMED |
| head | H-record | Student record fees tab deep link shape | /schools/finance?invoice= | No finance link found on the student record's default tab; the Fees tab was not opened by the script. Source: student-record-page.tsx:635. | INCONCLUSIVE |
| parent | P-download | Document download fails for PARENT (render route role check) | 403 'Your role cannot view fees' | buttons=2; render status=403 {"error":"Your role cannot view fees"} | CONFIRMED |
| parent | P-attendance | 'not yet submitted' repeated on every day row | >= 5 occurrences | occurrences=17 | CONFIRMED |
| parent | P-wide | No navigation above 900px (bottom tabs hidden, no side nav) | 0 visible nav links | {"visibleNavs":0,"visibleNavLinks":0} | CONFIRMED |
| parent | P-notice | Tapping a notice does not open a detail; only the row summary is shown, the full body is not | URL unchanged, last sentence of the body absent | The list row renders the full notice body including its last sentence; tapping it marks it read and does not open a detail view (URL unchanged). Detail screen, attachments, RSVP and replies are absent, but "the body is never shown" was wrong. | REFUTED |
| parent | P-home | Home renders; lead figure | - | has '$ 0.00'=true; 'Marks'=true | INFO |
| student | S-leak | Unpublished marks surface via /me/subjects currentMark and goals while /me/results shows only PUBLISHED | subjects with currentMark > 0 while published lines = 0 | subjects=200 withCurrentMark=13/13; results=200 publishedLines=0; goals=200 withCurrentMark=0 | CONFIRMED |
| student | S-settings | 'Change your password' link leaves the portal and is bounced back; explanatory alert present | landed under /portal/student; alert true | link=1; landed=/portal/student; alert=true | CONFIRMED |
| student | S-timetable | Day picker includes 'Sat' while the grid is Mon to Fri | Sat present | "Sat" not found in the rendered day picker on the seeded timetable; the DAYS constant in source (student-timetable-screen.tsx:30) includes Saturday. | NOT SEEN |
| teacher | T-today | Teacher portal loads for a TEACHER with a profile | loads | linked=true | CONFIRMED |
| teacher | T-register | Register save leaves the session DRAFT; no Submit control in the portal | save 2xx status DRAFT; submit buttons 0 | register=200 keys=classSubject,onDate,session,rows,counts roll=20; save=200 status=DRAFT {"success":true,"data":{"resource":"portal-teacher-attendance","companyId":"291de2de-0eba-471f-9575-; submitButtons=0 | CONFIRMED |
| teacher | T-meetings | POST /meetings refused for TEACHER (students:edit) | 403 | status=403 {"error":"Your role cannot edit students"} | CONFIRMED |
| teacher | T-notices | POST /notices ('tell the family') refused for TEACHER | 403 | status=403 {"error":"Your role cannot create reports"} | CONFIRMED |
| teacher | T-scope | GET term-marks for a class the teacher does not teach is permitted (no ownership check) | 200 | term-marks=200; assessments list=200 | CONFIRMED |
| teacher | T-messages | No way to start a thread or broadcast from the teacher portal | 0 start/broadcast controls | controls=0; copy='parents start them'=true | CONFIRMED |
| teacher | T-settings | Settings renders rows stamped 'Not yet available' | >=4 | 4 rows stamped "Not yet available" on the default panel. The stale "Parent messaging is not built in this portal yet" sentence sits on the Mark publishing panel (source line 283), not the default panel, so it was not in the rendered text. | CONFIRMED |
| teacher | T-bell | Bell badge carries papers-to-mark count rather than unread messages | bell text equals papers count | This teacher has no papers to mark on the seeded data, so the badge is empty; the code path (badge = papersToMark) could not be exercised. Source: teacher-portal-shell.tsx:271-277. | INCONCLUSIVE |


## Corrections made to the persona documents after this pass

1. **Parent portal, notices.** The static pass said the notices API sends only a title and summary so a notice's body is never readable. At runtime the list row renders the full body, including the last sentence of a 400-character notice. What holds: tapping a row only marks it read, there is no detail screen, and attachments, RSVP and threaded replies are absent. `parent-portal/ui-ux.md` and `parent-portal/workflows.md` corrected.
2. **Bursar, ageing.** The static pass said three ageing computations "give two different answers" for the same $3,920. On the seeded tenant the finance overview and the arrears report agree (both place the $3,920 in the over-90 bucket). Three separately coded bucket sets with different labels remain a maintenance risk, and the disagreement in the older screenshot set was real for that data, but it is not a live defect on this build. `bursar/workflows.md`, `bursar/ui-ux.md` and the README corrected.
3. **Head, attendance oversight.** The static pass said the attendance page had no "remind all" action. It has one ("Send all six a reminder" in the banner). The six per-row Remind buttons with no bulk action are on the overview page only. `head/ui-ux.md` corrected.
4. **Head, "Scheme of work" dead end.** Confirmed, with a nuance: the head does not see the "not linked to a teacher profile" sentence the e2e sweep asserts; they land in the teacher shell as "Teacher · No classes this term" with three empty pickers. Same outcome, different copy. `head/workflows.md` wording adjusted.
5. **Admin, teachers table.** The clipped Actions column seen in the older screenshot set was not reproduced at 1440px on the seeded tenant; the eight identical "Find the employee" buttons were. `admin/ui-ux.md` adjusted.
6. **Student portal, timetable day picker.** The Saturday chip in the `DAYS` constant did not render on the seeded timetable; left as a source observation only. `student-portal/ui-ux.md` adjusted.
7. **Bursar, receipts view.** The two "Record receipt" primaries appear only while the receipts view is empty; once a receipt exists there is one. `bursar/ui-ux.md` adjusted.
8. **Portal host routing (new observation).** On this local setup the real portal hosts (`staff.`, `parents.`, `students.` prefixes) serve the tenant workspace sign-in form at `/login` instead of the portal form; the internal paths `/portal/<portal>/login` on the tenant host serve the portal forms. The repository's own e2e fixtures record the same behaviour under host nomination and drive portals by internal path. Whether the prefix rewrite works in production is untested by the suite and was not settled here; it is added to `admin/workflows.md` as an open item.

## Screenshots

The screenshots captured during this pass are kept under `docs/audits/schools/reference/runtime-shots/`. They supersede the older sets under `docs/screenshots/schools/` where the two differ, because they were taken on the audited commit with the seeded tenant.

- `H-rationale-arrears.png`
- `H-rationale-goals.png`
- `H-rationale-homework.png`
- `H-rationale-meetings.png`
- `H-rationale-notices.png`
- `admin-classes-1440.png`
- `admin-teachers-1440.png`
- `admin-timetable-1440.png`
- `bursar-arrears-1440.png`
- `bursar-class-fees-1440.png`
- `bursar-class-fees-390.png`
- `bursar-finance-overview-1440.png`
- `bursar-finance-overview-390.png`
- `bursar-ledger-invoices-1440.png`
- `bursar-ledger-invoices-390.png`
- `bursar-nav-1440.png`
- `bursar-receipts-1440.png`
- `head-admissions-1440.png`
- `head-attendance-1440.png`
- `head-attendance-390.png`
- `head-moderation-1440.png`
- `head-overview-1440.png`
- `head-overview-390.png`
- `head-results-390.png`
- `head-scheme-redirect.png`
- `head-student-record-1440.png`
- `parent-attendance-390.png`
- `parent-fees-390.png`
- `parent-home-1280.png`
- `parent-home-390.png`
- `parent-marks-390.png`
- `parent-messages-390.png`
- `parent-notices-390.png`
- `parent-profile-390.png`
- `student-goals-390.png`
- `student-home-390.png`
- `student-homework-390.png`
- `student-marks-390.png`
- `student-settings-390.png`
- `student-timetable-390.png`
- `teacher-marks-1024.png`
- `teacher-marks-book-1024.png`
- `teacher-messages-1024.png`
- `teacher-register-1024.png`
- `teacher-register-390.png`
- `teacher-reports-1024.png`
- `teacher-settings-1024.png`
- `teacher-today-1024.png`
