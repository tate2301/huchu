import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";

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
      // Setup only. The award dialog takes the default and is never offered a
      // reason the school has retired.
      { includeRetired: searchParams.get("includeRetired") === "1" },
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

/**
 * Rename a reason, reprice it, or retire it.
 *
 * Same gap as the conduct categories: `SchoolMeritReason.isActive` shipped and
 * nothing could set it, so the list was create-only and a mistyped reason was
 * in the award dialog for good.
 *
 * Retire rather than delete. Merits already awarded point at the reason, and
 * "what was it for" is the whole of what a ledger entry means a term later.
 */
const patchSchema = z.object({
  id: z.string().uuid(),
  code: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  defaultPoints: z.coerce.number().int().min(1).max(100).optional(),
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

    const existing = await prisma.schoolMeritReason.findFirst({
      where: { id: body.id, companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("That reason is not this school's.", 404);

    const updated = await prisma.schoolMeritReason.update({
      where: { id: existing.id },
      data: {
        ...(body.code !== undefined ? { code: body.code } : {}),
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.defaultPoints !== undefined ? { defaultPoints: body.defaultPoints } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
      select: { id: true, name: true, kind: true, isActive: true },
    });
    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse("Another reason already uses that code.", 409);
    }
    console.error("[API] PATCH /api/v2/schools/conduct/merits/reasons error:", error);
    return errorResponse("Failed to change the reason");
  }
}
