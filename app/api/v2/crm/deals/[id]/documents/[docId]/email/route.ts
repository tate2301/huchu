import { NextRequest } from "next/server";

import { getDocumentEmail, sendDocumentEmail } from "../../../../../_document-routes";

export const runtime = "nodejs";
// The PDF is rendered and attached before the send, so this carries the same
// Chromium cold-start budget as the routes that only render.
export const maxDuration = 120;

type Params = { params: Promise<{ id: string; docId: string }> };

/** The email as it would go, for the rep to change before sending. */
export async function GET(request: NextRequest, { params }: Params) {
  const { id, docId } = await params;
  return getDocumentEmail(request, { kind: "deal", id }, docId);
}

/** Email this document to the client, with the PDF attached and the approval link in the body. */
export async function POST(request: NextRequest, { params }: Params) {
  const { id, docId } = await params;
  return sendDocumentEmail(request, { kind: "deal", id }, docId);
}
