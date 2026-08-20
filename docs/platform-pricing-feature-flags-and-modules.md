# Platform Pricing, Feature Bundles, Subscriptions, and Feature Flags

> **Supersession notice (2026-08-18).** The pricing figures in this document (tier prices, the
> annual-billing multiplier, and the bundle price list) are superseded by the rollout program —
> see `docs/rollout/master-rollout-plan.md` and `docs/rollout/pricing-packaging-roadmap.md` for
> the adopted target structure. Until story PR-6.1 rewrites this document, the catalog in
> `lib/platform/feature-catalog.ts` remains what the platform actually charges, and this
> document's **mechanism** content — the pricing formula, feature-flag behavior, and the
> checklist for adding a feature, module, or bundle — remains normative and in force.

## Scope

This document is the current source of truth for:

- subscription tiers and pricing
- add-on bundles and pricing
- client template bundles (by client type)
- pricing calculation logic
- feature flag behavior in app/platform code
- current TUI modules and how to extend them

Currency is `USD`.

## Subscription Pricing Model

Pricing is multi-site aware and calculated using active sites.

Formula:

`total_monthly = tier_base + tier_site_overage + addon_base_total + addon_site_total + standalone_billable_feature_total`

Where:

- `tier_site_overage = max(0, active_site_count - tier.includedSites) * tier.additionalSiteMonthlyPrice`
- `addon_site_total = sum(addon.additionalSiteMonthlyPrice * active_site_count)` for enabled add-ons
- standalone billable features are only charged when enabled and not already included by tier/add-ons

Implementation paths:

- App-side entitlements/pricing: `lib/platform/entitlements.ts`
- Platform TUI/commercial pricing: `scripts/platform/domain/commercial-service.ts`

## Subscription Tiers

Defined in `lib/platform/feature-catalog.ts` (`TIERS`).

| Tier | Base / Month | Included Sites | Additional Site / Month | Warning Days | Grace Days |
| --- | ---: | ---: | ---: | ---: | ---: |
| `BASIC` | 29 | 1 | 19 | 14 | 7 |
| `STANDARD` | 79 | 3 | 29 | 14 | 7 |
| `MEDIUM` | 189 | 8 | 39 | 14 | 7 |
| `ENTERPRISE` | 449 | 25 | 39 | 21 | 14 |

Notes:

- Tier inclusions are code-defined in `TIERS`; do not change plan defaults directly in the database.
- Higher tiers include selected add-ons at no extra charge through `includedBundles`.
- Tier assignment and health enforcement are handled in platform services and TUI wizards.

## Add-on Bundles

Defined in `lib/platform/feature-catalog.ts` (`FEATURE_BUNDLES`).

The catalog includes both sellable add-ons and zero-priced foundation bundles used by templates and entitlement shaping.

| Bundle Code | Name | Base / Month | Additional Site / Month |
| --- | --- | ---: | ---: |
| `ADDON_OPERATIONS_CORE` | Operations Core | 0 | 0 |
| `ADDON_MINE_DAILY_OPS` | Mine Daily Operations | 0 | 0 |
| `ADDON_STORES_CORE` | Stores Core | 0 | 0 |
| `ADDON_WORKFORCE_CORE` | Workforce Core | 0 | 0 |
| `ADDON_GOLD_CORE` | Gold Operations | 69 | 15 |
| `ADDON_CUSTOM_BRANDING` | Custom Branding | 29 | 0 |
| `ADDON_CCTV_SUITE` | CCTV Suite | 99 | 15 |
| `ADDON_ADVANCED_PAYROLL` | Advanced Payroll | 49 | 10 |
| `ADDON_GOLD_ADVANCED` | Gold Advanced Controls | 79 | 10 |
| `ADDON_COMPLIANCE_PRO` | Compliance Pro | 49 | 10 |
| `ADDON_MAINTENANCE_PRO` | Maintenance Pro | 39 | 10 |
| `ADDON_USER_MANAGEMENT_PRO` | User Management Pro | 19 | 5 |
| `ADDON_ANALYTICS_PRO` | Analytics Pro | 29 | 5 |
| `ADDON_ACCOUNTING_CORE` | Accounting Core | 39 | 10 |
| `ADDON_ACCOUNTING_ADVANCED` | Accounting Advanced | 49 | 10 |
| `ADDON_ZIMRA_FISCAL` | ZIMRA Tax & Fiscalisation | 19 | 5 |
| `ADDON_SCHOOLS_SUITE` | Schools Suite | 129 | 29 |
| `ADDON_AUTOS_SUITE` | Auto Sales Suite | 59 | 10 |
| `ADDON_RETAIL_SUITE` | Retail Suite | 39 | 10 |
| `ADDON_CRM_CORE` | CRM Core | 19 | 5 |
| `ADDON_PORTAL_SUITE` | Client Portal Suite | 19 | 5 |
| `ADDON_SCRAP_METAL_SUITE` | Scrap Metal Suite | 39 | 10 |

### Bundle Feature Mapping

`ADDON_OPERATIONS_CORE`

- `reports.dashboard`
- `admin.sites-sections`

`ADDON_MINE_DAILY_OPS`

- `ops.shift-report.submit`
- `ops.attendance.mark`
- `ops.plant-report.submit`
- `reports.shift`
- `reports.attendance`
- `reports.plant`

`ADDON_STORES_CORE`

- `stores.dashboard`
- `stores.inventory`
- `stores.movements`
- `stores.issue`
- `stores.receive`
- `reports.stores-movements`

`ADDON_WORKFORCE_CORE`

- `hr.employees`

`ADDON_GOLD_CORE`

- `gold.home`
- `gold.intake.pours`
- `gold.dispatches`
- `gold.receipts`

`ADDON_CUSTOM_BRANDING`

- `core.branding.manage`
- `core.branding.custom-domain`

`ADDON_CCTV_SUITE`

- `cctv.overview`
- `cctv.live`
- `cctv.cameras`
- `cctv.nvrs`
- `cctv.events`
- `cctv.playback`
- `cctv.access-logs`
- `cctv.streaming-control`
- `reports.cctv-events`

`ADDON_ADVANCED_PAYROLL`

- `hr.payroll`
- `hr.disbursements`
- `hr.compensation-rules`
- `hr.incidents`
- `hr.disciplinary-actions`
- `hr.salaries`
- `hr.approvals-history`
- `hr.settlements`
- `admin.payroll-config`

`ADDON_GOLD_ADVANCED`

- `gold.reconciliation`
- `gold.exceptions`
- `gold.audit-trail`
- `gold.payouts`
- `reports.gold-chain`
- `reports.gold-receipts`

`ADDON_COMPLIANCE_PRO`

- `compliance.overview`
- `compliance.permits`
- `compliance.inspections`
- `compliance.incidents`
- `compliance.training-records`
- `reports.compliance-incidents`

`ADDON_MAINTENANCE_PRO`

- `maintenance.dashboard`
- `maintenance.equipment`
- `maintenance.work-orders`
- `maintenance.breakdowns`
- `maintenance.schedule`
- `reports.maintenance-work-orders`
- `reports.maintenance-equipment`

`ADDON_USER_MANAGEMENT_PRO`

- `admin.user-management.core`
- `admin.user-management.create`
- `admin.user-management.status`
- `admin.user-management.password-reset`
- `admin.user-management.role-change`
- `admin.user-management.feature-access`
- `admin.user-management.directory`

`ADDON_ANALYTICS_PRO`

- `reports.downtime-analytics`
- `reports.audit-trails`
- `core.notifications.push`

`ADDON_ACCOUNTING_CORE`

- `accounting.core`
- `accounting.chart-of-accounts`
- `accounting.journals`
- `accounting.periods`
- `accounting.posting-rules`
- `accounting.trial-balance`
- `accounting.financial-statements`

`ADDON_ACCOUNTING_ADVANCED`

- `accounting.ar`
- `accounting.ap`
- `accounting.banking`
- `accounting.fixed-assets`
- `accounting.budgets`
- `accounting.cost-centers`
- `accounting.multi-currency`

`ADDON_ZIMRA_FISCAL`

- `accounting.tax`
- `accounting.zimra.fiscalisation`

`ADDON_SCHOOLS_SUITE`

- `schools.core`
- `schools.admissions`
- `schools.students`
- `schools.attendance`
- `schools.fees`
- `schools.boarding`
- `schools.teachers`
- `schools.results`
- `schools.portal.parent`
- `schools.portal.student`
- `schools.portal.teacher`

`ADDON_AUTOS_SUITE`

- `autos.core`
- `autos.inventory`
- `autos.leads`
- `autos.deals`
- `autos.financing`

`ADDON_RETAIL_SUITE`

- `retail.core`
- `retail.pos`
- `retail.catalog`
- `retail.purchasing`
- `retail.promotions`
- `retail.shifts`
- `retail.reports`
- `crm.customers`
- `portal.pos`

`ADDON_CRM_CORE`

- `crm.customers`

`ADDON_PORTAL_SUITE`

- `portal.core`
- `portal.schools`
- `portal.autos`
- `portal.pos`

`ADDON_SCRAP_METAL_SUITE`

- `scrap-metal.home`
- `scrap-metal.purchases`
- `scrap-metal.batches`
- `scrap-metal.sales`
- `scrap-metal.pricing`
- `stores.dashboard`
- `stores.inventory`
- `stores.movements`
- `stores.issue`
- `stores.receive`

### Why a Bundle May Not Show After Sync

`Sync Catalog` is an upsert from code-defined catalog rows into the database. It does not discover modules from `app/` routes, navigation labels, page headings, or custom UI text.

If a bundle is missing after sync, check these in order:

1. The bundle exists in `FEATURE_BUNDLES` in `lib/platform/feature-catalog.ts`.
2. Every feature listed by that bundle exists in `FEATURE_CATALOG`.
3. New page/API routes map to those feature keys in `lib/platform/gating/route-registry.ts`.
4. The route mapping is more specific than broad fallbacks such as `/retail`, `/portal`, or `/api/v2/retail`.
5. The bundle was not created only as a custom database row; custom rows can be useful operationally, but system bundles must be represented in code.

The CRM issue came from this exact gap: customer screens existed under `/retail/customers`, and the UI labelled charts as `CRM`, but there was no `crm` domain, no `crm.customers` feature key, and no `ADDON_CRM_CORE` entry in `FEATURE_BUNDLES`. Catalog sync could not create a bundle that was absent from the source catalog, so the route fell through to `retail.core` and CRM never appeared in the bundle catalog.

### Bundle Behavior in TUI

- Enabling an add-on now auto-enables feature flags for every feature in that bundle.
- Disabling an add-on now auto-disables only bundle features that are no longer entitled by tier/other enabled bundles.
- This keeps bundle provisioning aligned with effective feature access.
- Add-on-only features should use `defaultEnabled: false` so they remain disabled until enabled by entitled tier/add-on access.
- Bundle dependencies are enforced in `lib/platform/feature-catalog.ts` (`BUNDLE_DEPENDENCIES`). Advanced accounting and ZIMRA require `ADDON_ACCOUNTING_CORE`; Gold Advanced requires `ADDON_GOLD_CORE`.

## Client Template Bundles

Defined in `lib/platform/client-templates.ts`.

Current templates:

- `TEMPLATE_CORE_STARTER` (`BASIC`)
- `TEMPLATE_GOLD_MINE` (`ENTERPRISE`)
- `TEMPLATE_SMALL_BUSINESS_SECURITY_STOCK` (`STANDARD`) - HR + CCTV + stock oriented multi-site starter
- `TEMPLATE_TECH_WORKSHOP` (`STANDARD`) - stock + maintenance + HR/payroll depth
- `TEMPLATE_SCRAP_METAL` (`STANDARD`) - scrap and recycling operating starter
- `TEMPLATE_SCHOOLS` (`BASIC`) - schools + portal starter
- `TEMPLATE_CAR_SALES` (`BASIC`) - auto sales + portal starter
- `TEMPLATE_RETAIL` (`STANDARD`) - retail/POS + stock + accounting starter
- `TEMPLATE_ALL_FEATURES` (`ENTERPRISE`) - enables all catalog features

Templates now support `disabledFeatureKeys` to explicitly remove selected features from the template enable-set.

Template aliases accepted in provisioning:

- `BASE` -> `TEMPLATE_CORE_STARTER`
- `GOLD` -> `TEMPLATE_GOLD_MINE`
- `SCHOOL` / `SCHOOLS` -> `TEMPLATE_SCHOOLS`
- `SCRAP` / `SCRAP_METAL` -> `TEMPLATE_SCRAP_METAL`
- `AUTOS` / `CAR-SALES` / `CAR_SALES` -> `TEMPLATE_CAR_SALES`
- `THRIFT` / `RETAIL` -> `TEMPLATE_RETAIL`
- `FULL` / `ALL` -> `TEMPLATE_ALL_FEATURES`

## Subscription Lifecycle and Health

Statuses:

- `TRIALING`
- `ACTIVE`
- `PAST_DUE`
- `CANCELED`
- `EXPIRED`

Health states:

- `MISSING_SUBSCRIPTION`
- `ACTIVE`
- `EXPIRING_SOON`
- `IN_GRACE`
- `EXPIRED_BLOCKED`

Implementation:

- Health logic: `lib/platform/subscription.ts` and `scripts/platform/domain/commercial-service.ts`
- Persisted pricing snapshot fields on `CompanySubscription`:
  - `effectiveMonthlyAmount`
  - `priceSnapshotJson`
  - `lastPriceComputedAt`

## TUI Operations for Commercial Management

Run the TUI:

`pnpm platform --actor <operator-email>`

The subscriptions domain includes:

- `Set Subscription Status`
- `Assign Subscription Tier`
- `Apply Client Template`
- `Manage Add-ons`
- `Recompute Pricing`
- `Sync Catalog`

Relevant files:

- Tree actions: `scripts/platform/tree/action-tree.ts`
- Module router: `scripts/platform/modules/subscriptions.tsx`
- Wizards:
  - `scripts/platform/modules/wizards/subscription-status-wizard.tsx`
  - `scripts/platform/modules/wizards/subscription-tier-wizard.tsx`
  - `scripts/platform/modules/wizards/subscription-template-wizard.tsx`
  - `scripts/platform/modules/wizards/subscription-addons-wizard.tsx`
  - `scripts/platform/modules/wizards/subscription-pricing-wizard.tsx`
  - `scripts/platform/modules/wizards/subscription-catalog-sync-wizard.tsx`

## Feature Flags in Application Code

### Source of Truth

Feature definitions live in:

- `lib/platform/feature-catalog.ts`

This file defines:

- `FEATURE_CATALOG` for feature metadata and default billable values
- `FEATURE_BUNDLES` for grouped features
- `TIERS` for tier-included features and bundles

Route mappings live in:

- `lib/platform/gating/route-registry.ts`

This file defines:

- `PAGE_FEATURE_ROUTES` for page route prefixes
- `API_FEATURE_ROUTES` for API route prefixes
- `resolveFeatureKeyForPath(pathname)` for page/API feature resolution

### Runtime Resolution and Enforcement

Entitlements and merging logic:

- `lib/platform/entitlements.ts`

Feature checks:

- `lib/platform/features.ts`

API-level enforcement:

- `lib/platform/feature-gate.ts`
- `lib/api-utils.ts` (`validateSession` calls feature gate)

Middleware-level enforcement for page and selected API paths:

- `middleware.ts`

Auth/session token enrichment with enabled features:

- `lib/auth.ts`
- `types/next-auth.d.ts`

### How to Add a New Feature, Module, or Bundle

Use this checklist before running `Sync Catalog`.

1. Decide the commercial unit.
   - New feature only: add a key to `FEATURE_CATALOG`.
   - New sellable bundle: add a code to `FEATURE_BUNDLES`.
   - New workspace module: add feature keys, routes, navigation, and workspace presentation together.
2. If the module has a new domain, add it to `FeatureDomain` in `lib/platform/feature-catalog.ts`.
3. Add feature metadata to `FEATURE_CATALOG`.
   - Use stable dot keys such as `crm.customers`.
   - Keep billable add-on features `defaultEnabled: false`.
   - Put pricing on bundles unless the feature is sold standalone.
4. Add or update `FEATURE_BUNDLES`.
   - A system bundle only appears in the bundle catalog if it is listed here.
   - If an existing suite should continue to grant the feature, include the feature in both the new bundle and the existing suite. Example: `crm.customers` is in `ADDON_CRM_CORE` and `ADDON_RETAIL_SUITE`.
   - Add required parent bundles in `BUNDLE_DEPENDENCIES` when needed.
5. Add page and API mappings in `lib/platform/gating/route-registry.ts`.
   - Add the most-specific prefixes first conceptually, even though the resolver sorts by prefix length.
   - Always map child routes before broad fallbacks like `/retail`, `/portal`, `/api/retail`, and `/api/v2/retail`.
   - Map both app pages and API endpoints. API handlers using `validateSession` are gated through the path resolver.
6. Add navigation and workspace visibility.
   - Add a section in `lib/navigation.ts` when the module needs a sidebar entry.
   - Add the module to `WorkspaceModuleId`, `DEFAULT_MODULE_PRESENTATION`, `WORKSPACE_MODULE_ORDER`, and `WORKSPACE_MODULES` in `lib/workspace-products.ts` / `lib/workspaces.ts` when it must appear independently.
   - Add quick actions in `lib/primary-actions.ts` only when there is a natural first action.
7. Register user roles when the module introduces module-specific staff personas.
   - User-account roles are registered in `lib/platform/vertical-role-registry.ts`.
   - Profile-wide roles belong in `VERTICAL_ROLE_REGISTRY`; add-on/module-driven roles belong in `FEATURE_ROLE_REGISTRY`.
   - Role defaults must also be reflected in `lib/platform/user-entitlements.ts` so users created with that role inherit the right enabled feature access.
   - Example: CRM uses the existing `SALES_EXEC` user-account role and registers it against `crm.customers`; `SALES_REP` is an employee position, not a login role.
   - Do not hard-code role dropdowns. HR employee onboarding, web user management, platform admin dialogs, and TUI user wizards should consume `getAllowedUserRoleOptionsForWorkspace` or the TUI wrapper in `scripts/platform/user-role-options.ts`.
8. Add template access in `lib/platform/client-templates.ts`.
   - Include the bundle in relevant templates.
   - Use `disabledFeatureKeys` only to remove inherited features from a template.
9. Add marketing/pricing metadata if the bundle is paid.
   - Add category mapping in `lib/marketing/pricing.ts`.
   - Update this document's bundle table and feature mapping.
10. Add regression coverage.
   - Extend `lib/workspace-feature-resolution.test.ts` for route gating, sidebar visibility, and bundle membership.
   - Add role-registry assertions when the module registers user roles.
   - Extend `lib/marketing/pricing.test.ts` when marketing/product pricing references the new bundle.
11. Run validation before syncing:
    - `pnpm test -- lib/workspace-feature-resolution.test.ts`
    - `pnpm test -- lib/marketing/pricing.test.ts` if pricing changed
    - `pnpm platform:audit-feature-gates`
    - `pnpm lint`
12. Run TUI `Sync Catalog` to materialize catalog rows to DB.
13. Confirm the sync result count and the admin bundle list.
    - The sync wizard should report the expected bundle count.
    - `/admin/commercial?view=bundles` should show the system bundle as source `SYSTEM`.

For extra server checks outside route gating, use `hasFeature(companyId, "feature.key")` from `lib/platform/features.ts`.

## Current Platform TUI Modules

Current module/workspace domains:

- Provisioning
- Client Operations
- Billing & Contracts
- Support Access
- Reliability & Remediation
- Audit & Compliance

Mounted module implementations:

- Organizations
- Subscriptions
- Features
- Admins
- Support
- Contracts
- Health
- Runbooks
- Audit

Reference:

- `scripts/platform/app.tsx`
- `scripts/platform/modules/*.tsx`

## How to Add a New Module or Wizard

1. Add operation in `scripts/platform/tree/action-tree.ts`.
2. Route operation to a module in `scripts/platform/modules/<module>.tsx`.
3. Implement wizard in `scripts/platform/modules/wizards/<wizard>.tsx`.
4. Use selector-first UX patterns instead of raw ID typing.
5. Keep input-lock enabled in wizard (`useInputLock`) to avoid global hotkey conflicts while typing.
