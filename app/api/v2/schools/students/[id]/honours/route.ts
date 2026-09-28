import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * What a pupil won while they were here.
 *
 * `SchoolStudentHonour` shipped, is read by the alumnus record, and was written
 * by nothing — so the Honours section on every alumnus was permanently empty
 * and no school could put anything in it.
 *
 * It is not a decorative table. Head girl, head of house, prefect, full colours,
 * the accounting prize: this is what a Zimbabwean school reads out at prize
 * giving and writes into a leaving reference years later, and the reference is
 * the thing the record exists to support.
 *
 * Hung off the pupil rather than the alumnus because an honour is won in Form 3
 * and the alumnus row does not exist until they leave. The alumnus record reads
 * through `studentId` for exactly that reason.
 *
 * On the grant: `schools.students` at `edit`. An honour is a fact about a pupil
 * kept on their record, and the office that keeps the roll keeps it.
 *
 * PATCH and DELETE arrived with the surface that needed them. They were written
 * and removed once before, when honours were drawn as a joined sentence in a
 * property row and there was no row to hang a verb on — an endpoint with no
 * caller being the exact fault this branch exists to clear out. The alumnus
 * record lists them properly now, so both have somewhere to be called from.
 */

const createSchema = z.object({
  kind: z.enum(["PRIZE", "COLOURS", "POST", "OTHER"]),
  year: z.coerce.number().int().min(1900).max(2200),
  title: z.string().trim().min(1).max(160),
  detail: z.string().trim().max(400).nullish(),
});

async function pupilOfThisSchool(companyId: string, studentId: string) {
  return prisma.schoolStudent.findFirst({
    where: { id: studentId, companyId },
    select: { id: true },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "view");
    if (denied) return errorResponse(denied, 403);

    const { id } = await context.params;
    const companyId = session.user.companyId;
    if (!(await pupilOfThisSchool(companyId, id))) {
      return errorResponse("That pupil is not on this school's roll.", 404);
    }

    const honours = await prisma.schoolStudentHonour.findMany({
      where: { companyId, studentId: id },
      select: { id: true, kind: true, year: true, title: true, detail: true },
      orderBy: [{ year: "desc" }, { title: "asc" }],
    });
    return successResponse({ honours });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/students/[id]/honours error:", error);
    return errorResponse("Failed to read the honours");
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "edit");
    if (denied) return errorResponse(denied, 403);

    const { id } = await context.params;
    const companyId = session.user.companyId;
    // The pupil id is in the URL rather than the body, but it is still a claim
    // until it is resolved against the caller's company.
    if (!(await pupilOfThisSchool(companyId, id))) {
      return errorResponse("That pupil is not on this school's roll.", 404);
    }

    const body = createSchema.parse(await request.json());
    const honour = await prisma.schoolStudentHonour.create({
      data: {
        companyId,
        studentId: id,
        kind: body.kind,
        year: body.year,
        title: body.title,
        detail: body.detail ?? null,
      },
      select: { id: true },
    });
    return successResponse(honour, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/students/[id]/honours error:", error);
    return errorResponse("Failed to record the honour");
  }
}

const patchSchema = z.object({
  honourId: z.string().uuid(),
  kind: z.enum(["PRIZE", "COLOURS", "POST", "OTHER"]).optional(),
  year: z.coerce.number().int().min(1900).max(2200).optional(),
  title: z.string().trim().min(1).max(160).optional(),
  detail: z.string().trim().max(400).nullish(),
});

/**
 * Correct an honour.
 *
 * A prize list is read out at speech day and copied into a leaving reference
 * years later, so a year or a title typed wrong is worth being able to fix —
 * and this is one somebody transcribes from a handwritten sheet.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "edit");
    if (denied) return errorResponse(denied, 403);

    const { id } = await context.params;
    const companyId = session.user.companyId;
    const body = patchSchema.parse(await request.json());

    // Both ids are claims: the pupil in the URL, and the honour in the body.
    // Resolving the honour against BOTH the company and this pupil is what
    // stops one pupil's record being edited through another's URL.
    const existing = await prisma.schoolStudentHonour.findFirst({
      where: { id: body.honourId, companyId, studentId: id },
      select: { id: true },
    });
    if (!existing) return errorResponse("That honour is not on this pupil's record.", 404);

    const updated = await prisma.schoolStudentHonour.update({
      where: { id: existing.id },
      data: {
        ...(body.kind !== undefined ? { kind: body.kind } : {}),
        ...(body.year !== undefined ? { year: body.year } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        // `nullish`, so an explicit null clears the detail and an absent field
        // leaves whatever is there.
        ...(body.detail !== undefined ? { detail: body.detail } : {}),
      },
      select: { id: true },
    });
    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/students/[id]/honours error:", error);
    return errorResponse("Failed to change the honour");
  }
}

const deleteQuery = z.object({ honourId: z.string().uuid() });

/**
 * Take an honour off a record.
 *
 * A real delete rather than a retire, and this is the exception the rest of the
 * module's setup tables are not: nothing anywhere points at an honour, it is a
 * leaf. One recorded against the wrong pupil is a transcription slip, not
 * history, and leaving it on their reference would be worse than removing it.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "edit");
    if (denied) return errorResponse(denied, 403);

    const { id } = await context.params;
    const companyId = session.user.companyId;
    const { searchParams } = new URL(request.url);
    const query = deleteQuery.parse(Object.fromEntries(searchParams.entries()));

    const removed = await prisma.schoolStudentHonour.deleteMany({
      where: { id: query.honourId, companyId, studentId: id },
    });
    if (removed.count === 0) {
      return errorResponse("That honour is not on this pupil's record.", 404);
    }
    return successResponse({ honourId: query.honourId });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] DELETE /api/v2/schools/students/[id]/honours error:", error);
    return errorResponse("Failed to remove the honour");
  }
}
