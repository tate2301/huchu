import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { isUniqueConstraintError } from "../../../_helpers";

/**
 * One bus route, after it exists.
 *
 * `POST /transport` could create a route and nothing could correct one: a
 * driver leaving, a vehicle swapped, a term fee agreed later. Same resource as
 * its sibling — `schools.students`, because knowing which bus a child is on is
 * knowing where the child is, and that is the grant the persona catalogue
 * already has a word for.
 */
const updateRouteSchema = z
  .object({
    code: z.string().trim().min(1).max(40).optional(),
    name: z.string().trim().min(1).max(160).optional(),
    termFee: z.number().min(0).max(1_000_000).nullable().optional(),
    capacity: z.number().int().positive().max(200).nullable().optional(),
    vehicleReg: z.string().trim().max(40).nullable().optional(),
    driverName: z.string().trim().max(160).nullable().optional(),
    driverPhone: z.string().trim().max(40).nullable().optional(),
    isActive: z.boolean().optional(),
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

    const denied = schoolPermissionDenial(session, "schools.students", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid route ID", 400);

    const validated = updateRouteSchema.parse(await request.json());

    const existing = await prisma.schoolTransportRoute.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Route not found", 404);

    // Shrinking the bus below the number already riding it is a seat somebody
    // is sitting in, so the number is checked against the register rather than
    // taken on trust.
    if (validated.capacity != null) {
      const riding = await prisma.schoolTransportRider.count({
        where: { companyId, routeId: existing.id, endedAt: null },
      });
      if (riding > validated.capacity) {
        return errorResponse(
          `${riding} children already ride this route — it cannot seat ${validated.capacity}`,
          409,
        );
      }
    }

    const updated = await prisma.schoolTransportRoute.update({
      where: { id: existing.id },
      data: {
        ...(validated.code !== undefined ? { code: validated.code } : {}),
        ...(validated.name !== undefined ? { name: validated.name } : {}),
        ...(validated.termFee !== undefined ? { termFee: validated.termFee } : {}),
        ...(validated.capacity !== undefined ? { capacity: validated.capacity } : {}),
        ...(validated.vehicleReg !== undefined ? { vehicleReg: validated.vehicleReg } : {}),
        ...(validated.driverName !== undefined ? { driverName: validated.driverName } : {}),
        ...(validated.driverPhone !== undefined
          ? { driverPhone: validated.driverPhone }
          : {}),
        ...(validated.isActive !== undefined ? { isActive: validated.isActive } : {}),
      },
      select: {
        id: true,
        code: true,
        name: true,
        termFee: true,
        capacity: true,
        vehicleReg: true,
        driverName: true,
        driverPhone: true,
        isActive: true,
      },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("A route with that code already exists", 409);
    }
    console.error("[API] PATCH /api/v2/schools/transport/routes/[id] error:", error);
    return errorResponse("Failed to update the route");
  }
}

/**
 * Take a route off the list.
 *
 * Only one nobody has ever ridden. A route with riders behind it is the record
 * of which bus a child was on, and a school asked that question after an
 * accident, not before — so a route that has carried anybody is stopped
 * (`isActive: false`) rather than deleted.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "archive");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid route ID", 400);

    const existing = await prisma.schoolTransportRoute.findFirst({
      where: { id, companyId },
      select: { id: true, _count: { select: { riders: true } } },
    });
    if (!existing) return errorResponse("Route not found", 404);

    if (existing._count.riders > 0) {
      return errorResponse(
        "Children have ridden this route. Stop it running instead of deleting it.",
        409,
      );
    }

    await prisma.schoolTransportRoute.delete({ where: { id: existing.id } });
    return successResponse({ id: existing.id, deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/transport/routes/[id] error:", error);
    return errorResponse("Failed to delete the route");
  }
}
