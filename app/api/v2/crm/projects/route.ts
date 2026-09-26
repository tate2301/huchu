/**
 * Projects.
 *
 * The list carries each project's cost rollup, because a list of projects
 * without what they have cost is a list nobody opens twice. It is a query per
 * project, which is fine at the scale a page of twenty is read at and honest
 * about the rule it applies — see `projectCostSummary` on why a single SQL
 * aggregate would have to repeat the cut-approval rule.
 *
 * A project is always started from a deal (`dealId`): it is what the deal
 * turns into once it is sold. It is never raised from a job: the job is
 * raised inside the project, not the other way round.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  ProjectLinkError,
  createProjectSchema,
  overBudgetProjectIds,
  projectCostSummary,
  projectFromDeal,
} from "@/lib/crm/projects";
import { PROJECT_STATUSES, isClosed } from "@/lib/crm/project-status";
import { isCompanyUser } from "../_helpers";

const OPEN_STATUSES = PROJECT_STATUSES.filter((status) => !isClosed(status));

/**
 * Start a deal's project, carrying the deal's name, client, site and owner
 * across. The name is optional because the deal names the project after
 * itself; anything else sent overrides what the deal would have given it.
 */
const bodySchema = createProjectSchema.extend({
  name: createProjectSchema.shape.name.optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const status = PROJECT_STATUSES.find((value) => value === searchParams.get("status"));
    // Still taking work: what a job can be raised into. Completed and
    // cancelled projects are history, not somewhere to send a crew.
    const open = searchParams.get("open") === "true";
    // A picker wants names, not a cost rollup per row.
    const withCosts = searchParams.get("costs") !== "false";
    const search = searchParams.get("search")?.trim();
    const mine = searchParams.get("mine") === "true";
    const managerId = searchParams.get("managerId")?.trim();
    const clientId = searchParams.get("clientId")?.trim();
    // A deal's own page asks "has this already become a project?".
    const dealId = searchParams.get("dealId")?.trim();
    // Spend against budget, asked of the whole register before paging, so
    // page one of an over-budget list is not "whichever over-budget projects
    // happened to be on page one of everything". "within" is everything else,
    // including the projects nobody has budgeted.
    const budget = searchParams.get("budget");
    const overIds =
      budget === "over" || budget === "within" ? await overBudgetProjectIds(prisma, companyId) : null;

    const where: Prisma.CrmProjectWhereInput = {
      companyId,
      ...(status ? { status } : open ? { status: { in: OPEN_STATUSES } } : {}),
      ...(mine ? { managerId: session.user.id } : {}),
      // "none" is a real answer to "whose is it?" — a project nobody owns is
      // the one most worth finding.
      ...(managerId ? { managerId: managerId === "none" ? null : managerId } : {}),
      ...(clientId ? { clientId } : {}),
      ...(dealId ? { dealId } : {}),
      ...(overIds ? { id: budget === "over" ? { in: overIds } : { notIn: overIds } } : {}),
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
          deal: { select: { id: true, dealNo: true, title: true } },
          manager: { select: { id: true, name: true } },
          _count: { select: { workOrders: true } },
        },
      }),
      prisma.crmProject.count({ where }),
    ]);

    const rows = withCosts
      ? await Promise.all(
          projects.map(async (project) => ({
            ...project,
            costs: await projectCostSummary(prisma, companyId, project.id),
          })),
        )
      : projects;

    return successResponse(paginationResponse(rows, total, page, limit));
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
    // A foreign key only proves the row exists somewhere. It has to exist in
    // this company, or a project could name another tenant's customer.
    if (data.clientId && !(await prisma.crmClient.findFirst({ where: { id: data.clientId, companyId }, select: { id: true } }))) {
      return errorResponse("Company not found", 404);
    }
    if (data.siteId && !(await prisma.crmSite.findFirst({ where: { id: data.siteId, companyId }, select: { id: true } }))) {
      return errorResponse("Site not found", 404);
    }

    // A deal has one project. Asked for a second, the answer is the one it
    // has — from where the asker stands that is what they wanted — and the
    // page says so rather than announcing a project that was not started.
    const { dealId } = data;
    const existing = await prisma.crmProject.findFirst({ where: { companyId, dealId } });
    if (existing) return successResponse({ project: existing, created: false });

    let project;
    try {
      project = await prisma.$transaction((tx) =>
        projectFromDeal(tx, companyId, session.user.id, dealId, data),
      );
    } catch (error) {
      // Two people — or one person twice — starting the same deal's project at
      // the same moment: both saw no project, one insert won, and the unique
      // on the deal refused the other. The loser gets the winner's project,
      // which is what they were asking for. Read outside the failed
      // transaction, because Postgres will not answer inside an aborted one.
      if (isUniqueViolation(error)) {
        const winner = await prisma.crmProject.findFirst({ where: { companyId, dealId } });
        if (winner) return successResponse({ project: winner, created: false });
      }
      throw error;
    }

    return successResponse({ project, created: true }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      // The one refusal somebody can act on without reading the issues.
      if (error.issues.some((issue) => issue.path[0] === "dealId")) {
        return errorResponse("Choose the deal this project delivers", 400, error.issues);
      }
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof ProjectLinkError) {
      return errorResponse(error.message, 404);
    }
    console.error("[API] POST /api/v2/crm/projects error:", error);
    return errorResponse("Failed to create the project");
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
