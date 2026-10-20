import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { BillRefused, billSchema, createPurchaseBill } from "@/lib/books/bill-create";
import { billsCsv, readBillQuery, readBills } from "@/lib/books/bills";
import { guardBooks } from "@/lib/books/core";
import { prisma } from "@/lib/prisma";

/** Books → Bills (BkBills), filtered and paged; `format=csv` is Export, every page. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "view", { area: "bills" });
    if (refused) return refused;
    const params = new URL(request.url).searchParams;
    const query = readBillQuery(params);
    if (params.get("format") === "csv") {
      return new NextResponse(await billsCsv(prisma, actor.companyId, query), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="bills.csv"' },
      });
    }
    return successResponse(await readBills(prisma, actor.companyId, query));
  } catch (error) {
    console.error("[API] GET /api/books/bills error:", error);
    return errorResponse("Could not read the bills");
  }
}

const booksBillSchema = billSchema.extend({ costCenterId: z.string().uuid().optional() });

/** Books' Record a bill (BkBillNew): a draft, or received and posted through the core on its cost centre. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const input = booksBillSchema.parse(await request.json());
    const { actor, refused } = await guardBooks(session, input.receiveNow ? "issue" : "draft.create", { kind: "bill" });
    if (refused) return refused;
    if (input.costCenterId) {
      const centre = await prisma.costCenter.findFirst({ where: { id: input.costCenterId, companyId: actor.companyId, isActive: true }, select: { id: true } });
      if (!centre) return errorResponse("That cost centre is not here any more.", 400);
    }
    const bill = await createPurchaseBill(actor, input, { costCenterId: input.costCenterId ?? null });
    return successResponse({ id: bill.id, number: bill.billNumber, status: bill.status, supplier: bill.vendor.name, total: bill.total, currency: bill.currency }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Check the bill: something in it is not filled in right.", 400, error.issues);
    if (error instanceof BillRefused) return errorResponse(error.message, 400, error.details);
    console.error("[API] POST /api/books/bills error:", error);
    return errorResponse("Could not save the bill");
  }
}
