import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canDo, guardBooks } from "@/lib/books/core";
import { BusinessRefused, businessSettings, saveBusinessSettings } from "@/lib/books/core/business-settings";
import { prisma } from "@/lib/prisma";

/** Management › Money and tax: the business's tax details, base currency, rate source and year end. Core, free. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "view", { area: "ledger" });
    if (refused) return refused;
    const companyId = sessionResult.session.user.companyId;
    const [settings, equity, posted, currencies] = await Promise.all([
      businessSettings(companyId),
      prisma.chartOfAccount.findMany({ where: { companyId, type: "EQUITY", nodeType: "LEDGER", isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
      prisma.journalEntry.count({ where: { companyId } }),
      prisma.currencyRate.findMany({ where: { companyId }, distinct: ["quoteCurrency"], select: { quoteCurrency: true } }),
    ]);
    return successResponse({
      settings,
      equity: equity.map((account) => ({ id: account.id, label: `${account.code} ${account.name}` })),
      baseLocked: posted > 0 ? `The books already hold ${posted} entries in ${settings.baseCurrency}, so it stays.` : null,
      currencies: [...new Set([settings.baseCurrency, "USD", "ZWG", ...currencies.map((row) => row.quoteCurrency)])],
      can: { change: canDo(actor, "setup").allowed },
    });
  } catch (error) {
    console.error("[API] GET /api/books/money-and-tax error:", error);
    return errorResponse("Could not read money and tax");
  }
}

const schema = z.object({
  legalName: z.string().max(200).optional(),
  tradingName: z.string().max(200).optional(),
  vatNumber: z.string().max(20).optional(),
  taxNumber: z.string().max(20).optional(),
  address: z.string().max(500).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().max(200).optional(),
  vatCategory: z.enum(["A", "B", "C", "D"]).optional(),
  vatPeriodMonths: z.number().int().min(1).max(12).optional(),
  vatWithholdingAgent: z.boolean().optional(),
  baseCurrency: z.string().length(3).optional(),
  rateSource: z.enum(["RBZ", "MANUAL"]).optional(),
  yearEndMonth: z.number().int().min(1).max(12).optional(),
  retainedEarningsAccountId: z.string().uuid().nullable().optional(),
});

/** Save what changed: the owner or the accountant. */
export async function PATCH(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "setup");
    if (refused) return refused;
    return successResponse(await saveBusinessSettings(actor, schema.parse(await request.json())));
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Check the fields marked", 400, error.issues);
    if (error instanceof BusinessRefused) return errorResponse(error.message, error.status, error.field ? { field: error.field } : undefined);
    console.error("[API] PATCH /api/books/money-and-tax error:", error);
    return errorResponse("Not saved");
  }
}
