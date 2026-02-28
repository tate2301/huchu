# School Implementation Plan

## Goals
- Deliver a production-ready school pack covering enrollment, academics, finance, hostels, and guardians with playbook-compliant UI.
- Keep finance flows tenant-safe with posting rules, idempotent receipts, and period locks.

## Phases
1. **Tenant & Roles**
   - Company + site creation; enable school feature gates; map org tree to campuses/branches.
   - Roles: admin, registrar, bursar, teacher, guardian portal with granular permissions (read/edit/submit/cancel) and approval rules.
   - Audit trail baseline: created/modified/submitted by fields and timeline comments.
2. **Academic Structure**
   - Academic years/terms, classes/streams, subjects, timetables; copy-forward helper for recurring terms.
   - Teacher assignment, room allocation, exam schedule scaffolding with conflict detection.
   - Holidays/calendar blocks to drive attendance and scheduling logic.
3. **Student & Guardian Records**
   - Enrollment with admission numbers, guardians (multiple), prior school info, transport eligibility.
   - Health/consent flags; document upload (ID, birth cert, medical); hostel eligibility and transport eligibility captured.
   - Workflow: Draft → Verified → Active; duplicate detection on national ID/passport.
4. **Fees & Billing**
   - Fee templates per class/program; discounts/scholarships; payment plans; late fee rules.
   - Invoice generation by term (bulk with preview); waivers/refunds; bursar approvals and maker-checker.
   - Receipts post through accounting with audit trail and idempotent source keys; integrate with payment gateways where configured.
   - Statements, arrears aging, auto-reminders, and dunning stages.
5. **Hostels**
   - Hostels, rooms, beds with gender policy and occupancy limits; housekeeping status (clean/dirty/out-of-service).
   - Allocation workflow, vacancy management, check-in/out logs; damage/incident logging.
   - Billing hooks for hostel fees per term and refunds on early checkout.
6. **Attendance & Conduct**
   - Daily attendance by class; late/absence reasons; guardian notifications (email/SMS) with templates.
   - Incident/discipline log with resolution workflow and sanctions; escalation to counselors.
   - Bulk import for historical attendance and conduct records.
7. **Assessments & Reports**
   - Score entry per subject; gradebook; weighted components; moderation and approval steps.
   - Term report generation with comments, rankings/percentiles options, and publish/unpublish controls.
   - Import/export for scores; academic integrity logs for changes after publish.
8. **Reporting & Exports**
   - Fee collection dashboards, arrears aging, enrollment stats, hostel occupancy.
   - CSV/PDF exports for receipts, statements, report cards, class lists; scheduled report emails.
   - Data protection: role-filtered exports and audit entries for downloads.

## Acceptance Criteria
- Navigation and route gating list the school pack modules with one-table-per-view layouts.
- Enrollment supports guardians, health flags, hostel eligibility, and document attachments.
- Fee templates generate invoices by term; waivers/refunds adjust balances and audit references.
- Receipts post via accounting posting rules with idempotent source keys and balanced entries.
- Hostel allocation respects capacity and gender policy; occupancy views are accurate.
- Attendance captured daily with reasons; notifications triggered for absences.
- Assessments allow score import/entry and produce term reports; publish/unpublish works.
- Dashboards show collections, arrears, enrollment, and occupancy; exports (CSV/PDF) succeed and log audits; scheduled emails send on time.
- All critical actions (submit/cancel/waive/refund/publish) require permissions and leave timeline audit notes.
