import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, startReconciliation } from "@/lib/books/core";
import { refusedResponse } from "@/lib/books/core/refused";
import { readReconciliations } from "@/lib/books/reconciliations";
import { prisma } from "@/lib/prisma";

const start = z.object({
  bankAccountId: z.string().uuid(),
  statementEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  statementBalance: z.number(),
});

/** Books → Bank & cash → Reconciliations: the open and the closed, and the one selected. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const params = new URL(request.url).searchParams;
    return successResponse(
      await readReconciliations(prisma, sessionResult.session.user.companyId, {
        tab: params.get("tab") === "closed" ? "closed" : "open",
        q: params.get("q") ?? "",
        account: params.get("account"),
        selected: params.get("selected"),
        actor: await booksActor(sessionResult.session),
      }),
    );
  } catch (error) {
    console.error("[API] GET /api/books/reconciliations error:", error);
    return errorResponse("Could not read the reconciliations");
  }
}

/** Start a reconciliation against a statement's closing date and balance (§5.8.4). */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const body = start.parse(await request.json());
    const rec = await startReconciliation(await booksActor(sessionResult.session), {
      bankAccountId: body.bankAccountId,
      statementEndDate: new Date(`${body.statementEndDate}T00:00:00.000Z`),
      statementBalance: body.statementBalance,
    });
    return successResponse({ id: rec.id }, 201);
  } catch (error) {
    const refusal = refusedResponse(error, "Enter the statement's closing date and balance");
    if (refusal) return refusal;
    console.error("[API] POST /api/books/reconciliations error:", error);
    return errorResponse("The reconciliation was not started");
  }
}
