import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { rollCallDate } from "@/lib/schools/boarding-roll-call";
import {
  BoardingSessionError,
  openOrGetRollCall,
  presentRollCall,
  rollCallInclude,
} from "@/lib/schools/boarding-sessions";

const rollCallSessionSchema = z.enum(["MORNING", "EVENING"]);

const listQuerySchema = z.object({
  hostelId: z.string().uuid().optional(),
  termId: z.string().uuid().optional(),
  date: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(new Date(value).getTime()), {
      message: "Invalid date value",
    })
    .optional(),
  session: rollCallSessionSchema.optional(),
});

const openRollCallSchema = z.object({
  hostelId: z.string().uuid(),
  termId: z.string().uuid().optional(),
  session: rollCallSessionSchema.default("EVENING"),
  /** The night this count is about. Defaults to tonight. */
  takenOn: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(new Date(value).getTime()), {
      message: "Invalid date value",
    })
    .optional(),
});

/**
 * The registers for a house on a night.
 *
 * Narrow by design: a roll call belongs to one house, and a list across the
 * whole school is not a thing anybody takes or reads. Without a date this
 * answers for tonight, which is what the house page asks for.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "view");
    if (denied) return errorResponse(denied, 403);

    const { searchParams } = new URL(request.url);
    const query = listQuerySchema.parse({
      hostelId: searchParams.get("hostelId") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
      date: searchParams.get("date") ?? undefined,
      session: searchParams.get("session") ?? undefined,
    });

    const takenOn = rollCallDate(query.date ? new Date(query.date) : new Date());

    const rollCalls = await prisma.schoolRollCall.findMany({
      where: {
        companyId: session.user.companyId,
        takenOn,
        ...(query.hostelId ? { hostelId: query.hostelId } : {}),
        ...(query.termId ? { termId: query.termId } : {}),
        ...(query.session ? { session: query.session } : {}),
      },
      include: rollCallInclude,
      orderBy: [{ session: "asc" }, { createdAt: "asc" }],
    });

    return successResponse({
      takenOn,
      rollCalls: rollCalls.map(presentRollCall),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof BoardingSessionError) {
      return errorResponse(error.message, error.status);
    }
    console.error("[API] GET /api/v2/schools/boarding/roll-calls error:", error);
    return errorResponse("Failed to fetch roll calls");
  }
}

/**
 * Open tonight's roll call for a house — or hand back the one already open.
 *
 * Not a create. Opening the screen twice, refreshing it, or two wardens
 * starting at once must all land on the same register: a house with two
 * registers for one night cannot answer the question a roll call exists for.
 * 201 when this call opened it, 200 when it found it.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "create");
    if (denied) return errorResponse(denied, 403);

    const body = await request.json();
    const validated = openRollCallSchema.parse(body);

    const { rollCall, created } = await openOrGetRollCall({
      companyId: session.user.companyId,
      hostelId: validated.hostelId,
      termId: validated.termId ?? null,
      session: validated.session,
      takenOn: validated.takenOn ? new Date(validated.takenOn) : undefined,
      takenById: session.user.id,
    });

    return successResponse(presentRollCall(rollCall), created ? 201 : 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof BoardingSessionError) {
      return errorResponse(error.message, error.status);
    }
    console.error("[API] POST /api/v2/schools/boarding/roll-calls error:", error);
    return errorResponse("Failed to open the roll call");
  }
}
