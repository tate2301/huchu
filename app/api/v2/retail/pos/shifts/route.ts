import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireRetailSession } from "../../_helpers";
import { requirePosDevice } from "@/lib/retail/devices";
import { canAccessPosPortal } from "@/lib/retail/pos-host";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { ShiftElsewhere, openRetailShiftTransaction } from "../../_services";

/**
 * No till and no site: a shift opens on this device's own till (10-setup W-04
 * step 8). One drawer, one person: a till with someone else's shift open says
 * whose, and stays theirs until it closes. The person's own shift on another
 * till is refused by `openRetailShiftTransaction` (`ShiftElsewhere`).
 */
const openPosShiftSchema = z.object({
  shiftNo: z.string().min(1).max(50).optional(),
  openingFloat: z.number().min(0).optional(),
  periodOverrideReason: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

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

  try {
    const body = await request.json();
    const input = openPosShiftSchema.parse(body);

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

    const { shift, accounting } = await openRetailShiftTransaction({
      actor: {
        companyId: session.user.companyId,
        userId: session.user.id,
        userRole: session.user.role,
        userName: session.user.name,
        userEmail: session.user.email,
      },
      shiftNo: input.shiftNo ?? null,
      siteId: device.register.site.id,
      registerId: device.registerId,
      deviceId: device.id,
      openingFloat: input.openingFloat ?? 0,
      notes: input.notes ?? null,
      periodOverrideReason: input.periodOverrideReason ?? null,
    });

    return successResponse({ ...shift, ...accounting }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof ShiftElsewhere) {
      return errorResponse(error.message, 409);
    }
    console.error("[API] POST /api/v2/retail/pos/shifts error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to open shift", 400);
  }
}
