# Platform Pricing, Feature Bundles, Subscriptions, and Feature Flags

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
| `BASIC` | 450 | 1 | 90 | 14 | 7 |
| `STANDARD` | 900 | 3 | 140 | 14 | 7 |
| `ENTERPRISE` | 1800 | 8 | 220 | 21 | 14 |

Notes:

- `ENTERPRISE` includes `ADDON_ANALYTICS_PRO` by default.
- User management is add-on-only. No tier includes `ADDON_USER_MANAGEMENT_PRO` or `admin.user-management.*` by default.
- Tier assignment and health enforcement are handled in platform services and TUI wizards.

## Add-on Bundles

Defined in `lib/platform/feature-catalog.ts` (`FEATURE_BUNDLES`).

| Bundle Code | Name | Base / Month | Additional Site / Month |
| --- | --- | ---: | ---: |
| `ADDON_CCTV_SUITE` | CCTV Suite | 300 | 40 |
| `ADDON_ADVANCED_PAYROLL` | Advanced Payroll | 250 | 30 |
| `ADDON_GOLD_ADVANCED` | Gold Advanced Controls | 220 | 25 |
| `ADDON_COMPLIANCE_PRO` | Compliance Pro | 200 | 25 |
| `ADDON_MAINTENANCE_PRO` | Maintenance Pro | 180 | 20 |
| `ADDON_USER_MANAGEMENT_PRO` | User Management Pro | 180 | 20 |
| `ADDON_ANALYTICS_PRO` | Analytics Pro | 160 | 15 |
| `ADDON_ACCOUNTING_CORE` | Accounting Core | 250 | 30 |
| `ADDON_ACCOUNTING_ADVANCED` | Accounting Advanced | 350 | 40 |
| `ADDON_ZIMRA_FISCAL` | ZIMRA Tax & Fiscalisation | 120 | 15 |

### Bundle Feature Mapping

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
- `hr.gold-payouts`
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
- `admin.user-management.directory`

`ADDON_ANALYTICS_PRO`

- `stores.fuel-ledger`
- `reports.downtime-analytics`
- `reports.audit-trails`
- `reports.fuel-ledger`
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

### Bundle Behavior in TUI

- Enabling an add-on now auto-enables feature flags for every feature in that bundle.
- Disabling an add-on now auto-disables only bundle features that are no longer entitled by tier/other enabled bundles.
- This keeps bundle provisioning aligned with effective feature access.
- Add-on-only features should use `defaultEnabled: false` so they remain disabled until enabled by entitled tier/add-on access.
- Bundle dependencies are enforced in `lib/platform/feature-catalog.ts` (`BUNDLE_DEPENDENCIES`). Accounting add-ons require `ADDON_ACCOUNTING_CORE`.

## Client Template Bundles

Defined in `lib/platform/client-templates.ts`.

Current templates:

- `TEMPLATE_CORE_STARTER` (`BASIC`)
- `TEMPLATE_GOLD_MINE` (`ENTERPRISE`)
- `TEMPLATE_SMALL_BUSINESS_SECURITY_STOCK` (`STANDARD`) - HR + CCTV + stock + fuel oriented
- `TEMPLATE_TECH_WORKSHOP` (`STANDARD`) - stock + maintenance + HR/payroll depth
- `TEMPLATE_ALL_FEATURES` (`ENTERPRISE`) - enables all catalog features

Template aliases accepted in provisioning:

- `BASE` -> `TEMPLATE_CORE_STARTER`
- `GOLD` -> `TEMPLATE_GOLD_MINE`
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

Feature definitions and routing map live in:

- `lib/platform/feature-catalog.ts`

This file defines:

- `FEATURE_CATALOG` for feature metadata and default billable values
- `FEATURE_BUNDLES` for grouped features
- `TIERS` for tier-included features and bundles
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

### How to Gate a New Route

1. Add feature key metadata to `FEATURE_CATALOG` in `lib/platform/feature-catalog.ts`.
2. Add page/API prefix mapping in `PAGE_FEATURE_ROUTES` or `API_FEATURE_ROUTES` in `lib/platform/gating/route-registry.ts`.
3. Include it in tier/bundle defaults if needed.
4. Run TUI `Sync Catalog` action to materialize catalog to DB.
5. For API handlers using `validateSession`, gating is automatic via path resolution.
6. For extra server checks, use `hasFeature(companyId, "feature.key")` from `lib/platform/features.ts`.

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
