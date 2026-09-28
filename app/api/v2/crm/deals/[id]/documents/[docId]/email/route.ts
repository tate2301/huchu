import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { canEditRecord, canUser, denialMessage } from "@/lib/crm/permissions";
import { emailDocumentToClient, NoRecipientError } from "@/lib/crm/document-email";
import { EmailNotConfiguredError } from "@/lib/email/send";

export const runtime = "nodejs";
// The PDF is rendered and attached before the send, so this carries the same
// Chromium cold-start budget as the routes that only render.
export const maxDuration = 120;

/**
 * Email this document to the client, with the PDF attached and the approval
 * link in the body.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id, docId } = await params;

    const doc = await prisma.crmLeadDocument.findFirst({
      where: { id: docId, companyId: session.user.companyId, dealId: id },
      select: {
        lead: { select: { assignedToId: true } },
        deal: { select: { assignedToId: true } },
      },
    });
    if (!doc) return errorResponse("Document not found", 404);

    const ownerId = doc.deal?.assignedToId ?? doc.lead?.assignedToId ?? null;
    if (!(await canEditRecord(session, ownerId))) {
      return errorResponse("You can only send documents on records assigned to you", 403);
    }
    // Sending a document to the customer is the same permission as sharing a
    // link to it: both put the price in front of the client.
    if (!(await canUser(session, "documents.approve"))) {
      return errorResponse(denialMessage("documents.approve"), 403);
    }

    const sent = await emailDocumentToClient({
      companyId: session.user.companyId,
      leadDocumentId: docId,
    });
    return successResponse(sent, 201);
  } catch (error) {
    console.error("[API] POST .../documents/[docId]/email error:", error);
    // A missing address and an unconfigured provider are both things the
    // person pressing send can act on, so they are answered rather than
    // flattened into a server error.
    if (error instanceof NoRecipientError) return errorResponse(error.message, 422);
    if (error instanceof EmailNotConfiguredError) return errorResponse(error.message, 503);
    return errorResponse(
      error instanceof Error ? error.message : "Failed to email the document",
      500,
    );
  }
}
