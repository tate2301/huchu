import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "../../../../permissions";
import { getCurrentTerm } from "../../../../calendar";
import {
  addRider,
  boardingRegister,
  endRidership,
  markBoardings,
  transportBilling,
  TransportError,
} from "../../../../transport";

const querySchema = z.object({
  routeId: z.string().uuid().optional(),
  termId: z.string().uuid().optional(),
  /** Ask for the driver's register rather than the route list. */
  onDate: z.string().date().optional(),
  direction: z.enum(["MORNING", "AFTERNOON"]).optional(),
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("route"),
    code: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(160),
    termFee: z.number().min(0).max(1_000_000).nullish(),
    capacity: z.number().int().positive().max(200).nullish(),
    vehicleReg: z.string().trim().max(40).nullish(),
    driverName: z.string().trim().max(160).nullish(),
    driverPhone: z.string().trim().max(40).nullish(),
  }),
  z.object({
    action: z.literal("stop"),
    routeId: z.string().uuid(),
    name: z.string().trim().min(1).max(160),
    sequence: z.number().int().min(1).max(200),
    pickupMinute: z.number().int().min(0).max(1439).nullish(),
    dropMinute: z.number().int().min(0).max(1439).nullish(),
  }),
  z.object({
    action: z.literal("rider"),
    routeId: z.string().uuid(),
    studentId: z.string().uuid(),
    stopId: z.string().uuid().nullish(),
  }),
  z.object({ action: z.literal("end-rider"), riderId: z.string().uuid() }),
  z.object({
    action: z.literal("register"),
    onDate: z.string().date(),
    direction: z.enum(["MORNING", "AFTERNOON"]),
    entries: z
      .array(z.object({ riderId: z.string().uuid(), boarded: z.boolean() }))
      .min(1)
      .max(200),
  }),
]);

/**
 * Routes and riders, or the driver's register for one morning.
 *
 * `schools.students` rather than a transport-specific resource: knowing which
 * bus a child is on is knowing where the child is, and that is the grant the
 * persona catalogue already has a word for.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      routeId: searchParams.get("routeId") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
      onDate: searchParams.get("onDate") ?? undefined,
      direction: searchParams.get("direction") ?? undefined,
    });

    const termId = query.termId ?? (await getCurrentTerm(companyId))?.id;
    if (!termId) return errorResponse("This school has no active term", 400);

    if (query.onDate && query.routeId) {
      const register = await boardingRegister({
        companyId,
        routeId: query.routeId,
        termId,
        onDate: new Date(query.onDate),
        direction: query.direction ?? "MORNING",
      });
      return successResponse({ register });
    }

    const [routes, billing] = await Promise.all([
      prisma.schoolTransportRoute.findMany({
        where: { companyId },
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
          stops: {
            select: {
              id: true,
              name: true,
              sequence: true,
              pickupMinute: true,
              dropMinute: true,
            },
            orderBy: { sequence: "asc" },
          },
          _count: { select: { riders: true } },
        },
        orderBy: { code: "asc" },
      }),
      transportBilling({ companyId, termId }),
    ]);

    return successResponse({ termId, routes, billing });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof TransportError) return errorResponse(error.message, 404);
    console.error("[API] GET /api/v2/schools/transport error:", error);
    return errorResponse("Failed to fetch transport");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const validated = bodySchema.parse(await request.json());

    switch (validated.action) {
      case "route": {
        const created = await prisma.schoolTransportRoute.create({
          data: {
            companyId,
            code: validated.code,
            name: validated.name,
            termFee: validated.termFee ?? null,
            capacity: validated.capacity ?? null,
            vehicleReg: validated.vehicleReg ?? null,
            driverName: validated.driverName ?? null,
            driverPhone: validated.driverPhone ?? null,
          },
          select: { id: true, code: true, name: true },
        });
        return successResponse(created, 201);
      }
      case "stop": {
        const route = await prisma.schoolTransportRoute.findFirst({
          where: { id: validated.routeId, companyId },
          select: { id: true },
        });
        if (!route) return errorResponse("Route not found", 404);

        const created = await prisma.schoolTransportStop.create({
          data: {
            companyId,
            routeId: route.id,
            name: validated.name,
            sequence: validated.sequence,
            pickupMinute: validated.pickupMinute ?? null,
            dropMinute: validated.dropMinute ?? null,
          },
          select: { id: true, name: true, sequence: true },
        });
        return successResponse(created, 201);
      }
      case "rider": {
        const termId = (await getCurrentTerm(companyId))?.id;
        if (!termId) return errorResponse("This school has no active term", 400);
        const rider = await addRider({
          companyId,
          routeId: validated.routeId,
          studentId: validated.studentId,
          stopId: validated.stopId ?? null,
          termId,
        });
        return successResponse(rider, 201);
      }
      case "end-rider": {
        const ended = await endRidership({ companyId, riderId: validated.riderId });
        return successResponse(ended);
      }
      case "register": {
        await markBoardings({
          companyId,
          onDate: new Date(validated.onDate),
          direction: validated.direction,
          entries: validated.entries,
          recordedById: session.user.id,
        });
        return successResponse({ marked: validated.entries.length });
      }
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof TransportError) return errorResponse(error.message, 409);
    console.error("[API] POST /api/v2/schools/transport error:", error);
    return errorResponse("Failed to save");
  }
}
