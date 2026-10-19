import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { guardBooks } from "@/lib/books/core";
import { InvoiceChangeRefused, OWNER_ONLY } from "@/lib/books/owner";
import { REASON_MAX } from "@/lib/books/reversal";
import { creditInvoice, voidInvoice } from "@/lib/books/reverse-invoice";

const reverseSchema = z.discriminatedUnion("how", [
  z.object({ how: z.literal("void"), reason: z.string().max(REASON_MAX) }),
  z.object({
    how: z.literal("credit"),
    reason: z.string().max(REASON_MAX),
    lines: z.array(z.object({ lineId: z.string().min(1), quantity: z.number().min(0) })).max(500).optional(),
    amount: z.number().positive().optional(),
  }),
]);

/**
 * Reverses an issued or paid invoice (`lib/books/reverse-invoice.ts`), the workspace's owner only, with a reason:
 * `void` the whole of it, or `credit` part of it with a credit note for chosen `lines` or an `amount`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { actor, refused } = await guardBooks(session, "void", { kind: "invoice" });
    if (refused) return errorResponse(OWNER_ONLY, 403);
    const body = reverseSchema.parse(await request.json().catch(() => null));
    const id = (await params).id;
    if (body.how === "void") {
      const done = await voidInvoice(actor, id, { reason: body.reason });
      return successResponse({ how: "void" as const, ...done });
    }
    const choice = body.amount !== undefined ? { amount: body.amount } : { lines: body.lines ?? [] };
    const done = await creditInvoice(actor, id, { reason: body.reason, choice });
    return successResponse({ how: "credit" as const, ...done });
  } catch (error) {
    if (error instanceof InvoiceChangeRefused) return errorResponse(error.message, error.status);
    if (error instanceof z.ZodError) return errorResponse("Say how to reverse it (void or credit) and why", 400, error.issues);
    console.error("[API] POST /api/books/invoices/[id]/reverse error:", error);
    return errorResponse("Could not reverse the invoice");
  }
}
