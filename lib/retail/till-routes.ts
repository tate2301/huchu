import { NextResponse } from "next/server";
import { z } from "zod";

import { markActivityFailed } from "@/lib/activity/context";
import { errorResponse, fieldErrorResponse } from "@/lib/api-response";
import type { RetailAuditActor } from "@/lib/retail/audit";
import { PairingRefusal } from "@/lib/retail/pairing";
import { tillFieldErrors } from "@/lib/retail/tills";

/**
 * What every `/api/v2/retail/tills/**` route shares: the actor off the
 * session, the body checked into `{ error, fieldErrors }`, and refusals
 * answered with their status — under a field, or as `{ error, code }` for a
 * rule (PLAN_LIMIT, SHIFT_OPEN, TILL_USED, PAIRED, NOT_PAIRED).
 */

type RouteSession = { user: { companyId: string; id: string; name?: string | null; role?: string | null } };

export function tillActor(session: RouteSession): RetailAuditActor {
  return {
    companyId: session.user.companyId,
    userId: session.user.id,
    userName: session.user.name ?? null,
    userRole: session.user.role ?? null,
  };
}

export async function parseTillBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  // No body at all is "nothing given" (Pair a till opens with an empty POST);
  // a body that is not JSON is refused, never read as empty.
  const text = await request.text().catch(() => "");
  let body: unknown = {};
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      return { response: errorResponse("That request could not be read. Nothing was changed.", 400) };
    }
  }
  const parsed = schema.safeParse(body ?? {});
  if (parsed.success) return { data: parsed.data };
  const fieldErrors = tillFieldErrors(parsed.error);
  return { response: fieldErrorResponse(Object.values(fieldErrors)[0] ?? "Check the fields.", fieldErrors) };
}

export function tillFailure(error: unknown, where: string): NextResponse {
  if (error instanceof PairingRefusal) {
    markActivityFailed();
    const { field, code } = error.opts;
    return NextResponse.json(
      { error: error.message, ...(code ? { code } : {}), ...(field ? { fieldErrors: { [field]: error.message } } : {}) },
      { status: error.status },
    );
  }
  console.error(`[API] ${where} error:`, error);
  return errorResponse("That did not work. Nothing was changed; try again.");
}

export const TILL_NOT_FOUND = "That till is not one of this shop's.";
