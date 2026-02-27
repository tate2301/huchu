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
  isUniqueConstraintError,
  normalizeOptionalNullableString,
  nullableDateInputSchema,
  optionalDateInputSchema,
  schoolBoardingAllocationStatusSchema,
  toNullableDate,
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

    const body = await request.json();
    const validated = createAllocationSchema.parse(body);
    const companyId = session.user.companyId;

    const [student, term, hostel, room, bed] = await Promise.all([
      prisma.schoolStudent.findFirst({
        where: { id: validated.studentId, companyId },
        select: { id: true },
      }),
      prisma.schoolTerm.findFirst({
        where: { id: validated.termId, companyId },
        select: { id: true },
      }),
      prisma.schoolHostel.findFirst({
        where: { id: validated.hostelId, companyId },
        select: { id: true },
      }),
      validated.roomId
        ? prisma.schoolHostelRoom.findFirst({
            where: { id: validated.roomId, companyId },
            select: { id: true, hostelId: true, isActive: true },
          })
        : Promise.resolve(null),
      validated.bedId
        ? prisma.schoolHostelBed.findFirst({
            where: { id: validated.bedId, companyId },
            select: { id: true, hostelId: true, roomId: true, status: true, isActive: true },
          })
        : Promise.resolve(null),
    ]);

    if (!student) return errorResponse("Invalid student for this company", 400);
    if (!term) return errorResponse("Invalid term for this company", 400);
    if (!hostel) return errorResponse("Invalid hostel for this company", 400);
    if (validated.roomId && !room) {
      return errorResponse("Invalid room for this company", 400);
    }
    if (validated.bedId && !bed) {
      return errorResponse("Invalid bed for this company", 400);
    }
    if (room && room.hostelId !== validated.hostelId) {
      return errorResponse("Room does not belong to the selected hostel", 400);
    }
    if (bed && bed.hostelId !== validated.hostelId) {
      return errorResponse("Bed does not belong to the selected hostel", 400);
    }
    if (validated.roomId && bed && bed.roomId !== validated.roomId) {
      return errorResponse("Bed does not belong to the selected room", 400);
    }
    if (room && !room.isActive) {
      return errorResponse("Selected room is inactive", 400);
    }
    if (bed && !bed.isActive) {
      return errorResponse("Selected bed is inactive", 400);
    }

    const startDate = toOptionalDate(validated.startDate) ?? new Date();
    const endDate = toNullableDate(validated.endDate);
    if (endDate && endDate < startDate) {
      return errorResponse("endDate cannot be before startDate", 400);
    }

    const status = validated.status ?? "ACTIVE";
    if (status === "ACTIVE") {
      const [existingStudentAllocation, existingBedAllocation] = await Promise.all([
        prisma.schoolBoardingAllocation.findFirst({
          where: {
            companyId,
            studentId: validated.studentId,
            termId: validated.termId,
            status: "ACTIVE",
            OR: [{ endDate: null }, { endDate: { gte: startDate } }],
          },
          select: { id: true },
        }),
        validated.bedId
          ? prisma.schoolBoardingAllocation.findFirst({
              where: {
                companyId,
                bedId: validated.bedId,
                status: "ACTIVE",
                OR: [{ endDate: null }, { endDate: { gte: startDate } }],
              },
              select: { id: true },
            })
          : Promise.resolve(null),
      ]);

      if (existingStudentAllocation) {
        return errorResponse(
          "Student already has an active boarding allocation for this term",
          409,
        );
      }
      if (existingBedAllocation) {
        return errorResponse("Selected bed is already allocated", 409);
      }
    }

    const roomId = validated.roomId ?? bed?.roomId ?? null;
    const allocation = await prisma.$transaction(async (tx) => {
      const created = await tx.schoolBoardingAllocation.create({
        data: {
          companyId,
          studentId: validated.studentId,
          termId: validated.termId,
          hostelId: validated.hostelId,
          roomId,
          bedId: validated.bedId ?? null,
          status,
          startDate,
          endDate,
          reason: normalizeOptionalNullableString(validated.reason) ?? null,
        },
        include: allocationInclude,
      });

      if (status === "ACTIVE" && !endDate) {
        await tx.schoolStudent.update({
          where: { id: validated.studentId },
          data: { isBoarding: true },
        });
        if (validated.bedId) {
          await tx.schoolHostelBed.update({
            where: { id: validated.bedId },
            data: { status: "OCCUPIED" },
          });
        }
      }

      return created;
    });

    return successResponse(allocation, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("Boarding allocation conflict", 409);
    }
    console.error("[API] POST /api/v2/schools/boarding/allocations error:", error);
    return errorResponse("Failed to create boarding allocation");
  }
}

