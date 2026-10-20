import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canDo, guardBooks } from "@/lib/books/core";
import { setSeriesPrefix } from "@/lib/books/core/numbering";
import { readNumbering } from "@/lib/books/settings-pages";
import { prisma } from "@/lib/prisma";

/** Books → Settings → Numbering: every series, its next number and last issued. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "view", { area: "ledger" });
    if (refused) return refused;
    return successResponse(await readNumbering(prisma, sessionResult.session.user.companyId, { change: canDo(actor, "setup").allowed }));
  } catch (error) {
    console.error("[API] GET /api/books/settings/numbering error:", error);
    return errorResponse("Could not read the numbering");
  }
}

const schema = z.object({ entity: z.string().min(1).max(60), prefix: z.string().max(12) });

/** A series' prefix for the next year (owner or accountant). Numbers already issued never change. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { refused } = await guardBooks(sessionResult.session, "setup");
    if (refused) return refused;
    const body = schema.parse(await request.json());
    const companyId = sessionResult.session.user.companyId;
    const page = await readNumbering(prisma, companyId, { change: true });
    const row = page.rows.find((one) => one.entity === body.entity);
    if (!row || row.fixedPrefix) return errorResponse("That series keeps its prefix", 400);
    await setSeriesPrefix(prisma, companyId, body.entity as never, body.prefix, page.nextYearFrom);
    return successResponse({ entity: body.entity, prefix: body.prefix.trim().toUpperCase(), from: page.nextYearFrom });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Write a prefix of 12 characters at most", 400, error.issues);
    if (error instanceof Error && /prefix is/.test(error.message)) return errorResponse(error.message, 400);
    console.error("[API] POST /api/books/settings/numbering error:", error);
    return errorResponse("The prefix was not saved");
  }
}
