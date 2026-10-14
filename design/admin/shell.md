# Shell: the navigation map

Shell B, chosen 13 Oct 2026. Two contexts, never mixed.

## The two contexts

| | All workspaces | Inside one workspace |
|---|---|---|
| For | Finding anyone, working the queues, setting up a workspace, operators | Every admin and housekeeping change to that workspace |
| Pages | Home (the queue), Workspaces, People, Payments, Audit log, Operators (owners) | Overview, Members, Plan and billing, Audit log (this workspace), Settings |
| URL | `/admin/...` | `/admin/w/<slug>/...` |
| May change | New workspaces, operators. Queue items, each of which names its workspace | That workspace and nothing else. The server takes the workspace from the URL and refuses an action naming another |
| Search | Every workspace | This workspace, with "Search all workspaces" as the way out |

### How you can tell where you are

1. **The switcher** at the top of the sidebar names the context: a globe and "All workspaces", or
   the workspace's mark and name on a blue tint.
2. **The scope bar** across the top of every page. Neutral for all workspaces. Inside one, it is
   tinted, with a blue edge, and carries the name, the address, the standing, Sign in as, and
   Leave workspace (Esc).
3. **The sidebar** holds only that context's pages.
4. **Every confirmation** names the workspace it acts on.
5. **A queue item** in Home acts on one workspace, so it wears that workspace's tinted strip above
   it ("Acts on Chikuru Motors").

### Entering and leaving

- Enter by opening a workspace from anywhere: a row, a search result, a queue item, the switcher, or `O`.
- Leave with Esc, the switcher, or Leave workspace on the scope bar.

## What lives inside a workspace

| Page | Housekeeping it holds |
|---|---|
| Overview | What happened, from every module; standing; suspend, export, more |
| Members | Invite, resend invites, and per member: sign in as, unlock, password reset, sign out everywhere, change role, make owner, suspend, remove |
| Plan and billing | Change plan, extend trial, seats, add-ons, record a payment, this workspace's payments |
| Audit log | This workspace only; exports as the access record |
| Settings | Name, address, custom domain; owner; sign everyone out, ask for new passwords, end sign-in-as sessions; export everything, export the access record, sample data; suspend; close (owners) |

**Left to signing in as a member:** anything inside the product itself, such as the customer's
records, their own settings, sites, templates and imports. Support signs in as a member and does
it there, where the product's own rules and audit apply.

## Per role

| | Home | Workspaces | People | Payments | Audit log | Operators | Inside a workspace |
|---|---|---|---|---|---|---|---|
| Owner | yes | yes | yes | yes | yes | yes | everything |
| Support | yes | yes | yes | read | yes | absent | everything except billing writes and closing |
| Billing | yes | yes | yes | yes | yes | absent | billing writes; look-only sign in as; the rest read |

Actions a role never has are absent, not greyed.

## Tables

Every list is the product's record table (`components/records/record-table.tsx`,
`docs/design-system/12-tables.md`):
- **First column:** the identity, with a mark, the name underlined and the code in mono beneath.
  It is the only clickable cell.
- **Column heads:** 10px uppercase, each with an icon.
- **States:** filled badges with tones from the one map.
- **Values:** phones, codes and dates in mono; money in mono, weighted and right-aligned; empty
  cells as a faint dash.
- **Rows:** one trailing chevron (opens) or one ⋯ menu (acts), never more.
- **Layout:** tabs on their own row, filters on the row below, and a footer with the count and
  the sums.
- **Phone:** the table becomes a two-line row list.
