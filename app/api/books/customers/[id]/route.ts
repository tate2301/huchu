import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, canDo } from "@/lib/books/core";
import { readCustomer } from "@/lib/books/customers";
import { prisma } from "@/lib/prisma";

/** One customer in Books: their position, invoices, payments and the statement for `from`–`to`. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const search = new URL(request.url).searchParams;
    const customer = await readCustomer(prisma, session.user.companyId, (await params).id, { from: search.get("from"), to: search.get("to") });
    if (!customer) return errorResponse("There is no such customer in this workspace", 404);
    const actor = await booksActor(session);
    return successResponse({ ...customer, can: { invoice: canDo(actor, "draft.create", { kind: "invoice" }).allowed, pay: canDo(actor, "issue", { kind: "receipt" }).allowed } });
  } catch (error) {
    console.error("[API] GET /api/books/customers/[id] error:", error);
    return errorResponse("Could not read the customer");
  }
}
