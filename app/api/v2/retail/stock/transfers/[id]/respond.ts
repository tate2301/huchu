import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, fieldErrorResponse } from "@/lib/api-response";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { TransferRefusal, type TransferActor } from "@/lib/retail/stock/transfers";

import type { RetailSession } from "../../../_helpers";

/** What one transfer's routes share: who is acting, the id check, and a refusal as its answer. */

export const NOT_FOUND = "That transfer is not this shop’s.";

export const isId = (id: string) => z.string().uuid().safeParse(id).success;

export function transferActor(session: RetailSession): TransferActor & { canSeeCost: boolean } {
  return {
    companyId: session.user.companyId,
    userId: session.user.id,
    userName: session.user.name ?? null,
    userRole: session.user.role ?? null,
    canSeeCost: canRetailSessionDo(session, "retail.catalog", "view-cost"),
  };
}

/** A `TransferRefusal` as the route answers it; anything else is logged and said plainly. */
export function refusalResponse(error: unknown, where: string, fallback: string): NextResponse {
  if (error instanceof TransferRefusal) {
    return error.fieldErrors
      ? fieldErrorResponse(error.message, error.fieldErrors, error.status)
      : errorResponse(error.message, error.status);
  }
  console.error(`[API] ${where} error:`, error);
  return errorResponse(fallback);
}
