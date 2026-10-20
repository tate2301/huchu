import { z } from "zod";

import { recalcSalesInvoiceBalance } from "@/lib/accounting/balances";
import { findTaxCodesOutsideEffectiveWindow } from "@/lib/accounting/tax-selection";
import { nextNumber } from "@/lib/books/core/numbering";
import { postMoney } from "@/lib/books/core/post-money";
import { prisma } from "@/lib/prisma";

/**
 * Raising a credit note against a sales invoice: numbered, its lines priced
 * with their tax, and, when it is issued at once, the invoice's balance worked
 * out again and the note posted. Accounting → Sales and Books' Reverse both
 * raise notes through here.
 */

export const creditNoteSchema = z.object({
  invoiceId: z.string().uuid(),
  noteDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  currency: z.string().min(1).max(10).optional(),
  reason: z.string().max(500).optional(),
  issueNow: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        description: z.string().min(1).max(300),
        quantity: z.number().min(0.01),
        unitPrice: z.number().min(0),
        taxCodeId: z.string().uuid().optional(),
        taxRate: z.number().min(0).max(100).optional(),
      }),
    )
    .min(1),
});

export type CreditNoteInput = z.infer<typeof creditNoteSchema>;

/** Why a credit note was not raised: the route answers with `status` and `details`. */
export class CreditNoteRefused extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "CreditNoteRefused";
  }
}

export async function createSalesCreditNote(actor: { companyId: string; userId: string }, input: CreditNoteInput) {
  const invoice = await prisma.salesInvoice.findUnique({
    where: { id: input.invoiceId },
    select: { companyId: true, status: true, currency: true, exchangeRate: true, rateSource: true },
  });
  if (!invoice || invoice.companyId !== actor.companyId) throw new CreditNoteRefused("Invalid invoice");
  if (invoice.status === "DRAFT" || invoice.status === "VOIDED") {
    throw new CreditNoteRefused("Invoice must be issued before creating a credit note");
  }

  const taxCodeIds = input.lines.map((line) => line.taxCodeId).filter((value): value is string => Boolean(value));
  const taxCodes = taxCodeIds.length
    ? await prisma.taxCode.findMany({
        where: { id: { in: taxCodeIds }, companyId: actor.companyId },
        select: { id: true, rate: true, effectiveFrom: true, effectiveTo: true },
      })
    : [];

  const noteDate = new Date(input.noteDate);
  const outOfWindow = findTaxCodesOutsideEffectiveWindow(taxCodes, noteDate);
  if (outOfWindow.length > 0) {
    throw new CreditNoteRefused("One or more tax codes are not effective on the credit note date", 400, { taxCodeIds: outOfWindow });
  }

  const taxById = new Map(taxCodes.map((tax) => [tax.id, tax.rate]));
  const lines = input.lines.map((line) => {
    const taxRate = line.taxRate ?? taxById.get(line.taxCodeId ?? "") ?? 0;
    const lineNet = line.quantity * line.unitPrice;
    const taxAmount = (lineNet * taxRate) / 100;
    return {
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxCodeId: line.taxCodeId,
      taxRate,
      taxAmount,
      lineTotal: lineNet + taxAmount,
    };
  });
  const subTotal = lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const taxTotal = lines.reduce((sum, line) => sum + line.taxAmount, 0);
  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  // A draft carries no number; one issued now takes the next in the series, in the same write (D8).
  const creditNote = await prisma.$transaction(async (tx) => tx.creditNote.create({
    data: {
      companyId: actor.companyId,
      invoiceId: input.invoiceId,
      noteNumber: input.issueNow ? await nextNumber(tx, actor.companyId, "credit-note") : null,
      noteDate,
      status: input.issueNow ? "ISSUED" : "DRAFT",
      currency: input.currency ?? invoice.currency ?? "USD",
      subTotal,
      taxTotal,
      total,
      reason: input.reason,
      // D3: a credit note takes its invoice's rate, so the receivable comes off at what it went on at.
      exchangeRate: invoice.exchangeRate ?? undefined,
      rateSource: invoice.rateSource ?? undefined,
      baseTotal: invoice.exchangeRate ? Math.round((total / invoice.exchangeRate) * 100) / 100 : undefined,
      createdById: actor.userId,
      issuedById: input.issueNow ? actor.userId : undefined,
      issuedAt: input.issueNow ? new Date() : undefined,
      lines: { create: lines },
    },
    include: {
      invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } },
      lines: true,
    },
  }));

  if (creditNote.status === "ISSUED") {
    await recalcSalesInvoiceBalance(creditNote.invoiceId);
    try {
      // Through the core: in the base currency at the invoice's rate (D3, D4).
      await postMoney(prisma, {
        companyId: actor.companyId,
        sourceType: "SALES_CREDIT_NOTE",
        sourceId: creditNote.id,
        date: creditNote.noteDate,
        description: `Credit note ${creditNote.noteNumber}`,
        amount: creditNote.total,
        netAmount: creditNote.subTotal,
        taxAmount: creditNote.taxTotal,
        grossAmount: creditNote.total,
        currency: creditNote.currency,
        actor: { userId: actor.userId },
      });
    } catch (error) {
      console.error("[Accounting] Sales credit note auto-post failed:", error);
    }
  }

  return creditNote;
}
