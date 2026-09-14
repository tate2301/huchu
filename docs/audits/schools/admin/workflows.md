# Admin dashboard: workflow audit

Surface: configuration and master data for a school tenant. Pages `app/management/master-data/schools/{identity,years,periods,classes,subjects,grading}`, the `app/schools/academics/*` redirects, `app/schools/{calendar,timetable,teachers,teachers/assignments,staff,imports,documents,transport,library,boarding/hostels,notices}`, guardian and student record pages for portal invites and custom fields, and the tenant-level provisioning that seeds a school (`lib/schools/provision.ts`). APIs under `app/api/v2/schools/{academic-years,terms,periods,rooms,classes,streams,subjects,syllabus,grading-schemes,calendar,settings/identity,field-definitions,staff,teachers/**,timetable/**,guardians,guardian-links,portal-invites,imports/**,library/**,transport/**,teaching-resources,lesson-plans,notices,messages}`. Personas: tenant `SUPERADMIN` and `MANAGER` (unconstrained), `SCHOOL_ADMIN` (full school grants), `REGISTRAR` (academics create and edit, students, teachers).

Audit date: 2026-09-14. Static read of `main`, cross-checked against the roadmap (Iterations 0, 1, 3, 4; S-1.1, S-1.2, S-1.7, S-1.16, S-1.17, S-3.1, S-3.3, S-4.4, S-4.5, S-5.x), the production-readiness audit, the schools implementation plan, and the K-12 benchmark §2, §3, §4, §10, §12, §13, §16, §20. UI companion: `ui-ux.md` in this folder.

## 1. Verdict in one paragraph

Setup is the most complete layer of the schools vertical and the least visible. A school can be provisioned with a year, terms, a class ladder, subjects, a grading scheme, a fee structure and roles in one operation; the office can then set periods and rooms, build a clash-checked timetable by hand or with the greedy filler, keep a calendar that drives "not a school day", link teachers to HR, add custom fields, search every record, import a previous system's data with a dry run and a rollback, and print eight document types. What lets it down is reachability and finish. The master-data ladder lives under Management with its own rail and is missing from the school sidebar; calendar events cannot be edited; four of the eight documents have no page; teacher and guardian accounts have no self-service path (invites are copied by hand, teachers get no invite at all); notices reach only families with a claimed portal account; and the platform pieces a school administrator expects, tenant branding, communication channels, a setup checklist, multi-campus, are not there.

## 2. Docs versus code

| Claim | Source | Code reality | Verdict |
|---|---|---|---|
| S-0.1 academic year and terms, one current: `done` | roadmap | Partial unique indexes and transactional activation (`lib/schools/calendar.ts:179-204`). | True. |
| S-1.1 timetable with clash rejection and copy-forward; S-1.16 auto-fill; S-1.17 bulk allocation: `done` | roadmap | All present (`lib/schools/timetable.ts`). The timetable page cannot place a lesson by clicking the grid (UI audit). | True. |
| S-1.2 calendar and holidays: `done` | roadmap | Create and delete only; no `PATCH /calendar/[id]`; editing is delete and recreate (`school-days-content.tsx:133, 169, 192`). | Partial. |
| S-1.7 teacher linked to `Employee` deliberately: `done` | roadmap | `teacher-identity.ts` suggests and links on click; "Find the employee" on every row. | True. |
| S-3.1 provisioning seeds the ladder: `done` | roadmap | `provisionSchool` plus `ensureCurrentTermEnrolments`. Open-questions #8 and #17 still say provisioning writes no enrolments. | True; open-questions stale. |
| S-3.3 import with dry run, idempotent re-run, rollback: `done` | roadmap; $199 add-on | Present with audit rows. Opening balances require `students:create` and `fees:create` together, so only SCHOOL_ADMIN can import them; cross-currency balances import at rate 1 and are flagged; no partial-commit undo. | True with gaps. |
| S-4.4 custom fields on school record types: `done` | roadmap | Present for student and guardian; `configure` is SCHOOL_ADMIN only; no fields tab on teacher. | True. |
| S-4.5 unified search: `done` | roadmap | ⌘K over students, guardians, staff, classes, subjects, hostels. | True. |
| S-5.1 to S-5.3 eight document sources: `done` | roadmap | Sources exist; `/schools/documents` surfaces report card, invoice, class list and register only (`school-documents-content.tsx:770-773`). Receipt, statement, admission letter and transfer letter print from record rows if at all. | Engine done, surface half done. |
| S-0.3 invites from detail pages or in bulk: `done` | roadmap | Present. Links shown once and copied by hand; guardians without an email are skipped (`portal-invite-dialog.tsx:64-66`); no email, SMS or WhatsApp send; no teacher invite. | True and operationally weak. |
| S-9.6 notice entity with audience targeting: `todo` | roadmap | `POST /notices` with audience, class or pupil shortlist and severity exists; in-app only; no draft, schedule or recall. | Built more than the row says. |
| Marketing: "Custom branding and school domain" (Premier and a $79 add-on) | pricing | `lib/platform/tenant.ts` carries no theme fields; portals show `companyLabelFromHost` only; no logo or colour anywhere. Domain provisioning exists at platform level. | Domain yes, branding no; the band and the add-on contradict each other. |
| Marketing: "Unlimited staff and teacher accounts" | pricing | No user-count enforcement found in the school code; the platform has a `USER_PACK_SIZE` concept. | Unverified; check entitlement. |
| Marketing: multi-campus consolidation (Group band) | pricing, site FAQ | One `companyId` is one school; no campus entity. | Overclaim. |
| Production readiness: "34 pages" | Aug 4 audit | 69 page files (14 redirects). | Stale. |
| `live-capabilities.md` lists `/schools/portal/*`, `/schools/assessments` as live pages | system reference | Redirects; assessments folded into results. | Stale. |
| Pack spec roles `academic-admin`, `timetable-admin`, `communications` | pack spec | Not in the role model. | Stale. |

## 3. Workflow inventory

**Tenant and provisioning**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| A1 | Provision a school tenant with year, terms, ladder, subjects, grading, fee structure, roles | Implemented | `lib/schools/provision.ts`; operator wizard on `TEMPLATE_SCHOOLS`. Schools remain operator-provisioned by policy. |
| A2 | Feature entitlement for the pack and portals | Implemented | `ADDON_SCHOOLS_SUITE` bundle; band-to-feature mapping (Community without portals, Standard without teacher portal) is not expressed anywhere. |
| A3 | School identity: student-number format, ID-card design, presentation | Implemented | Only page that gates its own controls by role. No card print or issue run. |
| A4 | Branding: crest, colours, portal theming | Missing | Sold. |
| A5 | Multi-campus | Missing | Sold in the Group band. |
| A6 | Setup checklist and readiness | Missing | A new tenant lands on an overview of zeros. |

**Academic structure**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| A7 | Academic years and terms, make current | Implemented | Terms created one at a time; "Make current" has no confirm although it flips every screen. |
| A8 | Calendar: holidays, events, teaching-day override, Zimbabwe public holidays | Partial | No edit route; weekends closed by default with no per-school teaching-days setting (open-questions #2). |
| A9 | Classes, streams, capacity, form teacher | Implemented | Streams are a second tab, not rows under their class. |
| A10 | Subjects, syllabus (scheme of work), core or elective, pass mark | Implemented | Subjects can be created from two places (master data and the teachers page). |
| A11 | Grading schemes and bands, default scheme | Implemented | Overlapping bands refused in code, not DB (open-questions #3). |
| A12 | Publish windows | Implemented | Configured in two places. |
| A13 | Periods and rooms | Implemented | No "generate eight periods from 07:30 every 40 minutes". |
| A14 | Custom fields on student and guardian | Implemented | None on teacher; ownership of "teaching qualification" undecided. |
| A15 | Houses, departments as entities, option blocks | Missing | Department is a string on the teacher profile. |

**Timetabling**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| A16 | Manual slot placement with class, teacher and room clash rejection | Implemented | UI is a sheet with six pickers; no click-a-cell. |
| A17 | Auto-fill (greedy first fit) reporting what it could not place | Implemented | |
| A18 | Copy forward from last term | Implemented | |
| A19 | Cover arrangement | Implemented | Office-only by design; a teacher cannot request it. |
| A20 | Exam timetable and invigilation, room booking | Missing | |
| A21 | Publish the timetable to portals with change notifications | Partial | Portals read it; no notification on change. |

**People**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| A22 | Teacher profiles, subjects, assignments (single and bulk), HOD and class-teacher flags | Implemented | Profile DELETE is a hard delete (`teachers/profiles/[id]/route.ts:201`). |
| A23 | Link a teacher to an HR employee | Implemented | Per row; no bulk link. |
| A24 | Support staff via HR with a school role label | Implemented | `staff/route.ts` re-doors `/api/employees`. |
| A25 | Teacher portal account | Partial | Office creates a `User` and a profile with `userId`; no invite, no password reset for anyone but SUPERADMIN. |
| A26 | Guardians: create, link to children, consent flags, primary | Implemented | `PATCH /guardian-links/[id]` has no persona check; guardian DELETE is a hard delete. |
| A27 | Portal invites for guardians and students, revoke, re-issue | Implemented | Manual link copy; no channel; no email means no invite; claim can reset an existing account (see portal audits). |
| A28 | Staff leave, appraisal, CPD for teachers without an HR record | Missing | HR module covers employees only. |

**Data and documents**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| A29 | Import classes, students, guardians, fee structures, opening balances with dry run, commit, rollback | Implemented | Role composition gap for fee entities; 5,000-row cap; no partial undo. |
| A30 | Export | Partial | Reports CSV and PDF; no full data export per entity. |
| A31 | Documents: report card, invoice, class list, register from a page; receipt, statement, admission letter, transfer letter from rows | Partial | Four sources without a page; no template editing in the school shell; no batch by class for statements. |
| A32 | ID cards | Missing | Design settings only. |
| A33 | Data quality: pupils not in a class, guardians without a phone, duplicates | Missing | Only the admissions duplicate check. |
| A34 | Audit log of master-data changes | Missing | Academic-structure routes write no audit rows. |

**Services and communication**

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| A35 | Hostels, rooms, beds | Implemented | Beds added per room dialog; no "add 24 beds". |
| A36 | Library catalogue, copies, loans, fines | Implemented | Fines never billed; no ISBN lookup or barcode entry. |
| A37 | Transport routes, stops, riders, boarding register | Implemented | Billing reported, never posted. |
| A38 | Notices with audience and severity | Implemented | In-app only; `reports:create` so SCHOOL_ADMIN only; no draft, schedule or recall. |
| A39 | Communication channels (email, SMS, WhatsApp) configuration | Missing | `lib/notifications.ts` has no school emitters. |
| A40 | Integrations: ZIMRA fiscalisation, GL posting | Implemented | The only two. No payment gateway, no LMS, no exam board. |

Counts: 24 implemented, 7 partial, 0 broken, 9 missing.

## 4. Benchmark gap

| Capability | Benchmark norm | Huchu today | Priority |
|---|---|---|---|
| Academic structure, calendar, grading, timetable with constraints and auto-fill | Standard | Present, strong | Done |
| Data import with dry run and rollback | Standard | Present | Done |
| Custom fields and unified search | Standard | Present | Done |
| Setup checklist and data-quality report | Standard | Absent | P1 |
| Account provisioning with delivered invites and self-service reset | Standard | Manual links, no reset | P0 |
| Communication channel configuration (SMS, WhatsApp, email) | Standard | Absent | P0 |
| Tenant branding on portals and documents | Sold | Absent | P1 |
| Exam timetable, room booking | Standard | Absent | P2 |
| Departments and houses as entities | Standard | Absent | P2 |
| Audit log of configuration changes | Standard | Absent | P1 |
| ID card issuing | Common | Design only | P2 |
| Multi-campus | Sold | Absent | P2 (decision) |
| Staff leave and cover requests for teachers | Standard | Absent for non-HR teachers | P2 |

## 5. Bugs and risks

| # | Finding | Location | Severity |
|---|---|---|---|
| B1 | Master-data pages are not in the school sidebar; the only "Academic setup" entry that survives the workspace mapping is "Scheme of work", which redirects to the teacher portal. | `lib/workspaces.ts:410-419`; `app/schools/academics/syllabus/page.tsx:11` | High |
| B2 | No password reset for portal or staff users except a SUPERADMIN route; no teacher invite. | `app/api/users/password-reset/route.ts:26`; `portal-invites.ts:82` | High |
| B3 | Invite delivery is copy-paste; guardians without email cannot be invited. | `portal-invite-dialog.tsx:64-66, 117-133` | High |
| B4 | Claim can reset the password and demote the role of an existing same-tenant account. | `lib/schools/portal-invites.ts:243-273` | Medium |
| B5 | `PATCH /guardian-links/[id]` lacks a persona check. | `guardian-links/[id]/route.ts:46-110` | Medium |
| B6 | Hard deletes for students, guardians and teacher profiles behind "archive". | `students/[id]/route.ts:379`; `guardians/[id]/route.ts:253`; `teachers/profiles/[id]/route.ts:201` | Medium |
| B7 | Calendar events cannot be edited. | `app/api/v2/schools/calendar/[id]/route.ts` (DELETE only) | Medium |
| B8 | Import guard requires `students:create` and `fees:create` together. | `imports/_guard.ts:19-24` | Medium |
| B9 | Grading-schemes API is behind `schools.results` while its page is behind `schools.core`; a core-only tenant sees the page and gets 403s. | `route-registry.ts` | Low |
| B10 | No audit rows for academic-structure changes (years, terms, classes, subjects, grading, timetable, calendar). | all setup routes | Medium |
| B11 | Notices reach only families with claimed accounts; `withoutAccount` count is reported and dropped. | `lib/schools/notices.ts:169-199` | Medium |
| B12 | Route-guard coverage test checks file-level markers only, so a method without a check passes (B5). | `lib/schools/route-guard-coverage.test.ts:113` | Low |
| B13 | Open-questions #6, #7, #8, #17 describe states the roadmap closed; production readiness §6 lists built modules as absent. | docs | Doc hygiene |

## 6. Proposed edits

1. **Sidebar (B1).** Generate the school sidebar from `lib/navigation.ts` so the Setup band appears (Years and terms, Calendar, Classes and streams, Subjects, School day and rooms, Grading and windows, Records and identity); remove the syllabus redirect from the nav.
2. **Accounts (B2, B3, B4).** Add a forgot-password flow for portal and staff hosts (token by email or SMS); add a teacher invite subject; send invite links through a channel; allow phone-number invites with an SMS or WhatsApp claim link; refuse claims that would overwrite a non-portal account.
3. **Persona check on guardian-link PATCH (B5)**; make the route-guard test per method (B12).
4. **Soft archive (B6)** and `PATCH /calendar/[id]` (B7).
5. **Import guard per entity (B8)**; align the grading-schemes feature key with its page (B9).
6. **Audit setup changes (B10)** with `PlatformAuditEvent` on year, term, class, subject, scheme, window, timetable and calendar writes; a "who changed what" view under Setup.
7. **Notices (B11).** Show the `withoutAccount` families with a "send by SMS" option once a channel exists; until then, an export of who was not reached.
8. **Docs (B13).** Close the stale open-questions entries; correct production-readiness §6; update roadmap rows S-1.2 (no edit), S-5.1 (four sources without a page), S-9.6 (built in-app).

## 7. Proposed restructuring

- **A Setup band inside the school shell** (`/schools/setup/*`) replacing the Management → Master Data detour, ordered as imports need it: year → terms → classes → streams → subjects → school day and rooms → grading → publish windows → fee structures → staff. One rail, one shell.
- **One home for each master-data entity.** Subjects only under Setup; publish windows only under Grading; assignments only under People, with the teachers page linking there.
- **People band**: Teachers, Support staff, Assignments, Accounts (invites, portal status, resets) so account administration is a screen, not a per-row dialog.
- **Communication band** with a Channels settings page (sender ids, templates, costs) once a channel exists.
- **Persona-aware rail**: the admin persona sees Setup first; registrar sees Roll first.
- **Retire the pack spec's role list and feature keys** and the `VerticalDataViews` phase specs; the roadmap and this audit are the record.

## 8. Proposed new workflows and features

1. **Setup checklist and readiness dashboard** (`/schools/setup`): steps done and outstanding with links; data-quality queue (pupils without a class, guardians without a phone, teachers without a portal account or HR record, classes without a form teacher, subjects without a teacher); last import with rejected rows and Undo.
2. **Account administration**: invite by email or phone with delivered links, resend, reset password, disable, "who has never signed in"; teacher invites; bulk invite by class with a delivery report.
3. **Communication channels**: SMS aggregator and WhatsApp Business sender configuration per tenant, templates with merge fields, cost tracking, delivery status; the `schools` notification category (S-9.5) with quiet hours.
4. **Tenant branding**: crest, colours, portal accent and document header stored on the tenant; applied to portals, login pages and PDFs. This is what the Premier band and the add-on sell.
5. **Calendar editing and a term-dates template**: edit events; create three terms with half-terms and public holidays from a template.
6. **Timetable builder on the grid**: click a cell to place, drag to move, clash highlighting; exam timetable and room booking as a second mode.
7. **Departments and houses** as entities: department on subject and teacher, HOD per department (feeds the moderation fix), houses for pastoral and sport.
8. **Document centre**: all eight sources with batch runs by class (statements, class lists, registers, ID cards), template editing per school, a print queue.
9. **Configuration audit log** with diff and actor.
10. **Multi-campus** as `SchoolCampus` under one company, if the Group band stays: per-campus registers, structures and staff with group reports.
11. **Staff self-service for teachers without an HR record**: leave request, cover request, profile edits, feeding the head's "cover today".

## 9. Open decisions

- Do schools stay operator-provisioned, or does the setup checklist become a self-serve onboarding?
- Which communication channel is first: SMS aggregator, WhatsApp Business, or email? The invite flow and notices both wait on it.
- Is branding an add-on or included? The pricing file says both.
- Multi-campus: build it or stop selling it.
- Who owns "teaching qualification" and other teacher attributes: school custom fields or HR?
