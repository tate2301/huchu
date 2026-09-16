import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { conductCategories } from "@/lib/schools/conduct";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * What a school logs behaviour under.
 *
 * School-set, not an enum, for the reason `SchoolRoom.kind` already gives in
 * the schema: an enum here would be a guess at every school's estate. Lateness,
 * Phone, Uniform, Plagiarism, Damage, Disruption, Absconding and Fighting are
 * the eight the canvas draws; a school will have its own ninth by the end of the
 * first term, and adding it is a row rather than a deploy.
 */

const createSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(80),
  tone: z.enum(["PLAIN", "WARN", "BAD"]).optional(),
  demeritPoints: z.coerce.number().int().min(0).max(50).nullish(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.conduct", "view");
    if (denied) return errorResponse(denied, 403);

    // The setup screen asks for retired ones too. Every other caller — the
    // incident picker above all — takes the default and sees only live ones.
    const { searchParams } = new URL(request.url);
    const rows = await conductCategories(session.user.companyId, {
      includeRetired: searchParams.get("includeRetired") === "1",
    });
    return successResponse({ rows });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/conduct/categories error:", error);
    return errorResponse("Failed to read the categories");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.conduct", "configure");
    if (denied) return errorResponse(denied, 403);

    const body = createSchema.parse(await request.json());
    const category = await prisma.schoolConductCategory.create({
      data: {
        companyId: session.user.companyId,
        code: body.code,
        name: body.name,
        tone: body.tone ?? "WARN",
        demeritPoints: body.demeritPoints ?? null,
        sortOrder: body.sortOrder ?? 0,
      },
      select: { id: true, code: true, name: true },
    });
    return successResponse(category, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/conduct/categories error:", error);
    return errorResponse("Failed to add the category");
  }
}

/**
 * Rename a category, reprice its demerits, or retire it.
 *
 * `SchoolConductCategory.isActive` shipped with the expansion and nothing could
 * ever set it. So the list was create-only: a school that typed "Uniforn" on
 * its first morning had it in the incident picker for good, and a category it
 * stopped using could not be taken out of the way.
 *
 * Retire rather than delete, which is what the flag is for — incidents already
 * logged against a category keep pointing at it, and deleting it would take
 * their reason away.
 */
const patchSchema = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  tone: z.enum(["PLAIN", "WARN", "BAD"]).optional(),
  demeritPoints: z.coerce.number().int().min(0).max(50).nullish(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.conduct", "configure");
    if (denied) return errorResponse(denied, 403);

    const body = patchSchema.parse(await request.json());
    const companyId = session.user.companyId;

    // The id is a claim until it is resolved against the caller's company.
    const existing = await prisma.schoolConductCategory.findFirst({
      where: { id: body.id, companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("That category is not this school's.", 404);

    const updated = await prisma.schoolConductCategory.update({
      where: { id: existing.id },
      data: {
        ...(body.code !== undefined ? { code: body.code } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.tone !== undefined ? { tone: body.tone } : {}),
        // `nullish`, so an explicit null clears the automatic demerit and an
        // absent field leaves it alone.
        ...(body.demeritPoints !== undefined ? { demeritPoints: body.demeritPoints } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      select: { id: true, code: true, name: true, isActive: true },
    });
    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse("Another category already uses that code.", 409);
    }
    console.error("[API] PATCH /api/v2/schools/conduct/categories error:", error);
    return errorResponse("Failed to change the category");
  }
}
