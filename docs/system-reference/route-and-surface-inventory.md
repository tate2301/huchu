# Route and Surface Inventory

This appendix gives a current-state footprint snapshot of the system as inspected on March 20, 2026.

## Page Route Groups

Top-level App Router page counts by route group:

| Route Group | Page Count |
| --- | ---: |
| `portal` | 38 |
| `schools` | 34 |
| `gold` | 21 |
| `accounting` | 19 |
| `management` | 14 |
| `reports` | 14 |
| `cctv` | 13 |
| `human-resources` | 12 |
| `retail` | 12 |
| `scrap-metal` | 12 |
| `stores` | 7 |
| `car-sales` | 5 |
| `compliance` | 5 |
| `maintenance` | 5 |
| `settings` | 5 |
| `user-management` | 5 |
| `thrift` | 4 |
| `access-blocked` | 1 |
| `admin` | 1 |
| `attendance` | 1 |
| `dashboard` | 1 |
| `help` | 1 |
| `login` | 1 |
| `plant-report` | 1 |
| `shift-report` | 1 |
| `status` | 1 |

## API Route Groups

Top-level API route counts by route group:

| API Group | Route Count |
| --- | ---: |
| `v2` | 116 |
| `accounting` | 80 |
| `hr` | 18 |
| `scrap-metal` | 18 |
| `cctv` | 14 |
| `gold` | 13 |
| `platform-admin` | 12 |
| `compensation` | 12 |
| `payroll` | 11 |
| `compliance` | 8 |
| `users` | 7 |
| `notifications` | 6 |
| `disbursements` | 6 |
| `document-templates` | 4 |
| `documents` | 4 |
| `inventory` | 4 |
| `adjustments` | 3 |
| `settings` | 3 |
| `attendance` | 2 |
| `auth` | 2 |
| `departments` | 2 |
| `downtime-codes` | 2 |
| `employee-payments` | 2 |
| `employees` | 2 |
| `equipment` | 2 |
| `job-grades` | 2 |
| `onboarding` | 2 |
| `plant-reports` | 2 |
| `sections` | 2 |
| `shift-reports` | 2 |
| `sites` | 2 |
| `stock-locations` | 2 |
| `uploads` | 2 |
| `work-orders` | 2 |
| `analytics` | 1 |
| `approvals` | 1 |
| `dashboard` | 1 |
| `ids` | 1 |

## Feature Catalog Domain Counts

Current feature catalog entries by domain:

| Domain | Feature Count |
| --- | ---: |
| `accounting` | 16 |
| `reports` | 14 |
| `schools` | 11 |
| `admin` | 11 |
| `hr` | 9 |
| `gold` | 8 |
| `cctv` | 8 |
| `core` | 7 |
| `retail` | 7 |
| `stores` | 6 |
| `autos` | 5 |
| `compliance` | 5 |
| `maintenance` | 5 |
| `scrap-metal` | 5 |
| `portal` | 4 |
| `operations` | 3 |

## Platform Admin Browser Surface

Current browser admin pages under `app/portal/admin/*`:

- dashboard
- companies
- clients
- client detail
- subscriptions
- add-ons
- features
- feature catalog
- commercial
- identity
- reliability
- health
- support access
- advanced
- settings
- templates
- audit log
- company dashboard
- company commercial
- company identity
- company features
- company support access
- company reliability
- company advanced
- company operations

## Current Surface Metrics

- Total App Router pages: `234`
- Total API route handlers: `375`
- Total Prisma models: `191`
- Total feature catalog entries: `124`
- Total add-on bundles: `20`
- Total tiers: `3`
- Total client templates: `9`

## Important Surface Notes

- The `v2` API namespace is already a major part of the product and contains much of the newer schools, autos, retail, and portal work.
- `portal` is the single largest page route family because it includes parent/student/teacher/POS/admin portal surfaces.
- `schools` is the largest tenant-facing vertical page family.
- `accounting` is the largest non-`v2` API family.
- `thrift` currently exists as a route surface, but current entitlement/catalog logic still leans on the retail foundation.
