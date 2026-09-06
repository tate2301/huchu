import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { planImportJob } from "@corelithzw/module-campus/import/service";

import { importPermissionDenial } from "../../_guard";

/**
 * What would happen, changing nothing.
 *
 * Touches the staging tables and no domain table at all — the property the
 * tests assert by counting rows either side of a call. A registrar who cannot
 * ask this question without consequences will not ask it.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { id } = await context.params;
    const job = await prisma.schoolImportJob.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, entityType: true, status: true },
    });
    if (!job) return errorResponse("Import not found", 404);

    const denied = importPermissionDenial(session, job.entityType, "create");
    if (denied) return errorResponse(denied, 403);

    if (job.status === "COMMITTED") {
      return errorResponse("This import has already been committed", 409);
    }

    const summary = await planImportJob(prisma, job.id, session.user.companyId);
    return successResponse(summary);
  } catch (error) {
    console.error("[API] POST /api/v2/schools/imports/[id]/dry-run error:", error);
    return errorResponse("Failed to check that import");
  }
}
