# Platform Overview

## What Huchu Is

Huchu is a multi-tenant, feature-gated business operations platform with shared platform rails and multiple industry-specific workspaces on top of the same runtime.

At its core, the system combines:

- shared identity, tenancy, entitlement, branding, reporting, audit, and finance rails
- industry workspaces for gold operations, scrap and recycling, schools, auto sales, retail/POS, and general business operations
- external role-based portals for parents, students, teachers, cashiers/POS users, and platform admins
- a browser-based admin control plane plus an Ink-based platform TUI for platform operators

The product philosophy visible across the codebase and planning docs is:

- one runtime, not one codebase per customer
- one tenant boundary centered on `Company`
- feature bundles and templates instead of hard-forked products
- auditable workflows instead of silent mutation
- operational UX first, with finance integrity underneath

## Current Product Shape

The current implementation supports these workspace profiles:

- `GOLD_MINE`
- `SCRAP_METAL`
- `SCHOOLS`
- `AUTOS`
- `RETAIL`
- `GENERAL`

These resolve into vertical product bundles such as:

- Gold Operations
- Scrap & Recycling
- School Operations
- Auto Sales
- Retail
- Service Workshop
- Multi-Site Operations
- General Business

In practice, this means the same platform can present very different primary navigation, home routes, quick actions, and commercial bundles depending on a tenant's enabled features and workspace profile.

## Product Anatomy

### 1. Shared platform core

The shared platform core handles:

- authentication and session enrichment
- host-based tenant resolution
- company and site scoping
- feature catalog, bundles, tiers, and overrides
- branding and custom domains
- notifications and push subscriptions
- document templates and PDF rendering jobs
- audit, support access, runbooks, reliability, and commercial enforcement

### 2. Tenant-facing workspaces

Tenant workspaces are the operational applications end users spend their time in. Today that includes:

- operations capture
- HR and payroll
- stores and inventory
- maintenance
- compliance
- CCTV
- accounting
- gold operations
- scrap and recycling
- schools
- auto sales
- retail/POS

### 3. External portals

The system also exposes dedicated portals and portal logins for:

- parent users
- student users
- teacher users
- POS/cashier users
- platform admins

These are not just different pages inside the main app. They are treated as separate surfaces with dedicated routes, login entry points, and feature gating.

### 4. Platform operations layer

Huchu has two admin/operator surfaces:

- a browser admin portal under `app/portal/admin/*`
- an Ink TUI under `scripts/platform/*`

Together they cover commercial, provisioning, feature, support, reliability, and audit operations.

## Core Architecture

### Runtime stack

The runtime stack is:

- Next.js 16 App Router
- React 19
- TypeScript
- Prisma ORM
- PostgreSQL
- NextAuth-based authentication
- React Query for client/server data fetch orchestration
- Tailwind CSS plus shared design tokens/components

### Request flow

The dominant request flow is:

1. User requests a page route.
2. `middleware.ts` checks auth, tenant host, tenant health, and feature access.
3. The page renders and calls app APIs.
4. API handlers validate session via shared utilities.
5. Domain logic executes through Prisma-backed services.
6. Reads and writes persist against PostgreSQL.

### Tenant boundary

`Company` is the primary tenant boundary across the system.

Important implications:

- most operational data is directly keyed by `companyId`
- sites and sections are shared reference entities under the company
- feature enablement can happen at the company level and, in some cases, the user level
- the current architecture deliberately avoids per-pack runtime forks

### Feature enforcement

Feature access is enforced through:

- a central feature catalog
- add-on bundle resolution
- tier inclusion logic
- middleware path checks
- API path checks via route registry mapping
- per-user feature overrides where applicable

That gives the platform a strong commercialization and entitlements backbone, not just simple role-based hiding.

## Control Planes

### Auth and identity

The current live auth surfaces are:

- credentials login for the main tenant app
- credentials login for parent, student, teacher, and POS portals
- admin magic-link login for the admin portal host

There is also auth scaffolding for:

- non-admin email-link sign-in
- OTP sign-in

Those two are explicitly dark-launch / future strategies and should not be treated as broadly live capabilities.

### Commercial and entitlement control

Commercial control is built into the platform, not bolted on afterward.

The system currently models:

- subscription tiers
- bundle entitlements
- per-company feature flags
- per-user feature flags
- company templates
- commercial pricing snapshots
- support and contract enforcement

### Support and reliability control

The platform core also includes:

- support access requests
- impersonate/shadow support sessions
- SLO metric snapshots
- health incidents
- runbook definitions and executions
- contract enforcement events
- append-only platform audit events

### Document and brand control

The platform has a meaningful document layer:

- tenant branding fields
- logo/signature/stamp configuration
- document templates with versions
- publish/default behaviors
- render jobs and artifacts
- dedicated PDF worker script

This matters because the product is not only about data entry. It is also built to produce branded operational and financial output.

## UX and Design Operating Principles

The repository's UX playbook and design docs make the product stance very clear:

- one table per active view
- controls kept in a single row
- progressive disclosure for complex workflows
- numeric and time-heavy cells use `font-mono`
- operational density is preferred over decorative UI
- the interface should feel confident, disciplined, and audit-friendly

This matters for positioning because Huchu is not trying to be a lifestyle SaaS app. It is presenting itself as an operational system of record.

## Commercial Architecture

The platform currently exposes:

- `3` tiers: `BASIC`, `STANDARD`, `ENTERPRISE`
- `20` add-on bundles
- `9` client templates
- `124` feature catalog entries across `16` domains

This is one of the strongest signals in the codebase: Huchu is designed to be sold as a configurable platform, not as one fixed monolith.

## Current Strategic Identity

From the live code plus the market docs, Huchu is best understood as:

- a configurable multi-tenant ERP and operations platform
- aimed first at Zimbabwe-ready and SMB/mid-market operational businesses
- strongest today in sectors where workflow traceability, finance control, and operational visibility matter
- able to package itself differently for mining, schools, dealerships, retail, recycling, and general multi-site operators

## Important Distinctions

### Safe to say today

- Huchu is multi-tenant.
- Huchu is feature-gated and bundle-driven.
- Huchu already contains real live surfaces for gold, scrap, schools, autos, retail/POS, accounting, HR, compliance, CCTV, and platform admin.
- Huchu includes browser and operator tooling for tenant and platform administration.
- Huchu includes branding, document templating, and finance-oriented controls.

### Not safe to say without qualification

- that the whole platform is broadly offline-first
- that OTP/passwordless auth is generally available
- that every planned add-on is already implemented
- that the browser admin portal has full parity with every TUI operation
- that thrift already exists as a fully separate entitlement and data model stack

Those topics are real parts of the documented direction, but they belong in roadmap language unless explicitly verified in current code.
