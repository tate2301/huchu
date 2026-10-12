import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { mergeCustomers } from "@/lib/retail/customers/merge";
import { customerActor, customerFailure } from "@/lib/retail/customers/routes";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../_helpers";

/**
 * Merge a duplicate into this customer (CUS-05, W-45): `{ duplicateId, keepPhone }`
 * → `{ data: { id, points, visits } }` (the survivor's after). Needs both
 * `retail.customers:update` and `retail.customers:delete`: the duplicate goes to the bin.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.customers", "update") ?? requireRetailPermission(session, "retail.customers", "delete");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  const body = await request.json().catch(() => null);
  try {
    const data = await prisma.$transaction((tx) => mergeCustomers(tx, customerActor(session), path.data.id, body));
    return successResponse({ data });
  } catch (error) {
    return customerFailure(error, "POST /api/v2/retail/customers/[id]/merge");
  }
}
