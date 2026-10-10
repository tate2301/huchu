import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { auditExportDownloaded } from "@/lib/retail/audit";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { countSheetsFileName, loadCountSheets, renderCountSheetsPdf } from "@/lib/retail/stock/count-sheets";

import { requireRetailSession } from "../../../_helpers";

const countIds = z.object({
  ids: z.array(z.string().uuid()).min(1, "Tick a count first.").max(100, "Tick at most 100 counts."),
});

/**
 * Print count sheets (30-stock 4.4, the Counts list's bulk action): `{ ids }`
 * → one PDF, a sheet per count. `retail.counts:view`. 404 when none of them is
 * this shop's.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.counts", "view");
  if (gate) return gate;

  const parsed = countIds.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Tick a count first.", 400);

  try {
    const companyId = session.user.companyId;
    const sheets = await loadCountSheets(companyId, parsed.data.ids);
    if (sheets.length === 0) return errorResponse("Those counts are not this shop’s.", 404);

    const pdf = await renderCountSheetsPdf(companyId, sheets);
    await auditExportDownloaded(prisma, {
      actor: { companyId, userId: session.user.id, userName: session.user.name, userRole: session.user.role },
      key: "retail-stock-counts",
      format: "pdf",
      rows: sheets.length,
    });
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${countSheetsFileName(sheets)}"`,
      },
    });
  } catch (error) {
    console.error("[API] POST /api/v2/retail/stock/counts/print error:", error);
    return errorResponse("The count sheets could not be printed");
  }
}
