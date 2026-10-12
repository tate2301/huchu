import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { markActivityFailed } from "@/lib/activity/context";
import { errorResponse } from "@/lib/api-response";
import { pinPlaceOf } from "@/lib/retail/devices";

import { DrawerClosed } from "./drawer";
import { LaybyRefused, type LaybyPlace } from "./laybys";

/**
 * What the lay-by routes share (FLR-06): the refusal as the sheets read it
 * (one sentence, under a field, or the drawers to choose from), and where the
 * act is done. The routes take a till-PIN session on the POS host too: the
 * till it was opened at, or this host's paired till, is the drawer (SET-04).
 */

export function laybyResponse(error: unknown, route: string): NextResponse {
  if (error instanceof LaybyRefused) {
    markActivityFailed();
    return NextResponse.json(
      { error: error.message, ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}), ...error.extra },
      { status: error.status },
    );
  }
  if (error instanceof DrawerClosed) return errorResponse(error.message, 409);
  console.error(`[API] ${route} error:`, error);
  return errorResponse("That did not work. Nothing was changed; try again.", 500);
}

export async function laybyPlaceOf(
  request: NextRequest,
  session: { user: { companyId: string; registerId?: string | null } },
): Promise<LaybyPlace> {
  const place = await pinPlaceOf(request, session);
  return { registerId: place.registerId ?? null };
}
