import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { canEditRecord, canUser, denialMessage } from "@/lib/crm/permissions";
import { createOrRotateApproval } from "@/lib/crm/approvals";

const bodySchema = z.object({ expiresInDays: z.number().int().min(1).max(90).optional() });

async function loadDoc(companyId: string, leadId: string, docId: string) {
  return prisma.crmLeadDocument.findFirst({
    where: { id: docId, companyId, leadId },
    select: {
      id: true,
      // A document sits on a lead before conversion and on the deal after,
      // so the owner to check comes from whichever it is attached to.
      lead: { select: { assignedToId: true } },
      deal: { select: { assignedToId: true } },
    },
  });
}

function docOwnerId(doc: { lead: { assignedToId: string | null } | null; deal: { assignedToId: string | null } | null }) {
  return doc.deal?.assignedToId ?? doc.lead?.assignedToId ?? null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id, docId } = await params;

    const doc = await loadDoc(session.user.companyId, id, docId);
    if (!doc) return errorResponse("Document not found", 404);
    if (!await canEditRecord(session, docOwnerId(doc))) {
      return errorResponse("You can only share documents on leads assigned to you", 403);
    }
    // Sending a document to the customer is its own permission.
    if (!(await canUser(session, "documents.approve"))) {
      return errorResponse(denialMessage("documents.approve"), 403);
    }

    const { expiresInDays } = bodySchema.parse(await request.json().catch(() => ({})));
    const token = await prisma.$transaction((tx) =>
      createOrRotateApproval(tx, {
        companyId: session.user.companyId,
        leadDocumentId: docId,
        expiresInDays,
      }),
    );

    return successResponse({ token, path: `/a/${token}` }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST .../documents/[docId]/approval error:", error);
    return errorResponse("Failed to create approval link");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id, docId } = await params;

    const doc = await loadDoc(session.user.companyId, id, docId);
    if (!doc) return errorResponse("Document not found", 404);
    if (!await canEditRecord(session, docOwnerId(doc))) {
      return errorResponse("You can only revoke documents on leads assigned to you", 403);
    }
    // Sending a document to the customer is its own permission.
    if (!(await canUser(session, "documents.approve"))) {
      return errorResponse(denialMessage("documents.approve"), 403);
    }

    await prisma.crmDocumentApproval.updateMany({
      where: { companyId: session.user.companyId, leadDocumentId: docId },
      data: { status: "REVOKED" },
    });
    return successResponse({ docId, revoked: true });
  } catch (error) {
    console.error("[API] DELETE .../documents/[docId]/approval error:", error);
    return errorResponse("Failed to revoke approval link");
  }
}
