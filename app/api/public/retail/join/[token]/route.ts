import { NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { acceptJoin, readJoin } from "@/lib/retail/people/join";
import { PeopleRefusal } from "@/lib/retail/people/refusal";

/**
 * Joining a shop by the WhatsApp link (80-admin 5.6). No session: the token is
 * the capability. 404 "This link is not valid any more." for an unknown,
 * expired, used or withdrawn link, never told apart.
 */

type Context = { params: Promise<{ token: string }> };

function failure(error: unknown) {
  if (error instanceof PeopleRefusal) {
    return error.fieldErrors ? fieldErrorResponse(error.message, error.fieldErrors, error.status) : errorResponse(error.message, error.status);
  }
  console.error("[API] /api/public/retail/join error:", error);
  return errorResponse("That did not work. Try again.");
}

export async function GET(_request: NextRequest, context: Context) {
  const { token } = await context.params;
  try {
    return successResponse({ data: await readJoin(token) });
  } catch (error) {
    return failure(error);
  }
}

const body = z.object({ password: z.string().max(500).nullish() });

export async function POST(request: NextRequest, context: Context) {
  const { token } = await context.params;
  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return fieldErrorResponse("Validation failed", { password: "Choose a password of 8 characters or more." });
  try {
    return successResponse({ data: await acceptJoin(token, { password: parsed.data.password }) });
  } catch (error) {
    return failure(error);
  }
}
