import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { getCurrentTerm } from "@/lib/schools/calendar";
import { resolvePortalStudent } from "@/lib/schools/portal-identity";

const querySchema = z.object({
  dayOfWeek: z.coerce.number().int().min(1).max(7).optional(),
});

/**
 * A pupil's own week.
 *
 * No `studentId` parameter, deliberately: the S-0.2 rule is that a portal user
 * gets their own record because their account is linked to it, and the surest
 * way to keep that true is to give the endpoint no way to be told otherwise.
 * The class comes from the pupil, and the timetable from the class.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      dayOfWeek: searchParams.get("dayOfWeek") ?? undefined,
    });

    const resolved = await resolvePortalStudent(
      { companyId, userId: session.user.id, role: session.user.role },
      { select: { id: true, currentClassId: true, currentStreamId: true } },
    );
    if (!resolved.subject) return errorResponse("You are not a pupil here", 403);
    const student = resolved.subject;

    const term = await getCurrentTerm(companyId);
    if (!term || !student.currentClassId) {
      return successResponse({ slots: [] });
    }

    const slots = await prisma.schoolTimetableSlot.findMany({
      where: {
        companyId,
        termId: term.id,
        classId: student.currentClassId,
        ...(query.dayOfWeek ? { dayOfWeek: query.dayOfWeek } : {}),
        ...(student.currentStreamId
          ? { OR: [{ streamId: student.currentStreamId }, { streamId: null }] }
          : {}),
      },
      select: {
        dayOfWeek: true,
        period: { select: { id: true, code: true, name: true, startMinute: true } },
        room: { select: { name: true } },
        classSubject: {
          select: {
            subject: { select: { name: true } },
            teacherProfile: { select: { user: { select: { name: true } } } },
          },
        },
      },
      orderBy: [{ dayOfWeek: "asc" }, { period: { sequence: "asc" } }],
    });

    return successResponse({
      termId: term.id,
      slots: slots.map((slot) => ({
        dayOfWeek: slot.dayOfWeek,
        period: slot.period,
        subjectName: slot.classSubject.subject.name,
        roomName: slot.room?.name ?? null,
        teacherName: slot.classSubject.teacherProfile?.user?.name ?? null,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/portal/student/me/timetable error:", error);
    return errorResponse("Failed to load your timetable");
  }
}
