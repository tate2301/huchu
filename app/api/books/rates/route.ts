import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, canDo, revalueMonth, reverseRevaluation } from "@/lib/books/core";
import { refusedResponse } from "@/lib/books/core/refused";
import { readRates } from "@/lib/books/rates-page";
import { resolveBaseCurrency } from "@/lib/money";
import { prisma } from "@/lib/prisma";

/** Books → Close the month → Rates & revaluation. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const params = new URL(request.url).searchParams;
    const month = params.get("month");
    return successResponse(
      await readRates(prisma, sessionResult.session.user.companyId, {
        tab: params.get("tab") === "revaluation" ? "revaluation" : "rates",
        currency: (params.get("currency") ?? "ZWG").toUpperCase().slice(0, 6),
        page: Number(params.get("page")) || 1,
        month: month && /^\d{4}-\d{2}$/.test(month) ? month : null,
      }),
    );
  } catch (error) {
    console.error("[API] GET /api/books/rates error:", error);
    return errorResponse("Could not read the rates");
  }
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rate"), currency: z.string().trim().min(3).max(6), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), rate: z.number().positive() }),
  z.object({ action: z.literal("remove"), id: z.string().uuid() }),
  z.object({ action: z.literal("revalue"), month: z.string().regex(/^\d{4}-\d{2}$/) }),
  z.object({ action: z.literal("reverse"), month: z.string().regex(/^\d{4}-\d{2}$/), reason: z.string().trim().min(3).max(500) }),
]);

/**
 * Enter a rate (owner or accountant, as the chart and rates are), remove one
 * typed in by mistake, post the month's revaluation and its reversal, or
 * reverse a revaluation run at the wrong rate. Documents keep the rate they
 * froze; removing a rate never moves one.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const actor = await booksActor(session);
    const body = schema.parse(await request.json());
    if (body.action === "revalue") return successResponse(await revalueMonth(actor, body.month));
    if (body.action === "reverse") return successResponse(await reverseRevaluation(actor, body.month, body.reason));
    const allowed = canDo(actor, "setup");
    if (!allowed.allowed) return errorResponse(allowed.reason, 403);
    if (body.action === "remove") {
      const removed = await prisma.currencyRate.deleteMany({ where: { id: body.id, companyId: session.user.companyId, source: "MANUAL" } });
      if (removed.count === 0) return errorResponse("Only a rate typed in here can be removed; RBZ's stay.", 409);
      return successResponse({ removed: removed.count });
    }
    const base = (await resolveBaseCurrency(session.user.companyId)).toUpperCase();
    const quote = body.currency.toUpperCase();
    if (quote === base) return errorResponse(`${base} is the base currency: its rate is always 1.`, 400);
    const rate = await prisma.currencyRate.create({
      data: { companyId: session.user.companyId, baseCurrency: base, quoteCurrency: quote, rate: body.rate, effectiveDate: new Date(`${body.date}T00:00:00.000Z`), createdById: session.user.id, source: "MANUAL" },
      select: { id: true },
    });
    return successResponse(rate, 201);
  } catch (error) {
    const refusal = refusedResponse(error, "Check the rate");
    if (refusal) return refusal;
    console.error("[API] POST /api/books/rates error:", error);
    return errorResponse("The rate was not saved");
  }
}
