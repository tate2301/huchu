import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { giveAccessBack } from "@/lib/retail/people/access";
import { peopleActor, requestAddress } from "@/lib/retail/people/actor";
import { PERSON_NOT_FOUND } from "@/lib/retail/people/refusal";
import { parsePeopleBody, peopleFailure, UUID } from "@/lib/retail/people/routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../../_helpers";

type Context = { params: Promise<{ id: string }> };

const body = z.object({ sendNewPin: z.boolean().optional() });

/** Give a person their access back, with a new PIN when asked. `retail.people:delete`. */
export async function POST(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.people", "delete");
  if (gate) return gate;

  const { id } = await context.params;
  if (!UUID.test(id)) return errorResponse(PERSON_NOT_FOUND, 404);
  const parsed = await parsePeopleBody(request, body);
  if ("response" in parsed) return parsed.response;
  try {
    return successResponse(await giveAccessBack(peopleActor(session, requestAddress(request)), id, parsed.data));
  } catch (error) {
    return peopleFailure(error, "POST /api/v2/retail/people/[id]/give-access-back");
  }
}
