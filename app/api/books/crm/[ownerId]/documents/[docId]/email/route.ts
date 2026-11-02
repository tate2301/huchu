import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { ensureCrmDocument } from "@/lib/books/crm-document-bridge";
import { draftDocumentEmail, emailDocumentToClient, NoRecipientError } from "@/lib/crm/document-email";
import { canUser, denialMessage } from "@/lib/crm/permissions";
import { vaneQuoteMessageSent } from "@/lib/crm/quote-check";
import { EmailNotConfiguredError } from "@/lib/email/send";
import { VaneDraftNotTakenOn } from "@/lib/vane/drafts";

const emailSchema = z.object({
  subject: z.string().trim().min(1, "Write a subject").max(200, "Keep the subject to 200 characters").optional(),
  message: z.string().trim().min(1, "Write the message").max(5000, "Keep the message to 5,000 characters").optional(),
  vaneItemId: z.string().uuid().optional(),
});

type RouteParams = { params: Promise<{ ownerId: string; docId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { docId } = await params;

    if (!(await canUser(session, "documents.approve"))) {
      return errorResponse(denialMessage("documents.approve"), 403);
    }

    const ensured = await ensureCrmDocument(session.user.companyId, docId);
    if (!ensured) return errorResponse("Document not found", 404);

    const draft = await draftDocumentEmail({
      companyId: session.user.companyId,
      leadDocumentId: ensured.id,
    });
    if (!draft) return errorResponse("Document not found", 404);

    return successResponse(draft);
  } catch (error) {
    console.error("[API] GET /api/books/crm/[ownerId]/documents/[docId]/email error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to prepare email", 400);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { docId } = await params;

    if (!(await canUser(session, "documents.approve"))) {
      return errorResponse(denialMessage("documents.approve"), 403);
    }

    const ensured = await ensureCrmDocument(session.user.companyId, docId);
    if (!ensured) return errorResponse("Document not found", 404);

    const { vaneItemId, ...body } = emailSchema.parse(await request.json().catch(() => ({})));
    const sent = await emailDocumentToClient({
      companyId: session.user.companyId,
      leadDocumentId: ensured.id,
      ...body,
    });
    if (vaneItemId) {
      await vaneQuoteMessageSent({
        companyId: session.user.companyId,
        userId: session.user.id,
        itemId: vaneItemId,
        documentId: ensured.id,
      });
    }

    return successResponse(sent, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse(error.issues[0]?.message ?? "Validation failed", 400, error.issues);
    }
    if (error instanceof NoRecipientError) return errorResponse(error.message, 422);
    if (error instanceof VaneDraftNotTakenOn) return errorResponse(error.message, error.status);
    if (error instanceof EmailNotConfiguredError) return errorResponse(error.message, 503);
    console.error("[API] POST /api/books/crm/[ownerId]/documents/[docId]/email error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to send email", 400);
  }
}
