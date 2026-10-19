import { NextRequest, NextResponse } from "next/server";

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
