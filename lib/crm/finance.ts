/**
 * Finance for people who are not accountants.
 *
 * The CRM's money — requisitions, floats, cash in and out of people's hands —
 * posts to the ledger through `money-posting.ts`. This module is the other
 * direction: it *reads* accounting to answer questions a manager asks in
 * plain words ("has the cash Tendai collected been receipted?"), and it never
 * writes to the ledger. A dashboard that could change the books would be a
 * second set of books.
 */

import { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

const ZERO = new Prisma.Decimal(0);

/** Anything under half a cent is rounding, not money anybody is holding. */
const HALF_CENT = new Prisma.Decimal("0.005");

/**
 * Cash logged against one invoice that accounting has not receipted.
 *
 * Money in the field and money in the books arrive by different roads: a rep
 * collecting a deposit on site logs it in their cost tracker against the
 * invoice, and the office records the receipt that settles it. Until the
 * second happens, the first is cash in somebody's hand that the business has
 * no receipt for — which is where floats go missing.
 */
export type ReceiptGap = {
  invoiceDocumentId: string;
  /** What people in the field have logged against the invoice. */
  logged: Prisma.Decimal;
  /** What accounting has receipted on it — `SalesInvoice.amountPaid`. */
  receipted: Prisma.Decimal;
  /** Logged less receipted. Always positive: no gap, no entry. */
  unreceipted: Prisma.Decimal;
  currency: string;
};

/**
 * The gap on one invoice, or null when there is none.
 *
 * Totals, not payments, on purpose: the office may have receipted the money
 * as one payment when two reps logged it as two, or taken part of it by bank
 * transfer. What matters is whether the invoice has been paid at least as much
 * as the field says it collected. Pure, so the rule is testable without a
 * database.
 */
export function receiptGap(
  logged: Prisma.Decimal | number | string,
  receipted: Prisma.Decimal | number | string,
): Prisma.Decimal | null {
  const gap = new Prisma.Decimal(logged).minus(new Prisma.Decimal(receipted).toDecimalPlaces(2));
  return gap.greaterThanOrEqualTo(HALF_CENT) ? gap : null;
}

/**
 * Every invoice with cash logged against it and not yet receipted.
 *
 * Read-only against accounting: it sums the cost tracker's RECEIVED lines per
 * invoice document and compares them with the invoice's `amountPaid`. Nothing
 * is written, reserved or matched.
 */
export async function receiptGaps(
  tx: Tx,
  companyId: string,
  options: { invoiceDocumentIds?: string[] } = {},
): Promise<Map<string, ReceiptGap>> {
  const logged = await tx.crmDailyCostEntry.groupBy({
    by: ["invoiceDocumentId"],
    where: {
      companyId,
      direction: "RECEIVED",
      invoiceDocumentId: options.invoiceDocumentIds
        ? { in: options.invoiceDocumentIds }
        : { not: null },
    },
    _sum: { amount: true },
  });
  if (logged.length === 0) return new Map();

  const documents = await tx.crmLeadDocument.findMany({
    where: { companyId, id: { in: logged.map((row) => row.invoiceDocumentId as string) } },
    select: { id: true, currency: true, invoice: { select: { amountPaid: true, currency: true } } },
  });
  const byId = new Map(documents.map((document) => [document.id, document]));

  const gaps = new Map<string, ReceiptGap>();
  for (const row of logged) {
    const documentId = row.invoiceDocumentId as string;
    const document = byId.get(documentId);
    const loggedAmount = row._sum.amount ?? ZERO;
    const receipted = new Prisma.Decimal(document?.invoice?.amountPaid ?? 0);
    const unreceipted = receiptGap(loggedAmount, receipted);
    if (!unreceipted) continue;
    gaps.set(documentId, {
      invoiceDocumentId: documentId,
      logged: loggedAmount,
      receipted,
      unreceipted,
      currency: document?.invoice?.currency ?? document?.currency ?? "USD",
    });
  }
  return gaps;
}

/**
 * Whether one line is cash not yet receipted.
 *
 * A line is flagged when it is money received against an invoice that has a
 * gap. Every line on that invoice carries the flag until the office catches
 * up, because which of three collections is the unreceipted one is not a
 * question the totals can answer — and the person who logged each of them is
 * the one to ask.
 */
export function isNotReceipted(
  entry: { direction: string; invoiceDocumentId: string | null },
  gaps: Map<string, ReceiptGap>,
): boolean {
  return entry.direction === "RECEIVED" && entry.invoiceDocumentId !== null && gaps.has(entry.invoiceDocumentId);
}
