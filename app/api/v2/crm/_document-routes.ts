/**
 * One quote or invoice on a lead or a deal: read for editing, and edit.
 *
 * The lead and deal routes are the same handler with a different owner, the
 * way their `email`, `pdf` and `approval` siblings are — the document is
 * reached through the record it belongs to, which is what keeps the tenant
 * and ownership scoping explicit.
 *
 * Both kinds are edited in place until the client answers. A quote keeps its
 * number and its approval link, which shows the new figures next time it is
 * opened; an invoice keeps its number and has its journal reposted. A
 * declined quote is not edited here: it is revised as its next version
 * (`POST …/quotation` with `supersedesId`), which the same link asks about
 * afresh.
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
  updateQuotationForDocument,
  type DocumentOwnerRef,
} from "@/lib/crm/accounting-bridge";
import { documentResourceIdsSchema, ResourceNotAvailableError } from "@/lib/crm/resources";
import { crmDocumentLineSchema } from "./_helpers";

type Owner = { kind: "lead" | "deal"; id: string };

function ownerRef(owner: Owner): DocumentOwnerRef {
  return owner.kind === "deal" ? { dealId: owner.id } : { leadId: owner.id };
}

const updateDocumentSchema = z.object({
  lines: z.array(crmDocumentLineSchema).min(1),
  notes: z.string().trim().max(2000).nullable().optional(),
  /** A quote's. */
  validUntil: z.string().datetime().nullable().optional(),
  /** An invoice's. */
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

export async function patchDocument(request: NextRequest, owner: Owner, docId: string) {
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
    if (doc.type !== "QUOTATION" && doc.type !== "INVOICE") {
      return errorResponse("A receipt is not edited — void it in Accounting", 400);
    }
    const noun = doc.type === "QUOTATION" ? "quotes" : "invoices";

    const ownerId = doc.deal?.assignedToId ?? doc.lead?.assignedToId ?? null;
    if (!(await canEditRecord(session, ownerId))) {
      return errorResponse(`You can only edit ${noun} on ${owner.kind}s assigned to you`, 403);
    }
    // Owning the record is not the same as being allowed to bill against it.
    if (!(await canUser(session, "documents.issue"))) {
      return errorResponse(denialMessage("documents.issue"), 403);
    }

    const data = updateDocumentSchema.parse(await request.json());
    const common = {
      ...ownerRef(owner),
      companyId,
      userId: session.user.id,
      leadDocumentId: docId,
      lines: data.lines,
      notes: data.notes ?? null,
      renderTemplateId: data.renderTemplateId ?? null,
      resourceIds: data.resourceIds,
    };
    const result =
      doc.type === "QUOTATION"
        ? await updateQuotationForDocument({
            ...common,
            validUntil: data.validUntil ? new Date(data.validUntil) : null,
          })
        : await updateInvoiceForDocument({
            ...common,
            dueDate: data.dueDate ? new Date(data.dueDate) : null,
          });

    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    // The two refusals a rep can act on come back as themselves: the
    // document is locked, and why; or a resource left the library while they
    // worked.
    if (error instanceof DocumentLockedError) return errorResponse(error.message, 409);
    if (error instanceof ResourceNotAvailableError) return errorResponse(error.message, 409);
    console.error(`[API] PATCH /api/v2/crm/${owner.kind}s/[id]/documents/[docId] error:`, error);
    return errorResponse(error instanceof Error ? error.message : "Failed to edit the document", 400);
  }
}
