import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { approveCounts, countIdsInput } from "@/lib/retail/stock/count-review";

import { requireRetailSession } from "../../../_helpers";
import { countActor } from "../respond";

/**
 * Counts › tick rows › "Approve the differences" (ask `approvecounts`):
 * `retail.counts:approve`, at most 100. → `{ approved, waiting, skipped,
 * failed }` by count number: waiting are over the owner's limit (the owner is
 * asked), skipped were not waiting for approval, failed broke on the way and
 * are left as they were while the others stand.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.counts", "approve");
  if (gate) return gate;

  const parsed = countIdsInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Tick a count first.", 400);

  try {
    return successResponse(await approveCounts(countActor(session), parsed.data.ids, request.url));
  } catch (error) {
    console.error("[API] POST /api/v2/retail/stock/counts/approve error:", error);
    return errorResponse("Those counts were not approved. Try again.");
  }
}
