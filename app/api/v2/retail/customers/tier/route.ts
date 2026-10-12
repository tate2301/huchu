import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { customerActor, customerFailure } from "@/lib/retail/customers/routes";
import { setTiers } from "@/lib/retail/loyalty/adjust";
import { requireRetailPermission } from "@/lib/retail/permissions";

import { requireRetailSession } from "../../_helpers";

/**
 * Change many customers' tier (CUS-04): `{ ids, tier }` → `{ count, until }`, held for 12 months
 * unless it is the tier their spend gives. `retail.customers:update`.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.customers", "update");
  if (gate) return gate;

  const body = await request.json().catch(() => null);
  try {
    return successResponse(await setTiers(customerActor(session), body));
  } catch (error) {
    return customerFailure(error, "POST /api/v2/retail/customers/tier");
  }
}
