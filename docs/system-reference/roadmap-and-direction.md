# Roadmap and Direction

This document captures important planned or directional capabilities that appear in the existing planning docs but should be kept separate from live capability claims.

## Why This Separation Matters

The repository contains a lot of genuine forward planning:

- vertical expansion plans
- commercial bundle ideas
- admin control plane redesign work
- HR roadmap work
- pack-specific implementation contracts
- dark-launch auth strategies

That is valuable, but it should not blur the line between:

- what customers can use now
- what the product is intentionally evolving toward

## Program Direction: Shared Runtime, Multiple Packs

The expansion docs consistently reinforce a common direction:

- one shared runtime
- strict tenant partitioning by `companyId`
- feature-gated pack activation
- auditable workflow transitions
- deterministic accounting events for finance-impacting flows

The explicit pack sequence documented in the expansion plan is:

1. Schools
2. Car sales
3. Thrift

Even though retail/POS surfaces are already live, the roadmap still treats thrift as a deeper pack that needs fuller identity and workflow separation.

## Admin Control Plane Direction

The admin portal build plan describes a richer future browser control plane with:

- dashboard as operational cockpit
- workspace switching between platform, organization, and site scopes
- command bar across commands, tenants, sites, admins, support sessions, incidents, and runbooks
- route-backed list/detail screens
- mutation flows launched from modal/sheet wizards
- stronger parity with the TUI action tree
- guided, auditable support-access and impersonation flows

This is directionally important because the TUI already proves the operational model. The web portal is planned to become the more discoverable and production-grade expression of the same control plane.

## Auth Direction

The auth strategy registry clearly marks two future-facing strategies:

- `email-link`
- `otp`

Both are dark-launch/future strategies for non-admin surfaces. Current product messaging should describe them as planned or scaffolded, not as generally available.

## Schools Direction

The school implementation and expansion docs still call for additional depth in areas such as:

- richer tenant and role governance
- copy-forward academic structures
- timetable conflict detection
- holidays/calendar logic
- health and consent flags with broader document tracking
- duplicate detection
- late fee rules, payment plans, dunning, and auto-reminders
- conduct/discipline workflows
- bulk imports and exports
- scheduled report emails
- more complete export and audit protection flows

The live schools pack is already substantial, but the roadmap shows it becoming a fuller school information and administration system.

## Auto Sales Direction

The auto implementation plan points toward deeper capabilities including:

- reminder and SLA flows in lead management
- richer pricing and reconditioning controls
- photo/document upload for vehicles and deals
- trade-in valuation depth
- EMI calculators and lender templates
- delivery checklist hardening
- title/registration documentation
- after-sales/service hooks
- scheduled executive KPI emails

This means the current live auto pack should be framed as a strong operational foundation with clear room to expand into a more complete dealership operating system.

## Retail and Thrift Direction

The retail and thrift planning material points to future depth in:

- offline-safe POS queueing and replay
- device registration and stronger shift binding
- vouchers and couponing
- stock counts and transfer workflows
- lot/serial depth and stock-ledger parity checks
- supplier returns and landed cost allocation
- three-way match controls
- register lock and variance governance
- dedicated thrift intake/grading/lot lifecycle
- consignment support
- omnichannel and ecommerce-style connectors

Today, retail is live and thrift is partially surfaced. The longer-term direction is a stronger split between generic retail/POS and dedicated thrift-specific lifecycle controls.

## HR Direction

The HR roadmap adds another layer beyond the current workflow-heavy HR base. Planned direction includes:

- SLA timers
- escalation policies
- immutable workflow timeline cards
- structured rejection reasons
- compensation impact simulation
- versioned rule-set rollback
- payroll reconciliation checklists
- dual-acknowledgement for disbursement custody
- worker payout readiness scoring
- onboarding/transfer/termination workflows
- skill/role matrix planning
- attendance anomaly detection feeding incidents
- control dashboards and audit export packs

This is a meaningful direction because HR is already strong in workflows and approvals. The roadmap makes it more analytics-rich and governance-heavy.

## Reporting and Document Direction

The form/list split and PDF/reporting plan points toward:

- dedicated `/new` routes for create forms
- stronger PDF rendering resilience
- a unified report catalog/builder
- broader CSV/PDF coverage
- better post-submit list redirects and row highlighting

This means reporting and output are not static. They are actively being hardened into a stronger platform-wide reporting layer.

## Add-On and Bundle Direction

The add-on strategy docs describe several future commercial opportunities beyond the live catalog, including:

### School add-ons

- learning module
- transport
- meal plans
- PTA/events
- admissions CRM

### Auto add-ons

- marketing automation
- insurance and financing connectors
- inventory syndication
- service bay management
- collections toolkit

### Retail add-ons

- loyalty
- ecommerce connector
- procurement automation
- workforce
- KDS / omnichannel fulfillment

### Cross-pack add-ons

- advanced analytics
- integrations
- identity and access
- document automation extensions
- data protection and continuity
- localization packs

These are important commercial expansion ideas, but they are not all present as live finished modules today.

## Market and GTM Direction

The Zimbabwe SMB gameplan makes the intended commercial direction very clear:

- sell a configurable business platform, not a bespoke ERP clone
- keep accountant-heavy complexity out of front-line workflows by default
- lead with vertical packs and templates
- expand via add-ons, onboarding, migration, and partner channels
- use schools, retail/thrift, and sector packs as growth wedges

That GTM direction fits the live system well, but it is still broader than the product's currently verified feature set in some verticals.

## Areas That Need Ongoing Cleanup

The codebase and docs also show a few places where product direction and current packaging still need cleanup/alignment:

- older docs and snapshots may still refer to placeholder pricing that has since been commercialized in the live catalog
- thrift exists as a route surface but not yet as a fully distinct entitlement family
- older docs still contain stronger offline language than the current codebase supports
- web admin parity with the TUI is still directional

This is normal for an evolving product, but it is important for product, sales, and engineering teams to use the same current-state language.

## Recommended Claim Language

### Good language

- `planned`
- `directional`
- `roadmap`
- `scaffolded`
- `dark-launch`
- `currently expanding`
- `foundation already exists`

### Language to avoid for roadmap items

- `fully live`
- `production-ready everywhere`
- `generally available`
- `already complete`

Use the first set when describing admin parity, OTP, offline flows, standalone thrift identity, and future add-ons.
