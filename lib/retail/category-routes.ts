import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, fieldErrorResponse } from "@/lib/api-response";
import { CategoryRefusal, fieldErrorsOf } from "@/lib/retail/categories";
import type { RetailAuditActor } from "@/lib/retail/audit";

/**
 * What every `/api/v2/retail/categories/**` route shares: the actor off the
 * session, the body checked into `{ error, fieldErrors }`, and refusals
 * answered with their status and the field they belong under.
 */

export function categoryActor(session: {
  user: { companyId: string; id: string; name?: string | null; role?: string | null };
}): RetailAuditActor {
  return {
    companyId: session.user.companyId,
    userId: session.user.id,
    userName: session.user.name ?? null,
    userRole: session.user.role ?? null,
  };
}

/** The body parsed by `schema`, or the 400 to answer with. */
export async function parseCategoryBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (parsed.success) return { data: parsed.data };
  const fieldErrors = fieldErrorsOf(parsed.error);
  return { response: fieldErrorResponse(Object.values(fieldErrors)[0] ?? "Check the fields.", fieldErrors) };
}

/** A refusal with its field, else a 500 that says nothing was changed. */
export function categoryFailure(error: unknown, where: string): NextResponse {
  if (error instanceof CategoryRefusal) {
    return error.field
      ? fieldErrorResponse(error.message, { [error.field]: error.message }, error.status)
      : errorResponse(error.message, error.status);
  }
  console.error(`[API] ${where} error:`, error);
  return errorResponse("That did not work. Nothing was changed; try again.");
}

export const isCategoryId = (id: string) => z.string().uuid().safeParse(id).success;
