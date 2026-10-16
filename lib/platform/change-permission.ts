import { prisma } from "@/lib/prisma";

import { countOverrides, getUserPermissionCatalog, setUserPermission, type PermissionKind, type PermissionState } from "./permission-catalog";
import { appendUserManagementEvent } from "./user-management-events";

/**
 * Changes what one person may do (Settings → Users → their permissions): a
 * feature or a CRM capability allowed, denied, or back to their role's
 * default. A manager or an admin may; nobody changes their own; only an admin
 * changes an admin's. Recorded on the workspace's record of user changes.
 * Shared by `POST /api/users/permissions` and `people.permission.set`.
 */

/** Why the change was refused, with the status the route answers. */
export class PermissionChangeRefused extends Error {
  constructor(
    readonly status: 400 | 403 | 404,
    message: string,
  ) {
    super(message);
    this.name = "PermissionChangeRefused";
  }
}

export function mayManagePermissions(role: string): boolean {
  return role === "SUPERADMIN" || role === "MANAGER";
}

export async function changeUserPermission(
  actor: { companyId: string; userId: string; role: string },
  change: { userId: string; kind: PermissionKind; key: string; state: PermissionState },
) {
  if (!mayManagePermissions(actor.role)) throw new PermissionChangeRefused(403, "Only an admin or manager can change user permissions.");
  const user = await prisma.user.findFirst({
    where: { id: change.userId, companyId: actor.companyId },
    select: { id: true, role: true, name: true, email: true },
  });
  if (!user) throw new PermissionChangeRefused(404, "That person is not in this workspace.");
  // Somebody editing their own permissions can only ever go one way in
  // practice, and it is the way that removes the check that stopped them.
  if (user.id === actor.userId) throw new PermissionChangeRefused(400, "You cannot change your own permissions.");
  if (user.role === "SUPERADMIN" && actor.role !== "SUPERADMIN") throw new PermissionChangeRefused(403, "Only a superadmin can change a superadmin's permissions.");

  try {
    await setUserPermission({ companyId: actor.companyId, userId: user.id, role: user.role, kind: change.kind, key: change.key, state: change.state, actorId: actor.userId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FEATURE_NOT_ENABLED_FOR_COMPANY") throw new PermissionChangeRefused(400, "That feature is not enabled for this company.");
    if (message === "UNKNOWN_PERMISSION_KEY") throw new PermissionChangeRefused(400, "Unknown permission.");
    throw error;
  }

  const groups = await getUserPermissionCatalog({ companyId: actor.companyId, userId: user.id, role: user.role });
  const permission = groups.flatMap((group) => group.entries).find((entry) => entry.kind === change.kind && entry.key === change.key) ?? null;
  await appendUserManagementEvent({
    companyId: actor.companyId,
    actorId: actor.userId,
    actorRole: actor.role,
    eventType: "USER_SET_PERMISSION",
    message: `Set ${change.key} to ${change.state.toLowerCase()} for ${user.email}`,
    payload: { userId: user.id, targetRole: user.role, permissionKey: change.key, permissionKind: change.kind, state: change.state },
  });
  return { user, groups, overrideCount: countOverrides(groups), permission };
}
