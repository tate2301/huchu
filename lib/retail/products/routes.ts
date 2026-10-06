import { NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse } from "@/lib/api-response";
import type { RetailAuditActor } from "@/lib/retail/audit";
import { DefaultListMissing } from "@/lib/retail/prices/change";

import { ProductRefusal } from "./create";

/**
 * What every `/api/v2/retail/products/**` route shares: the actor off the
 * session, and refusals answered with their status and the field they
 * belong under.
 */

export function productActor(session: {
  user: { companyId: string; id: string; name?: string | null; role?: string | null };
}): RetailAuditActor {
  return {
    companyId: session.user.companyId,
    userId: session.user.id,
    userName: session.user.name ?? null,
    userRole: session.user.role ?? null,
  };
}

/** A refusal with its field, else a 500 that says nothing was saved. */
export function productFailure(error: unknown, where: string): NextResponse {
  if (error instanceof ProductRefusal) {
    return error.field
      ? fieldErrorResponse(error.message, { [error.field]: error.message }, error.status)
      : errorResponse(error.message, error.status);
  }
  if (error instanceof DefaultListMissing) return errorResponse(error.message, 500);
  console.error(`[API] ${where} error:`, error);
  return errorResponse("That did not work. Nothing was saved; try again.");
}
