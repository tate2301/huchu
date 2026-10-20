import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canDo, guardBooks } from "@/lib/books/core";
import { readSupplierRecord } from "@/lib/books/suppliers";
import { resolveBaseCurrency } from "@/lib/money";
import { prisma } from "@/lib/prisma";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** One supplier in Books (BkSupplier): Activity, Bills, Payments, the Statement for `from`–`to`, and Tax. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "view", { area: "bills" });
    if (refused) return refused;
    const { id } = await params;
    const search = new URL(request.url).searchParams;
    const from = search.get("from");
    const to = search.get("to");
    const period = from && to && DAY.test(from) && DAY.test(to) && from <= to ? { from, to } : null;
    const record = await readSupplierRecord(prisma, actor.companyId, id, period, (await resolveBaseCurrency(actor.companyId)).toUpperCase());
    if (!record) return errorResponse("Supplier not found", 404);
    return successResponse({
      ...record,
      can: {
        pay: canDo(actor, "draft.create", { kind: "payment" }).allowed,
        bill: canDo(actor, "draft.create", { kind: "bill" }).allowed,
        order: canDo(actor, "draft.create", { kind: "purchase-order" }).allowed,
      },
    });
  } catch (error) {
    console.error("[API] GET /api/books/suppliers/[id] error:", error);
    return errorResponse("Could not read the supplier");
  }
}

const taxSchema = z.object({
  itf263Number: z.string().trim().max(40).nullish(),
  itf263ExpiresAt: z.string().regex(DAY).nullish(),
  isVatWithholdingAgent: z.boolean().optional(),
});

/**
 * A supplier's tax facts (D17): their ITF263's number and expiry, as on the
 * copy they sent, and whether they withhold VAT as an agent. The next payment
 * to them withholds 30% or not by these.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "draft.edit", { kind: "bill" });
    if (refused) return refused;
    const { id } = await params;
    const body = taxSchema.parse(await request.json());
    const vendor = await prisma.vendor.findFirst({ where: { id, companyId: actor.companyId }, select: { id: true } });
    if (!vendor) return errorResponse("Supplier not found", 404);
    const updated = await prisma.vendor.update({
      where: { id },
      data: {
        ...(body.itf263Number !== undefined ? { itf263Number: body.itf263Number || null } : {}),
        ...(body.itf263ExpiresAt !== undefined ? { itf263ExpiresAt: body.itf263ExpiresAt ? new Date(`${body.itf263ExpiresAt}T00:00:00.000Z`) : null } : {}),
        ...(body.isVatWithholdingAgent !== undefined ? { isVatWithholdingAgent: body.isVatWithholdingAgent } : {}),
      },
      select: { id: true, itf263Number: true, itf263ExpiresAt: true, isVatWithholdingAgent: true },
    });
    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Check the ITF263's number and date", 400, error.issues);
    console.error("[API] PATCH /api/books/suppliers/[id] error:", error);
    return errorResponse("The supplier was not changed");
  }
}
