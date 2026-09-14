# Student portal: UI/UX audit

Surface: `app/portal/student/**`, shell `components/schools/portal/student/student-portal-shell.tsx` (composed from the design system's `MobileShell`, `MobileShellHeader`, `BottomTabs`), screens under `components/schools/portal/student/`, styles `student-portal.css`. Audited from source and from `docs/screenshots/schools/student-portal/01-student-home.png`, `student-portal-phone/*`, `student-portal-tablet/*`. Workflow companion: `workflows.md` in this folder.

Rules applied: the portal build contract and `student.html`, the platform UX playbook phone rules, `11-campus-states-and-motion.md`, `.impeccable.md`, `SPEC.md`.

## 1. Verdict in one paragraph

Of the three portals the student portal is closest to its prototype in structure and furthest from it in what the screens say. The shell, tabs, sheets, saving overlays and the three-way empty states are done properly, and the homework and library screens are better than the demo in places because their actions are real. What fails is the content of the glance: Home tiles carry words where the prototype carries numbers ("See all", "Books out", "Your targets"), the bell has no count so the notification centre goes unvisited, and sub-screens have no back button. Two screens explain the product to the child instead of serving them: Settings carries an alert titled "Three things from the design are not here yet" and Profile carries five paragraphs about who holds each field. Repeated facts (Form 1 and Term 3 four times on Profile, "no goal" three ways on every Goals card) and stacked empty states on Timetable and Library make the portal feel unfinished when it is mostly built.

## 2. Contract parity by screen

| Screen | Prototype promises | Code renders | Gap |
|---|---|---|---|
| Shell | Bell with numeric unread count; back button on Library, Profile, Notifications, Goals, Help, Settings; per-screen bar actions; offline banner; "Hi, <name>" home title | Bell without badge (`student-portal-shell.tsx:80`); no back passed to `MobileShellHeader` (`:71`); no actions; no banner; "Home" | P1 |
| Sign in | Student number plus four-digit PIN, remember me, forgot PIN, fingerprint; signed-out screen; onboarding tour | Email and password with "Work email" label | P1 |
| Home | Next class card with topic and room; week dot strip; This week KPIs (homework due with overdue delta, latest mark with delta); recent marks sparkline; quick links with numbers; school news banner | Next class card; quick-link tiles with text values; a near-black "Right now" tile holding "—" | P1 |
| Timetable | Week arrows; Mon to Fri grid with subject colours and prepared dots; class sheet (what you'll learn, bring with you, I'm ready / I need help); download | Grid and day list; `DAYS` includes Saturday while the grid is Mon to Fri (`student-timetable-screen.tsx:30`); two stacked empty states when there is no timetable (`:166`, `:241`) | P2 |
| Homework | Search and filter actions; file upload with progress and receipt code; files from teacher; per-assignment thread; hand in late | Chips with counts; text plus URL field ("Link to your work", `:421`); "Handed in" alert without a receipt; no teacher files; no thread | P1 |
| Marks | Overall with place in class and top %; subject cards; marks sheet with CA and exam split, class histogram, teacher comment, Set my goal, Ask teacher; download report card | Average with delta; term tabs; subject cards with remarks; two-sentence policy note at the bottom | P2 |
| Library | Search with scan icon; fines pill with Pay; scan to return; catalogue with covers; books out; reading list; past loans | Search; borrow, renew, reserve, return (real); no scan, no fines payment, no reading list; two stacked empty states | P2 |
| Goals | Weekly study bars; per-subject cards with target marker; slider | Cards with target marker and teacher note; number input; three-line hero lede; "no goal" said three ways per card | P2 |
| Notifications | Count line, mark all read, settings action | Real inbox with mark all read and clear all; "0 messages · 0 new" above "Nothing new" | P2 |
| Profile | ID card with stats (days at school %, place, overall); contact rows; theme; notification toggles; Change PIN; privacy | Read-only ID card; "Your details" rows repeating it; "Held by the school" explainer; link to Settings promising alerts, theme and PIN | P2 |
| Settings | Push and email, cadence, mark visibility, fingerprint, theme, language, Change PIN, replay tour | Two rows; "Change your password" links to `/settings/profile` (bounced by the proxy); explanatory alert (`student-settings-screen.tsx:44, 79`) | P1 |
| Help | Search; article sheets with "Was this helpful?"; call form teacher, email ICT, live chat | Accordions with non-rotating chevron; "The school office" row with no action | P2 |

## 3. Screenshot findings

- **Home.** Five of six tiles carry text values. "Lessons today 0" uses a slashed zero. The "Right now" tile is solid near-black on a light page and reads as a disabled or error block. No school-context line beyond "Form 1 · Term 3".
- **Timetable.** Two empty states one above the other, a "Clear the filters" button whose only filter is the day picker, and a "Sat" chip that can never have content. "Form 1" set in mono reads as a code.
- **Homework and Marks.** Good `NothingYet` sentences on an otherwise empty screen.
- **Library.** A search field above an empty shelf; eyebrows "BOOKS YOU HAVE OUT · 0" and "THE SHELF · 0" carry zeros as counts.
- **Goals.** Orange hero with three lines of explanation; every card repeats "no goal"; the "Not started" badge is grey on grey at 11px.
- **Notifications.** "0 messages · 0 new" then "Nothing new".
- **Profile.** A handsome orange ID card, then Form 1 and Term 3 again in the stats row and twice more in the list beneath.
- **Settings.** Two working rows, then a blue info box explaining what is missing.
- **Help.** Accordion cards whose chevron does not rotate; "Talk to someone" is a paragraph, not a contact.
- **Tablet.** Same single column; no side nav above 900px (the `.b-bottom-tabs` breakpoint problem shared with the parent portal).

## 4. Rule violations that recur

| Rule | Violation | Where |
|---|---|---|
| A tile shows a figure | "See all", "Books out", "Your targets", "From school", "—" | home |
| Never the same fact twice | Form and term ×4; "no goal" ×3; "0 messages · 0 new" plus "Nothing new"; "0/0 reached" and "0/0 on track" | profile, goals, notifications |
| No explanatory copy | Settings alert; Profile "Held by the school"; Goals lede; Marks policy note | four screens |
| Hide invalid actions | Unbuilt rows rendered as unavailable | settings |
| One empty state per segment | Two stacked on Timetable and Library | two screens |
| Strips scroll rather than squash | Six-column day segment at 51px each | timetable |
| Sub-screens have a back target and the shell has nav above 900px | Neither | shell |
| Links stay in the portal | "Change your password" leaves for the back-office settings shell | settings |

## 5. Suggested edits

1. **Shell.** Pass `unread` to the bell (one lightweight query or a field on the day payload) and render the prototype's count badge; pass `back` for the six non-tab routes; add per-screen bar actions (Homework filter, Marks download, Notifications mark-all-read); add `.ps-side` above 900px; title Home "Hi, <first name>".
2. **Home.** Extend `lib/schools/student-day-loader.ts` (or a client query) with `homework { due, overdue }`, `latestMark { subject, score, delta }`, `unread`, `library { out, overdue, fines }` and fill the tiles with numbers; replace the black "Right now" tile with the brand-soft KPI style; add the school-news banner from the notifications query and the week dot strip from the timetable query.
3. **Timetable.** `DAYS = GRID_DAYS`; when the week has no slots skip the day picker and the second empty state; add week arrows only if the API takes `weekStart`.
4. **Homework.** Add photo and file capture (`<input type=file accept="image/*,application/pdf" capture>`) feeding the existing upload path; show a short receipt code from the submission id and push it to Notifications; render teacher attachments when the API carries them; autosave typed answers per assignment id.
5. **Goals.** Shorten the hero to the count; "Set a goal" as the single call to action on a card with no goal; drop the badge and the "–/–".
6. **Profile.** Keep the ID card; delete the rows that repeat it; collapse "Held by the school" into one callout line.
7. **Settings.** Remove the alert; hide unbuilt rows; point "Change your password" at a portal-scoped screen or remove it until one exists.
8. **Help.** Rotate the chevron on `details[open]`; make "The school office" a `tel:` or `mailto:` row from tenant contact details; add "Was this helpful?".
9. **Marks.** Move the publishing note into the empty state only; add the per-subject sheet with CA and exam split and the teacher comment when the API exposes them.
10. **Library.** Hide the search until the shelf has stock; one empty state; show fines as a pill with the amount even before payment exists.
11. **Login.** "Student number" label; PIN entry when S-6.20 lands; forgot-PIN modal pointing at the form teacher.

## 6. Proposed restructuring

- **Home is a due-soon list first**, then the next class, then marks. A pupil opens the app to find out what is due, not what period it is.
- **Notifications and school news are one inbox** with a Home teaser; the bell badge is the single unread count.
- **Settings holds account, alerts, appearance and privacy** in the prototype's groups; show only what works, and wire the two that are trivially available now (browser push preference, reduced motion).
- **Sub-screens (Library, Goals, Notifications, Help, Settings) get a back target** to their parent tab, matching the prototype's `BACK` map.

## 7. Proposed new UI

- **Homework submission sheet:** status pill; What to do; Files from your teacher; Your work with three chips (Type it, Photo, Link); footer Hand it in / Hand in late / Change what you handed in; progress stages then a receipt card with Share; offline queue with "Saved on your phone · will send when you are back online" and a "Waiting to send" pill on the card.
- **Class sheet from the timetable:** when, where, teacher, lesson n of N, topic from the lesson plan, materials to bring, "I'm ready" / "I need help" that opens a message to the teacher once messaging exists.
- **Marks sheet per subject:** total, place, CA and exam split with bars, class histogram with the pupil's bar highlighted, teacher comment, Set my goal, Ask the teacher.
- **Notification centre:** rows deep-link (assignment, mark sheet, notice); preferences with cadence Now, Daily, Weekly and a school-news toggle.

## 8. Accessibility and locale

- `MobileShellHeader` icon buttons need names; the bell needs an `aria-label` that includes the count.
- The dark "Right now" tile fails contrast for its muted text; use the brand-soft tile.
- Dates via en-GB `Intl` are fine; set `lang="en-ZW"`; plan Shona and Ndebele strings for the settings language row.
- If the product stays light-only (`app/globals.css:1741`), remove the theme row rather than render it as unavailable.
