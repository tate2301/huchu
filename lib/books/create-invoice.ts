import { z } from "zod";

import { findTaxCodesOutsideEffectiveWindow } from "@/lib/accounting/tax-selection";
import { resolveDefaultTaxTemplate } from "@/lib/accounting/tax-rules";
import { onAccountingInvoiceCreated } from "@/lib/crm/accounting-hooks";
import { prisma } from "@/lib/prisma";

import { postIssuedInvoice } from "./issue-invoice";

export const invoiceSchema = z.object({
  customerId: z.string().uuid(),
  /**
   * The quotation this invoice is being raised from. When that quote came from
   * the CRM, raising the invoice here moves the CRM record on too.
   */
  quotationId: z.string().uuid().optional(),
  invoiceDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  currency: z.string().min(1).max(10).optional(),
  notes: z.string().max(1000).optional(),
  issueNow: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        description: z.string().min(1).max(300),
        quantity: z.number().min(0.01),
        unitPrice: z.number().min(0),
        taxCodeId: z.string().uuid().optional(),
        taxRate: z.number().min(0).max(100).optional(),
        debit: z.number().min(0).optional(),
        credit: z.number().min(0).optional(),
      }),
    )
    .min(1),
});

function formatTwoDigits(value: number) {
  return String(value).padStart(2, "0");
}

function buildInvoiceNumberCandidate() {
  const now = new Date();
  const datePart = `${now.getFullYear()}${formatTwoDigits(now.getMonth() + 1)}${formatTwoDigits(now.getDate())}`;
  const timePart = `${formatTwoDigits(now.getHours())}${formatTwoDigits(now.getMinutes())}`;
  const randomPart = Math.floor(100 + Math.random() * 900);
  return `INV-${datePart}-${timePart}-${randomPart}`;
}

async function generateUniqueInvoiceNumber() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = buildInvoiceNumberCandidate();
    const existing = await prisma.salesInvoice.findFirst({
      where: { invoiceNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `INV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export type InvoiceInput = z.infer<typeof invoiceSchema>;

/** Why an invoice was not created, with the status the route answers and what it names. */
export class InvoiceRefused extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "InvoiceRefused";
  }
}

/**
 * Creates a sales invoice as the signed-in person, a draft or issued:
 * `POST /api/accounting/sales/invoices` and Vane's approved "draft the
 * invoice from the quote" both come here. Each line's tax comes from its code
 * or the customer's default; issued, it is posted and fiscalised; raised off
 * a CRM quote, the CRM hears of it.
 */
export async function createSalesInvoice(
  /** No person, with `madeByVane`: Vane's own draft, which a person issues. */
  actor: { companyId: string; userId: string | null; madeByVane?: boolean },
  validated: InvoiceInput,
) {
  if (!actor.userId && validated.issueNow) throw new InvoiceRefused("Only a person issues an invoice.");
  const customer = await prisma.customer.findUnique({
    where: { id: validated.customerId },
    select: { companyId: true },
  });
  if (!customer || customer.companyId !== actor.companyId) {
    throw new InvoiceRefused("Invalid customer");
  }

  const invoiceNumber = await generateUniqueInvoiceNumber();

  const resolvedTemplate = await resolveDefaultTaxTemplate({
    companyId: actor.companyId,
    appliesTo: "SALES",
    partyType: "CUSTOMER",
    partyId: validated.customerId,
    documentDate: new Date(validated.invoiceDate),
    currency: validated.currency ?? "USD",
  });

  const linesWithResolvedTaxCode = validated.lines.map((line) => ({
    ...line,
    taxCodeId: line.taxCodeId ?? resolvedTemplate.defaultTaxCodeId ?? undefined,
  }));

  const taxCodeIds = linesWithResolvedTaxCode
    .map((line) => line.taxCodeId)
    .filter((value): value is string => Boolean(value));

  const taxCodes = taxCodeIds.length
    ? await prisma.taxCode.findMany({
      where: { id: { in: taxCodeIds }, companyId: actor.companyId },
      select: { id: true, rate: true, effectiveFrom: true, effectiveTo: true },
    })
    : [];

  const invoiceDate = new Date(validated.invoiceDate);
  const taxCodesOutOfWindow = findTaxCodesOutsideEffectiveWindow(taxCodes, invoiceDate);
  if (taxCodesOutOfWindow.length > 0) {
    throw new InvoiceRefused("One or more tax codes are not effective on the invoice date", {
      taxCodeIds: taxCodesOutOfWindow,
    });
  }

  const taxById = new Map(taxCodes.map((tax) => [tax.id, tax.rate]));

  const computedLines = linesWithResolvedTaxCode.map((line) => {
    const taxRate = line.taxRate ?? taxById.get(line.taxCodeId ?? "") ?? 0;
    const lineNet = line.quantity * line.unitPrice;
    const taxAmount = (lineNet * taxRate) / 100;
    const total = lineNet + taxAmount;
    return {
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxCodeId: line.taxCodeId,
      taxRate,
      taxAmount,
      lineTotal: total,
      debit: line.debit,
      credit: line.credit,
    };
  });

  const subTotal = computedLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const taxTotal = computedLines.reduce((sum, line) => sum + line.taxAmount, 0);
  const total = computedLines.reduce((sum, line) => sum + line.lineTotal, 0);

  const invoice = await prisma.salesInvoice.create({
    data: {
      companyId: actor.companyId,
      customerId: validated.customerId,
      invoiceNumber,
      invoiceDate,
      dueDate: validated.dueDate ? new Date(validated.dueDate) : undefined,
      status: validated.issueNow ? "ISSUED" : "DRAFT",
      currency: validated.currency ?? "USD",
      subTotal,
      taxTotal,
      total,
      notes: validated.notes,
      quotationId: validated.quotationId,
      createdById: actor.userId,
      madeByVane: actor.madeByVane ?? false,
      issuedById: validated.issueNow ? actor.userId : undefined,
      issuedAt: validated.issueNow ? new Date() : undefined,
      lines: { create: computedLines },
    },
    include: {
      customer: true,
      lines: true,
    },
  });

  if (invoice.status === "ISSUED" && actor.userId) await postIssuedInvoice(actor.companyId, invoice, actor.userId);

  // If this came off a CRM quote, let the CRM know its work has been
  // invoiced. Never throws — the invoice is already real either way.
  // Vane's draft is not the CRM's work invoiced until a person issues it.
  if (actor.userId) {
    await onAccountingInvoiceCreated({
      companyId: actor.companyId,
      invoiceId: invoice.id,
      userId: actor.userId,
    });
  }

  return invoice;
}
