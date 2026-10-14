import type { UserRole } from "@prisma/client";

import { findLastSignInByEmail } from "@/lib/auth-core/last-sign-in";
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

export async function listMembers(companyId: string, now = new Date()): Promise<MemberRow[]> {
  const users = await prisma.user.findMany({
    where: { companyId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      createdAt: true,
      retailTillPin: { select: { lockedAt: true } },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  const [lastSignIn, invites] = await Promise.all([
    findLastSignInByEmail({ companyId, emails: users.flatMap((user) => (user.email ? [user.email] : [])) }),
    prisma.retailStaffInvite.findMany({
      where: { companyId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      select: { userId: true },
    }),
  ]);
  const invited = new Set(invites.map((invite) => invite.userId));
  const owner = users
    .filter((user) => user.isActive && user.role === "SUPERADMIN")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];

  return users.map((user) => {
    const signedIn = user.email ? (lastSignIn.get(user.email.toLowerCase()) ?? null) : null;
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
      isOwner: user.id === owner?.id,
      state,
      lastSignInAt: signedIn,
      addedAt: user.createdAt,
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
