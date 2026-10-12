import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { laybyPlaceOf, laybyResponse } from "@/lib/retail/floor/layby-routes";
import { changeDue, laybyView } from "@/lib/retail/floor/laybys";
import { reversalActorOf } from "@/lib/retail/floor/reversal";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { requireRetailSession } from "../../_helpers";

/** A lay-by as its sheet reads it (`GET`), and its Pay by moved (`PATCH { dueOn }`) (FLR-06). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.laybys", "view");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  try {
    return successResponse({ data: await laybyView(reversalActorOf(session), path.data.id, { place: await laybyPlaceOf(request, session) }) });
  } catch (error) {
    return laybyResponse(error, "GET /api/v2/retail/laybys/[id]");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.laybys", "update");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  try {
    const body = await request.json().catch(() => null);
    return successResponse({ data: await changeDue(reversalActorOf(session), path.data.id, body) });
  } catch (error) {
    return laybyResponse(error, "PATCH /api/v2/retail/laybys/[id]");
  }
}
