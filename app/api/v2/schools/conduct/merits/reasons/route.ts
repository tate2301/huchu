import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { meritReasons } from "@/lib/schools/merits";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/** What a school gives a merit or a demerit for. School-set, with a kind. */

const createSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  kind: z.enum(["MERIT", "DEMERIT"]),
  defaultPoints: z.coerce.number().int().min(1).max(100).optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.conduct", "view");
    if (denied) return errorResponse(denied, 403);

    const { searchParams } = new URL(request.url);
    const kind = searchParams.get("kind");
    const rows = await meritReasons(
      session.user.companyId,
      kind === "MERIT" || kind === "DEMERIT" ? kind : undefined,
    );
    return successResponse({ rows });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/conduct/merits/reasons error:", error);
    return errorResponse("Failed to read the reasons");
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
    const reason = await prisma.schoolMeritReason.create({
      data: {
        companyId: session.user.companyId,
        code: body.code,
        name: body.name,
        kind: body.kind,
        defaultPoints: body.defaultPoints ?? 1,
        sortOrder: body.sortOrder ?? 0,
      },
      select: { id: true, name: true, kind: true },
    });
    return successResponse(reason, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/conduct/merits/reasons error:", error);
    return errorResponse("Failed to add the reason");
  }
}
