import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { runRetailPosting } from "@/lib/retail/posting-settings";
import { lastPostedWords, postedToast } from "@/lib/retail/posting-words";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/**
 * "Post now" on Posting to the books (W-65, C-14: a real action keeps its own
 * endpoint): every retail event still waiting goes to the books now. Owners
 * and the bookkeeper. Answers the run as "Last posted" and the toast read it.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.posting", "update");
  if (gate) return gate;

  try {
    const run = await runRetailPosting(session.user.companyId, "BY_HAND", {
      companyId: session.user.companyId,
      userId: session.user.id,
      userName: session.user.name ?? null,
      userRole: session.user.role ?? null,
    });
    return successResponse({
      run: { at: run.at.toISOString(), text: lastPostedWords(run, new Date()), toast: postedToast(run) },
    });
  } catch (error) {
    console.error("[API] POST /api/v2/retail/posting/run error:", error);
    return errorResponse("Nothing was posted. Try again.");
  }
}
