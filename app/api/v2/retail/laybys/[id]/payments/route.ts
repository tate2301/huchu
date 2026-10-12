import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { laybyPlaceOf, laybyResponse } from "@/lib/retail/floor/layby-routes";
import { payLayby } from "@/lib/retail/floor/laybys";
import { reversalActorOf } from "@/lib/retail/floor/reversal";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { requireRetailSession } from "../../../_helpers";

/** Money taken towards a lay-by (FLR-06): READY once all of it is paid. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.laybys", "update");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  try {
    const body = await request.json().catch(() => null);
    const data = await payLayby(reversalActorOf(session), path.data.id, body, { place: await laybyPlaceOf(request, session) });
    return successResponse({ data }, 201);
  } catch (error) {
    return laybyResponse(error, "POST /api/v2/retail/laybys/[id]/payments");
  }
}
