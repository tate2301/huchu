import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canUseExplore } from "@/lib/explore/access";
import { askVane, AskRefused } from "@/lib/explore/ask";
import { prisma } from "@/lib/prisma";
import { readableSources, toSource } from "@/lib/reports/custom/sources";
import { sourceTable } from "@/lib/reports/sql/schema";
import { VaneWriteRefused } from "@/lib/vane/write";

const bodySchema = z.object({
  question: z.string().trim().min(3, "Ask a question in a few words").max(500),
  mode: z.enum(["new", "change"]).default("new"),
  sql: z.string().max(20_000).optional(),
});

/** Ask in plain words: Vane drafts the question's SQL over this person's own tables. Nothing runs or saves here. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!canUseExplore(session.user.role)) return errorResponse("Only owners and managers use Explore", 403);
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return errorResponse(body.error.issues[0]?.message ?? "Ask a question", 400);

    const tables = (await readableSources(session)).map((definition) => sourceTable(toSource(definition)));
    const answer = await askVane(
      prisma,
      { companyId: session.user.companyId, userId: session.user.id, name: session.user.name ?? null },
      body.data,
      tables,
    );
    return successResponse(answer);
  } catch (error) {
    if (error instanceof VaneWriteRefused) return errorResponse(error.message, error.status);
    if (error instanceof AskRefused) return errorResponse(error.message, 422);
    console.error("[API] POST /api/explore/ask error:", error);
    return errorResponse("Vane could not write that question");
  }
}
