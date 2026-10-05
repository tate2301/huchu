import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseTillBody, tillActor, tillFailure } from "@/lib/retail/till-routes";
import { TILL_STATE_WORDS, type TillState } from "@/lib/retail/till-words";
import { createTill, listTills, tillInput } from "@/lib/retail/tills";
import { requireRetailSession } from "../_helpers";

const STATES = Object.keys(TILL_STATE_WORDS) as TillState[];

/**
 * The shop's tills (10-setup 4.3): `?siteId=&state=&q=` →
 * `{ data: TillRow[], totals: { count } }`, each with its device, last sale,
 * who is on it and its state. `retail.tills:view`.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.tills", "view");
  if (gate) return gate;

  const params = request.nextUrl.searchParams;
  const state = STATES.find((value) => value === params.get("state")) ?? null;
  return successResponse(
    await listTills(session.user.companyId, { siteId: params.get("siteId"), state, q: params.get("q") }),
  );
}

/**
 * Pair a till (W-04 step 1): makes the till (name suggested unless given, the
 * default site unless given) and its first pairing code. 409 PLAN_LIMIT when
 * every till the plan allows is paired. `retail.tills:create` (Owner,
 * Manager). 201 `{ data: TillDetail, code, expiresAt }`.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.tills", "create");
  if (gate) return gate;

  const parsed = await parseTillBody(request, tillInput);
  if ("response" in parsed) return parsed.response;

  try {
    return successResponse(await createTill(tillActor(session), parsed.data), 201);
  } catch (error) {
    return tillFailure(error, "POST /api/v2/retail/tills");
  }
}
