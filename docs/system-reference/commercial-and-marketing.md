# Commercial and Marketing Guide

This document translates the current platform into market-facing language while keeping claims anchored to the live product and documented packaging model.

> **Reviewed 2026-08-24.** Corrected for the August scope trim: the `TEMPLATE_SCRAP_METAL`,
> `TEMPLATE_CAR_SALES` and `TEMPLATE_SMALL_BUSINESS_SECURITY_STOCK` sections, the
> `ADDON_CCTV_SUITE` / `ADDON_AUTOS_SUITE` / `ADDON_SCRAP_METAL_SUITE` rows and the
> `BASIC`/`STANDARD`/`ENTERPRISE` tier table all described things that no longer exist.
> Bundle prices are no longer restated here — see `lib/platform/feature-catalog.ts`.

## Positioning Summary

### Short positioning line

Huchu is a multi-tenant operations and finance platform that lets businesses run sector-specific workflows on top of shared control, accounting, reporting, and administration rails.

### Mid-length positioning line

Huchu is a configurable business platform for operators that need operational control, finance integrity, and multi-site visibility without buying separate systems for every department. It supports mining, recycling, schools, auto sales, retail/POS, and broader multi-site SMB use cases through feature bundles and tenant templates.

### Long-form positioning

Huchu is best marketed as a Zimbabwe-ready, multi-industry operating platform rather than as a generic ERP clone. The product combines tenant-aware access control, commercial feature packaging, workflow-driven modules, branded document output, reporting, and platform operations tooling. On top of that shared foundation, it offers dedicated workspaces for gold operations, schools, retail/POS, CRM, and general business operations. The result is a system that can be sold as one platform with multiple vertical packs instead of as unrelated standalone apps.

## What Makes The Product Marketable

### 1. One platform, many vertical stories

The codebase already supports distinct market stories for:

- gold mines and mineral-buying operations
- schools and training institutions
- car dealerships and vehicle traders
- retailers and POS-heavy shops
- workshops and multi-site SMEs

This means marketing does not need to invent segmentation. The product already carries it structurally through workspace profiles, client templates, vertical product bundles, and route-level feature gating.

### 2. Commercial packaging is real

Huchu already contains:

- tier logic
- bundle logic
- template logic
- pricing calculation logic
- add-on dependencies
- company-level feature enablement
- user-level feature enablement

That is a major differentiator because it means sales packaging maps directly to live product controls.

### 3. Platform operations are part of the offer

Huchu can be positioned not only as end-user software but also as an operable SaaS platform because it already includes:

- admin portal
- support access flows
- commercial center data
- feature control
- reliability/health surfaces
- audit visibility
- platform TUI for deeper operator workflows

### 4. Finance and compliance credibility

The live system already has strong finance and control signals:

- accounting core and advanced surfaces
- tax and VAT functionality
- ZIMRA fiscalisation foundations
- workflow-heavy HR and disbursement flows
- audit-oriented document/output model
- support and contract enforcement models

This gives Huchu stronger credibility than a pure front-office workflow tool.

## Market-Ready Product Story

### Core narrative

Huchu helps operators replace disconnected spreadsheets, siloed line-of-business tools, and ad hoc admin processes with one platform that combines operations, finance, reporting, and governance.

### Why buyers should care

The platform is strongest when the buyer has some combination of:

- multiple sites, branches, or campuses
- operational handoffs between departments
- cash, stock, or settlement control requirements
- audit/compliance pressure
- branded document/reporting needs
- a need to stage adoption pack by pack instead of all at once

### Functional value pillars

- `Operational control`: field, campus, yard, shop, or branch workflows live in the same tenant-safe system.
- `Finance integrity`: accounting, tax, fiscalisation, disbursement, and posting-aware workflows support stronger controls.
- `Commercial flexibility`: tiers, bundles, and templates let the product fit different customer sizes and sectors.
- `Supportability`: platform admin, support access, audit, and reliability tooling make the product operable at scale.
- `Role-specific experiences`: portals and workspace-specific navigation reduce noise for different user groups.

## Ideal Customer Profiles By Template

### `TEMPLATE_GOLD_MINE`

- Best fit:
  - gold mines
  - mineral buying offices
  - processing operations
- Primary value story:
  - chain-of-custody visibility
  - settlement control
  - payroll/settlement coordination
  - audit and reporting

### `TEMPLATE_SCHOOLS`

- Best fit:
  - schools
  - training institutions
  - education operators
- Primary value story:
  - student lifecycle
  - academics and attendance
  - boarding and fee administration
  - parent/student/teacher visibility

### `TEMPLATE_RETAIL`

- Best fit:
  - small retailers
  - boutiques
  - resale operators
  - second-hand / thrift-adjacent merchants
- Primary value story:
  - POS and cashier control
  - catalog and pricing management
  - receiving and purchasing discipline
  - shift/cash-up visibility

### `TEMPLATE_TECH_WORKSHOP`

- Best fit:
  - service workshops
  - technician businesses
  - engineering/service teams
- Primary value story:
  - maintenance, stores, and payroll in one operating model

## Pricing and Packaging

Currency is currently modeled in `USD`.

### Subscription tiers

`BASIC` / `STANDARD` / `ENTERPRISE` no longer exist. The marketed line-up is six SKUs,
defined in `lib/marketing/pricing.ts`:

| Tier | Positioning |
| --- | --- |
| `FISCAL` | Fiscalise first — ZIMRA/FDMS on every till, for businesses whose binding obligation is the receipt |
| `START` | One shop, yard or office still keeping records in a book |
| `GROW` | Growing operators adding stock, purchasing and staff control |
| `SCALE` | Multi-site operators needing branch and cash control |
| `GOLD_EDITION` | The gold vertical's own packaging |
| `ENTERPRISE` | Quoted, not listed (`QUOTED_TIER_CODES`) — groups with audit, compliance and payroll obligations across many sites |

**Prices are deliberately not repeated here.** They live in `lib/marketing/pricing.ts` and
`lib/platform/feature-catalog.ts` and are synced to the database from there. Duplicating them
into this document is what made the previous table wrong for months.

### Current add-on bundles

| Bundle | Base / Month | Additional Site / Month | Notes |
| --- | ---: | ---: | --- |
| `ADDON_CUSTOM_BRANDING` | 120 | 0 | branding + custom domain support |
| `ADDON_ADVANCED_PAYROLL` | 250 | 30 | payroll/disbursement-heavy workflows |
| `ADDON_GOLD_ADVANCED` | 220 | 25 | reconciliation, exceptions, audit, payouts |
| `ADDON_COMPLIANCE_PRO` | 200 | 25 | permits, inspections, incidents, training |
| `ADDON_MAINTENANCE_PRO` | 180 | 20 | equipment, work orders, breakdowns |
| `ADDON_USER_MANAGEMENT_PRO` | 180 | 20 | advanced user lifecycle controls |
| `ADDON_ANALYTICS_PRO` | 160 | 15 | analytics surfaces and push features |
| `ADDON_ACCOUNTING_CORE` | 250 | 30 | core accounting and financials |
| `ADDON_ACCOUNTING_ADVANCED` | 350 | 40 | AR/AP, banking, cost centers, FX (assets and budgets were removed under ST-3.4) |
| `ADDON_ZIMRA_FISCAL` | 120 | 15 | VAT and fiscalisation support |
| `ADDON_SCHOOLS_SUITE` | 320 | 35 | student, academics, boarding, fees, and school portals |
| `ADDON_RETAIL_SUITE` | 180 | 20 | retail, POS, purchasing, merchandising |
| `ADDON_PORTAL_SUITE` | 110 | 10 | shared external portal shell across verticals |

Added to the catalog since this table was written, and not priced here: `ADDON_CRM_SUITE`,
`ADDON_COMMODITY_SETTLEMENTS`, `ADDON_ZIMBABWE_PAYROLL`. Check
`lib/platform/feature-catalog.ts` for the authoritative list and current prices.

The platform also includes non-priced foundational bundles such as operations core, stores core, workforce core, and gold core that help shape templates and entitlement sets.

### Important commercial nuance

All currently marketed bundles in the live catalog now carry explicit pricing. Zero-priced bundles still exist in the codebase, but those are foundational internal packs used to shape templates and entitlements rather than customer-facing upsell bundles.

## Cross-Sell and Upsell Paths

### Gold operations expansion

Start with:

- operations core
- workforce
- stores
- gold core

Then expand into:

- gold advanced
- compliance pro
- maintenance pro
- analytics pro
- accounting core and advanced

### School expansion

Start with:

- schools suite
- portal suite

Then expand into:

- accounting core
- accounting advanced
- branding/custom domain
- notifications and reporting value-adds

### Retail expansion

Start with:

- retail suite

Then expand into:

- accounting core/advanced
- workforce
- branding
- analytics
- add-on loyalty/ecommerce style roadmap items when they exist

### Multi-site SME expansion

Start with:

- stores
- workforce
- retail/POS

Then expand into:

- accounting
- maintenance
- analytics
- branding/custom domain

## Marketing-Safe Claims

The following claims are well-supported by the current codebase and can be used confidently in product, sales, and marketing material.

### Safe claims now

- Huchu is a multi-tenant platform with tenant-aware host enforcement.
- Huchu supports configurable vertical workspaces and client templates.
- Huchu includes live modules for gold, schools, retail/POS, CRM, accounting, HR, maintenance, compliance, and reporting. **Do not claim scrap and recycling, auto sales, or CCTV — those modules were deleted in August 2026.**
- Huchu includes role-specific portals for parents, students, teachers, cashiers/POS users, and platform admins.
- Huchu includes a platform admin portal and an operator TUI for deeper platform operations.
- Huchu includes branding, document templating, and PDF/document rendering infrastructure.
- Huchu includes accounting, tax, and ZIMRA fiscalisation foundations.
- Huchu includes feature bundles, subscription tiers, and per-tenant/per-user entitlement control.
- Huchu includes support access, reliability, health, and audit models that strengthen its SaaS operating story.

### Claims that need qualification

- "offline-first platform"
- "passwordless platform"
- "OTP-secured platform for all users"
- "dedicated standalone thrift product"
- "full parity between web admin and TUI"
- "all roadmap add-ons are live"

Those should only be used with qualifiers such as `planned`, `scaffolded`, `dark-launch`, `directional`, or `currently being expanded`.

## What Not To Overclaim

### Offline

Some UI copy references offline behavior, especially in earlier operational flows and planning docs, but the repo does not currently show broad production offline infrastructure such as service worker registration or IndexedDB-backed sync. Do not market the platform as broadly offline-first today.

### OTP and non-admin passwordless auth

The auth strategy registry includes dark-launch email-link and OTP strategies, but only credentials and admin magic-link are currently marked live. Do not sell OTP/passwordless access as a generally live capability yet.

### Thrift as a separate product

Thrift routes exist, but the current feature catalog still maps thrift through the retail foundation rather than a fully separate live entitlement family. Market thrift carefully as part of the retail/resale direction unless or until its pack is fully separated.

## Differentiators Against Generic SMB Tools

Huchu is differentiated when compared with generic SMB tools because it combines:

- operational workflows plus finance controls in one platform
- multi-sector packaging without multiple runtime forks
- feature-gated and tenant-scoped commercialization
- browser portals plus platform operations tooling
- branded output and document control
- Zimbabwe-ready tax/fiscalisation direction

That makes it stronger than a simple CRUD SaaS product and more modular than a rigid single-industry application.

## Demo Stories For Sales

### Gold demo

Show how a tenant can record gold output or purchases, move material through dispatch and receipt, manage payout-related flows, and open gold-chain reports from the same workspace.

### School demo

Show admissions, student directory, boarding, attendance, fee workflows, notices, results publishing, and the parent/student/teacher portal surfaces.

### Auto sales demo

Show leads, inventory, deal progression, reserve/contract actions, and financing views.

### Retail demo

Show catalog, POS, held carts, refund/void flows, promotions, purchasing, and shift close surfaces.

### Platform admin demo

Show company list, subscriptions, add-ons, features, support access, reliability, and company-scoped detail pages to prove that the product is operable as a platform and not only as a tenant app.

## Marketing Copy Bank

### Homepage headline option

One platform for operations, finance, control, and reporting across mines, schools, shops, dealerships, and multi-site businesses.

### Secondary line option

Run sector-specific workflows on shared accounting, reporting, branding, and administration rails instead of stitching together separate systems.

### Sales one-liner option

Huchu lets growing operators buy one configurable operating platform and turn on the packs they need as the business matures.

### Investor / partner framing option

Huchu is a verticalized operating platform with a shared multi-tenant control plane, sector templates, and commercialization logic built directly into the application layer.
