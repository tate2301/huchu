import { NextRequest, NextResponse } from "next/server";

import { fieldErrorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { buyingActor, buyingFailure, supplierViewer } from "@/lib/retail/buying/routes";
import { createSupplier, supplierFieldErrors, supplierInput } from "@/lib/retail/buying/suppliers";
import { loadSupplierView } from "@/lib/retail/buying/supplier-view";
import { requireRetailPermission } from "@/lib/retail/permissions";

import { requireRetailSession } from "../../_helpers";

/**
 * Add a supplier (40-buying W-29, 4.2): the New supplier sheet.
 * `retail.suppliers:create` (owner, manager). 201 `{ data: SupplierView }`;
 * 400 "Validation failed" under the sheet's fields; 409 under Name for a
 * name another supplier bought from has. The list is `retail-suppliers`.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.suppliers", "create");
  if (gate) return gate;

  const parsed = supplierInput.safeParse((await request.json().catch(() => null)) ?? {});
  if (!parsed.success) return fieldErrorResponse("Validation failed", supplierFieldErrors(parsed.error));

  const actor = buyingActor(session);
  try {
    const created = await prisma.$transaction((tx) => createSupplier(tx, actor, parsed.data));
    const data = (await loadSupplierView(actor.companyId, created.id, supplierViewer(session))) ?? created;
    return successResponse({ data }, 201);
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/suppliers");
  }
}
