import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { isRouteAllowedForRole } from "@/lib/auth-core/role-routes";
import { invoicesCsv, readInvoiceQuery, readInvoices } from "@/lib/books/invoices";
import { isWorkspaceOwner } from "@/lib/books/owner";
import { prisma } from "@/lib/prisma";

/** Books → Invoices, filtered and paged; `format=csv` is Export, every page. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const companyId = sessionResult.session.user.companyId;
    const params = new URL(request.url).searchParams;
    const query = readInvoiceQuery(params);
    if (params.get("format") === "csv") {
      return new NextResponse(await invoicesCsv(prisma, companyId, query), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="invoices.csv"',
        },
      });
    }
    const role = sessionResult.session.user.role;
    const can = { deleteDrafts: isRouteAllowedForRole(role, "/api/accounting/sales/invoices", "PATCH"), owner: isWorkspaceOwner(role) };
    return successResponse({ ...(await readInvoices(prisma, companyId, query)), can });
  } catch (error) {
    console.error("[API] GET /api/books/invoices error:", error);
    return errorResponse("Could not read the invoices");
  }
}
