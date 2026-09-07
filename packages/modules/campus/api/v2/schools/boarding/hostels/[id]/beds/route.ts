import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "../../../../../../../permissions";
import { isUniqueConstraintError } from "../../../../_helpers";

/**
 * Beds added to a room that already exists.
 *
 * A bunk goes in mid-term more often than a room does, and until now the only
 * way to record one was to recreate the hostel. Several codes in one call
 * because a warden adds a bunk, which is two beds.
 */
const createBedsSchema = z.object({
  roomId: z.string().uuid(),
  codes: z.array(z.string().trim().min(1).max(40)).min(1).max(50),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "create");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid hostel ID", 400);

    const validated = createBedsSchema.parse(await request.json());
    const codes = [...new Set(validated.codes.map((code) => code.trim()))];

    const room = await prisma.schoolHostelRoom.findFirst({
      where: { id: validated.roomId, hostelId: id, companyId },
      select: { id: true, hostelId: true },
    });
    if (!room) return errorResponse("Room not found in this hostel", 404);

    const clash = await prisma.schoolHostelBed.findFirst({
      where: { companyId, roomId: room.id, code: { in: codes } },
      select: { code: true },
    });
    if (clash) {
      return errorResponse(`Bed ${clash.code} is already in that room`, 409);
    }

    await prisma.schoolHostelBed.createMany({
      data: codes.map((code) => ({
        companyId,
        hostelId: room.hostelId,
        roomId: room.id,
        code,
        status: "AVAILABLE",
        isActive: true,
      })),
    });

    const beds = await prisma.schoolHostelBed.findMany({
      where: { companyId, roomId: room.id },
      select: { id: true, code: true, status: true, isActive: true },
      orderBy: { code: "asc" },
    });

    return successResponse({ data: beds }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("A bed with that code already exists in the room", 409);
    }
    console.error("[API] POST /api/v2/schools/boarding/hostels/[id]/beds error:", error);
    return errorResponse("Failed to add the beds");
  }
}
