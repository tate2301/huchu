# Staff (teacher) portal: UI/UX audit

Surface: `app/portal/teacher/**`, shell `components/schools/portal/teacher/teacher-portal-shell.tsx` (wraps the back-office `AppShell` with a bespoke class rail, two-line bar and tab strip), screens under `components/schools/portal/teacher/`, styles `teacher-portal.css`. Audited from source and from `docs/screenshots/schools/teacher-portal-desktop/*` (1440×900) and `teacher-portal-tablet/*` (1024×768). Workflow companion: `workflows.md` in this folder.

Rules applied: the portal build contract and `teacher.html` (SHL·07 rail), the platform UX playbook, `11-campus-states-and-motion.md`, `.impeccable.md`, `SPEC.md`.

## 1. Verdict in one paragraph

The staff portal is the most usable of the three and the one whose shell is closest to the contract: class rail above the navigation, Daily work / More / Account groups, an honest online chip, and screens that use the design system's skeletons, empties and saving overlays. Its problems are in the two screens teachers live in. The register spends 110px per pupil on a phone and has no "save and next class", no period context and no confirmation, and its "Everyone absent" sits beside "Undo" with no guard. Mark entry has no keyboard flow, no live grade, no class stats and no way to send marks on. The bell carries the papers-to-mark count, which also appears on the Marks tab, the rail and a Today tile, so "20" shows four times while unread parent messages show nowhere. Messages cannot be started. Several screens carry a lede sentence explaining a limitation to the user, and the Settings screen renders inert rows stamped "Not yet available".

## Runtime check (14 September 2026)

Verified on the seeded St Marys tenant as a TEACHER (see `../reference/runtime-verification.md`). Confirmed at runtime: the register with a four-way control, a "Not marked" badge on every row, a US-format date input and no submit; four "Not yet available" rows on Settings; no way to start a conversation on Messages. Note: the stale "Parent messaging is not built" sentence sits on the Mark publishing panel, not the default Notifications panel.

## 2. Contract parity by screen

| Screen | Prototype promises | Code renders | Gap |
|---|---|---|---|
| Shell | Bell = unread parent messages → inbox; sign out → shared-device modal; fullscreen; offline toggle and banner; class rows show room | Bell → Messages but badge = `papersToMark` (`teacher-portal-shell.tsx:271-277`); sign out is a GET to `/api/auth/signout` (`:250`); online chip only; class rows show code and size | P1 |
| Sign in | Staff ID plus password, shared classroom tablet mode, forgot password, ask IT | Shared email and password form, no forgot link | P1 |
| Today | Lessons rail with Mark attendance CTA; Up next with last-taken; Papers to mark; Parent messages card; This week | All except the Parent messages card; "Set new homework" links to the Homework page rather than opening the dialog (`teacher-today-content.tsx:100`) | P2 |
| Attendance | Crumb with day, period, time; P/A/L three-way toggle; Save & go to next class with confirm and SMS note | Date input, no period; four-way segmented control incl. Excused; "Save the register" that stays; no confirm; no submit (see workflows B1) | P1 |
| Enter marks | Out-of editor; Done / Average / Top / Lowest pills; live percent and grade; Tab and Enter hints; Send to parents | Assessment select; percent beside each input (`teacher-marks-screen.tsx:318`); absent flag; blanks-only view; `aria-invalid` on over-max with no visible error; no grade, stats, keyboard or publish | P1 |
| Marks book | One column per assessment; inline edit; add column; chips; CSV | Continuous / Exam / Term mark / Grade per pupil; "Send to the result sheet" disabled with a named reason (good); grade renders as an unlabeled colour square in the capture | P2 |
| Messages | Split inbox and thread; broadcast to class; quick replies; attach; send later | Single-column list and thread toggle; reply only; "Parents start them from their own portal" (`teacher-messages-screen.tsx:261`) | P0 (contract's "realtime chat requirement") |
| Timetable | Week nav; cell modal with Mark attendance and Open plan; cover lesson; legend | Week nav; cell with both buttons; "Hide free periods" and "Lay out this week"; no legend; skeleton does not mirror the grid | P2 |
| Lesson plans | Drawer; copy last week; new plan | Dialog; copy with confirm; "Lay out this week" from the scheme (beyond prototype); "Every lesson planned" pill shows on 0 of 0 | P2 |
| Homework | Remind unsubmitted; attachments; multi-class chips; rubric | Progress bars; board with per-pupil mark; single class select; no remind; lede sentence | P2 |
| Shared files | Upload | Links only, with the limitation stated in the lede | P2 |
| Reports | Four tiles with deltas; charts on DS defaults; export PDF | Tiles; a raw polyline with labels dumped as run-on text; no export; "Homework handed in —" tile | P2 |
| Meetings | Accept and decline bookings; iCal | Open an evening and release (both 403 for TEACHER, see workflows B2); calendar with no selectable days when empty; explanatory paragraph | P2 |
| Profile | Edit, change password, qualifications | Read-only with Settings link; "STAFF CODE" label wraps on tablet | P2 |
| Settings | Five sections with real controls | Five sections with a rail; four rows stamped "Not yet available" | P2 |
| Help | Guides and FAQ | Present; FAQ answer for forgotten password points nowhere | P2 |

## 3. Screenshot findings

- **Today.** "20" on the bell, the Marks tab, the rail's Enter marks and the Papers to mark tile at once. Four slashed zeros ("0 lessons today", "0 periods", "REGISTERS UNMARKED 0", "HOMEWORK OPEN 0"). The "No periods are set up" empty card is 280px tall inside a card that already has a title. On tablet the three This week tiles wrap 2+1.
- **Attendance.** Twenty rows each carrying a "Not marked" badge and an empty segmented control, stating the state twice per row. Date field shows `09/07/2026` (browser locale, US order). No period or time context. The sticky save bar is below twenty rows on desktop.
- **Enter marks.** Empty state only, sending the teacher to the office's Assessments screen; no "Create an assessment" verb even though the API allows TEACHER to create.
- **Marks book.** Clean table with mono right-aligned percentages; the grade column renders as unlabeled 12px colour squares; the tone thresholds (70 green, 50 amber) are not the school's band scheme.
- **Timetable and Lessons.** Empty card with a long explanatory sentence; "Every lesson planned" green pill next to "0 of 0".
- **Homework and Files.** Lede sentence, filter row, centred empty state; the verb appears twice.
- **Meetings.** Calendar with no selectable days, a paragraph, "0 this month / 0 of 0 this month" in slashed zeros.
- **Reports.** Good stat band; the attendance chart has no axes or grid and its labels run on as text.
- **Settings.** Rail and panel work; four "Not yet available" chips.
- **Tablet.** Rail still open at 250px; nothing breaks, nothing is tablet-specific (no larger targets, `SegmentedControl size="sm"` on the register).

## 4. Rule violations that recur

| Rule | Violation | Where |
|---|---|---|
| Never the same fact twice | "20" ×4; "Not marked" badge plus empty control per row | shell, register |
| A verb is one tap | Set homework from Today is two | today |
| Destructive under the thumb confirms | "Everyone absent" beside "Undo" with no confirm | register |
| Hide invalid actions | Four "Not yet available" rows | settings |
| No explanatory copy | Ledes on Files, Homework, Meetings, Settings ("Nothing behind these yet") | four screens |
| Strips run to the edge and snap | `.te-tabs` stops 22px short (`teacher-portal.css:247-254`) | shell |
| Skeletons mirror the real layout | `CardsSkeleton count=6 columns=3` for a five-day grid | timetable, lessons |
| Charts on DS defaults | Raw polyline | reports |
| Sub-screen state in the URL | Thread state is component state; Back leaves the portal | messages |
| Locale | Native date input renders in browser locale | register |

## 5. Suggested edits

1. **Shell.** Bell badge = unread parent messages (add `unread` to the `me/messages` summary or the day payload); papers stay on the Marks tab only. Replace the sign-out GET with a confirm dialog that calls `signOut({ callbackUrl })` and mentions unsaved drafts. Run `.te-tabs` edge to edge with scroll snap. Below `md` render a five-item bottom tab bar (Today, Attendance, Marks, Messages, More) instead of the sidebar sheet, and put the class picker behind the bar title. Add the offline banner strip under the bar when offline.
2. **Today.** Open the Set-homework dialog directly (`?new=1` honoured by the Homework screen); add a "Parent messages · N new" card; suppress a This week tile whose numerator and denominator are both zero.
3. **Register.** 56px rows: avatar, one-line name, mono id, a three-way P/A/L toggle at 44px tall; Excused behind a long-press or a per-row menu; unmarked rows show an empty toggle and no badge. Period and time in the header when the register is per lesson; "Change day" as a ghost button. "Everyone absent" behind a confirm. Sticky bar with counts and "Save & next class →" that confirms (counts, unmarked handling, "Parents of N absent pupils will be texted" once notifications exist) and advances to the next lesson. Add Submit (workflows B1).
4. **Enter marks.** Enter moves to the next input, Tab hint in the footer; live grade from the class's band scheme; per-row inline error on over-max; stats pills (done, average, top, lowest); "Send to parents" that publishes when permitted or hands off to the HOD with a named refusal; "Create an assessment" for teachers who may.
5. **Marks book.** Assessment columns from `/api/v2/schools/assessments?classSubjectId=` with inline edit and "Add an assessment"; render the grade code as text, not a swatch; CSV export.
6. **Messages.** "Start a conversation" (pick pupil, then guardians, subject, body) and "Send to whole class" (class chips, preview, count) on the existing thread API; `?thread=` in the URL; split layout at 60rem and above; quick-reply chips.
7. **Reports.** DS chart primitives (dashed grid, muted 11px axis labels, canonical colours); hide tiles with a zero denominator; add Export PDF through the documents pipeline.
8. **Settings.** Hide "Not yet available" rows or collapse them into one "Coming" note.
9. **Empty states.** Prefer `NothingYet` with the verb when the teacher can act, else name who can using `whoCan()`.
10. **Login.** "Staff ID or email" label, forgot-password link, shared-device checkbox once S-6.59 exists.

## 6. Proposed restructuring

- **Rail groups stay as the prototype draws them**, with an unread badge on Messages and a "to submit" count on Attendance.
- **Enter marks and Marks book merge** into one gradebook with a column picker once custom columns (S-6.44) land; until then, link them both ways.
- **Department group for HODs** (moderation queue, scheme-of-work editor) added to the rail when the profile has `isHod`, so HODs have a portal home.
- **Phone layout**: bottom tabs and a class picker sheet; the 220px rail is desktop and tablet chrome only.

## 7. Proposed new UI

- **Register capture redesign** as in §5 item 3, with an offline queue ("Saved on this tablet · sends when online") once S-8.1 lands. This is the screen the marketing site promises works offline.
- **Result-sheet status strip** on the Marks book: Draft → Submitted → Sent back (with the HOD's note) → Approved → Published, with the action the teacher can take next.
- **Messages split view** with inbox, thread, broadcast sheet and quick replies.
- **Today's Parent messages card** and a notification centre shared with the other portals (rows deep-link; preferences by event and channel).
- **Cover and absence card** on Today when the teacher is covering or being covered, from `SchoolCoverAssignment`.
- **Comment bank picker** in the Marks book remarks cell.

## 8. Accessibility and locale

- The segmented register control needs a roving tabindex and visible focus; targets at `size="sm"` are below 44px on tablet.
- Error text for over-max marks must be visible, not only `aria-invalid`.
- Replace the native date input with the design system picker (sheet on phone) and pin the display format to `3 June 2026`.
- Name the icon-only rail toggle and the bell, and include the count in the bell's label.
