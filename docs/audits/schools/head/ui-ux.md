# Head dashboard: UI/UX audit

Surface: the head's oversight screens under `app/schools/**`: overview (`schools-dashboard-content.tsx`), admissions, students and roll-up, guardians, record pages, attendance and follow-up, results (overview, sheets, moderation, publishing, class), homework, lessons and resources, goals, meetings, boarding (bed board, allocations, leave, welfare), messages, notices, reports. Audited from source and from `docs/screenshots/schools/the-roll/*`, `teaching/*`, `visual-pass-*/*`, `welfare-*`, `year-rollup-*`, `admissions-*`, `search-*`. Workflow companion: `workflows.md` in this folder.

Rules applied: the platform UX playbook, the design-system rules, the campus canvas law, screen contract and states doc, `.impeccable.md`, `SPEC.md`. Full rule digest and per-screen evidence in `../reference/backoffice-ui-ux-evidence.md`.

## 1. Verdict in one paragraph

The head's screens are built on the right skeleton where they use `PageChrome`, a band and `TableControls` (students, attendance, staff, boarding, library, transport, arrears), and the confirmation and reason copy in results moderation is exemplary. But the head meets four systemic problems on every visit. Screens name themselves two or three times (in-page heading, app bar, card header) and repeat their counts in chips, tabs and stat cards. The shipped sidebar is the wrong one: it drops sixteen working routes, shows a meaningless top-level "Whole school" item, and its only academic-setup entry redirects into the teacher portal. Seven screens ship the designer's rationale as product copy ("Every row is a dead end", "That was the fault this board was built to fix"). And the overview, the head's first screen, is a row-count page that shows zeros, six identical Remind buttons and a fee panel that never resolves. On a phone the results and attendance pages spend the entire first screen on chrome.

## Runtime check (14 September 2026)

Verified on the seeded St Marys tenant as the head (see `../reference/runtime-verification.md`). Confirmed at runtime: the shipped sidebar ("Whole school" top level, "Scheme of work" as the only academic-setup entry, no master-data links among 117 sidebar items); the overview's two "0%" ratios and six per-row Remind buttons; rationale cards rendering on homework, goals, arrears, notices and meetings; the results page at 390px with the table header below the fold; two search inputs on attendance. Corrected: the attendance page does have a bulk reminder; the overview does not.

## 2. Screen-by-screen

| Route | Component | Contract violations | Friction | Role awareness | Phone | Severity |
|---|---|---|---|---|---|---|
| `/schools` | `schools-dashboard-content.tsx` (1,247 lines) | `PageHeading` "School overview" plus bar "Schools"; band chips "Collected —" and "Owing —" beside stat cards that also say "—"; four stat cards repeat two chips; "0%" where the denominator is zero ("Present today 0 · 0% of the 0 registers in", "Beds occupied 0% · 0 of 0"); "0 out past their return date" as a count; `toLocaleString` ×9; fee panel skeleton visible after everything else loaded | Six rows each with its own Remind and no "Remind all"; day, term and year filters ignored by the fee panel; nothing says what to do first | No `useSchoolAccess`; Remind not gated | Not captured; tiles are `sm:grid-cols-4`, panels stack | P1 |
| `/schools/admissions` | `admissions-board-content.tsx` | `PageHeading` plus bar; "kanban" is a vertical list of stage groups; each row carries every allowed transition inline, up to six buttons; counts sentence duplicates group headers | Six presses to walk one applicant; no bulk decide; phone sheet stacks the primary above Cancel; DOB is a native `mm/dd/yyyy` input | Gated (approve vs edit split, good) | `MobileList.Row` everywhere | P1 |
| `/schools/students` | `students-list-content.tsx` | `PageChrome` (good); chips repeat tab counts; second Export in the DataTable toolbar; card header "Active students · 119 students · sorted by class" is a third statement; "Filter" opens a second filter surface; `Class —` blank beside `Year Form 1` under a "Form 1" group header; fee badges Paid, Partial, Overdue vs the ledger's Issued, Part paid; rows about 88px vs the canvas's 36/44 | Checkboxes render but `bulkActions` is never passed anywhere in `components/schools`; "Roll up the year" styled as an action but is a link | Gated | Two-line cards with chevron, but the card header and Columns/Export row push the first pupil to y≈420 | P1 |
| `/schools/students/class/[classId]` | `class-students-content.tsx` | Caption, band and tab all say "20 on the roll"; Class filter shows the class already in the URL; group header "Not in a class yet" over every row when the school has no streams | Class list print in the band is good | Gated | present | P1 |
| `/schools/students/roll-up` | `year-rollup-content.tsx` | Disabled bar primary "Roll 0 students up"; band chips all "—"; a warning alert that is explanation | Defaults ("Current term → The next one") do not produce a plan, so the first-run screen is dead; confirm without reason or undo | Not gated at page level | present | P1 |
| `/schools/guardians` | `guardians-content.tsx` | `PageHeading` plus caption "119 on file · 118 not invited" plus band "Not invited 118"; "Invite 99 to the portal" beside "118 not invited" with no explanation; three control rows; ACTIONS column clipped; PORTAL "Not invited" as plain text; LINKED STUDENTS as a bare "1"; phone card says "1 children"; surname-first here, first-name-first on students | Invite is bulk-only with no selection | Gated | cards | P1 |
| Record pages | `records/*-record-page.tsx` | `RecordPageShell` (compliant); student's bar primary is two print buttons; Fees tab links to `/schools/finance?invoice=` which the page does not read | | Gated | not captured | P1 |
| `/schools/attendance` | `register-oversight-content.tsx` (the documented exemplar) | Second search plus Search, Columns and Export inside the DataTable (two search inputs confirmed at runtime); card header "6 on the ladder"; explanatory "When the school was closed" paragraph; native date shows `09/14/2026`; "The week" card of five dashes; pagination on six rows | "Copy the missing list" and "Send all six a reminder" are good verbs | `RecordActions` gated | Band wraps, banner, five stacked filters, card header, second search with the button clipped, table header at y≈790 with "FORM TEACHE" cut. The worst phone screen in the set. | P1 |
| `/schools/attendance/follow-up` | `absence-follow-up-content.tsx` | Second search; "LAST AWAY Aug 31" not `31 August`; "RUNG HOME Not yet" as text; chips "To follow up 17" vs "Unexplained 75" unexplained | Ring a family is three clicks into a notice dialog titled "Ring home"; no call log without a send; no "Send to all 17" | Gated | six-column table at 390px | P1 |
| `/schools/results` | `results-overview-content.tsx` | `PageHeading` plus description plus bar; band chips and a six-tab strip with the same counts; card header with a rationale subtitle; four filters then a second search row; state words Entering, In review, Queried, Ready differ from the sheets page's Draft, Submitted, Sent back, Approved | "New mark sheet" as the office primary when the office's verb is chase, not create; pagination on an empty table | `CreateButton` gated | Title, two-line description, primary, chips over two rows, clipped tabs, four selects, card header, search, button, Columns/Export: the table header is not on the first screen | P1 |
| `/schools/results/sheets`, `/moderation`, `/publish` | `mark-sheets-content.tsx`, `moderation-queue-content.tsx`, `publishing-content.tsx` | Four lists of the same sheets; moderation has eight band chips including three window counts that belong to publishing; publishing has eight chips and a duplicate windows CRUD; status filter twice | Approve and send back with reason are done right; the HOD cannot see marks and verbs in one place without a dialog; no "publish all approved for Term 3" | `useSchoolAccess` used on moderation | none | P1 |
| `/schools/homework` | `homework-oversight-content.tsx` | `PageHeading`; chips and three stat cards with the same numbers and a subtitle each; five filters plus a second search row; right-rail cards "Every row is a dead end" and "Why the tiles ignore the filter" (`:638-660`) | Verbs "Who has not handed in" and "Nudge the teacher" are good | Gated | none | P0 (copy leak) |
| `/schools/goals` | `goals-oversight-content.tsx` | `PageHeading`; band and stat cards duplicate; rationale cards "The rows start from the roll", "No mark is not behind", "The missing half" (`:515-540`) | No per-class bulk target | `useSchoolAccess` used | none | P0 (copy leak) |
| `/schools/teaching/lessons`, `/resources` | `lesson-plans-content.tsx`, `resources-content.tsx` | `PageHeading`; explanatory paragraphs; cover dialog with its own paragraphs | Cover is a real office job buried in a lesson row | | present | P2 |
| `/schools/meetings` | `meetings-admin-content.tsx` | `PageChrome` (good); side card "Releasing a slot" with "Nobody is told automatically — ring them." (`:971-976`); ALL CAPS group headers | Book on a family's behalf is a dialog; print evening is good | `useSchoolAccess` used | none | P1 |
| `/schools/boarding`, `/allocations`, `/leave` | `bed-board-content.tsx`, `boarding-allocations-content.tsx`, `boarding-leave-content.tsx` | Band and five Title Case stat cards on the bed board and again on allocations; `PageChrome title="Boarding Management"`; raw enum filter options LEAVE and OUTING; a card subtitled "the other view" | Bed board and allocations are the same data | Gated | none | P1 |
| `/schools/boarding/welfare` | `welfare-content.tsx` | `PageChrome` with "Log a visit" (good); chips and three stat cards with the same numbers; three inline buttons per row ×119 with "Clear" as a red danger button; sentence repeating the chip | Consent per child is a six-field dialog ×119; no class-level "consent received for all of Form 5" | Gated | three one-up tiles, then rows with the red Clear under the thumb | P1 |
| `/schools/messages` | `office-inbox-content.tsx` | `PageHeading` plus description; assign dialog description is rationale | Reply in page; "End the conversation" confirm is good; no unread badge in nav | Gated | none | P1 |
| `/schools/notices` | `schools-notices-content.tsx` | `PageHeading` "School Notices"; side card "A notice cannot be recalled" with a paragraph of product rationale (`:576-579`); `toLocaleString` ×6 | No schedule, draft or recall, as the card admits | Gated | none | P0 (copy leak) |
| `/schools/reports` | `schools-reports-enhanced-content.tsx` (1,518 lines) | "School Reports" Title Case; "Outstanding 29,910" with no currency; "Avg enrollment 40 across 3 terms"; "Hostel occupancy 0.0% · 0 of 0 beds"; Title Case tabs and chart titles; second search under the chart; rationale cards; the ageing chart contradicts the finance page | Export in the band is good | `useSchoolAccess` used | none | P0 |

## 3. Screenshot findings

- **Overview.** Good: band chips link to their screens; "Registers still to come in" is a queue with a verb per row; ageing sparkbars. Wrong: named twice; "Collected —" beside tiles that say "—"; zero-denominator ratios as 0%; six Remind buttons; the fee panel still a skeleton; "0 out past their return date"; "Whole school" in the sidebar; a global "Create" item competing with every page's primary.
- **Students.** Good: bar title and primary; tabs with counts; identity column with avatar; mono admission numbers. Wrong: chips and tabs with the same counts; Export twice; the card header as a third restatement; CLASS "—" beside YEAR "Form 1"; 88px rows; fee badges in the wrong vocabulary; attendance % left-aligned.
- **Classes.** Two navigation rails plus the school sidebar; description line; chips and tabs duplicated; filters stacked with "New class" floating; a third control row; "Capacity -"; pagination for six rows; a 740px table in a 1440px window.
- **Guardians.** Two header buttons with mismatched counts (99 vs 118); three control rows; ACTIONS clipped; "1 children".
- **Attendance.** "Send all six a reminder" in the banner (good, and the overview lacks it); five-control filter row plus a second search row; native date in US order; "The week" card of dashes; the explanatory paragraph.
- **Absence follow-up.** Full-bleed table (good); two search boxes; "Aug 31"; "Not yet" as text; the only verb behind a menu.
- **Results.** Header, description, bar, chips, six-tab strip, card header and subtitle: four layers naming one thing; pagination on an empty table.
- **Timetable.** "No periods yet" with a real next step (good); three section-header buttons with the primary greyed; filters over two rows; nothing to click to place a lesson; the grid never appears.
- **Homework.** Right rail of rationale prose taller than the table.
- **Admissions form (desktop and phone).** Sensible sheet; DOB in US order; primary disabled at open with no requirement text; the phone footer stacks primary above Cancel.
- **Search.** ⌘K palette with grouped results, mono ids, a detail pane, keyboard hints: the best interaction in the module. Mixed-case labels ("mother", "active").
- **Welfare (desktop and phone).** Bar primary (good); three inline buttons per row with a red Clear; phone tiles one-up.
- **Year roll-up.** Greyed primary "Roll 0 students up" as the most prominent element; chips all "—"; "Choose the two terms" although the selects have defaults; at 390px the bar title truncates to "Ro…".
- **Results, attendance, teachers and guardians on a phone.** Between 600 and 844px of chrome before the first row.

## 4. Rule violations that recur

| Rule | Violation | Count |
|---|---|---|
| A page is named once | In-page `PageHeading` plus bar title | 25 pages across the module |
| One search per screen | `TableSearch` above plus the DataTable's own search row | 10 |
| Never the same fact twice | Chips duplicated by tabs or stat cards | 14 |
| One primary in the bar | Multiple primaries or primary in the page | 12 |
| Row verbs in a menu | Inline stacks clipped | 9 |
| Strip explanatory copy | Rationale cards; 72 muted paragraphs | 8 cards |
| Table becomes cards below `md` | No mobile renderer | 27 content screens |
| Dates as `3 June 2026` | Native `type="date"` | 31 inputs in 18 files |
| Money and dates through the formatter | `toLocaleString`, `toFixed` | 56 sites |
| Sentence case | Title Case and ALL CAPS | 10 |
| One status vocabulary | Results states named two ways; fee statuses two ways; bare text states | 6 |
| Bulk actions where the job is bulk | None anywhere | all tables |
| Ratios with zero denominators render "—" | 0% | 5 |
| Route-level loading, error, not-found | None under `app/schools` | all |
| Consistent name order | Surname-first on some lists, first-name-first on others | 8 |

## 5. Suggested edits

**P0**
1. Remove rationale cards: `homework-oversight-content.tsx:638-660`, `goals-oversight-content.tsx:515-540`, `reports-arrears-content.tsx:797-812`, `schools-reports-enhanced-content.tsx:1090-1100`, `schools-notices-content.tsx:576-582`, `meetings-admin-content.tsx:971-980`, `register-oversight-content.tsx:844-858`.
2. Fix the sidebar: generate the SCHOOLS workspace sections from `lib/navigation.ts:280-398` (delete or derive `lib/workspaces.ts:363-484`); remove "Whole school" as a top-level item and the "Scheme of work" redirect.
3. One ageing computation and component across the overview, reports and finance.
4. Row verbs to `layout="menu"` on admissions (`admissions-board-content.tsx:484`) and welfare (`welfare-content.tsx:450`).
5. Money chip through `formatSchoolMoney` (`schools-reports-enhanced-content.tsx:715`).

**P1**
6. Replace `PageHeading` with `PageChrome` on the 25 pages; move each create verb into the bar; delete captions that repeat chips.
7. One search per screen; delete the duplicate stat-card rows; hide pagination when there is one page.
8. Design-system date picker at 31 sites; formatter at 56 sites; sentence-case sweep; pluralisation fix on the guardians phone card.
9. One results vocabulary (Draft, Submitted, Sent back, Approved, Published) on the overview tabs and chips, then one sheets list with those as views.
10. Bulk actions on the queues where the job is bulk: students (invite, move class, archive), guardians (invite), follow-up (send to all), welfare (consent received).
11. Gate page and band verbs with `useSchoolAccess().can()` (overview Remind, roll-up primary, meetings Release) and hide bands the persona has no `view` grant on.
12. Reason capture and undo for student archive, teacher delete, free the bed, roll-up.
13. Route-level `loading.tsx`, `error.tsx`, `not-found.tsx` under `app/schools` using `TableRowsSkeleton`, `LoadError`, `RecordNotFound`.
14. Zero-denominator ratios render "—"; overview fee panel gets a `NothingYet` instead of a permanent skeleton; "Remind the 6" replaces six buttons.
15. Absence follow-up: "Log a call" (outcome and note), "Send a notice", "Send to all 17"; "Rung home" as a toned badge with the date.
16. Admissions: one likely next verb inline (Offer, Accepted, Enrol) and the rest in a menu; consider the cookbook `KanbanBoard` with "move to…" per card.
17. Record page primary: "Take payment" when there is a balance, otherwise "Edit details"; documents in the overflow; fix the dead fees deep link.
18. Guardians: "Invite the 99 with an email" or make the chip match the button.

**P2**
19. One name order via a `PersonName` helper; timetable grid with cell-click placement; collapse duplicate CRUD (windows, subjects, sheet lists); a "Back to School Operations" on master-data pages.

## 6. Proposed restructuring

- **Sidebar from one source**, in the order of the school day: Overview · Roll (Students, Applications, Guardians, Roll up the year, Import) · Attendance (Registers, Absence follow-up) · Boarding · Teaching (Timetable, Homework, Lesson plans, Resources, Targets) · Results (Sheets, Moderation, Publishing) · Fees · People (Teachers, Support staff, Assignments) · Communication (Messages, Notices, Parent meetings, Calendar) · Services (Library, Transport) · Setup · Reports and documents.
- **Persona-aware rail and landing**: hide bands with no `view` grant; the persona's own band first; `preferredHomeHref` per persona (head `/schools`, HOD `/schools/results/moderation`, registrar `/schools/students`, warden `/schools/boarding`).
- **One screen per fact**: a single sheets list with state views; one arrears surface that the overview and dashboard link to; one publishing-windows surface in setup; bed board and allocations merged.
- **Name each screen once**: app-bar title equals nav label equals the thing the page is.
- **Pastoral band** for welfare, consents and later behaviour, outside Boarding.

## 7. Proposed new UI

**Head's term dashboard (`/schools`)**
- Hero: Present today, percentage with a ten-day sparkline and delta vs last week, tinted by the school's threshold.
- Queue row (two-up on phone): Registers still to come in with "Remind the 2"; Unexplained absences of two days or more; Mark sheets waiting on moderation; Publish window closes in N days.
- Second row: Applications to decide; Offers lapsing this week; Boarders out tonight; Children with an allergy and no consent (danger tone); Homework overdue; Pupils with no target.
- Queues: "Waiting on somebody" (keep); "This week" (meetings, notices sent and read %, library late); Attendance by year group with sparklines; Fees this term as three figures and the one ageing strip.
- Missing today and worth adding: attendance trend, staff absence and cover today, enrolment vs capacity per class, subject performance vs target (HOD view), unread parent messages, a calendar strip, an activity feed of governance actions.

**Moderation workspace for the HOD**: sheet list on the left with state, marks grid on the right with distribution, approve and send back with reason in the same view, no dialog.

**Interaction patterns to add across the head's screens**: bulk-action bar; ⌘K verbs and pages ("Open a register for Form 3", "New application"); URL-synced filters and saved views; an activity timeline on student, guardian and sheet records; "Log a call"; record peek on the guardian in a student row; inline quick-edit for one-field changes (form teacher, pass mark); a date stepper in the band (◀ Today ▶); requirement banners as the only disabled state; undo toasts for reversible writes; a phone shell per screen with filters in a sheet.

## 8. Accessibility

- Clipped inline verbs are unreachable by keyboard focus that lands off-screen; the menu fixes both.
- The greyed disabled bar primary on roll-up has a `title`, which screen readers do not announce; render the requirement as text.
- Native date inputs announce in the browser locale; the picker fixes it.
- Colour-only states (red Clear at rest, red collected bars) need an icon or word; canonical badges carry both.
- Group headers in ALL CAPS are read letter by letter by some screen readers; sentence case with `text-transform` is safer.
