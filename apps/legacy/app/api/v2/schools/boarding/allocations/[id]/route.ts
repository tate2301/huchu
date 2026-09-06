import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@corelithzw/db";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@corelithzw/module-campus/permissions";
import { AllocationRefusedError, endAllocation } from "@corelithzw/module-campus/boarding";
import {
  isUniqueConstraintError,
  normalizeOptionalNullableString,
  nullableDateInputSchema,
  optionalDateInputSchema,
  schoolBoardingAllocationStatusSchema,
  toNullableDate,
  toOptionalDate,
} from "../../../_helpers";

/**
 * One boarding allocation, once it exists.
 *
 * The bed board has always called this route to free a bed and there was
 * nothing here to answer it — every "Free the bed" button on the board was a
 * 404 dressed up as a save error. Ending an allocation goes through
 * `endAllocation` rather than a bare update because releasing the bed, and
 * clearing `isBoarding` when the child has no live allocation left, are the
 * other two thirds of the act.
 *
 * Moving a child between beds stays a `POST /allocations` — the new bed has to
 * survive the gender and capacity checks, and a PATCH that skipped them would
 * be the one way into a girls' house nobody guarded.
 */
const updateAllocationSchema = z
  .object({
    status: schoolBoardingAllocationStatusSchema.optional(),
    startDate: optionalDateInputSchema,
    endDate: nullableDateInputSchema,
    reason: z.string().trim().min(1).max(1000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const allocationInclude = {
  student: {
    select: {
      id: true,
      studentNo: true,
      firstName: true,
      lastName: true,
      status: true,
      isBoarding: true,
    },
  },
  term: { select: { id: true, code: true, name: true } },
  hostel: { select: { id: true, code: true, name: true } },
  room: { select: { id: true, code: true, floor: true } },
  bed: { select: { id: true, code: true, status: true, isActive: true } },
} satisfies Prisma.SchoolBoardingAllocationInclude;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "allocate-bed");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid allocation ID", 400);

    const validated = updateAllocationSchema.parse(await request.json());

    const existing = await prisma.schoolBoardingAllocation.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });
    if (!existing) return errorResponse("Allocation not found", 404);

    // Ending is not a status change, it is three: the row closes, the bed goes
    // back on the board, and the child stops being a boarder if this was the
    // last one. `endAllocation` owns all three.
    if (validated.status === "ENDED" && existing.status !== "ENDED") {
      await endAllocation({
        companyId,
        allocationId: existing.id,
        endDate: toOptionalDate(validated.endDate) ?? new Date(),
        reason: normalizeOptionalNullableString(validated.reason) ?? null,
      });
    } else {
      await prisma.schoolBoardingAllocation.update({
        where: { id: existing.id },
        data: {
          ...(validated.status !== undefined ? { status: validated.status } : {}),
          ...(validated.startDate !== undefined
            ? { startDate: toOptionalDate(validated.startDate) }
            : {}),
          ...(validated.endDate !== undefined
            ? { endDate: toNullableDate(validated.endDate) }
            : {}),
          ...(validated.reason !== undefined
            ? { reason: normalizeOptionalNullableString(validated.reason) }
            : {}),
        },
      });
    }

    const allocation = await prisma.schoolBoardingAllocation.findUniqueOrThrow({
      where: { id: existing.id },
      include: allocationInclude,
    });

    return successResponse(allocation);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof AllocationRefusedError) {
      return errorResponse(error.message, 409);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("Boarding allocation conflict", 409);
    }
    console.error("[API] PATCH /api/v2/schools/boarding/allocations/[id] error:", error);
    return errorResponse("Failed to update the boarding allocation");
  }
}

/**
 * Rub out an allocation that should never have been made.
 *
 * Distinct from ending one: ending records that a child left, deleting records
 * that they were never here. A row with leave requests hanging off it has a
 * history worth keeping, so that one is refused rather than cascaded.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "archive");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid allocation ID", 400);

    const existing = await prisma.schoolBoardingAllocation.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        bedId: true,
        studentId: true,
        _count: { select: { leaveRequests: true } },
      },
    });
    if (!existing) return errorResponse("Allocation not found", 404);

    if (existing._count.leaveRequests > 0) {
      return errorResponse(
        "This allocation has leave requests against it. End it instead of deleting it.",
        409,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.schoolBoardingAllocation.delete({ where: { id: existing.id } });
      if (existing.bedId) {
        await tx.schoolHostelBed.update({
          where: { id: existing.bedId },
          data: { status: "AVAILABLE" },
        });
      }
      const stillBoarding = await tx.schoolBoardingAllocation.count({
        where: { companyId, studentId: existing.studentId, status: "ACTIVE" },
      });
      if (stillBoarding === 0) {
        await tx.schoolStudent.update({
          where: { id: existing.studentId },
          data: { isBoarding: false },
        });
      }
    });

    return successResponse({ id: existing.id, deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/boarding/allocations/[id] error:", error);
    return errorResponse("Failed to delete the boarding allocation");
  }
}
