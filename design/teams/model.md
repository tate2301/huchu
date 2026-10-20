# The model: members, setup and working together

Stage 3, 19 Oct 2026. `world.json` is the source; this page is the readable version. Every screen
in this project is a view of what is written here. The worked examples use two workspaces:
Mufaro Hardware on Tender and Kuda Interiors on Pabasa, at 10:42 on Monday 19 October.

## Members

A member is a person in one workspace. The same person can be a member of several workspaces and
signs in once.

| State | What it means | Holds a seat |
|---|---|---|
| Invited | An invite has gone out and is waiting | Yes |
| Active | Can sign in and work. Sub-lines: Never signed in, PIN locked, Read-only (over the limit) | Yes |
| Suspended | Signed out everywhere and cannot sign in. Everything they did stays | No |
| Removed | Gone from the workspace. Their name stays on everything they did | No |

Suspending frees the seat, so a shop can suspend a cashier on leave and bring in cover.
Restoring needs a free seat.

Removing is the one member action that asks twice. The same dialog hands their open jobs and
follow-ups to someone else.

## Who can do what to members

| | Owner | Admin | Everyone else |
|---|---|---|---|
| Invite, within the seats left | Yes | Yes | No |
| Change a role | Yes | Yes, except to or from admin | No |
| Allow or deny a permission | Yes | Only permissions they hold | No |
| Suspend, restore, remove | Anyone except themselves | Members who are not admins | No |
| Make or unmake an admin | Yes | No | No |
| Raise the seat limit, billing | Yes | No | No |
| Offer ownership | Yes | No | No |

There is one owner. The owner offers ownership and the other person accepts, because billing
moves with it. The old owner becomes an admin. An offer lapses after seven days.

Roles are named after jobs:

- Tender: shop manager, cashier, stock clerk, bookkeeper.
- Pabasa: manager, field worker, bookkeeper.
- Both products also have owner and admin.

A permission is the role's default, then a per-person Allowed or Denied. "Role default" stays a
state of its own, so changing someone's role still moves them. The repo already does this.

A permission someone does not have is absent from their screen. A limit (a quote over
US$5,000) shows its reason and who can do it, with an Ask button.

## Seats

The plan sets the limit, and every plan starts at five. Active members and pending invites hold
seats, so nobody can invite past the limit.

- **Room:** Members and the invite composer always show "4 of 5 seats used".
- **Last seat:** the same line, in warning.
- **Full, for the owner:** Invite turns into "Add a sixth member", with the price on the other
  side. Each product goes from US$39 to US$99 a month. Continue opens billing.
- **Full, for an admin:** "All 5 seats are taken. Only Nyasha can add more", with Ask Nyasha.
  The owner gets a Needs you notification with the name and role the admin typed.

One question is open for the founders: Tender's till staff count as seats today. Three cashiers
fill a five-seat shop. The model counts them until we hear otherwise.

## Invites

There are four ways in, and all four land in one list with the members:

- **Email:** sent from the product's address.
- **Phone:** sent on WhatsApp. Tender staff also get their till PIN this way.
- **Invite link:** one per role, shared on WhatsApp. It can be turned off, and once it is the old
  link never works again.
- **Email domain:** only for a verified business domain, never a free-mail one. Few of our
  customers will use it.

| State | Way out |
|---|---|
| Sent | Resend, Revoke |
| Not delivered | Change the address or number, send the other way, copy the link |
| Accepted | Becomes a member |
| Expired (after 7 days) | Frees the seat. Send again |
| Revoked | Frees the seat. The link stops working |

When an invited person opens the link:

- They sign in with a code. No password and no terms screen.
- They land on the record or page they were invited for, never on setup.
- If the invite has expired, the workspace is full, or they are signed in as someone else, each
  case has its own screen with an Ask button.

## Setup

Each product has its own first steps, in its own brand. After the first step, the rest run in
any order from a checklist at the top of the product's home, never a modal. Each item has a live
sub-line, such as "214 products imported" or "Checking with ZIMRA".

**Tender.**

- Ready to sell once there is a shop, a product (sample products count) and one paired till.
- The aha moment is the first real sale.
- The steps:
  1. **Your shop:** town, USD or ZiG or both, how the ZiG rate is kept.
  2. **What you sell:** a spreadsheet, another till's export, a starting list for the kind of
     shop, one by one, or sample products.
  3. **Tills:** this computer straight away, or a Counter Mini or Kora with a six-digit code that
     lasts 10 minutes.
  4. **Getting paid:** cash, EcoCash, InnBucks, card machine, transfer, on account, each with its
     real logo.
  5. **Fiscal receipts:** device ID, serial and activation key. Taxpayer and VAT numbers come back
     from ZIMRA, read-only. The owner can also choose Later or Not VAT-registered.
  6. **Staff:** name, phone, role, shop. The PIN goes by WhatsApp.
  7. **A practice sale:** in practice mode. Nothing is kept.

**Pabasa.**

- Ready to work once there is a business and a client (sample clients count).
- The aha moment is the first quote sent, or a job changing stage.
- The steps:
  1. **Your business:** the work you do, where you work.
  2. **Your clients:** a spreadsheet, phone contacts, another system's export, or sample clients.
  3. **How a job moves:** stages suggested from the trade.
  4. **Quotes that look like you.**
  5. **Your team.**
  6. **Your first job.**

**Sample data.**

- Every sample row is marked "Sample".
- After the first real import, the app offers to remove the sample data. It never removes it
  unasked.
- Removing asks twice and gives the counts.

**Imports** go through these steps:

1. Choose a file.
2. Match the columns.
3. Check the rows. Rows that will be skipped are shown with their reasons.
4. Import.
5. See the result.

The person who imported can undo it within 24 hours, as long as no imported row has been used.
If the connection drops, the import pauses and carries on from the last row written.

## The record and its events

An event carries five things:

- when it happened;
- who or what did it: a member, Vane, the system, the client through the portal, or an
  integration;
- the module that wrote it;
- the object it changed;
- where it came from: a till, a phone, a computer, WhatsApp, an import, ZIMRA or the bank.

The same events give three views:

| View | Scope | Rules |
|---|---|---|
| Timeline | One record | See below |
| History | One record | Every field change, with before, after, who, when and where. Its own tab |
| Activity | The workspace | By day, then by record. Only for people with the permission |
| Notifications | One member | Needs you first, then by day |

The timeline's rules:

- Newest first.
- Anything a person wrote gets its own line and is never rolled up.
- One person's field edits within an hour roll into one line that opens in place.
- Machine events of one kind on one day roll into a count and a total.
- Filters: Everything, Comments, Documents, Calls, Changes.

Notifications come in two kinds:

- **Needs you** stays until it is acted on or marked done. It covers mentions, things assigned
  or handed to you, approvals, follow-ups due, seat requests, ownership offers, and a call on a
  record you are on.
- **For your information** is done once seen. It covers changes to records you own, are on or
  follow. Field edits never notify.

Your own actions never notify you. Mentions are never grouped. Other events on one record within
an hour group under it. WhatsApp and phone wait for quiet hours (20:00 to 06:00).

Each record has a team: one owner of the job and the others on it. Being on the team means
following the record. Following on its own means being told, not working on it. Handing over
sends a note and gives the new owner a Needs you notification.

Comments:

- A comment can be waiting to send, posted, edited, resolved or deleted.
- Deleting has a 10-second undo instead of a confirm.
- A resolved thread collapses to one line.
- A comment written offline shows "Waiting to send" and sends itself when the connection is back.

## Live: presence and calls

LiveKit opens one room per record while the page is open and visible. The room carries who is
here, typing, which field someone is editing, and calls. It never carries anything that must be
kept. Comments and edits go through the API to Postgres first, and the room is then told to
refresh.

| Presence | Shown as |
|---|---|
| Here | Face in the header row |
| Typing | "Rudo is typing" under the composer |
| Editing a field | The field shows who is in it |
| In the call | Face with a speaking ring |
| Away (hidden or idle 5 min) | Dimmed, gone after 10 minutes |

The member's own connection is Connecting, Live, Reconnecting or Unavailable. When it is
Unavailable, the record still works and the presence row says "Can't show who's here".

If two people save the same field, the second sees "Rudo changed this at 10:40", with Keep mine,
Keep Rudo's and Compare.

Calls:

- Anyone who can see the record can start one. Audio is the default; video and screen share are
  opt-in.
- The team and anyone mentioned get "Rudo is calling about J-0142" with Join. It lapses when the
  call ends.
- The call ends when the last person leaves, or after someone has been alone for five minutes.
  One timeline line records who was on it and for how long.
- Calls are never recorded.
- Failures:
  - Microphone blocked: instructions, or join muted.
  - Calls down: "Call Tinashe on WhatsApp".
  - Poor connection: audio only.
  - Dropped for more than 20 seconds: Rejoin.
  - No screen share in phone browsers, so it is absent there.

LiveKit Cloud's Africa group is one location in South Africa with no redundancy. It falls back
to the EU. Voice crossing the border must be checked against the Cyber and Data Protection Act
before launch. The SSE channel stays for notification counts.

## B2B decisions

| Area | Decision |
|---|---|
| Tenancy | Workspace. Tender has shops and tills under it; Pabasa has nothing under it this round. A Tender page with figures names its shop |
| Switching | One control at the top of the sidebar for the workspace and the member. Logo and face |
| Invitations | Email, WhatsApp, invite link, verified domain. Seven-day expiry. Each failure has its own screen |
| Roles | Owner, admin, then job names per product. No custom roles this round |
| Permissions | Role default plus per-person Allow or Deny, in sentences on the member's page |
| Shared devices | Tender tills by PIN, as built. The till always shows who is signed in |
| Leaving | Suspend or remove. Names stay on everything. Work is handed over |
| Audit | Every member, permission, seat and ownership change goes to `PlatformAuditEvent` with who did it. It shows on the member's page and in Activity |
| Plans and limits | Seats shown before the limit. The owner sees the price on the other side; an admin gets Ask |
| Billing | Out of scope. Seat limits link to the billing page that is already designed |
| Import | In, as a workflow with checking and undo. Export: not in this version |
| Notifications | Needs you and For your information. Per-kind channels already exist. Quiet by default |
| Search | Members are searchable in Members and in the command menu. Records as they are |
| Settings | Management gets Members, Roles and permissions, Invite link, Ownership. Dangerous actions sit at the foot of the member's page |
| Integrations | LiveKit is infrastructure, not an integration the customer sees. WhatsApp shows its real logo where messages go out |
| Support | Out of scope, apart from the ZIMRA and import failures, which offer WhatsApp support |
| Onboarding | Per product, no tour. A checklist, sample data and empty states |

## What has to be built

These are the gaps between the schema and the model:

- `WorkspaceProduct` gains `TENDER` and `PABASA`. `FLARE` is renamed.
- New: `WorkspaceMembership` (with `isOwner` and status), `WorkspaceInvite`, `InviteLink` and
  `OwnershipOffer`.
- Seat counting moves from `User` to membership plus open invites.
- `UserPermissionOverride` moves to the membership, so one person can differ per workspace.
- `Notification` gains `needsAction`.
- Record subjects extend to retail customers, products and suppliers.
- One timeline reader merges comments, activities, files and field history.
- The setup state is per workspace, derived from the data wherever possible, not stored.
- Server-side LiveKit token minting, then the client room hook.
