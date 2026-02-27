import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const checkInSchema = z.object({
  checkedInAt: z.string().datetime().optional(),
  notes: z.string().trim().min(1).max(1000).nullable().optional(),
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
    const validated = checkInSchema.parse(body);

    const leaveRequest = await prisma.schoolLeaveRequest.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        status: true,
        studentId: true,
        checkedOutAt: true,
      },
    });
    if (!leaveRequest) return errorResponse("Leave request not found", 404);
    if (leaveRequest.status !== "CHECKED_OUT") {
      return errorResponse("Only checked-out leave requests can be checked in", 409);
    }

    const checkedInAt = validated.checkedInAt
      ? new Date(validated.checkedInAt)
      : new Date();
    if (leaveRequest.checkedOutAt && checkedInAt < leaveRequest.checkedOutAt) {
      return errorResponse("Check-in time cannot be before check-out time", 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const requestRecord = await tx.schoolLeaveRequest.update({
        where: { id: leaveRequest.id },
        data: {
          status: "CHECKED_IN",
          checkedInById: session.user.id,
          checkedInAt,
        },
      });

      await tx.schoolBoardingMovementLog.create({
        data: {
          companyId,
          leaveRequestId: requestRecord.id,
          studentId: requestRecord.studentId,
          movementType: "CHECK_IN",
          recordedById: session.user.id,
          recordedAt: checkedInAt,
          notes: validated.notes?.trim() || null,
        },
      });

      return tx.schoolLeaveRequest.findUnique({
        where: { id: requestRecord.id },
        include: {
          student: {
            select: { id: true, studentNo: true, firstName: true, lastName: true },
          },
          checkedInBy: { select: { id: true, name: true, email: true } },
          movementLogs: {
            include: {
              recordedBy: { select: { id: true, name: true, email: true } },
            },
            orderBy: [{ recordedAt: "desc" }],
            take: 20,
          },
        },
      });
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error(
      "[API] POST /api/v2/schools/boarding/leave-requests/[id]/check-in error:",
      error,
    );
    return errorResponse("Failed to check in leave request");
  }
}
