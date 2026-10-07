/**
 * Opening a shift on this till.
 *
 * The till is the paired device's, so there is nothing to pick: the shift opens
 * on that till, at its site, and carries the device. One drawer, one person: a
 * till with someone else's shift open says whose, and stays theirs until it closes.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireRetailSession } from "../../_helpers";
import { canAccessPosPortal } from "@/lib/retail/pos-host";
import { requireLiveTillDevice } from "@/lib/retail/till-device-server";
import { openRetailShiftTransaction } from "../../_services";

const openPosShiftSchema = z.object({
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

  const device = await requireLiveTillDevice();
  if (!device || device.companyId !== session.user.companyId) {
    return errorResponse("This device is not a till. Pair it first.", 403);
  }

  try {
    const input = openPosShiftSchema.parse(await request.json());

    const taken = await prisma.retailShift.findFirst({
      where: {
        companyId: device.companyId,
        status: "OPEN",
        registerCode: device.register.code,
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
      siteId: device.register.siteId,
      registerId: device.register.id,
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
    console.error("[API] POST /api/v2/retail/pos/shifts error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to open shift", 400);
  }
}
