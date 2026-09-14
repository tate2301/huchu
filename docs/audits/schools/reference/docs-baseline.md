# Documentation baseline for the schools audit

This is the docs-only baseline the six persona audits are graded against: what the documentation claims exists, what it plans, what the marketing site sells, and where the documents contradict each other. It was produced from the documentation alone, before code was read, so that the workflow audits could be checked against a fixed statement of intent.

Scope: documentation only (no code read). Prepared 2026-09-14 for the 12-document schools audit.
All paths are relative to `/home/user/huchu`. Where a doc is quoted, the section heading is named.

Role model supplied by the audit lead (from code): school staff personas SCHOOL_ADMIN (head),
REGISTRAR, BURSAR, HOD, TEACHER, WARDEN, plus tenant SUPERADMIN/MANAGER (unconstrained). Portals:
parent (`parents.<tenant>`), student (`students.<tenant>`), teacher/staff (`staff.<tenant>`).
Note: `docs/expansion-plan/schools-production-readiness.md` §1 names the hosts as
`students.`/`parents.`/`teachers.` — the teacher host name differs from the `staff.` host the lead
supplied; the UI/routing auditors should confirm which is live.

---

## 1. Document inventory

| # | Document | Date / status markers | Purpose | Currency assessment |
|---|---|---|---|---|
| 1 | `docs/expansion-plan/schools-roadmap.md` | Changelog 2026-08-04 → 2026-08-05 (last row `7a91819`, 2026-08-05). Self-described "single source of truth for what is built and what is not" and "the body of the schools pull request". | Story ledger: 10 iterations + parked list, Status cells, changelog. Every other roadmap (`docs/rollout/*`) says it is "the sole story ledger for the Campus vertical". | **Most authoritative but ~6 weeks stale.** Nothing after 2026-08-05, while `docs/demo-playbook/known-issues.md` (2026-09-02) records schools fixes (e.g. `/schools/students` table width, `schools documents` PDF hydration error) that appear in no roadmap changelog row. The rollout program (Aug 18–24) also touches schools (fiscalisation, gate policy) without roadmap rows. Iteration 6 numbering note dated 2026-08-04. Several `_pending_` commit hashes in the changelog were never filled in (S-4.1–S-4.4, S-4.3 sub-rows, S-3.2, S-3.3, S-2.x, S-6.36/60/61). |
| 2 | `docs/expansion-plan/schools.md` | "Audited 2026-08-04" in §10; rest undated. Calls itself "the schools implementation contract". | Original codebase-aligned plan: nav model, route→API→service→model map, posting architecture, lifecycle, acceptance criteria, 5 weekly phases. | **Stale.** §10 status table still says Academic year "Missing", Provisioning "Missing", Timetable "Not real", Authorization "Unsound", Tests "Missing", Receipt posting "Partial", Fee money "Unsound" — all closed by roadmap Iterations 0–3. §3 nav lists `/schools/conduct`, `/schools/results/sheets` etc.; §7 "Cross-Entity Triggers (Teacher→Employee)" describes `lib/platform/entity-triggers.ts`, deleted by S-0.8. §8 says portal `role` is `PARENT | STUDENT | TEACHER | HOD`. |
| 3 | `docs/expansion-plan/schools-pack-spec.md` | Undated; "Full Scope, Implementation-Ready". Normative refs: holy-grail + UX playbook. | Full data-model/API/workflow/QA spec for the pack (roles, feature keys, table sketches, state machines, posting map, QA/UAT catalog). | **Stale in names, useful in intent.** Uses bundle `ADDON_SCHOOLS_PACK` (live catalog uses `ADDON_SCHOOLS_SUITE` per `commercial-and-marketing.md`), feature keys like `schools.students.manage` (roadmap/open-questions cite `schools.students`, `schools.fees`, `schools.teachers`, `schools.core`, `schools.portal.*`), routes under `/api/schools/*` (live is `/api/v2/schools/*`), roles `academic-admin`, `timetable-admin`, `finance-admin`, `communications`, `class-teacher` that the code role model does not have. Models it specifies that were built differently: `SchoolPortalLink` (built as `SchoolPortalInvite` + `userId`), `SchoolAssessmentTemplate/Entry` (built as `SchoolAssessment`/`SchoolAssessmentScore`), `SchoolReportCard` snapshot (built as a document source `schools.report-card`), `SchoolNotice` (still todo S-9.6), `SchoolBoardingTransfer` (no roadmap story). |
| 4 | `docs/expansion-plan/schools-portals-phase2-spec.md` | Undated; branch `feat/schools-portals-phase2-v1` (ERP log dates it 2026-02-27). "Delivered slice". | Describes the Feb-2026 portal payloads and `VerticalDataViews` table portals. | **Superseded.** Roadmap S-6.0/S-6.36/S-6.60 deleted the `VerticalDataViews` portals and require portals to own their chrome (`MobileShell`, SHL·07). Its "fallback preview mode for privileged roles (SUPERADMIN, MANAGER, CLERK)" and email-based identity were removed by S-0.2. Its "Known gaps" (dedicated PARENT/STUDENT/TEACHER roles; leave lifecycle) are closed. |
| 5 | `docs/expansion-plan/schools-fees-phase3-spec.md` | Undated; branch `feat/schools-fees-phase3-v1` (2026-02-27). | Fee spine as delivered in Feb: structures, invoices, receipts, waivers, write-offs, accounting *events*. | **Superseded.** Describes `/schools/fees` page (now redirects per S-4.6), PENDING accounting-event emission (replaced by inline journal posting S-0.6), no refunds (S-2.6 built), Float money (S-2.1 fixed). Residual gaps listed are all closed. |
| 6 | `docs/expansion-plan/schools-governance-phase4-spec.md` | Undated; branch `feat/schools-governance-phase4-v1` (2026-02-27). | Teacher profiles/assignments, publish windows, moderation actions, portal scoping. | Mostly still true structurally (these models survived), but "Remaining gaps" (first-class portal roles; leave lifecycle; teacher `me/*` write endpoints) are closed by S-0.5, Phase 5, S-6.41/S-6.43. |
| 7 | `docs/expansion-plan/schools-car-sales-depth-phase5-spec.md` | Scope-trim notice added 2026-08-24; body from 2026-02-27. | Boarding leave lifecycle, admin pages for students/admissions/attendance/teachers, portal attendance + notices tables, `schools.teachers` feature key. | Car-sales half declared dead by its own banner; schools half "shipped" but describes the pre-roadmap admin surfaces. Its "portal notices table" and "attendance summary tables" were rebuilt as mobile screens in Iteration 6. |
| 8 | `docs/expansion-plan/schools-open-questions.md` | Entries 1–21, undated individually; entry 14 and 21 mark themselves closed; last entries relate to Iteration 4 (early Aug). "This file is a wall, not a log." | Decisions taken unilaterally, and open product questions. | **Partly stale** — several entries describe states the roadmap has since closed but the entry was not amended (see §6 and §7 below): #6 (portal nav 404s), #7 ("student portal shell is next"), #8/#17 (provisioning writes no enrolments — closed by changelog `d15a415`). |
| 9 | `docs/expansion-plan/schools-production-readiness.md` | "Audit date: 2026-08-04". | The audit the roadmap was derived from: blockers B1–B4, defects D1–D6, authorization, fake nav surfaces, missing depth, layered build plan. | Historic snapshot; every blocker and most defects are marked closed in the roadmap. Still the best description of *why* each story exists. States "Transport, library, health, canteen are absent" (first three since built: S-1.15, S-1.10, S-1.8; canteen still absent). |
| 10 | `docs/industry-implementation-plans/school-implementation-plan.md` | Undated; pre-codebase. | Eight-phase aspirational plan (tenant/roles, academic structure, records, fees, hostels, attendance & conduct, assessments, reporting). | Directional only. Promises not in the roadmap: payment plans, late-fee rules, dunning stages, auto-reminders, maker-checker for bursar approvals, housekeeping status for rooms, damage/incident logging, discipline/conduct, counsellor escalation, scheduled report emails, exam schedule scaffolding, guardian SMS/email templates. |
| 11 | `docs/industry-implementation-plans/package-features.md` (School Pack) | Undated. | Granular sellable feature inventory. | Directional; includes "Discipline/incidents", "payment plans", "late fee rules and dunning", "gateway integration hooks", "scheduled report emails", "guardian portal", "multi-tender intake" — several parked/todo. |
| 12 | `docs/industry-implementation-plans/addons-and-bundles.md` | Undated. | Add-on ideas. School add-ons: Learning module, Transport, Meal plans, PTA/Events, Admissions CRM; "School Growth Bundle". | Directional; does not match the four live `SCHOOL_ADD_ONS` in `lib/marketing/pricing.ts` (Transport, ZIMRA fiscalisation, Branding & domain, Data migration). |
| 13 | `docs/rollout/campus-alignment.md` | Created 2026-08-18. | Framing note: Campus is founder-managed; rollout takes no dependency on unshipped schools work; two passive obligations; three asks. | Current for the rollout program. Claims "Campus is the platform's most mature vertical" and that the roadmap shows "the overwhelming majority of its stories `done`" (count below: 84 of 125 non-parked = 67%). |
| 14 | `docs/rollout/master-rollout-plan.md` | Adopted Aug 2026; revised "at day 60". | 90-day program contract; founder decision #4: "Campus continues as the third vertical, founder-managed". | Current. Campus expansion explicitly "waits (post-90)". |
| 15 | `docs/rollout/pricing-packaging-roadmap.md` | Changelog to 2026-08-18. | PR- stories; PR-4.2 (schools bands reconciled with tiers) `todo`. | Current. |
| 16 | `docs/rollout/scope-trim-roadmap.md` | Aug 2026. | Module drops; confirms schools fees post through the kept posting engine and that "gold and schools tenants run it headlessly with no accounting UI entitlement"; banking-reconciliation UI **parked**. | Current. |
| 17 | `docs/expansion-plan/zim-smb-market-gameplan.md` | Undated (early 2026). | Market framing: schools as "fees-first wedge"; optional waves portals/academics/boarding. | Directional; mentions "publish rules with fee-threshold gate" and "SMS/WhatsApp abstraction for notices/receipts". |
| 18 | `docs/expansion-plan/erp-expansion-master-plan.md` | Scope-trim notice 2026-08-24; progress log ends 2026-02-27. | Multi-pack program; Wave 1 = Schools; progress log of the five Feb branches. | Stale except as history. |
| 19 | `docs/expansion-plan/platform-holy-grail.md` | Scope-trim notice 2026-08-24; body older. | Platform architecture. | **Contains zero mentions of "school"** (grep count 0) — predates the vertical. Still cited as "normative reference #1" by the pack spec and phase specs. |
| 20 | `docs/system-reference/live-capabilities.md` | "Reviewed 2026-08-24", body "written against the March 20, 2026 codebase"; the schools section is explicitly *not* re-verified. | Live route/API/entity inventory. | **Stale for schools** — see §7 (lists `/schools/portal/*`, `/schools/assessments`, `/schools/notices` as live pages; portal capabilities listed as read-only "visibility"). |
| 21 | `docs/system-reference/roadmap-and-direction.md` | Undated (March-era, car-sales strike-through added Aug). | Separates planned from live. "Schools Direction" list. | Stale: lists as future things now done (copy-forward, timetable conflicts, calendar/holidays, health/consent, duplicate detection). |
| 22 | `docs/system-reference/platform-overview.md` | Aug-2026 edits (retired profiles). | Product shape; portal auth = credentials login for parent/student/teacher; OTP/email-link "dark-launch / future". | Current at platform level; relevant to S-6.1 (parent OTP) and S-6.20 (student PIN) being `todo`. |
| 23 | `docs/system-reference/route-and-surface-inventory.md` | Route tables regenerated 2026-08-24; catalog counts still March. | Counts: `portal` 75 pages, `schools` 48 pages; `v2` 306 API routes. | Partly current. |
| 24 | `docs/system-reference/commercial-and-marketing.md` | Reviewed 2026-08-24. | Marketing-safe claims; add-on table (`ADDON_SCHOOLS_SUITE` 320/mo + 35/site; `ADDON_PORTAL_SUITE` 110/mo); school demo script; "do not overclaim offline". | Current for platform; schools priced here monthly, but the site sells per-term bands (see §4). |
| 25 | `docs/design-system/portals/README.md` | Downloaded 2026-08-04. | Portal build contract: "every feature in a demo is required"; feature inventory; marketing scope cross-check. | Current as contract; its feature inventory undercounts what the prototypes contain (see §8). |
| 26 | `docs/design-system/portals/{parent,student,teacher}.html` | Downloaded 2026-08-04 from design.corelith.co.zw. | The three prototypes. | The contract. |
| 27 | `docs/design-system/09-campus-canvas-law.md`, `10-campus-screen-contract.md`, `11-campus-states-and-motion.md` | Undated (post-roadmap; reference `design/campus/` canvas and `scripts/campus-conformance.mjs`, `scripts/campus-states-audit.mjs`). | Admin-screen layout law, build contract, states/motion. | Current; **conflicts with the roadmap's standing instruction on class navigation vs filter, and with `docs/ux/platform-ux-playbook.md` on hidden vs disabled actions** (see §7, §9). |
| 28 | `docs/payments/README.md`, `01-payment-seam.md` | ToomaPay docs read 2026-08-29. | Payment seam for **subscription** payments (`SubscriptionPayment`); adapters paynow/pesepay/contipay; ToomaPay "evaluated, not built". | Current. Not a school-fee payment path (see §5). |
| 29 | `docs/demo-playbook/tenants.md`, `known-issues.md` | Updated 2026-09-02. | Demo tenant "St Marys High School" (`stmarys`): 120 pupils, 6 forms, 8 teachers, 119 guardians, 90 register sessions, 156 assessments, 120 invoices; portal logins; known issues. | Most recent schools-relevant doc. Uses a different demo tenant than the roadmap/open-questions (`chisipite-demo`, "Nightingale House"). |
| 30 | `app/home/site-data.ts` (`schoolsTrack`), `lib/marketing/pricing.ts` (`SCHOOL_PRICING_BANDS`, `SCHOOL_ADD_ONS`) | Live code (marketing). | What is sold. | Authoritative for promises; see §4. |

---

## 2. Roadmap status table (`docs/expansion-plan/schools-roadmap.md`)

Legend from the doc: `done` = acceptance signal demonstrated + DoD; `wip`; `todo`; `blocked`; `parked`.
DoD (7 items): tsc, eslint, vitest, next build, screenshots at 390×844 and 768×1024, tokens only, audit event + companyId scoping. **Known debt:** S-0.1–S-0.9 and S-3.1 were marked done before the visual pass; only academics, guardians, students, teachers surfaces are screenshot-verified — "the rest of the pack is not, which is what S-10.1 and S-10.2 still track." Doc also says "`done` … should be read as 'verified by tests and build' unless its changelog row says it was seen."

### Iteration 0 — Truth and safety
| ID | Promise (one line) | Status |
|---|---|---|
| S-0.1 | School admin opens academic year/terms, makes one current | done |
| S-0.2 | Portal identity by `userId` link, not email match | done |
| S-0.3 | Bursar invites guardians/students; single-use expiring claim tokens (`/c/[token]`) | done |
| S-0.4 | Guardian consent flags (`canReceiveFinancials`/`canReceiveAcademicResults`) enforced, editable via PATCH guardian-links | done |
| S-0.5 | HOD + WARDEN roles; `requireSchoolPermission` on all 56 unguarded routes; teacher cannot post a receipt | done |
| S-0.6 | Fee receipt posts to GL inline via `createJournalEntryFromSource` | done |
| S-0.7 | Fabricated timetable (`deriveSlot`) deleted until S-1.1 | done |
| S-0.8 | Dead `entity-triggers.ts` deleted | done |
| S-0.9 | Portal links removed from staff nav | done |

### Iteration 1 — Domain
| ID | Promise | Status |
|---|---|---|
| S-1.1 | Timetable: periods, rooms, slots, clash rejection (DB constraints), copy-forward; by-class and by-teacher views; grid at `lg`+, day view below | done |
| S-1.2 | School calendar/holidays; "registers not taken" computable; `GET /api/v2/schools/calendar?on=` | done |
| S-1.3 | Assessments → scores → result lines; grading scheme with bands; CA/exam weighting; primary (class teacher) vs secondary (subject teacher) shapes; capture is teacher-portal work | done |
| S-1.4 | Admissions pipeline application→offer→enrolment, board + duplicate detection | done |
| S-1.5 | Head rolls school into next year in one reviewable batch (plan then apply) | done |
| S-1.6 | Bed allocation respects gender policy and capacity; partial unique index closes race | done |
| S-1.7 | Teacher profile linked to `Employee` (`employeeId` unique nullable FK) | done |
| S-1.8 | Health/allergy/consent records (`SchoolHealthRecord`, health events) | done |
| S-1.9 | Homework `SchoolAssignment` + submissions | done |
| S-1.10 | Library: books/copies, lend/return/renew/reserve, overdue fines | done |
| S-1.11 | Lesson plans, cover lessons, copy-from-last-week | done |
| S-1.12 | Teaching resource library (link-only until Iteration 5 uploads) | done |
| S-1.13 | Student goals, one per subject per term, baseline stamped | done |
| S-1.14 | Parent meeting slots, one live slot per teacher per time | done |
| S-1.15 | Transport routes/stops/rider registers; billing reported, never posted (paid add-on) | done |
| S-1.16 | Auto-fill timetable (greedy first-fit, never moves hand-placed lessons) | done |
| S-1.17 | HOD bulk allocation of a teacher to a subject across year groups | done |

### Iteration 2 — Money
| ID | Promise | Status |
|---|---|---|
| S-2.1 | Money `Decimal(14,2)` with migration witness test | done |
| S-2.2 | USD/ZWG: `currency`, `exchangeRate`, `baseAmount` on invoice/receipt/waiver | done |
| S-2.3 | School `AccountingSourceType` members, `SCHOOLS_REQUIRED_SOURCE_TYPES`, posting rules seeded | done |
| S-2.4 | No duplicate invoice per student/term/fee structure — partial unique index excluding VOIDED; bulk-generate skips existing | done (row corrected) |
| S-2.5 | Overpayment becomes credit, validated inside the transaction | done |
| S-2.6 | Refunds (`SchoolFeeRefund`) replacing the 501 stub | done |
| S-2.7 | Fee receipts fiscalised via existing FDMS link (fiscalisation add-on) | done |
| S-2.8 | Six privileged fee actions write `PlatformAuditEvent` in-transaction | done |

### Iteration 3 — Provisioning
| ID | Promise | Status |
|---|---|---|
| S-3.1 | `provisionSchool` seeds year, terms, ladder, subjects, grading scheme, fee structure, accounting defaults, roles; invoked by wizard on `TEMPLATE_SCHOOLS` | done |
| S-3.2 | `prisma migrate deploy` builds an empty DB; `scripts/verify-migration-replay.sh` | done |
| S-3.3 | Migration importer ($199 add-on): students, guardians, classes, fee structures, opening balances; dry run, idempotent re-run, rollback | done |

### Iteration 4 — Record surface
| ID | Promise | Status |
|---|---|---|
| S-4.1 | Record components moved to `components/records/` behind `lib/records/registry.ts` | done |
| S-4.2 | Tasks/comments/files/mentions keyed by `(subjectType, subjectId)`; `/api/v2/records/{files,comments}`; Notes + Files on school records; **tasks and mentions "still to come"** | done |
| S-4.3 | Six record pages (student, guardian, teacher, class, subject, hostel) with identity strip/avatars/tabs | done |
| S-4.4 | Custom fields on school record types via CRM field engine; `configure` action admin-only | done |
| S-4.5 | Unified record search `/api/v2/records/search` with `searchSchools` arm | done |
| S-4.6 | Year group as route (students, attendance, results, fees); `/schools/finance/ledger`; `/schools/fees` redirects; fee structure clone | done |

### Iteration 5 — Documents
| ID | Promise | Status |
|---|---|---|
| S-5.1 | Branded invoice, receipt, statement via `lib/documents/` (addressed to guardian; Decimal strings) | done |
| S-5.2 | Report cards gated on open `SchoolPublishWindow` AND PUBLISHED sheet; per-subject pass mark | done |
| S-5.3 | Admission letter, transfer letter (states balance), class list, blank register | done |
| S-5.4 | Real CSV/PDF report exports with declared columns | done |

### Iteration 6 — Portals (one story per capability; parent 1–19, student 20–39, teacher 40–61)
**Parent — mobile**
| ID | Promise | Status |
|---|---|---|
| S-6.0 | Own app shell: `MobileShell`, tabs Home · Fees · Notices · Profile, child switcher, household resolved server-side; old `/portal/parent` deleted | done |
| S-6.1 | Sign in with a code (OTP), resend, wrong-code state | todo |
| S-6.2 | Child switcher, persisted; every child endpoint re-checks link (`scopeToChild`) | done |
| S-6.3 | Home: owed / attendance / marks / notices cards; withheld figure absent not zero | done |
| S-6.4 | Attendance term summary + any day; DRAFT register labelled "not yet submitted" | done |
| S-6.5 | Published marks, gated on PUBLISHED + consent; per-subject pass mark | done |
| S-6.6 | What I owe by invoice line; amounts as strings | done |
| S-6.7 | Download receipt (S-5.1 doc) | done |
| S-6.8 | Term statement download | done |
| S-6.9 | Pay fees from phone (EcoCash, OneMoney, bank, card) — depends S-7.3 | todo |
| S-6.10 | Split/part payment | todo |
| S-6.11 | Payment history by child and method | todo |
| S-6.12 | Read notices; per-recipient read state; mark all read | done |
| S-6.13 | Reply to a notice, see replies — depends S-7.1 | todo |
| S-6.14 | Message child's teacher with attachment — depends S-7.1 + `lib/uploads/` | todo |
| S-6.15 | School events, RSVP, calendar export — depends S-1.2 | todo |
| S-6.16 | Language picker | todo |
| S-6.17 | Two-factor with recovery codes | todo |
| S-6.18 | Session list / end session | todo |
| S-6.19 | Help: six office questions answered | done |

**Student — mobile and tablet**
| ID | Promise | Status |
|---|---|---|
| S-6.20 | PIN sign-in | todo |
| S-6.21 | Change / recover PIN | todo |
| S-6.22 | Timetable today + week | done |
| S-6.23 | Open a class from the timetable | done |
| S-6.24 | Assignment list with filters | done |
| S-6.25 | Hand in work, handed-in state | done |
| S-6.26 | Marks for the term | done |
| S-6.27 | Report card by term — depends S-5.2 | todo |
| S-6.28 | Browse library, borrow | done |
| S-6.29 | Return incl. scan-to-return | done |
| S-6.30 | Renew / reserve | done |
| S-6.31 | Fines and fine payment — depends S-7.3 | todo |
| S-6.32 | Goals per subject | done |
| S-6.33 | Notification cadence preference — depends S-9.5 | todo |
| S-6.34 | Profile edit + theme | done |
| S-6.35 | Help centre with helpfulness feedback | done |
| S-6.36 | Own mobile shell: tabs Home · Timetable · Marks · Profile; no dashboard chrome under `/portal/student` | done |

**Teacher — tablet and desktop**
| ID | Promise | Status |
|---|---|---|
| S-6.40 | Today's lessons | done |
| S-6.41 | Register with mark-all + per-student override (moved from `/schools` to `/portal/teacher/register`) | done |
| S-6.42 | Attendance history | todo |
| S-6.43 | Gradebook entry cell by cell, autosave | done |
| S-6.44 | Custom assessment column | todo |
| S-6.45 | Papers-to-mark queue with filters | done |
| S-6.46 | Publish marks to parents under school rules | todo |
| S-6.47 | Parent message threads — depends S-7.1 | todo |
| S-6.48 | Quick replies — depends S-7.1 | todo |
| S-6.49 | Whole-class broadcast — depends S-7.1 | todo |
| S-6.50 | Week timetable | done |
| S-6.51 | Lesson plans | done |
| S-6.52 | Copy last week forward | done |
| S-6.53 | Cover lessons — depends S-1.11 | todo |
| S-6.54 | Homework authoring | done |
| S-6.55 | Resource library with upload | done |
| S-6.56 | Parent meetings | done |
| S-6.57 | Teacher reports (how my classes are doing) | done |
| S-6.58 | Five settings panels (notifications, publishing, appearance, security, privacy) | done |
| S-6.59 | Shared-device sign-out and idle lock | todo |
| S-6.60 | Own shell (SHL·07): class rail above nav, groups daily work / more / account; no dashboard chrome | done |
| S-6.61 | Classroom work removed from admin nav/registry; office keeps oversight only | done |

### Iteration 7 — Messaging and payments
| ID | Promise | Status |
|---|---|---|
| S-7.1 | One realtime messaging primitive (threads, broadcast, notice replies) | todo |
| S-7.2 | Broadcast + quick-reply primitives | todo |
| S-7.3 | Parent fee payment primitive (EcoCash/OneMoney/bank/card) reconciled into receipts and posted | todo |
| S-7.4 | Bursar sees/reconciles portal payments by method | todo |

### Iteration 8 — Offline ("Sold explicitly")
| ID | Promise | Status |
|---|---|---|
| S-8.1 | Offline register via outbox (`lib/offline/module-registry.ts`, `workflow-catalog.ts`) | todo |
| S-8.2 | Offline fee receipting | todo |
| S-8.3 | Duplicate offline submission conflict resolution | todo |

### Iteration 9 — Dashboard, reporting, notifications
| ID | Promise | Status |
|---|---|---|
| S-9.1 | Head dashboard about this term (enrolment vs capacity, register completion, collections vs target, arrears aging, sheets awaiting moderation, occupancy, boarders on leave, exceptions) | todo |
| S-9.2 | Absence notification to parent | todo |
| S-9.3 | Fee due / paid / arrears notifications | todo |
| S-9.4 | Results-published notification | todo |
| S-9.5 | Schools notification preference category | todo |
| S-9.6 | School notice entity with audience targeting + compose (replaces read-only feed) | todo |
| S-9.7 | Board reporting pack | todo |

### Iteration 10 — Visual and mobile pass
| ID | Promise | Status |
|---|---|---|
| S-10.1 | Every school admin surface works at 390×844 | todo |
| S-10.2 | Every school surface works at 768×1024 | todo |
| S-10.3 | Every portal surface matches its prototype (screenshot compare) | todo |
| S-10.4 | Avatars everywhere people are listed (admissions board, welfare, Iteration 4 record pages "still bare") | wip |
| S-10.5 | Library is a grid of covers (`BookCover`) | done |

### Parked
| ID | Story | Reason |
|---|---|---|
| S-P.1 | Behaviour, merits and discipline | Sold in no band/add-on; absent from prototypes |
| S-P.2 | Communications log | Superseded by S-7.1 |

### Counts
- Total stories: 127 (125 active + 2 parked).
- **done: 84** (It0 9, It1 17, It2 8, It3 3, It4 6, It5 4, It6 36 [parent 10, student 12, teacher 14], It10 1).
- **todo: 40** (parent 10, student 5, teacher 8, It7 4, It8 3, It9 7, It10 3).
- **wip: 1** (S-10.4). **blocked: 0**. **parked: 2**.
- "partial" is not a legend value; it appears only in changelog rows (S-4.2, S-4.3 interim).
- Notable: **all of Iterations 7, 8 and 9 are `todo`** — messaging, in-portal payments, offline, the head dashboard, every parent notification, notice compose and the board pack.

---

## 3. Claimed capabilities per persona (what the docs say exists)

### Admin (tenant SUPERADMIN/MANAGER + SCHOOL_ADMIN: configuration and master data)
- Academic year and terms, exactly one current (roadmap S-0.1; `lib/schools/calendar.ts`; partial unique indexes). Calendar events/holidays with `isTeachingDay` override (S-1.2; open-questions #1–2: weekends closed by default, no per-school teaching-days setting).
- Class ladder, streams, subject catalogue, grading scheme with bands and per-subject pass mark (S-1.3; S-3.1 seeds them). Overlapping bands refused in code, not DB (open-questions #3).
- Master timetable: periods, rooms, slots, clash constraints, copy-forward, greedy auto-fill; "The master timetable stays with the office" (S-1.1, S-1.16; open-questions #11).
- Teacher directory linked to HR `Employee`; teacher record page edits only department/form/HOD/active, the rest read-only "with whose it is in the label" (S-1.7; changelog "S-4.3 → teacher").
- Record pages for student, guardian, teacher, class, subject, hostel with identity strip, avatar, inline edits, Notes + Files tabs (S-4.3, S-4.2). Tasks and mentions on school records "still to come". Date properties read-only everywhere (open-questions #17).
- Custom fields on school record types, `configure` is admin-only (S-4.4). No custom-fields tab on teacher (ownership of "teaching qualification" undecided).
- Unified search over students, guardians, staff, classes, subjects, hostels (S-4.5).
- Role model: SCHOOL_ADMIN, REGISTRAR, BURSAR, HOD, TEACHER, WARDEN; `requireSchoolPermission` keyed to resource+action (S-0.5). `SCHOOLS` lists its own roles in the vertical registry.
- Provisioning: `provisionSchool` + `scripts/provision-school.ts`; org-provision wizard on `TEMPLATE_SCHOOLS`; `ensureCurrentTermEnrolments` last step (changelog `d15a415`). Feature entitlement needs `CompanySubscriptionAddon` → `FeatureBundle` (`ADDON_SCHOOLS_SUITE`), seeded by `syncEntitlement…` (changelog `8b9db9b`).
- Data import ($199 add-on): students, guardians, classes, fee structures, opening balances; dry run; re-run idempotent on student number; rollback stops rather than cascades; 5000 rows/5 MB cap; no partial-commit undo (S-3.3; open-questions #16).
- Portal invitations and claim (`SchoolPortalInvite`, `/c/[token]`) from detail pages or in bulk (S-0.3 — story is phrased "As a bursar").
- Documents: eight sources through `lib/documents/` — invoice, receipt, statement, report card, admission letter, transfer letter, class list, blank register (S-5.1–5.3). Access checked per document on feature AND role.
- Reports with real CSV/PDF export (S-5.4). `docs/design-system/09` §7 and `design/campus/checklist/Reports.json`, `ReportsArrears.json` describe the report screens.
- Notices: **read-only feed** over `NotificationRecipient` until S-9.6 (production-readiness §5; roadmap S-9.6 `todo`).
- Id numbering continues the school's own scheme (`inferNumbering`, changelog `8a02a09`).
- `docs/design-system/09` §8 and `11`: every admin screen has eight states via `components/schools/common/states.tsx`.

### Head (SCHOOL_ADMIN as head; HOD for departmental governance)
- Year roll-up: promote/repeat/graduate/transfer as plan + apply, nothing inferred server-side (S-1.5).
- HOD bulk allocation of a teacher to a subject across year groups (S-1.17).
- Results governance (Phase 4 spec "Scope Delivered"; production-readiness §1): moderation chain DRAFT → SUBMITTED → HOD_APPROVED → PUBLISHED with `SchoolResultModerationAction` rows; HOD actions require `isHod=true`; publish requires an OPEN `SchoolPublishWindow`; unpublish endpoint; `/schools/results` has moderation / all / published / publish-windows views.
- Report cards publish gated on window + PUBLISHED sheet (S-5.2). Prototype teacher "Send marks to parents" publishing is S-6.46 `todo`.
- Register oversight: "which registers were not taken" is an admin screen (`register-oversight-content.tsx` is the exemplar in `docs/design-system/10`); closed days show "Not a school day" (S-1.2).
- Audit of who changed what a family owed (S-2.8, phrased "As a bursar's head").
- Real report exports for the board (S-5.4). Board reporting pack (S-9.7) `todo`. Head dashboard about the term (S-9.1) `todo` — production-readiness never described the current `/schools` dashboard beyond "row counts"; Phase 4 spec says the dashboard shows governance counters.
- Design canvas draws `design/campus/leadership/HeadDashboard.dc.html`, `HodModeration.dc.html`, `HodPublishWindows.dc.html` (no roadmap stories reference these artboards; S-9.1 is the only dashboard story).
- Hydration and offline-guard bugs fixed at platform level so every authenticated page renders (open-questions #12, #21).

### Bursar (fees / finance)
- Fee structures per class/term with lines; clone up the ladder (`POST …/fees/structures/[id]/clone`) (S-4.6). Every structure showed $0.00 before the fix (changelog `3542e7f`).
- Bulk invoice generation per term, skip-existing default, partial unique index `(companyId, studentId, termId, feeStructureId) WHERE status <> 'VOIDED'` (S-2.4).
- Invoice issue, write-off, waiver approve/apply, receipt with allocation, void, refunds (Phase 3 spec; S-2.5, S-2.6). Overpayment carried as credit (S-2.5).
- Money `Decimal(14,2)`; USD or ZWG with `exchangeRate`/`baseAmount` (S-2.1, S-2.2).
- Receipts post inline to GL with idempotency keys and period locks; school source types and posting rules (S-0.6, S-2.3). Scope-trim confirms schools tenants post "headlessly with no accounting UI entitlement".
- Fiscal receipts through the generic FDMS connector (S-2.7); `fdms-roadmap.md` changelog: schools "falls back to the unchained path when a tenant has no device".
- Six privileged fee actions audited (S-2.8).
- Fees by year group at `/schools/finance` with "what each year group owes and how much is late"; whole-school ledger at `/schools/finance/ledger` (S-4.6). Canvas checklists `Fees`, `FeesClass`, `LedgerInvoices/Receipts/Waivers/Refunds/Credits/Structures`, `FeeBulkGenerate`, `FeeDialogs`, `ReportsArrears`.
- Branded invoice/receipt/statement PDFs addressed to the guardian (S-5.1).
- Portal invites (S-0.3). Transport billing "reported, never posted" (S-1.15). Library fines charged (S-1.10); fine payment in the student portal is S-6.31 `todo`.
- **Not yet:** portal payments reconciliation (S-7.4), offline receipting (S-8.2), fee reminders (S-9.3), payment plans / late fees / dunning (only in `school-implementation-plan.md` and `package-features.md`; no roadmap story), bursar dashboard (canvas `BursarDashboard.dc.html`, `BursarReceipts`, `BursarWaivers`, `BursarInvoiceActions` — no roadmap story).

### Warden (boarding and welfare)
- Bed allocation enforcing gender policy (a choice, not free text) and capacity; races closed by partial unique index on bed and student-per-term (S-1.6; changelog "S-4.3 → hostel": beds free counted from beds that exist, `capacity` shown as "intended capacity").
- Leave/outing lifecycle SUBMITTED→APPROVED→CHECKED_OUT→CHECKED_IN with movement logs (Phase 5 spec).
- Health/allergy/consent records and health events (S-1.8; sold as "sanatorium"). Canvas `BoardingWelfare.json`.
- Hostel record page with rooms/beds (S-4.3). Canvas `WardenDashboard`, `WardenBedAllocate` (no roadmap story).

### Parent portal (see Iteration 6 table)
Exists per roadmap: own mobile shell, child switcher, home cards, attendance (with DRAFT labelling), published marks with consent, fee lines, receipt and statement download, notices with read state, help. `docs/demo-playbook/tenants.md` §2: "Sign in as the parent and show them their own child's attendance and invoice. This is usually the moment a school buys." `known-issues.md`: seeded parent has one child.
Not yet: OTP sign-in, payments, split payments, payment history, notice replies, messaging, events/RSVP/calendar, language, 2FA, sessions.

### Student portal
Exists: own mobile shell, timetable day/week, class detail, assignments + hand-in, marks, library borrow/return/scan/renew/reserve (grid of covers, S-10.5), goals, profile + theme, help with feedback.
Not yet: PIN sign-in/change/recover, report card, fines payment, notification cadence.

### Staff/Teacher portal
Exists: SHL·07 shell with class rail, Today, register with mark-all, gradebook entry, papers-to-mark, week timetable, lesson plans + copy-forward, homework authoring, resource library with upload, parent meetings, teacher reports, five settings panels. Classroom work removed from admin (S-6.61; open-questions #11).
Not yet: attendance history, custom columns, publish-to-parents, all messaging (threads, quick replies, broadcast), cover lessons in the portal, shared-device sign-out/idle lock. Open-questions #9: portal uses tenant `--brand`, not the prototype's purple `--te-brand`.
`live-capabilities.md` "Current portal capabilities" still describes the teacher portal as "class visibility / attendance visibility / marks visibility" (read-only) — stale.

---

## 4. Marketing promises vs roadmap

Sources: `app/home/site-data.ts` `schoolsTrack` (page `/home/schools`), `lib/marketing/pricing.ts` `SCHOOL_PRICING_BANDS` / `SCHOOL_ADD_ONS`, `docs/industry-implementation-plans/package-features.md`, `docs/system-reference/commercial-and-marketing.md`.

### What the site sells
- Headline: "Collect the fees you are owed. Keep one record of every child." Audience: "Private and mission schools, boarding schools, colleges and multi-campus groups".
- Assurances: "From $249 per campus, per term", "Unlimited staff and teacher accounts", "Your records migrated before you open".
- Workflow: Application → Admission → Fee schedule → Payment → Academics → Parent portal.
- Capabilities (six cards): Admissions and student records ("Applications, offers, enrolment, guardians, classes, documents"); Fees and finance ("Fee structures, bulk invoicing, receipts, waivers, statements and an arrears list the bursar can work through daily"); Academics ("Attendance registers, subjects, teachers, marks entry, moderation windows and report cards that publish"); Boarding and welfare ("Hostels, beds, leave, sanatorium and the day-to-day records"); Parent and teacher portals ("Parents check balances, statements and results on their own phone"); Reporting for the board ("Enrolment, collections, arrears, attendance and results in the shape a board actually asks for").
- Outcomes: arrears visible from week one; one student record; parents self-serve; "Term-end reporting is a page the head opens".
- FAQs: per-term pricing; $199 one-off migration ("students, guardians, classes, fee structures and outstanding balances"); **offline** ("Attendance capture and fee receipting keep working with no connection and sync once it returns"); no app install ("The parent portal opens in a browser on any phone"); **multi-campus** ("Every campus keeps its own registers, fee structure and staff, while the group consolidates into one set of books and one reporting line. The Group band is quoted").
- Bands: Community ≤300 $249/term (admissions, directory, registers, fees/invoicing/receipts, teacher/class management, unlimited staff, WhatsApp support); Standard ≤800 $549 (+ results/assessments/report cards, **parent and student portal**, arrears tracking + statements, term and year reporting); Premier ≤1500 $949 (+ boarding, **teacher portal and results moderation**, "Accounting, AR/AP, and banking", custom branding and school domain, priority support); Group quoted (+ multi-campus consolidation and reporting, group-level finance and governance, data migration, on-site onboarding, named account manager). Indicative Group rate $0.55/student/term.
- Add-ons per term: Transport & routes $79; ZIMRA fiscalisation $49 ("fees, tuck shop, and uniform sales"); Custom branding & domain $79; Data migration $199 one-off.
- `PRODUCT_COMMERCIALS` for slug `schools`: pricingModel `bespoke`, required `ADDON_SCHOOLS_SUITE`, recommended `ADDON_ACCOUNTING_CORE` + `ADDON_PORTAL_SUITE`, recommended tier `GROW`, `pricingHref /home/schools`.

### Sold but not done / parked (per roadmap)
| Promise | Where sold | Roadmap state |
|---|---|---|
| Offline registers and receipting | site FAQ; roadmap Iteration 8 preamble quotes it | S-8.1–8.3 all `todo`. `commercial-and-marketing.md` "What Not To Overclaim → Offline": "Do not market the platform as broadly offline-first today." The teacher prototype also shows an offline banner ("changes will save once the internet comes back"). |
| Board reporting "in the shape a board actually asks for" | site capability card + outcome | S-9.7 `todo`; S-5.4 exports done. |
| "Term-end reporting is a page the head opens" | site outcome | S-9.1 head dashboard `todo`. |
| Multi-campus group with consolidated books | site FAQ; Group band; `platform-overview` "multi-site" | **No schools-roadmap story mentions campus/group consolidation.** Nothing in the roadmap models a multi-campus school. |
| Parent portal "results on their own phone" | site | done (S-6.5), but results-published notification S-9.4 `todo`. |
| Fees "arrears list the bursar can work through daily" | site | Year-group "how much is late" done (S-4.6); arrears reminders S-9.3 `todo`; canvas `ReportsArrears`. |
| Transport & routes add-on with "transport billing" | `SCHOOL_ADD_ONS` | S-1.15 done but billing "reported, never posted". |
| ZIMRA fiscalisation for "tuck shop, and uniform sales" | `SCHOOL_ADD_ONS` | S-2.7 covers **fee receipts** only; no tuck-shop/uniform sales exist in the pack (would be retail). Native FDGA migration for fees is an un-added story (`campus-alignment.md`). |
| Premier: "Accounting, AR/AP, and banking" | band | Banking-reconciliation UI is **parked** under ST-1.2 (`scope-trim-roadmap.md`); schools post headlessly. `ADDON_ACCOUNTING_ADVANCED` "lists five features of which three have no entry point" (master plan). |
| Premier includes "Custom branding and school domain" AND it is a $79/term add-on | band vs add-on | Internal inconsistency in `pricing.ts`. |
| Portals gated by band (Community none, Standard parent+student, Premier teacher) | bands | No doc describes band → feature-key mapping; `ADDON_SCHOOLS_SUITE` in the catalog is "student, academics, boarding, fees, and school portals" as one bundle. PR-4.2 (reconcile bands with tiers) `todo`. |
| Package-features "Discipline/incidents" | `package-features.md` | Parked S-P.1 ("Sold in no band and no add-on"). |
| Package-features "payment plans", "late fee rules and dunning", "scheduled report emails", "gateway integration hooks", "multi-tender intake" | `package-features.md`, `school-implementation-plan.md` | No roadmap story; roadmap-and-direction lists them as direction. |
| Add-ons "Learning module, Meal plans, PTA/Events, Admissions CRM" | `addons-and-bundles.md` | Not sold on the site; no stories. |
| Teacher "Send marks to parents" | prototype (contract) | S-6.46 `todo`. |
| In-portal payment (EcoCash/OneMoney/card/bank) | prototype (contract); not on the site | S-6.9/6.10/6.11/7.3/7.4 `todo`. |
| "Unlimited staff and teacher accounts" | site | No doc contradicts; no story tests it (user-pack pricing `USER_PACK_SIZE` exists in the catalog — possible conflict, code auditors to check). |

### Sold and done
Applications/offers (S-1.4), bulk invoicing/receipts/waivers/statements (It2, S-5.1), registers/marks/moderation/report cards (S-1.3, Phase 4, S-5.2), hostels/beds/leave/sanatorium (S-1.6, S-1.8, Phase 5), parent portal balances/statements/results (S-6.x), USD/ZWG (S-2.2), fiscalisation of fee receipts (S-2.7), data migration (S-3.3), branding/domain (platform `ADDON_CUSTOM_BRANDING`).

---

## 5. Future plans (everything the docs say is next), with source

**Schools roadmap `todo`/`wip` (`schools-roadmap.md`)** — Iteration 6 remainder (20 portal stories), Iteration 7 messaging + payments, Iteration 8 offline, Iteration 9 dashboard/notifications/notices/board pack, Iteration 10 visual pass. Order of work: "Iterations otherwise ship in order", with the exception that the two portals were finished ahead of the admin dashboard.

**Payments**
- S-7.3: "EcoCash, OneMoney, bank transfer or card … recorded against the invoice, reconciled into the existing receipt and allocation flow, posted through accounting". `portals/README.md` "Scope this adds": payments must be "designed once rather than per portal".
- `docs/payments/README.md`: the seam in `lib/payments/` (`PaymentProviderAdapter`, `PAYMENT_PROVIDER`, adapters paynow / pesepay / contipay) currently serves **`SubscriptionPayment` / `CompanySubscription`** — platform billing, not school fees. ToomaPay is "evaluated, not built"; four contract details unpublished by the vendor (`03-toomapay-integration-plan.md`). `01-payment-seam.md`: status vocabulary INITIATED/PENDING/PAID/FAILED/CANCELLED; verify → record → deduplicate → apply; idempotency key claimed before the gateway call. Implication for auditors: S-7.3 has no documented design for attaching the seam to `SchoolFeeInvoice`/`SchoolFeeReceipt`.
- Rollout SS-4 "payment rails" (`master-rollout-plan.md` dependencies) is for subscriptions/dunning.

**Fiscalisation** — `campus-alignment.md` "What Campus needs from the rollout" #1: native FDGA for fee receipts after FD-3, "a schools-roadmap story, added there under its new-scope rule" (not yet added). `fdms-roadmap.md` standing instruction: schools fee-receipt path must stay green every iteration; FD-0..FD-4 code-complete, ZIMRA sandbox untouched.

**Gate policy flip** — `campus-alignment.md` obligation #1: before SS-1.1 flips `FEATURE_GATE_POLICY=deny`, the audit must cover portal hosts and `app/api/v2/portal/*`; "a portal route missing from `lib/platform/gating/route-registry.ts` fails closed for parents and students on flip day". Open-questions #18: `/api/v2/records/**` are *deliberately* unregistered.

**Pricing** — PR-4.2: reconcile `SCHOOL_PRICING_BANDS` with the tier ladder; recommendation that they "survive as a vertical pricing model". PR-4.1 marketing re-derivation `todo`. `pricing.ts` header: bands reconciled to `ADDON_SCHOOLS_SUITE` by `pricing.test.ts`.

**Self-serve** — `campus-alignment.md` #3: school tenants "remain operator-provisioned"; the public trial (SS-3) covers Fiscal and Start only.

**Messaging / WhatsApp / SMS** — S-7.1 realtime messaging primitive; `zim-smb-market-gameplan.md` "Platform polish": "Messaging connectors (SMS/WhatsApp abstraction) for notices/receipts"; `school-implementation-plan.md` phase 6: "guardian notifications (email/SMS) with templates"; `package-features.md` "Attendance: … notifications"; rollout SS-5 "lifecycle messaging" and the WhatsApp number as signup identifier (platform). No schools story names SMS or WhatsApp delivery; S-9.2–9.4 use "the existing notification pipeline" (in-app/web push). `master-rollout-plan.md`: "the web-push send path" explicitly waits post-90.

**Mobile** — `schools-pack-spec.md` §2.2 SCH-DEP-03 "Native mobile app and push notifications … Wave 4"; site FAQ: no app install; portals are mobile web (`MobileShell`). `erp-expansion-master-plan.md` out of scope: "Native mobile clients".

**Offline** — Iteration 8 (todo); `roadmap-and-direction.md`: "older docs still contain stronger offline language than the current codebase supports"; teacher prototype offline banner; canvas `OfflinePage.json`, `StateOffline.json`.

**Multi-campus** — site FAQ and Group band only; `package-features.md` "Tenant setup: schools/branches"; `school-implementation-plan.md` phase 1 "map org tree to campuses/branches". No roadmap story.

**Auth** — parent OTP (S-6.1), student PIN (S-6.20/21), 2FA (S-6.17), sessions (S-6.18), shared-device lock (S-6.59). `platform-overview.md`: OTP/email-link are "dark-launch / future strategies".

**Records** — S-4.2 leftovers: tasks and mentions on school records; open-questions #19: drop legacy subject columns after backfill; #17: date picker in record properties; teacher custom fields ownership.

**Other directional (no story)** — conduct/discipline (parked), communications log (parked), payment plans/late fees/dunning/auto-reminders, scheduled report emails, exam schedule scaffolding, room housekeeping/damage logs, canteen/meal plans, learning module/LMS, PTA/events, admissions CRM, "publish rules with fee-threshold gate" (`zim-smb-market-gameplan.md`, `schools.md` §4.5 `lib/schools/publishing.ts` "fee threshold gate"), automated timetable solver (SCH-DEP-01, partially answered by S-1.16 greedy fill), national exam authority submission API (SCH-DEP-02), `SchoolBoardingTransfer`, per-school teaching-days setting (open-questions #2), `btree_gist` exclusion constraint for grade bands (#3), absence-scores-zero policy flag (#4), portal purple accent token (#9), audit-event coverage test (#14), DB-per-worker tests (#20), queue for >5000-row imports (#16).

**Canvas artboards with no roadmap story** (`design/campus/`): `leadership/{BursarDashboard,HeadDashboard,WardenDashboard,HodModeration,HodPublishWindows,BursarReceipts,BursarWaivers,BursarInvoiceActions,WardenBedAllocate}`, `messaging/*` (OfficeInbox, ParentCompose, TeacherHandoff…), `module/{Syllabus,Transport,TransportRegister,Imports,LedgerCredits,Meetings,Homework,Goals,Library,LibraryOut,StudentRollUp,BoardingWelfare,OfflinePage}`, `phone/{ParentMessages,StudentMessages,ParentLogin,StudentLogin,…}`. Some map to done stories (Transport S-1.15, Imports S-3.3, RollUp S-1.5); dashboards and messaging do not.

---

## 6. Open questions and pending product decisions, by persona

### Admin / platform
- Portal host naming: `staff.` (audit lead) vs `teachers.` (`schools-production-readiness.md` §1). Which is live?
- Teaching days of the week per school (open-questions #2) — weekend default closed; Saturday-school needs recurring events.
- Overlapping grade bands: code check vs `btree_gist` exclusion constraint (#3).
- `provisionSchool` still leaves enrolments unwritten? Entry #8/#17 say yes; changelog `d15a415` says `ensureCurrentTermEnrolments` fixed it. Needs confirmation.
- Legacy subject FK columns: run backfill, decide multi-subject precedence, drop and make `subjectType/subjectId` non-null (#19).
- Feature-gate flip: `/api/v2/records/**` unregistered by design (#18) vs SS-1.1 deny policy that "fails closed" for unregistered routes (`campus-alignment.md`).
- Test suite flakes on shared DB (#20).
- Printable documents screen hard-codes ~20 hex colours — deliberate print exception or token violation? (#14).
- Audit-event coverage test to enforce DoD item 7 (#14).
- Who owns "teaching qualification": school custom fields vs HR (changelog S-4.3 teacher).
- Date properties uneditable on record pages (#17).
- Which demo tenant is canonical: `chisipite-demo`/Nightingale House (roadmap) or `stmarys` (demo playbook)?
- Band → entitlement mapping (Community has no portals; Standard lacks teacher portal): does the catalog express this, or is it marketing copy only? (PR-4.2 pending.)
- Multi-campus: sold, never specified.

### Head / HOD
- Fee-threshold gate on results publishing: `schools.md` §4.5 and the gameplan promise it; no roadmap story, no pack-spec guard. Decision needed.
- Absent pupil in averages: excluded (current) vs scored zero (#4); mid-term CA-only reporting with caveat (#5).
- Result-sheet state machine: pack spec's 8 states (HOD_REVIEW, ADMIN_READY…) vs shipped 4 — is the spec retired?
- Head dashboard content (S-9.1) vs canvas `HeadDashboard.dc.html` — which is the contract?
- Teacher "publish to parents" rules (S-6.46) — what are "the school's publishing rules" beyond the publish window?

### Bursar
- In-portal payment provider for fees (S-7.3): none of paynow/pesepay/contipay/ToomaPay is designated; seam is subscription-only today.
- Native FDGA migration story not yet added to the roadmap.
- Cross-currency opening balances imported at rate 1 and flagged — needs a rate column? (#16).
- Partial-commit undo for imports (#16); rollback gets harder over time with no warning.
- Transport billing "reported, never posted" — is posting wanted?
- Payment plans / late fees / dunning: sold in package-features, no story.
- Bursar dashboard drawn in the canvas, no story.
- Fiscalising "tuck shop and uniform sales" (add-on copy) has no school surface.

### Warden
- `SchoolBoardingTransfer` (pack spec §5.4) never built; movement types TRANSFER/BED_RELEASE unreferenced.
- Room housekeeping status, damage/incident logging (implementation plan phase 5) — no story.
- Warden dashboard drawn, no story.

### Parent portal
- OTP sign-in (S-6.1) while `platform-overview.md` calls OTP "dark-launch / future" platform-wide — dependency on platform auth work?
- Prototype "News/You" tab labels vs roadmap "Notices/Profile" (S-6.0) — which copy is the contract?
- Prototype screens beyond the README inventory (leave request, calendar, library, timetable, child profile with medical/emergency/transport, notifications with quiet hours, messages) — are they in scope? README says "every feature in a demo is required".
- Language options: prototype offers English, Shona, Ndebele (S-6.16 todo).
- Absence / fee / results notifications (S-9.2–9.4) — delivery channel unspecified (in-app vs SMS/WhatsApp).

### Student portal
- PIN + biometric sign-in (prototype mentions fingerprint/biometric; roadmap only PIN).
- Report card document in the portal (S-6.27).
- Fine payment depends on S-7.3.
- Student "Messages" row in the prototype profile — not in README inventory nor any student story.

### Staff / teacher portal
- Purple portal accent: tenant `--brand` (decision #9) vs prototype `--te-brand` — a DS token request.
- Messaging model (S-7.1) — "a domain of its own"; teacher Messages screen deliberately not built.
- Cover lessons exist in the model (S-1.11) but portal surface S-6.53 todo.
- Shared-device idle lock (S-6.59).
- TanStack `useQuery` in a Next layout not re-rendering — root cause unknown (#12).

---

## 7. Contradictions and stale statements (doc A says X, doc B says Y)

1. **Class navigation vs class filter.** `schools-roadmap.md` "Standing instructions": "Year group and class are **navigation**, not a filter: you reach a list through its group"; S-4.6: "Year group is a route, not a filter: a picker, then the list". `docs/design-system/09-campus-canvas-law.md` §7 "Filter by class": "A screen that lists pupils, marks or money should offer the class filter rather than forcing the picker as the only way in — `students-list-content.tsx` carries the comment explaining why the picker-only version was wrong"; `10-campus-screen-contract.md` "Filter by class": "use `GradePicker` as a route only when the unnarrowed list is ruinous to load. When in doubt, the filter". The roadmap was never amended.
2. **Disabled vs hidden actions.** `docs/ux/platform-ux-playbook.md` "Workflow Action Rules": "Hide invalid actions; do not show disabled invalid actions" and "this playbook wins" on conflict. `11-campus-states-and-motion.md` "Refusals name who can": "a verb the person cannot use is **disabled with the reason on it, not hidden**. Hiding it makes the screen look different for every role".
3. **Table controls layout.** UX playbook: "Multi-table contexts must use a left vertical tab rail", "One table per active view". `10-campus-screen-contract.md`: "Tabs, search, filters → one row above the table, via `TableControls`" (horizontal). Phase 2–5 specs mandate `VerticalDataViews`; roadmap S-6.0 deleted the `VerticalDataViews` portal.
4. **Portal chrome.** Phase 2 spec "UX Contract": portals follow the playbook (tables, vertical tabs). Roadmap "How a portal is built": "Portals do not use the dashboard shell"; `MobileShell` / SHL·07.
5. **Prototype tab labels.** `portals/README.md` and `parent.html` TABS: Home · Fees · **News** · **You**. Roadmap S-6.0: Home · Fees · **Notices** · **Profile**.
6. **README feature inventory vs prototypes.** README lists teacher nav as "Today · Marks · Messages · Timetable · Lessons"; `teacher.html` `NAV` has 14 entries (see §8). README student screen list omits Messages; `student.html` profile has a "Messages" row. README parent list omits leave requests, calendar, library, timetable, child profile, notification quiet hours, messages.
7. **Portal identity.** Phase 2 spec: "fallback preview mode for privileged roles only (SUPERADMIN, MANAGER, CLERK)"; `schools.md` §8 portal `role` in `PARENT|STUDENT|TEACHER|HOD`. Roadmap S-0.2: identity by `userId` only; open-questions #13: `STUDENT` and `PARENT` entitlement entries exist (so first-class portal roles exist, contradicting Phase 4 "remain deferred").
8. **Teacher→Employee.** `schools.md` §7 specifies bidirectional trigger sync via `lib/schools/teacher-employee-sync.ts`; roadmap S-0.8 deleted `entity-triggers.ts` and S-1.7 links via `employeeId` "written deliberately" with no sync.
9. **Timetable.** `schools.md` §10 "Not real"; `live-capabilities.md` lists `/schools/timetable` live (March); roadmap S-0.7 removed it then S-1.1 rebuilt it. All three describe different moments.
10. **Live pages list.** `live-capabilities.md` "Schools → Live pages" includes `/schools/portal/parent|student|teacher` (roadmap S-0.9 removed portal links from nav; production-readiness §7 calls them a contradiction of portal isolation), `/schools/assessments` (production-readiness §5: "renders the same result-sheet list as Results"; S-6.61 removed mark capture from admin), `/schools/notices` (read-only feed), `/schools/fees` implied via Phase 3 (now a redirect, S-4.6). `route-and-surface-inventory.md` says `schools` has 48 pages (Aug 24) vs production-readiness "34 pages" (Aug 4).
11. **Portal capabilities.** `live-capabilities.md` "Current portal capabilities": teacher "attendance visibility", "marks visibility" (read-only). Roadmap: register capture (S-6.41), gradebook entry (S-6.43) done.
12. **Pricing model.** `commercial-and-marketing.md` add-on table: `ADDON_SCHOOLS_SUITE` $320/mo + $35/site, "School expansion: start with schools suite + portal suite". `lib/marketing/pricing.ts`: schools are "bespoke", per-term bands $249/$549/$949, `recommendedTierCode: GROW`. `pricing-packaging-roadmap.md` PR-4.2 still `todo`. `commercial-and-marketing.md` itself says "Prices are deliberately not repeated here" yet repeats add-on prices.
13. **Add-on lists.** `addons-and-bundles.md` School add-ons (learning, transport, meal plans, PTA/events, admissions CRM) vs `SCHOOL_ADD_ONS` (transport, fiscalisation, branding, migration). `roadmap-and-direction.md` repeats the former as "future commercial opportunities".
14. **Branding.** Premier band "includes" custom branding and school domain; `SCHOOL_ADD_ONS` sells it for $79/term.
15. **Banking.** Premier band sells "Accounting, AR/AP, and banking"; `scope-trim-roadmap.md` parked the banking-reconciliation UI (ST-1.2) and `master-rollout-plan.md` notes `ADDON_ACCOUNTING_ADVANCED` has features "with no entry point".
16. **Offline.** Site FAQ: works offline. Roadmap Iteration 8: all `todo`. `commercial-and-marketing.md`: "Do not market the platform as broadly offline-first today". `roadmap-and-direction.md`: "older docs still contain stronger offline language than the current codebase supports" — but the *marketing site* is the strongest offline claim and is live code.
17. **Campus maturity.** `campus-alignment.md`: blockers closed and "the overwhelming majority of its stories `done`". Count: 84/125 done; Iterations 7–9 entirely undone; S-10.1–10.3 (the visual pass the DoD requires) `todo`.
18. **Migration replay.** Open-questions #15: "`prisma migrate deploy` works now, and `scripts/verify-migration-replay.sh` will tell you the moment it stops working again". `known-issues.md` (2026-09-02): replay broke again at `20260819090000` (StockMovement.sourceType ordering), found by the e2e suite, fixed 2026-09-01 with `pnpm verify:migrations` as guard — the earlier guard was not being run.
19. **Provisioning enrolments.** Open-questions #8 and #17 ("`provisionSchool` itself is still wrong") vs roadmap changelog `d15a415` (fixed with `ensureCurrentTermEnrolments`). Entries not updated.
20. **Portal nav 404s.** Open-questions #6 says portal navs link to 12 non-existent pages "until Iteration 6"; Iteration 6 shells replaced the navs (S-6.0/6.36/6.60). Entry not updated; auditors should check `lib/platform/gating/portal-isolation.ts` for leftovers.
21. **Student portal shell.** Open-questions #7: "The student portal's is next." S-6.36 done.
22. **Health/transport/library.** `schools-production-readiness.md` §6: "Transport, library, health, canteen are absent." Built: S-1.8, S-1.10, S-1.15. `roadmap-and-direction.md` still lists "health and consent flags", "copy-forward", "timetable conflict detection", "holidays/calendar", "duplicate detection" as future.
23. **Result moderation states.** Pack spec §5.5/§8.2: DRAFT, SUBMITTED_BY_TEACHER, HOD_REVIEW, HOD_REJECTED, HOD_APPROVED, ADMIN_READY, PUBLISHED, UNPUBLISHED. Production-readiness §1: "DRAFT → SUBMITTED → HOD_APPROVED → PUBLISHED".
24. **Bundle and feature-key names.** Pack spec / ERP plan: `ADDON_SCHOOLS_PACK`, `schools.students.manage`, `schools.finance.billing`, `/api/schools/*`. Live docs: `ADDON_SCHOOLS_SUITE`, `schools.students`, `schools.fees`, `schools.teachers`, `schools.core`, `/api/v2/schools/*`.
25. **Roles.** Pack spec §3: `school-admin, registrar, teacher, hod, warden, bursar, parent, student` plus §4.1 `academic-admin`, `timetable-admin`, `finance-admin`, `communications`, `class-teacher`. Code (per lead): SCHOOL_ADMIN, REGISTRAR, BURSAR, HOD, TEACHER, WARDEN. `school-implementation-plan.md`: "admin, registrar, bursar, teacher, guardian portal". Pack spec says school-admin "must never enter marks on behalf of teacher without audit flag" — no roadmap story implements an audit flag for admin mark entry.
26. **Holy grail as normative reference.** Pack spec, Phase 2–5 specs and ERP plan cite `platform-holy-grail.md` as "architecture source of truth"; it contains no schools content and describes `middleware.ts` while production-readiness cites `proxy.ts`.
27. **Report cards.** Pack spec: `SchoolReportCard` with immutable `snapshotJson`, QA SCH-QA-10 "published snapshot unchanged until republish". Roadmap S-5.2: report card is a document source rendered from the PUBLISHED sheet — no snapshot model mentioned.
28. **Notices.** Pack spec `SchoolNotice` with audience targeting; Phase 5 "notices table from recipient-scoped notification stream"; production-readiness: substring-matching the notification type; roadmap S-9.6 `todo`. `commercial-and-marketing.md` "School demo" says "Show … notices" as a demo beat.
29. **Demo tenant.** Roadmap/open-questions: `chisipite-demo`, "Nightingale House", 400-pupil `S1000` numbering; demo playbook: St Marys `stmarys`, 120 pupils, `head@stmarys.test`. `known-issues.md` also records a school-affecting workspace-switcher bug ("Retail" shown on St Mary's) fixed 2026-09-02 with no roadmap row.
30. **Screenshot debt.** Roadmap DoD note: only four surfaces screenshot-verified; later changelog rows claim screenshots for fees, portals, record pages, documents. S-10.1/10.2 remain `todo` while `known-issues.md` says `/schools/students` width was fixed 2026-09-02.
31. **Iteration 6 numbering.** Doc header says parent 1–19, student 20–39, teacher 40–59; the teacher block actually runs to S-6.61 and the parent block starts at S-6.0.
32. **Teacher portal host.** `production-readiness.md`: `teachers.` host; audit lead: `staff.` host.
33. **Playbook status vocabulary.** UX playbook canonical statuses (Passing/Failing/Need changes/In review/…) do not cover any school state (DRAFT/SUBMITTED/PUBLISHED, PART_PAID, CHECKED_OUT); campus docs use `tone: plain · ok · warn · bad · brand` chips instead.
34. **UX playbook precedence vs canvas.** Playbook: "When any UX guidance conflicts with other docs, this playbook wins." `10-campus-screen-contract.md`: "Read `09-campus-canvas-law.md` first — that is the law". Roadmap: "Always refer to the design system documentation".

---

## 8. Portal prototype feature contract

Per `docs/design-system/portals/README.md`: "every feature in a demo is required" (roadmap agrees: "design, structure and layout are replicated, not reinterpreted"). Extracted from the prototypes' route tables, `render*` functions and section headings.

### `parent.html` (mobile)
- **Bottom tabs (`TABS`)**: Home · Fees · News (`notices`, unread badge) · You (`profile`).
- **Routes (`renderRoute`)**: `home`, `fees`, `fees/pay`, `fees/method`, `fees/receipt`, `payment-history`, `notices`, `notice/:id`, `messages`, `message/:id`, `attendance`, `attendance/:day`, `leave-request`, `marks/:id`, `calendar`, `library`, `timetable`, `profile`, `security`, `notifications`, `children`, `child/:id`, `help`; plus sign-in.
- **Sign-in**: phone number + code (`si-phone`, `si-otp`, send, resend, remember me, help).
- **App bar**: child switcher ("Switch child").
- **Home widgets**: greeting; hero with balance, "Pay now", "See receipt", "See fee statement"; "Today" with "UP NEXT" lesson and "See full day"; "Quick look" stat tiles ("How often at school", "Average mark") linking to attendance; shortcut pills Calendar · Library · Receipts (payment history) · Messages · Time off (leave request) · Children; "School news · N new" with "See all".
- **Fees**: "What you still owe"; "Fee statement" (Total for the term, Already paid, Money off with discounts e.g. "Brothers & sisters · 7.5% off", "Pay early · 2% off"); invoice lines; "Saved ways to pay"; "Past payments →"; pay flow: amount step ("Step 2 · How much today?", split/part payment), method step (EcoCash, OneMoney, Bank transfer, Visa/Mastercard), receipt screen ("Receipt · ref").
- **Payment history**: filter by child and by method.
- **Notices**: list, detail with threaded "Replies · N" and comment composer.
- **Messages**: thread list and message thread with teacher.
- **Attendance**: term summary, per-day detail ("Lessons that day"), "Request leave" → leave-request form (`req-leave`, `day-leave`).
- **Marks**: "Marks by subject", mark detail per subject.
- **Calendar**: school events ("Coming up").
- **Library**: "Borrowed now", "Books waiting for you".
- **Timetable**: child's timetable.
- **Children**: list and child profile ("School details", "Medical & allergies", "Emergency contacts", "Transport").
- **Profile ("You")**: "Your children · Manage", "Your account", "Sign-in & safety" (EXTRA CODE ON), Alerts, Past payments, App settings, Language (English, Shona, Ndebele), Help, "Rules & privacy", sign out.
- **Security**: "Change your sign-in", "Extra security code" (2FA) with "Your spare codes", "Where you're signed in" (sessions).
- **Notifications**: preferences incl. "Quiet hours".
- **Help**: "Frequently asked", "Contact your school".
- **States**: offline banner (`renderOfflineBanner`), empty states, modals.

### `student.html` (mobile / tablet)
- **Bottom tabs**: Home · Timetable · Marks · Profile. App bar: notifications bell (unread), profile button; back navigation map (`notifications→home, goals→profile, help→profile, settings→profile, library→home, profile→home`).
- **Routes**: `home`, `timetable`, `marks`, `assignments`, `library`, `profile`, `notifications`, `goals`, `help`, `settings`; sign-in, signed-out, first-run tour.
- **Sign-in**: student ID + PIN (`si-id`), remember me, "Forgot your PIN?", biometric/fingerprint option.
- **Home**: "Your next class" (Per 1, See timetable), "Your week" (Mon–Fri), "This week" KPIs (Homework to hand in, Latest mark), "Recent marks" grade card (Last 8 tests), quick KPIs (library, assignments, goals, notifications), "School news" banner.
- **Timetable**: day and week views; open a class.
- **Assignments**: list with "Filter assignments" sheet; hand-in flow ("Handing in…", "Handed in", "Nice one, …").
- **Marks**: "Your subjects · N" with "Set goals"; report card ("Report card · Term N").
- **Library**: catalogue search ("Found N books"), "Books you have out", "Books I want to read" (reading list/reserve), "Just taken out", renew, "Scan to return a book", "Pay library fine?".
- **Goals**: "Set my goal · subject", "Each subject · met/N on track".
- **Notifications**: list with cadence preference (Instant/Daily/Weekly).
- **Profile**: "More" rows — My goals, Messages, Library, Help, Settings ("Alerts · privacy · PIN · theme"); "Keep your account safe" (Change my PIN, last changed), "Privacy and my info" (who sees marks, fingerprint, language); "Edit profile".
- **Settings**: Account, Notifications, Appearance ("How the app looks", theme/dark), Privacy, Contact; "Reset demo data".
- **Help**: "How to use the app", "Talk to someone", helpfulness feedback.
- **States**: offline banner, sheets, modals, signed-out screen.

### `teacher.html` (tablet / desktop, SHL·07 rail)
- **Side rail (`NAV`, 14 items)**: Today (`dashboard`) · Attendance (`roll`) · Enter marks (`marks`) · Marks book (`gradebook`) · Messages (`comms`, unread count) · Timetable (`schedule`) · Lesson plans (`lessons`) · Homework (`assignments`) · Shared files (`library`) · Reports · Parent meetings (`meetings`) · Profile · Settings · Help; plus class list above the nav, "who" profile button, sign-out; extra routes `states`, `signin`. Collapsible rail; bottom-bar layout on narrow widths.
- **Sign-in**: ID + password, shared-device checkbox (`si-shared`), forgot, help.
- **Today (dashboard)**: "Good morning, …", "Today's lessons" with "Mark attendance" CTA, cards to marks, inbox link ("Open inbox →"), unread and pending counts.
- **Attendance (roll)**: "Mark attendance — Form 2A · Mathematics", mark all, per-student override, submit (date/period/class fields `sub-*`).
- **Enter marks**: per-assessment entry with stat pills Done x/N, Average, Top, Lowest; "Papers to mark" queue; "Send marks to parents?" / "Publish to parents"; "Add a new column" (custom assessment column).
- **Marks book (gradebook)**: grid across assessments; class average; at-risk.
- **Messages (comms)**: "Parent messages" threads, "Quick replies", "Send to whole class" broadcast; bell opens inbox.
- **Timetable (schedule)**: "This week".
- **Lesson plans**: lesson drawer, "Copy lessons from last week?", "Add a cover lesson" / "Cover lesson · Standing in for …".
- **Homework & tasks**: "New assignment", handed-in stats, import from library.
- **Shared files (library)**: "Resource library", "Upload a resource".
- **Reports**: "Cohort analytics · Term 2 · 2026", "Trend lines, pass rates & grade distributions across your classes", tiles Avg attendance / Class pass rate / Distinctions / At-risk students.
- **Parent meetings**: "Meetings & appointments" booking and management.
- **Profile**: "My profile".
- **Settings (5 tabs)**: Notifications ("Notification cadence"), Mark publishing ("Mark publishing rules", publish window choice), Appearance, Security ("Change password", 2FA `st-2fa`, "Sign out of shared device?" / sign out all `st-out-all`), Privacy & data (export `st-export`, audit `st-audit`).
- **Help**: "Help centre", "Frequently asked".
- **States**: "Empty, loading & error states" gallery screen; offline banner "You're offline · changes will save once the internet comes back".
- **Brand**: own purple accent `--te-brand: #6D28D9` (roadmap decision: use tenant `--brand` instead).

### README's own inventory (for cross-check)
Parent: child switcher; per-child attendance/marks/fee balance; invoice lines; statements + receipts; in-portal payments (no model); notices with threaded replies (no model); language picker; 2FA with recovery codes; sign-in by code. Student: timetable; assignments; marks + report card; library; goals; notifications with cadence; PIN auth/change/recovery; theme/profile. Teacher: today; attendance; marks with custom columns, papers-to-mark, publish-to-parents; parent messaging; lesson plans, copy, cover; homework; resources with upload; meetings; reports; settings (notification cadence, publishing rules, appearance, security, privacy); help; shared-device sign-out.
README: "Still sold nowhere, in marketing or the bands: behaviour/discipline and a communications log. Library and homework are not in the band copy but *are* in the student and teacher demos, so they are in scope by the demo contract."

---

## 9. Campus design rules digest (testable rules for UI auditors)

From `docs/design-system/09-campus-canvas-law.md` (the law), `10-campus-screen-contract.md` (how applied), `11-campus-states-and-motion.md`, `docs/ux/platform-ux-playbook.md` (canonical platform UX; phone rules), plus roadmap standing instructions.

**Naming and chrome (09 §1–3; 10 "Where things go"; playbook "Where the title and the primary action go")**
- A page is named once: the app bar carries the page's only name; the rail marks the destination; the page band never repeats the name; no subtitle restating the module.
- Band (`position: sticky; top: 0`) carries state chips `{label, value, tone}` on the left (tones `plain · ok · warn · bad · brand`) and secondary/contextual actions (Export, Send reminders, Print) on the right.
- Caption, if any, carries changing state (term, class, billing date); "Where nothing changes, there is no caption. That is most pages."
- Exactly one primary action per page, in the top app bar (`PageChrome`, `primaryBtn`, brand fill) — not under the title/description/search.
- Tabs, contextual search and filters live in **one row directly above the table** (`TableControls`, `TableSearch`); never split across band and card.
- Row-level actions in the row as `tinyBtn`/`RecordActions`; bulk actions in a floating bar over the selection (playbook: sticky bottom bar with selected count, allowed actions, clear selection; appears only when rows are selected).
- Page file is thin (`app/schools/<thing>/page.tsx`: session check, `/login` redirect, `<div className="mx-auto w-full max-w-7xl space-y-6">`); the screen is `components/schools/<area>/<thing>-content.tsx`.

**Density and tokens (09 §5–6; roadmap)**
- Density vars `--band-h` 44/52, `--row-h` 36/44, `--head-h` 32/38 (Compact/Cozy).
- Tokens not hex: canvas `#F7F8FA`, surface `#FFFFFF`, border `#E5E8EE`, text strong/body/mid/subtle `#16181D/#262A33/#565C69/#8A91A0`, brand `#0B5DF0` (strong `#0944C2`, soft `#E8EFFE`), ok `#4A7042`, warn `#8A6415`, bad `#B83A2A`. Type Atkinson Hyperlegible Next 13px/1.5; **numeric and time values are `font-mono`, tabular-nums**. Icons Phosphor (filled default; bold carets; regular magnifier).
- Roadmap DoD 6: no new hard-coded colours, sizes, durations or font stacks. Known exception under review: `school-documents-content.tsx` print colours.

**Copy (10 "Copy")**
- Copy comes verbatim from `design/campus/checklist/<Screen>.json` `allCopy`; plain and specific verbs ("Roll up the year", "Free the bed", "Take it back", "Remind the 188"), not "Manage allocations"/"Submit".

**CRUD (10 "CRUD is not optional")**
- Every listed entity has Create (app-bar primary → dialog/sheet), Edit (row action, same dialog), Delete (row action, confirm names the record and side-effects). Sheets for >~6 fields; dialogs named `<thing>-form-dialog.tsx`/`-form-sheet.tsx`. Mutations invalidate query keys `["schools", <area>, …]` and surface `SaveError`.

**Class scoping (09 §7; 10 "Filter by class")**
- Class-scoped routes `/schools/{students,results,finance}/class/[classId]`; screens should offer `ClassFilter` and use `GradePicker` as a route only when the unnarrowed list is ruinous. (Conflicts with roadmap "year group is navigation, not a filter" — auditors should record which convention each screen follows rather than fail either.)
- Roadmap: filters are dropdowns/popovers (`FilterSelect`), never rows of pills; sidebar uses expanding groups.

**The eight states (09 §8; 11)**
- Loading: `TableRowsSkeleton` / `CardsSkeleton` / `StatsSkeleton` mirroring the real row (same widths, avatar, badge shape), header drawn solid, rows cascade at 40 ms, DS `.skeleton` shimmer only, `aria-hidden`. **Never a spinner or bare "Loading…".**
- Three empties with distinct sentences: `NothingYet` (unfiltered, offers the one verb, `EmptyState` never `Alert`), `NothingMatched` (names filters in force, offers clear, **never a create button**), `NothingLeftToDo` (good news, no create button).
- `LoadError` (names what failed, retry) scoped to the segment that failed — other tabs stay usable; only unrecoverable pages take the whole screen and carry a reference.
- `SaveError`; `SavingOverlay` dims to 50% and blocks input.
- `NotYourJob` / `RecordActions` disabled verb **with the reason naming who can** ("Only a head of department can approve a sheet — ask Mrs Nyathi, or the head"); not hidden. (Conflicts with playbook "hide invalid actions".)
- `RecordNotFound`. Denied, offline and dialog states drawn in `module/State*.dc.html`.
- `node scripts/campus-states-audit.mjs --gaps` and `node scripts/campus-conformance.mjs <Screen>` are the conformance tools named.

**Motion (11)**
- Classes `campus-skeleton-row`, `campus-row-in`, `campus-fade-in`, `campus-pulse-dot`; all inherit `prefers-reduced-motion`. Motion may only say "arrived / changed / in flight"; nothing on a repeated path longer than `--dur-base` 200 ms; rows must not animate on every filter change.

**People and covers (roadmap standing instructions; S-10.4/10.5)**
- Students and staff carry avatars wherever listed (`PersonAvatar`; initials with name-derived colour until a photo exists). Classes/subjects/hostels use a coloured tile with emoji/icon, never initials.
- Library catalogue is a grid of covers (`BookCover`); loans and fines stay lists.

**Phone rules (playbook "Phone Rules"; roadmap DoD 5)**
- Verified at 390×844 and 768×1024; no horizontal body scroll; controls one height.
- App bar: page name only; search is an icon below `md`; record name repeated above the identity strip at phone width.
- Stat tiles two-up on a phone; dashboard widgets narrower than half the grid two-up; never state the same fact twice in a band.
- Sideways strips run edge-to-edge and snap; segment labels never wrap.
- Rows: two lines, one fact on the right; unlabeled numbers don't appear; money carries its currency everywhere.
- Pickers: sheet on phone, popover on desktop (`ResponsivePopover`); one overlay rung `--z-overlay`; bottom sheets sized to content with grabber and safe-area padding; dismiss only the top layer.
- Record pages below 1024px fold the rail into an Overview tab (roadmap S-4.3).

**Portals (roadmap "How a portal is built"; open-questions #7, #9)**
- No dashboard chrome under `/portal/*`; teacher = `AppShell` + `NavRail` (SHL·07) with the class list above the navigation; student and parent = `MobileShell` with four bottom tabs; full-bleed screens; household/class held by the shell.
- Prototype parity is the acceptance test (S-10.3): screenshot-compare against `docs/design-system/portals/`.
- Tenant `--brand` accent, not the prototype purple.

**Data and money (roadmap; 09 §6)**
- Amounts cross the wire as strings and are never re-summed on the client (S-6.6); withheld figures are absent, not zero (S-6.3); DRAFT registers labelled "not yet submitted" (S-6.4); empty marks say the school has not released them yet (S-6.5).

**Playbook compliance checklist (for reference)** — warm-paper tokens; exactly one table per active view; vertical tabs for multi-table contexts; unified single-row DataTable controls (search + submit left, filters middle, rows-per-page/pagination right, same control height); invalid actions hidden with requirement context ("To continue, complete: …"); canonical statuses; chart defaults; list→detail context preserved; looked at on 390 px. Note the two direct conflicts with the campus docs (controls row placement/vertical rail; hidden vs disabled actions).
