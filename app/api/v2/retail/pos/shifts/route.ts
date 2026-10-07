import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireRetailSession } from "../../_helpers";
import { requirePosDevice } from "@/lib/retail/devices";
import { openShift, shiftRefusal } from "@/lib/retail/floor/shifts";
import { canAccessPosPortal } from "@/lib/retail/pos-host";
import { requireRetailPermission } from "@/lib/retail/permissions";

/**
 * No till and no site: a shift opens on this device's own till for the person
 * signed in (10-setup W-04 step 8), through the same `openShift` as the back
 * office (FLR-03). One drawer, one person: a till with someone else's shift
 * open says whose, and stays theirs until it closes.
 */
const openPosShiftSchema = z.object({
  openingFloat: z.union([z.number().min(0), z.string().max(20)]).optional(),
  openingFloatZig: z.union([z.number().min(0), z.string().max(20)]).optional(),
  periodOverrideReason: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

/** The till sends a number; `openShift` reads the float as typed. */
const typed = (value: number | string | undefined) => (typeof value === "number" ? value.toFixed(2) : (value ?? ""));

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }
  if (!canAccessPosPortal(session.user.role)) {
    return errorResponse("POS access denied", 403);
  }
  const gate = requireRetailPermission(session, "retail.sell", "open-shift");
  if (gate) return gate;
  const { device, response: deviceResponse } = await requirePosDevice(request, session);
  if (deviceResponse) return deviceResponse;

  const parsed = openPosShiftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.issues);
  const input = parsed.data;

  const taken = await prisma.retailShift.findFirst({
    where: {
      companyId: session.user.companyId,
      registerId: device.registerId,
      status: "OPEN",
      NOT: { cashierId: session.user.id },
    },
    select: { shiftNo: true, cashierName: true },
  });
  if (taken) {
    return errorResponse(
      `${taken.cashierName}’s shift ${taken.shiftNo} is open on ${device.register.name}. It closes before another opens.`,
      409,
    );
  }

  try {
    const { shift, accounting } = await openShift({
      session,
      registerId: device.registerId,
      openingFloat: typed(input.openingFloat),
      openingFloatZig: typed(input.openingFloatZig),
      deviceId: device.id,
      notes: input.notes ?? null,
      periodOverrideReason: input.periodOverrideReason ?? null,
    });
    return successResponse({ ...shift, ...accounting }, 201);
  } catch (error) {
    return shiftRefusal(error);
  }
}
