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
import { schoolBoardingAllocationStatusSchema } from "../_helpers";

const boardingQuerySchema = z.object({
  status: schoolBoardingAllocationStatusSchema.optional(),
  termId: z.string().uuid().optional(),
  hostelId: z.string().uuid().optional(),
  search: z.string().trim().min(1).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = boardingQuerySchema.parse({
      status: searchParams.get("status") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
      hostelId: searchParams.get("hostelId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    const where: Prisma.SchoolBoardingAllocationWhereInput = { companyId };
    if (query.status) where.status = query.status;
    if (query.termId) where.termId = query.termId;
    if (query.hostelId) where.hostelId = query.hostelId;
    if (query.search) {
      where.OR = [
        { student: { studentNo: { contains: query.search, mode: "insensitive" } } },
        { student: { firstName: { contains: query.search, mode: "insensitive" } } },
        { student: { lastName: { contains: query.search, mode: "insensitive" } } },
        { hostel: { name: { contains: query.search, mode: "insensitive" } } },
        { room: { code: { contains: query.search, mode: "insensitive" } } },
        { bed: { code: { contains: query.search, mode: "insensitive" } } },
      ];
    }

    const [allocations, total, hostels, activeAllocations] = await Promise.all([
      prisma.schoolBoardingAllocation.findMany({
        where,
        include: {
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
          term: { select: { id: true, code: true, name: true, isActive: true } },
          hostel: { select: { id: true, code: true, name: true, isActive: true } },
          room: { select: { id: true, code: true, isActive: true } },
          bed: { select: { id: true, code: true, status: true, isActive: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolBoardingAllocation.count({ where }),
      prisma.schoolHostel.findMany({
        where: { companyId },
        include: {
          _count: {
            select: {
              rooms: true,
              beds: true,
              allocations: true,
            },
          },
        },
        orderBy: [{ name: "asc" }],
      }),
      prisma.schoolBoardingAllocation.count({
        where: {
          companyId,
          status: "ACTIVE",
        },
      }),
    ]);

    const paged = paginationResponse(allocations, total, page, limit);

    return successResponse({
      success: true,
      data: {
        resource: "schools-boarding",
        companyId,
        ...paged,
        hostels,
        summary: {
          activeAllocations,
          listedAllocations: allocations.length,
          totalAllocations: total,
          hostels: hostels.length,
          rooms: hostels.reduce((sum, hostel) => sum + hostel._count.rooms, 0),
          beds: hostels.reduce((sum, hostel) => sum + hostel._count.beds, 0),
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/boarding error:", error);
    return errorResponse("Failed to fetch schools boarding data");
  }
}
