import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { loadTeacherDay } from "@corelithzw/module-campus/teacher-day-loader";

const querySchema = z.object({
  onDate: z.string().date().optional(),
  termId: z.string().uuid().optional(),
});

/**
 * A teacher's day, for refetching after they change something.
 *
 * The portal's *first* copy comes from the layout, which loads it on the
 * server — see `lib/schools/teacher-day-loader.ts`. This route is what the
 * client calls afterwards, when a saved register should move the counts.
 *
 * No `schoolPermissionDenial` guard: it is scoped to the caller's own teacher
 * profile and returns nothing when there isn't one, so there is no wider grant
 * for it to check.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      onDate: searchParams.get("onDate") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
    });

    const day = await loadTeacherDay({
      companyId: session.user.companyId,
      userId: session.user.id,
      ...(query.onDate ? { onDate: new Date(query.onDate) } : {}),
      ...(query.termId ? { termId: query.termId } : {}),
    });

    return successResponse(day);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/portal/teacher/me/today error:", error);
    return errorResponse("Failed to load your day");
  }
}
