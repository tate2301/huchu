# Huchu System Reference

This folder is the current system handbook for the Huchu platform as inspected on March 20, 2026.

It was assembled from the live codebase and the existing product/planning docs so it can answer four different questions clearly:

1. What the system is.
2. What is live in the product today.
3. How the platform is packaged, sold, and marketed.
4. What is planned, directional, or dark-launched rather than broadly live.

## Verified Current Snapshot

- `234` App Router pages under `app/`.
- `375` API route handlers under `app/api/`.
- `191` Prisma models in `prisma/schema.prisma`.
- `124` feature catalog entries across `16` feature domains.
- `20` add-on bundles and `3` subscription tiers.
- `9` client templates / vertical presets.
- `25` browser-based platform admin pages under `app/portal/admin`, plus the Ink-based platform TUI in `scripts/platform`.

## How To Use This Folder

- Start with `platform-overview.md` if you need the big picture.
- Read `live-capabilities.md` if you need a domain-by-domain inventory of what is currently implemented.
- Read `commercial-and-marketing.md` if you need positioning, packaging, pricing, safe claims, or GTM material.
- Read `roadmap-and-direction.md` if you need the planned expansion path and the difference between live product and documented intent.
- Read `route-and-surface-inventory.md` if you need the current route/API footprint and inventory counts.

## Source Material Used

The docs in this folder were grounded in:

- App routes in `app/*`.
- API routes in `app/api/*`.
- Schema and data model definitions in `prisma/schema.prisma`.
- Feature, bundle, tier, and template definitions in:
  - `lib/platform/feature-catalog.ts`
  - `lib/platform/client-templates.ts`
  - `lib/platform/gating/route-registry.ts`
  - `lib/workspace-products.ts`
  - `lib/workspaces.ts`
  - `lib/navigation.ts`
- Platform operations tooling in `scripts/platform/*`.
- Existing reference and planning docs, especially:
  - `docs/platform-pricing-feature-flags-and-modules.md`
  - `docs/industry-implementation-plans/package-features.md`
  - `docs/industry-implementation-plans/addons-and-bundles.md`
  - `docs/industry-implementation-plans/school-implementation-plan.md`
  - `docs/industry-implementation-plans/retail-implementation-plan.md`
  - `docs/industry-implementation-plans/auto-implementation-plan.md`
  - `docs/expansion-plan/platform-holy-grail.md`
  - `docs/expansion-plan/erp-expansion-master-plan.md`
  - `docs/expansion-plan/compact-context.md`
  - `docs/expansion-plan/zim-smb-market-gameplan.md`
  - `docs/build-plan/admin-control-plane-portal.md`
  - `docs/build-plan/brand-identity.md`
  - `docs/hr-module-capability-roadmap.md`
  - `docs/accounting/zimra-fiscalisation.md`
  - `CCTV_UI_SUMMARY.md`

## Important Reading Rule

These docs intentionally separate:

- `Live / verified now`: evidenced by page routes, APIs, schema, feature catalog, or active platform code.
- `Directional / roadmap`: documented in planning artifacts but not something marketing or implementation teams should claim as generally available without qualification.

That separation is important because the repository contains both working product surfaces and ambitious expansion plans.
