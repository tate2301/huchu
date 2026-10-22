import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { guardBooks } from "@/lib/books/core";
import { readCustomers } from "@/lib/books/customers";
import { readCustomerQuery } from "@/lib/books/customers-view";
import { partyData, partySchema } from "@/lib/books/party-form";
import { prisma } from "@/lib/prisma";

/** Books → Customers, by tab and filter; `format=csv` is Export of what is shown. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const params = new URL(request.url).searchParams;
    const view = await readCustomers(prisma, sessionResult.session.user.companyId, readCustomerQuery(params));
    if (params.get("format") === "csv") {
      const cell = (value: string | number) => (/[",\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value));
      const lines = [["Customer", "Accounts contact", "Currency", "Owes", "Overdue", "On account", "Last paid"].join(",")];
      for (const row of view.rows) lines.push([row.name, row.contact ?? "", view.currency, row.owes.toFixed(2), row.overdue.toFixed(2), row.onAccount.toFixed(2), row.lastPaid ?? ""].map(cell).join(","));
      return new NextResponse(`${lines.join("\n")}\n`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="customers.csv"' } });
    }
    return successResponse(view);
  } catch (error) {
    console.error("[API] GET /api/books/customers error:", error);
    return errorResponse("Could not read the customers");
  }
}

/** New customer, from Books' drawer. Shared with the CRM's and the shop's customers. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const input = partySchema.parse(await request.json());
    const { actor, refused } = await guardBooks(sessionResult.session, "draft.create", { kind: "invoice" });
    if (refused) return refused;
    const customer = await prisma.customer.create({ data: { companyId: actor.companyId, ...partyData(input), createdById: actor.userId } });
    return successResponse({ id: customer.id, name: customer.name }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse(error.issues[0]?.message ?? "Check the customer's details.", 400, error.issues);
    console.error("[API] POST /api/books/customers error:", error);
    return errorResponse("Could not add the customer");
  }
}
