"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import type { InviteChannel, UserRole } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { changeUserPermission, PermissionChangeRefused } from "@/lib/platform/change-permission";
import type { PermissionState } from "@/lib/platform/permission-catalog";
import { getUserPermissionCatalog } from "@/lib/platform/permission-catalog";
import { prisma } from "@/lib/prisma";
import { landingFor } from "@/lib/teams/words";
import { deliverInvite } from "@/lib/teams/deliver";
import { TeamsRefusal, type TeamsRefusalCode } from "@/lib/teams/errors";
import { createInvite, markNotDelivered, resendInvite, revokeInvite } from "@/lib/teams/invites";
import { changeMemberRole, removeMember, restoreMember, suspendMember } from "@/lib/teams/members";
import { acceptOwnership, declineOwnership, offerOwnership } from "@/lib/teams/ownership";
import { addSeatForRequest, declineSeatRequest, removeSeatRequest } from "@/lib/teams/seat-requests";
import { requestSeat, setSeatLimit } from "@/lib/teams/seats";

/**
 * What the Members screens do. Each one reads who is asking from the session, calls the one function in
 * `lib/teams` that makes the change (which checks who may and writes the audit line), and answers with
 * either `ok` or the refusal's code and plain message. Nothing here writes a table.
 */

export type Done<T = object> =
  | ({ ok: true } & T)
  | { ok: false; code: TeamsRefusalCode | "CONFLICT" | "SIGNED_OUT" | "FAILED"; message: string; by?: string; state?: PermissionState };

/** Someone else set the same permission while this page was open. */
class Conflict extends Error {
  constructor(
    message: string,
    readonly by: string,
    readonly state: PermissionState,
  ) {
    super(message);
  }
}

async function who() {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; companyId?: string; role?: string; name?: string } | undefined;
  if (!user?.id || !user.companyId) return null;
  return { companyId: user.companyId, userId: user.id, role: user.role ?? "", name: user.name ?? "" };
}

async function run<T extends object = object>(work: (actor: NonNullable<Awaited<ReturnType<typeof who>>>) => Promise<T | void>): Promise<Done<T>> {
  const actor = await who();
  if (!actor) return { ok: false, code: "SIGNED_OUT", message: "Sign in again to carry on." };
  try {
    const result = await work(actor);
    revalidatePath("/preferences/organization/users", "layout");
    return { ok: true, ...((result ?? {}) as T) };
  } catch (error) {
    if (error instanceof Conflict) return { ok: false, code: "CONFLICT", message: error.message, by: error.by, state: error.state };
    if (error instanceof TeamsRefusal) return { ok: false, code: error.code, message: error.message };
    if (error instanceof PermissionChangeRefused) return { ok: false, code: "NOT_ALLOWED", message: error.message };
    console.error("[teams] action failed", error);
    return { ok: false, code: "FAILED", message: "That did not go through. Try again." };
  }
}

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.includes(".local") ? "http" : "https");
  return `${proto}://${host}`;
}

async function send(actor: { companyId: string; userId: string; name: string }, invite: { id: string; channel: InviteChannel; phone: string | null; email: string | null }, token: string) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: actor.companyId }, select: { name: true } });
  const inviter = await prisma.workspaceInvite.findUniqueOrThrow({ where: { id: invite.id }, select: { invitedById: true } });
  const by = await prisma.user.findUnique({ where: { id: inviter.invitedById }, select: { name: true } });
  const delivery = await deliverInvite({ ...invite, workspace: company.name, invitedBy: by?.name ?? actor.name, origin: await origin(), token });
  if (!delivery.ok) await markNotDelivered(actor.companyId, invite.id, delivery.reason);
  return delivery.ok;
}

// People.

export async function changeRoleAction(membershipId: string, role: UserRole): Promise<Done> {
  return run(async (actor) => {
    await changeMemberRole(actor, membershipId, role);
  });
}

export async function setPermissionAction(input: { userId: string; key: string; state: PermissionState; expected: PermissionState }): Promise<Done> {
  return run(async (actor) => {
    const target = await prisma.user.findFirst({ where: { id: input.userId, companyId: actor.companyId }, select: { role: true } });
    if (!target) throw new TeamsRefusal("NOT_FOUND", "That person is not in this workspace.");
    const groups = await getUserPermissionCatalog({ companyId: actor.companyId, userId: input.userId, role: target.role });
    const now = groups.flatMap((g) => g.entries).find((entry) => entry.key === input.key)?.state ?? "DEFAULT";
    if (now !== input.expected && now !== input.state) {
      // Someone else moved it while this page was open: say who and when, and let the person choose.
      const last = await prisma.platformAuditEvent.findFirst({
        where: { companyId: actor.companyId, eventType: "teams.permission.changed", actor: { not: actor.userId }, payloadJson: { contains: `"key":"${input.key}"` } },
        orderBy: { createdAt: "desc" },
      });
      const by = (last?.actor ? (await prisma.user.findUnique({ where: { id: last.actor }, select: { name: true } }))?.name : null)?.split(" ")[0] ?? "Someone";
      const time = (last?.createdAt ?? new Date()).toLocaleTimeString("en-GB", { timeZone: "Africa/Harare", hour: "2-digit", minute: "2-digit" });
      throw new Conflict(`${by} set ${now === "ALLOW" ? "Allowed" : now === "DENY" ? "Denied" : "Role default"} at ${time}`, by, now);
    }
    await changeUserPermission({ companyId: actor.companyId, userId: actor.userId, role: actor.role }, { userId: input.userId, kind: "CAPABILITY", key: input.key, state: input.state });
  });
}

export async function suspendAction(membershipId: string, until: string | null, handTo?: string): Promise<Done> {
  return run(async (actor) => {
    await suspendMember(actor, membershipId, new Date(), { until: until ? new Date(`${until}T00:00:00+02:00`) : null, handTo });
  });
}

export async function restoreAction(membershipId: string): Promise<Done> {
  return run(async (actor) => {
    await restoreMember(actor, membershipId);
  });
}

export async function removeAction(membershipId: string, handTo?: string): Promise<Done> {
  return run(async (actor) => {
    await removeMember(actor, membershipId, { handTo });
  });
}

export async function offerOwnershipAction(membershipId: string): Promise<Done> {
  return run(async (actor) => {
    await offerOwnership(actor, membershipId);
  });
}

export async function acceptOwnershipAction(offerId: string): Promise<Done> {
  return run(async (actor) => {
    await acceptOwnership(actor, offerId);
  });
}

export async function declineOwnershipAction(offerId: string): Promise<Done> {
  return run(async (actor) => {
    await declineOwnership(actor, offerId);
  });
}

// Invites and seats.

export type InviteInput = { name: string; phone?: string; email?: string; role: UserRole };

export async function inviteAction(input: InviteInput): Promise<Done<{ delivered: boolean }>> {
  return run(async (actor) => {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: actor.companyId }, select: { product: true } });
    const { invite, token } = await createInvite(actor, { name: input.name, phone: input.phone || null, email: input.email || null, role: input.role, landsOn: landingFor(company.product) });
    return { delivered: await send(actor, invite, token) };
  });
}

export async function askForSeatAction(input: InviteInput): Promise<Done> {
  return run(async (actor) => {
    await requestSeat(actor, { name: input.name, role: input.role, phone: input.phone || null, email: input.email || null });
  });
}

export async function addSeatAction(ref: string): Promise<Done<{ delivered: boolean }>> {
  return run(async (actor) => {
    const { inviteId, token } = await addSeatForRequest(actor, ref);
    const invite = await prisma.workspaceInvite.findUniqueOrThrow({ where: { id: inviteId } });
    return { delivered: await send(actor, invite, token) };
  });
}

export async function notNowAction(ref: string): Promise<Done> {
  return run(async (actor) => {
    await declineSeatRequest(actor, ref);
  });
}

export async function removeRequestAction(ref: string): Promise<Done> {
  return run(async (actor) => {
    await removeSeatRequest(actor, ref);
  });
}

export async function addSeatOnlyAction(): Promise<Done> {
  return run(async (actor) => {
    const company = await prisma.company.findUniqueOrThrow({ where: { id: actor.companyId }, select: { seatLimit: true } });
    await setSeatLimit(actor, company.seatLimit + 1);
  });
}

export async function sendAgainAction(inviteId: string, change?: { phone?: string; email?: string; channel?: InviteChannel }): Promise<Done<{ delivered: boolean }>> {
  return run(async (actor) => {
    const { invite, token } = await resendInvite(actor, inviteId, change ?? {});
    return { delivered: await send(actor, invite, token) };
  });
}

export async function revokeAction(inviteId: string): Promise<Done> {
  return run(async (actor) => {
    await revokeInvite(actor, inviteId);
  });
}
