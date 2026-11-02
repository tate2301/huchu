import { NextRequest } from "next/server";

import { errorResponse } from "@/lib/api-utils";
import { CRM_DOCUMENT_SOURCE_KEYS } from "@/lib/crm/document-sources";
import { attachmentDisposition, renderDocumentSync } from "@/lib/documents/service";
import { prisma } from "@/lib/prisma";

export type MoneyDocumentKind = "QUOTATION" | "INVOICE" | "RECEIPT";

/**
 * Resolves either a Books accounting record id (`SalesQuotation.id`,
 * `SalesInvoice.id`, `SalesReceipt.id`) or a CRM document id
 * (`CrmLeadDocument.id`) into the underlying accounting record id and its
 * optional `renderTemplateId`.
 */
export async function resolveMoneyPdfTarget(
  companyId: string,
  id: string,
  expectedKind?: MoneyDocumentKind,
): Promise<{ kind: MoneyDocumentKind; recordId: string; templateId: string | null } | null> {
  if (!expectedKind || expectedKind === "INVOICE") {
    const invoice = await prisma.salesInvoice.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        crmLeadDocuments: {
          where: { companyId },
          select: { renderTemplateId: true },
          take: 1,
        },
      },
    });
    if (invoice) {
      return {
        kind: "INVOICE",
        recordId: invoice.id,
        templateId: invoice.crmLeadDocuments[0]?.renderTemplateId ?? null,
      };
    }
  }

  if (!expectedKind || expectedKind === "QUOTATION") {
    const quote = await prisma.salesQuotation.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        crmLeadDocuments: {
          where: { companyId },
          select: { renderTemplateId: true },
          take: 1,
        },
      },
    });
    if (quote) {
      return {
        kind: "QUOTATION",
        recordId: quote.id,
        templateId: quote.crmLeadDocuments[0]?.renderTemplateId ?? null,
      };
    }
  }

  if (!expectedKind || expectedKind === "RECEIPT") {
    const receipt = await prisma.salesReceipt.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        crmLeadDocuments: {
          where: { companyId },
          select: { renderTemplateId: true },
          take: 1,
        },
      },
    });
    if (receipt) {
      return {
        kind: "RECEIPT",
        recordId: receipt.id,
        templateId: receipt.crmLeadDocuments[0]?.renderTemplateId ?? null,
      };
    }
  }

  const crmDoc = await prisma.crmLeadDocument.findFirst({
    where: {
      id,
      companyId,
      ...(expectedKind ? { type: expectedKind } : {}),
    },
    select: {
      type: true,
      quotationId: true,
      invoiceId: true,
      receiptId: true,
      renderTemplateId: true,
    },
  });
  if (!crmDoc) return null;
  const recordId =
    crmDoc.type === "QUOTATION"
      ? crmDoc.quotationId
      : crmDoc.type === "INVOICE"
        ? crmDoc.invoiceId
        : crmDoc.receiptId;
  if (!recordId) return null;

  return {
    kind: crmDoc.type,
    recordId,
    templateId: crmDoc.renderTemplateId ?? null,
  };
}

export async function renderMoneyPdfResponse(
  request: NextRequest,
  companyId: string,
  id: string,
  expectedKind?: MoneyDocumentKind,
): Promise<Response> {
  const target = await resolveMoneyPdfTarget(companyId, id, expectedKind);
  if (!target) {
    return errorResponse("Document not found", 404);
  }

  const searchParams = new URL(request.url).searchParams;
  const forceDownload =
    searchParams.get("download") === "1" ||
    searchParams.get("disposition") === "attachment";

  const rendered = await renderDocumentSync(companyId, {
    target: "RECORD",
    sourceKey: CRM_DOCUMENT_SOURCE_KEYS[target.kind],
    recordId: target.recordId,
    format: "pdf",
    mode: "SYNC",
    templateId: target.templateId ?? undefined,
  });

  const disposition = forceDownload
    ? attachmentDisposition(rendered.fileName)
    : `inline; filename="${rendered.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_")}"`;

  return new Response(new Uint8Array(rendered.data), {
    headers: {
      "Content-Type": rendered.contentType,
      "Content-Disposition": disposition,
      "Cache-Control": "no-store",
    },
  });
}
