# Teams: build brief

You are building how people work together in a Corelith workspace: members and seats, invites, a member's access, the record page worked by a team (presence, calls, comments, the timeline), notifications and activity, the workspace switcher, and setup for Pabasa and Tender, including Vane reading a company document during setup. It goes into the existing app in this repository, inside its shell. The design is on the Teams canvas, version 42. Every board is in `design/teams/boards/`. Make the app match it at desktop and phone width, with real data and real states. Don't redesign, reword or add features. If something in the design looks wrong, write it in `design/teams/NOTES.md` and build it as drawn.

The till (the `till` page of the canvas) is a separate slice with its own brief: `BUILD-till.md`.

## What is in `design/teams/`

| Path | What it is | How to use it |
|---|---|---|
| `boards/index.html` | Every board, page by page, with its route | Start here |
| `boards/view/<id>.html` | Each board as a standalone page, with its CSS in `boards/assets/` | The source of truth for sizes, colours, gaps and words. Read the markup; don't measure the PNGs |
| `boards/png/<id>.png` | Each board at 1x | What done looks like |
| `boards/assets/*.css` | `bundle.css` (the Corelith Workspace kit), `teams.css` (top bar, icon tools, the standard panel, timeline, members), one file per workflow, `icons-*.css` (Phosphor masks) | Port into components once. Don't copy per screen |
| `boards/canvas/` | The canvas source: `canvas.json` and the `.dc.html` files | Only to re-import into a canvas |
| `spec/screens.json` | Every board: slice, workflow, route, device, files | Your screen list and your test list. Routes are mapped from `audit.md`; confirm each against the router |
| `spec/open.md` | Decisions still open, and what the boards invented | Read before building a step it names |
| `brief.md`, `audit.md` | The brief and the audit of today's record page, notifications and members | `audit.md` names the files each screen lives in today |
| `model.md`, `world.json` | Roles, records, states, transitions, failures; the one world every board is drawn from | The model behind the screens. Fixture data comes from `world.json` |
| `flows.md`, `flows-knowledge.md` | W1 to W8 step by step, with each transition, end state, failures and action counts | Build one workflow end to end from these |
| `tokens.json`, `rules.json`, `lexicon.json` | Values, taste switches, one word per concept | Strings and components must pass them |
| `ledger.md` | Every correction from the owner, in his words | Read before arguing with the design |
| `tools/` | The generators that wrote the boards, and the export scripts | Ground truth when a board leaves something unclear. Paths inside are from the design session; adjust before running |

## Rules the owner has set (from `ledger.md`)

- **The UI never explains itself.** No helper lines, reassurance, step counts, notes beside buttons or captions under pictures. A sub-line under a title only states a fact: a count, a name, a time.
- **Top bar.** Back link, title, favourite, previous and next with "3 of 9". Then presence, then the page's actions with the primary last and the rest folded into More with their shortcuts. Then search, the bell and Vane together at the far right as 36 px icon buttons. Counts ride on badges; names live in the tooltip with the shortcut. This overrides the shipped 240 px search field and the labelled Vane button.
- **One standard right panel** for records, invoices, quotes and builders (K6, K7). A switch at its head, the position figure first, Vane's cards on this record, details edited in place, linked records, people, files, and a footer with who made it and the code. When Vane is open it takes the panel's place.
- **Failures.** Colour only where something went wrong. The copy says what happened and what still works. One way out per failure, as a button.
- **Calls are never recorded.** A call leaves one timeline line: who was on it and for how long.
- **Everyone who signs in takes a seat**, till staff included.
- **Type floor is 12 px**, badges included. Count badges are neutral; colour is for problems.

## Before the first edit

1. Read `AGENTS.md`, `design/teams/audit.md`, `model.md`, `ledger.md` and `spec/open.md`.
2. Run the app with a seeded workspace. Screenshot `/crm/deals/[id]`, `/activity`, `/preferences/organization/users`, a member's page, `/preferences/notifications` and `/signup/[product]` at 1440 and 390 into `design/teams/before/`.
3. Work on a branch. Commit when a step passes. Push only when asked.

## Order of work

1. **Model**: propose it, with its migration and witness test, and wait for a yes. The list is in `model.md` under "What has to be built":
   - `WorkspaceMembership` (with `isOwner` and status), `WorkspaceInvite`, `InviteLink` and `OwnershipOffer`. Seats count memberships plus open invites.
   - `UserPermissionOverride` moves to the membership. `Notification.needsAction`.
   - A team on a record, follow, and a per-record access grant (W8).
   - `source` and `module` on every event, and one timeline reader over comments, activities, files and field history.
   - `TENDER` and `PABASA` in `WorkspaceProduct`. Setup state is derived from the data, not stored.
   - Every member, permission, seat and ownership change writes `PlatformAuditEvent`.
2. **Tokens and the kit.** Apply the audit's token fixes (no uppercase, mono for codes only, weights capped at 600). Port `teams.css` into components:
   - the top bar and icon tools with badges;
   - the standard panel (`.pn`);
   - the timeline row bank (K3 to K5): the row, what an event carries, three densities, grouping, roll-up, and each module and industry's events;
   - presence and the call bar (K1);
   - member rows, the seat meter and invite states (K2);
   - the panel's states (K7) and the missing states (K9);
   - motion with its tokens and reduced motion (K8).
   Build a `/kit` route showing each with its states, matching K1 to K9.
3. **Live.** Server-side LiveKit token minting, then the room hook (`model.md`, "Live: presence and calls"). The SSE channel stays for notification counts. Check the Cyber and Data Protection Act question in `spec/open.md` before turning calls on in production.
4. **Workflows**, one at a time, end to end with their failure boards:
   1. W1, the record page worked by a team (`DealNyatsime` in four states, W1-3 to W1-6, W1-F). The lead joins the shared record shell (audit M7).
   2. W4, a member's access.
   3. W2, adding someone when every seat is taken.
   4. W7: activity, notification settings, the switcher and the invite link.
   5. W8: follow, share, access request, hand over, assign, and the first quote.
   6. W3, Pabasa signup on a phone.
   7. W5, Vane reads a company document in setup, and Knowledge afterwards. This uses the Vane engine already on `main` (`docs/vane.md`).
   8. W6, Tender setup (the till boards W6-3b and W6-9 belong to the till slice).
   9. The gate boards (A3 to A6, P1 to P4).
5. **Shortcuts.** Every primary action on the boards shows its key. Wire each one and add it to the shortcut test.

## Fixture routes

Add development-only `/design/<id>` routes that render each screen with the fixed data in `world.json`: Corelith's nine open deals, D-0014 Campus for Nyatsime College, Sean, Tatenda, Gerald, Munashe, Simbarashe, Tariro, Kuda Interiors, Mufaro Hardware. Every figure adds up across boards; keep them exact.

## Acceptance

- Each screen matches its board at its size (`spec/screens.json`) and at 390. Compare the screenshot with `boards/png/<id>.png` and the markup in `boards/view/<id>.html`. Differences go in `NOTES.md` with the reason.
- Each workflow's failure board is reachable from real conditions, or from a fixture when it can't be.
- `pnpm typecheck`, `npx eslint` on changed files, the new and touched tests, and the witness test for each migration.
- The saas-design lint passes on each built route, run as `design/core-modules/CLAUDE.md` describes, with `design/teams/` files in place of core-modules'.
- Corrections from the owner go into `ledger.md` in his words.
