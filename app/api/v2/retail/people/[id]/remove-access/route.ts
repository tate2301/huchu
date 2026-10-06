import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { removeAccess } from "@/lib/retail/people/access";
import { peopleActor, requestAddress } from "@/lib/retail/people/actor";
import { PERSON_NOT_FOUND } from "@/lib/retail/people/refusal";
import { peopleFailure, UUID } from "@/lib/retail/people/routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../../_helpers";

type Context = { params: Promise<{ id: string }> };

/**
 * Remove a person's access: their open shifts closed without a count, their
 * PIN and invite gone, their sessions ended at the next request.
 * `retail.people:delete`. `{ data, closedShifts }`.
 */
export async function POST(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.people", "delete");
  if (gate) return gate;

  const { id } = await context.params;
  if (!UUID.test(id)) return errorResponse(PERSON_NOT_FOUND, 404);
  try {
    return successResponse(await removeAccess(peopleActor(session, requestAddress(request)), id));
  } catch (error) {
    return peopleFailure(error, "POST /api/v2/retail/people/[id]/remove-access");
  }
}
