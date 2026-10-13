import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { journalQuerySchema, journalsCsv, readJournals } from "@/lib/books/journals";
import { prisma } from "@/lib/prisma";

/** Books → Journals: the list by state, with the drafts that hold a month open. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const params = new URL(request.url).searchParams;
    const query = journalQuerySchema.parse({ tab: params.get("tab") ?? undefined, q: params.get("q") ?? undefined, page: params.get("page") ?? undefined });
    const companyId = sessionResult.session.user.companyId;
    if (params.get("format") === "csv") {
      return new NextResponse(await journalsCsv(prisma, companyId, query), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="journals.csv"' },
      });
    }
    return successResponse(await readJournals(prisma, companyId, query));
  } catch (error) {
    console.error("[API] GET /api/books/journals error:", error);
    return errorResponse("Could not read the journals");
  }
}
