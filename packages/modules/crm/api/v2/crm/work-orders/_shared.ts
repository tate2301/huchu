/**
 * What every service-delivery move needs, in one place.
 *
 * The moves — schedule, start, block, complete, invoice — are separate routes
 * rather than five shapes of PATCH body, because each has its own
 * preconditions and its own side effects and a caller should not have to know
 * which combination of fields means "the crew has arrived". What they share is
 * this: load the job, check the person is on it, and leave a trail on every
 * record the job touches.
 */
import type { CrmActivityType, Prisma, PrismaClient } from "@corelithzw/db";

import type { AuthenticatedSession } from "@corelithzw/platform/api-utils";
import { canEditRecord } from "../../../../permissions";
import { prisma } from "@corelithzw/db/client";

export const JOB_ACTION_INCLUDE = {
  items: { orderBy: { position: "asc" } },
  assignedTo: { select: { id: true, name: true } },
  client: { select: { id: true, name: true } },
  site: { select: { id: true, name: true, addressLine: true, clientId: true } },
  deal: { select: { id: true, dealNo: true, title: true, clientId: true } },
} satisfies Prisma.CrmWorkOrderInclude;

export type JobForAction = Prisma.CrmWorkOrderGetPayload<{ include: typeof JOB_ACTION_INCLUDE }>;

export function loadJobForAction(companyId: string, id: string): Promise<JobForAction | null> {
  return prisma.crmWorkOrder.findFirst({
    where: { id, companyId },
    include: JOB_ACTION_INCLUDE,
  });
}

/**
 * Every record this job belongs to.
 *
 * A job is raised against a deal, a company, a site, or some of the three, and
 * whichever ones were left blank can usually be worked out: a site knows its
 * company, and so does a deal. Doing that here is what stops a job booked
 * against a site alone from being invisible on the company paying for it.
 */
export function jobRecordRefs(job: {
  dealId: string | null;
  clientId: string | null;
  siteId: string | null;
  deal?: { clientId: string | null } | null;
  site?: { clientId: string | null } | null;
}): { dealId: string | null; clientId: string | null; siteId: string | null } {
  return {
    dealId: job.dealId,
    clientId: job.clientId ?? job.deal?.clientId ?? job.site?.clientId ?? null,
    siteId: job.siteId,
  };
}

/**
 * Whether this person may move the job along.
 *
 * The crew on it can, whoever it is assigned to can, and anyone with the reach
 * to edit somebody else's records can. Same test the PATCH route makes, kept
 * here so the five action routes cannot drift from it one at a time.
 */
export async function canWorkJob(
  session: AuthenticatedSession,
  job: { assignedToId: string | null; crewIds: string[] },
): Promise<boolean> {
  if (job.crewIds.includes(session.user.id)) return true;
  return canEditRecord(session, job.assignedToId);
}

type ActivityClient = PrismaClient | Prisma.TransactionClient;

/**
 * Leave the job's news on every record it touches.
 *
 * One row, not three: `CrmActivity` carries `dealId` and `clientId` side by
 * side and the feeds filter on one or the other, so a single row raised
 * against both shows on both — the convention the accounting bridge already
 * follows. The site is the exception; `CrmActivity` has no `siteId` column, so
 * it goes in `metadata` where a site feed can still find it with a JSON path
 * filter. That is a workaround for a missing column, not a design.
 *
 * Silent when there is neither a deal nor a company to hang it on: a row with
 * no record behind it is one nobody will ever see.
 */
export async function recordJobActivity(
  client: ActivityClient,
  params: {
    companyId: string;
    userId: string;
    job: { id: string; workOrderNo: string };
    refs: { dealId: string | null; clientId: string | null; siteId: string | null };
    type?: CrmActivityType;
    subject: string;
    body?: string | null;
    metadata?: Prisma.InputJsonObject;
    occurredAt?: Date;
  },
): Promise<void> {
  const { refs } = params;
  if (!refs.dealId && !refs.clientId) return;

  await client.crmActivity.create({
    data: {
      companyId: params.companyId,
      type: params.type ?? "SYSTEM",
      dealId: refs.dealId ?? undefined,
      clientId: refs.clientId ?? undefined,
      subject: params.subject,
      body: params.body ?? undefined,
      metadata: {
        kind: "WORK_ORDER",
        workOrderId: params.job.id,
        workOrderNo: params.job.workOrderNo,
        ...(refs.siteId ? { siteId: refs.siteId } : {}),
        ...(params.metadata ?? {}),
      },
      createdById: params.userId,
      occurredAt: params.occurredAt ?? new Date(),
    },
  });
}
