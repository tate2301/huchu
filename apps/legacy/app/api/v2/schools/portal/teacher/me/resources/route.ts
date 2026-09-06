import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { getTeacherProfile } from "@corelithzw/module-campus/governance-v2";

const createSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(2000).nullish(),
  subjectId: z.string().uuid().nullish(),
  classId: z.string().uuid().nullish(),
  /**
   * Link-only, deliberately. File upload belongs with the Iteration 5
   * documents work (S-1.12), and a route that accepted a `fileUrl` would be
   * accepting an address nothing in the product can yet produce.
   */
  linkUrl: z.string().url().max(2000),
  isShared: z.boolean().optional(),
});

/**
 * A teacher adds something to the department's shelf.
 *
 * The shared route at `/api/v2/schools/teaching-resources` writes under the
 * `schools.academics` `create` grant, which a teacher does not hold — the
 * office curates academic records, and that is right for classes, subjects and
 * timetables. A worksheet is not one of those: S-1.12 promises the teacher a
 * shelf they can put things on, and the thing they put there is their own.
 * So the write lives here instead, scoped to the caller's own teacher profile
 * and stamped with it, rather than by widening a grant that guards the
 * curriculum.
 *
 * Reading stays on the shared route: the shelf is the department's, and a
 * teacher who could only see what they uploaded would have no reason to open
 * it.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const profile = await getTeacherProfile(companyId, session.user.id);
    if (!profile) {
      return errorResponse("You are not linked to a teacher profile", 403);
    }

    const validated = createSchema.parse(await request.json());

    // Both are the tenant's own records or they are nothing: an id from
    // another school would otherwise file a worksheet against it.
    if (validated.subjectId) {
      const subject = await prisma.schoolSubject.findFirst({
        where: { id: validated.subjectId, companyId },
        select: { id: true },
      });
      if (!subject) return errorResponse("Subject not found", 404);
    }
    if (validated.classId) {
      const schoolClass = await prisma.schoolClass.findFirst({
        where: { id: validated.classId, companyId },
        select: { id: true },
      });
      if (!schoolClass) return errorResponse("Year group not found", 404);
    }

    const created = await prisma.schoolTeachingResource.create({
      data: {
        companyId,
        title: validated.title,
        description: validated.description ?? null,
        subjectId: validated.subjectId ?? null,
        classId: validated.classId ?? null,
        linkUrl: validated.linkUrl,
        isShared: validated.isShared ?? true,
        uploadedByProfileId: profile.id,
      },
      select: {
        id: true,
        title: true,
        linkUrl: true,
        isShared: true,
        subject: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
      },
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/portal/teacher/me/resources error:", error);
    return errorResponse("Failed to add the resource");
  }
}
