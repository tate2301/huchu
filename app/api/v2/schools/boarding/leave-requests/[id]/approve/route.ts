import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const approveLeaveRequestSchema = z.object({
  approved: z.boolean(),
  reason: z.string().trim().min(1).max(1000).nullable().optional(),
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
    const companyId = session.user.companyId;

    const body = await request.json();
    const validated = approveLeaveRequestSchema.parse(body);

    const leaveRequest = await prisma.schoolLeaveRequest.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        status: true,
      },
    });
    if (!leaveRequest) return errorResponse("Leave request not found", 404);
    if (leaveRequest.status !== "SUBMITTED") {
      return errorResponse("Only submitted leave requests can be approved or rejected", 409);
    }

    const updated = await prisma.schoolLeaveRequest.update({
      where: { id: leaveRequest.id },
      data: {
        status: validated.approved ? "APPROVED" : "REJECTED",
        reason: validated.reason?.trim() || undefined,
        approvedById: session.user.id,
        approvedAt: new Date(),
      },
      include: {
        student: {
          select: { id: true, studentNo: true, firstName: true, lastName: true },
        },
        allocation: {
          select: { id: true, termId: true, hostelId: true, roomId: true, bedId: true },
        },
        approvedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error(
      "[API] POST /api/v2/schools/boarding/leave-requests/[id]/approve error:",
      error,
    );
    return errorResponse("Failed to update leave request approval");
  }
}
