import type { Prisma, UserRole } from "@prisma/client";

import { roleLabel, roleOptions } from "@/lib/admin/members";
import { AdminRefusal } from "@/lib/admin/refusal";
import { recordOperatorEvent } from "@/lib/operators/audit";
import type { SignedInOperator } from "@/lib/operators/guards";
import { prisma } from "@/lib/prisma";
import { endSignInAsForMember } from "@/lib/sign-in-as/sessions";

/**
 * What an operator may do to one member of one workspace.
 *
 * Every function takes the workspace the operator is in — read from the URL by
 * the caller — and refuses a member who is not in it. Each change and its
 * audit line commit together, on that workspace's chain, so the customer's own
 * audit log shows what Corelith staff did and who did it.
 */


export type WorkspaceRef = { id: string; name: string; workspaceProfile: string };

async function memberOf(tx: Prisma.TransactionClient, workspace: WorkspaceRef, memberId: string) {
  const member = await tx.user.findFirst({
    where: { id: memberId, companyId: workspace.id },
    select: { id: true, name: true, role: true, isActive: true },
  });
  if (!member) throw new AdminRefusal(`That member is not in ${workspace.name}.`);
  return member;
}

/** Whether this member is the workspace's only active top-role holder. */
async function isLastOwner(tx: Prisma.TransactionClient, workspaceId: string, memberId: string) {
  const others = await tx.user.count({
    where: { companyId: workspaceId, role: "SUPERADMIN", isActive: true, id: { not: memberId } },
  });
  return others === 0;
}

export async function changeMemberRole(operator: SignedInOperator, workspace: WorkspaceRef, memberId: string, role: UserRole) {
  const allowed = await roleOptions(workspace);
  if (!allowed.some((option) => option.value === role)) {
    throw new AdminRefusal(`${roleLabel(role)} is not a role in ${workspace.name}.`);
  }
  await prisma.$transaction(async (tx) => {
    const member = await memberOf(tx, workspace, memberId);
    if (member.role === role) return;
    if (member.role === "SUPERADMIN" && (await isLastOwner(tx, workspace.id, member.id))) {
      throw new AdminRefusal(`${member.name} is the only owner of ${workspace.name}. Make someone else an owner first.`);
    }
    await tx.user.update({ where: { id: member.id }, data: { role } });
    // A new role starts from that role's features, as it does in the product.
    await tx.userFeatureFlag.deleteMany({ where: { userId: member.id } });
    await recordOperatorEvent(
      {
        operatorId: operator.id,
        companyId: workspace.id,
        eventType: "operator.member.role_changed",
        entityType: "user",
        entityId: member.id,
        payload: { member: member.name, from: roleLabel(member.role), to: roleLabel(role) },
      },
      tx,
    );
  });
}

export async function signMemberOutEverywhere(operator: SignedInOperator, workspace: WorkspaceRef, memberId: string, now = new Date()) {
  await prisma.$transaction(async (tx) => {
    const member = await memberOf(tx, workspace, memberId);
    await tx.user.update({ where: { id: member.id }, data: { sessionsEndedAt: now } });
    await recordOperatorEvent(
      {
        operatorId: operator.id,
        companyId: workspace.id,
        eventType: "operator.member.signed_out",
        entityType: "user",
        entityId: member.id,
        payload: { member: member.name },
      },
      tx,
    );
  });
  await endSignInAsForMember(memberId, now);
}

export async function removeMemberAccess(
  operator: SignedInOperator,
  workspace: WorkspaceRef,
  memberId: string,
  reason: string,
  now = new Date(),
) {
  const why = reason.trim();
  if (why.length < 3) throw new AdminRefusal("Say why, so the owner can see it in their audit log.");
  await prisma.$transaction(async (tx) => {
    const member = await memberOf(tx, workspace, memberId);
    if (!member.isActive) return;
    if (member.role === "SUPERADMIN" && (await isLastOwner(tx, workspace.id, member.id))) {
      throw new AdminRefusal(`${member.name} is the only owner of ${workspace.name}. Suspend the workspace instead.`);
    }
    // Inactive ends every session on the next request (`enrichTokenClaims`),
    // and stops the password, the emailed code and the till PIN alike.
    await tx.user.update({
      where: { id: member.id },
      data: { isActive: false, accessRemovedAt: now, accessRemovedById: null, sessionsEndedAt: now },
    });
    await tx.retailStaffInvite.updateMany({
      where: { userId: member.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    await recordOperatorEvent(
      {
        operatorId: operator.id,
        companyId: workspace.id,
        eventType: "operator.member.access_removed",
        entityType: "user",
        entityId: member.id,
        reason: why,
        payload: { member: member.name },
      },
      tx,
    );
  });
  await endSignInAsForMember(memberId, now);
}

export async function giveMemberAccessBack(operator: SignedInOperator, workspace: WorkspaceRef, memberId: string) {
  await prisma.$transaction(async (tx) => {
    const member = await memberOf(tx, workspace, memberId);
    if (member.isActive) return;
    await tx.user.update({
      where: { id: member.id },
      data: { isActive: true, accessRemovedAt: null, accessRemovedById: null },
    });
    await recordOperatorEvent(
      {
        operatorId: operator.id,
        companyId: workspace.id,
        eventType: "operator.member.access_restored",
        entityType: "user",
        entityId: member.id,
        payload: { member: member.name },
      },
      tx,
    );
  });
}
