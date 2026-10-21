import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, canDo, guardBooks } from "@/lib/books/core";
import { removeCustomer } from "@/lib/books/customer-delete";
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
    return successResponse({ ...customer, can: { invoice: canDo(actor, "draft.create", { kind: "invoice" }).allowed, pay: canDo(actor, "issue", { kind: "receipt" }).allowed, delete: canDo(actor, "delete.posted", { kind: "invoice" }).allowed } });
  } catch (error) {
    console.error("[API] GET /api/books/customers/[id] error:", error);
    return errorResponse("Could not read the customer");
  }
}

/**
 * Delete a customer nothing points at, or archive one that has records
 * (`{ "archive": true }`). Deleting is the owner's and the outside accountant's,
 * as deleting anything posted is; archiving is for whoever may write invoices.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const body = (await request.json().catch(() => ({}))) as { archive?: boolean };
    const mode = body.archive ? "archive" : "delete";
    const { actor, refused } = await guardBooks(sessionResult.session, mode === "archive" ? "draft.create" : "delete.posted", { kind: "invoice" });
    if (refused) return refused;
    const outcome = await removeCustomer(prisma, actor.companyId, (await params).id, mode);
    if (!outcome.ok) return NextResponse.json({ success: false, error: outcome.why, canArchive: outcome.canArchive }, { status: outcome.status });
    return successResponse({ mode: outcome.mode, name: outcome.name });
  } catch (error) {
    console.error("[API] DELETE /api/books/customers/[id] error:", error);
    return errorResponse("Could not remove the customer");
  }
}
