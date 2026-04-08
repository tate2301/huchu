# Retail Product Roadmap and POS Host Model

Date: 2026-04-08

Scope:
- retail product roadmap
- detailed retail workspace model
- accounting workspace model for retail operations
- cashier login and host isolation model
- specific recommendation for `pos.company.apps.pagka.dev`
- local development and local deployment parity for POS-only hosts

## 1. Product Goal

Build Huchu Retail into a Zimbabwe-ready retail operating system for:
- boutiques
- supermarkets
- liquor stores
- pharmacies
- hardware stores
- small branch chains

The product should feel like:
- a fast cashier POS at the edge
- a branch and stock control workspace for supervisors
- a commercial and finance-aware back office for owners and managers

It should not feel like:
- one generic back-office app with a POS page attached to it

## 2. Product Strategy

The retail product should be split into two clearly different experiences:

### 2.1 Retail Back Office

Used by:
- owner
- branch manager
- buyer
- merchandiser
- inventory controller
- finance/admin team

Primary jobs:
- manage catalog
- manage prices and promotions
- receive stock
- transfer stock
- count stock
- manage suppliers and purchasing
- review shifts and cash-up
- review performance and shrinkage

### 2.2 POS Edge

Used by:
- cashier
- till supervisor

Primary jobs:
- open shift
- sell
- hold and recall carts
- take payment
- print or send receipt
- review personal shift history
- close shift

This split is important because a cashier should not be navigating the same shell as a retail manager.

## 3. Detailed Workspace Model

The retail workspace should be outcome-shaped, not module-shaped.

Recommended top-level back-office workspace groups:
- `Overview`
- `Sell`
- `Merchandise`
- `Stock`
- `Buy`
- `Customers`
- `Cash Control`
- `Accounting`
- `Insights`
- `Setup`

## 3.1 Overview

Purpose:
- one-screen retail operating summary

Contents:
- today sales
- branch comparison
- open shifts
- low stock alerts
- pending receipts
- pending transfers
- cash variance exceptions
- top selling items

Users:
- owner
- manager
- supervisor

## 3.2 Sell

Purpose:
- manage completed and exceptional retail transactions

Pages:
- Sales
- Returns
- Voids
- Suspended or held baskets
- Register activity

Users:
- supervisor
- manager
- finance reviewer

This is not where cashiers live full-time. Cashiers should live in the POS host.

## 3.3 Merchandise

Purpose:
- define what the store sells and at what price

Pages:
- Catalog
- Categories
- Barcodes and SKU tools
- Pricing
- Promotions
- Assortments by branch

Users:
- merchandiser
- manager
- supervisor

## 3.4 Stock

Purpose:
- control physical inventory

Pages:
- Stock on hand
- Goods receipts
- Transfers
- Counts and stock takes
- Adjustments
- Reorder view
- Expiry and lot control where needed

Users:
- inventory controller
- branch manager
- store supervisor

This group should absorb the retail-facing stock operations that currently feel split between Retail and generic Stores.

## 3.5 Buy

Purpose:
- handle supplier-side replenishment

Pages:
- Suppliers
- Purchase orders
- GRNs or receipts
- Supplier returns
- Cost updates
- Three-way match exceptions

Users:
- buyer
- manager
- finance reviewer

## 3.6 Customers

Purpose:
- support repeat business and retention

Pages:
- Customer profiles
- Loyalty
- Saved contacts
- Spend history
- Notes and communication log
- Account or layby if offered later

Users:
- manager
- cashier supervisor
- marketing or loyalty operator

## 3.7 Cash Control

Purpose:
- keep branch cash tight and auditable

Pages:
- Shifts
- Cash-up
- Variance review
- Deposit prep
- Fiscal receipts
- Till audit log

Users:
- cashier supervisor
- branch manager
- finance reviewer

## 3.8 Insights

Purpose:
- turn transactions into decisions

Pages:
- Sales by branch
- Sales by cashier
- Margin
- Promo performance
- Shrinkage
- Slow movers
- Low stock and reorder
- Refund and void patterns

Users:
- owner
- manager
- supervisor

## 3.9 Setup

Purpose:
- define how the retail operation is configured

Pages:
- Branches and sites
- Registers
- Devices
- Printers and scanners
- Payment tenders
- Receipt branding
- Tax and fiscal settings
- POS policies

Users:
- owner
- manager
- implementation team

## 3.10 Accounting

Purpose:
- give finance and owners a clean accounting workspace for retail operations without forcing cashiers and store staff into accounting-heavy screens

Principle:
- retail and accounting should be separate workspaces
- retail users run operations
- accounting users review, reconcile, control, and close those operations
- retail transactions should feed accounting automatically through posting, not through duplicate manual capture

Recommended accounting workspace groups:
- `Overview`
- `Sales Ledger`
- `Purchases Ledger`
- `Banking`
- `Tax & Fiscalisation`
- `Inventory Value & COGS`
- `Period Close`
- `Exceptions & Reconciliation`
- `Reports`
- `Setup`

### Accounting Overview

Purpose:
- one-screen finance summary for the retail business

Contents:
- today sales posted
- unposted retail exceptions
- cash-up variances pending review
- bank deposit backlog
- GRN and supplier invoice mismatches
- tax exposure
- gross margin summary
- open accounting issues

Users:
- owner
- finance lead
- accountant

### Sales Ledger

Purpose:
- monitor retail-originating revenue and customer-side finance events

Pages:
- Sales summary
- Sales receipts
- Credit notes
- Customer balances where enabled
- Retail sales posting audit

Users:
- accountant
- finance reviewer

### Purchases Ledger

Purpose:
- control supplier-side finance and payables

Pages:
- Supplier bills
- Purchase payments
- Debit notes
- Supplier balances
- GRN to invoice matching

Users:
- accountant
- finance reviewer

### Banking

Purpose:
- control cash and deposit movement from tills to bank

Pages:
- Bank accounts
- Bank transactions
- Deposits from cash-up
- Reconciliation
- Cash clearing accounts

Users:
- accountant
- finance lead

### Tax & Fiscalisation

Purpose:
- manage Zimbabwe tax and fiscal compliance for retail sales

Pages:
- VAT summary
- Tax codes and categories
- Fiscal receipts
- FDMS sync and replay
- Filing prep

Users:
- accountant
- finance lead
- compliance reviewer

### Inventory Value & COGS

Purpose:
- ensure inventory movement and retail sales translate cleanly into financial value

Pages:
- Inventory valuation
- Cost of goods sold summary
- Margin by branch or category
- Stock adjustment financial impact
- Landed cost review later

Users:
- accountant
- finance reviewer
- operations controller

### Period Close

Purpose:
- close the books safely without operational ambiguity

Pages:
- Accounting periods
- Period lock
- Close checklist
- Reversal review
- Close outputs

Users:
- finance lead
- accountant

### Exceptions & Reconciliation

Purpose:
- catch the gaps between retail operations and accounting truth

Pages:
- unposted retail transactions
- shift variances pending decision
- inventory and ledger mismatches
- failed fiscal receipts
- failed posting retries
- manual review queue

Users:
- accountant
- finance lead
- operations controller

### Reports

Purpose:
- provide finance-grade reporting from retail activity

Pages:
- P&L view
- cash flow
- VAT summary
- margin reports
- branch financial comparison
- stock value and shrinkage finance views

Users:
- owner
- finance lead
- accountant

### Setup

Purpose:
- configure the accounting behavior behind retail without exposing it to cashiers

Pages:
- Chart of accounts mapping
- Posting rules
- Tender account mapping
- tax templates
- fiscal settings
- cost method settings

Users:
- finance lead
- implementation team

Recommended interaction between Retail and Accounting workspaces:
- Retail owns operational capture
- Accounting owns financial review and reconciliation
- Cashiers never work in Accounting
- Managers only enter Accounting when finance review is part of their role
- Every retail sale, refund, void, receipt, and stock movement should have a visible accounting trace, but not require duplicate entry

## 4. Role-Based Surface Model

Recommended retail roles:
- `RETAIL_OWNER`
- `RETAIL_MANAGER`
- `RETAIL_SUPERVISOR`
- `RETAIL_BUYER`
- `RETAIL_INVENTORY_CONTROLLER`
- `POS_SUPERVISOR`
- `POS_CASHIER`
- `RETAIL_FINANCE_REVIEWER`

Suggested access model:

### POS_CASHIER
- allowed on POS host only
- allowed pages:
  - POS
  - Held
  - History
  - Shift
- not allowed:
  - retail back office
  - accounting
  - stores
  - management
  - reports outside own POS context

### POS_SUPERVISOR
- allowed on POS host
- optional limited access to back-office `Cash Control` and `Sell`

### RETAIL_MANAGER
- full retail workspace
- optional access to POS host for troubleshooting and shadow mode

## 5. POS Host and URL Model

This should be treated as a product rule, not just a routing detail.

## 5.1 Canonical production host

For tenant slug `company` and root domain `apps.pagka.dev`:

- back office: `company.apps.pagka.dev`
- POS host: `pos.company.apps.pagka.dev`

Public POS URLs:
- `https://pos.company.apps.pagka.dev/`
- `https://pos.company.apps.pagka.dev/login`
- `https://pos.company.apps.pagka.dev/held`
- `https://pos.company.apps.pagka.dev/history`
- `https://pos.company.apps.pagka.dev/shift`

Internal mapping target:
- `/` -> internal `/portal/pos`
- `/login` -> internal `/portal/pos/login`
- `/held` -> internal `/portal/pos/held`
- `/history` -> internal `/portal/pos/history`
- `/shift` -> internal `/portal/pos/shift`

This already matches the current host-routing pattern in the repo:
- portal prefix first
- tenant slug second
- root domain last

In other words, the canonical shape is:

`<portal-prefix>.<tenant-slug>.<root-domain>`

For POS:

`pos.company.apps.pagka.dev`

## 5.2 Canonical local host

For local parity, use:

- back office: `company.local`
- POS host: `pos.company.local`

Public local POS URLs:
- `http://pos.company.local:3000/`
- `http://pos.company.local:3000/login`

Do not use:
- `local.pos`
- `company.pos.local`
- `company.local.pos`

Reason:
- the existing host parser expects `pos.<tenant>.<rootDomain>`
- not `<tenant>.pos.<rootDomain>`
- not `local.pos`

If your local environment has browser or DNS issues with `.local`, then operationally use:
- `company.localhost`
- `pos.company.localhost`

But the product model should still be documented as:
- `company.local`
- `pos.company.local`

## 5.3 Why POS should not be accessible from back office

The POS experience should not be treated as a normal back-office page for cashiers.

Required rule:
- cashier users must not use `company.apps.pagka.dev/portal/pos`
- cashier users must use `pos.company.apps.pagka.dev`

Reason:
- it keeps cashier UX isolated
- it reduces accidental navigation into back-office routes
- it supports kiosk-like register deployment
- it creates a cleaner security boundary
- it makes device setup and support easier

Recommended behavior:
- if a `POS_CASHIER` signs in on the back-office host, redirect them to the POS host
- if a cashier tries to access the back-office host after login, bounce them to the POS host root
- if a cashier manually enters any protected back-office URL, do not show back-office chrome; redirect to POS host

## 5.4 Concrete host-behavior rules

### Rule A: POS host is public-facing only for POS routes

On `pos.company.apps.pagka.dev`:
- `/` serves POS home
- `/login` serves POS login
- `/held`, `/history`, `/shift` serve POS pages
- any attempt to access back-office paths should be blocked or redirected to `/`

### Rule B: Back-office host must not act as cashier host

On `company.apps.pagka.dev`:
- managers and back-office users access retail workspace
- cashier-only users should not remain on this host after auth
- any `/portal/pos` access by cashier role should redirect to `https://pos.company.apps.pagka.dev/`

### Rule C: POS host should rewrite clean public paths to internal portal paths

Mapping:
- `/` -> `/portal/pos`
- `/login` -> `/portal/pos/login`
- `/held` -> `/portal/pos/held`
- `/history` -> `/portal/pos/history`
- `/shift` -> `/portal/pos/shift`

This keeps URLs clean and hides internal route structure.

### Rule D: POS sessions stay in POS shell

If host is `pos.company.apps.pagka.dev`:
- successful login redirects to `/`
- callback target stays within POS public paths
- redirecting to back-office destinations is not allowed for cashier-only roles

### Rule E: Back-office sessions and POS sessions may share identity, but not surface

Managers may be allowed on both hosts.
Cashiers should be constrained to the POS host and POS routes.

## 6. Login Flow Recommendation

## 6.1 Cashier login flow

1. Cashier opens `https://pos.company.apps.pagka.dev/login`
2. Cashier signs in
3. System creates session with:
   - `companyId`
   - `companySlug`
   - `role = POS_CASHIER`
   - enabled feature set
   - allowed hosts including POS host
4. Cashier is redirected to `https://pos.company.apps.pagka.dev/`
5. Cashier only sees POS shell

## 6.2 Cashier entering back office by mistake

If cashier opens:
- `https://company.apps.pagka.dev/login`
- or any back-office URL

Then:
- after role detection, redirect to `https://pos.company.apps.pagka.dev/`
- do not leave cashier inside `/portal/pos` under the back-office host

## 6.3 Manager access

Manager can:
- use `company.apps.pagka.dev` for back office
- optionally use `pos.company.apps.pagka.dev` for POS support or live register work

Manager route policy:
- allowed on both surfaces
- but each host should still show its own shell

## 7. Detailed POS Surface Model

The POS host should remain intentionally narrow.

Recommended POS navigation:
- `Checkout`
- `Held`
- `History`
- `Shift`

Optional later additions:
- `Customers`
- `Price check`
- `End-of-day tasks`

Do not add:
- full inventory management
- purchasing
- merchandising configuration
- management and settings rails

## 8. Retail Roadmap

## Phase 1: Retail Edge Foundation

Goal:
- make POS host first-class and cashier-safe

Deliver:
- clean POS host model
- clean public POS URLs
- cashier-only routing isolation
- branch, register, and device setup
- shift open and close maturity
- receipt print and digital receipt options

Acceptance outcomes:
- cashiers can work only on POS host
- managers can support POS without breaking isolation
- POS URLs are simple enough for branch rollout

## Phase 2: Harare Retail Core

Goal:
- match local market expectations

Deliver:
- offline-safe transaction queue
- customer capture
- loyalty basics
- WhatsApp receipt delivery
- local payment references for card and mobile money
- stock count workflow
- transfer workflow inside Retail

Acceptance outcomes:
- product feels local-market ready
- branch operators can continue working during network instability

## Phase 3: Multi-Branch Control

Goal:
- make Huchu stronger than lightweight POS competitors

Deliver:
- branch assortments
- branch-specific price lists
- supervisor dashboards
- cashier performance reports
- shrinkage and variance reporting
- supplier returns
- purchase-to-receipt exception handling

Acceptance outcomes:
- strong operator story for 2 to 5 branch retail businesses

## Phase 4: Zimbabwe Retail Advantage

Goal:
- differentiate on compliance and operational rigor

Deliver:
- fiscalisation flow embedded in retail operations
- deposit prep and reconciliation
- audit-driven void and refund review
- configurable tender controls
- branch compliance views

Acceptance outcomes:
- Huchu becomes the safer choice for growing retailers

## Phase 5: Advanced Retail Expansion

Goal:
- move upmarket without losing SMB usability

Deliver:
- advanced promotion engine
- customer segmentation
- layby or store-credit options if validated
- lot and expiry support for pharmacy or grocery use cases
- richer omnichannel and digital commerce adjacencies later

## 9. Recommended Navigation by User Type

## 9.1 Back-office retail manager

Sidebar:
- Overview
- Sell
- Merchandise
- Stock
- Buy
- Customers
- Cash Control
- Insights
- Setup

## 9.2 POS cashier

Sidebar:
- Checkout
- Held
- History
- Shift

No back-office fallback should appear.

## 10. Implementation Principles

- Treat POS host as a separate surface, not just a separate route.
- Canonical public host for cashiers must be `pos.<company>.<rootDomain>`.
- Canonical local host for cashiers must be `pos.<company>.local`.
- Back-office host must not be the primary POS destination for cashier users.
- Cashier route permissions must be stricter than manager route permissions.
- Public POS paths should stay clean and short.
- Internal `/portal/pos/*` structure can remain implementation detail.

## 11. Final Recommendation

For this product, the right operating rule is:

`Back office is for retail management. POS host is for selling.`

That means:
- `company.apps.pagka.dev` is back office
- `pos.company.apps.pagka.dev` is cashier and till surface
- `company.local` is back office in local environments
- `pos.company.local` is cashier and till surface in local environments

And specifically:

`POS should not be treated as something cashiers access from the back-office host.`

It should be a dedicated host, dedicated shell, and dedicated operational experience.
