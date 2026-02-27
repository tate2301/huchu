import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const companyId = session.user.companyId;
    const [students, guardians, enrollments, boardingAllocations, resultSheets] =
      await Promise.all([
        prisma.schoolStudent.count({ where: { companyId } }),
        prisma.schoolGuardian.count({ where: { companyId } }),
        prisma.schoolEnrollment.count({ where: { companyId } }),
        prisma.schoolBoardingAllocation.count({ where: { companyId } }),
        prisma.schoolResultSheet.count({ where: { companyId } }),
      ]);

    const counts = {
      students,
      guardians,
      enrollments,
      boardingAllocations,
      resultSheets,
    };

    return successResponse({
      success: true,
      data: {
        resource: "schools",
        companyId,
        counts,
        count: Object.keys(counts).length,
        records: [
          { id: "students", name: String(students) },
          { id: "guardians", name: String(guardians) },
          { id: "enrollments", name: String(enrollments) },
          { id: "boarding-allocations", name: String(boardingAllocations) },
          { id: "result-sheets", name: String(resultSheets) },
        ],
      },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools error:", error);
    return errorResponse("Failed to fetch schools v2 data");
  }
}
