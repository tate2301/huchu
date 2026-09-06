import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import {
  isUniqueConstraintError,
  normalizeOptionalNullableString,
} from "../../../../_helpers";

/**
 * A room in a hostel, with its beds.
 *
 * `POST /boarding/hostels` could always create rooms and beds, but only at the
 * moment the hostel itself was created — after that a warden who put up a
 * partition wall had nowhere to say so, and the bed board is built from beds.
 * The beds go in the same transaction as the room for the same reason the
 * library creates copies with a title: a room with no beds is a row nobody can
 * allocate against.
 */
const createRoomSchema = z.object({
  code: z.string().trim().min(1).max(40),
  floor: z.string().trim().min(1).max(50).nullable().optional(),
  capacity: z.number().int().min(0).max(200).nullable().optional(),
  isActive: z.boolean().optional(),
  /** Accession-style codes, one per bed — "B1", "B2". */
  bedCodes: z.array(z.string().trim().min(1).max(40)).max(100).optional(),
});

const roomSelect = {
  id: true,
  code: true,
  floor: true,
  capacity: true,
  isActive: true,
  beds: {
    select: { id: true, code: true, status: true, isActive: true },
    orderBy: { code: "asc" as const },
  },
  _count: { select: { beds: true, allocations: true } },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "view");
    if (denied) return errorResponse(denied, 403);

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid hostel ID", 400);

    const rooms = await prisma.schoolHostelRoom.findMany({
      where: { companyId: session.user.companyId, hostelId: id },
      select: roomSelect,
      orderBy: { code: "asc" },
    });

    return successResponse({ data: rooms });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/boarding/hostels/[id]/rooms error:", error);
    return errorResponse("Failed to fetch the hostel's rooms");
  }
}

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

    const validated = createRoomSchema.parse(await request.json());

    const hostel = await prisma.schoolHostel.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!hostel) return errorResponse("Hostel not found", 404);

    const bedCodes = [...new Set((validated.bedCodes ?? []).map((code) => code.trim()))];

    const room = await prisma.$transaction(async (tx) => {
      const created = await tx.schoolHostelRoom.create({
        data: {
          companyId,
          hostelId: hostel.id,
          code: validated.code,
          floor: normalizeOptionalNullableString(validated.floor) ?? null,
          capacity: validated.capacity ?? null,
          isActive: validated.isActive ?? true,
        },
        select: { id: true },
      });

      if (bedCodes.length > 0) {
        await tx.schoolHostelBed.createMany({
          data: bedCodes.map((code) => ({
            companyId,
            hostelId: hostel.id,
            roomId: created.id,
            code,
            status: "AVAILABLE",
            isActive: true,
          })),
        });
      }

      return tx.schoolHostelRoom.findUniqueOrThrow({
        where: { id: created.id },
        select: roomSelect,
      });
    });

    return successResponse(room, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("A room or bed with that code already exists", 409);
    }
    console.error("[API] POST /api/v2/schools/boarding/hostels/[id]/rooms error:", error);
    return errorResponse("Failed to add the room");
  }
}
