import { NextRequest } from "next/server";

import { getEditableDocument, patchInvoiceDocument } from "../../../../_document-routes";

/** A deal's quote or invoice, as the builder opens it for an edit. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id, docId } = await params;
  return getEditableDocument(request, { kind: "deal", id }, docId);
}

/** Edit an issued invoice on a deal. See `updateInvoiceForDocument`. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id, docId } = await params;
  return patchInvoiceDocument(request, { kind: "deal", id }, docId);
}
