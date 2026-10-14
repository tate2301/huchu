import { createHash, randomBytes } from "node:crypto";

import type { OperatorRole } from "@prisma/client";

import { AdminRefusal } from "@/lib/admin/refusal";
import { prisma } from "@/lib/prisma";
import { recordOperatorEvent } from "@/lib/operators/audit";
import type { SignedInOperator } from "@/lib/operators/guards";
import { endEverySession, startPendingSession, type SessionMeta } from "@/lib/operators/session";
import { hashOperatorPassword, MIN_PASSWORD_LENGTH } from "@/lib/operators/sign-in";
import { OPERATOR_ROLE_LABEL } from "@/lib/operators/roles";

/**
 * Who works the portal, kept by its owners.
 *
 * An operator is invited by email to choose a password, and sets up their
 * authenticator the first time they sign in. A forgotten password is a new
 * invite; a lost phone is an authenticator reset. Both end every session the
 * operator has, so whoever has the old password or the old phone is out.
 */

export const INVITE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const OPERATOR_STATES = ["Active", "Invited", "Needs a second factor", "Locked", "Removed"] as const;
export type OperatorState = (typeof OPERATOR_STATES)[number];

export async function listOperators(now = new Date()) {
  const rows = await prisma.operator.findMany({
    orderBy: [{ deactivatedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      passwordHash: true,
      totpConfirmedAt: true,
      lockedUntil: true,
      lastSignInAt: true,
      deactivatedAt: true,
      inviteExpiresAt: true,
      createdAt: true,
    },
  });
  return rows.map(({ passwordHash, ...row }) => {
    const state: OperatorState = row.deactivatedAt
      ? "Removed"
      : !passwordHash
        ? "Invited"
        : row.lockedUntil && row.lockedUntil > now
          ? "Locked"
          : !row.totpConfirmedAt
            ? "Needs a second factor"
            : "Active";
    return { ...row, state, roleLabel: OPERATOR_ROLE_LABEL[row.role] };
  });
}

export type OperatorRow = Awaited<ReturnType<typeof listOperators>>[number];

async function issueInvite(operatorId: string, now: Date) {
  const token = randomBytes(32).toString("base64url");
  await prisma.operator.update({
    where: { id: operatorId },
    data: { inviteTokenHash: hash(token), inviteExpiresAt: new Date(now.getTime() + INVITE_TTL_MS) },
  });
  return token;
}

/** `owner` is null for the first owner, invited from the command line before anyone could. */
export async function inviteOperator(
  owner: SignedInOperator | null,
  input: { name: string; email: string; role: OperatorRole },
  now = new Date(),
) {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (name.length < 2) throw new AdminRefusal("Enter their name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AdminRefusal("Enter their work email.");
  if (await prisma.operator.findUnique({ where: { email }, select: { id: true } })) {
    throw new AdminRefusal(`${email} is an operator already. Send them a new invite from their row.`);
  }
  const operator = await prisma.operator.create({ data: { name, email, role: input.role } });
  const token = await issueInvite(operator.id, now);
  await recordOperatorEvent({
    operatorId: owner?.id ?? null,
    eventType: "operator.invited",
    entityType: "operator",
    entityId: operator.id,
    payload: { name, email, role: OPERATOR_ROLE_LABEL[input.role] },
  });
  return { operator, token };
}

async function others(operatorId: string, owner: SignedInOperator) {
  if (operatorId === owner.id) throw new AdminRefusal("Ask another owner to do this for you.");
  const operator = await prisma.operator.findUnique({ where: { id: operatorId } });
  if (!operator || operator.deactivatedAt) throw new AdminRefusal("That operator has been removed.");
  return operator;
}

/** A new invite link: their old password stops working and every session they have ends. */
export async function sendNewInvite(owner: SignedInOperator, operatorId: string, now = new Date()) {
  const operator = await others(operatorId, owner);
  await prisma.operator.update({ where: { id: operator.id }, data: { passwordHash: null, failedAttempts: 0, lockedUntil: null } });
  await endEverySession(operator.id, now);
  const token = await issueInvite(operator.id, now);
  await recordOperatorEvent({ operatorId: owner.id, eventType: "operator.invite_resent", entityType: "operator", entityId: operator.id, payload: { name: operator.name } });
  return { operator, token };
}

/** For a lost phone: their next sign-in sets up a new authenticator. */
export async function resetAuthenticator(owner: SignedInOperator, operatorId: string, now = new Date()) {
  const operator = await others(operatorId, owner);
  await prisma.operator.update({
    where: { id: operator.id },
    data: { totpSecret: null, totpConfirmedAt: null, totpLastStep: null, failedAttempts: 0, lockedUntil: null },
  });
  await endEverySession(operator.id, now);
  await recordOperatorEvent({ operatorId: owner.id, eventType: "operator.authenticator_reset", entityType: "operator", entityId: operator.id, payload: { name: operator.name } });
  return operator;
}

async function ownersLeft(excluding: string) {
  return prisma.operator.count({ where: { role: "OWNER", deactivatedAt: null, id: { not: excluding } } });
}

export async function changeOperatorRole(owner: SignedInOperator, operatorId: string, role: OperatorRole) {
  const operator = await others(operatorId, owner);
  if (operator.role === role) return operator;
  if (operator.role === "OWNER" && (await ownersLeft(operator.id)) === 0) throw new AdminRefusal("The portal needs at least one owner.");
  await prisma.operator.update({ where: { id: operator.id }, data: { role } });
  await recordOperatorEvent({
    operatorId: owner.id,
    eventType: "operator.role_changed",
    entityType: "operator",
    entityId: operator.id,
    payload: { name: operator.name, from: OPERATOR_ROLE_LABEL[operator.role], to: OPERATOR_ROLE_LABEL[role] },
  });
  return operator;
}

export async function removeOperator(owner: SignedInOperator, operatorId: string, now = new Date()) {
  const operator = await others(operatorId, owner);
  if (operator.role === "OWNER" && (await ownersLeft(operator.id)) === 0) throw new AdminRefusal("The portal needs at least one owner.");
  await prisma.operator.update({ where: { id: operator.id }, data: { deactivatedAt: now, inviteTokenHash: null, inviteExpiresAt: null } });
  await endEverySession(operator.id, now);
  await prisma.signInAsSession.updateMany({
    where: { operatorId: operator.id, endedAt: null, expiresAt: { gt: now } },
    data: { endedAt: now, endedBy: "OPERATOR" },
  });
  await recordOperatorEvent({ operatorId: owner.id, eventType: "operator.removed", entityType: "operator", entityId: operator.id, payload: { name: operator.name } });
  return operator;
}

/** Who an invite link is for, while it is good. */
export async function findInvite(token: string | null | undefined, now = new Date()) {
  const value = token?.trim();
  if (!value) return null;
  const operator = await prisma.operator.findUnique({
    where: { inviteTokenHash: hash(value) },
    select: { id: true, name: true, email: true, inviteExpiresAt: true, deactivatedAt: true, totpConfirmedAt: true },
  });
  if (!operator || operator.deactivatedAt || !operator.inviteExpiresAt || operator.inviteExpiresAt <= now) return null;
  return operator;
}

/** The invite spent: their password is set, and they go on to their authenticator. */
export async function acceptInvite(token: string, password: string, meta: SessionMeta, now = new Date()) {
  const operator = await findInvite(token, now);
  if (!operator) throw new AdminRefusal("This invite has been used or has run out. Ask an owner for a new one.");
  if (password.length < MIN_PASSWORD_LENGTH) throw new AdminRefusal(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
  await prisma.operator.update({
    where: { id: operator.id },
    data: { passwordHash: await hashOperatorPassword(password), inviteTokenHash: null, inviteExpiresAt: null, failedAttempts: 0, lockedUntil: null },
  });
  await recordOperatorEvent({ operatorId: operator.id, eventType: "operator.password_set", entityType: "operator", entityId: operator.id });
  const sessionToken = await startPendingSession(operator.id, meta, now);
  return { sessionToken, next: operator.totpConfirmedAt ? ("code" as const) : ("set-up" as const) };
}
