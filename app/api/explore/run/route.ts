import { NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-utils";
import { exploreGate } from "@/lib/explore/gate";
import { exploreReaderReady, exploreScope, READER_WAITING, runAsExploreReader } from "@/lib/explore/reader";

const bodySchema = z.object({
  sql: z.string().trim().min(1, "Write a question").max(20_000),
  title: z.string().trim().max(200).nullish(),
});

/**
 * Runs one question as `explore_reader` over the tables the person's role
 * reads, in this workspace only, and logs it. Read only: the guard refuses
 * anything but one SELECT before it reaches the database, and the login can
 * change nothing anyway. A refusal answers 422 with the guard's words.
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await exploreGate(request);
    if ("response" in gate) return gate.response;
    const { session } = gate;
    if (!exploreReaderReady()) return errorResponse(READER_WAITING, 503);
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return errorResponse(body.error.issues[0]?.message ?? "Write a question", 400);

    const scope = await exploreScope({ role: session.user.role, enabledFeatures: session.user.enabledFeatures, workspaceProfile: session.user.workspaceProfile });
    const run = await runAsExploreReader(
      { companyId: session.user.companyId, userId: session.user.id, title: body.data.title ?? null },
      body.data.sql,
      scope,
    );
    if (!run.ok) return errorResponse(run.refusal.message, run.refusal.kind === "timeout" ? 504 : 422);
    return successResponse(run.answer);
  } catch (error) {
    console.error("[API] POST /api/explore/run error:", error);
    return errorResponse("The question did not run");
  }
}
