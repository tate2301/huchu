import { createHash, randomBytes } from "node:crypto";

import type { SignInAsEnd, SignInAsMode } from "@prisma/client";

import { AdminRefusal } from "@/lib/admin/refusal";
import { createSessionHandoff } from "@/lib/auth-core/session-handoff";
import { recordOperatorEvent } from "@/lib/operators/audit";
import type { SignedInOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";
import { prisma } from "@/lib/prisma";
import type { SignInAsClaim } from "@/lib/sign-in-as/limits";

/**
 * Signing in as a member: one step, with a reason, for 30 minutes.
 *
 * The session is a row here. The member's browser session that it opens
 * carries the row's id and is checked against it on every request, so ending
 * the row — by the operator, by the owner's link, or by time — ends the
 * session on its next click.
 */

export const SIGN_IN_AS_MS = 30 * 60 * 1000;
export const MIN_REASON = 10;

export function signInAsCode(number: number) {
  return `SA-${number}`;
}

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type SignInAsState = "Open, look only" | "Open, can make changes" | "Ended" | "Ended by the owner" | "Timed out";

export function signInAsState(
  row: { mode: SignInAsMode; expiresAt: Date; endedAt: Date | null; endedBy: SignInAsEnd | null },
  now = new Date(),
): SignInAsState {
  if (row.endedAt) return row.endedBy === "OWNER" ? "Ended by the owner" : "Ended";
  if (row.expiresAt <= now) return "Timed out";
  return row.mode === "LOOK" ? "Open, look only" : "Open, can make changes";
}

export async function startSignInAs(input: {
  operator: SignedInOperator;
  workspace: { id: string; name: string };
  memberId: string;
  mode: SignInAsMode;
  reason: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const reason = input.reason.trim();
  if (reason.length < MIN_REASON) {
    throw new AdminRefusal("Say why in a sentence. The owner is sent it, and it stays in their audit log.");
  }
  if (input.mode === "CHANGE" && !operatorCan(input.operator.role, "member.signInAsChange")) {
    throw new AdminRefusal("Your role signs in to look only.");
  }

  const company = await prisma.company.findUniqueOrThrow({ where: { id: input.workspace.id }, select: { tenantStatus: true } });
  if (company.tenantStatus !== "ACTIVE") {
    throw new AdminRefusal(`${input.workspace.name} is not open, so nobody can sign in to it. Its standing has to change first.`);
  }
  const member = await prisma.user.findFirst({
    where: { id: input.memberId, companyId: input.workspace.id },
    select: { id: true, name: true, isActive: true },
  });
  if (!member) throw new AdminRefusal(`That member is not in ${input.workspace.name}.`);
  if (!member.isActive) throw new AdminRefusal(`${member.name} has no access to ${input.workspace.name}. Give it back first.`);

  const ownerEndToken = randomBytes(32).toString("base64url");
  const session = await prisma.$transaction(async (tx) => {
    // One open session per operator per workspace: a new one ends the last.
    await tx.signInAsSession.updateMany({
      where: { operatorId: input.operator.id, companyId: input.workspace.id, endedAt: null, expiresAt: { gt: now } },
      data: { endedAt: now, endedBy: "OPERATOR" },
    });
    const row = await tx.signInAsSession.create({
      data: {
        companyId: input.workspace.id,
        operatorId: input.operator.id,
        memberId: member.id,
        mode: input.mode,
        reason,
        startedAt: now,
        expiresAt: new Date(now.getTime() + SIGN_IN_AS_MS),
        ownerEndTokenHash: hash(ownerEndToken),
      },
    });
    await recordOperatorEvent(
      {
        operatorId: input.operator.id,
        companyId: input.workspace.id,
        eventType: "operator.sign_in_as.started",
        entityType: "user",
        entityId: member.id,
        reason,
        payload: { session: signInAsCode(row.number), member: member.name, mode: input.mode, until: row.expiresAt.toISOString() },
      },
      tx,
    );
    return row;
  });
  const handoffToken = await createSessionHandoff(member.id, now, { signInAsSessionId: session.id });
  return { session, member, handoffToken, ownerEndToken };
}

/** Ends a session that is still open; a second end, or one after time ran out, changes nothing. */
export async function endSignInAs(sessionId: string, by: SignInAsEnd, operatorId: string | null, now = new Date()) {
  const row = await prisma.signInAsSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      number: true,
      companyId: true,
      memberId: true,
      operatorId: true,
      endedAt: true,
      expiresAt: true,
      member: { select: { name: true } },
    },
  });
  if (!row || row.endedAt || row.expiresAt <= now) return null;
  const ended = await prisma.signInAsSession.updateMany({ where: { id: row.id, endedAt: null }, data: { endedAt: now, endedBy: by } });
  if (ended.count === 0) return null;
  await recordOperatorEvent({
    // Ended from inside the session is the operator in it ending it.
    operatorId: operatorId ?? (by === "OPERATOR" ? row.operatorId : null),
    companyId: row.companyId,
    eventType: "operator.sign_in_as.ended",
    entityType: "user",
    entityId: row.memberId,
    payload: { session: signInAsCode(row.number), member: row.member.name, by },
  });
  return row;
}

/** The owner's "end it" link. The token is the authority: whoever holds the email. */
export async function endSignInAsByOwnerLink(token: string, now = new Date()) {
  const row = await prisma.signInAsSession.findUnique({
    where: { ownerEndTokenHash: hash(token.trim()) },
    select: { id: true, number: true, endedAt: true, endedBy: true, expiresAt: true, company: { select: { name: true } } },
  });
  if (!row) return { kind: "unknown" as const };
  if (row.endedAt || row.expiresAt <= now) {
    return { kind: "already-over" as const, code: signInAsCode(row.number), workspace: row.company.name };
  }
  await endSignInAs(row.id, "OWNER", null, now);
  return { kind: "ended" as const, code: signInAsCode(row.number), workspace: row.company.name };
}

/** Ends every open session as this member — they were signed out everywhere, or lost access. */
export async function endSignInAsForMember(memberId: string, now = new Date()) {
  const open = await prisma.signInAsSession.findMany({
    where: { memberId, endedAt: null, expiresAt: { gt: now } },
    select: { id: true },
  });
  for (const row of open) await endSignInAs(row.id, "SIGNED_OUT", null, now);
}

/**
 * The claim a session opened by this row carries, while the row is open.
 * Null once it has ended or run out — and then the browser session is over.
 */
export async function openSignInAs(sessionId: string, now = new Date()): Promise<(SignInAsClaim & { memberId: string }) | null> {
  const row = await prisma.signInAsSession.findUnique({
    where: { id: sessionId },
    select: { id: true, number: true, mode: true, expiresAt: true, endedAt: true, memberId: true, operator: { select: { name: true } } },
  });
  if (!row || row.endedAt || row.expiresAt <= now) return null;
  return {
    id: row.id,
    number: row.number,
    operatorName: row.operator.name,
    mode: row.mode,
    until: row.expiresAt.toISOString(),
    memberId: row.memberId,
  };
}

/** A workspace's sign-in-as sessions, newest first. */
export async function listSignInAsSessions(companyId: string, take = 20) {
  return prisma.signInAsSession.findMany({
    where: { companyId },
    orderBy: { startedAt: "desc" },
    take,
    select: {
      id: true,
      number: true,
      mode: true,
      reason: true,
      startedAt: true,
      expiresAt: true,
      endedAt: true,
      endedBy: true,
      operator: { select: { name: true } },
      member: { select: { name: true } },
    },
  });
}
