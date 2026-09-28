/**
 * The people on a project.
 *
 * The owner (`managerId`) is not a member row: they are answerable for the
 * budget, which is a different thing from being on the team, and holding them
 * in two places would let the two disagree. Everybody else — crew leads, the
 * estimator, whoever buys the materials — is here.
 *
 * Reading the team is open to the company. Changing it is the owner's call, or
 * a manager's, for the same reason changing the budget is.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { canEditRecord } from "@/lib/crm/permissions";
import { isCompanyUser } from "../../../_helpers";

type Params = { params: Promise<{ id: string }> };

const MEMBER_INCLUDE = {
  user: { select: { id: true, name: true, email: true } },
} as const;

const addSchema = z.object({
  userId: z.string().uuid(),
  role: z.string().trim().max(80).nullable().optional(),
});

async function loadProject(companyId: string, id: string) {
  return prisma.crmProject.findFirst({
    where: { id, companyId },
    select: { id: true, managerId: true },
  });
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { companyId } = sessionResult.session.user;
    const { id } = await params;

    const project = await loadProject(companyId, id);
    if (!project) return errorResponse("Project not found", 404);

    const members = await prisma.crmProjectMember.findMany({
      where: { companyId, projectId: id },
      orderBy: { addedAt: "asc" },
      include: MEMBER_INCLUDE,
    });

    return successResponse({ data: members });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/projects/[id]/members error:", error);
    return errorResponse("Failed to load the team");
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;
    const { id } = await params;

    const project = await loadProject(companyId, id);
    if (!project) return errorResponse("Project not found", 404);
    if (!(await canEditRecord(session, project.managerId))) {
      return errorResponse("Only the project's owner or a manager can change the team", 403);
    }

    const data = addSchema.parse(await request.json());
    if (!(await isCompanyUser(companyId, data.userId))) {
      return errorResponse("That person is not in this company", 400);
    }
    if (data.userId === project.managerId) {
      return errorResponse("They already own the project", 409);
    }

    // Adding somebody twice updates what they do rather than failing: the
    // second press is a person correcting the role, not asking for two rows.
    const member = await prisma.crmProjectMember.upsert({
      where: { projectId_userId: { projectId: id, userId: data.userId } },
      update: { role: data.role ?? null },
      create: { companyId, projectId: id, userId: data.userId, role: data.role ?? null },
      include: MEMBER_INCLUDE,
    });

    return successResponse({ member }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/crm/projects/[id]/members error:", error);
    return errorResponse("Failed to add them to the project");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { companyId } = session.user;
    const { id } = await params;

    const userId = new URL(request.url).searchParams.get("userId");
    if (!userId) return errorResponse("Who should come off the project?", 400);

    const project = await loadProject(companyId, id);
    if (!project) return errorResponse("Project not found", 404);
    if (!(await canEditRecord(session, project.managerId))) {
      return errorResponse("Only the project's owner or a manager can change the team", 403);
    }

    const { count } = await prisma.crmProjectMember.deleteMany({
      where: { companyId, projectId: id, userId },
    });
    if (count === 0) return errorResponse("They are not on this project", 404);

    return successResponse({ removed: userId });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/projects/[id]/members error:", error);
    return errorResponse("Failed to take them off the project");
  }
}
