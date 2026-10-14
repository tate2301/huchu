import { AdminRefusal } from "@/lib/admin/refusal";
import { LOGIN_SUCCESS_EVENT } from "@/lib/auth-core/last-sign-in";
import { recordOperatorEvent } from "@/lib/operators/audit";
import type { SignedInOperator } from "@/lib/operators/guards";
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
 * Closed: nobody gets in again from the portal. The data is kept; reopening
 * is an engineer's job, on purpose. The address has to be typed to do it.
 */
export async function closeWorkspace(operator: SignedInOperator, workspace: Workspace, typedAddress: string, reason: string, now = new Date()) {
  if (typedAddress.trim().toLowerCase() !== workspace.slug) {
    throw new AdminRefusal(`Type ${workspace.slug} exactly to close ${workspace.name}.`);
  }
  const why = reasonOf(reason);
  await prisma.$transaction(async (tx) => {
    await tx.company.update({ where: { id: workspace.id }, data: { tenantStatus: "DISABLED", disabledAt: now } });
    await tx.user.updateMany({ where: { companyId: workspace.id }, data: { sessionsEndedAt: now } });
    await recordOperatorEvent(
      { operatorId: operator.id, companyId: workspace.id, eventType: "operator.workspace.closed", entityType: "company", entityId: workspace.id, reason: why },
      tx,
    );
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
