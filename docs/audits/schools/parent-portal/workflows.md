# Parent portal: workflow audit

Surface: `parents.<tenant>` host, routed to `app/portal/parent/**`, backed by `app/api/v2/schools/portal/parent/**` and `lib/schools/parent-household-loader.ts`. Audience: guardians with `SchoolGuardian.userId` linked to a `User` of role `PARENT`.

Audit date: 2026-09-14. Method: static read of the code on `main` (no runtime), cross-checked against the roadmap stories in `docs/expansion-plan/schools-roadmap.md`, the portal contract in `docs/design-system/portals/README.md` and `parent.html`, the marketing promises in `app/home/site-data.ts`, and the K-12 benchmark in `../reference/k12-benchmark.md`. The companion UI/UX document is `ui-ux.md` in this folder.

## 1. Verdict in one paragraph

The parent portal is a real, correctly scoped read-only window onto one family's records: attendance, published marks, fee lines, receipts, notices, and a two-way message channel to the office. Identity is sound (one resolver, hard 403 on any foreign id, consent flags enforced server side with an integration test). It is not yet the self-service surface the marketing site sells. The two document downloads always fail for the PARENT role, there is no way to pay, no way to update contact details, no notification of anything, and the attendance screen tells most parents their child's register is "not yet submitted" because the teacher portal never submits one. Ten of the twenty parent stories in the roadmap are still `todo`, and the prototype contains screens (leave request, calendar, timetable, child medical profile, payment history) that no story covers.

## Runtime check (14 September 2026)

Verified on the seeded St Marys tenant as `parent@stmarys.test` (see `../reference/runtime-verification.md`). Confirmed at runtime: B1 (receipt and report-card downloads return 403 from the render route), B2 (every attendance day reads "not yet submitted" because the staff portal never submits), the absence of any way to pay, and the missing navigation above 900px. The notice list shows each notice's full body, so P15 is stronger than the static read suggested; there is still no detail view, reply or RSVP.

## 2. Docs versus code

| Claim | Source | Code reality | Verdict |
|---|---|---|---|
| "Parents check balances, statements and results on their own phone" | `site-data.ts` capability card | Balances and results: yes. Statement PDF: the button exists but `POST /api/documents/render` requires `schools.fees view`, which `PARENT` does not hold (`lib/platform/personas.ts:160-162`, `app/api/documents/render/route.ts:101-108`). | Partly true. Download is broken. |
| S-6.7 receipt download, S-6.8 term statement download: `done` | roadmap | Same render-route refusal. Every parent hits "Your role cannot view fees". | **Story marked done but broken for its user.** |
| S-6.4 attendance with DRAFT labelled "not yet submitted": `done` | roadmap | Implemented (`parent-attendance-screen.tsx:148-168`). But `POST /api/v2/schools/portal/teacher/me/attendance` only ever writes `DRAFT` and the portal has no submit; only the office can submit or lock. | True as coded, misleading in practice: nearly every day reads "not yet submitted". |
| S-6.5 published marks gated on `PUBLISHED` and consent: `done` | roadmap | `child/marks/route.ts:40-46` filters on sheet status and `scopeToChild(needs:"academic-results")`. Publish window is not checked in the JSON route, only in the report-card PDF. | True, with one gap. |
| S-6.12 notices with per-recipient read state: `done` | roadmap | Implemented over `NotificationRecipient`. | True. |
| S-6.14 message the teacher: `todo` | roadmap | A message channel exists at `/portal/parent/messages` (threads with the office, reply, start thread). Cannot address a named teacher from the UI; no attachments. | More built than the roadmap says. Row needs updating. |
| S-6.1 OTP sign-in, S-6.9/6.10/6.11 payments, S-6.13 notice replies, S-6.15 events, S-6.16 language, S-6.17 2FA, S-6.18 sessions: `todo` | roadmap | None present. Login is email + password via the shared `portal-login-form.tsx`. | Accurate. |
| Help FAQ: statements and receipts "download as PDFs" | `parent-help-screen.tsx:28` | False for a parent today. | Copy contradicts behaviour. |
| Prototype: leave request, calendar, library, timetable, child profile with medical/emergency/transport, quiet hours, payment history | `parent.html` routes | None built. No roadmap story for leave request, calendar view, timetable, child profile, or quiet hours. | Contract gap not tracked. |
| `live-capabilities.md` lists `/schools/portal/parent` as a live page | system reference | It is a three-line redirect to `/portal/parent`. | Stale doc. |

## 3. Workflow inventory

Status key: Implemented = end to end with real writes; Partial = works with named gaps; Broken = control exists but the API refuses or the link is dead; Missing = absent.

| # | Workflow | Status | Evidence and gap |
|---|---|---|---|
| P1 | Get an account (staff invite, claim link, set password) | Implemented | `lib/schools/portal-invites.ts`, `app/c/[token]`. Delivery is manual copy-paste; no email, SMS or WhatsApp send. |
| P2 | Sign in (email + password, remember me) | Implemented | Shared `components/auth/portal-login-form.tsx`; rate limited in `lib/auth.ts:438-452`. |
| P3 | Forgot password / reset | Missing | Only `POST /api/users/password-reset`, SUPERADMIN only. A parent who forgets must phone the office. |
| P4 | Switch between children | Implemented | Household loaded server side; selection in `localStorage`; every child call re-checks the link in `child/_guard.ts`. |
| P5 | Home glance: owed, attendance, marks ready, today's lessons, latest notices | Implemented | `parent-home-screen.tsx`. Withheld figures are absent, not zero. |
| P6 | View attendance by day and term | Implemented | Consent not required for attendance. Most days read "not yet submitted" until the office submits (see staff portal audit). |
| P7 | Report an absence in advance / request leave | Missing | Prototype `leave-request` screen; no API, no story. |
| P8 | View published marks with pass mark | Implemented | Publish window not enforced in the JSON route (`child/marks/route.ts`), only in the PDF. |
| P9 | Download report card | Broken | `parent-marks-screen.tsx:171-176` → render route 403. |
| P10 | View fee statement: invoices, lines, paid, balance, receipts | Implemented | Money crosses as strings. VOIDED and DRAFT invoices excluded. |
| P11 | Download invoice / receipt / statement PDF | Broken | `parent-fees-screen.tsx:269-273` → render route 403. |
| P12 | Pay online (EcoCash, OneMoney, bank, card) | Missing | `lib/payments/*` serves subscription billing only; nothing in the portal references it. S-7.3 `todo`. |
| P13 | Part payment / payment plan | Missing | S-6.10 `todo`; no instalment model anywhere. |
| P14 | Payment history filtered by child and method | Missing | S-6.11 `todo`. Receipts are listed per invoice only. |
| P15 | Read school notices, mark read, mark all read | Implemented | In-app only; the body renders in the list row; no detail screen or attachments. |
| P16 | Reply to a notice | Missing | S-6.13 depends on S-7.1. |
| P17 | Message the school office (start thread, reply) | Implemented | `parent-messages-screen.tsx`; reached via the You tab, not a bottom tab. |
| P18 | Message a named teacher, attach a file | Partial | API accepts `teacherProfileId`; UI always sends null; no attachments. |
| P19 | School calendar / events / RSVP | Missing | S-6.15 `todo`; calendar model exists (`SchoolCalendarEvent`) but no parent route. |
| P20 | Child's timetable and homework | Missing | Prototype has timetable; today's lessons only on Home. |
| P21 | Child profile: medical, allergies, emergency contacts, transport, boarding | Missing | Prototype `child/:id`. Health model exists (`lib/schools/health.ts`) with no parent read. |
| P22 | Update own contact details, consent preferences | Missing | Profile is read-only (`parent-profile-screen.tsx`). |
| P23 | Book a parent-teacher meeting | Missing | `POST /api/v2/schools/meetings` has a `book` action but requires `schools.students edit`; no parent screen. |
| P24 | Notifications: absence, invoice issued, payment received, results published | Missing | S-9.2 to S-9.4 `todo`; no trigger in any fee, attendance or publish route. |
| P25 | Language (English, Shona, Ndebele) | Missing | S-6.16 `todo`. |
| P26 | Security: OTP sign-in, 2FA, session list | Missing | S-6.1, S-6.17, S-6.18 `todo`. |
| P27 | Help | Implemented | Static FAQ with one false claim (PDF downloads). |
| P28 | Sign out | Implemented | |

Counts: 10 implemented, 1 partial, 2 broken, 15 missing.

## 4. Benchmark gap: what mature parent apps do that this one does not

Graded against `../reference/k12-benchmark.md` §17 (portals), §8 (communication), §9 (fees).

| Capability | Benchmark norm | Huchu today | Priority |
|---|---|---|---|
| Pay fees in the app with instant receipt | Standard in every regional SIS with a portal | Absent | P0 for the fees-first positioning |
| Push, SMS or WhatsApp on absence, invoice, receipt, results | Standard | Absent; in-app only | P0 |
| Report absence / request leave with reason and attachment | Standard | Absent | P1 |
| Download statement, receipt, report card | Standard | Buttons present, always fail | P0 (bug) |
| Update contact details and consent, with office approval | Standard | Absent | P1 |
| See timetable, homework set, and homework status | Standard | Absent | P1 |
| Book parents' evening slot | Common | Absent (API half exists) | P1 |
| Medical and emergency profile per child | Common | Absent | P2 |
| Behaviour and merits | Common | Parked S-P.1 | P2 (product decision) |
| Multiple guardians per child with different rights | Standard | Modelled (`SchoolStudentGuardian` with consent flags) | Done |
| Passwordless or OTP sign-in for low-literacy, shared-phone households | Increasingly standard in the region | Absent | P1 |
| Offline read of last statement and timetable | Common in low-connectivity markets | Absent; marketing FAQ says otherwise | P1 |

## 5. Bugs and risks

Severity is functional impact for the parent unless marked security.

| # | Finding | Location | Severity |
|---|---|---|---|
| B1 | Every document download fails for `PARENT`. The render route checks `canSchoolRoleDo(role, "schools.fees"|"schools.results", "view")` and the PARENT persona holds only `schools.portal.parent`. The fix must not simply grant `schools.fees view`: the render route has no row-level check, so that would let a parent render any family's invoice by id. Add a guardian-link check in `lib/documents/schools-sources.ts` for portal callers. | `app/api/documents/render/route.ts:101-108`, `lib/platform/personas.ts:160-162`, `lib/documents/schools-sources.ts:77-93` | High |
| B2 | Attendance reads "not yet submitted" for almost every day because the teacher portal never submits a register. Fix on the staff side (add submit) and, until then, change the parent copy to explain what the label means. | `parent-attendance-screen.tsx:148-168`, `app/api/v2/schools/portal/teacher/me/attendance/route.ts:106-118` | High |
| B3 | Publish window enforced for the PDF but not for the marks JSON; a sheet published then windowed-closed stays visible in the app while the PDF refuses. | `child/marks/route.ts:40-46` vs `schools-sources.ts:492-499` | Low |
| B4 | Help copy promises PDF downloads. | `parent-help-screen.tsx:28` | Low |
| B5 | Security: invite claim can reset the password and demote the role of an existing same-tenant account whose email the inviter chose. Refuse when the existing user holds a non-portal role or is already linked. | `lib/schools/portal-invites.ts:243-273` | Medium |
| B6 | Security: `startThread` writes a client-supplied `teacherProfileId` without a company check. | `lib/schools/messages.ts:250-310` | Low |
| B7 | No audit row for any parent action (messages, read receipts). | `lib/schools/audit.ts` | Low |
| B8 | On the `staff.` host a PARENT token is rewritten into the teacher shell (empty) instead of redirected to the parent portal. | `proxy.ts:417-460` vs `:469-479` | Low |
| B9 | Legacy aggregate routes (`/api/v2/schools/portal/parent`, `/parent/children/[studentId]/*`) re-implement scoping inline; unused by the shell. Delete. | `app/api/v2/portal/_handlers.ts:119-363` | Low |

## 6. Proposed edits (fix what exists)

Ordered by value to the parent per unit of work.

1. **Fix the downloads (B1).** Add a `portalSubject` branch in the document render path: for role `PARENT`, resolve the guardian from the session and require a `SchoolStudentGuardian` link plus the relevant consent flag before rendering `schools.fee.invoice`, `schools.fee.receipt`, `schools.fee.statement`, `schools.report-card`. Add a `parent-scope.test.ts` case for a stranger's receipt id. Correct the roadmap rows for S-6.7 and S-6.8.
2. **Close the register loop (B2).** Belongs to the staff portal audit, but the parent-facing effect is the worst copy in the product. Until submit lands, change "not yet submitted" to "the office has not confirmed this day yet", and hide the label on days older than the current week.
3. **Make the attendance day open.** The prototype `attendance/:day` shows the lessons that day; the API already returns session lines. One tap to open the day is missing.
4. **Add "Message a teacher".** The API accepts `teacherProfileId`; add a picker limited to the teachers assigned to the selected child's class subjects (`SchoolClassSubject` for the child's enrolment). Promote Messages to a visible entry on Home (the prototype has a shortcut pill).
5. **Update roadmap rows** S-6.14 (partial, office thread exists), S-6.7 and S-6.8 (broken), and add rows for the prototype screens with no story (leave request, calendar, timetable, child profile, quiet hours, payment history).
6. **Fix the help FAQ (B4)** and add the six questions the roadmap S-6.19 names, in the parent's words.
7. **Harden the claim (B5, B6)** and delete the legacy aggregate routes (B9).
8. **Redirect on wrong host (B8):** on a portal host, run the role-to-portal check before the rewrite, mirroring the POS refusal in `lib/auth.ts:567-579`.

## 7. Proposed restructuring

- **Tabs.** The prototype's four tabs are Home · Fees · News · You. The code uses Home · Fees · News · You in the shell but the roadmap calls them Notices and Profile. Pick one vocabulary and put it in `docs/design-system/portals/README.md`. Recommendation: keep the prototype's labels because they are the contract, and fix the roadmap row S-6.0.
- **Messages is buried.** Two-way messaging is the single feature that stops a phone call. Surface it as a Home shortcut and as a row on the You tab with an unread badge, matching the prototype.
- **Fees tab becomes a hub**, not a list: balance hero, "Pay now" (when P12 lands), statement, receipts, payment history, saved methods, discounts. Today it is one long scroll per child.
- **Merge the two child-fee API generations.** `/child/*` with `scopeToChild` is the pattern; `/children/[studentId]/*` and the `/parent` aggregate duplicate it. Delete the old ones after confirming nothing in `e2e/` calls them.
- **Move consent editing** (`canReceiveFinancials`, `canReceiveAcademicResults`) from a registrar-only PATCH to a visible state on the parent's profile, read-only for the parent with "ask the office" copy. Parents currently cannot see why a figure is withheld.

## 8. Proposed new workflows and features

Ranked. Each entry names the model and route it needs so it can become a roadmap story under the roadmap's new-scope rule.

1. **In-app fee payment (S-7.3, S-6.9).** Reuse `lib/payments/` `PaymentProviderAdapter` with a new `SchoolFeePayment` intent linked to `SchoolFeeInvoice`; on `PAID` create the `SchoolFeeReceipt` through the existing allocation and posting flow so the bursar sees one receipt stream. Adapter order for Zimbabwe: EcoCash and OneMoney via Paynow first, card second, bank transfer as a "tell us you paid" proof-of-payment upload with bursar confirmation. Add S-6.10 part payment as an amount step on the same flow.
2. **Notifications with a real channel (S-9.2 to S-9.5).** Emit on `attendance session submitted with absence`, `invoice issued`, `receipt posted`, `result sheet published`, `notice created`. Deliver to in-app plus one external channel. WhatsApp is the regional default; the invite link already assumes a human forwards it on WhatsApp. Add a `schools` category to `UserNotificationPreference` with quiet hours.
3. **Absence and leave request (prototype `leave-request`).** New `SchoolAbsenceNotice` (student, guardian, date range, reason, attachment, status REPORTED / ACKNOWLEDGED). Surfaces on the office absence follow-up board and pre-fills the register as an authorised absence.
4. **Contact and consent self-service.** Guardian edits phone, email, address as a pending change; registrar approves. Consent preferences editable where the school allows.
5. **Parents' evening booking.** Reuse `SchoolMeetingSlot` free slots; parent books from the child's teacher list; teacher and parent both get a notification.
6. **Child profile screen.** Read-only medical, allergies, emergency contacts, transport stop, hostel allocation. Sources already exist (`health.ts`, `transport.ts`, `boarding.ts`).
7. **Timetable and homework** for the selected child, reusing the student `me/timetable` and `me/homework` loaders with a guardian scope.
8. **Calendar and events with RSVP** over `SchoolCalendarEvent`, plus iCal export.
9. **OTP sign-in by phone number (S-6.1)** and language picker (S-6.16). These matter more than 2FA for this audience; sequence them ahead of S-6.17 and S-6.18.
10. **Offline read cache** for the last statement, timetable and notices, using the existing service worker but scoped so it does not sit in front of `/api/v2` (the e2e suite currently has to block it).

## 9. Open decisions for the product owner

- Which channel is the default for parent notifications: WhatsApp Business API, SMS aggregator, or web push only? Cost per message decides the design.
- Which payment provider for fees? The subscription seam has three adapters; none is designated for school fees.
- Should a parent see DRAFT registers at all, or only submitted ones? Today they see the draft with a label.
- Is behaviour/discipline (parked S-P.1) staying out of the parent portal? Every benchmark app shows it.
- Contract vocabulary: prototype labels or roadmap labels.
