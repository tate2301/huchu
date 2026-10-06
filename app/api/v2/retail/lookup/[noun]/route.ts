import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { addLookupOption, LOOKUP_NOUNS, searchLookup, type LookupCtx } from "@/lib/retail/lookups";
import { requestAddress } from "@/lib/retail/people/actor";
import { canRetailSessionDo, requireRetailPermission } from "@/lib/retail/permissions";

import { requireRetailSession, type RetailSession } from "../../_helpers";

/**
 * The data behind every `auto` field and its inline add (00-foundations 4.4,
 * F-3). The nouns, their permissions and their create services are in
 * `lib/retail/lookups`.
 */

type Params = { params: Promise<{ noun: string }> };

function lookupCtx(session: NonNullable<RetailSession>, requestUrl: string): LookupCtx {
  return {
    companyId: session.user.companyId,
    userId: session.user.id,
    userName: session.user.name ?? null,
    session,
    requestUrl,
  };
}

const getQuery = z.object({
  q: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  context: z.string().max(2000).optional(),
});

export async function GET(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const { noun } = await params;
  const entry = LOOKUP_NOUNS.get(noun);
  if (!entry) return errorResponse("Nothing to look up by that name", 404);
  // The door: any one of the noun's read rights.
  if (!entry.read.some(([resource, action]) => canRetailSessionDo(session, resource, action))) {
    const [resource, action] = entry.read[0]!;
    return requireRetailPermission(session, resource, action) as NextResponse;
  }

  const parsed = getQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.issues);

  let context: Record<string, unknown> = {};
  if (parsed.data.context) {
    try {
      const value: unknown = JSON.parse(parsed.data.context);
      if (value && typeof value === "object" && !Array.isArray(value)) context = value as Record<string, unknown>;
    } catch {
      return errorResponse("The context is not JSON", 400);
    }
  }

  try {
    const answer = await searchLookup(lookupCtx(session, requestAddress(request)), noun, { ...parsed.data, context });
    return answer.status === 200 ? successResponse(answer.body) : errorResponse(answer.body.error, answer.status);
  } catch (error) {
    console.error(`[API] GET /api/v2/retail/lookup/${noun} error:`, error);
    return errorResponse("The options would not load");
  }
}

const postBody = z.object({
  fields: z.record(z.string(), z.string().max(500)),
  context: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const { noun } = await params;
  const entry = LOOKUP_NOUNS.get(noun);
  if (!entry?.create || !entry.add) return errorResponse("Nothing to add by that name", 404);
  // The door: the noun's create right, the same one its full sheet needs.
  const gate = requireRetailPermission(session, entry.create[0], entry.create[1]);
  if (gate) return gate;

  let fields: Record<string, string>;
  let context: Record<string, unknown> = {};
  try {
    const parsedBody = postBody.parse(await request.json());
    fields = parsedBody.fields;
    context = parsedBody.context ?? {};
  } catch (error) {
    return errorResponse("Validation failed", 400, error instanceof z.ZodError ? error.issues : undefined);
  }

  try {
    const answer = await addLookupOption(lookupCtx(session, requestAddress(request)), noun, fields, context);
    if (answer.status === 201) return successResponse(answer.body, 201);
    if (answer.status === 400) return fieldErrorResponse(answer.body.error, answer.body.fieldErrors);
    return errorResponse(answer.body.error, answer.status);
  } catch (error) {
    console.error(`[API] POST /api/v2/retail/lookup/${noun} error:`, error);
    return errorResponse(`The ${noun} was not added`);
  }
}
