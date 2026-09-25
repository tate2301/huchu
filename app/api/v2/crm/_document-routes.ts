/**
 * One quote or invoice on a lead or a deal: read for editing, and edit.
 *
 * The lead and deal routes are the same handler with a different owner, the
 * way their `email`, `pdf` and `approval` siblings are — the document is
 * reached through the record it belongs to, which is what keeps the tenant
 * and ownership scoping explicit.
 *
 * Editing a quote does not come through here. A quote is changed by issuing
 * the next version (`POST …/quotation` with `supersedesId`), which voids this
 * one and moves the client's approval link; only an invoice is edited in
 * place, because it keeps its number.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { canEditRecord, canUser, denialMessage } from "@/lib/crm/permissions";
import {
  DocumentLockedError,
  loadEditableDocument,
  updateInvoiceForDocument,
  type DocumentOwnerRef,
} from "@/lib/crm/accounting-bridge";
import { documentResourceIdsSchema, ResourceNotAvailableError } from "@/lib/crm/resources";
import { crmDocumentLineSchema } from "./_helpers";

type Owner = { kind: "lead" | "deal"; id: string };

function ownerRef(owner: Owner): DocumentOwnerRef {
  return owner.kind === "deal" ? { dealId: owner.id } : { leadId: owner.id };
}

const updateInvoiceSchema = z.object({
  lines: z.array(crmDocumentLineSchema).min(1),
  notes: z.string().trim().max(2000).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  renderTemplateId: z.string().uuid().nullable().optional(),
  resourceIds: documentResourceIdsSchema.optional(),
});

export async function getEditableDocument(request: NextRequest, owner: Owner, docId: string) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const document = await loadEditableDocument({
      ...ownerRef(owner),
      companyId: session.user.companyId,
      leadDocumentId: docId,
    });
    if (!document) return errorResponse("Document not found", 404);
    return successResponse(document);
  } catch (error) {
    console.error(`[API] GET /api/v2/crm/${owner.kind}s/[id]/documents/[docId] error:`, error);
    return errorResponse("Failed to load the document");
  }
}

export async function patchInvoiceDocument(request: NextRequest, owner: Owner, docId: string) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const doc = await prisma.crmLeadDocument.findFirst({
      where: { id: docId, companyId, ...ownerRef(owner) },
      select: {
        type: true,
        lead: { select: { assignedToId: true } },
        deal: { select: { assignedToId: true } },
      },
    });
    if (!doc) return errorResponse("Document not found", 404);
    if (doc.type !== "INVOICE") {
      return errorResponse("A quote is changed by issuing its next version, not edited in place", 400);
    }

    const ownerId = doc.deal?.assignedToId ?? doc.lead?.assignedToId ?? null;
    if (!(await canEditRecord(session, ownerId))) {
      return errorResponse(`You can only edit invoices on ${owner.kind}s assigned to you`, 403);
    }
    // Owning the record is not the same as being allowed to bill against it.
    if (!(await canUser(session, "documents.issue"))) {
      return errorResponse(denialMessage("documents.issue"), 403);
    }

    const data = updateInvoiceSchema.parse(await request.json());
    const result = await updateInvoiceForDocument({
      ...ownerRef(owner),
      companyId,
      userId: session.user.id,
      leadDocumentId: docId,
      lines: data.lines,
      notes: data.notes ?? null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      renderTemplateId: data.renderTemplateId ?? null,
      resourceIds: data.resourceIds,
    });

    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    // The two refusals a rep can act on come back as themselves: the invoice
    // is locked, and why; or a resource left the library while they worked.
    if (error instanceof DocumentLockedError) return errorResponse(error.message, 409);
    if (error instanceof ResourceNotAvailableError) return errorResponse(error.message, 409);
    console.error(`[API] PATCH /api/v2/crm/${owner.kind}s/[id]/documents/[docId] error:`, error);
    return errorResponse(error instanceof Error ? error.message : "Failed to edit the invoice", 400);
  }
}
