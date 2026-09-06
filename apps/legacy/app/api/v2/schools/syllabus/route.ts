import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@corelithzw/module-campus/permissions";

/**
 * The scheme of work: a subject's term, week by week.
 *
 * One scheme per subject × form level × term, and the unit of editing is the
 * whole scheme rather than a row: a scheme is written and revised as a table,
 * and PUT replaces the table it names. That makes the editor honest — what is
 * on screen after saving is exactly what will seed "lay out this week" — and
 * it makes deleting a week the absence of that week in the payload, not a
 * separate call that can be forgotten.
 *
 * Reading is academics work like the rest of the planner; writing the scheme
 * needs the academics edit grant, which heads of department hold.
 */

const querySchema = z.object({
  subjectId: z.string().uuid(),
  termId: z.string().uuid(),
  level: z.coerce.number().int().min(0).max(20),
});

const putSchema = z.object({
  subjectId: z.string().uuid(),
  termId: z.string().uuid(),
  level: z.number().int().min(0).max(20),
  weeks: z
    .array(
      z.object({
        weekOfTerm: z.number().int().min(1).max(20),
        topic: z.string().trim().min(1).max(300),
        objectives: z.string().trim().max(2000).nullish(),
        activities: z.string().trim().max(4000).nullish(),
        resourcesNote: z.string().trim().max(2000).nullish(),
      }),
    )
    .max(20),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      subjectId: searchParams.get("subjectId") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
      level: searchParams.get("level") ?? undefined,
    });

    const weeks = await prisma.schoolSchemeOfWork.findMany({
      where: {
        companyId,
        subjectId: query.subjectId,
        termId: query.termId,
        level: query.level,
      },
      orderBy: { weekOfTerm: "asc" },
      select: {
        id: true,
        weekOfTerm: true,
        topic: true,
        objectives: true,
        activities: true,
        resourcesNote: true,
      },
    });

    return successResponse({ weeks });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/syllabus error:", error);
    return errorResponse("Failed to load the scheme of work");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const validated = putSchema.parse(await request.json());

    const weekNumbers = validated.weeks.map((week) => week.weekOfTerm);
    if (new Set(weekNumbers).size !== weekNumbers.length) {
      return errorResponse("Each week appears once in a scheme", 400);
    }

    const [subject, term] = await Promise.all([
      prisma.schoolSubject.findFirst({
        where: { id: validated.subjectId, companyId },
        select: { id: true },
      }),
      prisma.schoolTerm.findFirst({
        where: { id: validated.termId, companyId },
        select: { id: true },
      }),
    ]);
    if (!subject) return errorResponse("Subject not found", 404);
    if (!term) return errorResponse("Term not found", 404);

    // Replace the named scheme wholesale, atomically: the table on screen is
    // the table that seeds the planner, with no half-saved state in between.
    await prisma.$transaction([
      prisma.schoolSchemeOfWork.deleteMany({
        where: {
          companyId,
          subjectId: validated.subjectId,
          termId: validated.termId,
          level: validated.level,
        },
      }),
      prisma.schoolSchemeOfWork.createMany({
        data: validated.weeks.map((week) => ({
          companyId,
          subjectId: validated.subjectId,
          termId: validated.termId,
          level: validated.level,
          weekOfTerm: week.weekOfTerm,
          topic: week.topic,
          objectives: week.objectives ?? null,
          activities: week.activities ?? null,
          resourcesNote: week.resourcesNote ?? null,
        })),
      }),
    ]);

    return successResponse({ saved: validated.weeks.length });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PUT /api/v2/schools/syllabus error:", error);
    return errorResponse("Failed to save the scheme of work");
  }
}
