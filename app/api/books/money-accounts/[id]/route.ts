import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { guardBooks } from "@/lib/books/core";
import { MoneyAccountRefused, saveMoneyAccount } from "@/lib/books/core/money-accounts";
import { moneyAccountSchema } from "@/lib/books/money-accounts-schema";

/** Change a money account's details, make it the default, or stop using it. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "bank.entry");
    if (refused) return refused;
    const { id } = await params;
    return successResponse(await saveMoneyAccount(actor, id, moneyAccountSchema.omit({ openingBalance: true }).parse(await request.json())));
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Give it a name, a kind and a currency", 400, error.issues);
    if (error instanceof MoneyAccountRefused) return errorResponse(error.message, error.status);
    console.error("[API] PATCH /api/books/money-accounts/[id] error:", error);
    return errorResponse("The account was not saved");
  }
}
