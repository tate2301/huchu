# Production Admin Control Plane Portal

## Summary
Rebuild the admin portal into a production-grade control plane that keeps `/portal/admin` as the public surface but replaces the current page-centric UX with a hybrid operating model: Stripe-style dashboard, Clerk-style workspace switching, global command bar, route-backed collection/detail screens, and modal or sheet wizards for all mutations. The portal must reach full parity with the current TUI action surface, reuse the main app's component patterns and UX playbook, and optimize for operator speed, correctness, and safety.

The control plane defaults to `Platform` scope for non-company work, makes organization switching a first-class workflow, and exposes `Site` as the only deeper scope where relevant. All record picking must be autocomplete-based, all risky actions must be guided and auditable, and the shell must always show identity context: signed-in user, acting operator, selected workspace, and impersonation/support-session state.

## Implementation Changes
### 1. Architecture contract
- Add a control-plane registry layer that maps each TUI action to web metadata:
  - action id
  - label and domain grouping
  - required scope (`platform`, `organization`, `site`)
  - safe read vs write behavior
  - wizard launcher or destination route
  - confirmation and audit requirements
- Use this registry as the single source of truth for command-bar results, dashboard quick actions, page header actions, row actions, and scope gating.

### 2. Shell
- Replace the current sidebar-led admin shell with a top-level control-plane shell composed of:
  - global command bar
  - workspace switcher
  - operator context header
  - left navigation for major collections
  - sticky page actions area
- Keep the shell visually aligned with the main app's warm-paper system and UX playbook, but make it denser and more operational.

### 3. Dashboard
- Make `/portal/admin/dashboard` the operational cockpit for `Platform` scope.
- Include KPI cards for clients, subscriptions, revenue, health, support sessions, and backlog.
- Add recent alerts and drift warnings, quick actions, and a Clerk-style workspace jump area with searchable organization cards.

### 4. Workspaces
- Support visible scopes:
  - `Platform`
  - `Organization`
  - `Site` where a module supports site-level work
- Workspace state must be global and durable across routes.
- Switching workspace updates dashboard content, command-bar results, visible quick actions, page queries, and detail context.

### 5. Identity and impersonation
- Add a persistent header component that shows:
  - authenticated user
  - acting operator
  - active workspace
  - active support-session mode
  - impersonation or shadow state
- User and admin lists must support support-access and impersonation flows from row actions and from the command bar.
- Use the existing TUI support session model as the baseline:
  - `IMPERSONATE`
  - `SHADOW`

### 6. Command bar
- The command bar must search across:
  - commands and quick actions
  - organizations
  - sites
  - admins
  - users
  - support sessions
  - incidents
  - runbooks
  - recent items
- Search should support human and machine identifiers:
  - name
  - slug
  - subdomain
  - code
  - email
  - id
- Safe reads and navigation can execute directly. Write actions must open a wizard or confirmation surface.

### 7. TUI parity
- The web control plane must cover the current TUI module surface:
  - organizations
  - sites
  - subscriptions
  - feature flags
  - admins
  - user management
  - support access and sessions
  - runbooks
  - health and remediation
  - contracts
  - audit
- Every TUI action needs a discoverable web entry point through dashboard quick actions, command bar, page header actions, row actions, or detail actions.

### 8. Workflow behavior
- Keep route-backed list/detail pages for durable navigation, bookmarks, and state restoration.
- Launch all writes from modal or sheet wizards rather than inline raw forms.
- Use business labels in UI and keep raw keys/ids secondary.
- Feature-flag pages should use searchable lists, toggles, and sticky header actions like `Save`, `Reset`, and `Discard`.

### 9. Autocomplete-first correctness
- Every selection flow involving companies, sites, users, admins, bundles, templates, or records must use autocomplete or combobox components.
- No mutation flow should require typing raw ids manually.
- Shared picker results should show human label first and machine metadata second.

### 10. Data and APIs
- Extend platform-admin APIs to support:
  - global command search
  - workspace-aware entity lookup
  - wizard-ready payload hydration
  - support-session and impersonation surfaces
  - recent workspace data
  - dashboard KPI aggregates
- Reuse existing platform logic as the source of truth for feature catalog, entitlements, pricing, support access/session operations, and audit creation.

## Public Interfaces and Types
- `ControlPlaneActionDefinition`
- `ControlPlaneWorkspace`
- `ControlPlaneSearchResult`
- `OperatorContext`
- `AutocompleteOption`

## Test Plan
- Verify every current TUI action has a valid web entry point and a functioning web flow.
- Verify workspace switching across platform, organization, and site.
- Verify dashboard KPI correctness, workspace jumping, and quick actions.
- Verify command bar search relevance and safe-vs-write behavior.
- Verify support access and impersonation for request, approve/deny, start, shadow, and end session.
- Verify pricing and entitlements for tier changes, templates, add-ons, and feature overrides.
- Verify all selection flows use autocomplete and never depend on manual raw ids.
- Run `pnpm lint` and manual smoke tests across dashboard, workspaces, clients, subscriptions, feature flags, support access, user/admin lists, and one wizard per control-plane domain.

## Assumptions
- Keep `/portal/admin` as the production URL surface and refactor in place behind a new internal control-plane architecture.
- The landing experience should feel closer to Stripe's operational cockpit and Clerk's workspace switching than to a conventional admin CRUD panel.
- `Site` is the only deeper visible scope for now; other deeper scopes remain architecture-ready but not user-visible.
- Raw JSON execution is not part of the normal production operator experience.
