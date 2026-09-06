import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@corelithzw/db";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const formId = searchParams.get("formId");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Prisma.CrmIntakeSubmissionWhereInput = {
      companyId: session.user.companyId,
      ...(status ? { status: status as Prisma.CrmIntakeSubmissionWhereInput["status"] } : {}),
      ...(formId ? { formId } : {}),
    };

    const [submissions, total] = await Promise.all([
      prisma.crmIntakeSubmission.findMany({
        where,
        include: {
          form: { select: { id: true, name: true } },
          lead: { select: { id: true, leadNo: true } },
          client: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.crmIntakeSubmission.count({ where }),
    ]);
    return successResponse(paginationResponse(submissions, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/v2/crm/submissions error:", error);
    return errorResponse("Failed to fetch submissions");
  }
}
