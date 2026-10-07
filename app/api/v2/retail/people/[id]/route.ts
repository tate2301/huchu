import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { peopleActor, requestAddress, viewerOf } from "@/lib/retail/people/actor";
import { changePerson } from "@/lib/retail/people/change";
import { changeInput } from "@/lib/retail/people/fields";
import { PERSON_NOT_FOUND } from "@/lib/retail/people/refusal";
import { parsePeopleBody, peopleFailure, UUID } from "@/lib/retail/people/routes";
import { loadPerson } from "@/lib/retail/people/view";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

type Context = { params: Promise<{ id: string }> };

/** One person, as their sheet shows them. `retail.people:view`. */
export async function GET(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.people", "view");
  if (gate) return gate;

  const { id } = await context.params;
  if (!UUID.test(id)) return errorResponse(PERSON_NOT_FOUND, 404);
  const actor = peopleActor(session, requestAddress(request));
  const data = await loadPerson(actor.companyId, viewerOf(actor), id);
  if (!data) return errorResponse(PERSON_NOT_FOUND, 404);
  return successResponse({ data });
}

/**
 * Change a person: name, phone, role, sites, a new PIN. `retail.people:update`
 * plus the role rule; nobody changes their own role; the last owner keeps it.
 */
export async function PATCH(request: NextRequest, context: Context) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.people", "update");
  if (gate) return gate;

  const { id } = await context.params;
  if (!UUID.test(id)) return errorResponse(PERSON_NOT_FOUND, 404);
  const parsed = await parsePeopleBody(request, changeInput);
  if ("response" in parsed) return parsed.response;
  try {
    return successResponse(await changePerson(peopleActor(session, requestAddress(request)), id, parsed.data));
  } catch (error) {
    return peopleFailure(error, "PATCH /api/v2/retail/people/[id]");
  }
}
