import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { customerActor, customerFailure } from "@/lib/retail/customers/routes";
import { adjustMany } from "@/lib/retail/loyalty/adjust";
import { requireRetailPermission } from "@/lib/retail/permissions";

import { requireRetailSession } from "../../_helpers";

/**
 * Add or take away points for many customers (CUS-04): `{ ids, direction, points, reason, note }`
 * → `{ done, skipped: [{ id, name }] }`, a take-away skipping anyone with too few. `retail.customers:update`.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.customers", "update");
  if (gate) return gate;

  const body = await request.json().catch(() => null);
  try {
    return successResponse(await adjustMany(customerActor(session), body));
  } catch (error) {
    return customerFailure(error, "POST /api/v2/retail/customers/points");
  }
}
