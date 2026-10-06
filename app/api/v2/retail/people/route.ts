import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { peopleActor, requestAddress, viewerOf } from "@/lib/retail/people/actor";
import { inviteInput } from "@/lib/retail/people/fields";
import { invitePerson } from "@/lib/retail/people/invite";
import { parsePeopleBody, peopleFailure } from "@/lib/retail/people/routes";
import { loadPeople } from "@/lib/retail/people/view";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../_helpers";

/**
 * The shop's people (80-admin 4.1). `retail.people:view` →
 * `{ data: PersonView[] }`; the People page reads the same rows through the
 * `retail-people` list source.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.people", "view");
  if (gate) return gate;
  const actor = peopleActor(session, requestAddress(request));
  return successResponse({ data: await loadPeople(actor.companyId, viewerOf(actor)) });
}

/**
 * Invite someone (W-57): the person at once, their WhatsApp link (7 days) and,
 * when asked, a till PIN. `retail.people:create` plus the role rule (a manager
 * adds cashiers and stock clerks only). 201 `{ data, sent, handOver? }`.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.people", "create");
  if (gate) return gate;

  const parsed = await parsePeopleBody(request, inviteInput);
  if ("response" in parsed) return parsed.response;
  try {
    return successResponse(await invitePerson(peopleActor(session, requestAddress(request)), parsed.data), 201);
  } catch (error) {
    return peopleFailure(error, "POST /api/v2/retail/people");
  }
}
