import { z } from "zod";

import { recalcSalesInvoiceBalance } from "@/lib/accounting/balances";
import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { prisma } from "@/lib/prisma";

import type { BooksActor } from "./core";
import { nextNumber } from "./core/numbering";
import { ReceiptRefused } from "./core/receipt-facts";
import { ensureCrmDocument } from "./crm-document-bridge";
import { shortDay, storedDay } from "./format";
import { invoiceBalance } from "./invoice-state";

export const applyPaymentSchema = z.object({
  allocations: z
    .array(
      z.object({
        invoiceId: z.string().uuid(),
        amount: z.number().positive(),
      }),
    )
    .min(1)
    .max(50),
});

export type ApplyPaymentInput = z.infer<typeof applyPaymentSchema>;
export type ApplyPaymentResult = {
  receiptId: string;
  receiptNumber: string;
  currency: string;
  totalApplied: number;
  remainingOnAccount: number;
  onAccount: { receiptNumber: string; amount: number } | null;
  applied: Array<{
    receiptId: string;
    receiptNumber: string;
    invoiceId: string;
    invoiceNumber: string | null;
    amount: number;
  }>;
  remainderReceipt: { id: string; number: string; amount: number } | null;
};

export type UnappliedReceiptSummary = {
  id: string;
  number: string;
  date: string;
  amount: number;
  currency: string;
  reference: string | null;
  method: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Returns all unapplied ("On account") receipts for a customer so they can be
 * applied directly from an invoice or customer record.
 */
export async function unappliedReceiptsFor(companyId: string, customerId: string): Promise<UnappliedReceiptSummary[]> {
  if (!customerId) return [];
  const rows = await prisma.salesReceipt.findMany({
    where: {
      companyId,
      customerId,
      invoiceId: null,
      voidedAt: null,
    },
    orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      receiptNumber: true,
      receivedAt: true,
      amount: true,
      currency: true,
      reference: true,
      method: true,
    },
  });
  return rows
    .filter((row) => row.amount > 0.005)
    .map((row) => ({
      id: row.id,
      number: row.receiptNumber,
      date: shortDay(storedDay(row.receivedAt)),
      amount: round2(row.amount),
      currency: (row.currency ?? "USD").toUpperCase(),
      reference: row.reference,
      method: row.method,
    }));
}

/**
 * Applies an unapplied ("On account") customer payment (`SalesReceipt` with
 * `invoiceId === null`) to one or more open `SalesInvoice`s.
 *
 * - If the whole payment is applied to a single invoice, the receipt is linked
 *   directly to that invoice (`invoiceId`).
 * - If only part of the payment is applied (or it is split across several
 *   invoices), the original receipt is updated to the first allocation and
 *   companion receipts are created for additional allocations and any remaining
 *   credit on account, preserving the exact bank and ledger totals without
 *   duplicating bank transactions.
 */
export async function applyReceiptToInvoices(
  actor: BooksActor,
  receiptId: string,
  allocations: Array<{ invoiceId: string; amount: number }>,
) {
  const receipt = await prisma.salesReceipt.findFirst({
    where: { id: receiptId, companyId: actor.companyId },
    include: { customer: { select: { id: true, name: true } } },
  });
  if (!receipt) throw new ReceiptRefused("That payment was not found.", 404);
  if (receipt.voidedAt) throw new ReceiptRefused("A voided payment cannot be applied to an invoice.", 409);
  if (receipt.invoiceId) throw new ReceiptRefused("This payment is already applied to an invoice.", 409);

  const cleaned = allocations
    .map((row) => ({ invoiceId: row.invoiceId, amount: round2(row.amount) }))
    .filter((row) => row.amount > 0.005);
  if (cleaned.length === 0) {
    throw new ReceiptRefused("Tick at least one invoice and enter how much to apply.");
  }

  const totalApplied = round2(cleaned.reduce((sum, row) => sum + row.amount, 0));
  if (totalApplied > receipt.amount + 0.005) {
    throw new ReceiptRefused(`You can apply at most ${receipt.amount.toFixed(2)} ${(receipt.currency ?? "USD").toUpperCase()} from this payment.`);
  }

  const invoiceIds = [...new Set(cleaned.map((row) => row.invoiceId))];
  const invoices = await prisma.salesInvoice.findMany({
    where: {
      companyId: actor.companyId,
      id: { in: invoiceIds },
      status: "ISSUED",
    },
    select: {
      id: true,
      invoiceNumber: true,
      customerId: true,
      currency: true,
      total: true,
      amountPaid: true,
      creditTotal: true,
      writeOffTotal: true,
    },
  });
  const invoiceMap = new Map(invoices.map((inv) => [inv.id, inv]));

  const receiptCurrency = (receipt.currency ?? invoices[0]?.currency ?? "USD").toUpperCase();
  let targetCustomerId = receipt.customerId;

  for (const alloc of cleaned) {
    const inv = invoiceMap.get(alloc.invoiceId);
    if (!inv) {
      throw new ReceiptRefused("One of the chosen invoices is no longer open.");
    }
    if (targetCustomerId && inv.customerId !== targetCustomerId) {
      throw new ReceiptRefused(`${inv.invoiceNumber ?? "That invoice"} belongs to a different customer.`);
    }
    targetCustomerId = inv.customerId;
    if (inv.currency.toUpperCase() !== receiptCurrency) {
      throw new ReceiptRefused(`${inv.invoiceNumber ?? "That invoice"} is in ${inv.currency.toUpperCase()}, but this payment is in ${receiptCurrency}.`);
    }
    const balance = invoiceBalance(inv);
    if (alloc.amount > balance + 0.005) {
      throw new ReceiptRefused(`${inv.invoiceNumber ?? "The invoice"} only has ${balance.toFixed(2)} ${inv.currency.toUpperCase()} left to pay.`);
    }
  }

  const restOnAccount = Math.max(0, round2(receipt.amount - totalApplied));
  const rate = receipt.exchangeRate;
  const baseFor = (amt: number) => (rate && rate > 0 ? round2(amt / rate) : receipt.baseAmount ? round2((receipt.baseAmount * amt) / receipt.amount) : null);

  const applied = await prisma.$transaction(async (tx) => {
    const first = cleaned[0]!;
    const firstInvoice = invoiceMap.get(first.invoiceId)!;

    // 1. Update the existing receipt to hold the first allocation.
    await tx.salesReceipt.update({
      where: { id: receipt.id },
      data: {
        invoiceId: first.invoiceId,
        customerId: targetCustomerId,
        amount: first.amount,
        baseAmount: baseFor(first.amount),
      },
    });

    const existingLedger = await tx.paymentLedgerEntry.findFirst({
      where: { companyId: actor.companyId, sourceType: "SALES_RECEIPT", sourceId: receipt.id },
    });
    if (existingLedger) {
      await tx.paymentLedgerEntry.update({
        where: { id: existingLedger.id },
        data: {
          invoiceId: first.invoiceId,
          partyId: targetCustomerId,
          credit: first.amount,
          amount: first.amount,
        },
      });
    }

    const results: Array<{ receiptId: string; receiptNumber: string; invoiceId: string | null; invoiceNumber: string | null; amount: number }> = [
      {
        receiptId: receipt.id,
        receiptNumber: receipt.receiptNumber,
        invoiceId: first.invoiceId,
        invoiceNumber: firstInvoice.invoiceNumber,
        amount: first.amount,
      },
    ];

    // 2. Create companion receipts for any additional invoice allocations.
    for (const extra of cleaned.slice(1)) {
      const inv = invoiceMap.get(extra.invoiceId)!;
      const number = await nextNumber(tx, actor.companyId, "receipt");
      const created = await tx.salesReceipt.create({
        data: {
          companyId: actor.companyId,
          invoiceId: extra.invoiceId,
          customerId: targetCustomerId,
          receiptNumber: number,
          receivedAt: receipt.receivedAt,
          amount: extra.amount,
          currency: receiptCurrency,
          exchangeRate: receipt.exchangeRate,
          baseAmount: baseFor(extra.amount),
          method: receipt.method,
          reference: receipt.reference ?? `Split from ${receipt.receiptNumber}`,
          bankAccountId: receipt.bankAccountId,
          createdById: actor.userId,
        },
      });
      if (existingLedger) {
        await tx.paymentLedgerEntry.create({
          data: {
            companyId: actor.companyId,
            accountType: "RECEIVABLE",
            partyType: "CUSTOMER",
            partyId: targetCustomerId,
            entryDate: receipt.receivedAt,
            sourceType: "SALES_RECEIPT",
            sourceId: created.id,
            invoiceId: extra.invoiceId,
            description: `Applied from ${receipt.receiptNumber} to ${inv.invoiceNumber ?? "invoice"}`,
            currency: receiptCurrency,
            debit: 0,
            credit: extra.amount,
            amount: extra.amount,
            status: "POSTED",
          },
        });
      }
      results.push({
        receiptId: created.id,
        receiptNumber: created.receiptNumber,
        invoiceId: extra.invoiceId,
        invoiceNumber: inv.invoiceNumber,
        amount: extra.amount,
      });
    }

    // 3. If part of the payment remains unapplied, keep it on account as its own receipt row.
    let remainderReceipt: { id: string; number: string; amount: number } | null = null;
    if (restOnAccount > 0.005) {
      const number = await nextNumber(tx, actor.companyId, "receipt");
      const created = await tx.salesReceipt.create({
        data: {
          companyId: actor.companyId,
          invoiceId: null,
          customerId: targetCustomerId,
          receiptNumber: number,
          receivedAt: receipt.receivedAt,
          amount: restOnAccount,
          currency: receiptCurrency,
          exchangeRate: receipt.exchangeRate,
          baseAmount: baseFor(restOnAccount),
          method: receipt.method,
          reference: receipt.reference ?? `Remaining credit from ${receipt.receiptNumber}`,
          bankAccountId: receipt.bankAccountId,
          createdById: actor.userId,
        },
      });
      if (existingLedger) {
        await tx.paymentLedgerEntry.create({
          data: {
            companyId: actor.companyId,
            accountType: "RECEIVABLE",
            partyType: "CUSTOMER",
            partyId: targetCustomerId,
            entryDate: receipt.receivedAt,
            sourceType: "SALES_RECEIPT",
            sourceId: created.id,
            invoiceId: null,
            description: `Remaining credit from ${receipt.receiptNumber}`,
            currency: receiptCurrency,
            debit: 0,
            credit: restOnAccount,
            amount: restOnAccount,
            status: "POSTED",
          },
        });
      }
      remainderReceipt = { id: created.id, number: created.receiptNumber, amount: restOnAccount };
    }

    await writePlatformAuditEvent(
      {
        companyId: actor.companyId,
        actorId: actor.userId,
        eventType: "books.payment.applied",
        entityType: "SalesReceipt",
        entityId: receipt.id,
        payload: {
          number: receipt.receiptNumber,
          applied: results,
          remainingOnAccount: remainderReceipt,
        },
      },
      tx,
    );

    return { results, remainderReceipt };
  });

  // Recalculate balances and sync CRM for all touched invoices.
  for (const invId of invoiceIds) {
    await recalcSalesInvoiceBalance(invId);
    await ensureCrmDocument(actor.companyId, invId).catch(() => null);
  }

  return {
    receiptId: receipt.id,
    receiptNumber: receipt.receiptNumber,
    currency: receiptCurrency,
    totalApplied,
    remainingOnAccount: restOnAccount,
    onAccount: applied.remainderReceipt
      ? { receiptNumber: applied.remainderReceipt.number, amount: applied.remainderReceipt.amount }
      : null,
    applied: applied.results,
    remainderReceipt: applied.remainderReceipt,
  };
}
