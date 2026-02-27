import { NextRequest, NextResponse } from "next/server";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

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
      return errorResponse("Invalid hostel ID", 400);
    }

    const hostel = await prisma.schoolHostel.findFirst({
      where: { id, companyId: session.user.companyId },
      include: {
        rooms: {
          select: {
            id: true,
            code: true,
            floor: true,
            capacity: true,
            isActive: true,
            beds: {
              select: {
                id: true,
                code: true,
                status: true,
                isActive: true,
              },
              orderBy: { code: "asc" },
            },
            _count: {
              select: {
                beds: true,
                allocations: true,
              },
            },
          },
          orderBy: { code: "asc" },
        },
        allocations: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            status: true,
            startDate: true,
            endDate: true,
            student: {
              select: {
                id: true,
                studentNo: true,
                firstName: true,
                lastName: true,
                status: true,
              },
            },
            room: { select: { id: true, code: true } },
            bed: { select: { id: true, code: true } },
            term: { select: { id: true, code: true, name: true } },
          },
          orderBy: { startDate: "desc" },
        },
        _count: {
          select: {
            rooms: true,
            beds: true,
            allocations: true,
          },
        },
      },
    });

    if (!hostel) {
      return errorResponse("Hostel not found", 404);
    }

    return successResponse(hostel);
  } catch (error) {
    console.error("[API] GET /api/v2/schools/boarding/hostels/[id] error:", error);
    return errorResponse("Failed to fetch hostel details");
  }
}
