import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { ensureCrmDocument, resolveOwnerRef } from "@/lib/books/crm-document-bridge";
import {
  DocumentLockedError,
  loadEditableDocument,
  updateInvoiceForDocument,
  updateQuotationForDocument,
} from "@/lib/crm/accounting-bridge";
import { canUser, denialMessage } from "@/lib/crm/permissions";
import { documentResourceIdsSchema } from "@/lib/crm/resources";
import { crmDocumentLineSchema } from "@/app/api/v2/crm/_helpers";

const patchSchema = z.object({
  lines: z.array(crmDocumentLineSchema).min(1),
  notes: z.string().trim().max(2000).nullable().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  renderTemplateId: z.string().uuid().nullable().optional(),
  resourceIds: documentResourceIdsSchema.optional(),
});

type RouteParams = { params: Promise<{ ownerId: string; docId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { ownerId, docId } = await params;

    const ownerRef = await resolveOwnerRef(session.user.companyId, ownerId);
    if (!ownerRef) return errorResponse("Record not found", 404);

    const ensured = await ensureCrmDocument(session.user.companyId, docId);
    if (!ensured) return errorResponse("Document not found", 404);

    const editable = await loadEditableDocument({
      companyId: session.user.companyId,
      ...ownerRef,
      leadDocumentId: ensured.id,
    });
    if (!editable) return errorResponse("Document not found", 404);

    return successResponse(editable);
  } catch (error) {
    console.error("[API] GET /api/books/crm/[ownerId]/documents/[docId] error:", error);
    return errorResponse("Failed to load document");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { ownerId, docId } = await params;

    if (!(await canUser(session, "documents.issue"))) {
      return errorResponse(denialMessage("documents.issue"), 403);
    }

    const ownerRef = await resolveOwnerRef(session.user.companyId, ownerId);
    if (!ownerRef) return errorResponse("Record not found", 404);

    const doc = await ensureCrmDocument(session.user.companyId, docId);
    if (!doc || (doc.type !== "QUOTATION" && doc.type !== "INVOICE")) {
      return errorResponse("Document not found", 404);
    }

    const data = patchSchema.parse(await request.json());

    if (doc.type === "QUOTATION") {
      const updated = await updateQuotationForDocument({
        companyId: session.user.companyId,
        userId: session.user.id,
        ...ownerRef,
        leadDocumentId: doc.id,
        lines: data.lines,
        notes: data.notes ?? null,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        renderTemplateId: data.renderTemplateId ?? null,
        resourceIds: data.resourceIds,
      });
      return successResponse(updated);
    }

    const updated = await updateInvoiceForDocument({
      companyId: session.user.companyId,
      userId: session.user.id,
      ...ownerRef,
      leadDocumentId: doc.id,
      lines: data.lines,
      notes: data.notes ?? null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      renderTemplateId: data.renderTemplateId ?? null,
      resourceIds: data.resourceIds,
    });
    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    if (error instanceof DocumentLockedError) return errorResponse(error.message, 409);
    console.error("[API] PATCH /api/books/crm/[ownerId]/documents/[docId] error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to save document", 400);
  }
}
