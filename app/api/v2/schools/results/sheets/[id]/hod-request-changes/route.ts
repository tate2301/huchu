import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const requestChangesSchema = z.object({
  note: z.string().trim().min(1).max(1000),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const body = await request.json();
    const validated = requestChangesSchema.parse(body);

    const existing = await prisma.schoolResultSheet.findUnique({
      where: { id },
      select: { id: true, companyId: true, status: true },
    });
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Result sheet not found", 404);
    }
    if (existing.status !== "SUBMITTED") {
      return errorResponse(
        "Only submitted result sheets can be sent back for changes",
        400,
      );
    }

    const updated = await prisma.schoolResultSheet.update({
      where: { id },
      data: {
        status: "HOD_REJECTED",
        hodApprovedById: null,
        hodApprovedAt: null,
        publishedById: null,
        publishedAt: null,
      },
      include: {
        term: { select: { id: true, code: true, name: true } },
        class: { select: { id: true, code: true, name: true } },
        stream: { select: { id: true, code: true, name: true } },
        _count: { select: { lines: true } },
      },
    });

    return successResponse({
      sheet: updated,
      note: validated.note,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error(
      "[API] POST /api/v2/schools/results/sheets/[id]/hod-request-changes error:",
      error,
    );
    return errorResponse("Failed to request result sheet changes");
  }
}

