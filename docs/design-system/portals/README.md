# School portal prototypes — local reference

Downloaded from `https://design.corelith.co.zw/portals/<name>/demo.html` on 2026-08-04.
These are the **build contract** for the three school portals: every feature in a demo is required.

Open them directly (`file://`) — they are self-contained single-page prototypes with their own
demo data, so state, empty/loading/error states and mobile behaviour can all be exercised offline.

The demos reference the design-system assets at `../../` (they were served from
`/portals/<name>/demo.html`, two levels deep), so local copies of `tokens.css`,
`components.css`, `shared.css`, `portal-shell.css`, `icons.js`, `huchu-nav.css`
and `huchu-nav.js` live in `docs/` — without them every demo renders unstyled.
Re-download those alongside the demos:

```bash
for f in tokens.css components.css shared.css portal-shell.css icons.js huchu-nav.css huchu-nav.js; do
  curl -sS -o docs/$f https://design.corelith.co.zw/$f
done
```

| File | Audience | Primary device |
|---|---|---|
| `parent.html` | Parents, guardians | Mobile |
| `student.html` | Students | Mobile / tablet |
| `teacher.html` | Teachers | Tablet / desktop |

Re-download with:

```bash
for p in parent student teacher; do
  curl -sS -o docs/design-system/portals/$p.html \
    https://design.corelith.co.zw/portals/$p/demo.html
done
```

## Feature inventory extracted from the demos

Anything marked **(no model)** has no backing table in `prisma/schema/core.prisma` today.

### Parent — bottom nav: Home · Fees · News · You

- Child switcher across multiple enrolled children
- Per-child attendance summary, marks, fee balance
- Fee invoices broken out by line (tuition, boarding levy, sports & activities, books & stationery, aftercare)
- Statements and downloadable receipts
- **Payments in-portal (no model)** — EcoCash, OneMoney, bank transfer, Visa/Mastercard, with a payment-method filter on history
- News/notices with **threaded replies and comments (no model)**
- Language picker **(no model)**
- Two-factor enrolment with spare recovery codes **(no model)**
- Sign-in by code

### Student — screens: timetable · assignments · marks · library · goals · notifications · profile · settings · help

- Timetable by day and week
- **Assignments/homework (no model)** — filter, hand-in flow, "handed in" confirmation
- Marks and **report card by term (no model as a document)**
- **Library (no model)** — borrow, return, renew, reserve, scan-to-return, overdue fines and fine payment
- **Goals (no model)** — set and track per-subject targets
- Notifications with cadence preference
- PIN authentication, PIN change, forgotten-PIN recovery
- Theme and profile editing

### Teacher — nav: Today · Marks · Messages · Timetable · Lessons

- "Today's lessons" day view
- Attendance marking per class per period
- Marks entry with **custom assessment columns (no model)**, papers-to-mark queue, publish-marks-to-parents
- **Parent messaging (no model)** — threads, quick replies, send-to-whole-class → this is the realtime chat requirement
- **Lesson plans (no model)**, copy-lessons-from-last-week, **cover lessons (no model)**
- **Homework & tasks authoring (no model)**
- **Resource library with upload (no model)**
- **Meetings & appointments (no model)**
- Reports; settings for notification cadence, mark-publishing rules, appearance, security, privacy
- Help centre and FAQ
- Shared-device sign-out

## Scope this adds beyond the current plan

The demos are materially larger than `docs/expansion-plan/schools-production-readiness.md` accounts
for. New domains with no schema at all: **homework/assignments, library and lending, student goals,
lesson plans and cover lessons, teaching resources, parent–teacher messaging, meetings, in-portal
payments, portal 2FA, notice threads.**

Two of these are cross-cutting and should be designed once rather than per portal:

- **Messaging** — teacher↔parent threads, whole-class broadcast, and notice replies are the same
  primitive. It needs realtime delivery, not polling.
- **Payments** — EcoCash / OneMoney / card / bank against a fee invoice, reconciled into the receipt
  and allocation flow that already exists, and posting through the accounting engine.

## Marketing scope

`https://quote.corelith.co.zw` returned **404** at audit time (as did `corelith.co.zw` and
`www.`/`quotes.` variants; only `design.corelith.co.zw` resolves). The marketing site is built from
this repo — `app/home/schools/page.tsx` and `app/home/site-data.ts` (`schoolsTrack`) — so that is the
source used here, with the commercial bands in `lib/marketing/pricing.ts`.

What marketing promises that the plan must cover:

- Admissions: **applications, offers**, enrolment, guardians, classes, documents
- Fees: structures, bulk invoicing, receipts, waivers, statements, daily arrears list
- Academics: registers, subjects, teachers, marks entry, moderation windows, report cards
- Boarding **and welfare**: hostels, beds, leave, **sanatorium** — health is in scope after all
- Parent and teacher portals on any phone browser, no app install
- Board reporting: enrolment, collections, arrears, attendance, results
- **Offline**: "attendance capture and fee receipting keep working with no connection and sync once
  it returns" — an explicit sales promise, currently unimplemented
- **Multi-currency USD and ZWG**, and ZIMRA fiscalisation as a paid add-on
- Bands: Community ≤300 · Standard ≤800 · Premier ≤1500 · Group. Add-ons: transport, ZIMRA
  fiscalisation, branding + domain, data migration

Still sold nowhere, in marketing or the bands: **behaviour/discipline and a communications log.**
Library and homework are not in the band copy but *are* in the student and teacher demos, so they
are in scope by the demo contract.
