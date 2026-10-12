import { NextResponse } from "next/server";

import { markActivityFailed } from "@/lib/activity/context";
import { errorResponse, fieldErrorResponse } from "@/lib/api-response";
import type { RetailAuditActor } from "@/lib/retail/audit";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";

import { CustomerRefusal } from "./create";
import type { CustomerViewer } from "./view";

/** What the customer routes share: the actor, what the viewer may do, and refusals in their own words. */

type Session = Parameters<typeof canRetailSessionDo>[0] & {
  user: { companyId: string; id: string; name?: string | null; role?: string | null };
};

export function customerActor(session: Session): RetailAuditActor {
  return {
    companyId: session.user.companyId,
    userId: session.user.id,
    userName: session.user.name ?? null,
    userRole: session.user.role ?? null,
  };
}

export function customerViewer(session: Session): CustomerViewer {
  return {
    update: canRetailSessionDo(session, "retail.customers", "update"),
    delete: canRetailSessionDo(session, "retail.customers", "delete"),
    activity: canRetailSessionDo(session, "retail.activity", "view"),
  };
}

/** A refusal with its fields (and who holds a number or card), else a 500 that says nothing was saved. */
export function customerFailure(error: unknown, where: string): NextResponse {
  if (error instanceof CustomerRefusal) {
    if (error.existing) {
      markActivityFailed();
      return NextResponse.json({ error: error.message, fieldErrors: error.fieldErrors, existing: error.existing }, { status: error.status });
    }
    return Object.keys(error.fieldErrors).length
      ? fieldErrorResponse(error.message, error.fieldErrors, error.status)
      : errorResponse(error.message, error.status);
  }
  console.error(`[API] ${where} error:`, error);
  return errorResponse("That did not work. Nothing was saved; try again.");
}
