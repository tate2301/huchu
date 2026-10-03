import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { listBin, restoreFromBin, restoreInput } from "@/lib/retail/bin";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../_helpers";

/**
 * The bin. Removing a product, promotion or category is `delete` on the
 * catalogue, so seeing and emptying the bin is the same right.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.catalog", "delete");
  if (gate) return gate;
  return successResponse({ data: await listBin(session.user.companyId) });
}

/** Restore one thing. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.catalog", "delete");
  if (gate) return gate;
  try {
    const input = restoreInput.parse(await request.json());
    const restored = await restoreFromBin(session.user.companyId, input);
    if (!restored) return errorResponse("That is not in the bin", 404);
    return successResponse({ restored: true });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    throw error;
  }
}
