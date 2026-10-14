import { prisma } from "@/lib/prisma";
import { getEffectiveFeaturesForUser } from "@/lib/platform/user-entitlements";
import { isOrgAdminRole } from "@/lib/preferences/nav";
import { canReadReport } from "@/lib/reports/access";
import { describeWhen, nextRunAt, type ScheduleContent, type ScheduleFormat, type ScheduleInput } from "@/lib/reports/schedule";
import { getReport } from "@/lib/reports/server";
import type { ReportDefinition } from "@/lib/reports/types";

/**
 * A report's schedules, as Send it lists, makes and stops them. Every call is
 * scoped by the session's company, and every one is a person's: Vane has no
 * tool and no route here, and its reader is only granted SELECT.
 */

export type SchedulePerson = { id: string; name: string };

export type ScheduleView = {
  id: string;
  when: string;
  frequency: "DAILY" | "WEEKLY" | "MONTHLY";
  day: number | null;
  time: string;
  format: ScheduleFormat;
  content: ScheduleContent;
  recipients: SchedulePerson[];
  active: boolean;
  nextRunAt: string | null;
  lastSentAt: string | null;
  madeBy: string;
  /** Its maker or a manager may stop it or start it again. */
  canChange: boolean;
};

type Actor = { companyId: string; userId: string; role: string };

/** The people in the workspace who can open the report: who it may go to. */
export async function readersOf(companyId: string, definition: ReportDefinition): Promise<SchedulePerson[]> {
  const users = await prisma.user.findMany({
    where: { companyId, isActive: true },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  const allowed = await Promise.all(
    users.map(async (user) => {
      const enabledFeatures = await getEffectiveFeaturesForUser({ companyId, userId: user.id, role: user.role });
      return canReadReport(definition, { role: user.role, enabledFeatures }) ? { id: user.id, name: user.name } : null;
    }),
  );
  return allowed.filter((person): person is SchedulePerson => person !== null);
}

export async function listSchedules(actor: Actor, reportKey: string): Promise<ScheduleView[]> {
  const rows = await prisma.reportSchedule.findMany({
    where: { companyId: actor.companyId, reportKey },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    include: { createdBy: { select: { name: true } } },
  });
  const ids = [...new Set(rows.flatMap((row) => row.recipientIds))];
  const people = await prisma.user.findMany({ where: { companyId: actor.companyId, id: { in: ids } }, select: { id: true, name: true } });
  const named = new Map(people.map((person) => [person.id, person.name]));
  const manager = isOrgAdminRole(actor.role);
  return rows.map((row) => ({
    id: row.id,
    when: describeWhen(row),
    frequency: row.frequency,
    day: row.day,
    time: row.time,
    format: row.format,
    content: row.content,
    recipients: row.recipientIds.flatMap((id) => (named.has(id) ? [{ id, name: named.get(id)! }] : [])),
    active: row.active,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    lastSentAt: row.lastSentAt?.toISOString() ?? null,
    madeBy: row.createdBy.name,
    canChange: manager || row.createdById === actor.userId,
  }));
}

export type ScheduleRefusal = { status: number; error: string };

/** A person starts sending a report. Its recipients must be able to open it, today. */
export async function createSchedule(
  actor: Actor & { enabledFeatures: string[] | undefined },
  reportKey: string,
  input: ScheduleInput,
  now = new Date(),
): Promise<{ id: string } | ScheduleRefusal> {
  const report = getReport(reportKey);
  if (!report || !canReadReport(report.definition, { role: actor.role, enabledFeatures: actor.enabledFeatures })) {
    return { status: 404, error: "Report not found" };
  }
  const readers = new Set((await readersOf(actor.companyId, report.definition)).map((person) => person.id));
  const outside = input.recipientIds.filter((id) => !readers.has(id));
  if (outside.length) return { status: 400, error: "Only people in this workspace who can open the report can be sent it" };

  const created = await prisma.reportSchedule.create({
    data: {
      companyId: actor.companyId,
      reportKey,
      frequency: input.frequency,
      day: input.day,
      time: input.time,
      recipientIds: [...new Set(input.recipientIds)],
      format: input.format,
      content: input.content,
      query: input.query,
      createdById: actor.userId,
      active: true,
      nextRunAt: nextRunAt(input, now),
    },
    select: { id: true },
  });
  return created;
}

/** Stop sending, or start again from the next slot. Its maker or a manager. */
export async function setScheduleActive(actor: Actor, id: string, active: boolean, now = new Date()): Promise<true | ScheduleRefusal> {
  const schedule = await prisma.reportSchedule.findFirst({ where: { id, companyId: actor.companyId } });
  if (!schedule) return { status: 404, error: "Schedule not found" };
  if (schedule.createdById !== actor.userId && !isOrgAdminRole(actor.role)) {
    return { status: 403, error: "Only the person who set it up or a manager can change it" };
  }
  await prisma.reportSchedule.update({
    where: { id },
    data: { active, nextRunAt: active ? nextRunAt(schedule, now) : null },
  });
  return true;
}
