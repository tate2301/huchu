import { NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse } from "@/lib/api-response";
import { EmptiesRefusal } from "@/lib/retail/stock/empties";

/** An Empties refusal in the sheet's words (409 off, 400 under its field, 404), or null for anything else. */
export function emptiesRefusal(error: unknown): NextResponse | null {
  if (!(error instanceof EmptiesRefusal)) return null;
  return error.fieldErrors
    ? fieldErrorResponse(error.message, error.fieldErrors, error.status)
    : errorResponse(error.message, error.status);
}

/** Who is acting, from the signed-in session. */
export function emptiesActor(session: { user: { companyId: string; id: string; name?: string | null; email?: string | null; role?: string | null } }) {
  return {
    companyId: session.user.companyId,
    userId: session.user.id,
    userName: session.user.name || session.user.email || null,
    userRole: session.user.role ?? null,
  };
}
