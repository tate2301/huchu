# K-12 school management benchmark (reference capability list)

Sources of comparison: PowerSchool SIS, Infinite Campus, Skyward Qmlativ, Blackbaud Education Management, Veracross, FACTS SIS, Arbor, Bromcom, SIMS/ESS, iSAMS, Engage, Compass, Sentral, Fedena, OpenSIS, Gibbon, Classe365. Regional context: Zimbabwe (ZIMSEC / Cambridge exam boards, ZIMRA fiscalisation, EcoCash/OneMoney/InnBucks/ZimSwitch, USD/ZWG multi-currency, three-term year, BEAM beneficiaries, SDC levies vs tuition, boarding-heavy secondary schools, low connectivity, WhatsApp-first communication).

Each domain lists the capabilities a mature system has. The audit documents map Huchu against these.

## 1. Admissions and enquiry CRM
- Enquiry capture (web form, walk-in, phone), source tracking, follow-up tasks
- Online application form with document upload and application fee
- Pipeline stages: enquiry → application → assessment/interview → offer → acceptance/deposit → enrolled; waitlist; deferred; declined with reason
- Sibling priority, feeder-school tracking, intake capacity per year group
- Entrance test scheduling and scoring
- Offer letters, acceptance forms, deposit invoicing
- Duplicate detection, merge
- Conversion reporting by stage, source, year group

## 2. Student information system (SIS)
- Demographics, IDs (national ID, birth certificate, passport), photo, house, stream, form
- Households and guardians: relationship, custody/legal restrictions, contact priority, billing responsibility, communication preferences, portal consents
- Enrolment history with status transitions (applied, enrolled, suspended, withdrawn, transferred, graduated, alumni) and effective dates
- Medical: conditions, allergies, medications, immunisations, emergency contacts, consent
- Documents vault per student (birth certificate, reports from previous school, transfer letters)
- Custom fields, tags, cohorts
- Bulk edit, import/export, merge, archive
- Data protection: consent register, access log per record, retention

## 3. Academic structure and staff allocation
- Academic years, terms, half-terms, weeks, cycle days
- Year groups, forms/registration classes, teaching sets/streams, houses
- Subjects, departments, subject levels (ZIMSEC O/A, Cambridge IGCSE), option blocks
- Teacher-to-class/subject allocation, class teacher/form tutor, HOD per department
- Rooms and resources

## 4. Timetabling
- Timetable construction with constraint checking (teacher, room, class clash)
- Auto-fill/solver, copy forward, versions
- Daily cover/substitution management with cover requests and notifications
- Room booking
- Exam timetable and invigilation roster
- Publish to portals; changes push notifications

## 5. Attendance
- Session attendance (AM/PM) and lesson-by-lesson attendance
- Codes: present, late, authorised/unauthorised absence, medical, school activity, suspended
- Late arrivals sign-in desk, early departure
- Registers not taken / overdue register alerts
- Absence notification to parents (SMS/WhatsApp/push) and parent-initiated absence reporting with reason
- Patterns and thresholds (attendance under X%), intervention tracking
- Statutory returns

## 6. Assessment, gradebook, results
- Assessment types (CA, tests, exams, projects), weighting, grading schemes with bands, per-subject pass marks
- Gradebook with cell-level entry, autosave, import from spreadsheet, custom columns
- Term marks aggregation, moderation workflow (teacher → HOD → head), change requests, audit
- Class ranking, position in class/year, effort/conduct grades
- Report cards with comment banks, teacher and head comments, per-term and cumulative, PDF, publish windows, parent acknowledgement
- Progress tracking over time, target grades vs actual, at-risk flags
- External exam management: ZIMSEC/Cambridge candidate registration, entries, fees, results import, certificates
- Transcripts and leaving certificates

## 7. Behaviour, pastoral care and welfare
- Merits/demerits/house points, incidents with categories and severity, sanctions (detention, suspension), witness statements
- Safeguarding/welfare concerns with restricted visibility
- Counselling notes, interventions, case management
- Parent notification and acknowledgement

## 8. Communication
- Announcements/notices with audience targeting (year group, class, boarders, staff), scheduling, read receipts
- Two-way messaging teacher↔parent, broadcast to class, quick replies, attachments
- Channels: in-app, push, email, SMS, WhatsApp; delivery status; cost tracking
- Parent-teacher conference booking with slots
- Surveys, consent/permission forms (trips), e-signature
- Communication log per student/family
- Emergency broadcast

## 9. Fees and finance
- Fee structures per year group/term/boarding/day; optional items (transport, uniform, trips, exam fees, levies)
- Discounts: sibling, staff child, scholarship, bursary, BEAM/sponsor billing, early payment
- Invoicing: bulk generation, proforma, adjustments, credit notes, write-off, void, reissue
- Payment plans/instalments with due dates and reminders
- Receipting: cash, bank transfer, mobile money, card, POS; allocation across invoices; overpayment credits; refunds
- Online payments from the parent portal with reconciliation
- Multi-currency (USD/ZWG) with rate capture
- Arrears management: aging, dunning schedules, reminders, holds (results/portal), payment promises
- Statements per family, per student; receipts and invoices as PDF
- Bank reconciliation, cash-up per cashier, daily takings, deposit slips
- GL posting, period close, fiscalisation (ZIMRA), tax
- Reporting: collections vs target, arrears by class, fee register, debtors ledger, cashier report, budget vs actual
- Petty cash, tuck shop/POS, uniform shop

## 10. Staff / HR
- Staff records, qualifications, contracts, TRN/ministry IDs
- Staff attendance, leave requests and approvals, cover
- Appraisal, CPD records
- Payroll integration
- Staff portal: payslips, leave, timetable

## 11. Boarding
- Hostels, dorms/rooms, beds, gender policy, house parents/wardens
- Boarder roll calls (evening, weekend), leave/exeat requests with parent approval, check-out/check-in
- Sanatorium visits, medication administration
- Visitor log, incidents
- Occupancy and boarding fee linkage

## 12. Transport
- Routes, stops, vehicles, drivers, riders, fees
- Daily transport attendance, GPS tracking (optional), parent notification

## 13. Library
- Catalogue (ISBN lookup), copies, barcodes, loans, returns, renewals, reservations, fines, inventory

## 14. Extracurricular, sport, clubs and events
- Club registration, teams, fixtures, results, attendance, event calendar with RSVP, trips with consent

## 15. Health and medical
- Records, immunisation, incidents, medication logs, nurse visit log, allergy alerts in registers

## 16. Documents and reporting
- Report cards, transcripts, letters (admission, transfer, fee reminder), class lists, registers, ID cards, certificates
- Ministry returns (Zimbabwe ED forms, enrolment stats), board pack
- Custom report builder, scheduled exports

## 17. Portals and mobile
- Parent, student, staff portals and native/PWA apps; push notifications; multi-child; offline read
- Self-service: contact updates, consent, absence reporting, payments, meeting bookings, documents

## 18. Calendar and events
- School calendar with categories, term dates, holidays, events, iCal feed, portal display

## 19. Learning (LMS-lite / integrations)
- Homework/assignments with submission, marking, feedback; resources; quizzes
- Integrations: Google Classroom, Microsoft Teams, Zoom, Moodle

## 20. Platform
- RBAC with fine-grained permissions and per-department scoping (HOD sees own department)
- Audit trail, data export, API, SSO, MFA
- Multi-campus / school groups with consolidated reporting
- Import wizards, data quality checks
- Workflow automation (rules: if absent 3 days → task), task management
- Dashboards per role with drill-down; early-warning analytics
- Localisation (language, currency, date), branding per school
- Offline-first for registers and receipting
- Backup, retention, GDPR/POPIA-style consent

## 21. Alumni and development
- Alumni records, giving, events

## 22. Inventory, assets, canteen
- Asset register, stock, tuck shop POS, meal plans
