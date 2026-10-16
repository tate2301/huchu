# Admin portal: restoring what shell B dropped

15 Oct 2026. Shell B (tate2301/huchu#225) kept the two contexts and sign in as,
and dropped most of the old portal's housekeeping. This puts it back, on one
pattern, with the new pricing.

## Decisions

- **Every admin list is the retail ListFrame** (`components/list-frame`): tabs,
  search, filters, sort, group, ticks with shift-ranges and "select all",
  bulk actions in the selection bar, row ⋯ menus, export, phone cards.
  - Hosted by `components/admin/lists/admin-list.tsx` (`ListHostProvider`:
    `/api/platform-admin/lists`, admin runs, the page draws its own header,
    spreadsheet and CSV export).
  - A list is a spec + loader in `lib/admin/lists/<area>.ts`, registered in
    `lib/admin/lists/registry.ts`. Grants are `["admin", OperatorAction]`.
  - Bulk and row actions POST `{ ids, reason? }` to
    `/api/platform-admin/<area>/<verb>` built with `bulkRoute` + `eachOf`
    (`lib/admin/bulk.ts`): each id done on its own, refusals named, 400 only
    when nothing went through.
  - Their words (ask before, toast after) live in
    `lib/admin/lists/<area>-words.ts`, merged in `lib/admin/lists/runs.ts`.
  - Actions that need input open a sheet (`do: { sheet }` →
    `?sheet=<kind>&ids=`), registered in `components/admin/lists/sheets.tsx`.
  - Destructive: `tone: "bad"`, a reason field, and for what cannot be undone
    a typed confirmation (`Ask.typed`).
- **Pricing** (`lib/platform/verticals.ts`): each vertical $39 a month up to 5
  members, $99 once there are more; every vertical at the same rate, so two
  verticals are 2× either figure. Features, add-ons and bundles are switched
  on and off within that and carry no charge of their own.
  - Members = users with access (`isActive`), not school parents or students.
  - Verticals are rows (`CompanyVertical`), backfilled from product/profile.
- **Workspace delete** is two steps: Close (reversible, data kept), then
  Delete for good on the Closed tab (typed confirmation; every row purged by
  `lib/admin/workspace-purge.ts`; the audit log is kept).

## Tracks

1. Foundation — list host, admin list engine and API, bulk helper, Workspaces
   list with suspend / reinstate / extend trials / sign everyone out / close /
   reopen / delete for good. Sign in as from the context bar. Clear refusals
   for a missing `OPERATOR_SECRET_KEY` and a mail provider.
2. People — workspace Members and all-workspaces People as lists. Create a
   member (one, or many pasted), edit name/email/phone/role, send a password
   reset, sign out everywhere, remove access, give it back, delete. Bulk:
   change role, sign out, remove, give back, delete, export.
3. Features and catalogue — a workspace's Features page: its verticals (add,
   remove), bundles/add-ons (on, off), and every feature (on, off, back to
   what its verticals say), with bulk on/off. The global Catalogue: features,
   bundles (create, edit, which features), templates (and applying one to
   workspaces in bulk), syncing the catalogue from code.
4. Pricing and money — `computeCompanyPricing` on the vertical rule with line
   items; recompute when members or verticals change; billing page; tenant
   billing and change-plan; marketing pricing; Home and Overview projections
   (MRR, due, at risk, renewals, 12-month projection, mix by vertical).
5. Sites and the rest — a workspace's Sites (create, edit, open, close, bulk);
   reset a workspace's data; subscription status; Payments, Operators and
   Audit as lists.
