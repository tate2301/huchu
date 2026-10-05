import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requirePosDevice } from "@/lib/retail/devices";
import { NoDrawer, openDrawerWithoutSale } from "@/lib/retail/drawer-open";
import { approverSchema, tillRuleResponse } from "@/lib/retail/manager-pin";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../../_helpers";

/**
 * Open the drawer without a sale (SET-06, W-64). The person selling at this
 * till; with "Open the drawer without a sale" off, a manager's PIN in
 * `approver` (else 409 `needsApprover`, and the till opens its PIN dialog).
 * Audited `RETAIL_DRAWER.OPENED` on the till.
 */
const drawerSchema = z.object({
  approver: approverSchema.optional().nullable(),
});

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.sell", "create");
  if (gate) return gate;
  const { device, response: deviceResponse } = await requirePosDevice(request, session);
  if (deviceResponse) return deviceResponse;

  try {
    const input = drawerSchema.parse(await request.json().catch(() => ({})));
    const opened = await openDrawerWithoutSale({
      actor: {
        companyId: session.user.companyId,
        userId: session.user.id,
        userName: session.user.name,
        userRole: session.user.role,
      },
      device,
      approver: input.approver ?? null,
    });
    return successResponse({
      data: { openedAt: opened.openedAt.toISOString(), approvedBy: opened.approvedBy?.name ?? null },
    });
  } catch (error) {
    const refused = tillRuleResponse(error);
    if (refused) return refused;
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof NoDrawer) return errorResponse(error.message, 409);
    console.error("[API] POST /api/v2/retail/pos/drawer/open failed");
    return errorResponse("The drawer did not open. Try again.");
  }
}
