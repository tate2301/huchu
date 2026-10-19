import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canDo, guardBooks } from "@/lib/books/core";
import { partyData, partySchema } from "@/lib/books/party-form";
import { readSupplierQuery, readSuppliers, suppliersCsv } from "@/lib/books/suppliers";
import { resolveBaseCurrency } from "@/lib/money";
import { prisma } from "@/lib/prisma";

/** Books → Suppliers (BkSuppliers): owed, by age (the payables sub-ledger), write-offs. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { actor, refused } = await guardBooks(sessionResult.session, "view", { area: "bills" });
    if (refused) return refused;
    const params = new URL(request.url).searchParams;
    const query = readSupplierQuery(params);
    const csv = params.get("format") === "csv";
    const view = await readSuppliers(prisma, actor.companyId, csv ? { ...query, page: 1 } : query, (await resolveBaseCurrency(actor.companyId)).toUpperCase(), new Date(), csv ? 10_000 : undefined);
    if (csv) return new NextResponse(suppliersCsv(view), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="suppliers.csv"' } });
    return successResponse({ ...view, can: { create: canDo(actor, "draft.create", { kind: "bill" }).allowed, pay: canDo(actor, "draft.create", { kind: "payment" }).allowed } });
  } catch (error) {
    console.error("[API] GET /api/books/suppliers error:", error);
    return errorResponse("Could not load the suppliers");
  }
}

/** New supplier, from Books' drawer (on Record a bill and Pay a supplier). */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const input = partySchema.parse(await request.json());
    const { actor, refused } = await guardBooks(sessionResult.session, "draft.create", { kind: "bill" });
    if (refused) return refused;
    const vendor = await prisma.vendor.create({ data: { companyId: actor.companyId, ...partyData(input) } });
    return successResponse({ id: vendor.id, name: vendor.name }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse(error.issues[0]?.message ?? "Check the supplier's details.", 400, error.issues);
    console.error("[API] POST /api/books/suppliers error:", error);
    return errorResponse("Could not add the supplier");
  }
}
