import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, fieldErrorResponse } from "@/lib/api-response";

import { PeopleRefusal } from "./refusal";

/**
 * What every `/api/v2/retail/people/**` route shares: the body checked into
 * `{ error, fieldErrors }`, and a refusal answered with its status.
 */

export async function parsePeopleBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
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
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "body");
    fieldErrors[key] ??= key === "message" ? "Write a message." : "Check this.";
  }
  return { response: fieldErrorResponse("Validation failed", fieldErrors) };
}

export function peopleFailure(error: unknown, where: string): NextResponse {
  if (error instanceof PeopleRefusal) {
    if (error.fieldErrors) return fieldErrorResponse(error.message, error.fieldErrors, error.status);
    return errorResponse(error.message, error.status);
  }
  console.error(`[API] ${where} error:`, error);
  return errorResponse("That did not work. Nothing was changed; try again.");
}

export const idsInput = z.object({ ids: z.array(z.string().uuid()).min(1).max(100) });

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
