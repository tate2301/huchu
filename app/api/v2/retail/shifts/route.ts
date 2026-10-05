import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import {
  requireRetailSession,
  resolveRetailSite,
} from "../_helpers";
import { openRetailShiftTransaction } from "../_services";

const openShiftSchema = z.object({
  shiftNo: z.string().min(1).max(50).optional(),
  siteId: z.string().uuid().optional(),
  registerId: z.string().uuid(),
  openingFloat: z.number().min(0).optional(),
  periodOverrideReason: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.4. Opening a drawer, with its float. `open-shift`, not `create`.
  const gate = requireRetailPermission(session, "retail.sell", "open-shift");
  if (gate) return gate;

  try {
    const body = await request.json();
    const input = openShiftSchema.parse(body);
    const { site, response: siteResponse } = await resolveRetailSite(
      session.user.companyId,
      input.siteId,
    );
    if (siteResponse || !site) return siteResponse ?? errorResponse("Invalid site", 400);

    const { shift, accounting } = await openRetailShiftTransaction({
      actor: {
        companyId: session.user.companyId,
        userId: session.user.id,
        userRole: session.user.role,
        userName: session.user.name,
        userEmail: session.user.email,
      },
      shiftNo: input.shiftNo ?? null,
      siteId: site.id,
      registerId: input.registerId,
      openingFloat: input.openingFloat ?? 0,
      notes: input.notes ?? null,
      periodOverrideReason: input.periodOverrideReason ?? null,
    });

    return successResponse({ ...shift, ...accounting }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/retail/shifts error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to open shift", 400);
  }
}
