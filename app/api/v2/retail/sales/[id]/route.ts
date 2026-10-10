import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { loadSaleView } from "@/lib/retail/floor/sale-view";
import { updateSale } from "@/lib/retail/floor/sales";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { requireRetailSession } from "../../_helpers";
import { SALES_REFUSAL, saleActor, saleRefusalResponse } from "../_shared";

/**
 * One sale (or refund document) as its record page reads it (`SaleView`).
 * A cashier reads only the sales they rang; anyone else's answers as missing.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const reads = canRetailSessionDo(session, "retail.sell", "view") || canRetailSessionDo(session, "retail.cash-control", "view");
  if (!reads) return errorResponse(SALES_REFUSAL, 403);

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  const sale = await loadSaleView(session.user.companyId, path.data.id, { userId: session.user.id, role: session.user.role });
  if (!sale) return errorResponse("Sale not found", 404);
  return successResponse({ data: sale });
}

const patchSchema = z
  .object({
    customerId: z.string().uuid().nullable().optional(),
    paymentReference: z
      .object({ paymentId: z.string().uuid(), reference: z.string().trim().min(1).max(40) })
      .optional(),
  })
  .strict();

/**
 * The sale's details changed in place: the customer it was rung for, or a
 * payment's reference. No money, stock or journal moves; a voided sale
 * refuses both (409).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.sell", "update");
  if (gate) return gate;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const body = patchSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return errorResponse("Validation failed", 400, body.error.issues);

  try {
    return successResponse(await updateSale(session.user.companyId, path.data.id, saleActor(session), body.data));
  } catch (error) {
    return saleRefusalResponse(error, "PATCH /api/v2/retail/sales/[id]");
  }
}
