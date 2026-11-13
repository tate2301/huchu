# Schools Pack — Production Readiness Assessment

Goal being assessed: **provision a tenant as a school and have it work end to end**, without
engineering intervention per customer.

Audit date: 2026-08-04. Source of truth read: `prisma/schema/core.prisma`, `app/schools/**`,
`app/api/v2/schools/**`, `lib/schools/**`, `components/schools/**`, `lib/platform/**`,
`lib/accounting/**`, `proxy.ts`.

Repo baseline at time of audit: `npx tsc --noEmit` clean; `vitest run` → 878 passed, 2 failed,
14 test files fail to load because they require a live `DATABASE_URL` (migration witness tests).
No schools test exists at all.

---

## 1. Where the pack actually stands

Substantially more is built than `schools.md` §10 claims. What genuinely exists and works:

| Area | State |
|---|---|
| Data model | 27 `School*` models in the baseline migration — students, guardians, enrolments, classes/streams, subjects, teacher profiles, hostels/rooms/beds, allocations, leave, result sheets, publish windows, fee structures/invoices/receipts/waivers, attendance sessions |
| API surface | 72 route files under `app/api/v2/schools` |
| UI | 34 pages under `app/schools`, ~10k lines of feature components, list + detail shells |
| Result moderation | Real: DRAFT → SUBMITTED → HOD_APPROVED → PUBLISHED, with `SchoolResultModerationAction` audit rows and publish-window gating (`lib/schools/governance-v2.ts`) |
| Teacher scoping | Real: assignments drive what a teacher can see and mark |
| Attendance | Real: sessions, lines, submit, lock |
| Feature gating | Real: `lib/platform/gating/route-registry.ts` covers every `/schools` page and API prefix; enforced in `proxy.ts` |
| Portal shells | Real: `students.`/`parents.`/`teachers.` subdomain hosts with their own login pages |

So this is not a greenfield build. It is a broad, shallow pack that needs depth, integrity and a
provisioning path — not another round of scaffolding.

---

## 2. Blockers — a provisioned school cannot transact today

### B1. There is no way to create an academic year or a term
`SchoolAcademicYear` and `SchoolTerm` exist in the schema. Nothing creates them. There is no route
file, no UI, no seed, no script — `schoolAcademicYear.create` and `schoolTerm.create` appear
nowhere in `app/`, `lib/`, or `scripts/`.

Every downstream entity is keyed by `termId`: enrolment, fee structure, invoice, waiver, result
sheet, publish window, boarding allocation, class-subject assignment. A freshly provisioned school
therefore cannot enrol a single student. This is the single hard stop.

### B2. There is no school provisioning path
`pnpm platform` → org-provision wizard creates: company, admin user, tier, bundle template
(`TEMPLATE_SCHOOLS`), subdomain. It creates **no school domain data** — no academic year, terms,
classes, streams, subjects, grading scale, fee structure, or chart of accounts.
`scripts/seed-staging-tenant.ts` has no schools branch.

"Provision for a school and it works" requires a first-run path that lands the tenant on a working
product: current year + three terms, a class ladder, a subject catalogue, a fee structure, the
accounting defaults, and the staff roles.

### B3. Fee money never reaches the general ledger
`emitSchoolFeeAccountingEvent` (`app/api/v2/schools/fees/_helpers.ts`) calls `captureAccountingEvent`,
which writes an `AccountingIntegrationEvent` row with `status: "PENDING"` and stops. Retail, by
contrast, calls `createJournalEntryFromSource` (`app/api/v2/retail/_helpers.ts:130`) and actually posts.

Consequences: no journal entry, no AR subledger, no trial-balance movement for school fees. The only
way to post is running `pnpm platform:accounting-replay` by hand.

Compounding this:
- `AccountingSourceType` has **no** school members. School events are mapped onto `SALES_INVOICE` /
  `SALES_RECEIPT` / `SALES_WRITE_OFF`, so posting rules cannot distinguish tuition from any other sale.
- There is no `SCHOOLS_REQUIRED_SOURCE_TYPES` readiness contract, though
  `RETAIL_REQUIRED_SOURCE_TYPES` exists in `lib/accounting/source-types.ts`.
- Nothing seeds a school chart of accounts (Tuition Revenue, Boarding Revenue, Fees Receivable,
  Fees Received In Advance, Bursary/Scholarship Expense).

### B4. Portal identity is resolved by string-matching email
- Student: `session.user.email.split("@")[0].toUpperCase()` compared against `SchoolStudent.studentNo`
  (`app/api/v2/schools/portal/student/me/timetable/route.ts`, `app/api/v2/portal/_handlers.ts:410`).
- Parent: `SchoolGuardian.email` matched case-insensitively against the session email
  (`app/api/v2/portal/_handlers.ts:150`). `SchoolGuardian.email` is nullable and **not unique**.

`SchoolStudent` and `SchoolGuardian` carry no `userId`. Only `SchoolTeacherProfile` does. Two
guardians sharing a household email, or a student whose email local-part happens to match another
student's number, cross the tenant's data boundary. There is also no invite or account-provisioning
flow — no invitation model exists in the schema — so onboarding 800 parents means running
`scripts/create-user.js` 800 times and hoping the emails line up.

---

## 3. Data integrity defects

### D1. School money is `Float`
`SchoolFeeInvoice.totalAmount/paidAmount/balanceAmount`, `SchoolFeeInvoiceLine.*`,
`SchoolFeeReceipt.amountReceived`, `SchoolFeeReceiptAllocation.allocatedAmount`,
`SchoolFeeWaiver.amount` are all `Float`. The code compensates with `toMoney()` rounding and
`> 0.009` epsilon comparisons.

Gold already migrated to `Decimal @db.Decimal(...)` (46 declarations in the schema). Schools is the
outlier. Fees are the product's wedge; they cannot be the only binary-float ledger in the platform.

### D2. No currency anywhere in school fee models
Every other money-bearing model in the platform carries `currency` — payroll, gold, scrap, retail,
accounting — and `CurrencyDefinition` exists. School fee models have none; the accounting event
hardcodes `input.currency ?? "USD"`.

For the Zimbabwean market this is disqualifying: fees are quoted in USD and settled in USD or ZWG at
a rate that must be captured on the receipt.

### D3. Check-then-write races on allocation
Both hot paths read the constraint outside the transaction and write inside a later one:
- Bed allocation: `app/api/v2/schools/boarding/allocations/route.ts:215` reads existing allocations,
  then `prisma.$transaction` creates. No DB uniqueness backs `bedId + ACTIVE`. Two concurrent
  requests put two students in one bed.
- Receipt allocation: `app/api/v2/schools/fees/receipts/route.ts:296` validates against
  `invoice.balanceAmount`, then creates in a separate transaction. Two concurrent receipts over-pay
  the invoice — and `refreshFeeInvoiceBalance` clamps with `Math.max(..., 0)`, so the overpayment
  silently disappears rather than becoming a credit.

### D4. Duplicate term invoices
`SchoolFeeInvoice` has no `@@unique([companyId, studentId, termId])`. Bulk generation's
`skipExisting` flag is **opt-in** (`app/api/v2/schools/fees/invoices/bulk-generate/route.ts:117`).
Running bulk generate twice for a term double-invoices the whole school.

### D5. Unenforced boarding policy
`SchoolHostel.genderPolicy` and `SchoolStudent.gender` both exist. The allocation route never reads
either — `gender` appears nowhere in it. Room and hostel capacity are likewise unchecked; only bed
occupancy is. The spec's acceptance criterion "hostel allocation respects capacity and gender
policy" is not met.

### D6. Multiple active terms are possible
`SchoolTerm.isActive` and `SchoolAcademicYear.isActive` are plain booleans with no partial unique
index. "Current term" is resolved ad hoc at each call site.

---

## 4. Authorization

Feature gating in `proxy.ts` is per-feature-key, not per-action. `ROLE_PREFIX_ALLOWLIST`
(`lib/platform/user-entitlements.ts`) grants `TEACHER`, `REGISTRAR` and `SCHOOL_ADMIN` the whole
`schools.` prefix via `SCHOOL_SHARED_ALLOW_PREFIXES` — which includes `schools.fees`.

**56 of the 72** school API routes never reference `session.user.role`. Verified on the sensitive
ones: `fees/receipts`, `fees/invoices`, and `fees/invoices/[id]/write-off` have no role check at all.

Net effect: a `TEACHER` can post fee receipts, issue invoices and write off debt. Bursar/registrar/
teacher separation of duty exists on paper only.

---

## 5. Surfaces in the navigation that are not real

`lib/navigation.ts:241-263` ships 18 school nav items. Several lead to fiction.

| Nav item | Reality |
|---|---|
| **Timetable** | There is **no timetable model**. `components/schools/timetable/schools-timetable-content.tsx` lists teacher assignments and labels them `deriveSlot(index)` — "P1 08:00", "P2 09:00"… assigned by array position. The student portal timetable endpoint fabricates the same way. A school runs on its timetable; this cannot ship. |
| **Refunds** | `app/api/v2/schools/finance/refunds/route.ts` — `GET` returns a hardcoded empty array, `POST` returns 501. No `SchoolFeeRefund` model. The page is live in nav. |
| **Assessments** | Renders the same result-sheet list as Results. No assessment/exam entity, no continuous-assessment vs exam weighting. |
| **Admissions** | Read-only list of `SchoolEnrollment`. No application intake, no verification, no offer/acceptance, no duplicate detection — all of which `schools.md` §4.1 specifies. |
| **Notices** | `GET` only. Re-reads the generic `NotificationRecipient` feed and infers audience by substring-matching the notification type. No compose, no audience targeting, no school notice entity. |
| **Documents** | `components/schools/documents/school-documents-content.tsx` builds HTML and calls `window.print()`. It bypasses `lib/documents/` entirely — which already has `template-resolver`, `pdf-renderer`, `csv-renderer`, `branding-snapshot`, a default template catalogue and a PDF worker. No school templates are registered in that catalogue. |
| **Reports → export** | `exportReportToPDF` (`lib/schools/reports.ts:521`) returns `Buffer.from(JSON.stringify(data))` with a comment saying "placeholder … in production, use a library". `exportReportToCSV` does no quoting or escaping — any name containing a comma corrupts the file. Both reimplement what `lib/documents/` already does properly. |

Per the engineering principles now at the top of `AGENTS.md`, the last three are the clearest
violations: functionality was reimplemented badly alongside a working platform capability.

---

## 6. Missing domain depth

- **Grading.** `SchoolResultLine.subjectCode` is a free string, not a FK to `SchoolSubject`.
  `grade` is a free string with no grading-scale model. A result sheet is per class/term, so it
  mixes subjects. No aggregate, no position, no ZIMSEC-style symbol mapping, no report-card
  comments, no CA/exam weighting.
- **Conduct/discipline.** `schools.md` §4.4 specifies it. Nothing exists — no model, no route, no page.
- **Notifications.** Schools emits **zero** notifications. No absence alert, no fee-due or arrears
  reminder, no results-published notice — despite a full `Notification` + `WebPushSubscription`
  system in the platform. For parents this is the product.
- **Transport, library, health, canteen** are absent. Reasonable to defer, but they are the usual
  next asks after fees and results.

---

## 7. Engineering hygiene

- **Zero tests** for schools — no `.test.ts` under `lib/schools`, `app/api/v2/schools` or
  `components/schools`. Fees, moderation and boarding allocation are exactly the invariants that
  need them.
- **Duplicate route tree.** `app/api/v2/schools/finance/{invoices,receipts,waivers}/route.ts` are
  two-line re-exports of the `fees/` equivalents, and the UI has both `/schools/fees` and
  `/schools/finance/*`. One naming should survive; per the principles, delete the other.
- **Portals in the main sidebar.** `lib/navigation.ts` puts `/schools/portal/{parent,student,teacher}`
  in the admin nav, which contradicts the portal-isolation model in `lib/platform/gating/portal-isolation.ts`.
- **Stale plan doc.** `schools.md` §10 reports detail pages and portals as missing; both shipped.

---

## 8. What to build, in layers

Ordered so the tenant is usable at the end of every layer, per the principles in `AGENTS.md`.

### Layer 0 — make a provisioned school able to transact
1. `SchoolAcademicYear` / `SchoolTerm` CRUD: API, UI under `/schools/academics`, and a partial unique
   index so exactly one year and one term per company can be active.
2. A `provisionSchool(companyId, options)` service plus `pnpm provision:school`, invoked by the
   org-provision wizard when the template is `TEMPLATE_SCHOOLS`. Seeds: current academic year, three
   terms, class ladder, subject catalogue, grading scale, one fee structure, accounting defaults via
   `ensureAccountingDefaults`, and the school roles.
3. School document templates registered in `lib/documents/default-template-catalog.ts`: fee invoice,
   fee receipt, report card, class list. Delete the `window.print()` path and the placeholder
   exporters in `lib/schools/reports.ts`.

**Exit:** provision a tenant, log in, enrol a student, invoice, receipt, print a branded PDF.

### Layer 1 — make the money correct
4. Migrate all school money columns `Float` → `Decimal @db.Decimal(14,2)` with a migration witness
   test, matching the Gold precedent.
5. Add `currency` (+ `exchangeRate`, `baseAmount`) to invoice, receipt, waiver.
6. Add school members to `AccountingSourceType`, a `SCHOOLS_REQUIRED_SOURCE_TYPES` readiness
   contract, and seed the school chart of accounts and posting rules.
7. Switch `emitSchoolFeeAccountingEvent` to `createJournalEntryFromSource` so receipts post
   synchronously and idempotently, with the AR subledger updated.
8. Close the races: `@@unique([companyId, studentId, termId])` on `SchoolFeeInvoice`; a partial
   unique index on active bed allocations; move both validations inside their transactions. Carry
   overpayment as a credit instead of clamping it away.
9. Tests: allocation arithmetic, over-allocation rejection, idempotent posting, duplicate-invoice
   rejection, concurrent bed allocation.

**Exit:** fees are decimal, multi-currency, hit the GL, and cannot be double-counted.

### Layer 2 — make access control real
10. Split `schools.` in `ROLE_PREFIX_ALLOWLIST` into `schools.fees.read` / `schools.fees.write`
    (or an action-scoped capability check) so `TEACHER` loses write access to fees.
11. Add a role/permission assertion to each of the 56 unguarded routes.
12. Add `userId` to `SchoolStudent` and `SchoolGuardian`; delete the email-prefix matching entirely.
13. Build guardian/student account provisioning — invite, claim, reset — driven from the student and
    guardian detail pages.
14. Move the three portal links out of the admin sidebar.

**Exit:** a parent can only ever see their own children; a teacher cannot touch money.

### Layer 3 — make the academic side real
15. Timetable: periods, day templates, class-period-teacher-room assignment with conflict detection.
    Delete `deriveSlot` from both the UI and the portal endpoint.
16. Grading: FK `SchoolResultLine.subjectCode` → `SchoolSubject`; add a grading-scale model,
    per-subject sheets, CA/exam weighting, aggregate and position; generate report cards through
    `lib/documents/`.
17. Admissions: application intake → verification → offer → acceptance → enrolment, with duplicate
    detection.
18. Boarding: enforce gender policy and room/hostel capacity in the allocation route.

**Exit:** the academic half stops being a list view over assignments.

### Layer 4 — make it a product parents feel
19. School notifications on the existing pipeline: absence, invoice issued, payment received,
    arrears reminder, results published.
20. Notices: a real school notice entity with audience targeting and compose.
21. Refunds: model + workflow, replacing the 501 stub, or remove the nav entry until then.
22. Conduct/discipline per `schools.md` §4.4.

---

## 9. Recommended first move

Layer 0 item 1 and item 2 together: term management plus `provisionSchool`. Until a provisioned
tenant can create a term, nothing else in the pack is reachable, and every other fix is unverifiable
end to end.
