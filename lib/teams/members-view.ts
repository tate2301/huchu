import type { InviteChannel, InviteStatus, MembershipStatus, UserRole, WorkspaceProduct } from "@prisma/client";

import { LOGIN_SUCCESS_EVENT } from "@/lib/auth-core/last-sign-in";
import { CRM_CAPABILITIES, type CrmCapability } from "@/lib/crm/permissions";
import { getUserPermissionCatalog, type PermissionState } from "@/lib/platform/permission-catalog";
import { verticalRate } from "@/lib/platform/verticals";
import { prisma } from "@/lib/prisma";

import { TEAMS_EVENT_PREFIX } from "./audit";
import { expireInvites } from "./invites";
import { lapseOwnershipOffers } from "./ownership";
import { ownedRecordCount } from "./record-team";
import { seatLine, type SeatLine } from "./seats";
import { listSeatRequests, type SeatRequest } from "./seat-requests";
import { PERMISSION_ROWS, noun, type PermissionRowDef } from "./permission-words";
import { dayLong, jobsFor, roleWord } from "./words";

/**
 * What Members and a member's page read: the people, the invites holding seats, the seat line, and for one
 * member their access with who changed it. Read only; every change goes through the other files in this folder.
 */

export type Viewer = { userId: string; membershipId: string; isOwner: boolean; isAdmin: boolean; name: string };

export type MemberItem = {
  membershipId: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
  roleWord: string;
  isOwner: boolean;
  isAdmin: boolean;
  isYou: boolean;
  status: MembershipStatus;
  /** Last sign-in. */
  lastHere: string | null;
  joinedAt: string;
  /** When a suspension is due to end, from the audit line that made it. */
  until: string | null;
  suspendedAt: string | null;
  /** Deals and leads they own, for the hand-over. */
  deals: number;
};

export type InviteItem = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  roleWord: string;
  channel: InviteChannel;
  status: InviteStatus;
  sentAt: string;
  expiresAt: string;
  invitedBy: string;
};

export type MembersPage = {
  company: { id: string; name: string; product: WorkspaceProduct; seatLimit: number };
  viewer: Viewer;
  owner: { name: string; membershipId: string } | null;
  seats: SeatLine;
  members: MemberItem[];
  invites: InviteItem[];
  requests: SeatRequest[];
  /** Jobs an admin can give here, in the order the select shows them. */
  jobs: Array<{ value: UserRole; label: string }>;
  openOffer: { id: string; toMembershipId: string; toName: string; expiresAt: string } | null;
};

export async function resolveViewer(companyId: string, userId: string): Promise<Viewer | null> {
  const held = await prisma.workspaceMembership.findFirst({
    where: { companyId, userId, status: "ACTIVE" },
    include: { user: { select: { name: true } } },
  });
  if (!held) return null;
  return { userId, membershipId: held.id, isOwner: held.isOwner, isAdmin: held.isAdmin, name: held.user.name };
}

async function lastSignIns(companyId: string, emails: string[]): Promise<Map<string, Date>> {
  if (emails.length === 0) return new Map();
  const rows = await prisma.platformAuditEvent.groupBy({
    by: ["actor"],
    where: { companyId, eventType: LOGIN_SUCCESS_EVENT, actor: { in: emails } },
    _max: { createdAt: true },
  });
  return new Map(rows.flatMap((row) => (row.actor && row._max.createdAt ? [[row.actor, row._max.createdAt] as const] : [])));
}

/** When each suspended member is due back: the `until` on the line that suspended them. */
async function suspensionEnds(companyId: string, membershipIds: string[]): Promise<Map<string, string>> {
  if (membershipIds.length === 0) return new Map();
  const events = await prisma.platformAuditEvent.findMany({
    where: { companyId, eventType: `${TEAMS_EVENT_PREFIX}member.suspended`, entityId: { in: membershipIds } },
    orderBy: { createdAt: "asc" },
    select: { entityId: true, payloadJson: true },
  });
  const ends = new Map<string, string>();
  for (const event of events) {
    if (!event.entityId) continue;
    const until = (JSON.parse(event.payloadJson ?? "{}") as { after?: { until?: string } }).after?.until;
    if (until) ends.set(event.entityId, until);
    else ends.delete(event.entityId);
  }
  return ends;
}

const RANK = (item: { isOwner: boolean; isAdmin: boolean }) => (item.isOwner ? 0 : item.isAdmin ? 1 : 2);

export async function loadMembersPage(companyId: string, viewer: Viewer, now = new Date()): Promise<MembersPage> {
  await Promise.all([expireInvites(now, companyId), lapseOwnershipOffers(now, companyId)]);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { id: true, name: true, product: true, seatLimit: true } });
  const [seats, rows, invites, requests, offer] = await Promise.all([
    seatLine(prisma, companyId, now),
    prisma.workspaceMembership.findMany({
      where: { companyId, status: { not: "INVITED" } },
      include: { user: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.workspaceInvite.findMany({
      where: { companyId, OR: [{ status: { in: ["SENT", "NOT_DELIVERED"] } }, { status: { in: ["EXPIRED", "REVOKED"] }, updatedAt: { gt: new Date(now.getTime() - 14 * 86_400_000) } }] },
      orderBy: { sentAt: "desc" },
    }),
    listSeatRequests(prisma, companyId),
    prisma.ownershipOffer.findFirst({ where: { companyId, status: "OPEN" }, include: { toMembership: { include: { user: { select: { name: true } } } } } }),
  ]);
  const inviters = await prisma.user.findMany({ where: { id: { in: [...new Set(invites.map((i) => i.invitedById))] } }, select: { id: true, name: true } });
  const emails = rows.flatMap((row) => (row.user.email ? [row.user.email.toLowerCase()] : []));
  const [signIns, ends] = await Promise.all([
    lastSignIns(companyId, emails),
    suspensionEnds(companyId, rows.filter((row) => row.status === "SUSPENDED").map((row) => row.id)),
  ]);

  const dealCounts = new Map(await Promise.all(rows.map(async (row) => [row.id, await ownedRecordCount(prisma, companyId, row.id)] as const)));
  const members: MemberItem[] = rows
    .map((row) => ({
      membershipId: row.id,
      userId: row.userId,
      name: row.user.name,
      email: row.user.email,
      phone: row.user.phone,
      role: row.role,
      roleWord: roleWord(row),
      isOwner: row.isOwner,
      isAdmin: row.isAdmin,
      isYou: row.userId === viewer.userId,
      status: row.status,
      lastHere: (row.user.email ? signIns.get(row.user.email.toLowerCase()) : undefined)?.toISOString() ?? null,
      joinedAt: row.createdAt.toISOString(),
      until: ends.get(row.id) ?? null,
      suspendedAt: row.suspendedAt?.toISOString() ?? null,
      deals: dealCounts.get(row.id) ?? 0,
    }))
    .sort((a, b) => RANK(a) - RANK(b) || a.joinedAt.localeCompare(b.joinedAt));

  const owner = members.find((member) => member.isOwner);
  return {
    company,
    viewer,
    owner: owner ? { name: owner.name, membershipId: owner.membershipId } : null,
    seats,
    members,
    invites: invites.map((invite) => ({
      id: invite.id,
      name: invite.name,
      email: invite.email,
      phone: invite.phone,
      role: invite.role,
      roleWord: roleWord({ role: invite.role, isOwner: false, isAdmin: invite.role === "SUPERADMIN" }),
      channel: invite.channel,
      status: invite.status,
      sentAt: invite.sentAt.toISOString(),
      expiresAt: invite.expiresAt.toISOString(),
      invitedBy: inviters.find((i) => i.id === invite.invitedById)?.name ?? "",
    })),
    requests,
    jobs: jobsFor(company.product).map((value) => ({ value, label: roleWord({ role: value, isOwner: false, isAdmin: false }) })),
    openOffer: offer ? { id: offer.id, toMembershipId: offer.toMembershipId, toName: offer.toMembership.user.name, expiresAt: offer.expiresAt.toISOString() } : null,
  };
}

// A member's page.

export type PermissionItem = {
  key: CrmCapability;
  kind: "CAPABILITY";
  label: string;
  group: string;
  roleDefault: boolean;
  state: PermissionState;
  /** Who set it and when, while it is set. */
  by: { name: string; at: string } | null;
};

export type Change = { id: string; at: string; actorName: string | null; text: string; tone: "plain" | "whatsapp" | "ok" };

export type MemberPage = MembersPage & {
  member: MemberItem;
  position: { index: number; total: number; previous: string | null; next: string | null };
  /** An admin or owner: every permission, nothing to set. */
  everything: boolean;
  permissions: PermissionItem[];
  changes: Change[];
  deals: { count: number; names: string[]; followUps: number };
  /** What the role and the person's state let the viewer do to them. */
  may: { role: boolean; admin: boolean; suspend: boolean; remove: boolean; offer: boolean; restore: boolean; permissions: boolean };
  /** "Only Sean can change an admin". */
  lockedBy: string | null;
  noun: string;
  billing: { product: WorkspaceProduct; perMonth: number };
};

export async function loadMemberPage(companyId: string, viewer: Viewer, membershipId: string, now = new Date()): Promise<MemberPage | null> {
  const page = await loadMembersPage(companyId, viewer, now);
  const index = page.members.findIndex((member) => member.membershipId === membershipId);
  if (index < 0) return null;
  const member = page.members[index];
  const everything = member.isOwner || member.isAdmin;

  const catalog = everything ? [] : await getUserPermissionCatalog({ companyId, userId: member.userId, role: member.role });
  const entries = new Map(catalog.flatMap((group) => group.entries).map((entry) => [entry.key, entry] as const));
  const events = await prisma.platformAuditEvent.findMany({
    where: { companyId, eventType: { startsWith: TEAMS_EVENT_PREFIX }, entityId: membershipId },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const actors = await prisma.user.findMany({ where: { id: { in: [...new Set(events.flatMap((e) => (e.actor ? [e.actor] : [])))] } }, select: { id: true, name: true } });
  const nameOf = (id: string | null) => actors.find((actor) => actor.id === id)?.name ?? null;
  const first = (full: string | null) => (full ? full.split(" ")[0] : "Someone");
  const target = first(member.name);

  const setBy = new Map<string, { name: string; at: string }>();
  const changes: Change[] = [];
  for (const event of events) {
    const body = JSON.parse(event.payloadJson ?? "{}") as { before?: Record<string, unknown> | null; after?: Record<string, unknown> | null };
    const after = body.after ?? {};
    const actor = first(nameOf(event.actor));
    const at = event.createdAt.toISOString();
    const type = event.eventType.slice(TEAMS_EVENT_PREFIX.length);
    let text: string | null = null;
    const tone: Change["tone"] = "plain";
    if (type === "permission.changed") {
      const def = PERMISSION_ROWS.find((row) => row.key === after.key);
      if (!def) continue;
      const state = after.state as PermissionState;
      text = state === "ALLOW" ? `${actor} allowed ${target} to ${def.allow}` : state === "DENY" ? `${actor} denied ${target} ${def.deny}` : `${actor} put ${def.label.toLowerCase()} back to the role default for ${target}`;
      if (state !== "DEFAULT" && !setBy.has(def.key)) setBy.set(def.key, { name: first(nameOf(event.actor)), at });
    } else if (type === "member.added") {
      text = `${actor} invited ${target} as ${article(roleWord({ role: (after.role as UserRole) ?? member.role, isOwner: false, isAdmin: after.role === "SUPERADMIN" }).toLowerCase())}`;
      if (after.reason === "invite_link") text = `${target} joined from the invite link`;
      else if (event.actor === null) text = `${target} joined`;
    } else if (type === "member.role_changed" || type === "member.admin_changed") {
      text = `${actor} made ${target} ${article(roleWord({ role: (after.role as UserRole) ?? member.role, isOwner: false, isAdmin: after.isAdmin === true }).toLowerCase())}`;
    } else if (type === "member.suspended") {
      text = `${actor} suspended ${target}${typeof after.until === "string" ? ` until ${dayLong(new Date(after.until))}` : ""}`;
    } else if (type === "member.restored") text = `${actor} restored ${target}`;
    else if (type === "member.removed") text = `${actor} removed ${target}`;
    if (text) changes.push({ id: event.id, at, actorName: nameOf(event.actor), text, tone });
  }

  const permissions: PermissionItem[] = everything
    ? []
    : PERMISSION_ROWS.flatMap((def: PermissionRowDef) => {
        const entry = entries.get(def.key);
        if (!entry || !(CRM_CAPABILITIES as readonly string[]).includes(def.key)) return [];
        return [{ key: def.key, kind: "CAPABILITY" as const, label: def.label, group: def.group, roleDefault: entry.roleDefault, state: entry.state, by: entry.state === "DEFAULT" ? null : (setBy.get(def.key) ?? null) }];
      });

  const owned = await ownedRecordCount(prisma, companyId, membershipId);
  const ownedRows = owned
    ? await prisma.recordTeamMember.findMany({ where: { companyId, membershipId, isOwner: true, subjectType: { in: ["LEAD", "DEAL"] } }, select: { subjectId: true }, take: 8 })
    : [];
  const dealNames = ownedRows.length
    ? (await prisma.crmLead.findMany({ where: { companyId, id: { in: ownedRows.map((row) => row.subjectId) } }, select: { title: true, leadNo: true } })).map((lead) => lead.title ?? lead.leadNo)
    : [];
  const followUps = await prisma.crmFollowUp.count({ where: { companyId, assignedToId: member.userId, status: "PENDING" } });

  const you = page.viewer;
  const mayManage = !member.isYou && !member.isOwner && (you.isOwner || (you.isAdmin && !member.isAdmin));
  const members = page.members.filter((m) => m.status !== "REMOVED");
  const at = members.findIndex((m) => m.membershipId === membershipId);
  return {
    ...page,
    member,
    position: { index: at + 1, total: members.length, previous: at > 0 ? members[at - 1].membershipId : null, next: at >= 0 && at < members.length - 1 ? members[at + 1].membershipId : null },
    everything,
    permissions,
    changes,
    deals: { count: owned, names: dealNames, followUps },
    may: {
      role: !member.isYou && !member.isOwner && member.status !== "REMOVED" && (you.isOwner || (you.isAdmin && !member.isAdmin)),
      admin: you.isOwner,
      suspend: mayManage && member.status === "ACTIVE",
      restore: mayManage && member.status === "SUSPENDED",
      remove: mayManage && member.status !== "REMOVED",
      offer: you.isOwner && !member.isYou && member.status === "ACTIVE",
      permissions: !member.isYou && !member.isOwner && !member.isAdmin && (you.isOwner || you.isAdmin),
    },
    lockedBy: member.isAdmin && !member.isOwner && !you.isOwner ? (page.owner?.name.split(" ")[0] ?? null) : null,
    noun: noun(page.company.product),
    billing: { product: page.company.product, perMonth: verticalRate(page.seats.used > page.seats.limit ? page.seats.used : page.seats.limit) },
  };
}

function article(word: string): string {
  return `${/^[aeiou]/.test(word) ? "an" : "a"} ${word}`;
}
