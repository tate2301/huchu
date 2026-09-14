# Evidence: portal UI/UX audit

Raw screen-level findings, prototype contract extraction, and screenshot observations behind the parent, student and staff portal UI/UX documents. Line numbers are as of 2026-09-14 on `main`.


Audited from source at `/home/user/huchu` (no build; node_modules absent) plus the screenshot sets under `docs/screenshots/schools/`. Nothing in the repo was modified. Line numbers are as of this audit.

Scope: `app/portal/parent/**`, `app/portal/student/**`, `app/portal/teacher/**`, the shells and screens under `components/schools/portal/**`, the shared login form `components/auth/portal-login-form.tsx`, and the claim/invite flow (`app/api/public/schools/claim/[token]/route.ts`, `components/schools/portal/claim-portal-account-content.tsx`, `components/schools/portal/portal-invite-dialog.tsx`, `app/c/[token]/page.tsx`).

---

## 0. Rules and prototype contract digest

### 0.1 Testable rules the portals are audited against

| # | Source | Rule (as tested) |
|---|---|---|
| R1 | `docs/design-system/portals/README.md` L3 | "These are the **build contract** for the three school portals: every feature in a demo is required." |
| R2 | `SPEC.md` L3–8 | Attio principles: progressive disclosure; unified interaction patterns; strip unnecessary text/subtitles ("Remove cognitive overload"); **everything works flawlessly at iPhone 390px**. |
| R3 | `docs/ux/platform-ux-playbook.md` "Shell Patterns" L69–79 | Title lives in the top app bar, once; the page's primary action belongs in the bar. |
| R4 | Playbook "Phone Rules" L145–229 | Stat tiles two-up; **never state the same fact twice in one band**; strips scroll to the screen edge and snap ("a strip cut short of the gutter reads as clipping"); rows = two lines + one right-hand fact, and "facts that need their label to make sense do not appear on a phone"; money carries its currency; a picker is a sheet on a phone; bottom sheets are content-tall; one overlay z-rung; a record has one primary action; **no chrome a phone will never use, not even for one frame**; a section rail is a scrolling strip on a phone. |
| R5 | `docs/design-system/11-campus-states-and-motion.md` | Eight states per screen; skeletons mirror the real row and carry the header; the three empties are three different sentences (`NothingYet` / `NothingMatched` / `NothingLeftToDo`); errors scoped to the segment that failed; refusals name who can; writes go under `SavingOverlay`; motion ≤200ms on repeated paths. |
| R6 | `docs/portal-shell.css` | Portal chrome: `.ps-appbar` 52px with `.nav-btn` 36px; `.ps-tabbar` 72px (8/8/18 padding, 22px icons, 11px labels); `.ps-side` 220px side nav for tablet/desktop; `.pc` cards; `.phero` focal hero; `.pfab` 56px FAB; `.ps-bottombar` for "pay"-type screens. |
| R7 | `app/styles/components.css` L2332–2368 | `.b-bottom-tabs` is `position:fixed`, 64px, tab `min-height:52px`, and **`display:none` at `min-width: 901px`** — a shell that relies on it must provide other navigation above 900px. |
| R8 | `.impeccable.md` | Confident/direct labels, one clear primary action per screen, light-first, "avoid cluttered, gimmicky, or over-animated UI", validation that prevents mistakes early. |
| R9 | `lib/schools/format.ts` header (quoting `docs/design-system/05-rules.md`) | Money `$ 1,234.50` (NBSP), dates `3 June 2026`, times 24-hour; locale-pinned so SSR and browser agree. |
| R10 | Playbook L103–113 | Canonical status vocabulary used exactly across chips, filters and legends. |

### 0.2 Prototype contract — what each demo promises

Extracted from the `render*` functions in the three HTML files (they are self-contained SPAs; every screen below is a real rendered route in the demo, not a mock-up caption).

#### Parent — `docs/design-system/portals/parent.html`
Bottom nav (L1940–1943): **Home · Fees · News · You**, News carries a numeric unread badge (L1955). App bar (L1852–1936): hamburger *or back arrow* (24 routes have a back target), screen title, **child chip** (initials + short name), bell with pip when notices *or messages* are unread. Offline banner "No internet — showing what we last saved · Try again" (L1824–1832). Sticky **pay bar** on Fees ("Chosen items"/"What you still owe" → Pay) (L1834–1850).

Routes (L1982–2008), 24 screens: `home`, `fees`, `fees/pay`, `fees/method`, `fees/receipt`, `payment-history`, `notices`, `notice/:id`, `messages`, `message/:id`, `attendance`, `attendance/:day`, `leave-request`, `marks/:idx`, `calendar`, `library`, `timetable`, `profile`, `security`, `notifications`, `children`, `child/:id`, `help`, plus the sign-in flow and the child-switcher sheet.

Widgets promised per screen:
- **Sign in** (L3039–3152): phone number + "Remember this phone · skip the code for 30 days" + 6-cell SMS OTP (auto-advance, paste, `autocomplete="one-time-code"`, auto-verify), "Send the code again", "Change phone number", "First time here? Ask the school for your code", "Can't sign in? Call the school office".
- **Home** (L2040–2132): greeting + `school · term · week`; **fee hero** = "You still owe · <child>", amount, "pay by <date> · N days to go", paid/total progress bar, **Pay now** + See fee statement (or **See receipt** when paid); **Today** — four timetable rows with `UP NEXT` and "See full day" → `timetable`; **Quick look** — attendance % tile + **average mark %** tile; **Shortcuts** pill row (Calendar · Library · Receipts · Messages · Time off · Children); **School news · N new** three-row preview.
- **Fees** (L2148–2259): child header; hero; **Fee statement · Sent <date>** with per-line rows (tap = pick for part-pay), Total, "Already paid · EcoCash · ref"; **Money off** (sibling 7.5%, pay-early 2%); **Saved ways to pay** (EcoCash / Visa 4421 / Bank transfer) with "Past payments →".
- **Pay flow** (L2261–2550): Step 1 tick items (checkbox rows) + Step 2 "How much today?" (Pay all / Pay half / Pay $150) + "Paying today: $X · $Y still left" pill + Back/Next; Step 3 method grid (EcoCash, OneMoney, Bank transfer, Visa/Mastercard) with per-method detail (mobile-money phone input + "Check your phone" prompt; card-on-file + CVV; bank account + **reference to use**); "Confirm · $X" with processing state; **Receipt** screen with success banner, itemised lines, reference number, Save PDF / Email me / Text me / Back to home.
- **Payment history** (L3154–3284): "Paid this year" tile; chips by child and by method (Any way / EcoCash / OneMoney / Bank / Card); grouped by month; row cards with method pill + ref + download; receipt sheet (Share / Save as PDF); filtered-empty with "Show all →".
- **News list** (L2552–2593): tone icon, unread weight + pip, "You said: Going" RSVP meta, **Mark them all as read**. **Notice detail** (L2595–2682): sender pill + date, title, body paragraphs, attachments with size, **RSVP Going/Maybe/Can't come**, **Replies thread** with STAFF badge and reply input.
- **Messages** (L3646–3730): list (avatar, teacher, preview, role, when, pip) + "Write to the school"; thread bubbles + 42px round reply input and send.
- **Attendance & marks** (L2689–2797): term chips; % card with sentence; **6-week × Mon–Fri P/L/A grid** (tap a day → day detail) + legend; **Ask for time off** + **Term report (PDF)**; **Marks by subject** cards (icon, teacher, %, bar) → **Mark detail** (L2799–2868): class-work / end-of-term split with bars, grade + descriptor ("Distinction/Credit/Pass/Needs extra help"), **What the teacher says** card, **Message <teacher>** button.
- **Attendance day** (L3286–3341): status badge; absent → "Marked away · no reason yet · Tell the school why →"; late → "arrived at 08:24"; lessons that day with P/A/L; "Send a reason or ask for time off".
- **Leave request** (L3343–3404): From/To dates, Why (select), note to teacher, doctor's-note upload, "Send to school" + "We'll text <form teacher>".
- **Calendar** (L3406–3525): month grid with event dots; "Coming up" list with "Add" to phone calendar; day sheet.
- **Library (parent)** (L3527–3607): books-borrowed / money-owed tiles, borrowed list with due/LATE, holds "#n in line", "Keep them longer (renew)".
- **Timetable** (L3609–3644): full day + "Message <form teacher>".
- **Profile** (L2870–2972): hero; **How the school reaches you** (phone · checked, email · checked, address); **Your children** with VIEWING + Manage; **Your account** (Sign-in & safety w/ "EXTRA CODE ON", Alerts, Past payments); **App settings** (Language picker sheet EN/Shona/Ndebele, Help, Rules & privacy); Sign out (confirmation sheet); version line.
- **Security** (L3732–3894): 2FA toggle + spare codes; change PIN / change phone / biometrics. **Alerts** (L3896–3953): event × SMS/Email/Push matrix + quiet hours. **Children / child profile** (L3955–4060) with "Add another child" via link code. **Help** (L4061–4120): FAQ + call / email / WhatsApp the school rows. **Child switcher** sheet (L1701–1749) with "Add another child".

#### Student — `docs/design-system/portals/student.html`
Bottom tabs (L959–964): **Home · Timetable · Marks · Profile**. App bar (L982–1002): back button on sub-screens, title, **bell with numeric unread count**, avatar; per-screen actions (download, search, filter, heart, edit, mark-all-read, settings, info). Offline banner. Sign-in / signed-out / 5-step onboarding tour (L2092–2255).

Routes (L943–952): `home`, `timetable`, `marks`, `assignments`, `library`, `profile`, `notifications`, `goals`, `help`, `settings`.

- **Sign in**: student number + **4-digit PIN cells**, "Remember me on this phone", **Forgot your PIN?** (modal: go to form teacher with student card), **Use your fingerprint**, inline error. Signed-out screen with "Sign back in".
- **Home** (L1004–1136): bar reads "Hi, <name>"; `school · form · term · week`; **Your next class** card (time/period, subject, teacher · today's topic, room, "starts in 16 min") → class sheet; **Your week** dot strip; **This week** KPIs (Homework to hand in with "N overdue" delta + "3 before Friday · 2 today"; Latest mark with "▲ 6%"); **Recent marks** sparkline (last 8 tests) + subject pills; **Quick links** (Library "3 books out · 1 overdue · $2.50", Homework "N in total", My goals "x/y on track", Messages "N new"); **School news** dark banner.
- **Timetable** (L1138–1276): week ← → nav, Mon–Fri × period grid with subject colours + room + "prepared/help" dots, Today list; **class sheet** (When/Where/Teacher/Lesson n of 6, What you'll learn, Bring with you, "I need help" / "I'm ready"); download action.
- **Marks** (L1278–1416): T1/T2/T3 tabs + year; hero overall /4.0 with delta and **Place N of M · Top X%**; subject row-cards with bar → **marks sheet** (Total, place, CA 30% / Term test 70%, CA list, **class histogram with own bar highlighted**, teacher comment, Set my goal / Ask <teacher>); Download report card; visibility note.
- **Assignments** (L1418–1716): search + filter; chips To do / Overdue / Handed in / Marked with counts; sheet with status pill, What to do, **Files from teacher** (download), plagiarism note, **Your work** upload (Pick file / Change / Remove), **Messages** thread with compose, Hand in / Hand in (late); **upload progress** stages; **receipt** sheet (`SUB-xxxxxx`, share, also pushed to notifications); offline → "saved, sent when back online".
- **Library** (L1718–1943): search title/author/ISBN + **scan icon**; **fines pill with Pay**; **Scan to return** card; catalogue results with covers "Take out"/"None left"; **Books you have out** (due states, Keep longer / Bring back, Past loans); Just taken out; **Books I want to read**; book sheet; scan-return sheet.
- **Notifications** (L2256–2288): count line, Mark all read, settings, Clear all, kind icon, unread weight.
- **Goals** (L2290–2395): **week-study bars** hero, per-subject cards (current/target, "✓ You did it!" / "N% to go", bar with target marker), "Start over"; goal sheet with 50–100 slider.
- **Profile** (L1945–2075): ID card (pills id/status; stats Days at school %, Place in class, Overall); contact rows; theme seg; notification toggles; More; Change PIN; Privacy; Sign out; version.
- **Settings** (L2488–2660): push/email, cadence Now/Daily/Weekly, mark visibility Me/Class/School, fingerprint, theme, language EN/SN/ND, **Change PIN** 3-step sheet, replay tour, reset.
- **Help** (L2397–2486): search; article cards → sheet with "Was this helpful?"; **Talk to someone** (call form teacher, email ICT, live chat).

#### Teacher — `docs/design-system/portals/teacher.html`
Side rail (L1482–1530): brand, **who card**, **My classes** (swatch, form · subject, room · size, count), Daily work (Today, Attendance, Enter marks, Marks book, Messages, Timetable, Lesson plans), More (Homework, Shared files, Reports, Parent meetings), Account (Profile, Settings, Help), **Sign out → shared-device modal** ("locks the tablet… drafts stay safe 24 h"). Top bar (L1532–1573): crumb + title, **Online/Offline** toggle, **bell with unread-messages count → inbox**, Fullscreen. Dashboard tab strip: Today · Marks (badge) · Messages (badge) · Timetable · Lessons. Offline banner "You're offline · changes will save once the internet comes back".

- **Sign in** (L2859–2911): Staff ID + password, **"Shared classroom tablet (locks after 10 min idle)"**, Forgot password, "Need access? Ask IT", inline error.
- **Today** (L1660–1837): greeting + "Set new homework"; **Today's lessons rail** (period · time, class, subject · room, current highlight, free) — tap opens that class's roll; **Up next · Mark attendance** card with "last taken … 2 absent"; **Papers to mark** (row cards with counts); **Parent messages** (3 unread threads → inbox); **This week** stats (homework set, papers, attendance %).
- **Roll** (L1844–1963): crumb (day · period · time), subject/room/N pills; **Present/Absent/Late counter**; Quick mark All present / All absent / Start over; A–Z rows with **P / A / L three-way toggle**; sticky **"Save & go to next class"** → confirm modal (counts, "Parents of absent pupils will get an SMS") → advances to next class on the schedule.
- **Enter marks** (L1972–2150): toolbar Term · Test segment (Quiz 1 / Class test / Mid-term / End-of-term) · **Out of** · Done/Average/Top/Lowest pills · Save · **Send to parents**; table Pupil / mark input / **Percent** / **Grade pill (live A/B/C/U)**; footer `Tab` next pupil, `Enter` save & next, allowed range; publish modal.
- **Marks book** (L2180–2352): hero class average + Highest / Lowest / Assessments; chips All / Class tests / Exams / Homework; term select; **Download** CSV; table with **one column per assessment** (type tag, /max), **inline cell edit** (Enter/Esc/blur), Average + grade chip, **Add column** modal (name, type, out of, weight %), class-average footer.
- **Messages** (L2354–2556): split layout; inbox (search, Inbox/Sent/Announcements, threads with child · form, preview, time, unread count); **"Send to whole class"** broadcast sheet (class chips, title, message, preview, "Send to N parents"); thread header (parent, child · form, Online, call); stream with day dividers + attachments; compose with **Attach file / Quick reply / Send later**; back button on phone.
- **Timetable** (L2558–2698): week nav, Today, **Add cover lesson**, legend; grid; cell modal (topic, materials, Open lesson plan, **Mark attendance for this class**); cover modal.
- **Lesson plans** (L2718–2857): Plans / Shared files tabs; Copy from last week; New lesson plan; grid; drawer (ZIMSEC/Unit/CALA pills; Topic, objectives, materials, homework; Mark as done, Copy, Save plan).
- **Homework** (L2913–3106): New task, Pick from shared files, All/Open/Due this week/Finished; rows with tags, set/due, In / Marked bars, stats; new modal (classes chips, due, rubric, attachments); detail (Submitted/Marked/Pending tiles, **Remind unsubmitted**, Mark all).
- **Shared files** (L3111–3204): search, subject/form, **Upload** modal; card grid.
- **Profile** (L3206–3293): Edit / Change password / Sign out; This year stats; Contact / Teaching load / Qualifications.
- **Meetings** (L3295–3404): Open slot, Sync to calendar, Export iCal; month; bookings; accept/decline.
- **Reports** (L3406–3509): Export PDF; 4 stat tiles with deltas; attendance trend, pass rate by class, grade distribution, at-risk list.
- **Settings** (L3511–3651): Notifications, Mark publishing (window, deputy sign-off, grade-not-raw in SMS), Appearance (theme, density, reduce motion), Security (2FA, idle timer, change password, sign out everywhere), Privacy (export, audit, avatar).
- **Help** (L3653–3720) and a **States** demo (L3722–3790) showing skeleton / empty / error / offline.

---

## 1. PARENT portal

Shell: `components/schools/portal/parent/parent-portal-shell.tsx` (bespoke chrome; `pa-bar` 52px + `.b-bottom-tabs`). Data: `(shell)/layout.tsx` loads the household server-side; child selection persisted in `localStorage` (`parent-portal-context.tsx`).

### 1.1 Page-by-page

| Route | Prototype parity gaps (prototype shows → code renders) | Mobile (390px) | Friction / task flow | Severity |
|---|---|---|---|---|
| **Shell** `parent-portal-shell.tsx` | Prototype app bar has a **back arrow on 20 sub-routes** (parent.html L1855–1863) → code bar has **no back affordance at all** (L81: `<h1>{title}</h1>` only). Prototype bell pip counts notices **and** messages (L1928) → code pip counts notices only (L104–108). Prototype **offline banner** (L1824) → none. Prototype hamburger → none (fine, but nothing replaces it). | `.b-bottom-tabs` is `display:none ≥901px` (`app/styles/components.css` L2368) and the shell draws **no side nav** → a parent on a laptop or iPad-landscape has **no navigation** except the bell. Violates R6 (`.ps-side` for tablet/desktop) and R7. | Sub-screens (Attendance, Marks, Messages, Help) are only reachable via Home/Profile deep links; on them the tab bar shows *no active tab* (`isActive` L64) so the parent has no "where am I". | **P0** (no nav ≥901px), **P1** (no back) |
| **Home** `/portal/parent` `parent-home-screen.tsx` | Hero: prototype **Pay now** (L2059) → code **"See fee statement" + "From the school"** (L172–178) — a notices link placed where the money action belongs. Prototype "pay by <date> · N days to go" → code has date, no countdown. Prototype **Quick look = attendance % + average mark %** → code shows "Marks: **Ready / Not yet**" (L230), a word in a number tile. Prototype **Shortcuts pill row** (Calendar/Library/Receipts/Messages/Time off/Children) → absent. Prototype "See full day" → `timetable` → code links to **`/attendance`** (L185), which has no timetable. Prototype `school · term · week` → present. Prototype three-row news preview → present but the row links to the list, not to the notice. | Hero renders **"$ 0.00"** as the 36px lead figure when nothing is owed (screenshot) — the one number a parent glances at is a zero. Tiles two-up ✔. Slashed-zero mono renders "$ 49Ø.ØØ" (see §1.2). | **Pay**: 0 taps possible (no flow). **Read a notice**: Home → tap row → lands on the *list*, not the notice → tap row again → it only marks read (§Notices) = **dead end**. **Message teacher**: Home → You → Messages → Write to the school → subject + body → Send = **5 taps + 2 fields**, with no teacher selectable (`teacherProfileId: null` L96 in messages screen). **Switch child**: chip → sheet → row = 2 taps ✔ (good). | **P1** |
| **Fees** `/fees` `parent-fees-screen.tsx` | Prototype pay flow (3 steps + receipt), **Money off**, **Saved ways to pay**, **Past payments** screen, part-pay by tapping lines → none; comment L37 and L333 confirm "there is no payment flow in this portal". Prototype pay bar → repurposed as a **"Statement" download bar** (L335–345). Prototype "Already paid · EcoCash · ref" → code "Already paid · Against SFI-00001" (no method/ref). Receipts list ✔ (with download), invoice lines ✔, "Sent <date>" ✔. | Sticky `.pay-bar` (fixed, `bottom: 64px+safe-area`, `parent-portal.css` L367) permanently costs ~70px of a 844px screen to offer a PDF download; on a paid-up family it reads "What you still owe $ 0.00 · Statement". `NothingLeftToDo` block (L207) is inserted **above** the statement and pushes the first line ~200px down (screenshot). Child header duplicates the app-bar chip (same fact twice, R4). | The core job "pay or see how to pay" has **no answer on screen**: no bank details, no EcoCash merchant code, no reference number to quote. Even without an integrated gateway the prototype's bank-transfer panel (L2401–2418) is static content the school can supply. | **P0** |
| **Attendance** `/attendance` `parent-attendance-screen.tsx` | Prototype **term chips**, **6×5 P/L/A grid**, **legend**, **day drill-in**, **Ask for time off**, **Term report (PDF)**, and the **marks-by-subject** half of the screen → code renders a % card + a flat day list only. | Every row repeats "**not yet submitted**" (L148) — 15 identical sub-labels in the screenshot — then an Alert at the bottom says it again (L163). R4: "never state the same fact twice". Dates are `31 August 2026` with no weekday; a parent asking "was she in on Tuesday" has to count. Rows have no tap target (no drill-in). | The % headline is computed from DRAFT registers (`child.attendance` from the loader) while the rows say those registers are not final — the two halves of the screen disagree. No way to explain an absence (prototype "Tell the school why →"). | **P1** |
| **Marks** `/marks` `parent-marks-screen.tsx` | Prototype **mark detail** (class-work/exam split, descriptor, teacher comment card, **Message <teacher>**) → code shows one card per subject with grade · remarks in the subtitle (L148) and no drill-in. Prototype term chips → code groups by term name with no picker. Report-card download ✔ (L173). Pass/fail toning by subject pass mark ✔ (good, beyond prototype). | Not reachable from the tab bar; only via the Home "Marks" tile, which is hidden when `!canSeeResults`. Skeleton ✔. | "Latest marks in one glance": Home tile says "Ready", not a number; the average the prototype puts on Home is absent. | **P1** |
| **News** `/notices` `parent-notices-screen.tsx` | Prototype notice **detail screen** (body paragraphs, attachments, RSVP, replies) → **none**. Tapping a row only calls `markRead.mutate([notice.id])` (L157–158) and renders `notice.summary` (L167); the API (`app/api/v2/schools/portal/parent/notices/route.ts` L45–46) selects only `title, summary`. "Mark them all as read" ✔, unread pip ✔, tone icons ✔. | Row is a `<button>` whose only effect is to turn its pip into a chevron — a chevron that goes nowhere. Empty state good. | **Read a notice = dead end.** A notice about a fee deadline or a closed school has no body a parent can read. | **P0** |
| **Messages** `/messages` `parent-messages-screen.tsx` | Prototype list (avatar, teacher name, preview, role, time, pip) → code list ✔ minus time. Prototype thread with pill input + round send → code textarea + full-width Send with `pb-24` spacer (L184). Prototype **Message <teacher>** from mark detail / timetable → none; new thread always goes to the office (`teacherProfileId: null` L96). | Thread/list toggle is component state, not URL (`openId`): browser Back leaves the portal instead of returning to the list; the "← All messages" text link (L142) is a 14px text target, not the app-bar back. Compose form appears inline below the list (no sheet). | Not on the tab bar, not on Home; reached via **You → Messages** only. Sending waits on `SavingOverlay` ✔. | **P1** |
| **You** `/profile` `parent-profile-screen.tsx` | Prototype **Sign-in & safety** (2FA, PIN, phone change, biometrics), **Alerts** matrix, **Past payments**, **Language** picker, **Rules & privacy**, **Manage children / Add another child**, address row, version line → all absent. Contact rows ✔, children list with VIEWING ✔, real sign-out ✔. | Phone and email rows carry **chevrons (L68, L78) with no handler** — dead affordances on the two rows the screen exists for. Sign-out has no confirmation (prototype sheet L3007) on a "shared phone is normal here" surface (the file's own comment). | "Main parent" derived from `isPrimary`; relationship shown lower-case ("grandmother") — fine. | **P2** |
| **Help** `/help` `parent-help-screen.tsx` | Prototype FAQ + **call / email / WhatsApp the school** rows → FAQ only. | Not wrapped in `.pp-page`; root is `className="space-y-2"` (L44) so the cards run **edge to edge with no 16px gutter** (visible in both screenshots). Answer 5 says "Use the **row of names at the top of the screen**" (L32) — there is no such row; it is a chip. | No way to contact the school from Help. | **P2** |
| **Login** `app/portal/parent/login/*` + `components/auth/portal-login-form.tsx` | Prototype phone + SMS code + remember-device → email + password. See §4. | — | — | **P1** |
| **Missing routes vs prototype** | `fees/pay`, `fees/method`, `fees/receipt`, `payment-history`, `notice/:id`, `attendance/:day`, `leave-request`, `marks/:idx`, `calendar`, `library`, `timetable`, `security`, `notifications` (prefs), `children`, `child/:id` — **15 of 24** prototype screens have no route. | | | **P0** (contract) |

### 1.2 Screenshot observations

`docs/screenshots/schools/parent-portal-phone/` and `parent-portal-tablet/` (same build at 390 and 768 px).

- **01-home.png** — Strengths: greeting block, tokens and hierarchy look like the prototype; tiles are two-up; the fee hero uses the shared `.b-stat-hero`. Problems: the hero's 36px lead is **"$ 0.00"**; the prototype's positive framing ("fully paid · See receipt") is only in the sub-line. Secondary button "From the school" is an unexplained destination beside a fee action. "Today" card says "No lessons are timetabled…" yet "See full day" still shows (and points at Attendance). "Marks: Not yet" is a word in a numeric tile. The School-news `NothingYet` is cut off at the fold on the phone — only a bell icon is visible above the tab bar, reading as a broken widget. The mono face renders **slashed/dotted zeros**: "Paid · $ 49Ø.ØØ" — wrong register for money on a consumer surface.
- **01-fees.png** — Strengths: line-by-line statement with right-aligned mono amounts; "Download this bill" per invoice; "Already paid" in green with a leading minus. Problems: the **"Nothing owing"** empty-state block sits between the "Fee statement" heading and the statement itself, pushing the first line to y≈550 on a phone; the pinned bar reads "What you still owe $ 0.00 · Statement" — a paid family gets a permanent zero. The child header (RC · Rumbidzai Chirwa · Form 1) restates the app-bar chip.
- **01-attendance.png** — Strengths: one-figure summary with sentence under it; status words toned by meaning. Problems: 15 rows each carrying "not yet submitted" in grey; no weekday on dates; no grid, no legend, no term picker; "15 DAYS" mono note at 10.5px on the right is the only count and reads as a badge, not a total.
- **01-notices.png** — Strengths: the empty state is a `NothingYet` with the right sentence and no create button. Problem: on tablet the whole 1024px screen is one paragraph; the prototype's bell-pip explanation is in the body copy ("the bell shows a dot") — explanatory text (R2).
- **01-profile.png** — Strengths: hero avatar, grouped rows, VIEWING pill, red-outline sign-out. Problems: chevrons on phone/email rows that do nothing; "Main parent · 1 child on your account" and "YOUR CHILDREN · 1 CHILD" state the count twice on one screen (R4).
- **01-help.png** — Problems: cards touch the viewport edges (no gutter) on both phone and tablet; first question is auto-expanded, the rest collapsed, but there is no chevron/affordance on any card to say they open.
- **Tablet set** — identical layout stretched to 768px: single column, fixed bottom tabs, no side nav; at 1024px+ (not screenshotted) the tab bar is hidden by `components.css` L2368 and the portal has no navigation.

### 1.3 Concrete suggested edits (parent)

1. **Shell** (`parent-portal-shell.tsx`): add a `BACK: Record<route, href>` table mirroring parent.html L1878–1897 and render a 36px back button in `.pa-bar` for every sub-route; render `.ps-side` (R6) at `≥901px` with the same four items plus Attendance/Marks/Messages/Help; count messages into the bell pip; mount `useOfflineConnectivity` (already used by the teacher shell) and the prototype's offline banner.
2. **Home**: replace "From the school" with **"How to pay"** (opens the payment sheet in §6.3) when `outstanding > 0`, and **"See receipt"** when 0; when `outstanding === 0` make the lead figure the *paid* amount with label "Paid this term" rather than "$ 0.00"; put the **latest average mark** (from `/child/marks`) in the second tile with the term name; point "See full day" at a `/timetable` route; add the Shortcuts pill row (Receipts · Messages · Time off · Calendar).
3. **Fees**: move `NothingLeftToDo` **below** the statement or fold it into the hero sub-line; hide the pinned bar when `outstanding === 0` and give it "How to pay" when > 0; show receipt method + reference on the "Already paid" row; add "Past payments" (child + method chips, grouped by month) using the existing receipts payload.
4. **Attendance**: render the term-week grid (`att-grid` CSS already exists in the prototype), a legend, and weekday-first dates ("Mon 31 Aug"); say "not yet submitted" **once** as a section note, not per row; add "Tell the school why" on ABSENT rows that opens the messages composer pre-filled with the date.
5. **News**: add `notice/[id]` (or a bottom sheet) that renders `body` — extend the API `select` (`notices/route.ts` L45) to include the body/attachments; keep marking read on open.
6. **Marks**: add a per-subject sheet with the teacher remark, grade descriptor and **"Message <teacher>"** that starts a thread with `teacherProfileId` set.
7. **Messages**: put the thread id in the URL (`?thread=`) so Back works; move "Write to the school" into the app bar as the screen's primary action (R3); add a teacher picker.
8. **You**: remove the two dead chevrons or make them open an edit sheet; add a sign-out confirmation sheet; add Language (EN/SN/ND) and Alerts rows wired to the existing notification preferences API used by the teacher settings screen.
9. **Help**: wrap in `.pp-page`; add call/WhatsApp/email rows from the school's contact record.
10. **Typography**: use a mono face without slashed zeros for money, or drop mono on currency and keep `tabular-nums` (prototype uses `font-variant-numeric: tabular-nums` on the hero, mono only on refs).

### 1.4 Missing vs prototype and vs mature parent apps

Vs prototype: in-portal payment (3-step + receipt), payment history + filters, notice detail/RSVP/replies, attendance grid + day drill-in, leave/absence request with attachment, mark detail + message teacher, calendar with add-to-phone, library view, full-day timetable, 2FA/security, notification matrix + quiet hours, language picker, children management + add-by-code, sign-out confirmation, offline banner, back navigation.

Vs mature parent apps (ClassDojo, Seesaw, Arbor, ParentPay, Edmodo-class): push notifications with deep links; **household selection at login** (not only after); **absence reporting** as a first-class action; a **"what's due / what's happening this week"** feed; consent/permission-slip signing (RSVP is the seed); **payment receipts by SMS/WhatsApp** (Zimbabwe reality: EcoCash confirmation SMS is the receipt); **multi-currency display** (USD/ZWG both quoted in `lib/schools/format.ts`); teacher/office contact card with tap-to-call; **language toggle** (Shona/Ndebele are in the prototype); accessibility of the money figure for screen readers (`aria-label="490 dollars"`).

---

## 2. STUDENT portal

Shell: `components/schools/portal/student/student-portal-shell.tsx` (uses `MobileShell` / `MobileShellHeader` / `BottomTabs` from `@corelithzw/react`). Data: `(shell)/layout.tsx` → `loadStudentDay` (today's periods only).

### 2.1 Page-by-page

| Route | Prototype parity gaps | Mobile | Friction | Severity |
|---|---|---|---|---|
| **Shell** | Prototype bell shows a **numeric unread badge** (student.html L987–991) → code bell has **no badge** (L80). Prototype **back button** on Library, Profile, Notifications, Goals, Help, Settings (`{ back: true }`) → code passes no back to `MobileShellHeader` (L71). Prototype per-screen bar actions (download/search/filter/mark-all-read/edit) → none. Prototype offline banner → none. Home title "Hi, <name>" → "Home". | Same `.b-bottom-tabs` breakpoint problem as the parent portal (R7): no nav ≥901px. Bar 52px ✔, tabs 64px + safe-area ✔ (`student-portal.css` L50–54). | On sub-screens the tab bar shows no active tab and there is no back → the pupil relies on the browser. | **P1** |
| **Home** `student-home-screen.tsx` | Prototype **Your week** strip, **Homework due KPI with overdue count**, **Latest mark + delta**, **sparkline**, **School news banner**, class-sheet with topic/materials → all absent; file comment L61–65 says the layout "hands down today's periods and nothing else — so they are left out rather than invented". Next-class card ✔. | Quick-link tiles put **verbs where numbers go**: values are "See all", "Books out", "Your targets", "From school" (L23–44) — R4 says a tile shows a figure. "Right now" tile is `.brand` → renders as a black block (screenshot) — the only dark element on the screen and it holds "—". | **Today's homework due: not on Home** — the one thing the prototype's KPI answers. Pupil must tap Homework → read chips. | **P1** |
| **Timetable** `student-timetable-screen.tsx` | Prototype week ← → nav, class sheet (topic, bring-with-you, I'm ready / I need help), subject-colour cells with prepared dots, download → none; grid + day list ✔ (good). | `DAYS` includes **Saturday** (L30) in the segmented control but the grid is Mon–Fri (`GRID_DAYS`) → "Sat" is a chip that can only produce `NothingMatched`. When the class has no timetable the screen shows **two stacked empty states** (`NothingYet` L166 then `NothingMatched` L241 for the day) — screenshot shows both. Segmented control is 6 equal columns at 390px, 51px each; labels fit but R4 says a section strip scrolls rather than squashes. | Fine when populated. | **P2** |
| **Homework** `student-homework-screen.tsx` | Prototype **file upload** (pick/change/remove) → code has text + **URL field** only (L421 "Link to your work"); prototype **upload progress + receipt number** (`SUB-…`) → toast-style `Alert` "Handed in" (no id); prototype **files from teacher** with download → not rendered (no attachment field on the payload); prototype **per-assignment Q&A thread** → none; prototype search/filter bar actions → none. Chips with counts ✔, overdue-still-allowed ✔, `SavingOverlay` ✔, `NothingLeftToDo` vs `NothingMatched` distinction ✔ (exemplary). | Sheet is `BottomSheet` from the DS ✔ (R4 picker=sheet). "Hand it in" is in the sheet footer ✔. | **Submit homework** = Homework → tap card → type/paste → Hand it in = 3 taps ✔. But a pupil with a photo of an exercise book has nowhere to put it. | **P1** |
| **Marks** `student-marks-screen.tsx` | Prototype **place in class / Top %**, **class histogram**, **CA vs exam split**, **Ask <teacher>**, **download report card** → none (average + delta ✔, term tabs ✔, remarks ✔). Prototype "/4.0" GPA → code "/100" average (better for ZW). | `sp-note` at the bottom explains publishing policy in two sentences — explanatory copy (R2), already stated in the empty state. | "See marks": Marks tab → term → subject = 1–2 taps ✔. | **P2** |
| **Library** `student-library-screen.tsx` | Prototype **scan-to-return**, **fine payment**, **reading list**, **past loans**, book sheet with copies/keep-for → none (comment L107–109 explains the scan card is deliberately omitted). Borrow / renew / reserve / return ✔ (real actions, beyond prototype's mock). | Two stacked empty states ("Nothing out at the moment" + "The shelf is empty") in the screenshot; the search box sits above an empty catalogue with nothing to search. | Fine. | **P2** |
| **Goals** `student-goals-screen.tsx` | Prototype **weekly study bars** → none; slider → number input; target marker on bar ✔; teacher note ✔. | Hero holds a **two-sentence lede** (L254) — R2/R4; each card states "no goal" **three ways** ("· no goal yet", "–/–  Not set", "Not started" badge) — R4. "0/0 reached" and "0/0 on track" say the same thing 40px apart. | Set a goal = Goals → card → type → Save = 3 taps ✔. | **P2** |
| **Notifications** `student-notifications-screen.tsx` | Real notification centre ✔ (better than prototype's fake feed), Mark all read ✔, Clear all with confirm ✔. Prototype settings action → none. | "0 messages · 0 new" line above "Nothing new" — the same fact twice (R4). Bell in the bar has no count so the pupil cannot know to come here. | — | **P2** |
| **Profile** `student-profile-screen.tsx` | Prototype contact rows, theme seg, notification toggles, Change PIN, days-at-school %, place in class → replaced with a read-only fact list and a "Held by the school" explainer. | **Form 1 / Term 3 appear four times** on one screen (ID-card subtitle L96-ish, ID-card stats L167, "Your details" rows L127/L133) — R4. The "Held by the school" section is five paragraphs of policy explanation on a pupil's phone (R2). | Fine. | **P2** |
| **Settings** `student-settings-screen.tsx` | Prototype push/email/cadence/visibility/fingerprint/theme/language/Change PIN → none of them; an `Alert` titled **"Three things from the design are not here yet"** (L79) explains the gap **to the child**. "Change your password" links to **`/settings/profile`** (L44) — the back-office settings shell, outside the portal. | The Alert is engineering commentary on a consumer screen (R2, R8). | Dead-end / wrong-shell link. | **P1** |
| **Help** `student-help-screen.tsx` | Prototype search, article sheets with feedback, **call form teacher / email ICT / live chat** → `<details>` accordions + a one-row "The school office" with no action. | Chevron does not rotate on open (screenshot shows right-chevrons on every closed row; nothing indicates the open state beyond the body appearing). | — | **P2** |
| **Login** | Prototype student number + 4-digit PIN + Forgot PIN + fingerprint → email + password (see §4). Placeholder "name@company.com", label "Work email" for a 13-year-old. | — | — | **P1** |

### 2.2 Screenshot observations

`docs/screenshots/schools/student-portal/01-student-home.png`, `student-portal-phone/*`, `student-portal-tablet/*`.

- **01-student-home.png** — Strengths: clean bar (bell + avatar), section eyebrows, tiles two-up, `NothingLeftToDo`-style copy for "Nothing left today". Problems: five of six tiles carry text values ("See all", "Books out", "Your targets", "From school", "—"); "Lessons today 0" uses a slashed zero; the "Right now" tile is solid near-black on an otherwise light page (`.brand` in the student theme = ink) — visually it reads as a disabled/error block. No school-context line other than "Form 1 · Term 3".
- **01-timetable.png** — Two empty states one above the other; a "Clear the filters" button whose filter is the day picker; "Sat" chip that can never have content. Term/Form header is centred and mono ("Form 1" in mono is a code, not a name).
- **01-homework.png / 01-marks.png** — Good `NothingYet` sentences; whole screen otherwise empty; no skeleton visible (state captured after load).
- **01-library.png** — Search field above an empty shelf; two empty states; the section eyebrows "BOOKS YOU HAVE OUT · 0" and "THE SHELF · 0" carry zeros (R4: "a zero is not a count").
- **01-goals.png** — Orange hero with three lines of explanation; every subject card repeats "no goal" three times; badge "Not started" is grey-on-grey at 11px.
- **01-notifications.png** — "0 messages · 0 new" then "Nothing new".
- **01-profile.png** — Handsome orange ID card, but Form 1 and Term 3 appear in the subtitle, in the stats row, and twice more in the list beneath.
- **01-settings.png** — Two working rows, then a blue info box titled "Three things from the design are not here yet".
- **01-help.png** — Accordion cards with a non-rotating chevron; the "Talk to someone" row is a paragraph, not a contact.
- **Tablet set** — same single column at 768px; no side nav; `NothingMatched` buttons and eyebrows scale but content does not use the width (fine for a phone-first app, but R6 expects a side nav on tablet).

### 2.3 Concrete suggested edits (student)

1. **Shell**: pass `unread` into the bell (query `fetchNotifications({limit:1})` or the shell's `day` payload) and render the prototype's 14px count badge; pass `back` to `MobileShellHeader` for the six non-tab routes; add per-screen bar actions (Homework: filter; Marks: download; Notifications: mark-all-read).
2. **Home**: make the loader (`lib/schools/student-day-loader.ts`) or a client query return `homework { due, overdue }`, `latestMark { subject, score, delta }`, `unread`, `library { out, overdue, fines }` and fill the tiles with **numbers**; replace the black "Right now" tile with the prototype's brand-soft KPI; add the school-news banner from the notifications query.
3. **Timetable**: `DAYS = GRID_DAYS`; when the week query returns no slots, skip the day picker and the second empty state; add ← → week nav (the API takes `weekStart`? if not, hide the arrows rather than fake them).
4. **Homework**: add photo/file capture (`<input type=file accept="image/*,application/pdf" capture>`) feeding the existing `attachmentUrl` via the documents upload used elsewhere; show a receipt code (`submission.id` short form) in the success Alert and push it to notifications; render teacher attachments when the assignments API carries them.
5. **Goals**: shorten the hero to the count; show "Set a goal" as the card's single call-to-action when none exists (drop the badge and the "–/–").
6. **Profile**: keep the ID card; drop the "Your details" rows that repeat it; collapse "Held by the school" into one Callout line.
7. **Settings**: remove the explanatory Alert; hide unbuilt rows (R: "hide invalid actions"); point "Change your password" at a portal-scoped password screen (or the portal login's reset once it exists).
8. **Help**: rotate the chevron on `details[open]` (`.sp-help-card[open] .sp-hc-chev { transform: rotate(90deg) }`); make "The school office" a `tel:`/`mailto:` row from tenant contact details.

### 2.4 Missing vs prototype and vs mature student apps

Vs prototype: PIN sign-in + Forgot PIN + biometrics, onboarding tour, week glance, homework KPI, latest-mark delta, sparkline, school-news banner, class sheet (topic / bring / ready-or-help), week navigation, marks histogram + rank + CA/exam split + ask teacher, file upload + progress + receipt, teacher files, per-assignment thread, scan-to-return, fine payment, reading list, past loans, study-week bars, goal slider, contact rows, theme, language, cadence, visibility, Change PIN, help search/feedback/live chat, offline banner, bell badge, back navigation.

Vs mature student apps (Google Classroom, Seesaw, ManageBac, Satchel One): a **due-soon list on Home**; **calendar view of deadlines**; **camera capture** for hand-ins; **draft autosave** for typed answers; **notification when marked**; **dark mode** (prototype offers it; `app/globals.css` L1741 declares the product light-only).

---

## 3. STAFF / TEACHER portal

Shell: `components/schools/portal/teacher/teacher-portal-shell.tsx` wraps the **back-office `AppShell`** (`components/layout/app-shell.tsx`, a `SidebarProvider`/`SidebarInset` shell) with a bespoke rail, a two-line bar and a five-item tab strip. Data: `(shell)/layout.tsx` → `loadTeacherDay`, refreshed by `useQuery` in the context.

### 3.1 Page-by-page

| Route | Prototype parity gaps | Mobile / tablet | Friction | Severity |
|---|---|---|---|---|
| **Shell** | Prototype **bell = unread parent messages → inbox** (teacher.html L1552–1555) → code bell links to Messages but its badge is **`papersToMark`** (L271–277) — a "20" on the bell that has nothing to do with messages; the same 20 appears on the Marks tab, the rail item and the Today card (four places, R4). Prototype **shared-device sign-out modal** → `NavRailItem to="/api/auth/signout"` (L250), a GET to next-auth's generic confirm page. Prototype **Fullscreen** and **Offline toggle** → Online/Offline chip only (real connectivity ✔, `useOfflineConnectivity`). Prototype offline **banner** → chip only (the register screen adds its own Alert). Prototype class rows show **room** → code shows `classCode · size` (room not in payload). | Below the `md` breakpoint `AppShell` collapses the rail into the back-office sidebar sheet — the prototype has no phone layout either, but R4's "no chrome a phone will never use" applies: the 220px rail with 12 class rows, then three nav groups, is ~900px of sidebar on a phone. `.te-tabs` strip is `overflow-x:auto` with `padding: 0 22px` (`teacher-portal.css` L247–254) — it stops 22px short of the edge (R4: reads as clipping, not "more"). | Class switch is one tap in the rail ✔ (good). "Sign out" on a shared staff tablet has no confirm and no idle lock. | **P1** |
| **Today** `/portal/teacher` `teacher-today-content.tsx` | Prototype **Parent messages card** (3 unread threads) → none. Prototype "Up next" card with "last taken Wednesday, 2 absent" → present with register status ✔. Prototype "Set new homework" opens the form → code **links to the Homework page** (L100) where the teacher must press "Set homework" again (two taps for one verb). Lessons rail with register-taken badges ✔ (better than prototype). Papers-to-mark ✔, This-week tiles ✔. | Two-column cards collapse at `<60rem` ✔ (`teacher-portal.css` L421). Bell "20" and tile "PAPERS TO MARK 20" and "Marks 20" in the strip on the same screen. | Register from Today: tap a rail cell → Attendance (class pre-selected) = **1 tap** ✔. | **P2** |
| **Attendance** `/attendance` `teacher-register-screen.tsx` | Prototype **P / A / L three-way toggle** per row → code `SegmentedControl` with **four** options incl. Excused (fine) but no keyboard/one-hand grouping; prototype **"Save & go to next class"** with confirm modal that **advances to the next period** (L1936–1960) → code "Save the register" then stays (L420); prototype "Parents of absent pupils get an SMS" → none; prototype period/time crumb → date input instead (no period — a day register, not a per-period register). Counter ✔ (+ Not marked, good), quick-mark ✔, search + "Not marked" view ✔ (better than prototype), `SavingOverlay` interlock ✔, locked-day Alert ✔, honest offline Alert ✔. | Row = avatar + two-line name + "Not marked" badge + 4-way segmented control: at 390px the control (≈290px) wraps under the name (`flex-wrap`), so each pupil is ~110px tall → 30 pupils ≈ 3,300px of scrolling; prototype's rows are 56px. `<input type=date>` at top-right is the only date control (no "Yesterday / Today" shortcut). Sticky save bar ✔. | **Mark a register in < 1 min**: Today → cell (1) → "Everyone present" (2) → tap the 2 absentees (3–4) → Save (5) = 5 taps, ~20 s ✔. But: no confirm, no next-class advance, no "last taken" memory, and the "Undo my changes" ghost button sits beside the destructive "Everyone absent" (R4: destructive under the thumb confirms first). | **P1** |
| **Enter marks** `/marks` `teacher-marks-screen.tsx` | Prototype **Out of** editor, **Done/Average/Top/Lowest** pills, live **Percent + Grade** columns, `Tab`/`Enter`-next hints, **Send to parents** publish modal, term + test segmented pickers → code has a `<select>` of assessments, a % beside each input (L318 ✔), Mark absent ✔, blanks-only view ✔, `aria-invalid` on over-max (L328 ✔) but **no visible error text**, no grade, no class stats, **no publish**. Save ✔ under `SavingOverlay`. | Inputs are `w-24` right-aligned mono ✔ `inputMode=decimal` ✔. No `Enter` → next-row handler; a teacher entering 30 marks uses the on-screen keyboard's "next" only if the browser provides it. | **Enter marks for a class**: rail class (1) → Marks (2) → select assessment (3) → type 30 numbers → Save (4). Publishing to parents is a separate person's job via Marks book → result sheet → HOD, which the prototype hides behind one "Send to parents" button. | **P1** |
| **Marks book** `/marks-book` `teacher-marks-book-screen.tsx` | Prototype **assessment columns**, **add column**, **inline edit**, **chips by type**, **term select**, **CSV download**, hero with highest/lowest → code shows Continuous / Exam / Term mark / Grade per pupil (term-mark roll-up, not a gradebook), a **"Send to the result sheet"** button that is disabled for non-HODs with a tooltip naming who can (R5 ✔). | Table `min-w-[36rem]` inside `overflow-x-auto` ✔ (only tables may scroll sideways). Grade column renders as an unlabeled coloured square at desktop width (screenshot: tiny amber/green/red chips with no letter visible — the `Badge` shows the band code but it is clipped to a 12px square in the capture). | Reading ✔; editing requires going to Enter marks. | **P2** |
| **Messages** `/messages` `teacher-messages-screen.tsx` | Prototype **split inbox/thread layout**, **Send to whole class** broadcast, **Quick replies**, **Attach**, **Send later**, Inbox/Sent/Announcements, call button, online pill → code is a single-column list ↔ thread toggle with search + "Show the N new". **No way to start a thread**: "Parents start them from their own portal" (L261). Reply ✔ under `SavingOverlay`. | Thread state is component state (no URL) → Back leaves the portal. "Back to all" is a ghost button in the card header rather than the app bar. | **Message parents**: impossible to initiate; a teacher who wants to tell 2A's parents about Friday's quiz has no path. | **P0** (broadcast is the README's "realtime chat requirement") |
| **Timetable** `/timetable` `teacher-timetable-screen.tsx` | Prototype cell modal with **"Mark attendance for this class"** + open plan ✔ (L556–575 has both as buttons), cover lesson → "Hide free periods" + "Lay out this week" instead; legend missing; week nav ✔. | `CardsSkeleton count=6 columns=3` for a 5-day grid — skeleton does not mirror the grid (R5). | ✔ | **P2** |
| **Lesson plans** `/lessons` `teacher-lessons-screen.tsx` | Prototype drawer (topic/objectives/materials/homework, done toggle, copy) ✔ as a dialog; **Copy last week forward** ✔ with confirm; **Lay out this week** ✔ (beyond prototype, from the scheme of work); Plans/Shared files tabs → separate route; "Every lesson planned" pill shows even when "0 of 0" (screenshot). | Same skeleton mismatch. | ✔ | **P2** |
| **Scheme of work** `/syllabus` | Not in prototype; HOD-gated save named on the button ✔ (R5). | — | — | ✔ |
| **Homework** `/homework` `teacher-homework-screen.tsx` | Prototype **Remind unsubmitted** → none; **attachments** → none; rubric type → "Out of" only; class chips (multi-class) → single class `<select>`; In/Marked progress bars ✔ (`Progress`), board dialog with per-pupil mark ✔, draft vs set ✔. | Two `FilterSelect`s stacked above an empty list; "Set homework" appears twice on the empty screen (bar + empty state) — acceptable per R5 (empty offers the verb) but the page also carries a lede sentence (R2). | **Set homework**: Homework → Set homework → class, title, due → Set it now = 4 taps ✔. From Today it is 5 (see above). | **P2** |
| **Shared files** `/files` `teacher-files-screen.tsx` | Prototype **Upload** → **links only** ("Files themselves land with the documents work in a later release" — the page lede says so to the user). | Lede paragraph explains the limitation on-screen (R2). | — | **P2** |
| **Parent meetings** `/meetings` `teacher-meetings-screen.tsx` | Prototype accept/decline bookings, iCal, sync → "Open an evening" slot creation + release ✔; calendar ✔. | The left card holds a three-line explanation under the calendar plus two stat tiles reading "0 / of 0 this month" (slashed zeros). | — | **P2** |
| **Reports** `/reports` `teacher-reports-screen.tsx` | Four tiles ✔, attendance trend ✔, grade distribution ✔, at-risk list with "tell the office" ✔, class-by-class table ✔; Export PDF → none. | Attendance chart is a raw polyline with labels dumped beneath as inline text ("94% w/c 10 August 2026 92% w/c 17 August…") — not the DS chart defaults (dashed grid, muted axis labels, Playbook L115–127). "Homework handed in — / 0 set this term" tile is a dash where R4 says a tile with nothing is not a tile. | — | **P2** |
| **Profile** `/profile` | Prototype Edit / Change password / qualifications / this-year stats → read-only card + Settings link; This-term stats ✔. | Contact grid labels wrap at tablet ("STAFF CODE" over two lines, screenshot). | — | **P2** |
| **Settings** `/settings` `teacher-settings-screen.tsx` | Five sections ✔ with a rail + search ✔; but "School notifications" lists four rows stamped **"Not yet available"** under a sentence "Nothing behind these yet…" — the prototype's controls rendered as inert placeholders (R: hide invalid actions). | Rail is a stacked column on tablet (fine at 768) — must become a strip on a phone (R4). | — | **P2** |
| **Help** `/help` | ✔ guides + FAQ + "Still stuck" link; FAQ "I have forgotten my password" exists while the login has no reset (§4). | — | — | — |
| **Login** | Prototype Staff ID + password + shared-tablet mode + forgot password → shared email/password form; see §4. | — | — | **P1** |

### 3.2 Screenshot observations

`docs/screenshots/schools/teacher-portal-desktop/*` (1440×900) and `teacher-portal-tablet/*` (1024×768).

- **01-today.png** — Strengths: rail with subject swatches and counts; two-line bar; tab strip; greeting; card grid. Problems: "20" is displayed on the bell, the Marks tab, the rail's "Enter marks" and the "Papers to mark" tile simultaneously; "0 lessons today", "0 periods", "REGISTERS UNMARKED 0", "HOMEWORK OPEN 0" — four zeros, all slashed; the "No periods are set up" empty card is 280px tall inside a card that already has a title. On tablet the three "This week" tiles wrap 2+1.
- **01-attendance.png** — Strengths: colour-toned counters, quick-mark row, search + view segment, one row per pupil with avatar and mono id. Problems: 20 rows each carrying a "Not marked" badge **and** an empty segmented control (the state is stated twice per row); the date field shows `09/07/2026` (US order in a `type=date` input on an en-GB surface — browser-locale dependent, but the screenshot shows M/D/Y); no period/time context (prototype "Thu 22 May · Period 3 · 09:20"); no sticky save bar visible in the first screen on desktop (it is at the bottom of a 20-row list).
- **01-marks.png** — Empty state only ("No assessments for this class yet… The office sets them up under Assessments") — sends the teacher to a screen they may not have; no "Create an assessment" verb.
- **01-marks-book.png** — Strengths: clean table, mono right-aligned percentages, "Nothing marked yet" as a row sub-label, disabled "Send to the result sheet" with a reason on hover. Problems: the GRADE column renders as unlabeled 12px colour squares; band tone (≥70 green, ≥50 amber, else red) is not the school's own band scheme; no column for individual assessments.
- **01-timetable.png / 01-lessons.png** — Empty card with a long explanatory sentence; "Every lesson planned" green pill next to "0 of 0 lessons planned".
- **01-homework.png / 01-files.png** — Lede sentence + filter row + centred empty state; "Set homework"/"Add a link" appear twice.
- **01-meetings.png** — Calendar with no selectable days (all grey), explanatory paragraph, two stat tiles "0 this month / 0 of 0 this month".
- **01-reports.png** — Good stat-tile band; the attendance polyline has no axes, no dashed grid and dumps its labels as run-on text; the grade-distribution list is fine; "HOMEWORK HANDED IN —".
- **01-profile.png** — Two-column layout with a stats card; on tablet "STAFF CODE" wraps and the mono email dominates.
- **01-settings.png** — Rail + panel works; four "Not yet available" chips.
- **01-help.png** — Accordion cards with chevrons (rotate not verified).
- **Tablet set** — same layout at 1024px with the rail still open (250px) and content at 750px; nothing breaks, but nothing is tablet-specific either (no larger touch targets, `SegmentedControl size="sm"` on the register).

### 3.3 Concrete suggested edits (teacher)

1. **Shell**: give the bell the **unread messages** count (add `unread` to `/me/messages` summary or the day payload) and keep papers on the Marks tab only; replace `/api/auth/signout` with a confirm dialog (`dsConfirm`) that calls `signOut({callbackUrl: loginPath})` and mentions unsaved drafts; run `.te-tabs` to the screen edge (`padding-inline: 0; scroll-padding: 22px; scroll-snap-type: x mandatory`); at `<md` render a 5-item bottom tab bar (Today / Attendance / Marks / Messages / More) instead of the sidebar sheet; add the offline banner strip under the bar when `isOffline`.
2. **Today**: open the Set-homework dialog directly (lift `formOpen` state to a `?new=1` query the Homework screen honours); add a "Parent messages · N new" card fed by `/me/messages`; suppress the "This week" tile when its value is 0 *and* its denominator is 0.
3. **Register**: compact row (`min-height:56px`, name one line, control 3-way P/A/L with Excused behind a long-press or a per-row `···`); add "Save & next class" that advances `setClassSubjectId` to the next lesson in `day.periods`; confirm dialog with counts and the SMS note when `absent > 0`; show period + time when the register is per-lesson; move "Everyone absent" behind a confirm.
4. **Enter marks**: `onKeyDown Enter → focus next input`, `Tab` hint footer; live grade column using the class's band scheme (already available to Marks book via `grade.code`); per-row inline error text on `overMax`; class stats pills (done / average / top / lowest); a **"Send to parents"** verb that either publishes (if the teacher may) or hands off to the HOD with a named refusal (R5).
5. **Marks book**: add assessment columns from `/api/v2/schools/assessments?classSubjectId=` with inline edit (PUT scores) and "Add an assessment" for teachers who may; render the grade code text, not a swatch; CSV export.
6. **Messages**: **Start a conversation** (pick pupil → guardians → subject/body) and **Send to whole class** (class chips, preview, count) using the existing thread API; put `?thread=` in the URL; split layout at `≥60rem` (list left, thread right) as the prototype draws; quick-reply chips.
7. **Reports**: use the DS chart primitives (dashed 4/6 grid, 11–12px muted axis labels, canonical colours) for the attendance series; hide a tile whose denominator is 0.
8. **Settings**: hide "Not yet available" rows (or move them to a single "Coming" note) — R: "Hide invalid actions; do not show disabled invalid actions".
9. **Empty states**: prefer `NothingYet` with the verb when the teacher can act ("Create an assessment" if `schools.assessments` create is granted, else name who can — `whoCan()` exists).

### 3.4 Missing vs prototype and vs mature teacher apps

Vs prototype: shared-device sign-out + idle lock, parent-message card on Today, next-class advance on save, publish-to-parents, live grade + stats on entry, assessment-column gradebook + add column + CSV, message initiation + broadcast + quick replies + attachments + send-later, cover lessons + legend, file upload, remind-unsubmitted, meeting accept/decline + iCal, report export, 2FA / sign-out-everywhere / idle timer, help chat, fullscreen.

Vs mature teacher apps (Arbor, SIMS Teacher, ClassCharts, Google Classroom): **per-period registers** with late-minutes; **seating plan** view for the register; **bulk SMS/WhatsApp to parents**; **behaviour/merit notes** (README notes discipline is unsold — but every teacher app has it); **mark-entry by keyboard** with Enter/Tab; **offline register queue** (README: "attendance capture… keep working with no connection" is a sales promise; the register Alert admits the portal is not offline-capable).

---

## 4. Login / invite / claim UX

Files: `components/auth/portal-login-form.tsx`, `app/portal/{parent,student,teacher}/login/{page,client}.tsx`, `app/api/public/schools/claim/[token]/route.ts`, `components/schools/portal/claim-portal-account-content.tsx`, `app/c/[token]/page.tsx`, `components/schools/portal/portal-invite-dialog.tsx`, `lib/platform/portal-hosts.ts`, `lib/utils.ts` (`companyLabelFromHost`).

Findings:

1. **One form for three audiences, written for the back office.** Label **"Work email"** with placeholder **"name@company.com"** (`portal-login-form.tsx` L164–168) is shown to parents and 13-year-olds. Error copy includes "Use your organization URL to sign in", "This organization is currently inactive", and POS strings (`POS_CASHIER_REQUIRED`, L54). The card is `max-w-[30rem]`, `rounded-[28px]` — the admin login's look, not the portal shell (R6 `.ps-*`). **P1**
2. **Prototype sign-in modes are absent**: parent phone + SMS OTP (parent.html L3039–3152), student number + 4-digit PIN + Forgot PIN + fingerprint (student.html L2092–2196), teacher Staff ID + shared-tablet mode (teacher.html L2859–2911). `lib/auth-core/config.ts` L89 warns "OTP delivery/verification plumbing is not live yet". A parent in Zimbabwe generally has a phone number on the school record, not an email; the invite dialog **skips guardians with no email** (`portal-invite-dialog.tsx` L64–66, "Skipped — no email address"), so a share of families can never be invited. **P0** for the parent portal's reach.
3. **No "Forgot password"** anywhere on the three login pages; `app/api/users/password-reset/route.ts` exists but no portal page uses it. The teacher Help FAQ has an "I have forgotten my password" entry (`teacher-help-screen.tsx`) pointing nowhere the login can. **P1**
4. **Remember me** ✔ ("Keep this device signed in", L217) gated by `credentialsStrategy.supportsRememberMe`. Caps-lock hint ✔, show/hide password ✔, precheck of tenant host ✔.
5. **Tenant branding**: only `companyLabelFromHost` (`lib/utils.ts` L8–17: second hostname segment title-cased) → "St Marys". No school logo, colour, or portal-specific hero; `lib/platform/tenant.ts` carries no theme fields. The prototype brand block is "Huchu Parent" with a mark — the code shows the school name as the H1 and "Guardian Portal" as an eyebrow (`parent/login/client.tsx` L17). **P2**
6. **Household selection**: nothing at login; the child chip is set post-login from `localStorage`. Fine, but a parent with children at **two schools** (prototype's "Add another child at any school") has two tenants and two logins.
7. **Claim flow** (`/c/[token]`): single column ✔, email read-only ✔, min-length live hint ✔, mismatch hint ✔, "used/expired" state with two ways out ✔, no school name by design (documented). Gaps: the "Sign in" button on the already-used state links to **`/login`** (L108) — the back-office login — while the success state correctly uses `signInPath` (`/portal/parent/login` or `/portal/student/login`); no teacher subject in the claim route (`subject === "STUDENT" ? … : "/portal/parent/login"`), so staff invites go to the parent login; the school is never named on the success screen either ("Sign in with … and the password you just chose" — the parent does not know *which* portal URL); no "remember this device"/biometric prompt after claim; no phone-number path. **P1** (wrong link), **P2** (rest)
8. **Invite dialog**: links shown once, copied manually by the bursar (`${origin}/c/${token}` L134) — no "Send by SMS/WhatsApp/email" action, no per-guardian resend; the copy says the school "cannot retrieve a link afterwards". For 800 guardians this is a spreadsheet job. **P1** (operational)
9. **Error messaging**: `getAuthErrorMessage` default returns the raw error string (`default: return rawError`) — an unknown code is printed verbatim to a parent.
10. **Accessibility**: labels and `autoComplete` ✔; the error `div` has no `role="alert"`; submit is disabled until both fields are filled, so a screen-reader user gets no explanation of why "Continue" is inert.

---

## 5. Cross-portal patterns and prioritised fix list

### 5.1 Patterns

- **Strong foundations**: the eight-state discipline is real and consistent (`NothingYet`/`NothingMatched`/`NothingLeftToDo`, `SavingOverlay` around every write, `TableRowsSkeleton` mirroring columns); child/class selection lives above the screens; server-loaded identity so no stranger's empty state flashes; honest copy about what the system does not do; money/dates through `lib/schools/format.ts`.
- **Systemic gaps**:
  1. **No navigation ≥901px** in the two phone shells (`.b-bottom-tabs` hidden by `app/styles/components.css` L2368; no `.ps-side`).
  2. **No back navigation** in the phone shells; sub-screens use in-component state (parent messages, teacher messages, student homework sheet is fine) so Back exits the portal.
  3. **Notification centre**: three different bells — parent pip (notices only), student bell (no badge), teacher badge (papers, not messages). None opens an in-app notification list except the student's; no push/SMS/WhatsApp hooks surfaced to the user (parent prototype's matrix; teacher settings rows are "Not yet available").
  4. **Explanatory copy on consumer screens** (student Settings alert, student Profile "Held by the school", goals hero lede, marks policy note, teacher Files/Homework ledes, teacher Settings "Nothing behind these yet") — R2.
  5. **Same fact repeated** (parent attendance "not yet submitted" ×15; student profile Form/Term ×4; teacher "20" ×4; student "0 messages · 0 new" + "Nothing new"; goals "no goal" ×3) — R4.
  6. **Zeros as leads** ("$ 0.00", "0/0", "0 lessons") with a **slashed-zero mono** face — the numbers a parent or pupil glances at look like codes.
  7. **Dead affordances**: parent profile chevrons; parent notice rows; student "Sat" chip; teacher "Every lesson planned" on 0/0.
  8. **Wrong-shell links**: student Settings → `/settings/profile`; claim "Sign in" → `/login`; teacher sign-out → `/api/auth/signout`.
  9. **Dark mode**: none by product decision (`app/globals.css` L1741); the student prototype offers Light/Dark/Auto — if the product stays light-only, remove the theme rows rather than rendering them as unavailable.
  10. **Tenant theming**: none (no logo/colour in `lib/platform/tenant.ts`); the portals cannot look like the school that bought them, which the marketing bands sell as a "branding + domain" add-on.
  11. **Locale**: dates via `Intl en-GB` ✔; teacher register `<input type=date>` renders in browser locale (screenshot shows `09/07/2026`); no `lang="en-ZW"`; Shona/Ndebele from the prototype absent.
  12. **Status vocabulary**: attendance words differ per portal — parent "In school / Away / Late / Away — excused", teacher "Present / Absent / Late / Excused / Not marked" — a parent and a teacher talking about the same day use different words. Homework: student "Handed in / Handed in late / Marked / Do it again" vs teacher "In / In late / Marked / Do it again" (intentional, documented).

### 5.2 Prioritised fixes

**P0 — blocks a core job or breaks the contract**
1. Parent notice detail (`parent-notices-screen.tsx` L157–167; API `notices/route.ts` L45): add body/attachments and a detail view. *Read a notice is a dead end today.*
2. Parent "how to pay" (`parent-fees-screen.tsx` L333–345, `parent-home-screen.tsx` L172–178): at minimum a **payment-instructions sheet** (bank/EcoCash details + the invoice reference to quote, from tenant settings) behind "How to pay"; then the 3-step flow (§6.3).
3. Navigation above 900px for parent and student shells (`parent-portal-shell.tsx` L115; `student-portal-shell.tsx` L99; `app/styles/components.css` L2368): add `.ps-side` or override the breakpoint for `.pa-shell`/`.student-portal`.
4. Teacher message initiation + class broadcast (`teacher-messages-screen.tsx` L261): the README calls parent messaging "the realtime chat requirement".
5. Parent invite without email (`portal-invite-dialog.tsx` L64–66; `portal-login-form.tsx` L164): phone/SMS-OTP path, or at least phone-number-as-identifier + SMS delivery of the claim link.

**P1 — friction on a core job, or a rule breach visible on every screen**
6. Back affordance in both phone shells; URL-backed thread/detail state (`parent-messages-screen.tsx` L142; `teacher-messages-screen.tsx` L179).
7. Bell semantics: parent pip includes messages; student bell gets a count; teacher bell = unread messages (`teacher-portal-shell.tsx` L271–277).
8. Home KPIs as numbers: parent average mark + "N days to go"; student homework due/overdue + latest mark (`student-home-screen.tsx` L23–44).
9. Parent attendance grid + single "not final" note + weekday dates (`parent-attendance-screen.tsx` L148, L163).
10. Teacher register: compact 56px rows, 3-way toggle, "Save & next class" with confirm, period context (`teacher-register-screen.tsx` L378, L420).
11. Teacher marks entry: Enter-to-next, live grade, stats, per-row error text, "Send to parents" hand-off (`teacher-marks-screen.tsx` L287–328).
12. Student homework: file/photo capture + receipt id (`student-homework-screen.tsx` L421).
13. Login: portal-specific labels ("Phone or email" / "Student number" / "Staff ID or email"), Forgot-password link to `app/api/users/password-reset`, `role="alert"` on errors, no POS strings (`portal-login-form.tsx` L34–58, L164–168).
14. Claim: used-state "Sign in" → portal login by subject; success screen names the portal URL; teacher subject (`claim-portal-account-content.tsx` L108; `claim/[token]/route.ts` `signInPath`).
15. Student Settings: remove the explanatory Alert; fix `/settings/profile` link (`student-settings-screen.tsx` L44, L79).
16. Teacher sign-out confirm + shared-device idle lock (`teacher-portal-shell.tsx` L250).
17. Slashed-zero mono on money/counters (`parent-portal.css` L215, L357; student/teacher tiles): swap to `tabular-nums` sans for figures, keep mono for refs/ids only.

**P2 — polish and remaining parity**
18. Parent Help gutter + contact rows; profile dead chevrons; sign-out confirm; language + alerts rows.
19. Student timetable `DAYS` ↔ `GRID_DAYS`; no second empty state; week nav.
20. Student goals/profile/notifications fact-repetition; help chevron rotation.
21. Teacher `.te-tabs` edge-to-edge + snap; tablet touch sizes; phone bottom tabs; offline banner strip.
22. Teacher reports chart to DS defaults; hide 0/0 tiles; "Every lesson planned" only when > 0.
23. Teacher settings: hide "Not yet available" rows; files upload when documents ship.
24. Tenant logo/colour on login and shells; `lang="en-ZW"`; Shona/Ndebele copy tables.
25. Skeletons that mirror the timetable/lesson grids (`teacher-timetable-screen.tsx` L372; `teacher-lessons-screen.tsx` L443).

---

## 6. Proposed new UI

### 6.1 Home-screen widget sets

**Parent Home (390px, top to bottom; one glance = fees, today, marks, news)**
1. Greeting · `school · term · week N of M` (keep).
2. **Money hero** — when owing: "You still owe · Tendai" / `$ 245.00` (sans, tabular) / "Term 3 · pay by 10 Oct · **12 days to go**" / paid-of-total bar / **[How to pay] [Statement]**. When paid: "Paid for Term 3 · Tendai" / `$ 490.00` / "Receipt sent 3 Sep" / **[See receipt] [Statement]**. Never a `$ 0.00` lead.
3. **Today strip** — up to 4 rows with `UP NEXT`; "See full day" → `/timetable`; if no lessons: one line "No lessons today" and no link.
4. **Quick look** (two-up): "At school · 87% · 13 of 15 days" (→ attendance) · "Average mark · 68% · Term 3 · ▲2" (→ marks); if unpublished: "Marks · Released 12 Oct" (a date, not "Not yet").
5. **Shortcuts** scrolling pill strip to the edge: Time off · Messages · Receipts · Calendar · Children.
6. **From the school · N new** — 3 rows → notice detail; unread pip.
7. **Inbox card** (only when unread messages > 0): "Mrs Moyo · about Tendai · 2 new".

**Student Home**
1. Bar: "Hi, Anesu" · bell **with count** · avatar.
2. **Next class** card (keep) → class sheet (topic from the lesson plan's `topic`, room, teacher, "Bring": materials from the plan).
3. **This week** two-up: "Homework to hand in · **3** · 1 overdue" · "Latest mark · **74%** · Maths · ▲6".
4. **Week glance** dot strip (5 columns from the week timetable already fetched on the Timetable screen).
5. **Quick links** with numbers: Library "2 out · 1 late", Goals "3/7 on track", Messages "4 new", Marks "Term 3 · 68%".
6. **School news** banner: latest CRITICAL/WARNING notification.

**Teacher Today (tablet)**
1. Bar: date · term / "Your day" · Online chip · bell **= unread parent messages**.
2. Greeting + **[Set homework]** (opens the dialog in place).
3. **Today's lessons rail** (keep) — each cell: period · time, class, subject · room, register badge; **current** cell lit; tap → register.
4. **Up next** card (keep) with "Last taken Wed · 2 absent".
5. Three cards in a row at ≥60rem: **Papers to mark** (rows) · **Parent messages · N new** (3 threads) · **This week** tiles (only non-zero denominators).

### 6.2 Notification centre (all three portals)

- One `/notifications` route per portal backed by the existing notification centre (`lib/api` `fetchNotifications`/`markNotificationsRead`/`archiveNotifications`, already used by the student screen).
- Bell in every bar: count badge (danger, mono 10px, ≥16px) → the list; list rows: tone tile (icon + word: Important / Worth reading / News), title, summary, relative time, **tap → deep link** (`viewPath` from the payload: a notice, a thread, a mark sheet, an invoice) rather than only marking read.
- **Preferences** screen (parent "Alerts", student Settings, teacher Settings → Notifications): the prototype matrix — rows Fees · Attendance · Marks · Notices · Messages · Events · Library × columns SMS · Email · Push (WhatsApp as a fourth column where the tenant has a WhatsApp Business sender); quiet hours toggle. Persist via the notification-preferences API the teacher settings already write to; hide channels the tenant has not configured rather than stamping "Not yet available".
- **Delivery hooks** to surface: the teacher's "Save the register" confirm says "Parents of N absent pupils will be texted"; marks publish says "Parents will get an SMS and an app message"; homework "Set it now" says "The class and their parents are told".

### 6.3 Parent payment flow (phone)

Route `/portal/parent/fees/pay` (steps as URL segments so Back works: `pay`, `pay/method`, `pay/done`).
1. **Pick what to pay** — invoice lines as checkbox rows (all ticked by default); "Your picks · $ X"; amount chips **Pay all / Pay half / Pay $150 / Other…**; summary pill "Paying today $ X · $ Y still left"; `[Back] [Next · $ X]` in a `.ps-bottombar`.
2. **How to pay** — method grid **EcoCash · OneMoney · Bank transfer · Card** (only methods the tenant enabled). Mobile money: phone field (prefilled from guardian phone) + "You will get a prompt on this phone · enter your PIN" + `[Confirm · $ X]` with a processing state and a 60-second "Waiting for your PIN…" screen; Bank transfer: account details + **reference `INV-…`** with a copy button + `[I have sent it]` which records a pending payment; Card: gateway hosted page.
3. **Receipt** — success banner, itemised lines, reference, `[Save PDF] [Send by SMS] [Send by WhatsApp] [Back to home]`; the receipt also lands in Notifications and in "Past payments".
4. **Past payments** `/fees/history` — "Paid this year" tile; child + method chips (scroll to edge); grouped by month; row = label · child · method pill · ref · amount · download.
Until a gateway exists, ship steps 2 (bank/mobile-money instructions with the reference) and 4 only; the fee bar's button becomes **How to pay**.

### 6.4 Student homework submission

- Card → `BottomSheet` (keep) with: status pill; **What to do**; **Files from your teacher** (download rows); **Your work**: three tabs-as-chips *Type it* / *Photo* / *Link*; photo = `<input type=file accept="image/*" capture="environment" multiple>` with thumbnails and a remove ×; Link keeps the URL field; typed answers autosave to `localStorage` per assignment id.
- Footer: `[Hand it in]` / `[Hand in late]` / `[Change what you handed in]`; on tap the sheet shows the prototype's progress stages (Uploading → Sent to school → Telling your teacher) and then the **receipt** ("Handed in · receipt `SUB-4F2K9A` · 14:32 · 12 Sep") with `[Share]`; the receipt is pushed to Notifications.
- Offline: queue the submission (IndexedDB) and show "Saved on your phone · will send when you are back online"; the card gets a "Waiting to send" pill.

### 6.5 Register capture redesign (teacher, tablet + phone)

- **Header**: `Form 2A · Mathematics` / `Thu 22 May · Period 3 · 09:20` (period from `day.periods` when the register is per-lesson; date picker behind a "Change day" ghost button, defaulting to the school's today).
- **Counter**: Present · Absent · Late · Not marked, toned (keep).
- **Quick mark**: `[Everyone present]` primary-secondary; `[Everyone absent]` behind a confirm; `[Undo]` ghost on the right.
- **Rows** 56px: avatar · name (one line, "Surname, First") · mono id · **3-way P / A / L segmented toggle** (44px tall); Excused via long-press or a per-row `···` menu with "Excused · add reason"; unmarked rows show an empty toggle, no badge.
- **Filter**: search + Everyone / Not marked / Not present (keep).
- **Save bar** (sticky): "18 present · 2 absent · 0 late · **1 still unmarked**" · `[Save & next class →]`; confirm sheet with the three counts, "1 unmarked will be recorded as absent?" (or blocks), "Parents of 2 absent pupils will be texted"; on save, advance `classSubjectId` to the next lesson and toast "Saved · now Form 3B · Science".
- **Offline**: queue the POST and show "Saved on this tablet · sends when online" with a retry (this is what the marketing site promises).
- **Phone** (<md): same screen; rail replaced by a class picker sheet from the bar title (tap "Form 2A ▾").

### 6.6 Parent notice detail and absence request

- `/notices/[id]`: sender pill + date; title; body (rich text); attachments (name · size · download); RSVP row (Going / Maybe / Can't come) when the notice has an event; **Replies** thread (staff badge) with a pill input; marks read on open.
- `/attendance/[date]` day sheet: status badge; if absent: "Marked away · no reason yet → **Tell the school why**"; lessons that day with P/A/L; button opens **Ask for time off** (`/leave`): From/To, Why (Sick · Family · Religious · Travel · Other), note, doctor's note photo; "Send to school" → creates a message thread to the class teacher tagged with the dates, and a notification to the office.

### 6.7 Shell conventions to adopt in all three

- App bar: 52px; left = back (36px) or nothing; title once; right = context chip (child / class) + bell with count. Sub-routes always have a back target table like parent.html L1878–1897.
- Bottom tabs ≤ 900px (72px incl. safe-area, 22px icons, 11px labels, danger badge); **side nav ≥ 901px** using `.ps-side` (220px) with the same items plus the sub-routes.
- Offline banner under the bar (`useOfflineConnectivity`) on all three.
- Figures: sans `tabular-nums`; mono only for references, ids, times.
- Empty states: one per screen segment, the verb only when the reader can act, and never two stacked.
- Copy: no sentence that explains the product to the user; if something is not built, it is not on the screen.
