# Audit: the record page, notifications and members

Source: the repository (`huchu` main at `bd003c69b`), plus the approved canvas boards N01 to N04
(Corelith core modules, 11 Oct). The app was not running, so values come from the code, not a
capture. Date: 19 Oct 2026.

## Screens

| Screen | Route | Job | Role | States present | States missing |
|---|---|---|---|---|---|
| Deal (job) | `/crm/deals/[id]` | Work a job with the team | manager, field worker | loading, empty timeline, overdue dot on tabs, stage checklist, lost | who is here, team on the job, following, call, conflict, waiting to send, no permission |
| Person, company, site | `/crm/people/[id]` and siblings | Same, for a contact, client or site | same | same as deal | same as deal |
| Lead (enquiry) | `/crm/leads/[id]` | Same, before it is a job | same | own page, own composer (`lead-detail/`) | runs outside `record-tabs`, so every fix to records misses it |
| Record sections | `?section=` | Timeline, Documents, Jobs, People, Visits, Tasks, Workflows, History | all | drop empty sections; URL state; phone drill-in | — |
| History section | `?section=history` | Activity, Field changes, Mentions as sub-sections | all | each sub-list | Mentions does not belong here (see M5) |
| Bell | panel from the app bar | What needs me now | everyone | Needs you, Updates, Mentions; inline actions; quiet hours | Needs you held after reading; seat requests; calls; hand-overs |
| Activity | `/activity` | The full inbox, and the workspace trail for managers | everyone; managers | Needs you, Mentions, Everything, Workspace; J/K/↵/E keys; drawer | grouping by record; failure rows ("You can no longer open this") |
| Activity worksheet (canvas N03) | — | Every event as a table | managers | day groups, sticky footer, pagination | — (model issues, see M8) |
| Notification settings | `/preferences/notifications`, Management → Notifications | Who hears what, where | everyone; admin for workspace rules | per kind × channel, quiet hours, morning message, group repeats | kinds for teams: assigned, handed over, calls, seat requests, ownership |
| Members | `/preferences/organization/users` (old `/management/users/*` redirect) | Add and manage people | admin | list, role and status filters, create with temporary password, role change, password reset | invite, pending, expired, not delivered, seats, suspend vs remove, owner, hand over work, multi-workspace |
| A member's permissions | user detail, `permission-matrix.tsx` | Allow or deny one by one | admin | three states, search | who changed it and when; admin-can-only-give-what-they-hold |
| Signup | `/signup/[product]` | Start a workspace | owner | start, code, workspace (Flare only) | product-specific steps, import, checklist, sample data |
| Setup dialog | `OnboardingDialog` | Sites and departments | owner | modal | belongs only to Corelith workspaces |

## Components

| Component | Variants found | Where | Keep, merge or replace |
|---|---|---|---|
| Button | 3: `components/ui/button` (240 files), `@corelithzw/react` Button (144), `components/workspace/button` (23) | everywhere | Merge into the Workspace button. Every new screen uses it alone |
| Record shell | 1 shared (`RecordPageShell`) plus the lead's own page | records | Keep the shell; bring the lead into it |
| Section nav | vertical rail beside the section (desktop), list at the foot (phone) | records | Replace on desktop with tabs on their own row inside the centre column (see S1) |
| Timeline row (`RecordStory`) | 1, with a boxed variant for prose | records | Keep; add source, module, roll-up and comment state |
| Composer (`ConversationComposer`) | 1 for the record, 1 lead-only (`activity-composer`) | records | Keep the record one; delete the lead one |
| Comment thread | 1 | collaboration | Keep; add resolved line, waiting to send, deleted |
| Inbox row (`InboxRow`) | 1, used by the bell, /activity and the workspace trail | notifications | Keep |
| Rail section (`RailSection`) | about 10 on a deal: why lost, at this stage, up next, Vane, next visit, contact so far, last email, site, billing, contacts | records | Cut to four, with the rest behind "More" (see S5) |
| Status chip | `StatusChip` in the app bar and the record toolbar | records | Move the state into the stage control; no badge in the header |
| Table | `record-table.tsx` (uppercase heads), the inbox list, the N04 matrix in a card | records, settings | One table; no uppercase; no card around it |
| Dialog and sheet | Radix dialog, the Workspace sheet, `RecordDialog` | records | Keep the Workspace sheet for side work; dialog only for asking twice |

## Values in use

| | Found | Target |
|---|---|---|
| Typefaces | Inter (Workspace layer), Atkinson Hyperlegible (DS docs, kit), a mono for times and codes | 1, with mono for codes only |
| Font sizes | `text-sm` 191 times, `text-base` 8, `text-xs` 3, `text-[12px]` 1, plus `--text-12/13/14` in CSS modules | 8 to 10 on one scale |
| Weights | 400, 500, 600, `font-bold` on uppercase day heads | 3 |
| Colours | roles mostly; 2 raw hex in record components | roles only |
| Radii | Workspace 8 and 10, kit `--radius-*` | 4 |
| Spacing | Tailwind `space-y-4`, `gap-2.5`, inline 24, 56 px | the named scale |
| Shadows | float, pin, sheet | floating surfaces only (holds) |

## The model the app has now

- **Nouns:**
  - user (not member);
  - company, workspace and organisation all in use;
  - deal and lead (not job and enquiry);
  - owner (of a record);
  - conversation, timeline and story, all for one thing;
  - activity used for two things: the CRM's logged contact (`CrmActivity`) and the workspace
    audit trail.
- **Statuses:**
  - users: active or not, by a boolean;
  - notifications: read and archived, with "needs you" worked out from the type;
  - comments: pinned and resolved exist in the schema, and following exists in the schema.
- **Roles:** SUPERADMIN shown as "Superadmin"; job roles per vertical. There is no owner.
- **Where it differs from how the business works:**
  - People join because an admin types their name, email and a temporary password. Nobody is
    invited, nothing counts seats, and one email can belong to one workspace only.
  - A record has one "Owner" attribute. The people working on it with the owner have nowhere to
    be. The "People" section is the client's contacts. What Tatenda calls deal members does not
    exist.
  - `CrmFollower` exists, but there is no control on the record to follow it.
  - Needs you drops an item as soon as it is read, though the approved canvas (N01) says "stays
    until it is done or dismissed".
  - Timeline events carry no source and no module. A sale on the till and a note typed on a phone
    look alike.

## Defects, ranked by where the cause lives

| # | Severity | Cause lives in | Rule | What is wrong | Screens affected |
|---|---|---|---|---|---|
| M1 | Model | `lib/inbox/query.ts` | Every state has a screen | Needs you filters `isRead: false`, so reading an approval removes it from Needs you before anyone acts. N01 says it stays until done | bell, /activity, counts |
| M2 | Model | `lib/inbox/describe.ts`, schema | One world | Needs you is a type list plus a substring match on `payloadJson` (`'"needsYou":true'`). Add `needsAction` to `Notification` and query it | bell, /activity |
| M3 | Model | schema, `users-preferences.tsx` | Model before screens | Admin sets a temporary password for a new person. No invite, no pending, no seats, no owner, one workspace per email | Members, signup, every invite |
| M4 | Model | records | One record, enriched | No team on a record: one Owner attribute, People = client contacts. Following has no control | every record |
| M5 | Model | `record-tabs.tsx` `historyTab` | One term per concept | History holds three different things: logged activity, field changes and mentions elsewhere. Mentions are notifications; field changes are History; logged contact belongs in the timeline | every record |
| M6 | Model | `record-story.tsx` `StoryEvent` | One record, enriched | Events have no `source` or `module`. No roll-up of machine events. No comment states (waiting to send, edited, resolved) | every record |
| M7 | Model | `lead-detail/` | One shell | The lead (enquiry) has its own page and composer outside `record-tabs`. The shell's own comment says fixes "landed on one of five" | enquiries |
| M8 | Model | N03 canvas, `workspace-trail.tsx` | One page, one thing | The workspace worksheet mixes notification rows ("Mentioned you") with audit rows, and its Who column mixes customers (Chisipite Dental paid) with members | Activity |
| M9 | Model | `verticals.ts` | Limits stated before they are hit | The sixth member silently moves every product from US$39 to US$99. Nothing on Members says so | Members |
| S1 | System | `record-page-shell.tsx` | Detail views are three columns | Desktop is four columns: app sidebar, section rail with Related under it, the section, the info column. Thirteen sections were the reason given. With M5 fixed and empty sections dropped, the deal has six; tabs fit on one row in the centre column | every record |
| S2 | System | `record-page-shell.tsx`, `record-toolbar.tsx` | No badges in a record header | `StatusChip` sits in the app bar beside the name. The stage control already says the state | every record |
| S3 | System | `components/ui`, kit, Workspace | One component per job | Three button components across about 400 files | every screen |
| S4 | System | `record-story.tsx:410`, `record-peek.tsx:157`, `record-table.tsx:569` | No uppercase; weights | Day heads are `font-bold uppercase tracking-[0.06em]`; peek and table heads uppercase | records, tables |
| S5 | System | deal rail | Progressive disclosure; minimise cards | About ten rail sections on a deal. The right panel should hold the record's position (value, terms, next step, team, links) and fold the rest | every record |
| S6 | System | inbox, N02, N03 | Mono for codes only | Times set in mono throughout notifications and activity | bell, /activity |
| S7 | System | live channel | — | `/api/live` polls the database every five seconds per open tab. Fine for counts; it cannot carry presence | all |
| X1 | Screen | N02 bell | Words: a button says what happens | A mention offers "Reply" with the WhatsApp logo. Replying to a teammate's mention is an in-app comment; WhatsApp is right only when the event came from a client on WhatsApp | bell |
| X2 | Screen | N03 | One accent per view | Export is the filled primary in the app bar, and appears again in the toolbar. A log has no primary action | Activity |
| X3 | Screen | N03 | Group by meaning before a table | The Amount column is mostly dashes; the Product column repeats inside a day. Group by day then record, and put the figure in the sentence | Activity |
| X4 | Screen | N04 | Tables are not wrapped in cards | The kind × channel matrix sits in a bordered rounded card | Notification settings |
| X5 | Screen | N04 | Every state has a screen | No kinds for assigned, handed over, calls, seat requests or ownership | Notification settings |
| X6 | Screen | deal | One term per concept | The first section is labelled "Conversation"; the code comment calls it Overview; the lexicon says timeline | every record |
| P1 | Polish | `activity-inbox.tsx` | Tokens only | 16 inline `style={{}}` with px values (widths 180, heights 32) | /activity |

## Keep

- **Sections live in the URL** (`?section=`). The back button returns to the record, a link to a
  record's documents can be sent, and the first paint is right on a phone.
- **One composer for everything said about a record.** The first, largest choice is "for the
  team, or a record of what you told the client". This prevents the worst mistake in a shared
  timeline and stays as it is.
- **`record-tabs.tsx`.** Every record's sections are built once from a `RecordRef`.
- **`buildStory`.** It merges visits, tasks, comments and documents into one story. The merged
  timeline reader extends it.
- **Empty sections are dropped**, not shown blank.
- **The headline figure stays in view** in the record toolbar while the timeline scrolls.
- **Inbox keys** (J and K to move, ↵ to open, E for done), the drawer one level deeper, and
  actions in the bell that are the same buttons as on the record.
- **The permission matrix:** search plus three visible states. "Role default" is a state you can
  choose.
- **Notification settings per kind and channel**, quiet hours, group repeats, and the
  morning message.
- **The N01 rules:** nothing you did notifies you, repeats group, and unread is a dot and a
  heavier line, never a fill.
- **Signup steps one to three** with the emailed code and no password.

## Order of work

1. **Model.**
   - `WorkspaceMembership`, `WorkspaceInvite`, `InviteLink`, `OwnershipOffer`, and seat counting
     (M3, M9).
   - `Notification.needsAction`. Needs you held until done (M1, M2).
   - A team on a record, and a follow control (M4).
   - `source` and `module` on every event, plus a timeline reader that rolls up machine events
     (M6).
   - Mentions out of History (M5).
   - The lead into the shared shell (M7).
   - Tender and Pabasa in the product registry, with their setup state.
2. **Shell.**
   - The record page goes to three columns: sidebar; centre with the header, tabs on one row and
     the timeline; right panel with position, team and links (S1, S5).
   - No status badge in the header (S2).
3. **Tokens.**
   - No uppercase, mono for codes only, weights capped at 600 below display (S4, S6).
   - Inter confirmed in the Workspace layer.
4. **Components, by screens repaired.**
   - Button merged (S3): every screen.
   - Timeline row with source, roll-up and comment states: every record.
   - Presence row and call bar (new): every record.
   - Team list on a record (new): every record.
   - Inbox row with Needs you held: bell, /activity.
   - Member row with invite states and seat line (new): Members, setup.
   - Setup checklist item with live sub-line (`setup-checklist.tsx` exists): both products' homes.
5. **First three workflows.**
   1. **A Pabasa job worked by two people.** A field worker's comment mentions the office. The
      office reads it in Needs you, opens J-0142, sees Tinashe away and Kuda here, starts a call,
      changes the value, and hands over the follow-up. Includes presence lost, a conflicting edit
      and a comment written offline.
   2. **A Tender owner from signup to a sale, with staff.** Shop, import 214 products with 12
      skipped, pair this computer, check the fiscal device with ZIMRA while carrying on, invite
      a cashier by WhatsApp, hit the five-seat limit, see the price on the other side. Includes
      the cashier accepting on a phone, an expired invite and PIN not delivered.
   3. **An admin managing people.** Invite with a role, the invite not delivered, change a
      permission they hold, try one they do not (absent), suspend a member on leave, remove a
      member who left and hand their jobs to someone, and the owner offering ownership.
   4. **A Pabasa owner from signup to a first quote sent**, from a phone, importing clients from
      phone contacts. This is the fourth, to meet the four-workflow rule.
