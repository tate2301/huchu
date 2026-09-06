import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { canEditRecord } from "@corelithzw/module-crm/permissions";
import { canAskForSignOff, generateSignOffToken } from "@corelithzw/module-crm/sign-off";

/** Ask the client to sign the job off, or withdraw the request. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const job = await prisma.crmWorkOrder.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, assignedToId: true, status: true, signOffAt: true },
    });
    if (!job) return errorResponse("Job not found", 404);
    if (!(await canEditRecord(session, job.assignedToId))) {
      return errorResponse("You can only share jobs assigned to you", 403);
    }
    if (!canAskForSignOff(job.status)) {
      return errorResponse(
        "Ask for sign-off once the job is under way — there is nothing to confirm yet",
        400,
      );
    }
    // Rotating after an answer would invite overwriting the record.
    if (job.signOffAt) {
      return errorResponse("This job has already been signed off", 409);
    }

    const token = generateSignOffToken();
    await prisma.crmWorkOrder.update({
      where: { id },
      data: { signOffToken: token, signOffAskedAt: new Date() },
    });

    return successResponse({ token, path: `/s/${token}` }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/work-orders/[id]/sign-off error:", error);
    return errorResponse("Failed to request sign-off");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const job = await prisma.crmWorkOrder.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, assignedToId: true, signOffAt: true },
    });
    if (!job) return errorResponse("Job not found", 404);
    if (!(await canEditRecord(session, job.assignedToId))) {
      return errorResponse("You can only change jobs assigned to you", 403);
    }
    // The answer stays; only the way in closes.
    await prisma.crmWorkOrder.update({
      where: { id },
      data: { signOffToken: null, signOffAskedAt: null },
    });

    return successResponse({ id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/work-orders/[id]/sign-off error:", error);
    return errorResponse("Failed to withdraw the sign-off request");
  }
}
