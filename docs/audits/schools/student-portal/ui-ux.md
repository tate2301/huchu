# Student portal: UI/UX audit

Surface: `app/portal/student/**`, shell `components/schools/portal/student/student-portal-shell.tsx` (composed from the design system's `MobileShell`, `MobileShellHeader`, `BottomTabs`), screens under `components/schools/portal/student/`, styles `student-portal.css`. Audited from source and from `docs/screenshots/schools/student-portal/01-student-home.png`, `student-portal-phone/*`, `student-portal-tablet/*`. Workflow companion: `workflows.md` in this folder.

Rules applied: the portal build contract and `student.html`, the platform UX playbook phone rules, `11-campus-states-and-motion.md`, `.impeccable.md`, `SPEC.md`.

## 1. Verdict in one paragraph

Of the three portals the student portal is closest to its prototype in structure and furthest from it in what the screens say. The shell, tabs, sheets, saving overlays and the three-way empty states are done properly, and the homework and library screens are better than the demo in places because their actions are real. What fails is the content of the glance: Home tiles carry words where the prototype carries numbers ("See all", "Books out", "Your targets"), the bell has no count so the notification centre goes unvisited, and sub-screens have no back button. Two screens explain the product to the child instead of serving them: Settings carries an alert titled "Three things from the design are not here yet" and Profile carries five paragraphs about who holds each field. Repeated facts (Form 1 and Term 3 four times on Profile, "no goal" three ways on every Goals card) and stacked empty states on Timetable and Library make the portal feel unfinished when it is mostly built.

Nearly all of that is now done, in one commit (`4a83f7e`). Every tile carries a figure and the figures come down with the pupil's own record rather than from four requests after the page paints; the bell carries a count and the side rail repeats it; every non-tab route has a back target and a rail above 900px; the two screens that explained the product to the child no longer do; the repeated facts, the stacked empty states, the pickable Saturday and the near-black "Right now" tile are gone. What is unchanged is the homework screen, which is the one screen whose gaps are gaps in the product rather than in the drawing — no file, no receipt, no teacher files, no thread — and the login page, which still asks a child for a "Work email". One finding in this document was wrong, and is marked so below: the Help accordion's chevron always rotated.

## Runtime check (14 September 2026)

Verified on the seeded St Marys tenant as `student@stmarys.test` (see `../reference/runtime-verification.md`). Confirmed at runtime: the Settings screen renders the "not here yet" alert and its "Change your password" link is bounced back to `/portal/student`; and the mark leak in the workflow document (all 13 subjects carry a `currentMark` while the results route returns no published lines). Not reproduced: the Saturday chip.

Revised on 15 September 2026 against the eighteen commits that followed the audit (`01de8a3..HEAD`). A finding the work closed keeps its description and gains a line saying it is closed and what closed it; a finding the work did not reach stands as it was written; a finding the implementation proved wrong says so and says what is actually true.

## 2. Contract parity by screen

| Screen | Prototype promises | Code renders | Gap |
|---|---|---|---|
| Shell | Bell with numeric unread count; back button on Library, Profile, Notifications, Goals, Help, Settings; per-screen bar actions; offline banner; "Hi, <name>" home title | Bell without badge (`student-portal-shell.tsx:80`); no back passed to `MobileShellHeader` (`:71`); no actions; no banner; "Home" | P1, fixed but for the offline banner; the bar-action slot exists and only Notifications fills it |
| Sign in | Student number plus four-digit PIN, remember me, forgot PIN, fingerprint; signed-out screen; onboarding tour | Email and password with "Work email" label | P1, open |
| Home | Next class card with topic and room; week dot strip; This week KPIs (homework due with overdue delta, latest mark with delta); recent marks sparkline; quick links with numbers; school news banner | Next class card; quick-link tiles with text values; a near-black "Right now" tile holding "—" | P1, fixed but for the dot strip, the sparkline and the news banner |
| Timetable | Week arrows; Mon to Fri grid with subject colours and prepared dots; class sheet (what you'll learn, bring with you, I'm ready / I need help); download | Grid and day list; the `DAYS` constant includes Saturday while the grid is Mon to Fri (`student-timetable-screen.tsx:30`, not reproduced on screen in the runtime pass); two stacked empty states when there is no timetable (`:166`, `:241`) | P2, fixed; the class sheet, the arrows and the download stand |
| Homework | Search and filter actions; file upload with progress and receipt code; files from teacher; per-assignment thread; hand in late | Chips with counts; text plus URL field ("Link to your work", `:421`); "Handed in" alert without a receipt; no teacher files; no thread | P1, open; the screen is untouched |
| Marks | Overall with place in class and top %; subject cards; marks sheet with CA and exam split, class histogram, teacher comment, Set my goal, Ask teacher; download report card | Average with delta; term tabs; subject cards with remarks; two-sentence policy note at the bottom | P2, the note is fixed; the sheet, the place in class and the download stand |
| Library | Search with scan icon; fines pill with Pay; scan to return; catalogue with covers; books out; reading list; past loans | Search; borrow, renew, reserve, return (real); no scan, no fines payment, no reading list; two stacked empty states | P2, the empty states and the fines pill are fixed; the scan and the reading list stand |
| Goals | Weekly study bars; per-subject cards with target marker; slider | Cards with target marker and teacher note; number input; three-line hero lede; "no goal" said three ways per card | P2, the lede and the repetition are fixed; the study bars and the slider stand |
| Notifications | Count line, mark all read, settings action | Real inbox with mark all read and clear all; "0 messages · 0 new" above "Nothing new" | P2, fixed |
| Profile | ID card with stats (days at school %, place, overall); contact rows; theme; notification toggles; Change PIN; privacy | Read-only ID card; "Your details" rows repeating it; "Held by the school" explainer; link to Settings promising alerts, theme and PIN | P2, fixed; the stats, the theme and the PIN are unbuilt |
| Settings | Push and email, cadence, mark visibility, fingerprint, theme, language, Change PIN, replay tour | Two rows; "Change your password" links to `/settings/profile` (bounced by the proxy); explanatory alert (`student-settings-screen.tsx:44, 79`) | P1, fixed; one alerts switch is wired and the rest of the prototype's rows are unbuilt and undrawn |
| Help | Search; article sheets with "Was this helpful?"; call form teacher, email ICT, live chat | Accordions with non-rotating chevron; "The school office" row with no action | P2, the office row is fixed; "the chevron does not rotate" was wrong, and "Was this helpful?" stands |

## 3. Screenshot findings

- **Home.** Five of six tiles carry text values. "Lessons today 0" uses a slashed zero. The "Right now" tile is solid near-black on a light page and reads as a disabled or error block. No school-context line beyond "Form 1 · Term 3". Fixed: lessons today, latest mark with its delta, books out with the fine, and new messages are four figures; the black tile is gone; the school-context line is the first thing under the greeting, and the greeting is now the pupil's name in the bar.
- **Timetable.** Two empty states one above the other, a "Clear the filters" button whose only filter is the day picker, and a "Sat" chip that can never have content. "Form 1" set in mono reads as a code. Fixed: a week with nothing in it is one empty state with no day picker under it, a day the picker empties names that day and offers today back, and `DAYS` is Monday to Friday.
- **Homework and Marks.** Good `NothingYet` sentences on an otherwise empty screen.
- **Library.** A search field above an empty shelf; eyebrows "BOOKS YOU HAVE OUT · 0" and "THE SHELF · 0" carry zeros as counts. Fixed: an empty library is one empty state, the search appears once there is stock or a term to clear, and a fine is a pill carrying the amount.
- **Goals.** Orange hero with three lines of explanation; every card repeats "no goal"; the "Not started" badge is grey on grey at 11px. Fixed: the hero is the count reached over the count set, and a subject with no goal is a card with one thing on it to press.
- **Notifications.** "0 messages · 0 new" then "Nothing new". Fixed: the count line is drawn only when there are messages to count.
- **Profile.** A handsome orange ID card, then Form 1 and Term 3 again in the stats row and twice more in the list beneath. Fixed: the card is the screen, and under it are the four places the pupil's own account carries on, plus one line naming who corrects the record.
- **Settings.** Two working rows, then a blue info box explaining what is missing. Fixed: the box is gone and so are the rows that had nowhere to keep a setting.
- **Help.** Accordion cards whose chevron does not rotate; "Talk to someone" is a paragraph, not a contact. **The chevron half of this was wrong.** `.sp-help-card[open] .sp-hc-chev { transform: rotate(90deg); }` has been in `student-portal.css` since before the audit and out-specifies the base rule beside it; the screenshot behind the finding was taken with every accordion shut, so nothing had rotated yet. The contact half was right and is fixed: the office is a `tel:` row and a `mailto:` row drawn from the tenant's own details, and absent when the tenant has none.
- **Tablet.** Same single column; no side nav above 900px (the `.b-bottom-tabs` breakpoint problem shared with the parent portal). Fixed: a `.ps-side` rail carries the four tabs, a rule, and the six routes that have no tab, with the unread count beside Messages.

## 4. Rule violations that recur

| Rule | Violation | Where | Now |
|---|---|---|---|
| A tile shows a figure | "See all", "Books out", "Your targets", "From school", "—" | home | Fixed |
| Never the same fact twice | Form and term ×4; "no goal" ×3; "0 messages · 0 new" plus "Nothing new"; "0/0 reached" and "0/0 on track" | profile, goals, notifications | Fixed |
| No explanatory copy | Settings alert; Profile "Held by the school"; Goals lede; Marks policy note | four screens | Fixed; the marks note survives inside the empty state, where it answers the question the empty screen raises |
| Hide invalid actions | Unbuilt rows rendered as unavailable | settings | Fixed |
| One empty state per segment | Two stacked on Timetable and Library | two screens | Fixed |
| Strips scroll rather than squash | Six-column day segment at 51px each | timetable | Five columns now that Saturday is gone; the strip still squashes rather than scrolls |
| Sub-screens have a back target and the shell has nav above 900px | Neither | shell | Fixed |
| Links stay in the portal | "Change your password" leaves for the back-office settings shell | settings | Fixed by removing the link; there is still nowhere in the portal to change a password |

## 5. Suggested edits

Numbers 2, 3, 5, 6, 7 and 10 are done, and 1, 8 and 9 in part; 4 and 11 stand. One half of 8 was asked for on a finding that was wrong. All of the work is in `4a83f7e`.

1. **Shell.** Pass `unread` to the bell (one lightweight query or a field on the day payload) and render the prototype's count badge; pass `back` for the six non-tab routes; add per-screen bar actions (Homework filter, Marks download, Notifications mark-all-read); add `.ps-side` above 900px; title Home "Hi, <first name>". Done, but for the bar actions: the slot exists and Notifications puts mark-all-read in it, while Homework's filter stays on the screen and Marks has no download to offer.
2. **Home.** Extend `lib/schools/student-day-loader.ts` (or a client query) with `homework { due, overdue }`, `latestMark { subject, score, delta }`, `unread`, `library { out, overdue, fines }` and fill the tiles with numbers; replace the black "Right now" tile with the brand-soft KPI style; add the school-news banner from the notifications query and the week dot strip from the timetable query. Done as the first route — the loader carries all four, so the screen paints at once — but for the banner and the dot strip, which are not built.
3. **Timetable.** `DAYS = GRID_DAYS`; when the week has no slots skip the day picker and the second empty state; add week arrows only if the API takes `weekStart`. Done. The API takes no `weekStart`, so there are no arrows.
4. **Homework.** Add photo and file capture (`<input type=file accept="image/*,application/pdf" capture>`) feeding the existing upload path; show a short receipt code from the submission id and push it to Notifications; render teacher attachments when the API carries them; autosave typed answers per assignment id.
5. **Goals.** Shorten the hero to the count; "Set a goal" as the single call to action on a card with no goal; drop the badge and the "–/–". Done.
6. **Profile.** Keep the ID card; delete the rows that repeat it; collapse "Held by the school" into one callout line. Done.
7. **Settings.** Remove the alert; hide unbuilt rows; point "Change your password" at a portal-scoped screen or remove it until one exists. Done, by removing the link. The sign-in row that replaces it names the address and says the office owns it, so the screen answers the question the link was there to answer.
8. **Help.** Rotate the chevron on `details[open]`; make "The school office" a `tel:` or `mailto:` row from tenant contact details; add "Was this helpful?". The first was already true and should not have been asked for. The second is done. The third is not built, and S-6.35 is still marked `done` for it.
9. **Marks.** Move the publishing note into the empty state only; add the per-subject sheet with CA and exam split and the teacher comment when the API exposes them. The first is done; the API exposes neither split nor comment, so the sheet stands.
10. **Library.** Hide the search until the shelf has stock; one empty state; show fines as a pill with the amount even before payment exists. Done, all three.
11. **Login.** "Student number" label; PIN entry when S-6.20 lands; forgot-PIN modal pointing at the form teacher. Not done. The page is the shared `PortalLoginForm`, so the label is "Work email" for a nine-year-old, and changing it is a change to every portal's login rather than to this screen.

## 6. Proposed restructuring

- **Home is a due-soon list first**, then the next class, then marks. A pupil opens the app to find out what is due, not what period it is. Done, in that order, with the three soonest pieces of work as rows and the count beside the heading.
- **Notifications and school news are one inbox** with a Home teaser; the bell badge is the single unread count. Half done: the badge is the single unread count, on the bell and again on the rail. There is no Home teaser, because there is nothing school-side that emits news to a pupil other than a notice, which is already in the inbox.
- **Settings holds account, alerts, appearance and privacy** in the prototype's groups; show only what works, and wire the two that are trivially available now (browser push preference, reduced motion). Done for the first group and the alerts switch, which writes to `/api/notifications/preferences`. Appearance and privacy have nothing behind them, so they are not drawn; reduced motion was not wired.
- **Sub-screens (Library, Goals, Notifications, Help, Settings) get a back target** to their parent tab, matching the prototype's `BACK` map. Done, and Homework with them: the map is the shell's, so a route missing from it has no back arrow rather than a silent one.

## 7. Proposed new UI

None of these is built. The homework sheet's offline queue in particular waits on the offline work in Iteration 8, which has not started.

- **Homework submission sheet:** status pill; What to do; Files from your teacher; Your work with three chips (Type it, Photo, Link); footer Hand it in / Hand in late / Change what you handed in; progress stages then a receipt card with Share; offline queue with "Saved on your phone · will send when you are back online" and a "Waiting to send" pill on the card.
- **Class sheet from the timetable:** when, where, teacher, lesson n of N, topic from the lesson plan, materials to bring, "I'm ready" / "I need help" that opens a message to the teacher once messaging exists.
- **Marks sheet per subject:** total, place, CA and exam split with bars, class histogram with the pupil's bar highlighted, teacher comment, Set my goal, Ask the teacher.
- **Notification centre:** rows deep-link (assignment, mark sheet, notice); preferences with cadence Now, Daily, Weekly and a school-news toggle.

## 8. Accessibility and locale

- `MobileShellHeader` icon buttons need names; the bell needs an `aria-label` that includes the count. Done: back, bell and avatar carry names, and the bell reads "Messages, 3 unread" or "Messages, none unread".
- The dark "Right now" tile fails contrast for its muted text; use the brand-soft tile. Done; the tile is gone and the latest mark takes the brand-soft treatment.
- Dates via en-GB `Intl` are fine; set `lang="en-ZW"`; plan Shona and Ndebele strings for the settings language row. `lang="en-ZW"` is set on the shell. There are no Shona or Ndebele strings and no language row.
- If the product stays light-only (`app/globals.css:1741`), remove the theme row rather than render it as unavailable. Done; the theme row is not drawn. The product is still light-only, so the decision behind the row is unmade rather than made.
