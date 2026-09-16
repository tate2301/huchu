import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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

    const rows = await conductCategories(session.user.companyId);
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
