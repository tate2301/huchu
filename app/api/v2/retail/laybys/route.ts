import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { laybyPlaceOf, laybyResponse } from "@/lib/retail/floor/layby-routes";
import { startLayby } from "@/lib/retail/floor/laybys";
import { reversalActorOf } from "@/lib/retail/floor/reversal";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../_helpers";

/** Start a lay-by (FLR-06, W-42): the goods off the shelf, the deposit held, `{ id, laybyNo, left, dueOn }`. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.laybys", "create");
  if (gate) return gate;
  try {
    const body = await request.json().catch(() => null);
    const data = await startLayby(reversalActorOf(session), body, { place: await laybyPlaceOf(request, session) });
    return successResponse({ data }, 201);
  } catch (error) {
    return laybyResponse(error, "POST /api/v2/retail/laybys");
  }
}
