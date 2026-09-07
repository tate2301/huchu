import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { rollbackImportJob } from "../../../../../../import/service";

import { importPermissionDenial } from "../../_guard";

/**
 * Take a committed import back out.
 *
 * A loop over the artifacts the commit recorded, in reverse. Anything a person
 * has since added on top of an imported record — a mark, a receipt, a bed —
 * will stop the delete rather than cascade, which is the correct outcome: at
 * that point the import is no longer the only thing that wrote here.
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

    if (job.status !== "COMMITTED") {
      return errorResponse("This import has not been committed, so there is nothing to undo", 409);
    }

    const summary = await rollbackImportJob(prisma, {
      jobId: job.id,
      companyId: session.user.companyId,
      actorId: session.user.id,
    });

    return successResponse(summary);
  } catch (error) {
    console.error("[API] POST /api/v2/schools/imports/[id]/rollback error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Failed to undo that import",
    );
  }
}
