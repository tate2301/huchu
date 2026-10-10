import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { deliveryNotesFileName, loadDeliveryNotes, renderDeliveryNotesPdf } from "@/lib/retail/stock/delivery-notes";

import { requireRetailSession } from "../../../../_helpers";

/**
 * One transfer's delivery note (30-stock 4.5): number, from, to, sent, by,
 * driver, vehicle, the lines with what was sent and received, and a line for
 * each side to sign. `retail.transfers:view`; 404 when it is not this shop's.
 * The record's "Print delivery note" asks for it inline (`?print=1`); "Export as PDF" downloads it.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.transfers", "view");
  if (gate) return gate;

  const { id } = await params;
  const notFound = "That transfer is not this shop’s.";
  if (!z.string().uuid().safeParse(id).success) return errorResponse(notFound, 404);

  try {
    const notes = await loadDeliveryNotes(session.user.companyId, [id]);
    if (notes.length === 0) return errorResponse(notFound, 404);
    const pdf = await renderDeliveryNotesPdf(session.user.companyId, notes);
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        // `?print=1` (the record's "Print delivery note") opens it in the browser to print.
        "Content-Disposition": `${request.nextUrl.searchParams.get("print") === "1" ? "inline" : "attachment"}; filename="${deliveryNotesFileName(notes)}"`,
      },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/retail/stock/transfers/[id]/delivery-note.pdf error:", error);
    return errorResponse("The delivery note could not be printed");
  }
}
