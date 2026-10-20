import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canDo, guardBooks } from "@/lib/books/core";
import { MoneyAccountRefused, moneyAccounts, saveMoneyAccount } from "@/lib/books/core/money-accounts";
import { moneyAccountSchema } from "@/lib/books/money-accounts-schema";
import { prisma } from "@/lib/prisma";

/** Management › Money accounts: every bank, mobile money and cash account and float, and its balance in the ledger. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "view", { area: "bank" });
    if (refused) return refused;
    const companyId = sessionResult.session.user.companyId;
    const [rows, ledgers, people, settings] = await Promise.all([
      moneyAccounts(companyId),
      prisma.chartOfAccount.findMany({ where: { companyId, type: "ASSET", nodeType: "LEDGER", isActive: true }, select: { id: true, code: true, name: true }, orderBy: { code: "asc" } }),
      prisma.user.findMany({ where: { companyId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.accountingSettings.findUnique({ where: { companyId }, select: { baseCurrency: true } }),
    ]);
    return successResponse({ rows, ledgers: ledgers.map((row) => ({ id: row.id, label: `${row.code} ${row.name}` })), people, baseCurrency: settings?.baseCurrency ?? "USD", can: { change: canDo(actor, "bank.entry").allowed } });
  } catch (error) {
    console.error("[API] GET /api/books/money-accounts error:", error);
    return errorResponse("Could not read the money accounts");
  }
}

/** Add a money account: the owner, a manager or the accountant. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "bank.entry");
    if (refused) return refused;
    return successResponse(await saveMoneyAccount(actor, null, moneyAccountSchema.parse(await request.json())), 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Give it a name, a kind and a currency", 400, error.issues);
    if (error instanceof MoneyAccountRefused) return errorResponse(error.message, error.status);
    console.error("[API] POST /api/books/money-accounts error:", error);
    return errorResponse("The account was not added");
  }
}
