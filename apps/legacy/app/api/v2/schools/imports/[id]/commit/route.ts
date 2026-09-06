import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { commitImportJob, planImportJob } from "@/lib/schools/import/service";

import { importPermissionDenial } from "../../_guard";

const commitSchema = z.object({
  /**
   * Rows the registrar has looked at and wants written anyway. Without this a
   * commit refuses while anything is flagged, which is the point: an import
   * that quietly drops the eleven rows it could not read is how a school
   * discovers in March that eleven children are not on any register.
   */
  acceptWarnings: z.boolean().default(false),
});

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

    if (job.status === "ROLLED_BACK") {
      return errorResponse(
        "This import was rolled back. Upload the file again rather than re-committing it.",
        409,
      );
    }

    const body = await request.json().catch(() => ({}));
    const { acceptWarnings } = commitSchema.parse(body);

    // Re-planned rather than trusting whatever the last dry run wrote. A class
    // may have been renamed since, and committing against a stale plan is how
    // an import writes something nobody previewed.
    const plan = await planImportJob(prisma, job.id, session.user.companyId);

    if (plan.blockers.length > 0) {
      return errorResponse(plan.blockers.join(". "), 400, plan.blockers);
    }

    if (plan.rejected.length > 0 && !acceptWarnings) {
      return errorResponse(
        `${plan.rejected.length} of ${plan.rejected.length + plan.totals.create + plan.totals.update} rows cannot be imported. Fix them, or confirm to import the rest without them.`,
        409,
        plan.rejected.slice(0, 50),
      );
    }

    const summary = await commitImportJob(prisma, {
      jobId: job.id,
      companyId: session.user.companyId,
      actorId: session.user.id,
    });

    return successResponse(summary);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/imports/[id]/commit error:", error);
    return errorResponse("Failed to import");
  }
}
