import { NextRequest, NextResponse } from "next/server";

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";

import { readState } from "../codec";
import { registerContext } from "./context";
import type { RegisterServer } from "./types";

/**
 * A list endpoint: the same query string as the page it feeds.
 *
 * `?q=moyo&owner=me&sort=-updated&page=2&limit=50&tz=Africa/Harare` — the
 * list's own state as the codec writes it, plus the page and the reader's
 * zone. What the screen asks for is exactly what an export of it asks for.
 */
export async function registerGet(request: NextRequest, server: RegisterServer<{ id: string }>) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);
    const ctx = await registerContext(session.user, searchParams.get("tz"));
    const { state } = readState(server.def, searchParams);
    const { rows, total } = await server.page(ctx, state, { skip, take: limit });

    return successResponse(paginationResponse(rows, total, page, limit));
  } catch (error) {
    console.error(`[API] GET ${server.def.endpoint} error:`, error);
    return errorResponse(`Failed to fetch ${server.def.noun.many}`);
  }
}
