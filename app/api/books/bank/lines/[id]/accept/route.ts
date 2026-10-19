import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { acceptMatch, BankError, proposalFor } from "@/lib/books/bank";
import { prisma } from "@/lib/prisma";

const matchSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("invoice"), invoiceId: z.string().uuid(), amount: z.number() }),
  z.object({ kind: z.literal("bill"), billId: z.string().uuid(), amount: z.number() }),
  z.object({ kind: z.literal("ecocash"), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), amount: z.number() }),
  z.object({ kind: z.literal("transaction"), transactionId: z.string().uuid() }),
  z.object({ kind: z.literal("bank-charges"), amount: z.number(), imtt: z.boolean().optional() }),
]);

/** Without a body, Vane's match is accepted (Accept); with one, what the person chose (Choose). */
const bodySchema = z.object({ match: matchSchema.optional() });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;
    const body = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return errorResponse("That is not something a bank line can be", 400);
    const match = body.data.match ?? (await proposalFor(prisma, session.user.companyId, id))?.match;
    if (!match) return errorResponse("Vane has no match for that line now. Choose what it was.", 409);
    return successResponse(
      await acceptMatch(prisma, { companyId: session.user.companyId, userId: session.user.id, role: session.user.role, lineId: id, match }),
    );
  } catch (error) {
    if (error instanceof BankError) return errorResponse(error.message, error.status);
    console.error("[API] POST /api/books/bank/lines/[id]/accept error:", error);
    return errorResponse("The match was not recorded");
  }
}
