import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { BankError, uploadStatement } from "@/lib/books/bank";
import { readStatement } from "@/lib/books/statement";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  accountId: z.string().uuid(),
  /** The statement's CSV, as the bank exported it. */
  csv: z.string().min(1).max(2_000_000),
});

/** Upload a statement: its lines join the account's open reconciliation, without repeats. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return errorResponse("Choose an account and a statement file", 400);
    const read = readStatement(body.data.csv);
    if (!read.ok) return errorResponse(read.error, 400);
    const result = await uploadStatement(prisma, {
      companyId: session.user.companyId,
      userId: session.user.id,
      accountId: body.data.accountId,
      rows: read.rows,
    });
    return successResponse({ ...result, skipped: read.skipped }, 201);
  } catch (error) {
    if (error instanceof BankError) return errorResponse(error.message, error.status);
    console.error("[API] POST /api/books/bank/statements error:", error);
    return errorResponse("The statement was not added");
  }
}
