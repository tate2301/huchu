import { NextRequest } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-utils";
import { exploreGate } from "@/lib/explore/gate";
import { exploreReaderReady } from "@/lib/explore/reader";
import { readHistory } from "@/lib/explore/runs";
import { prisma } from "@/lib/prisma";

/** Explore's History: the questions this person ran in this workspace, newest first, each once. Nobody else's. */
export async function GET(request: NextRequest) {
  try {
    const gate = await exploreGate(request);
    if ("response" in gate) return gate.response;
    const { session } = gate;
    return successResponse({ ready: exploreReaderReady(), runs: await readHistory(prisma, session.user.companyId, session.user.id) });
  } catch (error) {
    console.error("[API] GET /api/explore/history error:", error);
    return errorResponse("Could not read the questions you ran");
  }
}
