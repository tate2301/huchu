# Teams: the migrations I propose

Nothing here is applied. Each step is its own migration with a witness test. I need a yes (or a change) on the
numbered decisions at the foot before I write any of it.

## What the schema does today

- `User` belongs to one `Company` (`companyId`, required) and carries its role (`role: UserRole`) and `isActive`.
  `email` is unique, so one email is one user in one workspace.
- There is no owner, no invite, no seat count. Admins type a name, email and temporary password.
- `UserPermissionOverride` is keyed `(userId, permissionKey)` with `companyId` beside it.
- `WorkspaceProduct` is `CORELITH | FLARE`. `FLARE` is read in `lib/admin/*`, `components/admin/*` and `scripts/seed-admin-dev.ts`.
- `Notification` has no "needs you" flag (it is derived from type); `NotificationRecipient` has `actionTaken`/`actedAt`.
- `CrmComment` and `CrmFollower` exist; a record has one owner attribute and no team. Events carry no source or module.
- `PlatformAuditEvent` is hash-chained and already indexed by company, entity and actor.

## Approach: additive, one step at a time

`User.companyId` and `User.role` stay. Membership is added beside them, backfilled one-to-one, and becomes the source for
status, owner, seats and invites. Nothing existing breaks while it lands. Multi-workspace sign-in is the one risky change
and is last (M7), so the rest ships without it.

## Steps

**M1. Products.** `WorkspaceProduct` gains `TENDER` and `PABASA`. `FLARE` stays until you approve the rename (`spec/open.md`).
Witness: enum values exist; `lib/platform/products.ts` resolves brand, home route and integrations for both.

**M2. Membership.**
```prisma
enum MembershipStatus { INVITED ACTIVE SUSPENDED REMOVED }

model WorkspaceMembership {
  id          String           @id @default(uuid())
  companyId   String
  userId      String
  status      MembershipStatus @default(ACTIVE)
  isOwner     Boolean          @default(false)
  isAdmin     Boolean          @default(false)
  role        UserRole                       // job role in this workspace
  suspendedAt DateTime?
  removedAt   DateTime?
  removedById String?
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  @@unique([companyId, userId])
  @@index([companyId, status])
  @@index([userId, status])
}
```
Backfill (idempotent, `scripts/backfill-memberships.ts`): one membership per existing user, status from `isActive`
and `accessRemovedAt`, role from `User.role`; the earliest active `MANAGER` or `SUPERADMIN` of each tenant becomes
owner, and every other `SUPERADMIN` becomes admin. Witness: every user has exactly one membership; every
workspace has exactly one owner; running twice changes nothing.

**M3. Overrides move to the membership.** `UserPermissionOverride` gains `membershipId` (nullable, backfilled from
`userId + companyId`), then reads switch to it. `userId` stays until the next release. Witness: effective permissions
for every seeded user are identical before and after.

**M4. Invites, links, ownership.**
```prisma
model WorkspaceInvite   // email or phone; role; invitedById; token hash; channel EMAIL|WHATSAPP; status
                        // SENT|NOT_DELIVERED|ACCEPTED|EXPIRED|REVOKED; expiresAt = +7 days; for: record or page to land on
model InviteLink        // one per (companyId, role); token hash; isActive; rotating it kills the old link for good
model OwnershipOffer    // companyId, fromMembershipId, toMembershipId, status OPEN|ACCEPTED|DECLINED|LAPSED, expiresAt = +7 days
```
Seats are `count(ACTIVE memberships) + count(open invites)`, read by one function (`lib/teams/seats.ts`). The plan limit
(five to start) goes on `Company` as `seatLimit Int @default(5)`. Witness: an invite past the limit is refused; revoke,
expire and suspend each free a seat; restore needs a free one; an accepted offer moves `isOwner` and makes the old owner
an admin in one transaction.

**M5. Notifications.** `Notification.needsAction Boolean @default(false)`, backfilled from type (mentions, assignments,
approvals, follow-ups, seat requests, ownership offers, calls). A needs-you item stays until `actedAt` or dismissed.
Witness: reading does not clear it; acting does.

**M6. A team on a record, and who may see it.**
```prisma
model RecordTeamMember { companyId, subjectType, subjectId, membershipId, isOwner Boolean, followsOnly Boolean }
model RecordAccessGrant { companyId, subjectType, subjectId, membershipId, grantedById, status ACTIVE|REQUESTED|DENIED }
```
`CrmFollower` is folded in as `followsOnly = true`. Subjects extend to retail customers, products and suppliers.
Witness: being on the team follows the record; handing over moves `isOwner` and raises a needs-you item.

**M7. Events.** `source` (`TILL | PHONE | WEB | WHATSAPP | IMPORT | ZIMRA | BANK | SYSTEM`) and `module` on `CrmActivity`,
`CrmComment` and file events, plus one timeline reader (`lib/teams/timeline.ts`) over comments, activities, files and
field history, with the roll-ups from `model.md`. Read-side only for anything that has no column yet. Witness: the
reader's ordering, the one-hour edit roll-up and the one-day machine roll-up.

**M8. Several workspaces for one person.** The one risky step. `User.companyId` becomes the home workspace; the session
carries `activeCompanyId` chosen from the memberships, and `enrichTokenClaims` sets the token's `companyId` from it, so
the many callers that read `session.user.companyId` do not change. `User.email` stays unique; one person, many
memberships. Witness: switching changes every scoped read; a suspended membership cannot be chosen; sign-out-everywhere
still ends all sessions.

**Audit.** Every member, permission, seat and ownership change writes `PlatformAuditEvent` through one helper
(`lib/teams/audit.ts`) with actor, entity and the before and after. Witness: one test per change type.

**Setup state** is derived from the data (a shop, a product, a paired till; a business, a client), never stored. No migration.

## Decisions I need

1. **Yes or change** on M1 to M8 as written, applied in that order, each with its own commit.
2. **Owner backfill.** I would make the earliest active manager or superadmin of each tenant the owner. Is that right for
   existing tenants, or should the owner be set by hand?
3. **Seat limit.** Five on every plan, as the model says. Till staff count as seats ("everyone who signs in takes a seat").
   Existing tenants already over five stay working but cannot invite until they are under, shown as "Read-only (over the
   limit)" only on the invited, never on current members. Agreed?
4. **`FLARE`.** Leave it, or rename it to `PABASA`. The rename touches the files listed above and needs a data migration.
5. **M8 now or later.** The switcher boards (W7) need it. I would build W1 to W6 first and land M8 before W7.

Until you answer, I build only what needs no schema: the kit, `/kit`, the top bar and standard panel, the timeline row
bank, presence and the call bar, and the fixture routes.
