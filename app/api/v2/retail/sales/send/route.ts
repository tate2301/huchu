import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { sendSaleReceipts } from "@/lib/retail/floor/sales";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";
import { saleActor, saleRefusalResponse } from "../_shared";

const bodySchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).strict();

/** "Send receipts" over ticked sales: one for each sale with a customer's number; `noNumber` counts the rest. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.sell", "view");
  if (gate) return gate;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return errorResponse("Validation failed", 400, body.error.issues);

  try {
    return successResponse(await sendSaleReceipts(session.user.companyId, body.data.ids, saleActor(session)));
  } catch (error) {
    return saleRefusalResponse(error, "POST /api/v2/retail/sales/send");
  }
}
