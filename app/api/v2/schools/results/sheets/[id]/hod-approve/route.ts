import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const existing = await prisma.schoolResultSheet.findUnique({
      where: { id },
      select: { id: true, companyId: true, status: true, submittedById: true },
    });
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Result sheet not found", 404);
    }
    if (existing.status !== "SUBMITTED") {
      return errorResponse("Only submitted result sheets can be HOD approved", 400);
    }

    const updated = await prisma.schoolResultSheet.update({
      where: { id },
      data: {
        status: "HOD_APPROVED",
        hodApprovedById: session.user.id,
        hodApprovedAt: new Date(),
      },
      include: {
        term: { select: { id: true, code: true, name: true } },
        class: { select: { id: true, code: true, name: true } },
        stream: { select: { id: true, code: true, name: true } },
        _count: { select: { lines: true } },
      },
    });

    return successResponse(updated);
  } catch (error) {
    console.error(
      "[API] POST /api/v2/schools/results/sheets/[id]/hod-approve error:",
      error,
    );
    return errorResponse("Failed to approve result sheet");
  }
}

