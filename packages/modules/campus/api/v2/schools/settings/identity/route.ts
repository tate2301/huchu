import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { inferNumbering } from "@corelithzw/platform/id-generator";
import { prisma } from "@corelithzw/db/client";
import { isSchoolAdmin, schoolPermissionDenial } from "../../../../../permissions";

/**
 * How this school writes its student numbers and its ID cards.
 *
 * Reading is academics work; writing is the head's. The format changes what
 * every new pupil is called forever, and the card design is the school's face
 * in a child's pocket — both are one-administrator decisions, so PUT requires
 * a tenant admin on top of the resource check.
 */

const putSchema = z.object({
  studentPrefix: z.string().trim().min(1).max(10).regex(/^[A-Za-z]+$/).nullable(),
  studentSeparator: z.enum(["", "-", "/"]).nullable(),
  studentPadWidth: z.number().int().min(0).max(8).nullable(),
  cardAccentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/),
  cardMotto: z.string().trim().max(120).nullable(),
  cardShowPhoto: z.boolean(),
  cardShowGuardianPhone: z.boolean(),
});

async function loadWithPreview(companyId: string) {
  const settings = await prisma.schoolIdentitySettings.findUnique({
    where: { companyId },
  });

  // What the next admitted pupil would be called, from the same reasoning the
  // generator uses: the declared format when there is one, the inferred scheme
  // otherwise. Shown so the office sees the consequence before saving.
  const codes = (
    await prisma.schoolStudent.findMany({ where: { companyId }, select: { studentNo: true } })
  ).map((row) => row.studentNo);
  const inferred = inferNumbering(codes, "STU");
  const prefix = settings?.studentPrefix ?? inferred.prefix;
  const separator = settings?.studentPrefix != null
    ? (settings.studentSeparator ?? "-")
    : inferred.separator;
  const padWidth = settings?.studentPrefix != null ? (settings.studentPadWidth ?? 4) : 4;
  const nextNumber = inferred.max + 1;

  return {
    settings: settings ?? null,
    preview: {
      nextStudentNo: `${prefix}${separator}${String(nextNumber).padStart(padWidth, "0")}`,
      inferredScheme: `${inferred.prefix}${inferred.separator}…`,
      studentsOnBooks: codes.length,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "view");
    if (denied) return errorResponse(denied, 403);

    return successResponse(await loadWithPreview(session.user.companyId));
  } catch (error) {
    console.error("[API] GET /api/v2/schools/settings/identity error:", error);
    return errorResponse("Failed to load identity settings");
  }
}

export async function PUT(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "edit");
    if (denied) return errorResponse(denied, 403);
    if (!isSchoolAdmin(session.user.role)) {
      return errorResponse("Only an administrator can change how records are identified", 403);
    }

    const body = putSchema.parse(await request.json());
    const companyId = session.user.companyId;

    await prisma.schoolIdentitySettings.upsert({
      where: { companyId },
      create: { companyId, ...body },
      update: body,
    });

    return successResponse(await loadWithPreview(companyId));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PUT /api/v2/schools/settings/identity error:", error);
    return errorResponse("Failed to save identity settings");
  }
}
