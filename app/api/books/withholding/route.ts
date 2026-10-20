import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { withholdingReturn } from "@/lib/books/core/withholding";
import type { WithholdingTab } from "@/lib/books/withholding-labels";
import { readWithholding } from "@/lib/books/withholding-page";
import { prisma } from "@/lib/prisma";

const TABS: WithholdingTab[] = ["income", "vat", "rent", "certificates", "returns"];

/** Books → Tax → Withholding; `?return=YYYY-MM&format=csv` is that month's withholding return. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const companyId = sessionResult.session.user.companyId;
    const params = new URL(request.url).searchParams;
    const month = params.get("return");
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const ret = await withholdingReturn(companyId, month);
      const cell = (value: string | number) => (/[",\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value));
      const rows = [
        ["Payment", "Supplier", "Paid on", "Currency", "Gross", "Income tax withheld", "VAT withheld", "Certificate"],
        ...ret.rows.map((row) => [row.paymentNumber ?? "", row.supplier, row.paidOn, row.currency, row.gross.toFixed(2), row.incomeTax.toFixed(2), row.vat.toFixed(2), row.certificateNo ?? ""]),
        ...ret.byCurrency.map((row) => [`Total ${row.currency}`, "", "", row.currency, "", row.incomeTax.toFixed(2), row.vat.toFixed(2), ""]),
        ["Ledger, 2180", "", "", "", "", ret.ledger.withholding.toFixed(2), ret.ledger.vatWithheld.toFixed(2), ""],
        [`Return due ${ret.returnDue}`, `Payment due ${ret.paymentDue}`],
      ];
      return new NextResponse(`${rows.map((row) => row.map(cell).join(",")).join("\n")}\n`, {
        headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="withholding-return-${month}.csv"` },
      });
    }
    return successResponse(
      await readWithholding(prisma, companyId, {
        tab: TABS.find((value) => value === params.get("tab")) ?? "income",
        q: params.get("q") ?? "",
        supplier: params.get("supplier"),
      }),
    );
  } catch (error) {
    console.error("[API] GET /api/books/withholding error:", error);
    return errorResponse("Could not read the withholding");
  }
}
