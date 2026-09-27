import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { readState } from "@/lib/crm/registers/codec";
import { isEngineRegisterKey } from "@/lib/crm/registers/registry";
import { REGISTER_SERVERS } from "@/lib/crm/registers/server";
import { registerContext } from "@/lib/crm/registers/server/context";

/**
 * The answers a list's filter can offer, read from its records: every city
 * the sites are in, every tag anybody has used. Narrowed by the rest of the
 * list's state and not by this filter itself — the query string is the list's
 * own, as the page writes it.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ key: string; filter: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { key: rawKey, filter } = await context.params;

    const key = rawKey.toUpperCase();
    if (!isEngineRegisterKey(key)) return errorResponse("There is no such list", 404);
    const server = REGISTER_SERVERS[key];
    const def = server.def.filters.find((candidate) => candidate.key === filter);
    if (!def?.facet) return errorResponse("That filter's answers are not read from the records", 404);

    const { searchParams } = new URL(request.url);
    const ctx = await registerContext(session.user, searchParams.get("tz"));
    const { state } = readState(server.def, searchParams);
    const options = (await server.facet?.(ctx, state, filter)) ?? [];

    return successResponse({ data: options });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/registers/[key]/facets/[filter] error:", error);
    return errorResponse("Failed to read the filter's answers");
  }
}
