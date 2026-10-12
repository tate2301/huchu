import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { customerActor, customerFailure, customerViewer } from "@/lib/retail/customers/routes";
import { updateCustomer } from "@/lib/retail/customers/update";
import { CUSTOMER_NOT_FOUND, loadCustomerRecord } from "@/lib/retail/customers/view";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../_helpers";

/** A customer as their record reads them (CUS-03): `{ data: CustomerRecordView }`, binned too. `retail.customers:view`. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.customers", "view");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  const data = await loadCustomerRecord(session.user.companyId, path.data.id, customerViewer(session));
  if (!data) return errorResponse(CUSTOMER_NOT_FOUND, 404);
  return successResponse({ data });
}

/**
 * Change a customer (CUS-03, W-62): one or more of name, phone, whatsapp,
 * email, area, dateOfBirth, marketingConsent, cardNo, tier, priceListId.
 * `retail.customers:update`. `{ data, changed }`; 400 under the field, 409 a
 * number or card another customer has, or a customer in the bin.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.customers", "update");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  const body = await request.json().catch(() => null);
  const actor = customerActor(session);
  try {
    const changed = await prisma.$transaction((tx) => updateCustomer(tx, actor, path.data.id, body));
    const data = await loadCustomerRecord(actor.companyId, path.data.id, customerViewer(session));
    if (!data) return errorResponse(CUSTOMER_NOT_FOUND, 404);
    return successResponse({ data, changed });
  } catch (error) {
    return customerFailure(error, "PATCH /api/v2/retail/customers/[id]");
  }
}
