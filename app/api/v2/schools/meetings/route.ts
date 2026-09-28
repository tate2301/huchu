import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
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

    // Opening, booking and releasing a slot are all one grant, `book-meeting`.
    // They were on `schools.students` edit, which meant a teacher could not put
    // their own parents' evening up without also holding the registrar's power
    // to rewrite a pupil record. Arranging a conversation is not editing a
    // pupil.
    const denied = schoolPermissionDenial(session, "schools.students", "book-meeting");
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

/**
 * Put an evening right: move it to the night it was meant to be on, re-cut the
 * window, or write the room onto it.
 *
 * Opening slots was the only thing anyone could do to an evening. An office
 * that typed Thursday when the staff meeting was Tuesday, or set five to seven
 * when the hall is only free after six, had twelve rows it could not touch —
 * the evening was on the parents' portal and the only way out of it was to
 * release each slot by hand and open a second one beside the first.
 *
 * An evening is not a row. It is the handful of slots one teacher's window was
 * cut into, so it is named here the way the schedule reads it: the teacher, and
 * the instants the night runs between. The client sends those as instants
 * rather than a date because the day a slot belongs to is the school's local
 * day, and the browser is the only side of this that knows it.
 *
 * Moving cuts the window again rather than editing the rows, because it has to:
 * two hours at ten minutes and the same two hours at fifteen are not the same
 * twelve slots, and there is no row-for-row correspondence to carry across. The
 * old ones are cancelled rather than deleted — `cancelledAt` is on the model for
 * exactly this, and a night that went up and came down again is something the
 * office may have to account for. Cancel and re-cut go in one transaction, so a
 * failure half way cannot leave a teacher with no evening at all.
 *
 * A booked evening does not move, and that is deliberate. Nothing in this
 * product tells a family their appointment has changed: a slot carries no
 * message, and the school's own release dialog says "ring them" because ringing
 * them is what actually happens. Moving twelve booked slots would silently
 * cancel twelve appointments twelve families still think they are keeping. So
 * this refuses and says how many are booked. The office releases those first —
 * which puts the "Tell the family" offer in front of it once per family — and
 * then moves the night.
 *
 * The room is the exception. It can be corrected under a live booking, because
 * it is written on the row the family already reads and nobody loses their ten
 * minutes over it.
 */
const patchSchema = z
  .object({
    teacherProfileId: z.string().uuid(),
    /** The evening being corrected: when its first slot starts and its last ends. */
    eveningFrom: z.string().datetime(),
    eveningTo: z.string().datetime(),
    /** Where it is moving to. Both or neither — an evening moves as a window. */
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    minutesEach: z.number().int().min(5).max(120).optional(),
    location: z.string().trim().max(160).nullish(),
  })
  .refine((body) => (body.from === undefined) === (body.to === undefined), {
    message: "An evening moves as a whole window — give both a start and an end",
    path: ["to"],
  });

export async function PATCH(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // Correcting the evening you opened is the same authority as opening it.
    const denied = schoolPermissionDenial(session, "schools.students", "book-meeting");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const body = patchSchema.parse(await request.json());

    // The teacher id is a claim until it is resolved against the caller's
    // company. Everything below is scoped through it and through `companyId`
    // on the slots themselves.
    const teacher = await prisma.schoolTeacherProfile.findFirst({
      where: { id: body.teacherProfileId, companyId },
      select: { id: true },
    });
    if (!teacher) return errorResponse("That teacher is not this school's.", 404);

    const slots = await prisma.schoolParentMeeting.findMany({
      where: {
        companyId,
        teacherProfileId: teacher.id,
        startsAt: { gte: new Date(body.eveningFrom), lt: new Date(body.eveningTo) },
        cancelledAt: null,
      },
      select: { id: true, startsAt: true, endsAt: true, bookedAt: true, location: true },
      orderBy: { startsAt: "asc" },
    });
    if (slots.length === 0) {
      return errorResponse("That evening is no longer open for this teacher.", 404);
    }

    const first = slots[0]!;
    const last = slots[slots.length - 1]!;
    const recutting = body.from !== undefined || body.minutesEach !== undefined;

    if (!recutting) {
      if (body.location === undefined) {
        return errorResponse("Nothing was given to change about that evening.", 400);
      }
      // `nullish`, so an explicit null takes the room off the evening and an
      // absent one never reaches here at all.
      const relocated = await prisma.schoolParentMeeting.updateMany({
        where: { id: { in: slots.map((slot) => slot.id) }, companyId },
        data: { location: body.location },
      });
      return successResponse({
        moved: false,
        updated: relocated.count,
        cancelled: 0,
        created: 0,
        skipped: 0,
      });
    }

    const booked = slots.filter((slot) => slot.bookedAt).length;
    if (booked > 0) {
      return errorResponse(
        `${booked} of the ${slots.length} slots on that evening ${booked === 1 ? "is" : "are"} booked. Moving it would cancel ${booked === 1 ? "that appointment" : "those appointments"} without the ${booked === 1 ? "family" : "families"} being told — nothing here writes to them. Release ${booked === 1 ? "it" : "them"} first, tell the ${booked === 1 ? "family" : "families"}, then move the night.`,
        409,
      );
    }

    // An evening that only changes its slot length keeps the window it has.
    const minutesEach =
      body.minutesEach ??
      Math.max(
        1,
        Math.round((first.endsAt.getTime() - first.startsAt.getTime()) / 60000),
      );
    const from = body.from !== undefined ? new Date(body.from) : first.startsAt;
    const to = body.to !== undefined ? new Date(body.to) : last.endsAt;

    if (to <= from) return errorResponse("The evening has to end after it starts.", 400);
    const count = Math.floor((to.getTime() - from.getTime()) / (minutesEach * 60000));
    if (count === 0) return errorResponse("That window is shorter than one slot.", 400);
    if (count > 200) return errorResponse("That is more than 200 slots — narrow it.", 400);

    const ids = slots.map((slot) => slot.id);

    // A teacher can have a second evening the new window lands on. Those times
    // are left where they are rather than opened twice, the same way reopening
    // a window skips what already exists.
    const clashes = await prisma.schoolParentMeeting.findMany({
      where: {
        companyId,
        teacherProfileId: teacher.id,
        startsAt: { gte: from, lt: to },
        cancelledAt: null,
        id: { notIn: ids },
      },
      select: { startsAt: true },
    });
    const taken = new Set(clashes.map((row) => row.startsAt.getTime()));

    const location = body.location !== undefined ? body.location : first.location;
    const recut = Array.from({ length: count }, (_, index) => {
      const startsAt = new Date(from.getTime() + index * minutesEach * 60000);
      return {
        companyId,
        teacherProfileId: teacher.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + minutesEach * 60000),
        location,
      };
    }).filter((slot) => !taken.has(slot.startsAt.getTime()));

    if (recut.length === 0) {
      return errorResponse(
        "This teacher is already open for every minute of that window, so the evening was left where it is.",
        409,
      );
    }

    // One transaction: an evening taken down and not put back up is a night the
    // school thinks it is running and no family can book.
    const [cancelled] = await prisma.$transaction([
      prisma.schoolParentMeeting.updateMany({
        where: { id: { in: ids }, companyId },
        data: { cancelledAt: new Date() },
      }),
      prisma.schoolParentMeeting.createMany({ data: recut }),
    ]);

    return successResponse({
      moved: true,
      updated: 0,
      cancelled: cancelled.count,
      created: recut.length,
      skipped: count - recut.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse("This teacher already has a slot at one of those times.", 409);
    }
    console.error("[API] PATCH /api/v2/schools/meetings error:", error);
    return errorResponse("Failed to change the evening");
  }
}
