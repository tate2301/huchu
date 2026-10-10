import { NextRequest, NextResponse } from "next/server";

import { answerClose, answerCloseForm } from "@/lib/retail/floor/shifts";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { requireRetailSession } from "../../../_helpers";

/**
 * Count and close (50-floor W-39, FLR-04). GET reads the close page's
 * `CountForm`: blind for a cashier counting their own drawer, read-only once
 * the shift is closed. POST counts by note and closes through `closeShift`;
 * a cashier's own drawer is `retail.sell:close-shift`, anybody's is
 * `retail.cash-control:close-shift`.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  // The cashier's own drawer or cash control's view of anybody's; the page's own rule narrows it to the shift.
  if (!canRetailSessionDo(session, "retail.sell", "close-shift") && !canRetailSessionDo(session, "retail.cash-control", "view")) {
    return requireRetailPermission(session, "retail.sell", "close-shift") as NextResponse;
  }
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  return answerCloseForm(session, path.data.id);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  if (!canRetailSessionDo(session, "retail.sell", "close-shift") && !canRetailSessionDo(session, "retail.cash-control", "close-shift")) {
    return requireRetailPermission(session, "retail.sell", "close-shift") as NextResponse;
  }
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const body = await request.json().catch(() => null);
  return answerClose({ session, shiftId: path.data.id, body });
}
