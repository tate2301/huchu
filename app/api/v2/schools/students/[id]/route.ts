import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { normalizeProvidedId } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import {
  isUniqueConstraintError,
  normalizeOptionalNullableString,
  nullableDateInputSchema,
  schoolStudentStatusSchema,
  toNullableDate,
} from "../../_helpers";

const updateStudentSchema = z
  .object({
    studentNo: z.string().trim().min(1).max(40).optional(),
    admissionNo: z.string().trim().min(1).max(80).nullable().optional(),
    firstName: z.string().trim().min(1).max(120).optional(),
    lastName: z.string().trim().min(1).max(120).optional(),
    dateOfBirth: nullableDateInputSchema,
    gender: z.string().trim().min(1).max(30).nullable().optional(),
    status: schoolStudentStatusSchema.optional(),
    currentClassId: z.string().uuid().nullable().optional(),
    currentStreamId: z.string().uuid().nullable().optional(),
    isBoarding: z.boolean().optional(),
    admissionDate: nullableDateInputSchema,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const studentDetailInclude = {
  currentClass: { select: { id: true, code: true, name: true } },
  currentStream: { select: { id: true, code: true, name: true, classId: true } },
  guardianLinks: {
    include: {
      guardian: {
        select: {
          id: true,
          guardianNo: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
        },
      },
    },
  },
  enrollments: {
    include: {
      term: { select: { id: true, code: true, name: true } },
      class: { select: { id: true, code: true, name: true } },
      stream: { select: { id: true, code: true, name: true } },
    },
    orderBy: { enrolledAt: "desc" as const },
  },
  boardingAllocations: {
    include: {
      hostel: { select: { id: true, code: true, name: true } },
      room: { select: { id: true, code: true, floor: true } },
      bed: { select: { id: true, code: true, status: true } },
    },
    orderBy: { startDate: "desc" as const },
  },
  resultLines: {
    include: {
      sheet: {
        select: {
          id: true,
          title: true,
          term: { select: { id: true, code: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" as const },
  },
  _count: {
    select: {
      guardianLinks: true,
      enrollments: true,
      boardingAllocations: true,
      resultLines: true,
      feeInvoices: true,
    },
  },
  feeInvoices: {
    select: {
      id: true,
      invoiceNo: true,
      totalAmount: true,
      paidAmount: true,
      balanceAmount: true,
      status: true,
      issueDate: true,
      dueDate: true,
      term: { select: { id: true, code: true, name: true } },
    },
    orderBy: { issueDate: "desc" as const },
  },
} satisfies Prisma.SchoolStudentInclude;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    if (!isValidUUID(id)) {
      return errorResponse("Invalid student ID", 400);
    }

    const student = await prisma.schoolStudent.findFirst({
      where: { id, companyId: session.user.companyId },
      include: studentDetailInclude,
    });

    if (!student) {
      return errorResponse("Student not found", 404);
    }

    return successResponse(student);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/students/[id] error:", error);
    return errorResponse("Failed to fetch student profile");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    if (!isValidUUID(id)) {
      return errorResponse("Invalid student ID", 400);
    }

    const body = await request.json();
    const validated = updateStudentSchema.parse(body);

    const existing = await prisma.schoolStudent.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        currentClassId: true,
        currentStreamId: true,
      },
    });
    if (!existing) {
      return errorResponse("Student not found", 404);
    }

    let normalizedStudentNo: string | undefined;
    if (validated.studentNo !== undefined) {
      try {
        normalizedStudentNo = normalizeProvidedId(validated.studentNo, "SCHOOL_STUDENT");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid student number format";
        return errorResponse(message, 400);
      }
    }

    let nextClassId =
      validated.currentClassId !== undefined
        ? validated.currentClassId
        : existing.currentClassId;
    const nextStreamId =
      validated.currentStreamId !== undefined
        ? validated.currentStreamId
        : existing.currentStreamId;

    if (nextClassId) {
      const schoolClass = await prisma.schoolClass.findFirst({
        where: { id: nextClassId, companyId },
        select: { id: true },
      });
      if (!schoolClass) {
        return errorResponse("Invalid class for this company", 400);
      }
    }

    if (nextStreamId) {
      const stream = await prisma.schoolStream.findFirst({
        where: { id: nextStreamId, companyId },
        select: { id: true, classId: true },
      });
      if (!stream) {
        return errorResponse("Invalid stream for this company", 400);
      }
      if (!nextClassId) {
        nextClassId = stream.classId;
      } else if (stream.classId !== nextClassId) {
        return errorResponse("Stream does not belong to the selected class", 400);
      }
    }

    const updated = await prisma.schoolStudent.update({
      where: { id: existing.id },
      data: {
        ...(normalizedStudentNo !== undefined ? { studentNo: normalizedStudentNo } : {}),
        ...(validated.admissionNo !== undefined
          ? {
              admissionNo: normalizeOptionalNullableString(validated.admissionNo) ?? null,
            }
          : {}),
        ...(validated.firstName !== undefined ? { firstName: validated.firstName } : {}),
        ...(validated.lastName !== undefined ? { lastName: validated.lastName } : {}),
        ...(validated.dateOfBirth !== undefined
          ? { dateOfBirth: toNullableDate(validated.dateOfBirth) }
          : {}),
        ...(validated.gender !== undefined
          ? { gender: normalizeOptionalNullableString(validated.gender) ?? null }
          : {}),
        ...(validated.status !== undefined ? { status: validated.status } : {}),
        ...(validated.currentClassId !== undefined || validated.currentStreamId !== undefined
          ? {
              currentClassId: nextClassId,
              currentStreamId: nextStreamId,
            }
          : {}),
        ...(validated.isBoarding !== undefined ? { isBoarding: validated.isBoarding } : {}),
        ...(validated.admissionDate !== undefined
          ? { admissionDate: toNullableDate(validated.admissionDate) }
          : {}),
      },
      include: studentDetailInclude,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("Student number or admission number already exists", 409);
    }
    console.error("[API] PATCH /api/v2/schools/students/[id] error:", error);
    return errorResponse("Failed to update student profile");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    if (!isValidUUID(id)) {
      return errorResponse("Invalid student ID", 400);
    }

    const existing = await prisma.schoolStudent.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        _count: {
          select: {
            guardianLinks: true,
            enrollments: true,
            boardingAllocations: true,
            leaveRequests: true,
            boardingMovementLogs: true,
            resultLines: true,
            attendanceSessionLines: true,
            feeInvoices: true,
            feeReceipts: true,
            feeWaivers: true,
          },
        },
      },
    });
    if (!existing) {
      return errorResponse("Student not found", 404);
    }

    const dependencyCounts = {
      guardianLinks: existing._count.guardianLinks,
      enrollments: existing._count.enrollments,
      boardingAllocations: existing._count.boardingAllocations,
      leaveRequests: existing._count.leaveRequests,
      boardingMovementLogs: existing._count.boardingMovementLogs,
      resultLines: existing._count.resultLines,
      attendanceSessionLines: existing._count.attendanceSessionLines,
      feeInvoices: existing._count.feeInvoices,
      feeReceipts: existing._count.feeReceipts,
      feeWaivers: existing._count.feeWaivers,
    };
    const inUseBy = Object.fromEntries(
      Object.entries(dependencyCounts).filter(([, count]) => count > 0),
    );

    if (Object.keys(inUseBy).length > 0) {
      return errorResponse(
        "Cannot delete student because related records exist",
        409,
        { inUseBy },
      );
    }

    await prisma.schoolStudent.delete({
      where: { id: existing.id },
    });
    return successResponse({ id: existing.id, deleted: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return errorResponse("Cannot delete student because related records exist", 409);
    }
    console.error("[API] DELETE /api/v2/schools/students/[id] error:", error);
    return errorResponse("Failed to delete student");
  }
}
