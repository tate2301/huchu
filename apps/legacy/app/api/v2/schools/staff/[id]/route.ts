import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * Editing one of the school's non-teaching staff, and ending their employment.
 *
 * Scoped the same way the list is: an employee only answers here if they carry
 * the SCHOOLS assignment and are not a teacher. Without that check this route
 * would be a way for a school office to edit the company's payroll records
 * through a school-shaped door, which is the thing the HR permission matrix is
 * deliberately keeping shut.
 */

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().min(1).max(40).optional(),
  jobTitle: z.string().trim().max(200).nullable().optional(),
  position: z.string().trim().min(1).max(60).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "CASUAL"]).optional(),
  hireDate: z.string().trim().min(1).nullable().optional(),
  nextOfKinName: z.string().trim().min(1).max(200).optional(),
  nextOfKinPhone: z.string().trim().min(1).max(40).optional(),
  villageOfOrigin: z.string().trim().min(1).max(200).optional(),
  nationalIdNumber: z.string().trim().max(100).nullable().optional(),
  // The leaver's switch. Their record stays — a final payslip, a leave balance
  // and anything on file all hang off it.
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.teachers", "edit");
    if (denied) return errorResponse(denied, 403);

    const { id } = await context.params;
    const companyId = session.user.companyId;

    const existing = await prisma.employee.findFirst({
      where: {
        id,
        companyId,
        moduleAssignments: { some: { isActive: true, module: "SCHOOLS" } },
        position: { not: "TEACHER" },
      },
      select: { id: true },
    });
    if (!existing) return errorResponse("That staff member is not on this school's list", 404);

    const validated = updateSchema.parse(await request.json());
    if (validated.position === "TEACHER") {
      return errorResponse(
        "A teacher belongs under Teaching staff, where their subjects and classes live.",
        400,
      );
    }

    if (validated.departmentId) {
      const department = await prisma.department.findFirst({
        where: { id: validated.departmentId, companyId },
        select: { id: true },
      });
      if (!department) return errorResponse("That department is not this school's", 400);
    }

    // Only what was sent. An absent key means "leave it"; an explicit null
    // means "clear it", which is how the sheet empties a job title.
    const data: Record<string, unknown> = {};
    for (const key of [
      "name",
      "phone",
      "jobTitle",
      "position",
      "departmentId",
      "employmentType",
      "nextOfKinName",
      "nextOfKinPhone",
      "villageOfOrigin",
      "nationalIdNumber",
      "isActive",
    ] as const) {
      if (validated[key] !== undefined) data[key] = validated[key];
    }
    if (validated.hireDate !== undefined) {
      data.hireDate = validated.hireDate ? new Date(validated.hireDate) : null;
    }

    const employee = await prisma.employee.update({
      where: { id },
      data,
      select: { id: true, employeeId: true, name: true, isActive: true },
    });

    return successResponse(employee);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/staff/[id] error:", error);
    return errorResponse("Failed to save the staff member");
  }
}
