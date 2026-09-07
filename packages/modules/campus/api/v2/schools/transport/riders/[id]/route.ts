import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "../../../../../../permissions";
import { endRidership, TransportError } from "../../../../../../transport";

/**
 * A child's place on a bus.
 *
 * The one thing that changes about a rider mid-term is where they are picked
 * up — a family moves, or the stop they were put on turns out to be the wrong
 * side of the road. Which route they are on is not editable here: that is
 * ending one ridership and starting another, and the seat count on the new
 * route has to be checked.
 */
const updateRiderSchema = z.object({
  stopId: z.string().uuid().nullable(),
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
    if (!isValidUUID(id)) return errorResponse("Invalid rider ID", 400);

    const validated = updateRiderSchema.parse(await request.json());

    const rider = await prisma.schoolTransportRider.findFirst({
      where: { id, companyId },
      select: { id: true, routeId: true, endedAt: true },
    });
    if (!rider) return errorResponse("Rider not found", 404);
    if (rider.endedAt) return errorResponse("That child is already off the route", 409);

    if (validated.stopId) {
      const stop = await prisma.schoolTransportStop.findFirst({
        where: { id: validated.stopId, companyId },
        select: { routeId: true },
      });
      if (!stop) return errorResponse("Stop not found", 404);
      if (stop.routeId !== rider.routeId) {
        return errorResponse("That stop is on a different route", 409);
      }
    }

    const updated = await prisma.schoolTransportRider.update({
      where: { id: rider.id },
      data: { stopId: validated.stopId },
      select: { id: true, stopId: true },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/transport/riders/[id] error:", error);
    return errorResponse("Failed to move the child to that stop");
  }
}

/** Take a child off the bus for the rest of the term. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "edit");
    if (denied) return errorResponse(denied, 403);

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid rider ID", 400);

    const ended = await endRidership({ companyId: session.user.companyId, riderId: id });
    return successResponse(ended);
  } catch (error) {
    if (error instanceof TransportError) return errorResponse(error.message, 409);
    console.error("[API] DELETE /api/v2/schools/transport/riders/[id] error:", error);
    return errorResponse("Failed to take the child off the route");
  }
}
