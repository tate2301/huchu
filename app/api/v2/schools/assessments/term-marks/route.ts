import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { getCurrentTerm } from "@/lib/schools/calendar";
import {
  activeClassSubjects,
  classSubjectCaller,
  ownedClassSubject,
  teachesEverySubject,
} from "@/lib/schools/class-subject-access";
import { computeClassTermMarks, rollUpTermMarks } from "@/lib/schools/assessments";

const querySchema = z.object({
  classId: z.string().uuid(),
  streamId: z.string().uuid().optional(),
  classSubjectId: z.string().uuid().optional(),
  termId: z.string().uuid().optional(),
  schemeId: z.string().uuid().optional(),
});

const postSchema = z.object({
  classId: z.string().uuid(),
  streamId: z.string().uuid().nullish(),
  termId: z.string().uuid().optional(),
  schemeId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200).optional(),
});

/**
 * What the marks add up to, without writing anything down.
 *
 * A preview rather than a report: the same numbers the roll-up would write, so
 * whoever is about to press the button can see that a subject is short an exam
 * before it lands on a result sheet.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.results", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      classId: searchParams.get("classId") ?? undefined,
      streamId: searchParams.get("streamId") ?? undefined,
      classSubjectId: searchParams.get("classSubjectId") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
      schemeId: searchParams.get("schemeId") ?? undefined,
    });

    const termId = query.termId ?? (await getCurrentTerm(companyId))?.id;
    if (!termId) return errorResponse("This school has no active term", 400);

    const caller = await classSubjectCaller({
      companyId,
      userId: session.user.id,
      role: session.user.role,
      moderates: schoolPermissionDenial(session, "schools.results", "moderate") === null,
    });

    // A whole-class preview is a moderator's view: it reads every subject,
    // including the ones the caller does not teach. A teacher asks for one of
    // their own subjects by name, and the class comes from that assignment
    // rather than from the query, so a borrowed `classId` cannot widen it.
    let classId = query.classId;
    if (!caller.moderates) {
      if (!query.classSubjectId) {
        return errorResponse("Ask for one of your own subjects by name", 403);
      }
      const owned = await ownedClassSubject({
        companyId,
        classSubjectId: query.classSubjectId,
        caller,
      });
      if ("error" in owned) return errorResponse(owned.error, 403);
      classId = owned.classSubject.classId;
    }

    const result = await computeClassTermMarks({
      companyId,
      termId,
      classId,
      streamId: query.streamId ?? null,
      classSubjectId: query.classSubjectId,
      schemeId: query.schemeId,
    });

    return successResponse({ termId, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/assessments/term-marks error:", error);
    return errorResponse("Failed to work out the term marks");
  }
}

/** Write those marks onto the class's result sheet. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // `submit`, not `capture`: rolling up produces the sheet a head of
    // department moderates, which is a step past entering a mark.
    const denied = schoolPermissionDenial(session, "schools.results", "submit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const validated = postSchema.parse(await request.json());
    const termId = validated.termId ?? (await getCurrentTerm(companyId))?.id;
    if (!termId) return errorResponse("This school has no active term", 400);

    const caller = await classSubjectCaller({
      companyId,
      userId: session.user.id,
      role: session.user.role,
      moderates: schoolPermissionDenial(session, "schools.results", "moderate") === null,
    });

    // The roll-up is not per-subject — it clears the sheet and rewrites it from
    // every subject in the class — so holding one subject in the class is not
    // enough to run it. Before this check a teacher could open a draft result
    // sheet over a colleague's class by quoting its id.
    if (!caller.moderates) {
      if (!caller.teacherProfileId) {
        return errorResponse("You are not linked to a teacher profile", 403);
      }
      const subjects = await activeClassSubjects({
        companyId,
        termId,
        classId: validated.classId,
        streamId: validated.streamId ?? null,
      });
      if (!teachesEverySubject(subjects, caller.teacherProfileId)) {
        return errorResponse("That class is not one of yours to roll up", 403);
      }
    }

    const result = await rollUpTermMarks({
      companyId,
      termId,
      classId: validated.classId,
      streamId: validated.streamId ?? null,
      schemeId: validated.schemeId,
      title: validated.title,
    });

    return successResponse(result, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof Error && /submitted/i.test(error.message)) {
      return errorResponse(error.message, 409);
    }
    console.error("[API] POST /api/v2/schools/assessments/term-marks error:", error);
    return errorResponse("Failed to roll the marks up");
  }
}
