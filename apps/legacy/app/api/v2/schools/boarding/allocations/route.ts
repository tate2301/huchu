import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@corelithzw/db";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { allocateBed, AllocationRefusedError } from "@/lib/schools/boarding";
import {
  isUniqueConstraintError,
  normalizeOptionalNullableString,
  nullableDateInputSchema,
  optionalDateInputSchema,
  schoolBoardingAllocationStatusSchema,
  toOptionalDate,
} from "../../_helpers";

const allocationQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  studentId: z.string().uuid().optional(),
  termId: z.string().uuid().optional(),
  hostelId: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  bedId: z.string().uuid().optional(),
  status: schoolBoardingAllocationStatusSchema.optional(),
});

const createAllocationSchema = z.object({
  studentId: z.string().uuid(),
  termId: z.string().uuid(),
  hostelId: z.string().uuid(),
  roomId: z.string().uuid().nullable().optional(),
  bedId: z.string().uuid().nullable().optional(),
  status: schoolBoardingAllocationStatusSchema.optional(),
  startDate: optionalDateInputSchema,
  endDate: nullableDateInputSchema,
  reason: z.string().trim().min(1).max(1000).nullable().optional(),
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
  term: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  hostel: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  room: {
    select: {
      id: true,
      code: true,
      floor: true,
    },
  },
  bed: {
    select: {
      id: true,
      code: true,
      status: true,
      isActive: true,
    },
  },
} satisfies Prisma.SchoolBoardingAllocationInclude;

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "view");
    if (denied) return errorResponse(denied, 403);
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = allocationQuerySchema.parse({
      search: searchParams.get("search") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
      hostelId: searchParams.get("hostelId") ?? undefined,
      roomId: searchParams.get("roomId") ?? undefined,
      bedId: searchParams.get("bedId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    const where: Prisma.SchoolBoardingAllocationWhereInput = {
      companyId: session.user.companyId,
    };

    if (query.search) {
      where.student = {
        OR: [
          { studentNo: { contains: query.search, mode: "insensitive" } },
          { firstName: { contains: query.search, mode: "insensitive" } },
          { lastName: { contains: query.search, mode: "insensitive" } },
        ],
      };
    }
    if (query.studentId) where.studentId = query.studentId;
    if (query.termId) where.termId = query.termId;
    if (query.hostelId) where.hostelId = query.hostelId;
    if (query.roomId) where.roomId = query.roomId;
    if (query.bedId) where.bedId = query.bedId;
    if (query.status) where.status = query.status;

    const [records, total] = await Promise.all([
      prisma.schoolBoardingAllocation.findMany({
        where,
        include: allocationInclude,
        orderBy: [{ startDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolBoardingAllocation.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/boarding/allocations error:", error);
    return errorResponse("Failed to fetch boarding allocations");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "allocate-bed");
    if (denied) return errorResponse(denied, 403);

    const body = await request.json();
    const validated = createAllocationSchema.parse(body);
    const companyId = session.user.companyId;

    // All of the checking — gender policy, capacity, whose bed it is, and the
    // race the partial indexes close — lives in `lib/schools/boarding.ts`. This
    // handler used to carry sixty lines of its own, none of which could survive
    // two wardens saving at the same moment.
    const created = await allocateBed({
      companyId,
      studentId: validated.studentId,
      termId: validated.termId,
      hostelId: validated.hostelId,
      roomId: validated.roomId ?? null,
      bedId: validated.bedId ?? null,
      startDate: toOptionalDate(validated.startDate),
      reason: normalizeOptionalNullableString(validated.reason) ?? null,
    });

    const allocation = await prisma.schoolBoardingAllocation.findUniqueOrThrow({
      where: { id: created.id },
      include: allocationInclude,
    });

    return successResponse(allocation, 201);
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
    console.error("[API] POST /api/v2/schools/boarding/allocations error:", error);
    return errorResponse("Failed to create boarding allocation");
  }
}

