import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "../../../../../permissions";
import {
  activateTerm,
  findOverlappingTerm,
  isDateRangeValid,
} from "../../../../../calendar";
import { isUniqueConstraintError, optionalDateInputSchema } from "../../_helpers";

const updateSchema = z
  .object({
    code: z.string().trim().min(1).max(40).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    startDate: optionalDateInputSchema,
    endDate: optionalDateInputSchema,
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const termInclude = {
  academicYear: {
    select: { id: true, code: true, name: true, isActive: true },
  },
  _count: {
    select: {
      enrollments: true,
      feeInvoices: true,
      resultSheets: true,
      classSubjects: true,
    },
  },
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "view");
    if (denied) return errorResponse(denied, 403);
    const { id } = await context.params;
    if (!isValidUUID(id)) return errorResponse("Invalid term id", 400);

    const record = await prisma.schoolTerm.findFirst({
      where: { id, companyId: session.user.companyId },
      include: termInclude,
    });
    if (!record) return errorResponse("Term not found", 404);

    return successResponse(record);
  } catch (error) {
    console.error("[API] GET /api/v2/schools/terms/[id] error:", error);
    return errorResponse("Failed to fetch term");
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await context.params;
    if (!isValidUUID(id)) return errorResponse("Invalid term id", 400);

    const existing = await prisma.schoolTerm.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        academicYearId: true,
        academicYear: {
          select: { code: true, name: true, startDate: true, endDate: true },
        },
      },
    });
    if (!existing) return errorResponse("Term not found", 404);

    const validated = updateSchema.parse(await request.json());
    const startDate = validated.startDate
      ? new Date(validated.startDate)
      : existing.startDate;
    const endDate = validated.endDate ? new Date(validated.endDate) : existing.endDate;

    if (!isDateRangeValid(startDate, endDate)) {
      return errorResponse("The term must end after it starts", 400);
    }

    if (validated.startDate || validated.endDate) {
      if (
        startDate < existing.academicYear.startDate ||
        endDate > existing.academicYear.endDate
      ) {
        return errorResponse(
          `The term must fall inside ${existing.academicYear.code} - ${existing.academicYear.name}`,
          400,
        );
      }

      const overlapping = await findOverlappingTerm({
        companyId,
        academicYearId: existing.academicYearId,
        startDate,
        endDate,
        excludeTermId: id,
      });
      if (overlapping) {
        return errorResponse(
          `These dates overlap ${overlapping.code} - ${overlapping.name}. Terms in one year cannot overlap.`,
          409,
        );
      }
    }

    if (validated.isActive === true) {
      await activateTerm({ companyId, termId: id });
    }

    const updated = await prisma.schoolTerm.update({
      where: { id },
      data: {
        ...(validated.code === undefined ? {} : { code: validated.code }),
        ...(validated.name === undefined ? {} : { name: validated.name }),
        ...(validated.startDate === undefined ? {} : { startDate }),
        ...(validated.endDate === undefined ? {} : { endDate }),
        ...(validated.isActive === false ? { isActive: false } : {}),
      },
      include: termInclude,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse(
        "A term with this code already exists in this academic year",
        409,
      );
    }
    console.error("[API] PATCH /api/v2/schools/terms/[id] error:", error);
    return errorResponse("Failed to update term");
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "archive");
    if (denied) return errorResponse(denied, 403);
    const { id } = await context.params;
    if (!isValidUUID(id)) return errorResponse("Invalid term id", 400);

    const existing = await prisma.schoolTerm.findFirst({
      where: { id, companyId: session.user.companyId },
      select: {
        id: true,
        _count: {
          select: {
            enrollments: true,
            feeInvoices: true,
            resultSheets: true,
            classSubjects: true,
            boardingAllocations: true,
          },
        },
      },
    });
    if (!existing) return errorResponse("Term not found", 404);

    const attached =
      existing._count.enrollments +
      existing._count.feeInvoices +
      existing._count.resultSheets +
      existing._count.classSubjects +
      existing._count.boardingAllocations;

    // A term is the key half of every register, invoice and result sheet. Once
    // anything references it, deleting is data loss dressed as tidying up.
    if (attached > 0) {
      return errorResponse(
        "This term has enrolments, invoices, result sheets or assignments attached and cannot be deleted",
        409,
      );
    }

    await prisma.schoolTerm.delete({ where: { id } });
    return successResponse({ id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/terms/[id] error:", error);
    return errorResponse("Failed to delete term");
  }
}
