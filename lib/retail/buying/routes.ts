import { NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse } from "@/lib/api-response";
import type { RetailAuditActor } from "@/lib/retail/audit";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";

import { SupplierRefusal } from "./suppliers";
import type { SupplierViewer } from "./supplier-view";

/**
 * What every `/api/v2/retail/buying/**` route shares: the actor off the
 * session, what the viewer may do, and refusals answered with their status
 * and fields.
 */

type Session = Parameters<typeof canRetailSessionDo>[0] & {
  user: { companyId: string; id: string; name?: string | null; role?: string | null };
};

export function buyingActor(session: Session): RetailAuditActor {
  return {
    companyId: session.user.companyId,
    userId: session.user.id,
    userName: session.user.name ?? null,
    userRole: session.user.role ?? null,
  };
}

/** The record's `can` (40-buying 4.2). */
export function supplierViewer(session: Session): SupplierViewer {
  return {
    update: canRetailSessionDo(session, "retail.suppliers", "update"),
    delete: canRetailSessionDo(session, "retail.suppliers", "delete"),
    order: canRetailSessionDo(session, "retail.purchasing", "create"),
    bill: canRetailSessionDo(session, "retail.bills", "create"),
    pay: canRetailSessionDo(session, "retail.bills", "create"),
    return: canRetailSessionDo(session, "retail.purchasing", "create"),
  };
}

/** A refusal with its fields (400 "Validation failed", 409 under Name) or its sentence, else a 500 that says nothing was saved. */
export function buyingFailure(error: unknown, where: string): NextResponse {
  if (error instanceof SupplierRefusal) {
    return error.fieldErrors ? fieldErrorResponse(error.message, error.fieldErrors, error.status) : errorResponse(error.message, error.status);
  }
  console.error(`[API] ${where} error:`, error);
  return errorResponse("That did not work. Nothing was saved; try again.");
}
