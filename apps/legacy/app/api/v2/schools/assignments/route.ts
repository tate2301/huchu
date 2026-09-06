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
  classSubjectId: z.string().uuid().optional(),
  /** The teacher portal's view — their own homework, drafts included. */
  mine: z.coerce.boolean().optional(),
  publishedOnly: z.coerce.boolean().optional(),
});

const createSchema = z.object({
  classSubjectId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  instructions: z.string().trim().max(4000).nullish(),
  dueAt: z.string().datetime().nullish(),
  maxScore: z.number().positive().max(1000).nullish(),
  publish: z.boolean().optional(),
});

const assignmentSelect = {
  id: true,
  title: true,
  instructions: true,
  dueAt: true,
  maxScore: true,
  isPublished: true,
  publishedAt: true,
  termId: true,
  classSubjectId: true,
  classSubject: {
    select: {
      id: true,
      subject: { select: { id: true, code: true, name: true } },
      class: { select: { id: true, code: true, name: true } },
      stream: { select: { id: true, code: true, name: true } },
      teacherProfile: {
        select: { id: true, user: { select: { id: true, name: true } } },
      },
    },
  },
  _count: { select: { submissions: true } },
};

/**
 * Homework set for a term.
 *
 * Narrowed rather than paginated, like the assessments list: a class's homework
 * for a term is a handful of rows, and a page two on a homework list is a page
 * nobody looks at.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse(
      Object.fromEntries(
        ["termId", "classId", "streamId", "classSubjectId", "mine", "publishedOnly"]
          .map((key) => [key, searchParams.get(key) ?? undefined])
          .filter(([, value]) => value !== undefined),
      ),
    );

    const termId = query.termId ?? (await getCurrentTerm(companyId))?.id;
    if (!termId) return errorResponse("This school has no active term", 400);

    let teacherProfileId: string | undefined;
    if (query.mine) {
      const profile = await getTeacherProfile(companyId, session.user.id);
      if (!profile) return errorResponse("You do not have a teacher profile", 403);
      teacherProfileId = profile.id;
    }

    const assignments = await prisma.schoolAssignment.findMany({
      where: {
        companyId,
        termId,
        ...(query.classSubjectId ? { classSubjectId: query.classSubjectId } : {}),
        ...(query.publishedOnly ? { isPublished: true } : {}),
        classSubject: {
          ...(query.classId ? { classId: query.classId } : {}),
          ...(query.streamId ? { streamId: query.streamId } : {}),
          ...(teacherProfileId ? { teacherProfileId } : {}),
        },
      },
      select: assignmentSelect,
      // Soonest deadline first — the question is "what is due", and homework
      // with no deadline sits at the end where it belongs.
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 300,
    });

    return successResponse({ termId, assignments });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/assignments error:", error);
    return errorResponse("Failed to fetch homework");
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

    // A teacher sets work for their own classes; the wider results grant covers
    // the office standing in for somebody who is away.
    if (schoolPermissionDenial(session, "schools.results", "moderate")) {
      const profile = await getTeacherProfile(companyId, session.user.id);
      if (!profile || profile.id !== assignment.teacherProfileId) {
        return errorResponse("That class is not yours to set work for", 403);
      }
    }

    const publish = validated.publish ?? false;
    const created = await prisma.schoolAssignment.create({
      data: {
        companyId,
        termId: assignment.termId,
        classSubjectId: assignment.id,
        title: validated.title,
        instructions: validated.instructions ?? null,
        dueAt: validated.dueAt ? new Date(validated.dueAt) : null,
        maxScore: validated.maxScore ?? null,
        isPublished: publish,
        publishedAt: publish ? new Date() : null,
        createdById: session.user.id,
      },
      select: assignmentSelect,
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/assignments error:", error);
    return errorResponse("Failed to set the homework");
  }
}
