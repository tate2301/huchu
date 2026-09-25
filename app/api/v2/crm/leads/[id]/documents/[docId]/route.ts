import { NextRequest } from "next/server";

import { getEditableDocument, patchInvoiceDocument } from "../../../../_document-routes";

/** A lead's quote or invoice, as the builder opens it for an edit. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id, docId } = await params;
  return getEditableDocument(request, { kind: "lead", id }, docId);
}

/** Edit an issued invoice on a lead. See `updateInvoiceForDocument`. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id, docId } = await params;
  return patchInvoiceDocument(request, { kind: "lead", id }, docId);
}
