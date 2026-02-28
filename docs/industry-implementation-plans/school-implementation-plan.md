# School Implementation Plan

## Goals
- Deliver a production-ready school pack covering enrollment, academics, finance, hostels, and guardians with playbook-compliant UI.
- Keep finance flows tenant-safe with posting rules, idempotent receipts, and period locks.

## Phases
1. **Tenant & Roles**
   - Company + site creation; enable school feature gates.
   - Roles: admin, registrar, bursar, teacher, guardian portal.
2. **Academic Structure**
   - Academic years/terms, classes/streams, subjects, timetables.
   - Teacher assignment, room allocation, exam schedule scaffolding.
3. **Student & Guardian Records**
   - Enrollment with admission numbers, guardians, prior school info.
   - Health/consent flags; document upload; hostel eligibility.
4. **Fees & Billing**
   - Fee templates per class/program; discounts/scholarships; payment plans.
   - Invoice generation by term; waivers/refunds; bursar approvals.
   - Receipts post through accounting with audit trail and idempotent source keys.
5. **Hostels**
   - Hostels, rooms, beds with gender policy and occupancy limits.
   - Allocation workflow, vacancy management, check-in/out logs.
6. **Attendance & Conduct**
   - Daily attendance by class; late/absence reasons; guardian notifications.
   - Incident/discipline log with resolution workflow.
7. **Assessments & Reports**
   - Score entry per subject; gradebook; term report generation.
   - Publish to guardian portal with release controls.
8. **Reporting & Exports**
   - Fee collection dashboards, arrears aging, enrollment stats.
   - CSV/PDF exports for receipts, statements, and report cards.

## Acceptance Criteria
- Navigation and route gating list the school pack modules with one-table-per-view layouts.
- Enrollment supports guardians, health flags, hostel eligibility, and document attachments.
- Fee templates generate invoices by term; waivers/refunds adjust balances and audit references.
- Receipts post via accounting posting rules with idempotent source keys and balanced entries.
- Hostel allocation respects capacity and gender policy; occupancy views are accurate.
- Attendance captured daily with reasons; notifications triggered for absences.
- Assessments allow score import/entry and produce term reports; publish/unpublish works.
- Dashboards show collections, arrears, enrollment, and occupancy; exports succeed without errors.
