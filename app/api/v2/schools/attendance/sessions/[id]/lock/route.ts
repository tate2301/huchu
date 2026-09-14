import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { registerLockDenial } from "@/lib/schools/register";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * The office closing a day.
 *
 * Guarded on `lock` rather than on `submit`. Both verbs used to be the same
 * check, and a teacher holds `submit` — so the person who took the register
 * could also lock it, which is signing off your own work and leaves the office
 * nothing to oversee. `lock` is held by SCHOOL_ADMIN and the registrar, which
 * is what the grant is for; nothing else is asked, because a second role test
 * here would answer differently from the persona catalogue and one of the two
 * would be wrong.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.attendance", "lock");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;

    const existing = await prisma.schoolAttendanceSession.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        status: true,
      },
    });
    if (!existing || existing.companyId !== companyId) {
      return errorResponse("Attendance session not found", 404);
    }
    const denial = registerLockDenial(existing.status);
    if (denial) return errorResponse(denial, 400);

    const updated = await prisma.schoolAttendanceSession.update({
      where: { id },
      data: {
        status: "LOCKED",
        lockedAt: new Date(),
        lockedByUserId: session.user.id,
      },
    });

    return successResponse(updated);
  } catch (error) {
    console.error(
      "[API] POST /api/v2/schools/attendance/sessions/[id]/lock error:",
      error,
    );
    return errorResponse("Failed to lock attendance session");
  }
}

