import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { peopleActor, requestAddress } from "@/lib/retail/people/actor";
import { resetPins } from "@/lib/retail/people/bulk";
import { idsInput, parsePeopleBody, peopleFailure } from "@/lib/retail/people/routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/** "Reset PINs" from People's selection: `{ sent, skipped, handOver }`. `retail.people:update`. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.people", "update");
  if (gate) return gate;

  const parsed = await parsePeopleBody(request, idsInput);
  if ("response" in parsed) return parsed.response;
  try {
    return successResponse(await resetPins(peopleActor(session, requestAddress(request)), parsed.data.ids));
  } catch (error) {
    return peopleFailure(error, "POST /api/v2/retail/people/pins");
  }
}
