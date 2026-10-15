import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { readWorkspace, ReaderError } from "@/lib/vane/reader";
import { VANE_SETTINGS_ROLES } from "@/lib/vane/roles";

/** As many rows as the state's table shows. */
const SHOWN = 50;

/**
 * "Show the rows": the rows behind something Vane could not work out, read
 * again now through Vane's own reader, as Vane read them. For the people who
 * run Vane (Management → Vane): the rows are what Vane may read, which can be
 * more than a person's role shows them elsewhere.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!VANE_SETTINGS_ROLES.includes(session.user.role)) return errorResponse("Only the people who run Vane can see these rows", 403);
    const job = await prisma.vaneJob.findFirst({
      where: { id: (await params).id, companyId: session.user.companyId },
      select: { problemSql: true },
    });
    if (!job?.problemSql) return errorResponse("Vane left no rows for this", 404);
    const answer = await readWorkspace(session.user.companyId, job.problemSql);
    return successResponse({
      columns: answer.rows[0] ? Object.keys(answer.rows[0]) : [],
      rows: answer.rows.slice(0, SHOWN),
      more: answer.moreThanLimit || answer.rows.length > SHOWN,
      sql: answer.sql,
    });
  } catch (error) {
    if (error instanceof ReaderError && error.code !== "misconfigured") return errorResponse(error.message, 422);
    console.error("[API] GET /api/vane/jobs/[id]/rows error:", error);
    return errorResponse("Could not read the rows");
  }
}
