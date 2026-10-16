import { NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-utils";
import { askVane, AskRefused } from "@/lib/explore/ask";
import { exploreGate } from "@/lib/explore/gate";
import { countRows, exploreReaderReady, exploreScope } from "@/lib/explore/reader";
import { prisma } from "@/lib/prisma";
import { readableSources, toSource } from "@/lib/reports/custom/sources";
import { sourceTable, type SqlTable } from "@/lib/reports/sql/schema";
import { VaneWriteRefused } from "@/lib/vane/write";

const bodySchema = z.object({
  question: z.string().trim().min(3, "Ask a question in a few words").max(500),
  mode: z.enum(["new", "change"]).default("new"),
  sql: z.string().max(20_000).optional(),
  /** Which tables the question on screen reads: the real ones, or the report sources (a question saved over them). */
  engine: z.enum(["tables", "sources"]).optional(),
});

/** The most tables Vane is told about: the workspace's busiest, so the prompt stays a prompt. */
const MOST_TABLES = 80;

/** Ask in plain words: Vane drafts the question's SQL over this person's own tables. Nothing runs or saves here. */
export async function POST(request: NextRequest) {
  try {
    const gate = await exploreGate(request);
    if ("response" in gate) return gate.response;
    const { session } = gate;
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return errorResponse(body.error.issues[0]?.message ?? "Ask a question", 400);

    let tables: SqlTable[];
    if (exploreReaderReady() && body.data.engine !== "sources") {
      const scope = await exploreScope({ role: session.user.role, enabledFeatures: session.user.enabledFeatures, workspaceProfile: session.user.workspaceProfile });
      const counts = await countRows({ companyId: session.user.companyId, userId: session.user.id }, scope.tables);
      // Tables with rows in them, the busiest first: an empty table answers nothing.
      tables = scope.tables
        .filter((table) => (counts.get(table.name) ?? 0) > 0)
        .sort((a, b) => (counts.get(b.name) ?? 0) - (counts.get(a.name) ?? 0))
        .slice(0, MOST_TABLES);
    } else {
      tables = (await readableSources(session)).map((definition) => sourceTable(toSource(definition)));
    }
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
