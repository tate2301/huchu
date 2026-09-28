import { NextRequest } from "next/server";

import { getEditableDocument, patchDocument } from "../../../../_document-routes";

/** A deal's quote or invoice, as the builder opens it for an edit. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id, docId } = await params;
  return getEditableDocument(request, { kind: "deal", id }, docId);
}

/**
 * Edit a quote or an invoice on a deal, in place, until the client answers.
 * See `updateQuotationForDocument` and `updateInvoiceForDocument`.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id, docId } = await params;
  return patchDocument(request, { kind: "deal", id }, docId);
}
