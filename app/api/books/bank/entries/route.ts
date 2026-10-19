import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { guardBooks, recordBankEntry } from "@/lib/books/core";
import { refusedResponse } from "@/lib/books/core/refused";
import { moneyAccountOptions } from "@/lib/books/bank-accounts";
import { prisma } from "@/lib/prisma";

/** The ledger accounts a tax payment goes to: VAT, withholding, income tax, PAYE, NSSA, ZIMDEF. */
const TAX_CODES = ["2200", "2180", "2185", "2280", "2110", "2120", "2140"];

const schema = z.object({
  kind: z.enum(["CHARGE", "IMTT", "INTEREST", "TRANSFER", "TAX", "OTHER"]),
  bankAccountId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  description: z.string().max(200).nullish(),
  reference: z.string().max(80).nullish(),
  accountId: z.string().uuid().nullish(),
  toBankAccountId: z.string().uuid().nullish(),
  statementLineId: z.string().uuid().nullish(),
});

/** What a bank entry is made from: the money accounts, and the tax accounts a tax payment clears. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const companyId = sessionResult.session.user.companyId;
    const [accounts, tax] = await Promise.all([
      moneyAccountOptions(prisma, companyId),
      prisma.chartOfAccount.findMany({ where: { companyId, code: { in: TAX_CODES }, nodeType: "LEDGER", isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
    ]);
    return successResponse({ accounts, taxAccounts: tax });
  } catch (error) {
    console.error("[API] GET /api/books/bank/entries error:", error);
    return errorResponse("Could not read the accounts");
  }
}

/** A bank entry (books-final §4.13): a charge, IMTT, interest, a transfer or a tax payment, posted through the core. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "bank.entry");
    if (refused) return refused;
    const body = schema.parse(await request.json());
    const result = await recordBankEntry(actor, { ...body, date: new Date(`${body.date}T00:00:00.000Z`) });
    if (result.error) return errorResponse(`It was recorded but did not post: ${result.error}. It waits in Needs posting.`, 409);
    return successResponse(result, 201);
  } catch (error) {
    const refusal = refusedResponse(error, "Check the entry");
    if (refusal) return refusal;
    console.error("[API] POST /api/books/bank/entries error:", error);
    return errorResponse("The entry was not recorded");
  }
}
