import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { getTeacherProfile } from "@/lib/schools/governance-v2";
import {
  bookMeeting,
  meetingSchedule,
  MeetingError,
  openMeetingSlots,
  releaseMeeting,
} from "@/lib/schools/goals-meetings";

const querySchema = z.object({
  from: z.string().date(),
  to: z.string().date(),
  teacherProfileId: z.string().uuid().optional(),
  mine: z.coerce.boolean().optional(),
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("open"),
    teacherProfileId: z.string().uuid().optional(),
    from: z.string().datetime(),
    to: z.string().datetime(),
    minutesEach: z.number().int().min(5).max(120),
    location: z.string().trim().max(160).nullish(),
  }),
  z.object({
    action: z.literal("book"),
    meetingId: z.string().uuid(),
    studentId: z.string().uuid(),
    guardianId: z.string().uuid().nullish(),
    notes: z.string().trim().max(500).nullish(),
  }),
  z.object({ action: z.literal("release"), meetingId: z.string().uuid() }),
]);

/** A teacher's evening, free slots included. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      teacherProfileId: searchParams.get("teacherProfileId") ?? undefined,
      mine: searchParams.get("mine") ?? undefined,
    });

    let teacherProfileId = query.teacherProfileId;
    if (query.mine) {
      const profile = await getTeacherProfile(companyId, session.user.id);
      if (!profile) return errorResponse("You do not have a teacher profile", 403);
      teacherProfileId = profile.id;
    }

    const slots = await meetingSchedule({
      companyId,
      teacherProfileId,
      from: new Date(query.from),
      to: new Date(`${query.to}T23:59:59.999Z`),
    });

    return successResponse({ slots });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/meetings error:", error);
    return errorResponse("Failed to fetch the schedule");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const validated = bodySchema.parse(await request.json());

    if (validated.action === "open") {
      // A teacher opens their own evening; the office may open anybody's, which
      // is how a parents' evening is actually set up.
      let teacherProfileId = validated.teacherProfileId;
      if (!teacherProfileId) {
        const profile = await getTeacherProfile(companyId, session.user.id);
        if (!profile) return errorResponse("You do not have a teacher profile", 403);
        teacherProfileId = profile.id;
      }

      const result = await openMeetingSlots({
        companyId,
        teacherProfileId,
        from: new Date(validated.from),
        to: new Date(validated.to),
        minutesEach: validated.minutesEach,
        location: validated.location ?? null,
      });
      return successResponse(result, 201);
    }

    if (validated.action === "book") {
      const booked = await bookMeeting({
        companyId,
        meetingId: validated.meetingId,
        studentId: validated.studentId,
        guardianId: validated.guardianId ?? null,
        notes: validated.notes ?? null,
      });
      return successResponse(booked);
    }

    const released = await releaseMeeting({
      companyId,
      meetingId: validated.meetingId,
    });
    return successResponse(released);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof MeetingError) return errorResponse(error.message, 409);
    console.error("[API] POST /api/v2/schools/meetings error:", error);
    return errorResponse("Failed to save");
  }
}
