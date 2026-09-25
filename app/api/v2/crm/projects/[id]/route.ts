/**
 * One project: its detail, its cost rollup, and the two lists that explain the
 * rollup — the requisitions raised against it and the cost entries logged to
 * it. A figure a manager cannot drill into is a figure they will not trust.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  ProjectTransitionError,
  assertTransition,
  projectCostSummary,
  updateProjectSchema,
  type ProjectStatus,
} from "@/lib/crm/projects";
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
        deal: { select: { id: true, title: true } },
        workOrder: { select: { id: true, workOrderNo: true, title: true, status: true } },
        manager: { select: { id: true, name: true } },
      },
    });
    if (!project) return errorResponse("Project not found", 404);

    const [costs, requisitions, entries] = await Promise.all([
      projectCostSummary(prisma, companyId, id),
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
    ]);

    return successResponse({ project, costs, requisitions, entries });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/projects/[id] error:", error);
    return errorResponse("Failed to load the project");
  }
}

const patchSchema = updateProjectSchema.extend({
  status: z
    .enum(["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"])
    .optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;
    const { id } = await params;

    const existing = await prisma.crmProject.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });
    if (!existing) return errorResponse("Project not found", 404);

    const data = patchSchema.parse(await request.json());

    if (data.status && data.status !== existing.status) {
      assertTransition(existing.status as ProjectStatus, data.status);
    }
    if (data.managerId && !(await isCompanyUser(companyId, data.managerId))) {
      return errorResponse("That manager is not in this company", 400);
    }

    const project = await prisma.crmProject.update({
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
