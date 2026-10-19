import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, canDo } from "@/lib/books/core";
import { claimSchema, createClaim, submitClaim } from "@/lib/books/core/claims";
import { claimsCsv, readClaimQuery, readClaims } from "@/lib/books/claims-list";
import { resolveBaseCurrency } from "@/lib/money";
import { refusedResponse } from "@/lib/books/core/refused";
import { prisma } from "@/lib/prisma";

/**
 * Claims & petty cash (BkClaims, D13): everyone's claims for those who keep
 * the books, one's own for everyone else; the floats and their vouchers. And
 * a new claim, as a draft or sent at once (`send`).
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const actor = await booksActor(sessionResult.session);
    const everyone = canDo(actor, "approve", { kind: "claim" }).allowed;
    const params = new URL(request.url).searchParams;
    const query = { ...readClaimQuery(params), ...(params.get("format") === "csv" ? { page: 1 } : {}) };
    const base = (await resolveBaseCurrency(actor.companyId)).toUpperCase();
    const [view, accounts] = await Promise.all([
      readClaims(prisma, actor.companyId, query, { everyone, userId: actor.userId }, base),
      prisma.bankAccount.findMany({ where: { companyId: actor.companyId, isActive: true }, orderBy: [{ kind: "asc" }, { name: "asc" }], select: { id: true, name: true, currency: true, isFloat: true } }),
    ]);
    if (params.get("format") === "csv") {
      return new NextResponse(claimsCsv(view), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${query.view}.csv"` } });
    }
    return successResponse({
      ...view,
      can: { approve: everyone, pay: canDo(actor, "pay", { kind: "claim" }).allowed, topUp: canDo(actor, "pay", { kind: "voucher" }).allowed },
      me: actor.userId,
      accounts,
    });
  } catch (error) {
    console.error("[API] GET /api/books/claims error:", error);
    return errorResponse("Could not load the claims");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const body = (await request.json()) as Record<string, unknown>;
    const input = claimSchema.parse(body);
    const actor = await booksActor(sessionResult.session);
    const claim = await createClaim(actor, input);
    // Snap a slip (BkClaimPhone): Send the claim makes it and sends it for approval in one press.
    return successResponse(body.send === true ? await submitClaim(actor, claim.id) : claim, 201);
  } catch (error) {
    const refused = refusedResponse(error, "Add what was spent, with an amount for each.");
    if (refused) return refused;
    console.error("[API] POST /api/books/claims error:", error);
    return errorResponse("Could not save the claim");
  }
}
