import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { removeAccessMany } from "@/lib/retail/people/access";
import { peopleActor, requestAddress } from "@/lib/retail/people/actor";
import { idsInput, parsePeopleBody, peopleFailure } from "@/lib/retail/people/routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/** Remove access for several: `{ removed, skipped, closedShifts }`. `retail.people:delete`. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.people", "delete");
  if (gate) return gate;

  const parsed = await parsePeopleBody(request, idsInput);
  if ("response" in parsed) return parsed.response;
  try {
    return successResponse(await removeAccessMany(peopleActor(session, requestAddress(request)), parsed.data.ids));
  } catch (error) {
    return peopleFailure(error, "POST /api/v2/retail/people/remove-access");
  }
}
