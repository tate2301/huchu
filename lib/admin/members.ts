import type { UserRole, WorkspaceProduct } from "@prisma/client";

import { LOGIN_SUCCESS_EVENT } from "@/lib/auth-core/last-sign-in";
import { getEnabledFeatureKeys } from "@/lib/platform/entitlements";
import { getAllowedUserRoleOptionsForWorkspace, USER_ROLE_LABELS } from "@/lib/platform/vertical-roles";
import { prisma } from "@/lib/prisma";

/**
 * A workspace's members, as the portal reads them.
 *
 * The states are only the ones the product can actually be in: a member has
 * access or had it removed; an open staff invite (retail) or no sign-in yet
 * says they have not started; a till PIN locked by five wrong tries is
 * locked. Nothing is invented for the portal's benefit.
 */

export const MEMBER_STATES = ["Active", "Invited", "Never signed in", "Till PIN locked", "Access removed"] as const;
export type MemberState = (typeof MEMBER_STATES)[number];

export type MemberRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  roleLabel: string;
  isOwner: boolean;
  state: MemberState;
  lastSignInAt: Date | null;
  addedAt: Date;
};

export function roleLabel(role: UserRole): string {
  return USER_ROLE_LABELS[role] ?? role.charAt(0) + role.slice(1).toLowerCase().replace(/_/g, " ");
}

export type MemberWorkspace = { id: string; name: string; slug: string; product: WorkspaceProduct };

/** One workspace's members, owners first among equals: those with access before those without, by name. */
export async function listMembers(companyId: string, now = new Date()): Promise<MemberRow[]> {
  return readMembers({ companyId }, now);
}

/**
 * Members as rows, for one workspace or (no `companyId`) every workspace:
 * each with their state, their last sign-in and whether they are the owner.
 * Three queries however many workspaces there are.
 */
export async function readMembers(
  scope: { companyId?: string },
  now = new Date(),
): Promise<Array<MemberRow & { workspace: MemberWorkspace }>> {
  const users = await prisma.user.findMany({
    where: scope.companyId ? { companyId: scope.companyId } : {},
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
      companyId: true,
      company: { select: { id: true, name: true, slug: true, product: true } },
      retailTillPin: { select: { lockedAt: true } },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  const emails = Array.from(new Set(users.flatMap((user) => (user.email ? [user.email.trim().toLowerCase()] : []))));
  const [signIns, invites] = await Promise.all([
    emails.length
      ? prisma.platformAuditEvent.groupBy({
          by: ["companyId", "actor"],
          where: {
            ...(scope.companyId ? { companyId: scope.companyId } : {}),
            eventType: LOGIN_SUCCESS_EVENT,
            actor: { in: emails },
          },
          _max: { createdAt: true },
        })
      : Promise.resolve([]),
    prisma.retailStaffInvite.findMany({
      where: { ...(scope.companyId ? { companyId: scope.companyId } : {}), acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      select: { userId: true },
    }),
  ]);
  const lastSignIn = new Map<string, Date>();
  for (const row of signIns) {
    if (row.actor && row._max.createdAt) lastSignIn.set(`${row.companyId}:${row.actor}`, row._max.createdAt);
  }
  const invited = new Set(invites.map((invite) => invite.userId));
  // The owner is the first active top-role holder: the one who signed up, or whom the workspace was set up for.
  const owners = new Map<string, { id: string; at: number }>();
  for (const user of users) {
    if (!user.isActive || user.role !== "SUPERADMIN") continue;
    const held = owners.get(user.companyId);
    if (!held || user.createdAt.getTime() < held.at) owners.set(user.companyId, { id: user.id, at: user.createdAt.getTime() });
  }

  return users.map((user) => {
    const signedIn = user.email ? (lastSignIn.get(`${user.companyId}:${user.email.trim().toLowerCase()}`) ?? null) : null;
    const state: MemberState = !user.isActive
      ? "Access removed"
      : user.retailTillPin?.lockedAt
        ? "Till PIN locked"
        : invited.has(user.id)
          ? "Invited"
          : signedIn
            ? "Active"
            : "Never signed in";
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      roleLabel: roleLabel(user.role),
      isOwner: user.id === owners.get(user.companyId)?.id,
      state,
      lastSignInAt: signedIn,
      addedAt: user.createdAt,
      workspace: user.company,
    };
  });
}

/** The roles a member of this workspace may hold: its profile's, plus what its features add. */
export async function roleOptions(company: { id: string; workspaceProfile: string }) {
  return getAllowedUserRoleOptionsForWorkspace({
    workspaceProfile: company.workspaceProfile,
    enabledFeatures: await getEnabledFeatureKeys(company.id),
  });
}
