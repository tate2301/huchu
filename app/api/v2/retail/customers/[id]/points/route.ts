import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { customerActor, customerFailure } from "@/lib/retail/customers/routes";
import { adjustPoints } from "@/lib/retail/loyalty/adjust";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../_helpers";

/**
 * Adjust a customer's points (CUS-04, W-47): `{ direction, points, reason, note }`
 * → 201 `{ data: { entryId, balance } }`. `retail.customers:update`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.customers", "update");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  const body = await request.json().catch(() => null);
  const actor = customerActor(session);
  try {
    const data = await prisma.$transaction((tx) => adjustPoints(tx, actor, path.data.id, body));
    return successResponse({ data }, 201);
  } catch (error) {
    return customerFailure(error, "POST /api/v2/retail/customers/[id]/points");
  }
}
