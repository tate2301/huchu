import { z } from "zod";

import { prisma } from "@/lib/prisma";

import { createSalesInvoice } from "./create-invoice";

export const updateQuotationSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "EXPIRED", "VOIDED"]).optional(),
  validUntil: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export type QuotationChanges = z.infer<typeof updateQuotationSchema>;

/** Why a quotation was not changed or invoiced, in a sentence; `status` as the route answers. */
export class QuotationRefused extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "QuotationRefused";
  }
}

type Actor = { companyId: string; userId: string };

/**
 * Changes a quotation's status, validity or notes as the signed-in person:
 * `PATCH /api/accounting/sales/quotations/[id]` and Vane's approved "extend
 * the quote" both come here. Sent or accepted, it is stamped as issued by them.
 */
export async function updateQuotation(actor: Actor, id: string, changes: QuotationChanges) {
  const existing = await prisma.salesQuotation.findUnique({ where: { id }, select: { id: true, companyId: true } });
  if (!existing || existing.companyId !== actor.companyId) throw new QuotationRefused(404, "Quotation not found");

  return prisma.salesQuotation.update({
    where: { id },
    data: {
      ...(changes.status !== undefined ? { status: changes.status } : {}),
      ...(changes.validUntil !== undefined ? { validUntil: changes.validUntil ? new Date(changes.validUntil) : null } : {}),
      ...(changes.notes !== undefined ? { notes: changes.notes } : {}),
      ...(changes.status === "SENT" || changes.status === "ACCEPTED" ? { issuedById: actor.userId, issuedAt: new Date() } : {}),
    },
    include: { customer: true, lines: true },
  });
}

/**
 * Drafts the invoice for an accepted quotation, line for line, as the person
 * approving: nothing is posted until someone issues it. A quotation already
 * invoiced (by an invoice not voided) is not invoiced twice.
 */
export async function draftInvoiceFromQuote(actor: Actor, input: { quotationId: string; invoiceDate: string; dueDate?: string | null }) {
  const quotation = await prisma.salesQuotation.findFirst({
    where: { id: input.quotationId, companyId: actor.companyId },
    include: { lines: { orderBy: { createdAt: "asc" } }, invoicesRaised: { where: { status: { not: "VOIDED" } }, select: { invoiceNumber: true } } },
  });
  if (!quotation) throw new QuotationRefused(404, "Quotation not found");
  if (quotation.status !== "ACCEPTED") throw new QuotationRefused(409, `${quotation.quotationNumber} has not been accepted.`);
  const raised = quotation.invoicesRaised[0];
  if (raised) throw new QuotationRefused(409, `${quotation.quotationNumber} is already invoiced on ${raised.invoiceNumber}.`);
  if (quotation.lines.length === 0) throw new QuotationRefused(409, `${quotation.quotationNumber} has no lines to invoice.`);

  return createSalesInvoice(actor, {
    customerId: quotation.customerId,
    quotationId: quotation.id,
    invoiceDate: input.invoiceDate,
    dueDate: input.dueDate ?? undefined,
    currency: quotation.currency,
    notes: quotation.notes ?? undefined,
    issueNow: false,
    lines: quotation.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxCodeId: line.taxCodeId ?? undefined,
      taxRate: line.taxRate,
    })),
  });
}
