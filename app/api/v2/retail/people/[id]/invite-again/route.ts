import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { peopleActor, requestAddress } from "@/lib/retail/people/actor";
import { inviteAgain } from "@/lib/retail/people/invite";
import { PERSON_NOT_FOUND } from "@/lib/retail/people/refusal";
import { peopleFailure, UUID } from "@/lib/retail/people/routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../../_helpers";

type Context = { params: Promise<{ id: string }> };

/** Send the invite again: a new link for 7 days, the old one stops. `retail.people:update` plus the role rule. */
export async function POST(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.people", "update");
  if (gate) return gate;

  const { id } = await context.params;
  if (!UUID.test(id)) return errorResponse(PERSON_NOT_FOUND, 404);
  try {
    return successResponse(await inviteAgain(peopleActor(session, requestAddress(request)), id));
  } catch (error) {
    return peopleFailure(error, "POST /api/v2/retail/people/[id]/invite-again");
  }
}
