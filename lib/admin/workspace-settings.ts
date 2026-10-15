import { Prisma } from "@prisma/client";

import { AdminRefusal } from "@/lib/admin/refusal";
import { LOGIN_SUCCESS_EVENT } from "@/lib/auth-core/last-sign-in";
import { checkWorkspaceSlug, describeWorkspaceSlugProblem } from "@/lib/signup/workspace-address";
import { recordOperatorEvent } from "@/lib/operators/audit";
import type { SignedInOperator } from "@/lib/operators/guards";
import { purgeWorkspace } from "@/lib/admin/workspace-purge";
import { prisma } from "@/lib/prisma";
import { endSignInAs, signInAsCode } from "@/lib/sign-in-as/sessions";

/**
 * The housekeeping that acts on a whole workspace. Each change is logged on
 * the workspace's own chain with the operator's name, and the ones that
 * shut people out ask for a reason the owner can read.
 */

type Workspace = { id: string; name: string; slug: string };

function reasonOf(reason: string) {
  const why = reason.trim();
  if (why.length < 3) throw new AdminRefusal("Say why, so the owner can see it in their audit log.");
  return why;
}

export async function renameWorkspace(operator: SignedInOperator, workspace: Workspace, name: string) {
  const next = name.trim().replace(/\s+/g, " ");
  if (next.length < 2 || next.length > 80) throw new AdminRefusal("A workspace's name is 2 to 80 characters.");
  if (next === workspace.name) return;
  await prisma.$transaction(async (tx) => {
    await tx.company.update({ where: { id: workspace.id }, data: { name: next } });
    await recordOperatorEvent(
      {
        operatorId: operator.id,
        companyId: workspace.id,
        eventType: "operator.workspace.renamed",
        entityType: "company",
        entityId: workspace.id,
        payload: { from: workspace.name, to: next },
      },
      tx,
    );
  });
}

/**
 * A new address. Members sign in there from now on, and the old one stops
 * answering at once. The rules are signup's (`lib/signup/workspace-address`):
 * 3 to 40 lowercase letters, figures and single hyphens, none the platform
 * keeps for itself, and no other workspace's, held or in use. The address the
 * workspace holds moves with it. Answers false when nothing changed.
 */
export async function changeWorkspaceAddress(operator: SignedInOperator, workspace: Workspace, address: string) {
  const next = address.trim().toLowerCase();
  if (next === workspace.slug) return false;
  const problem = checkWorkspaceSlug(next);
  if (problem === "RESERVED") throw new AdminRefusal("That address is kept for the platform itself. Choose another.");
  if (problem) throw new AdminRefusal(describeWorkspaceSlugProblem(problem));
  const [taken, held] = await Promise.all([
    prisma.company.findUnique({ where: { slug: next }, select: { id: true } }),
    prisma.subdomainReservation.findUnique({ where: { subdomain: next }, select: { companyId: true } }),
  ]);
  if (taken || (held && held.companyId !== workspace.id)) throw new AdminRefusal(`${next} is another workspace's address.`);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.company.update({ where: { id: workspace.id }, data: { slug: next } });
      // The address it held moves with it; one it already held under the new name stays as it is.
      if (held) await tx.subdomainReservation.deleteMany({ where: { companyId: workspace.id, subdomain: workspace.slug } });
      else await tx.subdomainReservation.updateMany({ where: { companyId: workspace.id, subdomain: workspace.slug }, data: { subdomain: next } });
      await recordOperatorEvent(
        {
          operatorId: operator.id,
          companyId: workspace.id,
          eventType: "operator.workspace.address_changed",
          entityType: "company",
          entityId: workspace.id,
          payload: { from: workspace.slug, to: next },
        },
        tx,
      );
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AdminRefusal(`${next} is another workspace's address.`);
    }
    throw error;
  }
  return true;
}

/** Every member's sessions end on their next click, and so does any sign-in-as. */
export async function signEveryoneOut(operator: SignedInOperator, workspace: Workspace, reason: string, now = new Date()) {
  const why = reasonOf(reason);
  const ended = await prisma.$transaction(async (tx) => {
    const { count } = await tx.user.updateMany({ where: { companyId: workspace.id }, data: { sessionsEndedAt: now } });
    await recordOperatorEvent(
      {
        operatorId: operator.id,
        companyId: workspace.id,
        eventType: "operator.workspace.signed_everyone_out",
        entityType: "company",
        entityId: workspace.id,
        reason: why,
        payload: { members: count },
      },
      tx,
    );
    return count;
  });
  const open = await prisma.signInAsSession.findMany({
    where: { companyId: workspace.id, endedAt: null, expiresAt: { gt: now } },
    select: { id: true },
  });
  for (const row of open) await endSignInAs(row.id, "SIGNED_OUT", null, now);
  return ended;
}

export async function endSignInAsInWorkspace(operator: SignedInOperator, workspace: Workspace, sessionId: string) {
  const row = await prisma.signInAsSession.findFirst({ where: { id: sessionId, companyId: workspace.id }, select: { id: true } });
  if (!row) throw new AdminRefusal(`That session is not in ${workspace.name}.`);
  await endSignInAs(row.id, "OPERATOR", operator.id);
}

/**
 * Suspended: nobody can sign in or use it, the data stays as it is, and it can
 * be reinstated. For a stolen phone, a dispute, or a request from the owner.
 */
export async function suspendWorkspace(operator: SignedInOperator, workspace: Workspace, reason: string, now = new Date()) {
  const why = reasonOf(reason);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: workspace.id }, select: { tenantStatus: true } });
  if (company.tenantStatus !== "ACTIVE") throw new AdminRefusal(`${workspace.name} is not open, so it cannot be suspended.`);
  await prisma.$transaction(async (tx) => {
    await tx.company.update({ where: { id: workspace.id }, data: { tenantStatus: "SUSPENDED", suspendedAt: now } });
    await tx.user.updateMany({ where: { companyId: workspace.id }, data: { sessionsEndedAt: now } });
    await recordOperatorEvent(
      { operatorId: operator.id, companyId: workspace.id, eventType: "operator.workspace.suspended", entityType: "company", entityId: workspace.id, reason: why },
      tx,
    );
  });
}

export async function reinstateWorkspace(operator: SignedInOperator, workspace: Workspace, reason: string) {
  const why = reasonOf(reason);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: workspace.id }, select: { tenantStatus: true } });
  if (company.tenantStatus !== "SUSPENDED") throw new AdminRefusal(`${workspace.name} is not suspended.`);
  await prisma.$transaction(async (tx) => {
    await tx.company.update({ where: { id: workspace.id }, data: { tenantStatus: "ACTIVE", suspendedAt: null } });
    await recordOperatorEvent(
      { operatorId: operator.id, companyId: workspace.id, eventType: "operator.workspace.reinstated", entityType: "company", entityId: workspace.id, reason: why },
      tx,
    );
  });
}

/**
 * Closed: nobody gets in again until an owner operator reopens it. The data is
 * kept, so a closed workspace is the only kind that can be deleted for good.
 */
export async function closeWorkspace(operator: SignedInOperator, workspace: Workspace, reason: string, now = new Date()) {
  const why = reasonOf(reason);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: workspace.id }, select: { tenantStatus: true } });
  if (company.tenantStatus === "DISABLED") throw new AdminRefusal(`${workspace.name} is already closed.`);
  await prisma.$transaction(async (tx) => {
    await tx.company.update({ where: { id: workspace.id }, data: { tenantStatus: "DISABLED", disabledAt: now } });
    await tx.user.updateMany({ where: { companyId: workspace.id }, data: { sessionsEndedAt: now } });
    await recordOperatorEvent(
      { operatorId: operator.id, companyId: workspace.id, eventType: "operator.workspace.closed", entityType: "company", entityId: workspace.id, reason: why },
      tx,
    );
  });
}

/** A closed workspace open again, as it was before it closed: its members sign in, its subscription says the rest. */
export async function reopenWorkspace(operator: SignedInOperator, workspace: Workspace, reason: string) {
  const why = reasonOf(reason);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: workspace.id }, select: { tenantStatus: true } });
  if (company.tenantStatus !== "DISABLED") throw new AdminRefusal(`${workspace.name} is not closed.`);
  await prisma.$transaction(async (tx) => {
    await tx.company.update({ where: { id: workspace.id }, data: { tenantStatus: "ACTIVE", disabledAt: null, suspendedAt: null } });
    await recordOperatorEvent(
      { operatorId: operator.id, companyId: workspace.id, eventType: "operator.workspace.reopened", entityType: "company", entityId: workspace.id, reason: why },
      tx,
    );
  });
}

/**
 * Every record of a closed workspace, deleted, and its address freed. Only a
 * closed one: closing first is what makes this two decisions, not one click.
 * The audit log keeps the line that says who and why.
 */
export async function deleteWorkspaceForGood(operator: SignedInOperator, workspace: Workspace, reason: string) {
  const why = reasonOf(reason);
  const company = await prisma.company.findUniqueOrThrow({ where: { id: workspace.id }, select: { tenantStatus: true } });
  if (company.tenantStatus !== "DISABLED") throw new AdminRefusal(`${workspace.name} is not closed. Close it first.`);
  const open = await prisma.signInAsSession.count({ where: { companyId: workspace.id, endedAt: null, expiresAt: { gt: new Date() } } });
  if (open > 0) throw new AdminRefusal(`Someone from support is signed in to ${workspace.name}. End that first.`);
  const deleted = await purgeWorkspace(workspace.id);
  await recordOperatorEvent({
    operatorId: operator.id,
    eventType: "operator.workspace.deleted",
    entityType: "company",
    entityId: workspace.id,
    reason: why,
    payload: { name: workspace.name, slug: workspace.slug, rows: Object.values(deleted).reduce((sum, count) => sum + count, 0) },
  });
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The access record: every sign-in to the workspace and every time Corelith
 * staff signed in as a member, with reasons. What a customer — or POTRAZ, under
 * the Cyber and Data Protection Act — asks for when they ask who saw their data.
 */
export async function accessRecordCsv(operator: SignedInOperator, workspace: Workspace) {
  const [signIns, sessions] = await Promise.all([
    prisma.platformAuditEvent.findMany({
      where: { companyId: workspace.id, eventType: LOGIN_SUCCESS_EVENT },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, actor: true, entityId: true },
    }),
    prisma.signInAsSession.findMany({
      where: { companyId: workspace.id },
      orderBy: { startedAt: "asc" },
      select: {
        number: true,
        startedAt: true,
        endedAt: true,
        expiresAt: true,
        mode: true,
        reason: true,
        operator: { select: { name: true, email: true } },
        member: { select: { name: true, email: true } },
      },
    }),
  ]);
  const header = ["When (UTC)", "Who", "How", "As", "Until", "Reason", "Session"];
  const rows: string[][] = [];
  for (const event of signIns) rows.push([event.createdAt.toISOString(), event.actor ?? "", `Signed in (${event.entityId ?? "unknown"})`, "", "", "", ""]);
  for (const session of sessions) {
    rows.push([
      session.startedAt.toISOString(),
      `${session.operator.name} <${session.operator.email}>, Corelith support`,
      session.mode === "LOOK" ? "Signed in as, look only" : "Signed in as, making changes",
      `${session.member.name}${session.member.email ? ` <${session.member.email}>` : ""}`,
      (session.endedAt ?? session.expiresAt).toISOString(),
      session.reason,
      signInAsCode(session.number),
    ]);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  await recordOperatorEvent({
    operatorId: operator.id,
    companyId: workspace.id,
    eventType: "operator.workspace.access_record_exported",
    entityType: "company",
    entityId: workspace.id,
    payload: { rows: rows.length },
  });
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}
