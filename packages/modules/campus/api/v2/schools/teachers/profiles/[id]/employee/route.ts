import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { schoolPermissionDenial } from "../../../../../../../permissions";
import {
  linkTeacherToEmployee,
  suggestEmployeesForTeacher,
  TeacherLinkError,
  unlinkTeacherFromEmployee,
} from "../../../../../../../teacher-identity";

const linkSchema = z.object({ employeeId: z.string().uuid() });

/** Employees who might be this teacher, strongest signal first. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.teachers", "view");
    if (denied) return errorResponse(denied, 403);

    const { id } = await context.params;
    const suggestions = await suggestEmployeesForTeacher({
      companyId: session.user.companyId,
      teacherProfileId: id,
    });
    return successResponse({ suggestions });
  } catch (error) {
    if (error instanceof TeacherLinkError) return errorResponse(error.message, 404);
    console.error("[API] GET /api/v2/schools/teachers/profiles/[id]/employee:", error);
    return errorResponse("Failed to look for a matching employee");
  }
}

/**
 * Bind the two records.
 *
 * `edit` on teachers rather than a weaker grant: getting this wrong puts one
 * person's payslip against another's classes, and the refusals in
 * `linkTeacherToEmployee` are what stop the plausible-looking mistakes.
 */
export async function PUT(
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
    const validated = linkSchema.parse(await request.json());

    const linked = await linkTeacherToEmployee({
      companyId: session.user.companyId,
      teacherProfileId: id,
      employeeId: validated.employeeId,
    });
    return successResponse(linked);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof TeacherLinkError) return errorResponse(error.message, 409);
    console.error("[API] PUT /api/v2/schools/teachers/profiles/[id]/employee:", error);
    return errorResponse("Failed to link the employee record");
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

    const denied = schoolPermissionDenial(session, "schools.teachers", "edit");
    if (denied) return errorResponse(denied, 403);

    const { id } = await context.params;
    const unlinked = await unlinkTeacherFromEmployee({
      companyId: session.user.companyId,
      teacherProfileId: id,
    });
    return successResponse(unlinked);
  } catch (error) {
    if (error instanceof TeacherLinkError) return errorResponse(error.message, 404);
    console.error("[API] DELETE /api/v2/schools/teachers/profiles/[id]/employee:", error);
    return errorResponse("Failed to unlink the employee record");
  }
}
