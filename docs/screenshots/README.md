# The screenshots

**644 images, 62 journeys, 7 verticals.** Every one is produced by a spec in
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
| `admissions-desktop` | 1 | `01-admissions-form.png` |
| `admissions-phone` | 1 | `01-admissions-form.png` |
| `fees` | 5 | `01-finance-overview.png` |
| `finance-desktop` | 1 | `01-finance.png` |
| `finance-phone` | 1 | `01-finance.png` |
| `imports-desktop` | 4 | `01-choose.png` |
| `imports-phone` | 4 | `01-choose.png` |
| `parent-portal` | 1 | `01-parent-home.png` |
| `parent-portal-phone` | 6 | `01-attendance.png` |
| `parent-portal-tablet` | 6 | `01-attendance.png` |
| `records-desktop` | 1 | `01-subjects-list.png` |
| `search-desktop` | 3 | `01-classes.png` |
| `search-phone` | 3 | `01-classes.png` |
| `student-portal` | 1 | `01-student-home.png` |
| `student-portal-phone` | 9 | `01-goals.png` |
| `student-portal-tablet` | 9 | `01-goals.png` |
| `teacher-hr-desktop` | 1 | `01-teacher-hr.png` |
| `teacher-hr-phone` | 1 | `01-teacher-hr.png` |
| `teacher-portal-desktop` | 13 | `01-attendance.png` |
| `teacher-portal-tablet` | 13 | `01-attendance.png` |
| `teaching` | 5 | `01-attendance.png` |
| `the-roll` | 5 | `01-overview.png` |
| `visual-pass-desktop` | 9 | `01-attendance.png` |
| `visual-pass-phone` | 9 | `01-attendance.png` |
| `visual-pass-tablet` | 9 | `01-attendance.png` |
| `welfare-desktop` | 1 | `01-welfare.png` |
| `welfare-phone` | 1 | `01-welfare.png` |
| `year-rollup-desktop` | 1 | `01-year-rollup.png` |
| `year-rollup-phone` | 1 | `01-year-rollup.png` |
