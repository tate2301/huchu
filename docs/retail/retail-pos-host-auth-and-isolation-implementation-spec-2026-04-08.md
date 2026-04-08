# Retail POS Host, Auth, and Isolation Implementation Spec

Date: 2026-04-08

Audience:
- engineering
- product
- implementation

Scope:
- exact POS host model
- exact public and internal route model
- cashier login and redirect behavior
- back-office to POS isolation rules
- local environment parity

This document is implementation-oriented. It is based on the current routing and host model already present in the codebase.

## 1. Canonical Host Model

The canonical retail host model is:

- back office: `company.apps.pagka.dev`
- POS host: `pos.company.apps.pagka.dev`

The canonical pattern is:

`<portal-prefix>.<tenant-slug>.<root-domain>`

For POS:

`pos.<company>.<rootDomain>`

This aligns with the existing portal host parsing and generation model in:
- `lib/platform/portal-hosts.ts`
- `lib/platform/tenant.ts`
- `middleware.ts`

## 2. Canonical Local Model

For local parity, the canonical local model should be:

- back office: `company.local`
- POS host: `pos.company.local`

Allowed local equivalents if `.local` is impractical in a developer environment:
- `company.localhost`
- `pos.company.localhost`

Not recommended:
- `local.pos`
- `company.pos.local`
- `company.local.pos`

Reason:
- the current host parser expects `pos.<tenant>.<rootDomain>`
- not `<tenant>.pos.<rootDomain>`

## 3. Public POS URL Model

On the POS host, public URLs must be short and operator-friendly:

- `/`
- `/login`
- `/held`
- `/history`
- `/shift`

Optional later:
- `/customers`
- `/price-check`

Cashiers should never need to see:
- `/portal/pos`
- `/portal/pos/login`
- any internal route prefix

## 4. Internal Route Mapping

The POS host should rewrite public URLs to internal app routes as follows:

- `/` -> `/portal/pos`
- `/login` -> `/portal/pos/login`
- `/held` -> `/portal/pos/held`
- `/history` -> `/portal/pos/history`
- `/shift` -> `/portal/pos/shift`

This mapping already matches the current portal host rewrite approach in `middleware.ts`.

## 5. Surface Separation Rule

This is the main product and security rule:

`Cashiers must use the POS host, not the back-office host.`

That means:
- a cashier should log in at `pos.company.apps.pagka.dev/login`
- a cashier should work on `pos.company.apps.pagka.dev`
- a cashier should not remain on `company.apps.pagka.dev/portal/pos`

The back office may still contain internal POS routes for manager and engineering reuse, but cashier-facing behavior must be host-first and isolated.

## 6. Role and Host Policy

Recommended user surface policy:

### POS_CASHIER
- allowed host:
  - `pos.company.apps.pagka.dev`
- optional local:
  - `pos.company.local`
- allowed public paths:
  - `/`
  - `/login`
  - `/held`
  - `/history`
  - `/shift`
- blocked from:
  - back-office host
  - retail workspace
  - accounting
  - stores
  - management
  - reports outside POS shell

### POS_SUPERVISOR
- allowed host:
  - POS host
- optionally allowed a narrow back-office scope:
  - `Sell`
  - `Cash Control`

### RETAIL_MANAGER
- allowed hosts:
  - back-office host
  - POS host
- allowed to use POS host for support and shadow workflows

## 7. Login and Redirect Rules

## 7.1 Cashier entering the correct host

If request host is `pos.company.apps.pagka.dev`:
- `/login` renders POS login page
- successful login redirects to `/`
- callback destinations must remain inside POS public paths

## 7.2 Cashier entering the wrong host

If a `POS_CASHIER` logs in on:
- `company.apps.pagka.dev/login`

Then after role resolution:
- redirect to `https://pos.company.apps.pagka.dev/`

If a `POS_CASHIER` requests:
- `company.apps.pagka.dev/retail`
- `company.apps.pagka.dev/portal/pos`
- any blocked back-office route

Then:
- redirect to `https://pos.company.apps.pagka.dev/`

Do not:
- show back-office shell
- let the cashier stay under a back-office URL

## 7.3 Manager on POS host

If a manager opens the POS host:
- allow access
- keep them inside POS shell
- do not silently drop them into back-office shell on that host

Reason:
- host determines surface
- role determines permissions within that surface

## 8. Required Middleware Behavior

The middleware should enforce five behaviors.

### Behavior A: portal host detection

If host matches `pos.<tenant>.<rootDomain>`:
- treat it as POS portal host
- rewrite public paths to internal POS portal paths

### Behavior B: portal host clean paths

On POS host:
- `/` rewrites to internal POS home
- `/login` rewrites to internal POS login
- POS host should never expose raw `/portal/pos/*` URLs publicly

### Behavior C: cashier back-office ejection

If session role is `POS_CASHIER` and request host is the back-office host:
- redirect to POS host root

If request path is a blocked back-office route:
- redirect to POS host root

### Behavior D: POS host route restriction

If host is POS host and path is a back-office path:
- block or redirect to POS host root

Recommended default:
- redirect to `/`

### Behavior E: callback safety

If a cashier authenticates from POS host:
- callback targets must remain within POS public paths
- reject or normalize callback targets that point to back-office routes

## 9. Exact Product Rules for Engineering

These rules should be treated as acceptance criteria.

### Rule 1

Cashier users must have a canonical sign-in URL:

`https://pos.company.apps.pagka.dev/login`

### Rule 2

Cashier users must not be expected to use:

`https://company.apps.pagka.dev/portal/pos`

### Rule 3

Back-office and POS shells must stay visually separate even when one user role can access both.

### Rule 4

Host determines shell.

That means:
- back-office host renders back-office shell
- POS host renders POS shell

### Rule 5

Role determines allowed content inside that shell.

That means:
- cashier on POS host gets cashier-safe navigation
- manager on POS host may get extended POS navigation
- cashier on back-office host is redirected away

## 10. Detailed POS Navigation Contract

Recommended cashier navigation on POS host:
- Checkout
- Held
- History
- Shift

Recommended supervisor navigation on POS host:
- Overview
- Checkout
- Held
- History
- Shift

Do not include:
- catalog maintenance
- pricing setup
- purchasing
- general management
- platform settings

## 11. Session and Allowed Host Rules

Session claims should support:
- `companyId`
- `companySlug`
- `role`
- `enabledFeatures`
- `allowedHosts`

Recommended rule:
- `POS_CASHIER` sessions should include the POS host in `allowedHosts`
- if strict host enforcement is enabled, back-office host should not be the practical working host for cashier-only users

Even if a cashier technically has a valid session on the back-office domain, product behavior should still push them to POS host.

## 12. Local Deployment Rules

For local branch-style deployments or local network demos:

### Preferred hostnames
- `company.local`
- `pos.company.local`

### Developer fallback hostnames
- `company.localhost`
- `pos.company.localhost`

### Required behavior

On `pos.company.local`:
- show only POS shell
- redirect `/login` to POS login
- clean public paths only

On `company.local`:
- cashier login should redirect to POS host
- cashier should not stay in back office

## 13. Suggested Rollout Sequence

### Step 1

Make POS host the documented and canonical cashier entrypoint.

### Step 2

Normalize public POS URLs to short paths.

### Step 3

Enforce cashier redirection off the back-office host.

### Step 4

Tighten callback safety so cashiers cannot bounce into back-office URLs after login.

### Step 5

Refine role-specific POS navigation and shell behavior.

## 14. QA Acceptance Checklist

- cashier can sign in on `pos.company.apps.pagka.dev/login`
- cashier lands on `pos.company.apps.pagka.dev/`
- cashier sees POS shell only
- cashier can access `/held`, `/history`, `/shift`
- cashier cannot remain on `company.apps.pagka.dev`
- cashier requesting `/retail` is redirected to POS host
- manager can access back office on `company.apps.pagka.dev`
- manager can access POS on `pos.company.apps.pagka.dev`
- POS host public URLs stay clean and do not expose `/portal/pos/*`
- local parity works for `pos.company.local`

## 15. Final Engineering Decision

The engineering rule should be:

`POS is a dedicated host-based surface, not just a route inside back office.`

That means the canonical user story is:

- back office: `company.apps.pagka.dev`
- POS: `pos.company.apps.pagka.dev`
- local back office: `company.local`
- local POS: `pos.company.local`

And for the cashier specifically:

`The back-office host is not an acceptable working destination.`
