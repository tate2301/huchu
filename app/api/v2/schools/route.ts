import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const companyId = session.user.companyId;
    const [
      students,
      guardians,
      enrollments,
      boardingAllocations,
      resultSheets,
      resultModerationActions,
      teacherProfiles,
      subjects,
      classSubjects,
      publishWindows,
      feeStructures,
      feeInvoices,
      feeReceipts,
      feeWaivers,
    ] =
      await Promise.all([
        prisma.schoolStudent.count({ where: { companyId } }),
        prisma.schoolGuardian.count({ where: { companyId } }),
        prisma.schoolEnrollment.count({ where: { companyId } }),
        prisma.schoolBoardingAllocation.count({ where: { companyId } }),
        prisma.schoolResultSheet.count({ where: { companyId } }),
        prisma.schoolResultModerationAction.count({ where: { companyId } }),
        prisma.schoolTeacherProfile.count({ where: { companyId } }),
        prisma.schoolSubject.count({ where: { companyId } }),
        prisma.schoolClassSubject.count({ where: { companyId } }),
        prisma.schoolPublishWindow.count({ where: { companyId } }),
        prisma.schoolFeeStructure.count({ where: { companyId } }),
        prisma.schoolFeeInvoice.count({ where: { companyId } }),
        prisma.schoolFeeReceipt.count({ where: { companyId } }),
        prisma.schoolFeeWaiver.count({ where: { companyId } }),
      ]);

    const counts = {
      students,
      guardians,
      enrollments,
      boardingAllocations,
      resultSheets,
      resultModerationActions,
      teacherProfiles,
      subjects,
      classSubjects,
      publishWindows,
      feeStructures,
      feeInvoices,
      feeReceipts,
      feeWaivers,
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
          { id: "result-moderation-actions", name: String(resultModerationActions) },
          { id: "teacher-profiles", name: String(teacherProfiles) },
          { id: "subjects", name: String(subjects) },
          { id: "class-subject-assignments", name: String(classSubjects) },
          { id: "publish-windows", name: String(publishWindows) },
          { id: "fee-structures", name: String(feeStructures) },
          { id: "fee-invoices", name: String(feeInvoices) },
          { id: "fee-receipts", name: String(feeReceipts) },
          { id: "fee-waivers", name: String(feeWaivers) },
        ],
      },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools error:", error);
    return errorResponse("Failed to fetch schools v2 data");
  }
}
