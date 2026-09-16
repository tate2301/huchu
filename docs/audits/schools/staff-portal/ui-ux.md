# Staff (teacher) portal: UI/UX audit

Surface: `app/portal/teacher/**`, shell `components/schools/portal/teacher/teacher-portal-shell.tsx` (wraps the back-office `AppShell` with a bespoke class rail, two-line bar and tab strip), screens under `components/schools/portal/teacher/`, styles `teacher-portal.css`. Audited from source and from `docs/screenshots/schools/teacher-portal-desktop/*` (1440×900) and `teacher-portal-tablet/*` (1024×768). Workflow companion: `workflows.md` in this folder.

Rules applied: the portal build contract and `teacher.html` (SHL·07 rail), the platform UX playbook, `11-campus-states-and-motion.md`, `.impeccable.md`, `SPEC.md`.

## 1. Verdict in one paragraph

The staff portal is the most usable of the three and the one whose shell is closest to the contract: class rail above the navigation, Daily work / More / Account groups, an honest online chip, and screens that use the design system's skeletons, empties and saving overlays. Its problems are in the two screens teachers live in. The register spends 110px per pupil on a phone and has no "save and next class", no period context and no confirmation, and its "Everyone absent" sits beside "Undo" with no guard. Mark entry has no keyboard flow, no live grade, no class stats and no way to send marks on. The bell carries the papers-to-mark count, which also appears on the Marks tab, the rail and a Today tile, so "20" shows four times while unread parent messages show nowhere. Messages cannot be started. Several screens carry a lede sentence explaining a limitation to the user, and the Settings screen renders inert rows stamped "Not yet available". Since this was written both of those screens have been rebuilt, the bell counts what it opens, the ledes and the eleven inert rows are gone, and Messages can be started and broadcast. What is still as described: no upload on Shared files, no export on Reports, no assessment columns in the Marks book, skeletons that do not mirror the timetable grid, and a sign-in with no way back in for somebody who has forgotten their password.

## Runtime check (14 September 2026)

Verified on the seeded St Marys tenant as a TEACHER (see `../reference/runtime-verification.md`). Confirmed at runtime: the register with a four-way control, a "Not marked" badge on every row, a US-format date input and no submit; four "Not yet available" rows on Settings; no way to start a conversation on Messages. Note: the stale "Parent messaging is not built" sentence sits on the Mark publishing panel, not the default Notifications panel.

Revised on 15 September 2026, after the eighteen commits that implemented against this audit. A finding that is now closed keeps its description and gains a sentence saying what closed it; a finding this audit got wrong says so and gives the true position; everything else stands as written.

## 2. Contract parity by screen

| Screen | Prototype promises | Code renders | Gap |
|---|---|---|---|
| Shell | Bell = unread parent messages → inbox; sign out → shared-device modal; fullscreen; offline toggle and banner; class rows show room | Bell → Messages but badge = `papersToMark` (`teacher-portal-shell.tsx:271-277`); sign out is a GET to `/api/auth/signout` (`:250`); online chip only; class rows show code and size. Fixed: the bell counts unread family messages and names the count in its label, and signing out confirms first and says what an unsaved register costs. Below `md` a bottom tab bar takes over from the rail, with the class picker and the rest behind More. Still the online chip only, and class rows still show code and size. | P2 |
| Sign in | Staff ID plus password, shared classroom tablet mode, forgot password, ask IT | Shared email and password form, no forgot link | P1 |
| Today | Lessons rail with Mark attendance CTA; Up next with last-taken; Papers to mark; Parent messages card; This week | All except the Parent messages card; "Set new homework" links to the Homework page rather than opening the dialog (`teacher-today-content.tsx:100`). Fixed: the Parent messages card is there and reads the same query as the bell, Set new homework opens the composer through `?new=1`, and a tile with nothing over nothing is left out rather than drawn as a slashed zero. | P2 |
| Attendance | Crumb with day, period, time; P/A/L three-way toggle; Save & go to next class with confirm and SMS note | Date input, no period; four-way segmented control incl. Excused; "Save the register" that stays; no confirm; no submit (see workflows B1). Fixed: the header carries the period and its times, the toggle is three-way with Excused behind the row menu, the date uses the design system picker, "Everyone absent" confirms, and the bar reads "Save & next class" and sends the register in. | P2 |
| Enter marks | Out-of editor; Done / Average / Top / Lowest pills; live percent and grade; Tab and Enter hints; Send to parents | Assessment select; percent beside each input (`teacher-marks-screen.tsx:318`); absent flag; blanks-only view; `aria-invalid` on over-max with no visible error; no grade, stats, keyboard or publish. Fixed: Enter moves to the next pupil, the grade comes live from the school's own band scheme, the over-max error is visible, the stats pills are there, and a teacher can create the assessment they are about to mark. Sending marks on to parents is still the office's act (workflows T11). | P2 |
| Marks book | One column per assessment; inline edit; add column; chips; CSV | Continuous / Exam / Term mark / Grade per pupil; "Send to the result sheet" disabled with a named reason (good); grade renders as an unlabeled colour square in the capture. Fixed: the grade reads as its code with the band's label behind it, rather than as a tint whose thresholds this file had invented. Assessment columns, inline edit and CSV are still absent. | P2 |
| Messages | Split inbox and thread; broadcast to class; quick replies; attach; send later | Single-column list and thread toggle; reply only; "Parents start them from their own portal" (`teacher-messages-screen.tsx:261`). Fixed: a teacher can start a conversation and write to a whole class, the thread is in the URL, and the layout splits at 60rem. Quick replies, attachments and send-later are still absent. | P2 |
| Timetable | Week nav; cell modal with Mark attendance and Open plan; cover lesson; legend | Week nav; cell with both buttons; "Hide free periods" and "Lay out this week"; no legend; skeleton does not mirror the grid | P2 |
| Lesson plans | Drawer; copy last week; new plan | Dialog; copy with confirm; "Lay out this week" from the scheme (beyond prototype); "Every lesson planned" pill shows on 0 of 0 | P2 |
| Homework | Remind unsubmitted; attachments; multi-class chips; rubric | Progress bars; board with per-pupil mark; single class select; no remind; lede sentence. The lede is gone and the composer opens from Today; remind, attachments and multi-class are still absent. | P2 |
| Shared files | Upload | Links only, with the limitation stated in the lede. The lede is gone; the limitation is not, and it is now stated in the dialog where a teacher adds a resource rather than above the whole screen. | P2 |
| Reports | Four tiles with deltas; charts on DS defaults; export PDF | Tiles; a raw polyline with labels dumped as run-on text; no export; "Homework handed in —" tile. Fixed: the trend is drawn on the design system's chart parts with a grid and week labels as an axis, scaled to the range the term actually moved through. No export. | P2 |
| Meetings | Accept and decline bookings; iCal | Open an evening and release (both 403 for TEACHER, see workflows B2); calendar with no selectable days when empty; explanatory paragraph. Fixed: the 403 is gone at the persona and the paragraph with it. The empty calendar is unchanged. | P2 |
| Profile | Edit, change password, qualifications | Read-only with Settings link; "STAFF CODE" label wraps on tablet | P2 |
| Settings | Five sections with real controls | Five sections with a rail; four rows stamped "Not yet available". Fixed: eleven such rows across the five panels are gone, and what is left is what the product stores. | P2 |
| Help | Guides and FAQ | Present; FAQ answer for forgotten password points nowhere | P2 |

## 3. Screenshot findings

- **Today.** "20" on the bell, the Marks tab, the rail's Enter marks and the Papers to mark tile at once. Four slashed zeros ("0 lessons today", "0 periods", "REGISTERS UNMARKED 0", "HOMEWORK OPEN 0"). The "No periods are set up" empty card is 280px tall inside a card that already has a title. On tablet the three This week tiles wrap 2+1. The repeated "20" is down to the Marks tab and the tile, the bell having moved to the count nothing else was showing, and a tile whose numerator and denominator are both zero is now left out. The empty card and the tablet wrap are unchanged.
- **Attendance.** Twenty rows each carrying a "Not marked" badge and an empty segmented control, stating the state twice per row. Date field shows `09/07/2026` (browser locale, US order). No period or time context. The sticky save bar is below twenty rows on desktop. Rebuilt: 56px rows with no badge, a three-way toggle at 44px, the period and its times in the header, and the date on the design system picker in the school's own format. The save bar is still at the foot of the roll, and it now sends the register in.
- **Enter marks.** Empty state only, sending the teacher to the office's Assessments screen; no "Create an assessment" verb even though the API allows TEACHER to create. Fixed: the verb is on the empty state and beside the assessment picker.
- **Marks book.** Clean table with mono right-aligned percentages; the grade column renders as unlabeled 12px colour squares; the tone thresholds (70 green, 50 amber) are not the school's band scheme. Fixed: the grade reads as its code, with the band's own label behind it, and the invented thresholds are gone.
- **Timetable and Lessons.** Empty card with a long explanatory sentence; "Every lesson planned" green pill next to "0 of 0". Unchanged: a week with no lessons in it still reads as a week fully planned.
- **Homework and Files.** Lede sentence, filter row, centred empty state; the verb appears twice. Both ledes are gone; the filter row, the empty state and the doubled verb are as they were.
- **Meetings.** Calendar with no selectable days, a paragraph, "0 this month / 0 of 0 this month" in slashed zeros. The paragraph is gone; the calendar and the zeros are unchanged.
- **Reports.** Good stat band; the attendance chart has no axes or grid and its labels run on as text. Fixed: the trend is drawn on the design system's chart parts, with a grid and the weeks as an axis, scaled to the range the term moved through rather than to 0–100, which flattened a two-point slide into a straight line.
- **Settings.** Rail and panel work; four "Not yet available" chips. Fixed, and the count here was low: four is what one panel showed, and there were eleven across the five. All eleven are gone.
- **Tablet.** Rail still open at 250px; nothing breaks, nothing is tablet-specific (no larger targets, `SegmentedControl size="sm"` on the register). The register's own toggle is 44px now; the rest stands.

## 4. Rule violations that recur

| Rule | Violation | Where |
|---|---|---|
| Never the same fact twice | "20" ×4; "Not marked" badge plus empty control per row. Fixed: the bell counts unread family messages, the rail's count is gone, and an unmarked row says so once, through an empty toggle. | shell, register |
| A verb is one tap | Set homework from Today is two. Fixed. | today |
| Destructive under the thumb confirms | "Everyone absent" beside "Undo" with no confirm. Fixed. | register |
| Hide invalid actions | Four "Not yet available" rows. Fixed: eleven of them across the five panels are gone. | settings |
| No explanatory copy | Ledes on Files, Homework, Meetings, Settings ("Nothing behind these yet"). Fixed on all four; the Files limitation is now stated in the dialog that runs into it. | four screens |
| Strips run to the edge and snap | `.te-tabs` stops 22px short (`teacher-portal.css:247-254`). Fixed: the inset moved onto the first and last tab, so the strip scrolls edge to edge and snaps. | shell |
| Skeletons mirror the real layout | `CardsSkeleton count=6 columns=3` for a five-day grid. Still open in the portal; the back-office routes gained skeletons that mirror their layouts. | timetable, lessons |
| Charts on DS defaults | Raw polyline. Fixed. | reports |
| Sub-screen state in the URL | Thread state is component state; Back leaves the portal. Fixed: the open thread is `?thread=`. | messages |
| Locale | Native date input renders in browser locale. Fixed: the design system picker, pinned to the school's format. | register |

## 5. Suggested edits

1. **Shell.** Bell badge = unread parent messages (add `unread` to the `me/messages` summary or the day payload); papers stay on the Marks tab only. Replace the sign-out GET with a confirm dialog that calls `signOut({ callbackUrl })` and mentions unsaved drafts. Run `.te-tabs` edge to edge with scroll snap. Below `md` render a five-item bottom tab bar (Today, Attendance, Marks, Messages, More) instead of the sidebar sheet, and put the class picker behind the bar title. Add the offline banner strip under the bar when offline. Done but for the offline banner; the bell counts unread threads off the same query the inbox reads, so opening the inbox clears it.
2. **Today.** Open the Set-homework dialog directly (`?new=1` honoured by the Homework screen); add a "Parent messages · N new" card; suppress a This week tile whose numerator and denominator are both zero. Done.
3. **Register.** 56px rows: avatar, one-line name, mono id, a three-way P/A/L toggle at 44px tall; Excused behind a long-press or a per-row menu; unmarked rows show an empty toggle and no badge. Period and time in the header when the register is per lesson; "Change day" as a ghost button. "Everyone absent" behind a confirm. Sticky bar with counts and "Save & next class →" that confirms (counts, unmarked handling, "Parents of N absent pupils will be texted" once notifications exist) and advances to the next lesson. Add Submit (workflows B1). Done, without the texting note, which waits on a channel to text through.
4. **Enter marks.** Enter moves to the next input, Tab hint in the footer; live grade from the class's band scheme; per-row inline error on over-max; stats pills (done, average, top, lowest); "Send to parents" that publishes when permitted or hands off to the HOD with a named refusal; "Create an assessment" for teachers who may. Done but for "Send to parents", which waits on the decision in workflows §9.
5. **Marks book.** Assessment columns from `/api/v2/schools/assessments?classSubjectId=` with inline edit and "Add an assessment"; render the grade code as text, not a swatch; CSV export. Only the grade code is done.
6. **Messages.** "Start a conversation" (pick pupil, then guardians, subject, body) and "Send to whole class" (class chips, preview, count) on the existing thread API; `?thread=` in the URL; split layout at 60rem and above; quick-reply chips. Done but for the quick replies.
7. **Reports.** DS chart primitives (dashed grid, muted 11px axis labels, canonical colours); hide tiles with a zero denominator; add Export PDF through the documents pipeline. The chart is done; the export is not.
8. **Settings.** Hide "Not yet available" rows or collapse them into one "Coming" note. Done: they are gone, and the prose carries what they were for.
9. **Empty states.** Prefer `NothingYet` with the verb when the teacher can act, else name who can using `whoCan()`. Done on Enter marks, where the verb is now "Create an assessment"; not swept across the rest.
10. **Login.** "Staff ID or email" label, forgot-password link, shared-device checkbox once S-6.59 exists. Not done. There is still no password reset anywhere in the three portals.

## 6. Proposed restructuring

- **Rail groups stay as the prototype draws them**, with an unread badge on Messages and a "to submit" count on Attendance.
- **Enter marks and Marks book merge** into one gradebook with a column picker once custom columns (S-6.44) land; until then, link them both ways.
- **Department group for HODs** (moderation queue, scheme-of-work editor) added to the rail when the profile has `isHod`, so HODs have a portal home.
- **Phone layout**: bottom tabs and a class picker sheet; the 220px rail is desktop and tablet chrome only. Done: below `md` the rail gives way to Today, Attendance, Marks and Messages, with everything else, the class picker included, one tap behind More.

## 7. Proposed new UI

- **Register capture redesign** as in §5 item 3, with an offline queue ("Saved on this tablet · sends when online") once S-8.1 lands. This is the screen the marketing site promises works offline. The redesign is built; the offline queue is not, and the promise on the marketing site stands unmet.
- **Result-sheet status strip** on the Marks book: Draft → Submitted → Sent back (with the HOD's note) → Approved → Published, with the action the teacher can take next. Not built. The Marks book now says who may send marks to the sheet before the press rather than after it, which is a smaller version of the same idea.
- **Messages split view** with inbox, thread, broadcast sheet and quick replies. Built but for the quick replies.
- **Today's Parent messages card** and a notification centre shared with the other portals (rows deep-link; preferences by event and channel). The card is built; the notification centre is not.
- **Cover and absence card** on Today when the teacher is covering or being covered, from `SchoolCoverAssignment`.
- **Comment bank picker** in the Marks book remarks cell.

## 8. Accessibility and locale

- The segmented register control needs a roving tabindex and visible focus; targets at `size="sm"` are below 44px on tablet. Fixed, and the fix found something this audit had not: the design system's `SegmentedControl` keys its roving tabindex off the selected option, so a row nobody had marked yet had no tabbable segment at all — the roll could not be reached by keyboard until a mark had been made with the mouse. Changing the shared control would have changed every other caller, so the roll owns a 44px toggle of its own until that is a deliberate decision.
- Error text for over-max marks must be visible, not only `aria-invalid`. Fixed.
- Replace the native date input with the design system picker (sheet on phone) and pin the display format to `3 June 2026`. Fixed. The native input had been showing a Zimbabwean teacher a date in US order.
- Name the icon-only rail toggle and the bell, and include the count in the bell's label. Half fixed: the bell is named and says how many families are waiting. The rail toggle belongs to the shared `AppShell` and is unchanged.
