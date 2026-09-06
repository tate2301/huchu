import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { getCurrentTerm } from "@/lib/schools/calendar";
import { getTeacherProfile } from "@/lib/schools/governance-v2";
import { teacherReport } from "@/lib/schools/teacher-reports";

const querySchema = z.object({
  termId: z.string().uuid().optional(),
});

/**
 * How the caller's own classes are doing this term.
 *
 * Scoped to the teacher asking, and to nobody else — there is no
 * `teacherProfileId` parameter, deliberately. The same numbers for the whole
 * school are an admin question with an admin screen and an admin permission;
 * letting this route answer it because a query string said so would put every
 * class in the school behind a teacher's own login.
 *
 * That is also why a privileged caller is not waved through the way
 * `me/register` waves a head of department through. A register has an obvious
 * meaning for somebody covering a lesson. "My classes" does not: a head who is
 * not timetabled has no classes, and the honest answer is the empty one this
 * returns rather than somebody else's.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      termId: searchParams.get("termId") ?? undefined,
    });

    const profile = await getTeacherProfile(companyId, session.user.id);
    if (!profile) {
      return errorResponse("You are not linked to a teacher profile", 403);
    }

    const term = query.termId
      ? await prisma.schoolTerm.findFirst({
          where: { id: query.termId, companyId },
          select: { id: true, code: true, name: true },
        })
      : await getCurrentTerm(companyId);

    if (!term) {
      // No term is not an error. A school between terms has a teacher portal
      // that still opens, and a 404 here would read as a broken screen.
      return successResponse({
        term: null,
        report: null,
      });
    }

    const report = await teacherReport({
      companyId,
      teacherProfileId: profile.id,
      termId: term.id,
    });

    return successResponse({
      term: { id: term.id, code: term.code, name: term.name },
      report,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/portal/teacher/me/reports error:", error);
    return errorResponse("Failed to load your reports");
  }
}
