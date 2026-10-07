import { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";

import { reprintSaleReceipt } from "@/lib/retail/floor/sales";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { requireRetailSession } from "../../../_helpers";
import { SALES_REFUSAL, saleActor, saleRefusalResponse } from "../../_shared";

/**
 * "Reprint the receipt": the sale's receipt as an 80 mm PDF with "COPY"
 * printed above the header, opened in a new tab to print. Anyone who reads
 * the sale may (a cashier their own).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const reads = canRetailSessionDo(session, "retail.sell", "view") || canRetailSessionDo(session, "retail.cash-control", "view");
  if (!reads) return errorResponse(SALES_REFUSAL, 403);

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  try {
    const { saleNo, pdf } = await reprintSaleReceipt(session.user.companyId, path.data.id, saleActor(session));
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${saleNo.replace(/[^A-Za-z0-9._-]+/g, "-")}-copy.pdf"`,
      },
    });
  } catch (error) {
    return saleRefusalResponse(error, "GET /api/v2/retail/sales/[id]/receipt");
  }
}
