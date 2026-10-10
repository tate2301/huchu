import { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { auditExportDownloaded } from "@/lib/retail/audit";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { deliveryNotesFileName, loadDeliveryNotes, renderDeliveryNotesPdf } from "@/lib/retail/stock/delivery-notes";
import { transferIdsInput } from "@/lib/retail/stock/transfers";

import { requireRetailSession } from "../../../_helpers";

/**
 * Print delivery notes (30-stock 4.5, the Transfers list's row and bulk
 * action): `{ ids }` → one PDF, a delivery note per transfer, one per page.
 * `retail.transfers:view`. 404 when none of them is this shop's.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.transfers", "view");
  if (gate) return gate;

  const parsed = transferIdsInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Tick a transfer first.", 400);

  try {
    const companyId = session.user.companyId;
    const notes = await loadDeliveryNotes(companyId, parsed.data.ids);
    if (notes.length === 0) return errorResponse("Those transfers are not this shop’s.", 404);

    const pdf = await renderDeliveryNotesPdf(companyId, notes);
    await auditExportDownloaded(prisma, {
      actor: { companyId, userId: session.user.id, userName: session.user.name, userRole: session.user.role },
      key: "retail-stock-transfers",
      format: "pdf",
      rows: notes.length,
    });
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${deliveryNotesFileName(notes)}"`,
      },
    });
  } catch (error) {
    console.error("[API] POST /api/v2/retail/stock/transfers/print error:", error);
    return errorResponse("The delivery notes could not be printed");
  }
}
