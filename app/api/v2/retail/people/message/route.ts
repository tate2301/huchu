import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { successResponse } from "@/lib/api-response";
import { peopleActor, requestAddress } from "@/lib/retail/people/actor";
import { messagePeople } from "@/lib/retail/people/bulk";
import { parsePeopleBody, peopleFailure } from "@/lib/retail/people/routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

const body = z.object({ ids: z.array(z.string().uuid()).min(1).max(100), message: z.string().max(2000) });

/** "Send a message" from People's selection: in the app and on WhatsApp. `retail.people:update`. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.people", "update");
  if (gate) return gate;

  const parsed = await parsePeopleBody(request, body);
  if ("response" in parsed) return parsed.response;
  try {
    return successResponse(await messagePeople(peopleActor(session, requestAddress(request)), parsed.data.ids, parsed.data.message));
  } catch (error) {
    return peopleFailure(error, "POST /api/v2/retail/people/message");
  }
}
