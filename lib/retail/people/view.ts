import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";

import { lastSeenFor } from "./last-seen";
import {
  isOwnerLevel,
  mayChangeRole,
  PEOPLE_USER_ROLES,
  PERSON_ROLE_LABELS,
  personRoleOf,
  rolesCallerMayGive,
  type PersonRole,
} from "./roles";
import {
  lastInWord,
  personState,
  personSub,
  phoneDisplay,
  PIN_COLUMN,
  pinLockedAt,
  pinState,
  pinText,
  sitesLabel,
  STATE_LABELS,
  type PersonState,
  type PinState,
} from "./words";

/**
 * A person as People shows them (80-admin 4.1 `PersonView`): read for the
 * list, the sheet and every People answer, from one query shape.
 */

export type PersonView = {
  id: string;
  name: string;
  phone: string | null;
  phoneDisplay: string;
  email: string | null;
  role: PersonRole;
  roleLabel: string;
  sites: { all: true } | { all: false; ids: string[]; names: string[] };
  sitesLabel: string;
  state: PersonState;
  stateLabel: string;
  pin: { state: PinState; column: string; lockedAt: string | null; lastUsedAt: string | null; text: string };
  invite: { sentAt: string; expiresAt: string; acceptedAt: string | null } | null;
  accessRemoved: { at: string; byName: string } | null;
  lastSeenAt: string | null;
  lastIn: string;
  sub: string;
  /** Their open shifts, for the Remove access ask ("SH-00244 on Back till"). */
  openShifts: Array<{ shiftNo: string; registerName: string }>;
  can: {
    edit: boolean;
    roles: PersonRole[];
    sendPin: boolean;
    removeAccess: boolean;
    giveAccessBack: boolean;
    inviteAgain: boolean;
  };
};

/** Who is looking: their id and the role key they are measured with. */
export type Viewer = { userId: string; roleKey: string | null };

const PERSON_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  allSites: true,
  accessRemovedAt: true,
  accessRemovedBy: { select: { name: true } },
  siteAccess: { select: { site: { select: { id: true, name: true } } } },
  retailTillPin: {
    select: { failedAttempts: true, lockedAt: true, mustChange: true, issuedAt: true, lastUnlockedAt: true },
  },
  staffInvites: {
    where: { revokedAt: null },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { createdAt: true, expiresAt: true, acceptedAt: true },
  },
  retailShifts: {
    where: { status: "OPEN" },
    orderBy: { openedAt: "asc" },
    select: { shiftNo: true, registerName: true },
  },
} satisfies Prisma.UserSelect;

type PersonRow = Prisma.UserGetPayload<{ select: typeof PERSON_SELECT }>;

function toView(row: PersonRow, viewer: Viewer, seenAt: Date | null, now: Date): PersonView | null {
  const role = personRoleOf(row.role);
  if (!role) return null;
  const pin = row.retailTillPin;
  const pinNow = pinState(pin);
  const invite = row.staffInvites[0] ?? null;
  const state = personState({ isActive: row.isActive, invite, pin: pinNow, now });
  const names = row.siteAccess.map((access) => access.site.name).sort((a, b) => a.localeCompare(b));
  const sites = row.allSites
    ? ({ all: true } as const)
    : ({ all: false, ids: row.siteAccess.map((access) => access.site.id), names } as const);
  const label = sitesLabel({ all: row.allSites, names });
  const removedAt = row.isActive ? null : row.accessRemovedAt;
  const lockedAt = pinLockedAt(pin);
  const lastUsed = pin?.lastUnlockedAt ?? null;
  const lastSeen = [seenAt, lastUsed].reduce<Date | null>(
    (latest, at) => (at && (!latest || at.getTime() > latest.getTime()) ? at : latest),
    null,
  );

  const self = row.id === viewer.userId;
  const ownerLevel = isOwnerLevel(viewer.roleKey);
  const mayChange = row.isActive && mayChangeRole(viewer.roleKey, role);
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    phoneDisplay: phoneDisplay(row.phone),
    email: row.email,
    role,
    roleLabel: PERSON_ROLE_LABELS[role],
    sites,
    sitesLabel: label,
    state,
    stateLabel: STATE_LABELS[state],
    pin: {
      state: pinNow,
      column: row.isActive ? PIN_COLUMN[pinNow] : "",
      lockedAt: lockedAt?.toISOString() ?? null,
      lastUsedAt: lastUsed?.toISOString() ?? null,
      text: pinText(pin, now, removedAt),
    },
    invite: invite
      ? {
          sentAt: invite.createdAt.toISOString(),
          expiresAt: invite.expiresAt.toISOString(),
          acceptedAt: invite.acceptedAt?.toISOString() ?? null,
        }
      : null,
    accessRemoved: removedAt ? { at: removedAt.toISOString(), byName: row.accessRemovedBy?.name ?? "" } : null,
    lastSeenAt: lastSeen?.toISOString() ?? null,
    lastIn: lastInWord({
      isViewer: self,
      state,
      invitedAt: invite?.createdAt ?? null,
      lastSeenAt: lastSeen,
      pinUsedAt: lastUsed,
      now,
    }),
    sub: personSub({ role, sites: label, state, pin: pinNow, invitedAt: invite?.createdAt ?? null, removedAt }),
    openShifts: row.retailShifts,
    can: {
      edit: mayChange,
      roles: mayChange && !self ? rolesCallerMayGive(viewer.roleKey) : [],
      sendPin: mayChange,
      removeAccess: ownerLevel && row.isActive && !self,
      giveAccessBack: ownerLevel && !row.isActive,
      inviteAgain: mayChange && (state === "INVITED" || state === "INVITE_EXPIRED"),
    },
  };
}

/** Every person of the shop (or the ids given), as the viewer sees them. */
export async function loadPeople(
  companyId: string,
  viewer: Viewer,
  options: { ids?: string[]; now?: Date; client?: Prisma.TransactionClient } = {},
): Promise<PersonView[]> {
  const client = options.client ?? prisma;
  const now = options.now ?? new Date();
  const rows = await client.user.findMany({
    where: {
      companyId,
      role: { in: PEOPLE_USER_ROLES },
      ...(options.ids ? { id: { in: options.ids } } : {}),
    },
    orderBy: [{ name: "asc" }],
    select: PERSON_SELECT,
  });
  const seen = await lastSeenFor(companyId, rows);
  return rows.flatMap((row) => {
    const view = toView(row, viewer, seen.get(row.id) ?? null, now);
    return view ? [view] : [];
  });
}

export async function loadPerson(
  companyId: string,
  viewer: Viewer,
  id: string,
  options: { now?: Date } = {},
): Promise<PersonView | null> {
  const [view] = await loadPeople(companyId, viewer, { ids: [id], now: options.now });
  return view ?? null;
}

/** Whether a role key may see People at all. */
export function canViewPeople(roleKey: string | null): boolean {
  return canRetailRoleDo(roleKey, "retail.people", "view");
}
