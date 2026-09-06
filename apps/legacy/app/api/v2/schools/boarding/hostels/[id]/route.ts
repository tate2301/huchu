import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { isSchoolAdmin, schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * S-4.3 — what a record page may edit about a hostel.
 *
 * `genderPolicy` is a choice rather than free text because S-1.6 enforces it when
 * allocating a bed: a typo here would not be a cosmetic problem, it would be a
 * boy placed in a girls' house. The values are the ones `lib/schools/boarding-rules.ts`
 * knows how to check.
 */
const updateHostelSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    genderPolicy: z.enum(["MIXED", "MALE", "FEMALE"]).optional(),
    capacity: z.number().int().positive().nullable().optional(),
    isActive: z.boolean().optional(),
    avatarUrl: z.string().trim().url().max(2000).nullable().optional(),
    emoji: z.string().trim().min(1).max(16).nullable().optional(),
    accent: z.string().trim().min(1).max(40).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "edit");
    if (denied) return errorResponse(denied, 403);

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid hostel ID", 400);

    const body = (await request.json()) as Record<string, unknown>;
    // How a record is presented — its picture, emoji, accent — is an
    // administrator's act; see `isSchoolAdmin`. Everything else on this
    // route stays with the resource's own edit grant.
    if (
      ("avatarUrl" in body || "emoji" in body || "accent" in body) &&
      !isSchoolAdmin(session.user.role)
    ) {
      return errorResponse("Only an administrator can change a record's display image", 403);
    }

    const validated = updateHostelSchema.parse(body);

    const existing = await prisma.schoolHostel.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Hostel not found", 404);

    const updated = await prisma.schoolHostel.update({
      where: { id: existing.id },
      data: {
        ...(validated.name !== undefined ? { name: validated.name } : {}),
        ...(validated.genderPolicy !== undefined
          ? { genderPolicy: validated.genderPolicy }
          : {}),
        ...(validated.capacity !== undefined ? { capacity: validated.capacity } : {}),
        ...(validated.isActive !== undefined ? { isActive: validated.isActive } : {}),
        ...(validated.avatarUrl !== undefined ? { avatarUrl: validated.avatarUrl } : {}),
        ...(validated.emoji !== undefined ? { emoji: validated.emoji } : {}),
        ...(validated.accent !== undefined ? { accent: validated.accent } : {}),
      },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/boarding/hostels/[id] error:", error);
    return errorResponse("Failed to update hostel");
  }
}

/**
 * Remove a hostel that should not be on the list.
 *
 * Only one nobody has ever boarded in. A house with allocations behind it is
 * closed rather than deleted — `isActive: false` through PATCH — because the
 * allocations are the record of where a child slept, and cascading them away to
 * tidy a list is not a trade a school can make.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "archive");
    if (denied) return errorResponse(denied, 403);

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid hostel ID", 400);

    const existing = await prisma.schoolHostel.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, _count: { select: { allocations: true } } },
    });
    if (!existing) return errorResponse("Hostel not found", 404);

    if (existing._count.allocations > 0) {
      return errorResponse(
        "Children have boarded in this hostel. Close it instead of deleting it.",
        409,
      );
    }

    await prisma.schoolHostel.delete({ where: { id: existing.id } });
    return successResponse({ id: existing.id, deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/boarding/hostels/[id] error:", error);
    return errorResponse("Failed to delete hostel");
  }
}

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
    if (!isValidUUID(id)) {
      return errorResponse("Invalid hostel ID", 400);
    }

    const hostel = await prisma.schoolHostel.findFirst({
      where: { id, companyId: session.user.companyId },
      include: {
        rooms: {
          select: {
            id: true,
            code: true,
            floor: true,
            capacity: true,
            isActive: true,
            beds: {
              select: {
                id: true,
                code: true,
                status: true,
                isActive: true,
              },
              orderBy: { code: "asc" },
            },
            _count: {
              select: {
                beds: true,
                allocations: true,
              },
            },
          },
          orderBy: { code: "asc" },
        },
        allocations: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            status: true,
            startDate: true,
            endDate: true,
            student: {
              select: {
                id: true,
                studentNo: true,
                firstName: true,
                lastName: true,
                status: true,
              },
            },
            room: { select: { id: true, code: true } },
            bed: { select: { id: true, code: true } },
            term: { select: { id: true, code: true, name: true } },
          },
          orderBy: { startDate: "desc" },
        },
        _count: {
          select: {
            rooms: true,
            beds: true,
            allocations: true,
          },
        },
      },
    });

    if (!hostel) {
      return errorResponse("Hostel not found", 404);
    }

    return successResponse(hostel);
  } catch (error) {
    console.error("[API] GET /api/v2/schools/boarding/hostels/[id] error:", error);
    return errorResponse("Failed to fetch hostel details");
  }
}
