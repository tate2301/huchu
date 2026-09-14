# Admin dashboard: UI/UX audit

Surface: the setup and master-data screens: `app/management/master-data/schools/{years,periods,classes,subjects,grading,identity}` with their `MasterDataShell`, `app/schools/{calendar,timetable,teachers,teachers/assignments,staff,imports,documents,transport,library,library/loans,boarding/hostels,notices,messages}`, and the components under `components/schools/{academics,classes,subjects,teachers,staff,timetable,imports,documents,transport,library,boarding,notices,messages}`. Audited from source and from `docs/screenshots/schools/{records-desktop,the-roll/03-classes,the-roll/04-teachers,teacher-hr-*,imports-*,visual-pass-*/01-timetable,visual-pass-*/01-teachers}`. Workflow companion: `workflows.md` in this folder.

Rules applied: the platform UX playbook, the design-system rules, the campus canvas law, screen contract and states doc, `.impeccable.md`, `SPEC.md`. Evidence with line numbers in `../reference/backoffice-ui-ux-evidence.md` §2.

## 1. Verdict in one paragraph

The setup screens work but are hard to reach and hard to scan. The six master-data pages sit behind two navigation rails and a description line, then repeat their counts in chips and tabs, stack their filters vertically with the create button floating between them, and add a third control row for the table's own search. The timetable, the one screen that should be a grid, never shows one: three header buttons with the primary greyed, filters over two rows, and an empty state that explains what a lesson is. Teachers and guardians lists clip their actions column off the right edge. Title Case and ALL CAPS labels appear on documents, notices, boarding and years. Native date inputs render in the browser's locale on every date field. The imports wizard has the best copy in the module and then grows down the page instead of advancing. The identity settings page is the one place that gates its controls by role and explains it; nothing else copied it.

## 2. Screen-by-screen

| Route | Component | Contract violations | Friction | Role awareness | Phone | Severity |
|---|---|---|---|---|---|---|
| `/management/master-data/schools/years` | `schools-years-content.tsx` → `schools-calendar-content.tsx`, `school-days-content.tsx` | `MasterDataShell` title plus description; two `CreateButton`s per tab; "Holidays & Events" ampersand and Title Case | Terms one at a time; "Make current" with no confirm | `RecordActions` gated | renderer present | P1 |
| `/management/master-data/schools/classes` | `schools-classes-content.tsx` | `PageHeading` plus description; chips and tabs both show Classes 6 / Streams 0; filters stacked, "New class" floating, then a third row of Search, Search, Columns, Export; Capacity renders "-" not "—" | Streams as a second tab rather than rows under their class | gated | present | P1 |
| `/management/master-data/schools/subjects` | `schools-subjects-content.tsx` | Same shape; two primaries "Add the standard subjects" and "New subject" | Pass mark 50 with no %; Classes count not a link | gated | present | P1 |
| `/management/master-data/schools/periods` | `school-day-content.tsx` | Same shape; `?view=rooms` deep link (good) | N dialogs for N periods; no "generate periods" | gated | present | P2 |
| `/management/master-data/schools/grading` | `grading-content.tsx` | Same shape; duplicates the windows table owned by `/schools/results/publish` | "Make default" with no confirm | gated | present | P2 |
| `/management/master-data/schools/identity` | `identity-settings-content.tsx`, `school-custom-fields-panel.tsx` | Settings shell (good); "Read-only for your role" alert is the pattern the rest should copy; explanatory paragraph under every control | Save bar is not the design-system save bar; no dirty indicator | gated (the only one) | not checked | P2 |
| `/schools/calendar` | `school-calendar-page-content.tsx` → `school-days-content.tsx` | `PageChrome` (good); two `CreateButton`s; native date inputs | Edit is delete and recreate | gated | present | P2 |
| `/schools/staff` | `school-staff-content.tsx` | `PageChrome`, band, `TableControls` (compliant); HR codes mapped to school words (good) | "End employment" only in the row menu; no bulk | gated | no renderer, five-column table at 390px | P1 |
| `/schools/teachers` | `schools-teachers-content.tsx` (1,027 lines) | `PageHeading` plus caption duplicating the band; primary in page; "Add Subject" Title Case; Title Case tabs; three control rows; Actions column clipped ("ACTIO", "…" cut); "Find the employee" repeated on all eight rows | Three tabs, three deletes; subjects CRUD here and in master data | gated | renderer ×3 (good) | P1 |
| `/schools/teachers/assignments` | `teacher-assignments-content.tsx` | `PageChrome` (good); "Take it off them" copy is right | Bulk allocate lives on the teachers page instead | gated | no renderer | P2 |
| `/schools/timetable` | `schools-timetable-content.tsx` (925 lines) | `PageHeading` plus a two-line description; three buttons in a section header with the primary greyed; filters across two rows with the search orphaned; empty-state prose defining a lesson | Placing a lesson is a sheet with six pickers; no click-a-cell, no drag; clashes are a chip | `useSchoolAccess` used | at 390px the warning banner is 190px, then five stacked selects; grid below the fold | P1 |
| `/schools/imports` | `schools-import-content.tsx` | `PageHeading` plus description; step 3 re-renders step 2's mapping above the results; "Earlier imports" always under the wizard with a pager for one row | Column mapping and rejection copy are the best in the module; Undo exists here and nowhere else | `useSchoolAccess` used | "Check the columns" heading wraps to three lines beside a paragraph | P2 |
| `/schools/documents` | `school-documents-content.tsx` (938 lines) | "School Documents", "Report Cards / Fee Invoices / Class Lists / Attendance Registers", "Select Student", "Student No", "Invoice No" all Title Case; raw enum status printed | Pupil → preview → print is three clicks; batch by class only for lists and registers; four of eight sources missing | not gated (fine) | no renderer; fixed-width preview | P1 |
| `/schools/transport` | `transport-content.tsx` (1,389 lines) | `PageChrome` (good); four `variant="primary"` buttons; three band `CreateButton`s; six explanatory paragraphs | "Put a child on the bus" is two clicks and four selects; the morning register is a good pattern | gated | no renderer | P1 |
| `/schools/library`, `/library/loans` | `library-content.tsx`, `library-loans-content.tsx` | `PageChrome` (good); both register the app-bar title "Library"; two primaries each | Lending is three pickers; no barcode or accession quick entry; "Fines if back today" chip is good | gated | no renderer | P1 |
| `/schools/boarding/hostels` | `boarding-hostels-content.tsx`, `hostel-rooms-panel.tsx` | Title flips between "Hostels" and the hostel's name on one route; Rooms and Beds sub-tabs plus a Properties card plus a bed-board card: three tables on one view; two primaries | Beds per room dialog; no "add 24 beds numbered 1 to 24" | gated | one renderer hit | P1 |
| `/schools/notices` | `schools-notices-content.tsx` | "School Notices" Title Case; side card "A notice cannot be recalled" (`:576-579`) rendered as UI; `toLocaleString` ×6 | No schedule, draft or recall | gated | none | P0 (copy leak) |
| `/schools/messages` | `office-inbox-content.tsx` | `PageHeading` plus description; assign-dialog description is rationale | Reply in page; "End the conversation" confirm is good; no unread badge in nav | gated | none: an inbox with no phone shell | P1 |

## 3. Screenshot findings

- **Subjects list (records-desktop).** Four levels of navigation (school sidebar, Settings rail, Master Data rail, page tabs) before the table, a description line, chips, stacked filters, a floating primary and a third control row. Mono codes as links and Core/Elective badges are good.
- **Classes.** Two navigation rails plus the sidebar; "The year-group ladder and the streams inside each one." as a description; chips and tabs duplicated; "New class" floating at the right of the second filter; a third control row; "Capacity -"; pagination for six rows; a 740px table in a 1440px window.
- **Teachers and teacher-HR.** Identity cell with mono id and email (good). Heading, caption and bar title; primary in the page; "Add Subject" in Title Case; three control rows; "Find the employee" eight times; ACTIONS clipped at x=1440.
- **Timetable (desktop and phone).** "No periods yet" banner with a real next step (good). Two-line description; three section-header buttons with the primary greyed; filters split over two rows with the search orphaned; nothing to click to place a lesson; on the phone, description, three buttons, a 190px banner with a wrapped button, then five stacked selects; no grid.
- **Imports (desktop and phone).** Column chips, "did you mean", and "could be 3 April or 4 March — write it as YYYY-MM-DD" are the best copy in the module. Step 3 shows step 2's form again; "Earlier imports" always under the wizard; a dry run's "Not imported" badge reads as failure. On the phone the card header wraps to three lines beside a five-line paragraph.
- **Teachers on a phone.** Cards read well ("TCH-001 · Mathematics · No HR record · HOD · Class teacher"), but heading, caption, full-width primary, chips, band buttons, clipped tabs, two selects, search, Search, Columns/Export precede the first card at y≈610.

## 4. Rule violations that recur

| Rule | Violation | Where |
|---|---|---|
| A page is named once | `MasterDataShell` or `PageHeading` plus the bar title | all six master-data pages, teachers, timetable, imports, documents, notices, messages |
| One primary in the bar | Two or more primaries; primary floating in the page | years, subjects, calendar, timetable, transport, library, loans, hostels |
| One control row, one search | Stacked filters, floating create, a third row | classes, subjects, periods, grading, teachers |
| Never the same fact twice | Chips duplicating tabs | classes, subjects, teachers |
| Row verbs in a menu | Clipped actions column; identical per-row button | teachers |
| Sentence case | Title Case and ALL CAPS | documents, notices, teachers, years, boarding |
| Dates as `3 June 2026` | Native date inputs | calendar, timetable, imports, documents |
| Strip explanatory copy | Descriptions under every title; paragraphs under controls; prose empty states | most setup screens |
| One table per view | Three tables on the hostel page | hostels |
| Distinct app-bar titles | "Library" twice | library, loans |
| Table becomes cards below `md` | No renderer | staff, assignments, documents, transport, library, loans, notices, messages |
| Progressive disclosure | Wizard grows instead of advancing | imports |

## 5. Suggested edits

**P0**
1. Remove the rationale card from notices (`schools-notices-content.tsx:576-582`).
2. Bring the Setup band into the school sidebar (see workflows B1) so these screens are reachable in one rail.

**P1**
3. Replace `MasterDataShell` descriptions and `PageHeading`s with `PageChrome` (pass `description={undefined}` in `app/management/master-data/schools/*/page.tsx` as the minimum); move the create verb into the bar; delete captions that repeat chips.
4. Wrap filters in `TableControls` with `actions=` and remove the DataTable's internal search on classes, subjects, periods, grading and teachers, so each screen has one control row and one search.
5. Teachers: fold HR RECORD into a badge that is the link; move "Find the employee" into the row menu or a band action "Link 8 teachers to HR"; `layout="menu"` on the actions; hide PROFILE FLAGS by default.
6. Timetable: bar primary "Add lesson"; band actions "Build the week" and "Copy forward"; one control row; the grid is the surface with `+` targets in empty cells that open the lesson sheet pre-filled; clashes as red cells; hide "Build timetable" when there are no periods and let the banner carry the requirement.
7. Title Case sweep: `school-documents-content.tsx:687, 770-773, 782, 267-272, 406-411`; `schools-notices-content.tsx:369`; `boarding-allocations-content.tsx:258, 294-298, 338, 388`; `boarding-leave-content.tsx:214-215, 223`; `schools-teachers-content.tsx:660, 715`; `schools-years-content.tsx:78, 90`.
8. Native dates to the design-system picker (sheet on phone) across the 18 files.
9. Library loans: app-bar title "Library loans".
10. Hostels: list and record on separate routes; one table per tab.
11. Phone renderers for staff, assignments, documents, transport, library, loans, notices, messages.
12. Explanatory paragraphs: keep only those that carry a changing number, as a band chip.

**P2**
13. Imports: collapse completed steps to a one-line summary with "Change"; move "Earlier imports" behind a tab; label a dry run "Checked, nothing written".
14. Periods: "Generate periods" (start, length, count, breaks).
15. Beds: "Add N beds numbered from X".
16. Terms: "Add three terms" template when creating a year.
17. Identity settings: design-system save bar with a dirty indicator; copy its role alert pattern to every setup page.

## 6. Proposed restructuring

- **Setup as one band in the school shell** (`/schools/setup/*`): Years and terms, Calendar, Classes and streams, Subjects, School day and rooms, Grading and publish windows, Records and identity, Fee structures (link), Staff (link). One rail, `PageChrome` titles, no descriptions.
- **Master data ordered as imports need it**, with a readiness strip at the top of the band's landing page (see §7).
- **One home per entity**: subjects, publish windows and assignments each on one screen; the other pages link.
- **Teachers page split**: a Teachers list (profiles, HR link status, portal status) and an Allocation screen (bulk allocation, assignments); subjects go to Setup.
- **Accounts screen** under People: portal status per person, invite, resend, reset, disable.
- **Documents becomes a document centre** with all eight sources, batch by class, template per school, print queue.

## 7. Proposed new UI

**Setup readiness (`/schools/setup`)**
- Hero: Setup completeness, "7 of 10 steps", with the checklist in import order; done rows collapse; each row links to its screen.
- KPIs (two-up on phone): Teachers without an HR record; Teachers without a portal sign-in; Classes without a form teacher; Subjects with no teacher allocated.
- Queues: "Not yet set up" (rooms, periods, windows); "Data quality" (pupils not in a class, guardians without a phone, duplicate applications); "Imports" (last run, rejected rows, Undo).
- A school-year timeline strip: terms, holidays and publish windows on one line.

**Timetable builder**: the week grid as the working surface; class, teacher and room views; cell click to place, drag to move, clash highlighting; "Build the week" preview showing what will be placed and what cannot; exam mode later.

**Account administration**: a table of people with portal status (Invited, Claimed, Never signed in, Disabled), channel (email, phone), last sign-in; bulk invite by class with a delivery report; per-row resend and reset.

**Interaction patterns to add**: bulk actions (invite, link to HR, activate structures); ⌘K verbs ("New class", "Open the timetable for Form 3"); inline quick-edit for one-field changes (form teacher, capacity, pass mark); URL-synced filters; undo toasts for archive and delete; requirement banners as the only disabled state; route-level `loading.tsx`, `error.tsx`, `not-found.tsx`.

## 8. Accessibility

- Clipped actions on teachers are unreachable by keyboard; the menu fixes it.
- Native date inputs announce in the browser locale and render US order; the picker fixes format and announcement.
- Title Case and ALL CAPS group headers are read letter by letter by some screen readers.
- Icon-only buttons in the import stepper and the timetable grid need names; the greyed primary needs its requirement as visible text, not a `title`.
- The identity page's read-only alert is the right pattern: it tells the reader why controls are inert and who can change them.
