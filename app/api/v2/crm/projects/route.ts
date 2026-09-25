/**
 * Projects.
 *
 * The list carries each project's cost rollup, because a list of projects
 * without what they have cost is a list nobody opens twice. It is a query per
 * project, which is fine at the scale a page of twenty is read at and honest
 * about the rule it applies — see `projectCostSummary` on why a single SQL
 * aggregate would have to repeat the cut-approval rule.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { createProject, createProjectSchema, projectCostSummary } from "@/lib/crm/projects";
import { isCompanyUser } from "../_helpers";

const bodySchema = createProjectSchema.extend({
  /** Raise it from a job instead, carrying that job's client and site over. */
  fromWorkOrderId: z.string().uuid().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const status = searchParams.get("status");
    const search = searchParams.get("search")?.trim();
    const mine = searchParams.get("mine") === "true";
    // Used by a job's own page to ask "has this already become a project?".
    const workOrderId = searchParams.get("workOrderId");

    const where: Prisma.CrmProjectWhereInput = {
      companyId,
      ...(status ? { status: status as Prisma.EnumCrmProjectStatusFilter["equals"] } : {}),
      ...(mine ? { managerId: session.user.id } : {}),
      ...(workOrderId ? { workOrderId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { projectNo: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [projects, total] = await Promise.all([
      prisma.crmProject.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: limit,
        include: {
          client: { select: { id: true, name: true } },
          site: { select: { id: true, name: true } },
          manager: { select: { id: true, name: true } },
        },
      }),
      prisma.crmProject.count({ where }),
    ]);

    const withCosts = await Promise.all(
      projects.map(async (project) => ({
        ...project,
        costs: await projectCostSummary(prisma, companyId, project.id),
      })),
    );

    return successResponse(paginationResponse(withCosts, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/v2/crm/projects error:", error);
    return errorResponse("Failed to load projects");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;

    const data = bodySchema.parse(await request.json());

    if (data.managerId && !(await isCompanyUser(companyId, data.managerId))) {
      return errorResponse("That manager is not in this company", 400);
    }

    const project = await prisma.$transaction(async (tx) => {
      if (data.fromWorkOrderId) {
        const { projectFromWorkOrder } = await import("@/lib/crm/projects");
        return projectFromWorkOrder(
          tx,
          companyId,
          session.user.id,
          data.fromWorkOrderId,
          data,
        );
      }
      return createProject(tx, companyId, session.user.id, data);
    });

    return successResponse({ project }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof Error && error.message === "Job not found") {
      return errorResponse("Job not found", 404);
    }
    console.error("[API] POST /api/v2/crm/projects error:", error);
    return errorResponse("Failed to create the project");
  }
}
