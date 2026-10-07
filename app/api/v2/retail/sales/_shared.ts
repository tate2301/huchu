import { NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse } from "@/lib/api-response";
import { SaleRefusal, type SaleActor } from "@/lib/retail/floor/sales";
import type { RetailSession } from "../_helpers";

/** Sales are read through the till (`retail.sell`) or cash control; a stock clerk holds neither. */
export const SALES_REFUSAL = "Your role cannot view sales";

export function saleActor(session: RetailSession): SaleActor {
  return {
    companyId: session.user.companyId,
    userId: session.user.id,
    userName: session.user.name ?? null,
    userRole: session.user.role ?? null,
  };
}

/** A refusal in the shape the spec gives it: under a field (400), or one sentence (404, 409). */
export function saleRefusalResponse(error: unknown, route: string): NextResponse {
  if (error instanceof SaleRefusal) {
    return error.fieldErrors ? fieldErrorResponse(error.message, error.fieldErrors, error.status) : errorResponse(error.message, error.status);
  }
  console.error(`[API] ${route} error:`, error);
  return errorResponse("That did not work. Try again.");
}
