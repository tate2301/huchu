# Live Capabilities

This document focuses on capabilities that are evidenced by the current codebase on March 20, 2026.

It intentionally emphasizes:

- live routes
- live APIs
- live schema support
- live feature catalog entries
- current platform tooling

It does not treat roadmap-only ideas as if they are already generally available.

## Cross-Platform Capabilities

### Multi-tenancy and workspace shaping

- `Company` is the primary tenant boundary across the platform.
- The system supports host-based tenant routing and environment-specific root-domain enforcement.
- Tenant access can be shaped through:
  - workspace profile
  - subscription tier
  - add-on bundles
  - company feature flags
  - user-level feature overrides
- Custom tenant domains are modeled and can be verified/activated.

### Authentication and session model

- Main tenant login is available through `/login`.
- Portal logins exist for:
  - `/portal/parent/login`
  - `/portal/student/login`
  - `/portal/teacher/login`
  - `/portal/pos/login`
- Platform admin login exists at `/admin/login` and uses admin magic-link flow on the admin host.
- Session claims are enriched with:
  - company context
  - role
  - enabled feature set
  - workspace profile
  - auth strategy metadata

### Feature gating and commercialization

- The system has a centralized feature catalog with `124` current feature entries.
- Features are grouped into `20` add-on bundles and `3` subscription tiers.
- Route-level feature mapping exists for both page routes and API prefixes.
- Enforcement happens in middleware and API validation.
- Client templates can auto-apply bundle sets and explicitly disable incompatible features.

### Branding and document output

- Tenants can manage branding data such as:
  - display name
  - logos
  - signature/stamp assets
  - colors
  - legal and registration details
  - bank and footer information
- Custom document templates can be created, versioned, published, and marked default.
- The platform stores document render jobs and artifacts.
- A dedicated PDF worker exists via `pnpm worker:pdf`.

### Notifications and workflow feedback

- The platform includes an in-app notification center.
- Notification features include:
  - list and filter
  - read and archive actions
  - preference management
  - server-sent event stream updates
  - web push subscription APIs
- HR and operational workflows already emit notifications in code.

### Audit, support, and reliability

- Support access is modeled as formal request/approval/session flows.
- Support sessions support `IMPERSONATE` and `SHADOW` modes.
- Runbooks and runbook executions are modeled.
- SLO metric snapshots and health incidents are modeled.
- Contract enforcement events are modeled for warning/suspension/override states.
- Platform audit events are persisted as an event ledger.

### Uploads and artifacts

- Controlled uploads exist through `/api/uploads`.
- A dedicated passport photo upload route exists for employee workflows.
- Rendered document artifacts are separately modeled and retrievable.

## Platform Admin Control Plane

### Browser admin portal

The browser-based admin/control plane currently has `25` pages under `app/portal/admin/*`.

Current live surfaces include:

- dashboard
- companies
- clients
- subscriptions
- add-ons
- features
- feature catalog
- commercial center
- identity
- settings
- templates
- reliability
- health
- support access
- advanced
- audit log
- company-scoped dashboard/commercial/identity/features/support access/reliability/advanced/operations pages

### Platform admin APIs

The `platform-admin` API family currently includes support for:

- company listing
- workspace/company overview
- platform search
- support access
- support state
- identity
- health
- reliability
- metrics
- commercial data
- login-link issuance
- manifest / execution surfaces

### Ink TUI

The platform TUI is not a toy script. It is a real operations surface with modules for:

- organizations
- subscriptions
- features
- admins
- user management
- sites
- support
- contracts
- health
- runbooks
- audit

That TUI gives the platform a strong operator story even where the browser admin portal is still catching up to parity.

## Dashboards and Reporting

### Home routing and workspace home

- `/` is not a static dashboard. It redirects authenticated users to a workspace-appropriate home route.
- Workspace home is computed from role, enabled features, and workspace profile.

### Dashboard surfaces

- `/dashboard` provides a production dashboard driven by plant report data.
- `/api/dashboard/executive-overview` provides executive summary data.

### Reporting footprint

There is a dedicated reports area with live routes for:

- reports dashboard
- shift reports
- attendance
- plant reports
- stock movement reports
- fuel ledger reports
- maintenance work order reports
- maintenance equipment reports
- gold chain reports
- gold receipt reports
- audit trails
- downtime analytics
- compliance incident reports
- CCTV event reports

The route inventory makes reporting one of the most widely shared cross-domain layers in the product.

## Operations Capture

The original operations capture stack is still a major part of the product.

### Live pages

- `/shift-report`
- `/attendance`
- `/plant-report`

### Live APIs

- `/api/shift-reports`
- `/api/attendance`
- `/api/plant-reports`

### What this stack does

- captures daily shift data
- captures attendance entries
- captures plant/production report data
- feeds dashboards and reports
- provides base operational data for downstream analysis

## Stores and Inventory

### Live pages

- `/stores/dashboard`
- `/stores/inventory`
- `/stores/movements`
- `/stores/issue`
- `/stores/receive`
- `/stores/fuel`

### Live APIs

- `/api/inventory/items`
- `/api/inventory/movements`
- `/api/stock-locations`

### Current capabilities

- stock on hand visibility
- movement history
- stock issue workflow
- stock receive workflow
- stock location management
- fuel ledger/reporting surface
- shared navigation for multi-site stock operations

### Supporting tooling

- `pnpm manage-inventory` provides CLI/admin inventory operations

## Gold Operations

Gold is one of the deepest and most mature vertical surfaces in the repo.

### Live pages

- `/gold`
- `/gold/intake/pours`
- `/gold/intake/pours/new`
- `/gold/intake/purchases`
- `/gold/intake/purchases/new`
- `/gold/transit/dispatches`
- `/gold/transit/dispatches/new`
- `/gold/dispatch`
- `/gold/dispatch/new`
- `/gold/settlement/receipts`
- `/gold/settlement/receipts/new`
- `/gold/receipt`
- `/gold/receipt/new`
- `/gold/pour`
- `/gold/pour/new`
- `/gold/settlement/payouts`
- `/gold/payouts`
- `/gold/reconciliation`
- `/gold/exceptions`
- `/gold/audit`
- `/gold/prices`

### Live APIs

- `/api/gold/pours`
- `/api/gold/purchases`
- `/api/gold/dispatches`
- `/api/gold/receipts`
- `/api/gold/corrections`
- `/api/gold/shift-allocations`
- `/api/gold/expense-types`
- `/api/gold/prices`

### Current capabilities

- capture of pours and purchases
- dispatch and transit tracking
- receipt and settlement capture
- payout-related shift allocation workflows
- gold expense type setup
- price management
- reconciliation surface
- exception tracking
- audit trail/reporting surface

### Supporting UI components

The app contains dedicated gold forms/components for:

- purchases
- pours
- dispatches
- receipts
- searchable selects
- shift allocation modal flows

## Scrap and Recycling

Scrap and recycling is implemented as a dedicated vertical, not just a generic inventory extension.

### Live pages

- `/scrap-metal`
- `/scrap-metal/buying/purchases`
- `/scrap-metal/buying/pricing`
- `/scrap-metal/yard/batches`
- `/scrap-metal/batches`
- `/scrap-metal/sales`
- `/scrap-metal/trading/sales`
- `/scrap-metal/pricing`
- `/scrap-metal/setup/materials`
- `/scrap-metal/settlements`
- `/scrap-metal/reports`

### Live APIs

- `/api/scrap-metal/materials`
- `/api/scrap-metal/pricing`
- `/api/scrap-metal/sellers`
- `/api/scrap-metal/purchases`
- `/api/scrap-metal/employee-balances`
- `/api/scrap-metal/batches`
- `/api/scrap-metal/batches/:id/items`
- `/api/scrap-metal/sales`
- `/api/scrap-metal/dashboard`

### Current capabilities

- scrap material master data
- pricing / price board management
- seller profile management
- purchase capture
- employee balance tracking
- yard batch management
- sales lifecycle with approval/complete/cancel flows
- settlement surface
- reports surface

## Human Resources and Payroll

HR is a substantial part of the current platform footprint.

### Live pages

- `/human-resources`
- `/human-resources/shift-groups`
- `/human-resources/incidents`
- `/human-resources/payouts`
- `/human-resources/compensation`
- `/human-resources/salaries`
- `/human-resources/salaries/outstanding`
- `/human-resources/payroll`
- `/human-resources/payroll/salary`
- `/human-resources/payroll/gold`
- `/human-resources/disbursements`
- `/human-resources/approvals`

### Live APIs

- `/api/employees`
- `/api/departments`
- `/api/job-grades`
- `/api/hr/shift-groups`
- `/api/hr/shift-group-schedules`
- `/api/hr/incidents`
- `/api/hr/disciplinary-actions`
- `/api/compensation/templates`
- `/api/compensation/rules`
- `/api/compensation/profiles`
- `/api/payroll/periods`
- `/api/payroll/runs`
- `/api/disbursements/batches`
- `/api/employee-payments`
- `/api/approvals/history`
- `/api/hr/payout-batches`

### Current capabilities

- employee directory and records
- department and job-grade master data
- shift groups and scheduling
- HR incident capture
- disciplinary action workflows
- compensation templates, rules, and profiles
- salary operations
- payroll periods and payroll runs
- disbursement batches
- approval history
- irregular or variable settlement/payout flows

### Workflow posture

The HR stack is strongly workflow-driven. The codebase already models submit, approve, reject, apply, and payment-related transitions rather than just freeform CRUD.

## Maintenance and Asset Control

### Live pages

- `/maintenance`
- `/maintenance/equipment`
- `/maintenance/work-orders`
- `/maintenance/breakdown`
- `/maintenance/schedule`

### Live APIs

- `/api/equipment`
- `/api/work-orders`
- `/api/downtime-codes`
- `/api/analytics/downtime`

### Current capabilities

- equipment register
- work order capture and updates
- breakdown logging
- planned/preventive schedule surface
- downtime code management
- downtime analytics/reporting

## Compliance

### Live pages

- `/compliance`
- `/compliance/permits`
- `/compliance/inspections`
- `/compliance/incidents`
- `/compliance/training`

### Live APIs

- `/api/compliance/permits`
- `/api/compliance/inspections`
- `/api/compliance/incidents`
- `/api/compliance/training-records`

### Current capabilities

- compliance overview
- permit lifecycle capture
- inspection capture
- compliance incident capture
- training record management
- compliance incident reporting

## CCTV and Surveillance

The CCTV stack is a real module with both operational and technical depth.

### Live pages

- `/cctv`
- `/cctv/overview`
- `/cctv/live`
- `/cctv/cameras`
- `/cctv/cameras/new`
- `/cctv/cameras/[id]/edit`
- `/cctv/nvrs`
- `/cctv/nvrs/new`
- `/cctv/nvrs/[id]/edit`
- `/cctv/events`
- `/cctv/playback`
- `/cctv/access-logs`
- `/cctv/dashboard`

### Live APIs

- `/api/cctv/cameras`
- `/api/cctv/nvrs`
- `/api/cctv/events`
- `/api/cctv/access-logs`
- `/api/cctv/playback/search`
- `/api/cctv/streams/profile`
- `/api/cctv/streams/gateway-offer`
- `/api/cctv/streams/hls-url`
- `/api/cctv/streams/session/start`
- `/api/cctv/streams/session/stop`
- `/api/cctv/streams/sessions`
- `/api/cctv/stream-token`

### Current capabilities

- camera inventory
- NVR inventory
- live monitoring surface
- event monitoring and acknowledgment
- playback search
- access logging
- stream session control
- stream token generation
- site-filtered and status-aware CCTV dashboards

### Schema support

The schema includes first-class models for:

- `NVR`
- `Camera`
- `CCTVEvent`
- `StreamSession`
- `PlaybackRecord`
- `CameraAccessLog`

This is not just a UI mockup. The data layer is already structured for surveillance operations.

## Accounting and Fiscalisation

Accounting is one of the broadest domains in the current system.

### Live pages

- `/accounting`
- `/accounting/chart-of-accounts`
- `/accounting/journals`
- `/accounting/periods`
- `/accounting/posting-rules`
- `/accounting/receivables`
- `/accounting/payables`
- `/accounting/sales`
- `/accounting/purchases`
- `/accounting/banking`
- `/accounting/assets`
- `/accounting/budgets`
- `/accounting/cost-centers`
- `/accounting/currency`
- `/accounting/tax`
- `/accounting/fiscalisation`
- `/accounting/trial-balance`
- `/accounting/financial-reports`
- `/accounting/financial-statements`

### Live APIs

- setup and summary:
  - `/api/accounting/setup`
  - `/api/accounting/summary`
- ledger and posting:
  - `/api/accounting/coa`
  - `/api/accounting/journals`
  - `/api/accounting/periods`
  - `/api/accounting/posting-rules`
- AR and sales:
  - `/api/accounting/sales/customers`
  - `/api/accounting/sales/quotations`
  - `/api/accounting/sales/invoices`
  - `/api/accounting/sales/receipts`
  - `/api/accounting/sales/credit-notes`
  - `/api/accounting/sales/write-offs`
- AP and purchases:
  - `/api/accounting/purchases/vendors`
  - `/api/accounting/purchases/bills`
  - `/api/accounting/purchases/payments`
  - `/api/accounting/purchases/debit-notes`
  - `/api/accounting/purchases/write-offs`
- banking:
  - `/api/accounting/banking/accounts`
  - `/api/accounting/banking/transactions`
  - `/api/accounting/banking/reconciliations`
  - `/api/accounting/banking/reconcile`
- tax and close:
  - `/api/accounting/tax`
  - `/api/accounting/tax/categories`
  - `/api/accounting/tax/templates`
  - `/api/accounting/tax/rules`
  - `/api/accounting/vat-returns`
  - `/api/accounting/closing/*`
- treasury and controls:
  - `/api/accounting/payment-ledger`
  - `/api/accounting/closing/opening-balances`
  - `/api/accounting/closing/period-close`
  - `/api/accounting/closing/freeze`
- reports and hubs:
  - `/api/accounting/reports/general-ledger`
  - `/api/accounting/reports/trial-balance`
  - `/api/accounting/reports/financials`
  - `/api/accounting/reports/cash-flow`
  - `/api/accounting/reports/ar-aging`
  - `/api/accounting/reports/ap-aging`
  - `/api/accounting/reports/customer-statement`
  - `/api/accounting/reports/vendor-statement`
  - `/api/accounting/reports/vat-summary`
  - `/api/accounting/hubs/receivables-summary`
  - `/api/accounting/hubs/payables-summary`
  - `/api/accounting/hubs/financial-reports-summary`
- fiscalisation:
  - `/api/accounting/fiscalisation/config`
  - `/api/accounting/fiscalisation/issue`
  - `/api/accounting/fiscalisation/receipts`
  - `/api/accounting/fiscalisation/replay`

### Current capabilities

- chart of accounts
- journals and posting
- accounting periods and close/freeze flows
- posting rules and accounting integration events
- receivables and payables operations
- banking and reconciliation surfaces
- tax and VAT return surfaces
- fixed assets
- budgets
- cost centers
- multi-currency setup
- payment ledger
- financial and sub-ledger reporting
- ZIMRA fiscalisation foundations and receipt tracking

### Finance architecture signals

The schema and planning docs show a strong event-driven finance posture:

- accounting integration events are first-class data
- fiscal provider config and fiscal receipts are modeled
- financial postings are expected to be traceable back to source operations

## Schools

Schools is now a major vertical pack in the live codebase.

### Live pages

- `/schools`
- `/schools/admissions`
- `/schools/students`
- `/schools/students/[id]`
- `/schools/guardians`
- `/schools/guardians/[id]`
- `/schools/teachers`
- `/schools/teachers/[id]`
- `/schools/classes`
- `/schools/classes/[id]`
- `/schools/subjects`
- `/schools/academics`
- `/schools/timetable`
- `/schools/attendance`
- `/schools/assessments`
- `/schools/results`
- `/schools/results/moderation`
- `/schools/results/publish`
- `/schools/results/publish/windows`
- `/schools/results/sheets`
- `/schools/finance`
- `/schools/finance/invoices`
- `/schools/finance/receipts`
- `/schools/finance/waivers`
- `/schools/finance/refunds`
- `/schools/boarding`
- `/schools/boarding/[id]`
- `/schools/notices`
- `/schools/reports`
- `/schools/documents`
- `/schools/portal/parent`
- `/schools/portal/student`
- `/schools/portal/teacher`

### Live APIs

The live schools API footprint is broad and exists in both direct and `v2` namespaces.

Current live families include:

- students and guardians
- admissions and enrollments
- classes and subjects
- teacher profiles, candidates, assignments, and subject mappings
- attendance sessions and attendance lines
- notices
- fee structures
- invoices
- receipts
- waivers
- refunds
- boarding hostels
- boarding allocations
- leave requests with approve/check-out/check-in lifecycle
- result sheets
- moderation actions
- HOD review flows
- publish windows
- school reports
- school portal feeds for parent, student, and teacher users

### Schema-backed school entities

The schema already models:

- academic years and terms
- classes and streams
- students
- guardians and student-guardian links
- enrollments
- hostels, rooms, beds, allocations, leave requests, and movement logs
- teacher profiles
- subjects and class-subject mappings
- result sheets, result lines, moderation actions, and publish windows
- fee structures and structure lines
- fee invoices and invoice lines
- fee receipts and receipt allocations
- fee waivers
- attendance sessions and attendance lines

### Current school capability picture

Verified live capabilities include:

- student and guardian management
- teacher management
- class/subject structure support
- attendance session handling
- results moderation and publish windows
- boarding workflows with leave movement lifecycle
- fee operations with invoices, receipts, waivers, and refunds
- parent/student/teacher portal surfaces
- school-specific reports and notices

## Auto Sales

Auto sales is implemented as a real vertical pack with both app routes and `v2` APIs.

### Live pages

- `/car-sales`
- `/car-sales/leads`
- `/car-sales/inventory`
- `/car-sales/deals`
- `/car-sales/financing`

### Live APIs

- `/api/v2/autos`
- `/api/v2/autos/leads`
- `/api/v2/autos/inventory`
- `/api/v2/autos/deals`
- `/api/v2/autos/deals/:id/reserve`
- `/api/v2/autos/deals/:id/contract`
- `/api/v2/autos/financing`

There are also legacy/parallel `car-sales` and non-`v2` aliases in the route registry.

### Schema-backed auto entities

The schema currently models:

- `CarSalesLead`
- `CarSalesVehicle`
- `CarSalesDeal`
- `CarSalesPayment`

### Current capabilities

- lead capture and management
- vehicle inventory
- deal creation and progression
- reserve and contract transitions
- financing surface
- payment modeling at the schema layer

## Retail, POS, and Thrift-Facing Surfaces

Retail is a meaningful live module and also currently absorbs part of the thrift direction.

### Live retail pages

- `/retail`
- `/retail/sales`
- `/retail/catalog`
- `/retail/purchasing`
- `/retail/purchasing/orders`
- `/retail/purchasing/receipts`
- `/retail/merchandising`
- `/retail/merchandising/pricing`
- `/retail/merchandising/promotions`
- `/retail/shifts`
- `/retail/reports`
- `/retail/pos`

### Live POS portal pages

- `/portal/pos`
- `/portal/pos/login`
- `/portal/pos/overview`
- `/portal/pos/shift`
- `/portal/pos/history`
- `/portal/pos/held`

### Live retail APIs

- `/api/v2/retail`
- `/api/v2/retail/catalog`
- `/api/v2/retail/promotions`
- `/api/v2/retail/shifts`
- `/api/v2/retail/shifts/:id/close`
- `/api/v2/retail/pos/current-shift`
- `/api/v2/retail/pos/catalog`
- `/api/v2/retail/pos/sales`
- `/api/v2/retail/pos/sales/:id`
- `/api/v2/retail/pos/sales/:id/refund`
- `/api/v2/retail/pos/sales/:id/void`
- `/api/v2/retail/pos/held-carts`
- `/api/v2/retail/pos/held-carts/:id/recall`
- `/api/v2/retail/purchasing/orders`
- `/api/v2/retail/purchasing/receipts`

### Current capabilities

- retail overview
- POS surface
- catalog management
- purchase order and receipt handling
- pricing and promotions
- shift/cash-up surface
- retail reports
- held cart and recall flows
- refund and void API flows

### Thrift note

Thrift-facing routes exist today:

- `/thrift`
- `/thrift/intake`
- `/thrift/catalog`
- `/thrift/sales`
- `/api/v2/thrift`

However, in the current feature catalog and route registry, thrift is still mapped through the retail/POS entitlement model rather than a fully separate live thrift feature namespace. It is best understood as an active direction and route surface sitting on top of the retail foundation.

## Portals

### Parent, student, and teacher portals

The platform exposes both school-scoped and generic portal paths for school portal users.

Live pages include:

- `/portal/parent`
- `/portal/student`
- `/portal/teacher`
- `/schools/portal/parent`
- `/schools/portal/student`
- `/schools/portal/teacher`

Live portal APIs include:

- `/api/v2/portal/parent`
- `/api/v2/portal/parent/children`
- `/api/v2/portal/student`
- `/api/v2/portal/student/me/*`
- `/api/v2/portal/teacher`
- `/api/v2/portal/teacher/me/*`
- `/api/v2/schools/portal/parent/*`
- `/api/v2/schools/portal/student/*`
- `/api/v2/schools/portal/teacher/*`

### Current portal capabilities

- parent child list and fee visibility
- parent child results visibility
- student timetable visibility
- student results visibility
- teacher class visibility
- teacher attendance visibility
- teacher marks visibility
- dedicated login surfaces for each portal type

### Admin portal

The platform admin portal is a separate operational portal with its own login and host rules.

### POS portal

The POS portal functions as a focused cashier/workstation surface rather than a generic back-office page.

## Management, Master Data, and User Administration

### Live pages

- `/management/master-data`
- `/management/master-data/hr/departments`
- `/management/master-data/hr/job-grades`
- `/management/master-data/operations/sites`
- `/management/master-data/operations/sections`
- `/management/master-data/operations/downtime-codes`
- `/management/master-data/operations/gold-expense-types`
- `/management/master-data/operations/scrap-materials`
- `/management/master-data/operations/scrap-sellers`
- `/management/users`
- `/management/users/create`
- `/management/users/status`
- `/management/users/password-reset`
- `/management/users/role-change`
- legacy/supporting user management aliases under `/user-management/*`

### Live APIs

- `/api/users`
- `/api/users/create`
- `/api/users/status`
- `/api/users/password-reset`
- `/api/users/role-change`
- `/api/users/access`
- `/api/sites`
- `/api/sections`
- `/api/departments`
- `/api/job-grades`
- `/api/downtime-codes`

### Current capabilities

- user directory
- user create/status/password reset/role-change workflows
- feature access reset/override APIs
- site and section management
- department and job-grade management
- shared operational master data setup

## Document Templates and Reporting Output

### Live pages

- `/settings/templates`
- `/portal/admin/templates`

### Live APIs

- `/api/document-templates`
- `/api/document-templates/:id/versions`
- `/api/document-templates/:id/publish`
- `/api/document-templates/:id/set-default`
- `/api/documents/render`
- `/api/documents/render-jobs`
- `/api/documents/render-jobs/process`
- `/api/documents/artifacts/:id`

### Current capabilities

- system and company-scoped templates
- template versioning
- publish/default behaviors
- render-job orchestration
- generated artifact retrieval
- branded report/invoice/receipt-ready document configuration

## Important Capability Guardrails

The following are present only as partial, directional, or dark-launch signals and should not be overstated as broadly live platform capabilities:

- offline-first platform behavior
- general user email-link authentication
- general user OTP authentication
- separate fully commercialized thrift entitlement namespace
- full browser admin parity with the TUI

Those topics are documented elsewhere, but they are not the right way to describe the current product state without qualification.
