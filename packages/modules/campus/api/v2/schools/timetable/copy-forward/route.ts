import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "../../../../../permissions";
import { copyTimetableToTerm } from "../../../../../timetable";

const bodySchema = z.object({
  fromTermId: z.string().uuid(),
  toTermId: z.string().uuid(),
});

/**
 * Copy a term's timetable into another term.
 *
 * The alternative is rebuilding it by hand every term, which is why school
 * timetables end up living in a spreadsheet.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "create");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const validated = bodySchema.parse(await request.json());
    if (validated.fromTermId === validated.toTermId) {
      return errorResponse("Choose a different term to copy into", 400);
    }

    const terms = await prisma.schoolTerm.findMany({
      where: { companyId, id: { in: [validated.fromTermId, validated.toTermId] } },
      select: { id: true, name: true },
    });
    if (terms.length !== 2) return errorResponse("Term not found", 404);

    const result = await copyTimetableToTerm({
      companyId,
      fromTermId: validated.fromTermId,
      toTermId: validated.toTermId,
    });

    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/timetable/copy-forward error:", error);
    return errorResponse("Failed to copy the timetable");
  }
}
