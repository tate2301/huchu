import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { getTeacherProfile, isPrivilegedRole } from "@/lib/schools/governance-v2";
import { classRegister, RegisterError } from "@/lib/schools/register";

const querySchema = z.object({
  classSubjectId: z.string().uuid(),
  onDate: z.string().date().optional(),
});

/**
 * The register a teacher is about to take.
 *
 * Scoped to the caller's own assignment, the same rule the write side at
 * `me/attendance` enforces: a teacher reads the roll of a class they teach and
 * of no other. A privileged caller — a head covering a lesson — is let
 * through, because the office already has that reach on the admin side and a
 * second answer here would be a different one.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      classSubjectId: searchParams.get("classSubjectId") ?? undefined,
      onDate: searchParams.get("onDate") ?? undefined,
    });

    if (!isPrivilegedRole(session.user.role)) {
      const profile = await getTeacherProfile(companyId, session.user.id);
      if (!profile) {
        return errorResponse("You are not linked to a teacher profile", 403);
      }
      const mine = await prisma.schoolClassSubject.findFirst({
        where: {
          id: query.classSubjectId,
          companyId,
          teacherProfileId: profile.id,
          isActive: true,
        },
        select: { id: true },
      });
      if (!mine) return errorResponse("That class is not one of yours", 403);
    }

    const register = await classRegister({
      companyId,
      classSubjectId: query.classSubjectId,
      onDate: query.onDate ? new Date(query.onDate) : new Date(),
    });

    return successResponse(register);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof RegisterError) return errorResponse(error.message, 404);
    console.error("[API] GET /api/v2/schools/portal/teacher/me/register error:", error);
    return errorResponse("Failed to load the register");
  }
}
