import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@corelithzw/module-campus/permissions";
import { getCurrentTerm } from "@corelithzw/module-campus/calendar";
import { getTeacherProfile } from "@corelithzw/module-campus/governance-v2";

const querySchema = z.object({
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  classSubjectId: z.string().uuid().optional(),
  teacherProfileId: z.string().uuid().optional(),
  kind: z.enum(["CONTINUOUS", "EXAM", "PRACTICAL"]).optional(),
  /** Restrict to the caller's own teaching. The teacher portal's view. */
  mine: z.coerce.boolean().optional(),
});

const createSchema = z.object({
  classSubjectId: z.string().uuid(),
  kind: z.enum(["CONTINUOUS", "EXAM", "PRACTICAL"]),
  title: z.string().trim().min(1).max(200),
  maxScore: z.number().positive().max(1000),
  weight: z.number().positive().max(100).optional(),
  assessedOn: z.string().date().nullish(),
  termId: z.string().uuid().optional(),
});

const assessmentSelect = {
  id: true,
  kind: true,
  title: true,
  maxScore: true,
  weight: true,
  assessedOn: true,
  status: true,
  termId: true,
  classSubjectId: true,
  classSubject: {
    select: {
      id: true,
      subject: { select: { id: true, code: true, name: true } },
      class: { select: { id: true, code: true, name: true } },
      stream: { select: { id: true, code: true, name: true } },
      teacherProfile: {
        select: {
          id: true,
          employeeCode: true,
          user: { select: { id: true, name: true } },
        },
      },
    },
  },
  _count: { select: { scores: true } },
};

/**
 * The assessments set for a term.
 *
 * Unpaginated but always narrowed — a caller asks for one class, one subject or
 * their own teaching, and each of those is a handful of rows. Listing every
 * assessment in a school is not a question anybody asks, so the route does not
 * offer it as a default.
 *
 * `mine=1` resolves the caller's teacher profile rather than trusting a
 * `teacherProfileId` from the query, which is the S-0.2 rule: a teacher's own
 * work is decided by who they are, not by what they ask for.
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
    const query = querySchema.parse(
      Object.fromEntries(
        [
          "termId",
          "classId",
          "streamId",
          "subjectId",
          "classSubjectId",
          "teacherProfileId",
          "kind",
          "mine",
        ]
          .map((key) => [key, searchParams.get(key) ?? undefined])
          .filter(([, value]) => value !== undefined),
      ),
    );

    const termId = query.termId ?? (await getCurrentTerm(companyId))?.id;
    if (!termId) {
      return errorResponse(
        "This school has no active term. Open one under Academics first.",
        400,
      );
    }

    let teacherProfileId = query.teacherProfileId;
    if (query.mine) {
      const profile = await getTeacherProfile(companyId, session.user.id);
      if (!profile) {
        return errorResponse("You do not have a teacher profile", 403);
      }
      teacherProfileId = profile.id;
    }

    const assessments = await prisma.schoolAssessment.findMany({
      where: {
        companyId,
        termId,
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.classSubjectId ? { classSubjectId: query.classSubjectId } : {}),
        classSubject: {
          ...(query.classId ? { classId: query.classId } : {}),
          ...(query.streamId ? { streamId: query.streamId } : {}),
          ...(query.subjectId ? { subjectId: query.subjectId } : {}),
          ...(teacherProfileId ? { teacherProfileId } : {}),
        },
      },
      select: assessmentSelect,
      // Subject, then date, then title: a mark sheet is read one subject at a
      // time, and within a subject the order work was set in is the order a
      // teacher remembers it.
      orderBy: [
        { classSubject: { subject: { name: "asc" } } },
        { assessedOn: "asc" },
        { title: "asc" },
      ],
    });

    return successResponse({ termId, assessments });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/assessments error:", error);
    return errorResponse("Failed to fetch assessments");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.results", "capture");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const validated = createSchema.parse(await request.json());

    const assignment = await prisma.schoolClassSubject.findFirst({
      where: { id: validated.classSubjectId, companyId },
      select: { id: true, termId: true, teacherProfileId: true },
    });
    if (!assignment) return errorResponse("Class subject not found", 404);

    // A teacher may only set work for their own classes. Staff with the wider
    // grant — the office entering marks for someone who is away — are allowed
    // through, which is the whole reason this is not portal-only.
    const canSetForAnyone = !schoolPermissionDenial(
      session,
      "schools.results",
      "moderate",
    );
    if (!canSetForAnyone) {
      const profile = await getTeacherProfile(companyId, session.user.id);
      if (!profile || profile.id !== assignment.teacherProfileId) {
        return errorResponse("That class is not yours to set work for", 403);
      }
    }

    const created = await prisma.schoolAssessment.create({
      data: {
        companyId,
        termId: validated.termId ?? assignment.termId,
        classSubjectId: assignment.id,
        kind: validated.kind,
        title: validated.title,
        maxScore: validated.maxScore,
        weight: validated.weight ?? 1,
        assessedOn: validated.assessedOn ? new Date(validated.assessedOn) : null,
        createdById: session.user.id,
      },
      select: assessmentSelect,
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/assessments error:", error);
    return errorResponse("Failed to create the assessment");
  }
}
