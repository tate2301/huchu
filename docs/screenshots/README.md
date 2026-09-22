# The screenshots

**691 images, 73 journeys, 7 verticals.** Every one is produced by a spec in
`e2e/`, against seeded tenants described in `test-data.md` — none is hand-taken,
so re-running the suite regenerates the set.

One image per row of a journey folder is the same screen at a different step;
`-desktop`, `-tablet` and `-phone` suffixes are the same screen at 1440, 768 and
390px.

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
silently: `finance-desktop/01-finance.png`, `finance-phone/01-finance.png` and
`records-desktop/01-subjects-list.png` come from pre-harness specs that have
been retired, and `visual-pass-tablet/01-class-results.png` is not regenerated
because that page has no visible title at 768px — see `known-issues.md`.

One clipping finding is open again and is **in** this set:
`visual-pass-phone/01-class-fees.png`. At 390px the amount column and the row
buttons on `/schools/finance/class/<id>` overflow `div.mobile-list`, which
clips rather than scrolls, so the right-hand edge of each row is cut off. Do
not put that image in a deck.

Journeys suffixed `-legacy` came from the pre-harness specs. They are kept
because the images are good; the specs that made them have since been retired or
migrated.

## Index

### accounting

| Journey | Shots | First frame |
|---|---|---|
| `receivables-payables` | 4 | `01-receivables.png` |
| `the-books` | 5 | `01-overview.png` |


### crm

| Journey | Shots | First frame |
|---|---|---|
| `getting-paid` | 4 | `01-quotations.png` |
| `pipeline` | 5 | `01-overview.png` |
| `records` | 24 | `record-company-desktop-fold.png` |
| `the-week` | 4 | `01-tasks.png` |
| `widths` | 126 | `crm-appointments-desktop.png` |


### gold

| Journey | Shots | First frame |
|---|---|---|
| `chain-of-custody` | 5 | `01-overview.png` |
| `settlement` | 5 | `01-price-curve.png` |


### hr

| Journey | Shots | First frame |
|---|---|---|
| `people` | 4 | `01-overview.png` |


### payroll

| Journey | Shots | First frame |
|---|---|---|
| `attendance-legacy` | 2 | `attendance-mark-modal-desktop.png` |
| `attendance-mark` | 2 | `01-mark-modal-desktop.png` |
| `hr-payroll` | 42 | `payroll-compensation-rules-desktop.png` |
| `month-end` | 4 | `01-runs.png` |


### retail

| Journey | Shots | First frame |
|---|---|---|
| `back-office-desktop` | 17 | `01-retail-overview.png` |
| `back-office-legacy` | 51 | `retail-catalog-desktop.png` |
| `back-office-phone` | 17 | `01-retail-overview.png` |
| `back-office-tablet` | 17 | `01-retail-overview.png` |
| `counter-tools` | 6 | `01-price-check-what-does-it-cost.png` |
| `counter-tools-legacy` | 6 | `tools-01-price-check-what-does-it-cost.png` |
| `range-and-stock` | 6 | `01-catalogue.png` |
| `reporting` | 1 | `01-reports.png` |
| `shelf-photo` | 4 | `01-the-range.png` |
| `shelf-photo-legacy` | 5 | `photo-01-the-range.png` |
| `till-desktop` | 12 | `01-pos-checkout.png` |
| `till-legacy` | 36 | `pos-activity-desktop.png` |
| `till-phone` | 12 | `01-pos-checkout.png` |
| `till-tablet` | 12 | `01-pos-checkout.png` |
| `trading-day` | 23 | `01-shift-before-the-day-starts.png` |
| `trading-day-legacy` | 48 | `day-01-shift-before-the-day-starts.png` |
| `trading-floor` | 4 | `01-overview.png` |
| `void` | 3 | `01-a-receipt-that-can-be-voided.png` |
| `void-legacy` | 3 | `void-01-a-receipt-that-can-be-voided.png` |


### schools

| Journey | Shots | First frame |
|---|---|---|
| `admissions-desktop` | 2 | `01-admissions-board.png` |
| `admissions-phone` | 2 | `01-admissions-board.png` |
| `bed-board-desktop` | 1 | `01-bed-board.png` |
| `bed-board-phone` | 1 | `01-bed-board.png` |
| `boarding` | 6 | `01-overview.png` |
| `calendar-desktop` | 2 | `01-oversight-holiday.png` |
| `calendar-phone` | 2 | `01-oversight-holiday.png` |
| `conduct` | 4 | `01-incidents.png` |
| `fees` | 5 | `01-finance-overview.png` |
| `finance-desktop` | 1 | `01-finance.png` |
| `finance-phone` | 1 | `01-finance.png` |
| `imports-desktop` | 4 | `01-choose.png` |
| `imports-phone` | 4 | `01-choose.png` |
| `leavers` | 3 | `01-leavers.png` |
| `library-desktop` | 2 | `01-library-overdue.png` |
| `library-phone` | 2 | `01-library-overdue.png` |
| `office` | 10 | `01-calendar.png` |
| `parent-portal` | 1 | `01-parent-home.png` |
| `parent-portal-phone` | 8 | `01-attendance.png` |
| `parent-portal-tablet` | 8 | `01-attendance.png` |
| `records-desktop` | 1 | `01-subjects-list.png` |
| `results-publishing` | 3 | `01-result-sheets.png` |
| `search-desktop` | 3 | `01-classes.png` |
| `search-phone` | 3 | `01-classes.png` |
| `student-portal` | 1 | `01-student-home.png` |
| `student-portal-phone` | 10 | `01-goals.png` |
| `student-portal-tablet` | 10 | `01-goals.png` |
| `teacher-hr-desktop` | 1 | `01-teacher-hr.png` |
| `teacher-hr-phone` | 1 | `01-teacher-hr.png` |
| `teacher-portal-desktop` | 13 | `01-attendance.png` |
| `teacher-portal-tablet` | 13 | `01-attendance.png` |
| `teaching` | 5 | `01-attendance.png` |
| `the-roll` | 5 | `01-overview.png` |
| `visual-pass-desktop` | 10 | `01-academics.png` |
| `visual-pass-phone` | 10 | `01-academics.png` |
| `visual-pass-tablet` | 10 | `01-academics.png` |
| `welfare-desktop` | 1 | `01-welfare.png` |
| `welfare-phone` | 1 | `01-welfare.png` |
| `year-rollup-desktop` | 1 | `01-year-rollup.png` |
| `year-rollup-phone` | 1 | `01-year-rollup.png` |
