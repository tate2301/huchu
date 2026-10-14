import type { z } from "zod";

import { isCompanyUser } from "@/app/api/v2/crm/_helpers";
import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { canUser, denialMessage } from "@/lib/crm/permissions";
import { prisma } from "@/lib/prisma";

import type { createTaskSchema } from "./tasks";

/** Why a task was not created, with the status the route answers. */
export class CrmTaskRefused extends Error {
  constructor(
    readonly status: 400 | 403,
    message: string,
  ) {
    super(message);
    this.name = "CrmTaskRefused";
  }
}

/**
 * Creates a CRM task as the signed-in person: `POST /api/v2/crm/tasks` and
 * Vane's approved "raise a task" both come here. Putting work on someone
 * else's list needs `tasks.assign.others`; whatever the task is filed against
 * must be in this workspace. Unassigned, it is the creator's.
 */
export async function createCrmTask(
  session: Pick<AuthenticatedSession, "user">,
  data: z.infer<typeof createTaskSchema>,
) {
  const companyId = session.user.companyId;
  if (!(await isCompanyUser(companyId, data.assignedToId))) throw new CrmTaskRefused(400, "Invalid assignee");
  // Putting work on somebody else's list is its own permission.
  if (data.assignedToId && data.assignedToId !== session.user.id && !(await canUser(session as AuthenticatedSession, "tasks.assign.others"))) {
    throw new CrmTaskRefused(403, denialMessage("tasks.assign.others"));
  }

  // Whatever the task is filed against has to be in this tenant.
  const checks: Array<[string, string | null | undefined, () => Promise<unknown>]> = [
    ["deal", data.dealId, () => prisma.crmDeal.findFirst({ where: { id: data.dealId!, companyId }, select: { id: true } })],
    ["lead", data.leadId, () => prisma.crmLead.findFirst({ where: { id: data.leadId!, companyId }, select: { id: true } })],
    ["company", data.clientId, () => prisma.crmClient.findFirst({ where: { id: data.clientId!, companyId }, select: { id: true } })],
    ["person", data.personId, () => prisma.crmPerson.findFirst({ where: { id: data.personId!, companyId }, select: { id: true } })],
    ["site", data.siteId, () => prisma.crmSite.findFirst({ where: { id: data.siteId!, companyId }, select: { id: true } })],
  ];
  for (const [label, id, check] of checks) {
    if (!id) continue;
    if (!(await check())) throw new CrmTaskRefused(400, `Invalid ${label}`);
  }

  return prisma.crmTask.create({
    data: {
      companyId,
      title: data.title,
      description: data.description ?? undefined,
      type: data.type ?? "GENERAL",
      priority: data.priority ?? "NORMAL",
      dueAt: new Date(data.dueAt),
      hasDueTime: data.hasDueTime ?? false,
      remindAt: data.remindAt ? new Date(data.remindAt) : undefined,
      // An unassigned task is a task nobody is doing, so it defaults to the
      // person creating it.
      assignedToId: data.assignedToId ?? session.user.id,
      createdById: session.user.id,
      leadId: data.leadId ?? undefined,
      dealId: data.dealId ?? undefined,
      clientId: data.clientId ?? undefined,
      personId: data.personId ?? undefined,
      siteId: data.siteId ?? undefined,
      recurrence: data.recurrence ?? "NONE",
      recurrenceInterval: data.recurrenceInterval ?? 1,
    },
    include: { assignedTo: { select: { id: true, name: true } } },
  });
}
