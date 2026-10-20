import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canDo, guardBooks } from "@/lib/books/core";
import { OpeningRefused, postOpeningBalances } from "@/lib/books/core/opening-balances";
import { readOpeningBalances } from "@/lib/books/settings-pages";
import { prisma } from "@/lib/prisma";

/** Books → Settings → Opening balances: what the books started with, and the accounts to choose from. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "view", { area: "ledger" });
    if (refused) return refused;
    const companyId = sessionResult.session.user.companyId;
    const [opening, accounts] = await Promise.all([
      readOpeningBalances(prisma, companyId),
      prisma.chartOfAccount.findMany({ where: { companyId, isActive: true, nodeType: "LEDGER" }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    ]);
    return successResponse({ ...opening, accounts: accounts.map((account) => ({ id: account.id, code: account.code, label: `${account.code} ${account.name}` })), can: { change: canDo(actor, "setup").allowed } });
  } catch (error) {
    console.error("[API] GET /api/books/settings/opening-balances error:", error);
    return errorResponse("Could not read the opening balances");
  }
}

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().max(500).nullish(),
  lines: z.array(z.object({ accountId: z.string().uuid(), debit: z.number().min(0), credit: z.number().min(0) })).min(2).max(500),
});

/** Post the opening balances, or revise them: the old journal's mirror, then the new one (owner or accountant). */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "setup");
    if (refused) return refused;
    const body = schema.parse(await request.json());
    const result = await postOpeningBalances(actor, body);
    return successResponse({ id: result.openingImport.id }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Choose the day and two accounts or more", 400, error.issues);
    if (error instanceof OpeningRefused) return errorResponse(error.message, error.status);
    if (error instanceof Error) return errorResponse(error.message, 400);
    return errorResponse("The opening balances were not posted");
  }
}
