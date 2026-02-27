import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { writeModerationAction } from "@/lib/schools/governance-v2";

const unpublishSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
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
    const validated = unpublishSchema.parse(body);
    const companyId = session.user.companyId;

    const existing = await prisma.schoolResultSheet.findUnique({
      where: { id },
      select: { id: true, companyId: true, status: true },
    });
    if (!existing || existing.companyId !== companyId) {
      return errorResponse("Result sheet not found", 404);
    }
    if (existing.status !== "PUBLISHED") {
      return errorResponse("Only published result sheets can be unpublished", 400);
    }

    const updated = await prisma.schoolResultSheet.update({
      where: { id },
      data: {
        status: "HOD_APPROVED",
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

    await writeModerationAction({
      companyId,
      sheetId: existing.id,
      actorUserId: session.user.id,
      actionType: "UNPUBLISH",
      fromStatus: "PUBLISHED",
      toStatus: "HOD_APPROVED",
      comment: validated.reason,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/results/sheets/[id]/unpublish error:", error);
    return errorResponse("Failed to unpublish result sheet");
  }
}
