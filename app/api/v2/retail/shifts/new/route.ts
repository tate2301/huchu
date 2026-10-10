import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-response";
import { openingDefaults, ShiftRefused } from "@/lib/retail/floor/shifts";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { requireRetailSession } from "../../_helpers";

/**
 * `GET /api/v2/retail/shifts/new?registerId=` (FLR-03): what Open a shift
 * fills in once a till is picked — the float the till's last close left, its
 * hint, and whether the shop counts a ZiG float.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }
  if (!canRetailSessionDo(session, "retail.cash-control", "open-shift") && !canRetailSessionDo(session, "retail.sell", "open-shift")) {
    return errorResponse("Your role cannot open a till shift in sales", 403);
  }
  const registerId = new URL(request.url).searchParams.get("registerId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(registerId)) return errorResponse("Till not found", 404);
  try {
    return successResponse({ data: await openingDefaults(session.user.companyId, registerId) });
  } catch (error) {
    if (error instanceof ShiftRefused) return errorResponse(error.message, error.status);
    throw error;
  }
}
