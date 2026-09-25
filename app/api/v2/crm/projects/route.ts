/**
 * Projects.
 *
 * The list carries each project's cost rollup, because a list of projects
 * without what they have cost is a list nobody opens twice. It is a query per
 * project, which is fine at the scale a page of twenty is read at and honest
 * about the rule it applies — see `projectCostSummary` on why a single SQL
 * aggregate would have to repeat the cut-approval rule.
 *
 * A project is started from the deal that was won (`fromDealId`) or raised
 * directly. It is never raised from a job any more: the job is raised inside
 * the project, not the other way round.
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
  createProject,
  createProjectSchema,
  overBudgetProjectIds,
  projectCostSummary,
  projectFromDeal,
} from "@/lib/crm/projects";
import { PROJECT_STATUSES, isClosed } from "@/lib/crm/project-status";
import { isCompanyUser } from "../_helpers";

const OPEN_STATUSES = PROJECT_STATUSES.filter((status) => !isClosed(status));

const bodySchema = createProjectSchema.extend({
  /**
   * Start it from a won deal, carrying the deal's name, client, site and owner
   * across. Handed back the existing project if the deal already has one.
   */
  fromDealId: z.string().uuid().optional(),
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

    // Naming a deal, either way it is spelled, is starting that deal's
    // project — which checks the deal is this company's and hands back the
    // existing project rather than raising a second one.
    const dealId = data.fromDealId ?? data.dealId ?? null;
    let project;
    try {
      project = await prisma.$transaction((tx) =>
        dealId
          ? projectFromDeal(tx, companyId, session.user.id, dealId, data)
          : createProject(tx, companyId, session.user.id, data),
      );
    } catch (error) {
      // Two people — or one person twice — starting the same deal's project at
      // the same moment: both saw no project, one insert won, and the unique
      // on the deal refused the other. The loser gets the winner's project,
      // which is what they were asking for. Read outside the failed
      // transaction, because Postgres will not answer inside an aborted one.
      if (dealId && isUniqueViolation(error)) {
        project = await prisma.crmProject.findFirst({ where: { companyId, dealId } });
      }
      if (!project) throw error;
    }

    return successResponse({ project }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
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
