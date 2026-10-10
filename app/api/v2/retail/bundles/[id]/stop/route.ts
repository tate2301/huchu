import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { bundleActor, bundleFailure, isBundleId } from "@/lib/retail/bundles/routes";
import { stopBundle } from "@/lib/retail/bundles/service";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../../_helpers";

type Params = { params: Promise<{ id: string }> };

/** "Stop selling it" (ask `bundlestop`): off every till for good; its sales history stays. `retail.promotions:update`. */
export async function POST(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.promotions", "update");
  if (gate) return gate;

  const { id } = await params;
  if (!isBundleId(id)) return errorResponse("Bundle not found", 404);
  try {
    const stopped = await stopBundle(bundleActor(session), id);
    return successResponse({ stoppedAt: stopped.stoppedAt, message: `${stopped.name} is off every till.` });
  } catch (error) {
    return bundleFailure(error, "POST /api/v2/retail/bundles/[id]/stop");
  }
}
