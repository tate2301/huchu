/**
 * One project: its detail, its cost rollup, and the lists that explain it —
 * the jobs raised inside it, the requisitions raised against it, the cost
 * entries logged to it, and the people on it. A figure a manager cannot drill
 * into is a figure they will not trust.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { canEditRecord } from "@/lib/crm/permissions";
import { recordFieldChanges } from "@/lib/crm/field-history";
import { projectCostSummary, updateProjectSchema } from "@/lib/crm/projects";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  ProjectTransitionError,
  allowedTransitions,
  assertTransition,
  type ProjectStatus,
} from "@/lib/crm/project-status";
import { completionPercent } from "@/lib/crm/work-orders";
import { isCompanyUser } from "../../_helpers";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;
    const { id } = await params;

    const project = await prisma.crmProject.findFirst({
      where: { id, companyId },
      include: {
        client: { select: { id: true, name: true } },
        site: { select: { id: true, name: true } },
        // The deal's value is the reference the budget is set against: what
        // the customer is paying, beside what the work may cost.
        deal: { select: { id: true, dealNo: true, title: true, value: true, currency: true } },
        manager: { select: { id: true, name: true } },
      },
    });
    if (!project) return errorResponse("Project not found", 404);

    const [costs, jobs, requisitions, entries, members, canEdit] = await Promise.all([
      projectCostSummary(prisma, companyId, id),
      prisma.crmWorkOrder.findMany({
        where: { companyId, projectId: id },
        orderBy: [{ scheduledStart: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          workOrderNo: true,
          title: true,
          status: true,
          scheduledStart: true,
          scheduledEnd: true,
          completedAt: true,
          assignedTo: { select: { id: true, name: true } },
          items: { select: { quantity: true, completedQuantity: true } },
        },
      }),
      prisma.crmRequisition.findMany({
        where: { companyId, projectId: id },
        orderBy: { createdAt: "desc" },
        include: { requestedBy: { select: { id: true, name: true } } },
      }),
      prisma.crmDailyCostEntry.findMany({
        where: { companyId, projectId: id },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: { log: { select: { logDate: true, user: { select: { id: true, name: true } } } } },
      }),
      prisma.crmProjectMember.findMany({
        where: { companyId, projectId: id },
        orderBy: { addedAt: "asc" },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      canEditRecord(session, project.managerId),
    ]);

    return successResponse({
      project: {
        ...project,
        allowedTransitions: allowedTransitions(project.status as ProjectStatus),
      },
      costs,
      // The checklist itself stays on the job; the project only needs to know
      // how far through each one is.
      jobs: jobs.map(({ items, ...job }) => ({ ...job, completionPercent: completionPercent(items) })),
      requisitions,
      entries,
      members,
      canEdit,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/projects/[id] error:", error);
    return errorResponse("Failed to load the project");
  }
}

const patchSchema = updateProjectSchema.extend({
  status: z.enum(PROJECT_STATUSES).optional(),
});

type ReadableProject = {
  name: string;
  description: string | null;
  status: string;
  currency: string;
  budget: { toFixed: (places: number) => string } | null;
  startDate: Date | null;
  targetEndDate: Date | null;
  actualEndDate: Date | null;
  manager: { name: string | null } | null;
  client: { name: string } | null;
  site: { name: string } | null;
};

function day(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/**
 * The project as the history should say it.
 *
 * The history is read by people, and "managerId changed from 3f2a… to 9c1e…"
 * answers nothing. Owners, companies and sites are written as names, dates as
 * days, the budget as money and the status in words — what somebody would have
 * seen on the page before and after the change.
 */
function readable(project: ReadableProject): Record<string, unknown> {
  return {
    name: project.name,
    description: project.description,
    status: PROJECT_STATUS_LABELS[project.status as ProjectStatus] ?? project.status,
    currency: project.currency,
    budget: project.budget === null ? null : project.budget.toFixed(2),
    startDate: day(project.startDate),
    targetEndDate: day(project.targetEndDate),
    actualEndDate: day(project.actualEndDate),
    managerId: project.manager?.name ?? null,
    clientId: project.client?.name ?? null,
    siteId: project.site?.name ?? null,
  };
}

const READABLE_INCLUDE = {
  manager: { select: { name: true } },
  client: { select: { name: true } },
  site: { select: { name: true } },
} as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;
    const { id } = await params;

    const existing = await prisma.crmProject.findFirst({
      where: { id, companyId },
      include: READABLE_INCLUDE,
    });
    if (!existing) return errorResponse("Project not found", 404);

    // The owner answers for the budget, so the owner — or somebody with the
    // reach to edit anybody's records — is who changes it. Everybody else on
    // the project raises jobs and requisitions inside it.
    if (!(await canEditRecord(session, existing.managerId))) {
      return errorResponse("Only the project's owner or a manager can change it", 403);
    }

    const data = patchSchema.parse(await request.json());

    if (data.status && data.status !== existing.status) {
      assertTransition(existing.status as ProjectStatus, data.status);
    }
    if (data.managerId && !(await isCompanyUser(companyId, data.managerId))) {
      return errorResponse("That manager is not in this company", 400);
    }
    if (data.clientId && !(await prisma.crmClient.findFirst({ where: { id: data.clientId, companyId }, select: { id: true } }))) {
      return errorResponse("Company not found", 404);
    }
    if (data.siteId && !(await prisma.crmSite.findFirst({ where: { id: data.siteId, companyId }, select: { id: true } }))) {
      return errorResponse("Site not found", 404);
    }

    const project = await prisma.$transaction(async (tx) => {
      const updated = await tx.crmProject.update({
        where: { id },
        data: {
          ...(data.name === undefined ? {} : { name: data.name }),
          ...(data.description === undefined ? {} : { description: data.description }),
          ...(data.status === undefined ? {} : { status: data.status }),
          ...(data.managerId === undefined ? {} : { managerId: data.managerId }),
          ...(data.clientId === undefined ? {} : { clientId: data.clientId }),
          ...(data.siteId === undefined ? {} : { siteId: data.siteId }),
          ...(data.startDate === undefined ? {} : { startDate: data.startDate }),
          ...(data.targetEndDate === undefined ? {} : { targetEndDate: data.targetEndDate }),
          ...(data.actualEndDate === undefined ? {} : { actualEndDate: data.actualEndDate }),
          ...(data.budget === undefined ? {} : { budget: data.budget }),
          ...(data.currency === undefined ? {} : { currency: data.currency }),
        },
        include: READABLE_INCLUDE,
      });

      // Written in the same transaction as the change it describes: a budget
      // that moved with no row saying who moved it is worse than no history,
      // because it makes the history look complete.
      const before = readable(existing);
      const after = readable(updated);
      await recordFieldChanges(tx, {
        companyId,
        entity: "PROJECT",
        recordId: id,
        changedById: session.user.id,
        before,
        update: Object.fromEntries(
          Object.keys(data)
            .filter((field) => field in after)
            .map((field) => [field, after[field]]),
        ),
      });

      return updated;
    });

    return successResponse({ project });
  } catch (error) {
    if (error instanceof ProjectTransitionError) {
      return errorResponse(error.message, 409);
    }
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/crm/projects/[id] error:", error);
    return errorResponse("Failed to update the project");
  }
}
