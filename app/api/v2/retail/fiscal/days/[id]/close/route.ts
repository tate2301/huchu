import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { closeShopFiscalDay, FiscalRefused } from "@/lib/retail/fiscal-settings";
import { canRetailSessionDo, requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { fiscalPage } from "@/lib/retail/settings-pages/fiscal";
import { readSettings } from "@/lib/retail/settings";
import { requireRetailSession } from "../../../../_helpers";
import { fiscalRefusal } from "../../../_respond";

/**
 * "Close day {n}" on Setup › Fiscal device (W-06, C-14: its own endpoint).
 * The owner closes the open day: its Z-report, signed by the device, goes to
 * ZIMRA, and the page's values come back with the day closed. A day whose
 * receipts ZIMRA has not all taken is refused (409); ZIMRA refusing the
 * report, or not answering, is a 502 and the day stays closing.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.fiscal", "update");
  if (gate) return gate;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  try {
    await closeShopFiscalDay(
      {
        companyId: session.user.companyId,
        userId: session.user.id,
        userName: session.user.name ?? null,
        userRole: session.user.role ?? null,
      },
      path.data.id,
    );
    const page = await readSettings(
      session.user.companyId,
      "fiscal",
      canRetailSessionDo(session, fiscalPage.change[0], fiscalPage.change[1]),
    );
    return successResponse({ values: page!.values, lastChanged: page!.lastChanged });
  } catch (error) {
    if (error instanceof FiscalRefused) return fiscalRefusal(error);
    console.error("[API] POST /api/v2/retail/fiscal/days/[id]/close error:", error);
    return errorResponse("The day was not closed. Try again.");
  }
}
