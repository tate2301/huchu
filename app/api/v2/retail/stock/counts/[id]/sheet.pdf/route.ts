import { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { countSheetsFileName, loadCountSheets, renderCountSheetsPdf } from "@/lib/retail/stock/count-sheets";

import { requireRetailSession } from "../../../../_helpers";
import { isId, NOT_FOUND } from "../../respond";

/**
 * One count's sheet to count on paper (30-stock 4.4): product, shelf or
 * place, expected (blank on a blind count) and a box. `retail.counts:view`;
 * 404 when it is not this shop's.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.counts", "view");
  if (gate) return gate;

  const { id } = await params;
  if (!isId(id)) return errorResponse(NOT_FOUND, 404);

  try {
    const sheets = await loadCountSheets(session.user.companyId, [id]);
    if (sheets.length === 0) return errorResponse(NOT_FOUND, 404);
    const pdf = await renderCountSheetsPdf(session.user.companyId, sheets);
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${request.nextUrl.searchParams.get("print") === "1" ? "inline" : "attachment"}; filename="${countSheetsFileName(sheets)}"`,
      },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/retail/stock/counts/[id]/sheet.pdf error:", error);
    return errorResponse("The count sheet could not be printed");
  }
}
