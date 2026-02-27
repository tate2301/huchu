import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  normalizeOptionalNullableString,
  schoolLeaveRequestStatusSchema,
  schoolLeaveRequestTypeSchema,
} from "../../_helpers";

const leaveRequestQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  studentId: z.string().uuid().optional(),
  allocationId: z.string().uuid().optional(),
  status: schoolLeaveRequestStatusSchema.optional(),
  requestType: schoolLeaveRequestTypeSchema.optional(),
});

const createLeaveRequestSchema = z.object({
  studentId: z.string().uuid(),
  allocationId: z.string().uuid().nullable().optional(),
  requestType: schoolLeaveRequestTypeSchema,
  startDateTime: z.string().datetime(),
  endDateTime: z.string().datetime(),
  destination: z.string().trim().min(1).max(300),
  guardianContact: z.string().trim().min(1).max(120),
  status: z.enum(["DRAFT", "SUBMITTED"]).optional(),
  reason: z.string().trim().min(1).max(1200).nullable().optional(),
});

const leaveRequestInclude = {
  student: {
    select: {
      id: true,
      studentNo: true,
      firstName: true,
      lastName: true,
      isBoarding: true,
      status: true,
    },
  },
  term: {
    select: {
      id: true,
      code: true,
      name: true,
      isActive: true,
    },
  },
  allocation: {
    select: {
      id: true,
      termId: true,
      status: true,
      startDate: true,
      endDate: true,
      hostel: { select: { id: true, code: true, name: true } },
      room: { select: { id: true, code: true } },
      bed: { select: { id: true, code: true, status: true } },
    },
  },
  approvedBy: { select: { id: true, name: true, email: true } },
  checkedOutBy: { select: { id: true, name: true, email: true } },
  checkedInBy: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  movementLogs: {
    include: {
      recordedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: [{ recordedAt: "desc" }],
    take: 20,
  },
} satisfies Prisma.SchoolLeaveRequestInclude;

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = leaveRequestQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      allocationId: searchParams.get("allocationId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      requestType: searchParams.get("requestType") ?? undefined,
    });

    const where: Prisma.SchoolLeaveRequestWhereInput = {
      companyId: session.user.companyId,
    };
    if (query.studentId) where.studentId = query.studentId;
    if (query.allocationId) where.allocationId = query.allocationId;
    if (query.status) where.status = query.status;
    if (query.requestType) where.requestType = query.requestType;
    if (query.search) {
      where.OR = [
        { destination: { contains: query.search, mode: "insensitive" } },
        { guardianContact: { contains: query.search, mode: "insensitive" } },
        { student: { studentNo: { contains: query.search, mode: "insensitive" } } },
        { student: { firstName: { contains: query.search, mode: "insensitive" } } },
        { student: { lastName: { contains: query.search, mode: "insensitive" } } },
      ];
    }

    const [records, total] = await Promise.all([
      prisma.schoolLeaveRequest.findMany({
        where,
        include: leaveRequestInclude,
        orderBy: [{ startDateTime: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolLeaveRequest.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/boarding/leave-requests error:", error);
    return errorResponse("Failed to fetch boarding leave requests");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = createLeaveRequestSchema.parse(body);
    const companyId = session.user.companyId;

    const startDateTime = new Date(validated.startDateTime);
    const endDateTime = new Date(validated.endDateTime);
    if (endDateTime <= startDateTime) {
      return errorResponse("endDateTime must be after startDateTime", 400);
    }

    const student = await prisma.schoolStudent.findFirst({
      where: { id: validated.studentId, companyId },
      select: { id: true, isBoarding: true },
    });
    if (!student) {
      return errorResponse("Invalid student for this company", 400);
    }
    if (!student.isBoarding) {
      return errorResponse("Leave requests are only allowed for boarding students", 400);
    }

    const allocation = validated.allocationId
      ? await prisma.schoolBoardingAllocation.findFirst({
          where: {
            id: validated.allocationId,
            companyId,
            studentId: validated.studentId,
            status: "ACTIVE",
          },
          select: { id: true, termId: true, status: true },
        })
      : await prisma.schoolBoardingAllocation.findFirst({
          where: {
            companyId,
            studentId: validated.studentId,
            status: "ACTIVE",
          },
          select: { id: true, termId: true, status: true },
          orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        });
    if (!allocation) {
      return errorResponse("No active boarding allocation found for student", 409);
    }

    const created = await prisma.schoolLeaveRequest.create({
      data: {
        companyId,
        studentId: validated.studentId,
        allocationId: allocation.id,
        termId: allocation.termId,
        requestType: validated.requestType,
        startDateTime,
        endDateTime,
        destination: validated.destination.trim(),
        guardianContact: validated.guardianContact.trim(),
        status: validated.status ?? "SUBMITTED",
        reason: normalizeOptionalNullableString(validated.reason) ?? null,
        createdById: session.user.id,
      },
      include: leaveRequestInclude,
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/boarding/leave-requests error:", error);
    return errorResponse("Failed to create boarding leave request");
  }
}
