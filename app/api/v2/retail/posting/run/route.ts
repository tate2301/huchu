import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { continueRetailPosting, startRetailPosting } from "@/lib/retail/posting-settings";
import { lastPostedWords, postedToast } from "@/lib/retail/posting-words";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/** How long one request posts for before it answers with how far it got. */
const SLICE_MS = 6_000;

const body = z.object({ runId: z.string().uuid().optional() });

/**
 * "Post now" on Posting to the books (W-65, C-14: a real action keeps its own
 * endpoint): every retail event still waiting goes to the books now. Owners
 * and the bookkeeper.
 *
 * A run posts in slices of a few seconds, so a night's sales never outlast
 * the request: the first call starts the run — or joins the one already
 * going, as a company has one run at a time — and the page calls again with
 * its `runId` while `done` is false. `busy` says another slice of the run was
 * posting, so this call posted nothing: ask again in a moment. A run whose
 * calls stop is closed where it stopped by the next one started.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.posting", "update");
  if (gate) return gate;

  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return errorResponse("Nothing was posted. Try again.", 400);

  try {
    const companyId = session.user.companyId;
    const actor = {
      companyId,
      userId: session.user.id,
      userName: session.user.name ?? null,
      userRole: session.user.role ?? null,
    };
    const runId = parsed.data.runId ?? (await startRetailPosting(companyId, "BY_HAND", actor));
    const progress = await continueRetailPosting(companyId, runId, actor, SLICE_MS);
    if (!progress) return errorResponse("That posting run is not this shop's.", 404);
    const { run, done, waiting, busy } = progress;
    const posted = run.sales + run.refunds + run.deliveries + run.counts + run.other;
    return successResponse({
      runId,
      done,
      busy,
      posted,
      failed: run.failed,
      waiting,
      run: { at: run.at.toISOString(), text: lastPostedWords(run, new Date()), toast: postedToast(run) },
    });
  } catch (error) {
    console.error("[API] POST /api/v2/retail/posting/run error:", error);
    return errorResponse("Nothing was posted. Try again.");
  }
}
