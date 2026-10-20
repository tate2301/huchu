# App brief: signup, teams and working together

Assumptions made without asking. Overturn any of them before `domain-model` runs.

- **Pabasa is Basa, renamed.** Basa is the service-work product in
  `docs/saas/basa-and-scout-plan.md` (15 Oct), sold today as Flare and called CRM inside the app.
  Pabasa keeps that plan's words: Enquiry, Job, Client, Quote, Site visit. `WorkspaceProduct`
  gains `TENDER` and `PABASA`; `FLARE` goes. Nothing in the repo names Pabasa yet.
- **Project files live in `design/teams/`**, beside `design/admin/` and `design/campus/`.
- **The seat limit belongs to the plan, and every plan starts at five.** This is
  `VERTICAL_RATE.includedMembers` today. A pending invite holds a seat until it is accepted, revoked
  or expires, so a workspace can never invite past its limit. The sixth seat is the owner's
  decision: the owner sees the next plan step. An admin who hits the limit is told to ask the owner.
- **The owner and the admins give permissions. Nobody else does.** There is exactly one owner,
  who can hand ownership to someone else. An admin manages members and permissions but not billing
  or ownership, and cannot give anyone a permission the admin does not hold. A permission is the
  role's default plus a per-person allow or deny, which `lib/platform/permission-catalog.ts`
  already does with three states.
- **One person, many workspaces.** `WorkspaceMembership` from the self-serve design (§2.3) is
  built here, because invites break without it. A cashier at two shops signs in once.
- **Onboarding is the product's, not Corelith's.** Tender and Pabasa each get their own steps,
  sample data and checklist from the product registry. The sites-and-departments
  `OnboardingDialog` stays only for operator-provisioned Corelith workspaces.
- **The record page is one design for every product.** It is drawn first on a Pabasa job and a
  Tender customer, then holds for a Campus pupil or a gold dispatch. Products change the theme,
  never the layout.
- **LiveKit carries what is live. Postgres keeps what happened.** LiveKit handles presence on a
  record, typing, and calls (voice and screen share) started from a record. Comments, mentions,
  files, the timeline and notifications are written to Postgres as they are now. The `/api/live`
  stream keeps notification counts until LiveKit has proved itself in production.
- **Calls are audio first.** Video and screen share are opt-in per call. Calls are never recorded
  in this round.
- **The interface face is Inter**, as `app/themes/roles.css` sets it for the workspace layer.
  `docs/design-system` still names Atkinson Hyperlegible; the shipped CSS wins.
- **No uppercase**, table heads included. This follows the platform rule, and the admin portal's
  uppercase heads are not carried over.

## The idea

A new business is working in Corelith on the day it signs up, and from then on everyone on the
team can see the same record, what happened to it, and who is on it right now.

## People

| Role | Buys or uses | Device and conditions | Opens the app to |
|---|---|---|---|
| Owner | Buys. Signs up, pays, owns the workspace | Phone first, often from an ad or a WhatsApp link; a laptop for setup if one is near. Pays for data by the gigabyte | Sign up, set the business up, invite people, decide who can do what, raise the seat limit |
| Admin | Uses. The manager the owner trusts with people | Laptop in the office or the back of the shop | Invite and remove members, change roles and permissions, chase what is stuck |
| Tender cashier | Uses | The till: a shared counter device or Counter Mini or Kora, signed in by PIN, a queue waiting, power cuts | Sell. Sees teammates only as names on a sale or a shift |
| Tender stock clerk or shop manager | Uses | Laptop or tablet in the storeroom; phone on the floor | Receive stock, fix prices, check what sold, answer a mention |
| Pabasa field worker | Uses | Phone on site, one hand, poor signal, sun on the screen | Log a site visit, attach photos, see what changed on the job, call the office about it |
| Pabasa office manager | Uses | Laptop, all day, WhatsApp open beside it | Quote, hand a job to someone, read the timeline, follow up on money |
| Invited teammate | Uses, arriving for the first time | A phone, from a WhatsApp invite link | Join in one step and land on the work they were invited for |

## Jobs, most frequent first

1. **See what changed on my work since I last looked.** The record's timeline and my
   notifications, newest first, with what needs me at the top.
2. **Work a record with the team.** Comment, mention, hand over, attach a document, and see who
   else has it open.
3. **Answer what is waiting on me.** A mention, an assignment, an approval, a follow-up due.
4. **Talk it through.** Start a call from the record with whoever is on it, and share a screen.
5. **Bring someone in and decide what they can do.** Invite, choose a role, adjust a permission,
   remove someone who left.
6. **Set up a new workspace for the product just bought,** or bring the data across from a
   spreadsheet or another system, and be selling or quoting before the trial's first day ends.

Jobs 1 and 3 decide where people land. Within this scope that is the record page, opened at its
timeline with unread items marked, and the notifications view filtered to "Needs you". Vane's For
you stays the workspace home and is out of scope.

## Scope

- **Kind of work:** two features (self-serve onboarding per product, and teams), one set of new
  components (collaboration), and a redesign of three views that already ship (the record page,
  notifications and activity).
- **In:**
  - **Signup and onboarding for Tender and Pabasa.** Registry entries, each product's steps,
    import, sample data, the setup checklist and empty states, from the first screen to the first
    real sale or first quote sent.
    - Tender: the shop and its currencies; what it sells, from a spreadsheet, another till's
      export, or a starting catalogue; the tills; payment methods; the ZIMRA fiscal device, now or
      later; staff with their till PINs; a practice sale.
    - Pabasa: the business, its trades and area; where its clients are now; import; the first job
      and quote; the team.
  - **Teams.** Members and invites in one list. Invite by email, by a link shared on WhatsApp,
    and by email domain. Seat limits from the plan. Roles, permissions and per-person changes.
    Suspend, remove, hand over ownership. The workspace switcher for people in more than one
    workspace. Accepting an invite on a phone.
  - **Collaboration components.**
    - Who is here: the people on the record now, with presence, and typing in the composer.
    - Mentions and the composer.
    - Assign and hand over. Follow and unfollow.
    - Comment threads, resolved threads.
    - A call on a record: start, join, mute, share a screen, leave.
    - Share a record by link.
    - The team on a record.
  - **The record page.** Header, timeline, documents, the team and the client's contacts, the
    history of every change, and the right-hand panel. Progressive disclosure throughout.
  - **Notifications, activity and the timeline as one event model with three views.**
    Notifications are what needs me. Activity is what happened across the workspace. The timeline
    is what happened to one record. Grouping, read state and links between the three.
  - **Motion.** One motion system for these surfaces, built on `lib/animation/tokens.ts`, that
    paces onboarding and arrivals and honours reduced motion.
- **Out:**
  - The billing and pay pages (S-12 to S-16, designed 27 Sep). Here we only show where a seat
    limit leads to them.
  - Vane's For you, Scout, and Explore.
  - The till's selling screen. The practice sale uses the Tender till as it stands.
  - Onboarding for Campus, gold and payroll.
  - Call recording, transcripts and Vane in calls.
  - Management → Notifications routing, unless the event model changes what it routes.
  - Native phone apps. The phone browser is in scope.
- **Already shipping:**
  - **Signup.** `/signup/[product]` has three steps for Flare: start, code, workspace.
    `lib/platform/products.ts` holds CORELITH and FLARE only.
  - **Members.** The old management pages (`/management/users`: create, role change, status,
    password reset). `UserPermissionOverride` and the permission catalog with Default, Allow and
    Deny. `RetailStaffInvite` sends a WhatsApp link that works for seven days. There is no
    `WorkspaceMembership` and no general invite.
  - **Collaboration.** `CrmComment` (one level of replies, pinned, resolved), `CrmMention`,
    `CrmFollower`, `CrmRecordFile` and field history, all keyed by subject type and id. The rich
    text composer and comment thread are in `components/crm/collaboration`. The record tabs, the
    history feed and the record story are in `components/crm/records`.
  - **Notifications.** `Notification` with recipients, settings per kind and channel, and quiet
    hours. `/activity` holds the inbox and the audit trail. `/api/live` is server-sent events,
    checked every five seconds.
  - **Earlier canvases.** Flare onboarding screens (27 Sep). Core modules, notifications N01 to
    N04 (11 Oct). The Workspace component layer (`.cx-*`, `components/workspace/`, including
    `setup-checklist`, `empty-guide` and `option-card`).

## Stack

| | |
|---|---|
| Framework | Next.js 16.1 App Router, React 19.2 |
| Styling | Tailwind 4. Roles from `app/themes/roles.css`, themed by `data-theme` (`corelith`, `tender` and their dark pairs; `pabasa` to add). Components from the Workspace layer in `app/themes/workspace.css` |
| Component library | `components/workspace/` (`.cx-*`) over `@corelithzw/react` 0.4, with shadcn, Radix and Base UI primitives in `components/ui`. cmdk for the command menu. TanStack Table |
| Icons | `@/lib/icons`: Phosphor, fill by default, bold for carets, X, plus and check |
| Motion | framer-motion 12 with springs, easings and staggers from `lib/animation/tokens.ts`. The member's reduced-motion preference is already stored |
| Data layer | Prisma 7 on Postgres (Neon). TanStack Query. NextAuth 4 with the email code strategy. Resend for email; the WhatsApp provider is still to be chosen |
| Live | Today: `/api/live` (SSE). Proposed: LiveKit (`livekit-server-sdk` to mint room tokens, `livekit-client` and `@livekit/components-react`), one room per open record, with data messages for presence and typing |
| Deploys to | Vercel, one deployment for every product. Production migrations run in `pnpm build` |

## Constraints

- **Connection.** Phones on mobile data that the customer pays for, patchy signal on sites, and
  power cuts at shops. Presence and calls must fail quietly. When LiveKit cannot connect, the
  record works as it does today and says nobody's presence can be shown. Tills stay offline-first;
  nothing in this scope may make a sale wait on the network. Calls default to audio.
- **Where LiveKit runs.** LiveKit Cloud's Africa region group is one location in South Africa,
  with no in-region redundancy. Calls fall back to the EU. Voice is personal data, so check the
  Cyber and Data Protection Act [Chapter 12:07] rules on sending it across the border before
  launch. Self-hosting LiveKit near Harare is the alternative.
- **Regulation.**
  - Tender's fiscal device setup follows ZIMRA FDMS: the device ID, serial and activation key are
    typed in, and the taxpayer and VAT numbers come back from ZIMRA, read-only.
  - Personal data in invites and contact imports falls under the same Act, with POTRAZ as the
    authority.
  - Every change to members and permissions is written to `PlatformAuditEvent`, with who made it.
- **Languages and currencies.** English. USD, with ZiG beside it where a shop takes both.
- **Hardware.** Tender tills: a browser till, Counter Mini and Kora. Laptops at 1280 px and up.
  Every step of joining and onboarding must work on a phone at 390 px.
- **Dates.** None set. Clock for the mocks: Monday 19 October 2026, Africa/Harare.

## Where the work happens

Both.

- **Canvas first.** Layouts and screens are drawn on a design canvas for each gate. Each feature
  starts from three starting points and follows each to the end of its workflow, with every state.
- **Then the repository** (`~/work/huchu`). Run it with `pnpm dev:up`. Check it with
  `pnpm typecheck` and `pnpm lint`. Vitest suites sit beside the code.

## From the brand

- **Accent, typeface, mark.**
  - Corelith: action `#2563eb` on warm neutrals (`--ground #faf9f8`, `--ink #26251f`).
  - Tender: action `#e8620f`, filled `#b84a0c`, on `--ground #faf7f4`, `--ink #24140e`.
  - Pabasa: no theme yet; it is drawn on the Corelith theme until its brand is set.
  - Inter for every product. Each product's own mark on signup and on invites; the workspace's
    logo or the member's face wherever a workspace or a person appears.
- **Rules carried over.**
  - The record view has three columns: sidebar, the record's timeline in the centre, detail and
    attributes on the right. White page, hairline borders.
  - A post composer sits at the top of the timeline. Grouped events are stacked.
  - The workspace switcher and the account share one control at the top of the sidebar.
  - One page is about one thing. Tabs and filters sit on separate rows. Tables are not wrapped in
    cards and are full bleed with a sticky footer. No badges in a record header.
  - Every primary action has a keyboard shortcut. Every action button has an icon.
  - Real logos for EcoCash, InnBucks, ZIMRA, WhatsApp and the card schemes. Faces for avatars.
  - Weight 600 at most below display sizes. No solid black.
