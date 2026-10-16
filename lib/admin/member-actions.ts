import { Prisma, type UserRole } from "@prisma/client";

import { roleLabel, roleOptions } from "@/lib/admin/members";
import { AdminRefusal } from "@/lib/admin/refusal";
import { recordOperatorEvent } from "@/lib/operators/audit";
import { repriceCompany } from "@/lib/platform/entitlements";
import type { SignedInOperator } from "@/lib/operators/guards";
import { prisma } from "@/lib/prisma";
import { checkPhone, cleanName, EMAIL_WRONG, NAME_NEEDED } from "@/lib/retail/people/fields";
import { endSignInAsForMember } from "@/lib/sign-in-as/sessions";
import { normaliseZimbabweMobile } from "@/lib/signup/whatsapp-number";

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
  await repriceCompany(workspace.id);
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
  await repriceCompany(workspace.id);
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
  await repriceCompany(workspace.id);
}

/* ──────────────────────────────────────────────────────────────────────────
   From the lists: members by id, wherever they are
   ────────────────────────────────────────────────────────────────────────── */

/**
 * The members a list action names, each with their own workspace. A bulk
 * action from People spans workspaces, so the workspace is read from the
 * member on the server, never taken from the page.
 */
export async function membersByIds(ids: string[]) {
  const rows = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, company: { select: { id: true, name: true, workspaceProfile: true } } },
  });
  return rows.map((row) => ({ id: row.id, name: row.name, workspace: row.company as WorkspaceRef }));
}

/* ──────────────────────────────────────────────────────────────────────────
   Adding members
   ────────────────────────────────────────────────────────────────────────── */

export const ADD_CAP = 200;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type MemberLine = { line: number; name: string; email: string; phone: string | null; role: UserRole };

/**
 * Pasted members, one per line: name, email, then a phone and a role in
 * either order, both optional. Commas or tabs (a spreadsheet's columns) part
 * them. Each problem is named by its line, so the paste can be fixed at once;
 * nothing here reads the database.
 */
export function parseMemberLines(
  text: string,
  roles: Array<{ value: UserRole; label: string }>,
  fallback: UserRole,
): { lines: MemberLine[]; problems: string[] } {
  const lines: MemberLine[] = [];
  const problems: string[] = [];
  const seen = new Map<string, number>();
  const roleOf = (word: string) => {
    const wanted = word.trim().toLowerCase();
    return roles.find((role) => role.label.toLowerCase() === wanted || role.value.toLowerCase() === wanted)?.value ?? null;
  };
  const rows = text.split(/\r?\n/);
  for (const [index, raw] of rows.entries()) {
    const line = index + 1;
    if (!raw.trim()) continue;
    const [rawName = "", rawEmail = "", ...rest] = raw.split(/\t|,/).map((part) => part.trim());
    const name = cleanName(rawName);
    const email = rawEmail.toLowerCase();
    if (!name) {
      problems.push(`Line ${line}: write their name first.`);
      continue;
    }
    if (!EMAIL.test(email) || email.length > 320) {
      problems.push(`Line ${line}: “${rawEmail || "(blank)"}” is not an email. Write the name, then the email.`);
      continue;
    }
    let phone: string | null = null;
    let role: UserRole | null = null;
    let unread: string | null = null;
    for (const part of rest.filter(Boolean)) {
      const asPhone = normaliseZimbabweMobile(part);
      const asRole = roleOf(part);
      if (asPhone && !phone) phone = asPhone;
      else if (asRole && !role) role = asRole;
      else unread ??= part;
    }
    if (unread) {
      problems.push(`Line ${line}: “${unread}” is neither a mobile number such as +263 77 123 4567 nor a role here.`);
      continue;
    }
    const earlier = seen.get(email);
    if (earlier) {
      problems.push(`Line ${line}: ${email} is on line ${earlier} as well.`);
      continue;
    }
    seen.set(email, line);
    lines.push({ line, name, email, phone, role: role ?? fallback });
  }
  if (lines.length === 0 && problems.length === 0) problems.push("Write one member per line: name, then email.");
  if (lines.length > ADD_CAP) problems.push(`Add ${ADD_CAP} or fewer at a time.`);
  return { lines, problems };
}

/**
 * Adds members to a workspace: everyone in the paste, or nobody while any
 * line has a problem. They have no password; like an owner whose workspace
 * an operator set up, they sign in with a code sent to their email.
 */
export async function addMembers(
  operator: SignedInOperator,
  workspace: WorkspaceRef,
  input: { text: string; role: UserRole },
): Promise<{ added: Array<{ id: string; name: string }> }> {
  const roles = await roleOptions(workspace);
  if (!roles.some((option) => option.value === input.role)) {
    throw new AdminRefusal(`${roleLabel(input.role)} is not a role in ${workspace.name}.`);
  }
  const { lines, problems } = parseMemberLines(input.text, roles, input.role);
  if (problems.length === 0) {
    const [taken, phones] = await Promise.all([
      prisma.user.findMany({
        where: { OR: lines.map((line) => ({ email: { equals: line.email, mode: "insensitive" as const } })) },
        select: { email: true, company: { select: { name: true } } },
      }),
      prisma.user.findMany({
        where: { companyId: workspace.id, phone: { in: lines.flatMap((line) => (line.phone ? [line.phone] : [])) } },
        select: { name: true, phone: true },
      }),
    ]);
    const holder = new Map(taken.map((user) => [user.email!.toLowerCase(), user.company.name]));
    const phoneHolder = new Map(phones.map((user) => [user.phone!, user.name]));
    for (const line of lines) {
      const where = holder.get(line.email);
      if (where) problems.push(`Line ${line.line}: ${line.email} already signs in to ${where === workspace.name ? "this workspace" : where}.`);
      const named = line.phone ? phoneHolder.get(line.phone) : undefined;
      if (named) problems.push(`Line ${line.line}: ${named} already has ${line.phone}.`);
    }
  }
  if (problems.length > 0) throw new MemberLinesRefusal(problems);

  try {
    const added = await prisma.$transaction(async (tx) => {
      const made: Array<{ id: string; name: string }> = [];
      for (const line of lines) {
        const user = await tx.user.create({
          data: { companyId: workspace.id, name: line.name, email: line.email, phone: line.phone, role: line.role, isActive: true },
          select: { id: true, name: true },
        });
        await recordOperatorEvent(
          {
            operatorId: operator.id,
            companyId: workspace.id,
            eventType: "operator.member.added",
            entityType: "user",
            entityId: user.id,
            payload: { member: user.name, email: line.email, role: roleLabel(line.role) },
          },
          tx,
        );
        made.push(user);
      }
      return made;
    });
    await repriceCompany(workspace.id);
    return { added };
  } catch (error) {
    // Someone signed up with one of the emails between the check and the write.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AdminRefusal("One of those emails was taken a moment ago. Nobody was added; try again.");
    }
    throw error;
  }
}

/** Problems with pasted members, one per line; nobody was added. */
export class MemberLinesRefusal extends AdminRefusal {
  constructor(readonly problems: string[]) {
    super(problems.length === 1 ? problems[0]! : `${problems.length} lines need fixing. Nobody was added.`);
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   Editing a member
   ────────────────────────────────────────────────────────────────────────── */

/** What is wrong, under the field it is wrong in. Nothing was saved. */
export class MemberFieldsRefusal extends AdminRefusal {
  constructor(readonly fields: Record<string, string>) {
    super(Object.values(fields)[0] ?? "Check the fields.");
  }
}

/**
 * A member's name, email and phone, checked as the workspace's own People
 * checks them. A new email is a new way in, so every session they have ends.
 */
export async function editMember(
  operator: SignedInOperator,
  workspace: WorkspaceRef,
  memberId: string,
  input: { name: string; email: string; phone: string },
  now = new Date(),
): Promise<{ signedOut: boolean }> {
  const current = await prisma.user.findFirst({
    where: { id: memberId, companyId: workspace.id },
    select: { id: true, name: true, email: true, phone: true },
  });
  if (!current) throw new AdminRefusal(`That member is not in ${workspace.name}.`);

  const fields: Record<string, string> = {};
  const name = cleanName(input.name);
  if (!name) fields.name = NAME_NEEDED;

  const email = input.email.trim().toLowerCase() || null;
  if (!email) {
    if (current.email) fields.email = "They sign in with their email, so it cannot be blank. Remove their access instead.";
  } else if (!EMAIL.test(email) || email.length > 320) {
    fields.email = EMAIL_WRONG;
  } else if (email !== current.email?.toLowerCase()) {
    const taken = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, id: { not: current.id } },
      select: { company: { select: { name: true } } },
    });
    if (taken) fields.email = `Someone already signs in with that email, in ${taken.company.name}.`;
  }

  let phone: string | null = null;
  if (input.phone.trim()) {
    const checked = await checkPhone(workspace.id, input.phone, current.id);
    if ("error" in checked) fields.phone = checked.error;
    else phone = checked.phone;
  } else if (workspace.workspaceProfile === "RETAIL") {
    fields.phone = "A shop's people need a mobile number for their invite and till PIN.";
  }
  if (Object.keys(fields).length > 0) throw new MemberFieldsRefusal(fields);

  const changed: Record<string, { from: string | null; to: string | null }> = {};
  if (name !== current.name) changed.name = { from: current.name, to: name };
  if (email !== (current.email?.toLowerCase() ?? null)) changed.email = { from: current.email, to: email };
  if (phone !== current.phone) changed.phone = { from: current.phone, to: phone };
  if (Object.keys(changed).length === 0) return { signedOut: false };
  const signOut = "email" in changed;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: current.id },
        data: { name: name!, email, phone, ...(signOut ? { sessionsEndedAt: now } : {}) },
      });
      await recordOperatorEvent(
        {
          operatorId: operator.id,
          companyId: workspace.id,
          eventType: "operator.member.edited",
          entityType: "user",
          entityId: current.id,
          payload: { member: name, changed },
        },
        tx,
      );
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new MemberFieldsRefusal({ email: "Someone took that email a moment ago. Choose another." });
    }
    throw error;
  }
  if (signOut) await endSignInAsForMember(current.id, now);
  return { signedOut: signOut };
}

/* ──────────────────────────────────────────────────────────────────────────
   Deleting a member for good
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Rows that are the member's own and go with them: how they sign in, their
 * settings, their place on sites and tills. Any other row keyed to them —
 * a sale they rang up, a report they wrote, an invite they sent — is a
 * record of the workspace, and keeps them.
 */
const OWN_ROWS = new Set([
  "Account.userId",
  "Session.userId",
  "SessionHandoff.userId",
  "UserFeatureFlag.userId",
  "UserPermissionOverride.userId",
  "UserSiteAccess.userId",
  "RetailStaffInvite.userId",
  "RetailTillPin.userId",
  "NotificationRecipient.userId",
  "UserNotificationPreference.userId",
  "UserDisplayPreference.userId",
  "WebPushSubscription.userId",
  "CrmOverviewLayout.userId",
  "VaneTopicStop.userId",
]);

const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

/** Every column with a foreign key into `User`, read from the database so next month's tables are counted too. */
async function keysIntoUser(tx: Prisma.TransactionClient) {
  return tx.$queryRaw<Array<{ table_name: string; column_name: string }>>`
    SELECT child.relname::text AS table_name, attr.attname::text AS column_name
    FROM pg_constraint con
    JOIN pg_class child ON child.oid = con.conrelid
    JOIN pg_class parent ON parent.oid = con.confrelid
    JOIN pg_namespace ns ON ns.oid = child.relnamespace
    JOIN pg_attribute attr ON attr.attrelid = child.oid AND attr.attnum = con.conkey[1]
    WHERE con.contype = 'f' AND ns.nspname = 'public' AND parent.relname = 'User' AND array_length(con.conkey, 1) = 1`;
}

/**
 * The first table holding a row that points at this member and is not their
 * own, or null. Asked before deleting, because most keys into `User` set
 * null or cascade: a delete would not fail, it would quietly unname a sale or
 * take a report with it.
 */
export async function recordHeldBy(tx: Prisma.TransactionClient, memberId: string): Promise<string | null> {
  const keys = (await keysIntoUser(tx)).filter((key) => !OWN_ROWS.has(`${key.table_name}.${key.column_name}`));
  if (keys.length === 0) return null;
  const probes = keys.map(
    (key) =>
      `SELECT '${key.table_name.replaceAll("'", "''")}' AS held WHERE EXISTS (SELECT 1 FROM ${quote(key.table_name)} WHERE ${quote(key.column_name)} = $1::text)`,
  );
  const rows = await tx.$queryRawUnsafe<Array<{ held: string }>>(`${probes.join(" UNION ALL ")} LIMIT 1`, memberId);
  return rows[0]?.held ?? null;
}

/**
 * Deletes a member who never left a mark: no sale, no report, no record of any
 * kind points at them. Anyone else is refused in words — their access is
 * removed instead, which keeps the records honest. Never the last owner.
 */
export async function deleteMember(operator: SignedInOperator, workspace: WorkspaceRef, memberId: string, reason: string) {
  const why = reason.trim();
  if (why.length < 3) throw new AdminRefusal("Say why, so the owner can see it in their audit log.");
  try {
    await prisma.$transaction(async (tx) => {
      const member = await memberOf(tx, workspace, memberId);
      if (member.role === "SUPERADMIN" && member.isActive && (await isLastOwner(tx, workspace.id, member.id))) {
        throw new AdminRefusal(`${member.name} is the only owner of ${workspace.name}. Make someone else an owner first.`);
      }
      if (await recordHeldBy(tx, member.id)) throw new AdminRefusal(heldWords(member.name, workspace.name));
      await tx.user.delete({ where: { id: member.id } });
      await recordOperatorEvent(
        {
          operatorId: operator.id,
          companyId: workspace.id,
          eventType: "operator.member.deleted",
          entityType: "user",
          entityId: member.id,
          reason: why,
          payload: { member: member.name, role: roleLabel(member.role) },
        },
        tx,
      );
    });
  } catch (error) {
    // A key the probe could not see (a composite one) still refuses rather than fails.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      const member = await prisma.user.findUnique({ where: { id: memberId }, select: { name: true } });
      throw new AdminRefusal(heldWords(member?.name ?? "This member", workspace.name));
    }
    throw error;
  }
  await repriceCompany(workspace.id);
}

function heldWords(name: string, workspaceName: string) {
  return `${name} has records in ${workspaceName}; remove their access instead.`;
}
