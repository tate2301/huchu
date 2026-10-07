/**
 * The till's cash in and out, under the till's feature key (S-7.9).
 *
 * A second path rather than a second gate: `route-registry.ts` maps the whole
 * `/api/v2/retail/shifts` prefix to `retail.shifts`, the back office's screen
 * of every drawer, which a cashier's role does not carry. Recording cash on
 * your own drawer is part of running a till, so the till posts here.
 *
 * SET-04: at the till, on a till, on this till's shift. The device is checked
 * first (its key is the credential for which till this is), then that the
 * shift is on this till. GET reads the back office's list; POST records through
 * the same `recordCashMove` (FLR-03) with the device as the place a manager's
 * PIN was typed.
 */

import type { NextRequest, NextResponse } from "next/server";

import { answerCashMove } from "@/lib/retail/floor/cash-moves";
import { refuseShiftElsewhere, requirePosDevice } from "@/lib/retail/devices";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { requireRetailSession } from "../../../../_helpers";
import { GET as drawerGet } from "../../../../shifts/[id]/cash-movements/route";

type Context = Parameters<typeof drawerGet>[1];

export async function GET(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const { device, response: deviceResponse } = await requirePosDevice(request, session);
  if (deviceResponse) return deviceResponse;
  const path = await parseRetailParams(context.params, retailIdParams);
  if (path.response) return path.response;
  return (await refuseShiftElsewhere(device, path.data.id)) ?? drawerGet(request, context);
}

export async function POST(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const { device, response: deviceResponse } = await requirePosDevice(request, session);
  if (deviceResponse) return deviceResponse;
  const path = await parseRetailParams(context.params, retailIdParams);
  if (path.response) return path.response;
  const elsewhere = await refuseShiftElsewhere(device, path.data.id);
  if (elsewhere) return elsewhere;
  const body = await request.json().catch(() => null);
  return answerCashMove({
    session,
    shiftId: path.data.id,
    body,
    place: { registerId: device.registerId, deviceId: device.id },
  });
}
