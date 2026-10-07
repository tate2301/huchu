import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, fieldErrorResponse } from "@/lib/api-response";
import type { RetailAuditActor } from "@/lib/retail/audit";

import { PriceListRefusal } from "./service";

/** What every `/api/v2/retail/price-lists/**` route shares: the actor, the body, the refusals. */

export function priceListActor(session: {
  user: { companyId: string; id: string; name?: string | null; role?: string | null };
}): RetailAuditActor {
  return { companyId: session.user.companyId, userId: session.user.id, userName: session.user.name ?? null, userRole: session.user.role ?? null };
}

export async function parsePriceListBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (parsed.success) return { data: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= "Check this field.";
  }
  return { response: fieldErrorResponse(Object.values(fieldErrors)[0] ?? "Check the fields.", fieldErrors) };
}

export function priceListFailure(error: unknown, where: string): NextResponse {
  if (error instanceof PriceListRefusal) {
    return Object.keys(error.fieldErrors).length
      ? fieldErrorResponse(error.message, error.fieldErrors, error.status)
      : errorResponse(error.message, error.status);
  }
  console.error(`[API] ${where} error:`, error);
  return errorResponse("That did not work. Nothing was changed; try again.");
}

export const isPriceListId = (id: string) => z.string().uuid().safeParse(id).success;
