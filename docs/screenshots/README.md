# The screenshots

**540 images, 66 journeys, 7 verticals.** Every one is produced by
a spec in `e2e/`, against seeded tenants described in `test-data.md` — none is
hand-taken, so re-running the suite regenerates the set.

## One folder per vertical

Each vertical is a single flat folder and the journey is a filename prefix:
`schools/admissions-desktop-01-admissions-board.png`. Journeys used to be
directories, which meant 66 of them — many holding one or two files — to open
when picking stills for a deck. The prefix keeps the set sorted by journey
without the directory walk, and `shotPath` in `e2e/_support/shots.ts` is the one
place that decides the shape, so the harness reproduces exactly these names.

Within a journey, `NN-` is the step order. The `-desktop`, `-tablet` and
`-phone` journey suffixes are the same screens at 1440, 768 and 390px.

## A caveat worth reading before using these for marketing

Eight school screens were photographed **while their content was clipped** — the
table toolbar, pagination and page-nav ran past a card that clips, at desktop
width as well as phone. The bug is fixed (see `e2e-status.md`), but any image in
`schools/` taken before 2026-09-08 may show the cropped version. Re-run
`marketing-shots.spec.ts` and `visual-pass.spec.ts` before shipping those.

The `schools/` set was regenerated on 2026-09-22 against a re-seeded St Mary's,
and grew: boarding, the school calendar, the library, admissions, conduct,
leavers and alumni, results publishing, the office week, and the student and
parent portals screen by screen. Four of those journeys existed as specs that
had never produced an image, because the seed wrote no hostels, no calendar
events, no books and no applications and every one of them skipped. The seed
writes all four now — see `docs/testing/test-data.md`.

Three images in `schools/` are older than that pass and say so here rather than
silently: `finance-desktop-01-finance.png`, `finance-phone-01-finance.png` and
`records-desktop-01-subjects-list.png` come from pre-harness specs that have
been retired, and `visual-pass-tablet-01-class-results.png` is not regenerated
because that page has no visible title at 768px — see `known-issues.md`.

One clipping finding is open again and is **in** this set:
`visual-pass-phone-01-class-fees.png`. At 390px the amount column and the row
buttons on `/schools/finance/class/<id>` overflow `div.mobile-list`, which clips
rather than scrolls, so the right-hand edge of each row is cut off. Do not put
that image in a deck.

The journeys suffixed `-legacy` are gone. They were the pre-harness flat set,
kept after `6d5a4fa` sorted the rest into journeys, and they duplicated screens
the current specs photograph — 151 images across retail and payroll. Recoverable
from history if a particular frame turns out to be wanted.

## Index

### accounting

| Journey | Shots | First frame |
|---|---|---|
| `receivables-payables-` | 4 | `receivables-payables-01-receivables.png` |
| `the-books-` | 5 | `the-books-01-overview.png` |

### crm

| Journey | Shots | First frame |
|---|---|---|
| `getting-paid-` | 4 | `getting-paid-01-quotations.png` |
| `pipeline-` | 5 | `pipeline-01-overview.png` |
| `records-` | 24 | `records-record-company-desktop-fold.png` |
| `the-week-` | 4 | `the-week-01-tasks.png` |
| `widths-` | 126 | `widths-crm-appointments-desktop.png` |

### gold

| Journey | Shots | First frame |
|---|---|---|
| `chain-of-custody-` | 5 | `chain-of-custody-01-overview.png` |
| `settlement-` | 5 | `settlement-01-price-curve.png` |

### hr

| Journey | Shots | First frame |
|---|---|---|
| `people-` | 4 | `people-01-overview.png` |

### payroll

| Journey | Shots | First frame |
|---|---|---|
| `attendance-mark-` | 2 | `attendance-mark-01-mark-modal-desktop.png` |
| `hr-payroll-` | 42 | `hr-payroll-payroll-compensation-rules-desktop.png` |
| `month-end-` | 4 | `month-end-01-runs.png` |

### retail

| Journey | Shots | First frame |
|---|---|---|
| `back-office-desktop-` | 17 | `back-office-desktop-01-retail-overview.png` |
| `back-office-phone-` | 17 | `back-office-phone-01-retail-overview.png` |
| `back-office-tablet-` | 17 | `back-office-tablet-01-retail-overview.png` |
| `counter-tools-` | 6 | `counter-tools-01-price-check-what-does-it-cost.png` |
| `journey-w03-add-a-product-` | 4 | `journey-w03-add-a-product-01-products.png` |
| `journey-w04-edit-a-product-` | 2 | `journey-w04-edit-a-product-01-edit-product.png` |
| `journey-w05-change-a-price-` | 3 | `journey-w05-change-a-price-01-prices.png` |
| `journey-w06-run-a-promotion-` | 3 | `journey-w06-run-a-promotion-01-promotions.png` |
| `journey-w07-order-and-deliver-` | 5 | `journey-w07-order-and-deliver-01-orders.png` |
| `journey-w08-count-stock-` | 3 | `journey-w08-count-stock-01-stock-counts.png` |
| `journey-w09-move-stock-` | 3 | `journey-w09-move-stock-01-transfers.png` |
| `journey-w10-add-a-location-` | 3 | `journey-w10-add-a-location-01-locations.png` |
| `journey-w11-add-a-till-` | 3 | `journey-w11-add-a-till-01-tills.png` |
| `journey-w12-till-rules-` | 2 | `journey-w12-till-rules-01-till-rules.png` |
| `journey-w13-posting-` | 3 | `journey-w13-posting-01-posting.png` |
| `journey-w14-fiscal-device-` | 4 | `journey-w14-fiscal-device-01-fiscal-device.png` |
| `journey-w17-fiscalise-a-sale-` | 2 | `journey-w17-fiscalise-a-sale-01-on-the-sale.png` |
| `range-and-stock-` | 6 | `range-and-stock-01-catalogue.png` |
| `reporting-` | 1 | `reporting-01-reports.png` |
| `shelf-photo-` | 4 | `shelf-photo-01-the-range.png` |
| `till-desktop-` | 12 | `till-desktop-01-pos-checkout.png` |
| `till-phone-` | 12 | `till-phone-01-pos-checkout.png` |
| `till-tablet-` | 12 | `till-tablet-01-pos-checkout.png` |
| `trading-day-` | 23 | `trading-day-01-shift-before-the-day-starts.png` |
| `trading-floor-` | 4 | `trading-floor-01-overview.png` |
| `void-` | 3 | `void-01-a-receipt-that-can-be-voided.png` |

### schools

| Journey | Shots | First frame |
|---|---|---|
| `admissions-desktop-` | 2 | `admissions-desktop-01-admissions-board.png` |
| `admissions-phone-` | 2 | `admissions-phone-01-admissions-board.png` |
| `bed-board-desktop-` | 1 | `bed-board-desktop-01-bed-board.png` |
| `bed-board-phone-` | 1 | `bed-board-phone-01-bed-board.png` |
| `boarding-` | 6 | `boarding-01-overview.png` |
| `calendar-desktop-` | 2 | `calendar-desktop-01-oversight-holiday.png` |
| `calendar-phone-` | 2 | `calendar-phone-01-oversight-holiday.png` |
| `conduct-` | 4 | `conduct-01-incidents.png` |
| `fees-` | 5 | `fees-01-finance-overview.png` |
| `finance-desktop-` | 1 | `finance-desktop-01-finance.png` |
| `finance-phone-` | 1 | `finance-phone-01-finance.png` |
| `imports-desktop-` | 4 | `imports-desktop-01-choose.png` |
| `imports-phone-` | 4 | `imports-phone-01-choose.png` |
| `leavers-` | 3 | `leavers-01-leavers.png` |
| `library-desktop-` | 2 | `library-desktop-01-library-overdue.png` |
| `library-phone-` | 2 | `library-phone-01-library-overdue.png` |
| `office-` | 10 | `office-01-calendar.png` |
| `parent-portal-phone-` | 8 | `parent-portal-phone-01-attendance.png` |
| `parent-portal-tablet-` | 8 | `parent-portal-tablet-01-attendance.png` |
| `parent-portal-` | 1 | `parent-portal-01-parent-home.png` |
| `records-desktop-` | 1 | `records-desktop-01-subjects-list.png` |
| `results-publishing-` | 3 | `results-publishing-01-result-sheets.png` |
| `search-desktop-` | 3 | `search-desktop-01-classes.png` |
| `search-phone-` | 3 | `search-phone-01-classes.png` |
| `student-portal-phone-` | 10 | `student-portal-phone-01-goals.png` |
| `student-portal-tablet-` | 10 | `student-portal-tablet-01-goals.png` |
| `student-portal-` | 1 | `student-portal-01-student-home.png` |
| `teacher-hr-desktop-` | 1 | `teacher-hr-desktop-01-teacher-hr.png` |
| `teacher-hr-phone-` | 1 | `teacher-hr-phone-01-teacher-hr.png` |
| `teacher-portal-desktop-` | 13 | `teacher-portal-desktop-01-attendance.png` |
| `teacher-portal-tablet-` | 13 | `teacher-portal-tablet-01-attendance.png` |
| `teaching-` | 5 | `teaching-01-attendance.png` |
| `the-roll-` | 5 | `the-roll-01-overview.png` |
| `visual-pass-desktop-` | 10 | `visual-pass-desktop-01-academics.png` |
| `visual-pass-phone-` | 10 | `visual-pass-phone-01-academics.png` |
| `visual-pass-tablet-` | 10 | `visual-pass-tablet-01-academics.png` |
| `welfare-desktop-` | 1 | `welfare-desktop-01-welfare.png` |
| `welfare-phone-` | 1 | `welfare-phone-01-welfare.png` |
| `year-rollup-desktop-` | 1 | `year-rollup-desktop-01-year-rollup.png` |
| `year-rollup-phone-` | 1 | `year-rollup-phone-01-year-rollup.png` |
