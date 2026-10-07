import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, fieldErrorResponse } from "@/lib/api-response";
import { CountRefusal, NOT_FOUND, type CountActor } from "@/lib/retail/stock/counts";

import type { RetailSession } from "../../_helpers";

/** What the counts routes share: who is acting, the id check, and a refusal as its answer. */

export { NOT_FOUND };

export const isId = (id: string) => z.string().uuid().safeParse(id).success;

export function countActor(session: RetailSession): CountActor {
  return {
    companyId: session.user.companyId,
    userId: session.user.id,
    userName: session.user.name ?? null,
    userRole: session.user.role ?? null,
  };
}

/** A `CountRefusal` as the route answers it; anything else is logged and said plainly. */
export function refusalResponse(error: unknown, where: string, fallback: string): NextResponse {
  if (error instanceof CountRefusal) {
    return error.fieldErrors
      ? fieldErrorResponse(error.message, error.fieldErrors, error.status)
      : errorResponse(error.message, error.status);
  }
  console.error(`[API] ${where} error:`, error);
  return errorResponse(fallback);
}
