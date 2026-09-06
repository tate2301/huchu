/**
 * What each role can do in the CRM, written down in one place.
 *
 * The rules already existed, scattered across route handlers as `if (!manager)
 * return 403`. Collecting them here means the answer to "why can't I do this?"
 * is a table somebody can read, and the settings screen can show the same
 * table rather than a second, drifting description of it.
 */
import type { AuthenticatedSession } from "@corelithzw/platform/auth-core/types";
import { prisma } from "@corelithzw/db/client";
import {
  CRM_CAPABILITIES,
  CRM_CAPABILITY_LABELS,
  MANAGER_CAPABILITIES,
  REP_CAPABILITIES,
  capabilitiesForRole,
  type CrmCapability,
} from "./capabilities";

export {
  CRM_CAPABILITIES,
  CRM_CAPABILITY_LABELS,
  CRM_CAPABILITY_NOTES,
  CRM_CAPABILITY_SET,
  capabilitiesForRole,
  type CrmCapability,
} from "./capabilities";

export function can(session: AuthenticatedSession, capability: CrmCapability): boolean {
  return capabilitiesForRole(session.user.role).has(capability);
}

/**
 * The same question, but honouring what an admin decided about this person.
 *
 * Roles answer for most people most of the time, which is why `can` still
 * exists and why the override table is usually empty. When an admin has said
 * something specific — this rep may not export, that coordinator may merge —
 * their answer wins over the role's.
 */
export async function canUser(
  session: AuthenticatedSession,
  capability: CrmCapability,
): Promise<boolean> {
  const roleDefault = can(session, capability);

  const override = await prisma.userPermissionOverride.findUnique({
    where: {
      userId_permissionKey: {
        userId: session.user.id,
        permissionKey: capability,
      },
    },
    select: { isAllowed: true },
  });

  return override ? override.isAllowed : roleDefault;
}

/**
 * Several answers in one query.
 *
 * A route that needs two or three capabilities should not make two or three
 * round trips for them. Returns a predicate, so call sites read the same as
 * `canUser` does.
 */
export async function canUserAll(
  session: AuthenticatedSession,
  capabilities: readonly CrmCapability[],
): Promise<(capability: CrmCapability) => boolean> {
  const overrides = await prisma.userPermissionOverride.findMany({
    where: { userId: session.user.id, permissionKey: { in: [...capabilities] } },
    select: { permissionKey: true, isAllowed: true },
  });
  const decided = new Map(overrides.map((row) => [row.permissionKey, row.isAllowed]));

  return (capability) => {
    const override = decided.get(capability);
    return override === undefined ? can(session, capability) : override;
  };
}

/**
 * Whether this session may edit a record currently assigned to `assignedToId`.
 *
 * Two capabilities, in order: editing anybody's record answers on its own;
 * failing that, editing your own answers for a record that is yours or that
 * nobody has claimed. Both go through the override table, so an admin who
 * takes "edit anybody's records" away from a manager has actually taken it
 * away rather than greyed out a button.
 */
export async function canEditRecord(
  session: AuthenticatedSession,
  assignedToId: string | null | undefined,
): Promise<boolean> {
  return (await recordEditor(session))(assignedToId);
}

/**
 * The same test, resolved once and then applied to many records.
 *
 * A bulk action decides for a hundred rows at a time; asking the override
 * table a hundred times to learn two booleans is a hundred queries for no
 * reason.
 */
export async function recordEditor(
  session: AuthenticatedSession,
): Promise<(assignedToId: string | null | undefined) => boolean> {
  const allows = await canUserAll(session, ["records.edit.any", "records.edit.own"]);
  const any = allows("records.edit.any");
  const own = allows("records.edit.own");

  return (assignedToId) => {
    if (any) return true;
    if (assignedToId && assignedToId !== session.user.id) return false;
    return own;
  };
}

/**
 * The reason to show when something is refused. A 403 that says "forbidden"
 * sends the person to support; one that names the role sends them to their
 * manager, which is where the answer actually is.
 */
export function denialMessage(capability: CrmCapability): string {
  return `You do not have permission to ${CRM_CAPABILITY_LABELS[capability].toLowerCase()}. An admin or manager can grant it under Settings → Users.`;
}

/** The matrix, for the settings screen. */
export function permissionMatrix(): {
  capability: CrmCapability;
  label: string;
  manager: boolean;
  rep: boolean;
}[] {
  return CRM_CAPABILITIES.map((capability) => ({
    capability,
    label: CRM_CAPABILITY_LABELS[capability],
    manager: MANAGER_CAPABILITIES.has(capability),
    rep: REP_CAPABILITIES.has(capability),
  }));
}
