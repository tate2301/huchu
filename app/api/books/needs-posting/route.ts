import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, canDo } from "@/lib/books/core";
import { needsPostingCsv, needsPostingQuerySchema, readNeedsPosting } from "@/lib/books/needs-posting";
import { retryNeedsPosting } from "@/lib/books/needs-posting-actions";
import { prisma } from "@/lib/prisma";

/**
 * Close the month → Needs posting: every money event that has not reached the
 * ledger, why, and what fixes it; with the accounts a missing one can be
 * mapped to, for those who may map one.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const actor = await booksActor(sessionResult.session);
    const seeing = canDo(actor, "view", { area: "close" });
    if (!seeing.allowed) return errorResponse(seeing.reason, 403);
    const params = new URL(request.url).searchParams;
    const query = needsPostingQuerySchema.parse({ tab: params.get("tab") ?? undefined, q: params.get("q") ?? undefined, source: params.get("source") ?? undefined });
    const view = await readNeedsPosting(prisma, actor.companyId, query);
    if (params.get("format") === "csv") {
      return new NextResponse(needsPostingCsv(view), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="needs-posting.csv"' },
      });
    }
    const can = {
      retry: canDo(actor, "posting.retry").allowed,
      map: canDo(actor, "posting.map").allowed,
      redate: canDo(actor, "posting.redate").allowed,
    };
    const accounts =
      can.map && view.rows.some((row) => row.fix?.kind === "map")
        ? await prisma.chartOfAccount.findMany({
            where: { companyId: actor.companyId, isActive: true, nodeType: "LEDGER" },
            select: { id: true, code: true, name: true },
            orderBy: { code: "asc" },
          })
        : [];
    return successResponse({ ...view, can, accounts });
  } catch (error) {
    console.error("[API] GET /api/books/needs-posting error:", error);
    return errorResponse("Could not read what needs posting");
  }
}

const retrySchema = z.object({ ids: z.array(z.string().uuid()).max(500).optional() });

/** Retry: the ones named, or every failed and waiting one not held for a closed month. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const actor = await booksActor(sessionResult.session);
    const may = canDo(actor, "posting.retry");
    if (!may.allowed) return errorResponse(may.reason, 403);
    const body = retrySchema.parse(await request.json().catch(() => ({})));
    return successResponse(await retryNeedsPosting(actor, body.ids ?? null));
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/books/needs-posting error:", error);
    return errorResponse("Could not retry the postings");
  }
}
