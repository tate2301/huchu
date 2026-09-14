# Parent portal: UI/UX audit

Surface: `app/portal/parent/**`, shell `components/schools/portal/parent/parent-portal-shell.tsx`, screens under `components/schools/portal/parent/`, styles `parent-portal.css`, shared login `components/auth/portal-login-form.tsx`, claim flow `app/c/[token]`. Audited from source and from `docs/screenshots/schools/parent-portal-phone/*` and `parent-portal-tablet/*`. The workflow companion is `workflows.md` in this folder; this document covers how the workflows feel, not whether they exist.

Rules applied: the portal build contract (`docs/design-system/portals/README.md`: every feature in the prototype is required), the prototype `parent.html`, the platform UX playbook phone rules, `docs/design-system/11-campus-states-and-motion.md`, `docs/portal-shell.css`, `.impeccable.md`, and `SPEC.md`. A digest of the testable rules is in `../reference/docs-baseline.md` §9.

## 1. Verdict in one paragraph

The parent portal has the right bones: a four-tab mobile shell, a child chip in the app bar, server-loaded household, honest empty states and a saving overlay on every write. It fails the contract at the screen level. Nine of the prototype's twenty-four screens exist. The two screens a parent opens most, Fees and News, both dead-end: Fees offers no way to pay or even see how to pay, and tapping a notice only marks it read because the API never sends the body. Above 900px the bottom tabs disappear and nothing replaces them, so a parent on a laptop has no navigation. Sub-screens have no back button. The hero shows "$ 0.00" in a slashed-zero monospace face as the first thing a paid-up family sees. Most of this is fixable in the shell and in two or three screens without new backend work.

## 2. Contract parity by screen

Prototype screen count: 24 plus sign-in and the child switcher. Built: Home, Fees, Attendance, Marks, News (list only), Messages, You, Help, plus login and claim.

| Screen | Prototype promises | Code renders | Gap |
|---|---|---|---|
| Shell | Back arrow on 20 sub-routes; child chip; bell pip for notices and messages; offline banner; side nav on tablet and desktop (`.ps-side`) | Title only, no back; chip; pip for notices only; no banner; bottom tabs only, hidden at 901px+ by `app/styles/components.css:2368` | P0 no nav on wide screens; P1 no back |
| Sign in | Phone number, six-cell SMS code, remember this phone, resend, change number, call the office | Email and password, "Work email" label, "name@company.com" placeholder, no forgot-password link | P1 wrong audience; P0 reach (guardians without email cannot be invited) |
| Home | Fee hero with Pay now, days-to-go, progress bar; Today with UP NEXT; Quick look tiles with attendance % and average mark %; Shortcuts pill row; News preview | Hero with "See fee statement" and "From the school"; Today; tiles with attendance % and "Marks: Ready / Not yet"; no shortcuts; News preview linking to the list | P1 |
| Fees | Statement with tap-to-pick lines, money off, saved ways to pay, past payments, three-step pay flow, receipt screen | Statement lines, receipts, pinned bar repurposed as a statement download | P0 no way to pay or see how to pay |
| Payment history | Filters by child and method, grouped by month | Absent | P1 |
| News list | Tone icon, unread, RSVP meta, mark all read | Present | OK |
| Notice detail | Body, attachments, RSVP, threaded replies | Absent; tapping marks read and shows `summary` only (`parent-notices-screen.tsx:157-167`; API selects `title, summary` at `notices/route.ts:45`) | P0 dead end |
| Messages | List with avatar and time; thread with pill input; Message a teacher from mark detail | List without time; thread with textarea; office only | P1 |
| Attendance | Term chips; six-week P/L/A grid; legend; day drill-in; Ask for time off; Term report PDF | Percent card plus flat day list; "not yet submitted" on every row | P1 |
| Attendance day | Status, lessons that day, tell the school why | Absent | P1 |
| Leave request | Dates, reason, note, doctor's note upload | Absent | P1 |
| Marks | Cards by subject with bar; mark detail with class-work and exam split, descriptor, teacher comment, Message teacher | Cards by subject with grade and remark; no drill-in; download button that always fails (see workflows B1) | P1 |
| Calendar, Library, Timetable, Children, Child profile, Security, Alerts, Language | Full screens | Absent | P1 to P2 |
| You | Contact rows, children, account, security, alerts, language, help, sign-out confirmation | Contact rows (with dead chevrons), children, sign out without confirmation | P2 |
| Help | FAQ plus call, email and WhatsApp the school | FAQ only, no gutter | P2 |

## 3. Screenshot findings

- **Home (phone and tablet).** The 36px lead figure is "$ 0.00" in a monospace face with slashed zeros ("$ 49Ø.ØØ" appears in the paid sub-line). "From the school" sits where the money action belongs. "See full day" links to Attendance, which has no timetable. The School news empty state is cut at the fold, leaving a lone bell icon above the tab bar.
- **Fees.** The "Nothing owing" block sits between the "Fee statement" heading and the statement, pushing the first line to roughly y=550 on a phone. The pinned bar reads "What you still owe $ 0.00 · Statement" for a paid family. The child header repeats the app-bar chip.
- **Attendance.** Fifteen rows each carry "not yet submitted", then an alert says it again. Dates have no weekday. Rows are not tappable.
- **News.** Correct `NothingYet` empty state. On tablet the whole screen is one paragraph.
- **You.** Chevrons on the phone and email rows do nothing. "1 child on your account" and "YOUR CHILDREN · 1 CHILD" state the count twice.
- **Help.** Cards run edge to edge with no 16px gutter on both widths; the first question is open, the rest closed, with no affordance on any card.
- **Tablet set.** The same single column at 768px with fixed bottom tabs and no side nav.

## 4. Rule violations that recur

| Rule | Violation | Where |
|---|---|---|
| Never state the same fact twice in one band | "not yet submitted" ×15; child header under the chip; "1 child" ×2 | attendance, fees, profile |
| One glance answers the question | "Marks: Ready" in a numeric tile; "$ 0.00" lead | home |
| Strip explanatory copy | Bell-pip explanation in the notices empty state; help answer describing a "row of names" that does not exist (`parent-help-screen.tsx:32`) | notices, help |
| Money carries currency, figures are tabular | Mono with slashed zeros on money and counters (`parent-portal.css:215, 357`) | everywhere |
| Pickers are sheets, sub-screens have a back target | No back table; thread state is component state so browser Back exits the portal (`parent-messages-screen.tsx:142`) | shell, messages |
| A record has one primary action | Fees bar's only action is a PDF download that fails for the role | fees |
| No dead affordances | Notice rows, profile chevrons | notices, profile |

## 5. Suggested edits

Ordered by parent value per unit of work.

1. **Shell.** Add a `BACK` route table (mirroring `parent.html` lines 1878 to 1897) and a 36px back button in the app bar on sub-routes. Render a `.ps-side` rail at 901px+ with Home, Fees, News, You, Attendance, Marks, Messages, Help. Count messages into the bell pip. Mount `useOfflineConnectivity` and the offline banner (the teacher shell already does).
2. **Notice detail.** Extend the notices API select to include `body` and attachments; add a `notice/[id]` route or a bottom sheet; mark read on open; add reply and RSVP when S-7.1 and S-6.15 land.
3. **Home hero.** When owing: amount in a sans tabular face, "pay by 10 Oct · 12 days to go", progress bar, "How to pay" and "Statement". When paid: "Paid for Term 3", the paid amount, "See receipt". Never a zero lead. Replace "From the school" with the Shortcuts pill row.
4. **Fees.** Move "Nothing owing" below the statement or into the hero sub-line. Hide the pinned bar at zero. "How to pay" opens a payment-instructions sheet (bank details, mobile-money merchant code, the invoice reference to quote) sourced from tenant settings, until the gateway flow exists. Show method and reference on "Already paid". Add Past payments grouped by month with child and method chips.
5. **Attendance.** Weekday-first dates, the six-week grid with legend, one "not final" note per section, tappable days opening a day sheet with "Tell the school why".
6. **Marks.** Per-subject sheet with remark, grade descriptor and "Message <teacher>". Fix the download (workflows B1).
7. **Messages.** `?thread=` in the URL; "Write to the school" as the app-bar primary; teacher picker.
8. **You.** Remove or wire the chevrons; sign-out confirmation sheet; add Alerts and Language rows using the notification preferences API the teacher settings already write to.
9. **Help.** Wrap in `.pp-page`; add call, WhatsApp and email rows from the school's contact record.
10. **Type.** Sans `tabular-nums` for figures; mono only for references and ids.
11. **Login.** Portal-specific labels ("Phone or email"), forgot-password link, `role="alert"` on errors, no POS or organisation strings. Claim page's used-state "Sign in" must go to `/portal/parent/login`, not `/login` (`claim-portal-account-content.tsx:108`).

## 6. Proposed restructuring

- **Tabs stay Home · Fees · News · You**, matching the prototype. Attendance and Marks are reached from Home tiles and from the You tab; Messages gets a Home shortcut and a You row with a badge.
- **Fees becomes a hub**: hero, statement, how to pay or pay now, receipts, past payments, saved methods, discounts. Each is a section with its own route so Back works.
- **One notification model**: the bell opens a list where each row deep-links (notice detail, thread, mark sheet, invoice) instead of only marking read.
- **Shell conventions shared with the student portal**: 52px app bar, back or nothing on the left, title once, chip plus bell on the right; bottom tabs to 900px and `.ps-side` above; offline banner under the bar; one empty state per segment, never two stacked.

## 7. Proposed new UI

**Home widget order (390px):** greeting with school, term and week; money hero; Today strip with UP NEXT; Quick look two-up (at school %, average mark % or "Released 12 Oct"); Shortcuts pill strip scrolling edge to edge (Time off, Messages, Receipts, Calendar, Children); From the school with unread pips; Inbox card only when there are unread messages.

**Payment flow (`/fees/pay`, `/fees/pay/method`, `/fees/pay/done`):** pick lines and amount (Pay all, Pay half, other); method grid limited to what the tenant enabled (EcoCash, OneMoney, bank transfer, card); mobile money prompts for the PIN on the phone and waits; bank transfer shows details and a copyable reference with "I have sent it" recording a pending payment; card goes to the hosted page; receipt screen with Save PDF, Send by SMS, Send by WhatsApp. Ship the instructions and history steps first; the gateway step rides S-7.3.

**Notice detail and absence request:** sender pill, date, title, body, attachments, RSVP row, replies thread. Day sheet from attendance with status and "Tell the school why", opening the leave request form (dates, reason, note, doctor's note photo) that creates a thread to the class teacher and a task for the office.

**Notification preferences:** the prototype matrix of event × SMS, Email, Push (WhatsApp where configured) with quiet hours, persisted through the existing preferences API; channels the tenant has not configured are hidden, not stamped unavailable.

## 8. Accessibility and locale

- Add `role="alert"` to the login error, `aria-label` on the money figure ("490 dollars"), and names on icon-only buttons in the bar.
- Dates already flow through `Intl` en-GB; set `lang="en-ZW"` on the portal document and prepare Shona and Ndebele copy tables for the prototype's language picker.
- Touch targets: tab items are 52px minimum, fine; the "← All messages" text link is a 14px target and should become the app-bar back.
