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
 */

const createSchema = z.object({
  kind: z.enum(["PRIZE", "COLOURS", "POST", "OTHER"]),
  year: z.coerce.number().int().min(1900).max(2200),
  title: z.string().trim().min(1).max(160),
  detail: z.string().trim().max(400).nullish(),
});

const deleteQuery = z.object({ honourId: z.string().uuid() });

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

    // Scoped to the pupil in the URL as well as the company, so an honour id
    // from another pupil's record cannot be deleted through this door.
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
