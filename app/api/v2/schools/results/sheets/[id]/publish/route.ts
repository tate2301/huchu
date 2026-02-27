import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  findOpenPublishWindow,
  isPrivilegedRole,
  writeModerationAction,
} from "@/lib/schools/governance-v2";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    if (!isPrivilegedRole(session.user.role)) {
      return errorResponse("Only privileged roles can publish results", 403);
    }

    const existing = await prisma.schoolResultSheet.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        status: true,
        termId: true,
        classId: true,
        streamId: true,
      },
    });
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Result sheet not found", 404);
    }
    if (existing.status !== "HOD_APPROVED") {
      return errorResponse("Only HOD-approved result sheets can be published", 400);
    }
    const activeWindow = await findOpenPublishWindow(
      session.user.companyId,
      {
        termId: existing.termId,
        classId: existing.classId,
        streamId: existing.streamId,
      },
      new Date(),
    );
    if (!activeWindow) {
      return errorResponse(
        "No open publish window is available for this term/class/stream",
        409,
      );
    }

    const updated = await prisma.schoolResultSheet.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        publishedById: session.user.id,
        publishedAt: new Date(),
      },
      include: {
        term: { select: { id: true, code: true, name: true } },
        class: { select: { id: true, code: true, name: true } },
        stream: { select: { id: true, code: true, name: true } },
        _count: { select: { lines: true } },
      },
    });

    await writeModerationAction({
      companyId: session.user.companyId,
      sheetId: existing.id,
      actorUserId: session.user.id,
      actionType: "PUBLISH",
      fromStatus: existing.status,
      toStatus: "PUBLISHED",
      comment: `Publish window ${activeWindow.id}`,
    });

    return successResponse(updated);
  } catch (error) {
    console.error(
      "[API] POST /api/v2/schools/results/sheets/[id]/publish error:",
      error,
    );
    return errorResponse("Failed to publish result sheet");
  }
}
