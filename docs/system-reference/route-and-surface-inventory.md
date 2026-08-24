# Route and Surface Inventory

This appendix gives a current-state footprint snapshot of the system.

> **Route-group tables regenerated 2026-08-24** against the working tree: 340 page routes
> across `app/`, 613 API routes under `app/api/`. The March 20, 2026 tables listed `cctv`,
> `scrap-metal` and `car-sales` groups that no longer exist, and predated `crm`, `retail` and
> the `v2` API consolidation. Both tables now show the top 14 groups by count.
>
> The **Feature Catalog Domain Counts**, **Platform Admin Browser Surface** and **Current
> Surface Metrics** sections below have *not* been regenerated and still reflect March —
> treat their numbers as stale until someone recounts them.

## Page Route Groups

Top-level App Router page counts by route group:

| Route Group | Page Count |
| --- | ---: |
| `portal` | 75 |
| `schools` | 48 |
| `crm` | 35 |
| `gold` | 23 |
| `retail` | 23 |
| `accounting` | 17 |
| `home` | 17 |
| `preferences` | 15 |
| `reports` | 13 |
| `management` | 12 |
| `stores` | 10 |
| `people` | 7 |
| `payroll` | 7 |
| `compliance` | 5 |

## API Route Groups

Top-level API route counts by route group:

| API Group | Route Count |
| --- | ---: |
| `v2` | 306 |
| `accounting` | 88 |
| `gold` | 48 |
| `settlements` | 13 |
| `payroll` | 13 |
| `platform-admin` | 12 |
| `compensation` | 12 |
| `public` | 11 |
| `users` | 10 |
| `people` | 10 |
| `hr` | 10 |
| `compliance` | 8 |
| `notifications` | 6 |
| `disbursements` | 6 |

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
