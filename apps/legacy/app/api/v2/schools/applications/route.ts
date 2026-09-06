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
import {
  applicationPipelineCounts,
  findDuplicateApplications,
  nextApplicationNo,
} from "@corelithzw/module-campus/admissions";

const STAGES = [
  "ENQUIRY",
  "APPLIED",
  "ASSESSMENT",
  "WAITLISTED",
  "OFFERED",
  "ACCEPTED",
  "ENROLLED",
  "DECLINED",
  "WITHDRAWN",
] as const;

const querySchema = z.object({
  stage: z.enum(STAGES).optional(),
  classId: z.string().uuid().optional(),
  termId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  /** Leave the closed stages out unless asked for. */
  includeClosed: z.coerce.boolean().optional(),
});

const createSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  dateOfBirth: z.string().date().nullish(),
  gender: z.string().trim().max(20).nullish(),
  guardianName: z.string().trim().max(120).nullish(),
  guardianPhone: z.string().trim().max(40).nullish(),
  guardianEmail: z.string().trim().email().max(160).nullish().or(z.literal("")),
  previousSchool: z.string().trim().max(160).nullish(),
  source: z.string().trim().max(60).nullish(),
  appliedForClassId: z.string().uuid().nullish(),
  intendedTermId: z.string().uuid().nullish(),
  notes: z.string().trim().max(1000).nullish(),
});

const applicationSelect = {
  id: true,
  applicationNo: true,
  firstName: true,
  lastName: true,
  dateOfBirth: true,
  gender: true,
  guardianName: true,
  guardianPhone: true,
  guardianEmail: true,
  previousSchool: true,
  source: true,
  stage: true,
  assessmentScore: true,
  assessmentAt: true,
  offeredAt: true,
  offerExpiresAt: true,
  notes: true,
  studentId: true,
  createdAt: true,
  appliedForClass: { select: { id: true, code: true, name: true } },
  intendedTerm: { select: { id: true, code: true, name: true } },
};

/**
 * The admissions board.
 *
 * Unpaginated, and narrowed by stage or year group rather than by page. An
 * intake is a few hundred applications at most, and a board with a page two is
 * a board that hides the column somebody is looking for.
 *
 * The counts come back alongside, from one grouped query, so the column
 * headings do not cost nine round trips.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.admissions", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      stage: searchParams.get("stage") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      includeClosed: searchParams.get("includeClosed") ?? undefined,
    });

    const search = query.search;
    const [applications, counts] = await Promise.all([
      prisma.schoolApplication.findMany({
        where: {
          companyId,
          ...(query.stage
            ? { stage: query.stage }
            : query.includeClosed
              ? {}
              : { stage: { notIn: ["DECLINED", "WITHDRAWN"] } }),
          ...(query.classId ? { appliedForClassId: query.classId } : {}),
          ...(query.termId ? { intendedTermId: query.termId } : {}),
          ...(search
            ? {
                OR: [
                  { firstName: { contains: search, mode: "insensitive" as const } },
                  { lastName: { contains: search, mode: "insensitive" as const } },
                  { applicationNo: { contains: search, mode: "insensitive" as const } },
                  { guardianName: { contains: search, mode: "insensitive" as const } },
                ],
              }
            : {}),
        },
        select: applicationSelect,
        // Surname first, as every other roll in the pack is ordered.
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        take: 500,
      }),
      applicationPipelineCounts({
        companyId,
        classId: query.classId,
        termId: query.termId,
      }),
    ]);

    return successResponse({ applications, counts });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/applications error:", error);
    return errorResponse("Failed to fetch applications");
  }
}

/**
 * A new application.
 *
 * Possible duplicates come back with the created record rather than stopping
 * the save. A parent standing at the desk should not be told the system thinks
 * they already applied; a registrar should be shown the other record and left
 * to look.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.admissions", "create");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const validated = createSchema.parse(await request.json());
    const dateOfBirth = validated.dateOfBirth ? new Date(validated.dateOfBirth) : null;

    const termId =
      validated.intendedTermId ?? (await getCurrentTerm(companyId))?.id ?? null;

    const duplicates = await findDuplicateApplications({
      companyId,
      firstName: validated.firstName,
      lastName: validated.lastName,
      dateOfBirth,
      guardianPhone: validated.guardianPhone ?? null,
    });

    const created = await prisma.$transaction(async (tx) => {
      // Number and insert in the same transaction: two registrars typing at
      // once would otherwise read the same maximum. The unique index is what
      // actually stops them; this makes the collision rare rather than routine.
      const applicationNo = await nextApplicationNo(
        companyId,
        new Date().getUTCFullYear(),
        tx,
      );

      return tx.schoolApplication.create({
        data: {
          companyId,
          applicationNo,
          firstName: validated.firstName,
          lastName: validated.lastName,
          dateOfBirth,
          gender: validated.gender ?? null,
          guardianName: validated.guardianName ?? null,
          guardianPhone: validated.guardianPhone ?? null,
          guardianEmail: validated.guardianEmail || null,
          previousSchool: validated.previousSchool ?? null,
          source: validated.source ?? null,
          appliedForClassId: validated.appliedForClassId ?? null,
          intendedTermId: termId,
          notes: validated.notes ?? null,
          stage: "APPLIED",
        },
        select: applicationSelect,
      });
    });

    await prisma.schoolApplicationEvent.create({
      data: {
        companyId,
        applicationId: created.id,
        fromStage: null,
        toStage: "APPLIED",
        actorUserId: session.user.id,
      },
    });

    return successResponse({ application: created, duplicates }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/applications error:", error);
    return errorResponse("Failed to create the application");
  }
}
