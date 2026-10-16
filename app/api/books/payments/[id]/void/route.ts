import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { InvoiceChangeRefused, isWorkspaceOwner, RECEIPT_OWNER_ONLY } from "@/lib/books/owner";
import { REASON_MAX } from "@/lib/books/reversal";
import { readReceiptVoid, voidReceipt } from "@/lib/books/void-receipt";
import { prisma } from "@/lib/prisma";

const voidSchema = z.object({ reason: z.string().max(REASON_MAX) });

/** What Void does to this payment, for its drawer: the workspace's owner only. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!isWorkspaceOwner(session.user.role)) return errorResponse(RECEIPT_OWNER_ONLY, 403);
    const facts = await readReceiptVoid(session.user.companyId, (await params).id, prisma);
    if (!facts) return errorResponse("That payment is not here any more.", 404);
    return successResponse(facts);
  } catch (error) {
    console.error("[API] GET /api/books/payments/[id]/void error:", error);
    return errorResponse("Could not read the payment");
  }
}

/** Voids a payment (`lib/books/void-receipt.ts`), the workspace's owner only, with a reason. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!isWorkspaceOwner(session.user.role)) return errorResponse(RECEIPT_OWNER_ONLY, 403);
    const body = voidSchema.parse(await request.json().catch(() => null));
    const actor = { companyId: session.user.companyId, userId: session.user.id, role: session.user.role };
    return successResponse(await voidReceipt(actor, (await params).id, { reason: body.reason }));
  } catch (error) {
    if (error instanceof InvoiceChangeRefused) return errorResponse(error.message, error.status);
    if (error instanceof z.ZodError) return errorResponse("Say why it is void", 400, error.issues);
    console.error("[API] POST /api/books/payments/[id]/void error:", error);
    return errorResponse("Could not void the payment");
  }
}
