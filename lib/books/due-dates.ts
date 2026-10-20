import type { PrismaClient } from "@prisma/client";
import { docLabel } from "@/lib/books/doc-number";

/** Why a due date was not set, in a sentence. */
export class DueDateRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DueDateRefused";
  }
}

/**
 * Sets the day an invoice is due. A due date is a promise about payment, not
 * an entry in the books, so nothing is reposted: a draft or issued invoice
 * takes one, a paid or voided one does not, and it cannot fall before the
 * invoice's own date. Days are kept at midnight UTC, as the invoice's are.
 */
export async function setInvoiceDueDate(
  db: Pick<PrismaClient, "salesInvoice">,
  { companyId, invoiceId, dueDate }: { companyId: string; invoiceId: string; dueDate: string },
): Promise<{ invoiceNumber: string; dueDate: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new DueDateRefused("Write the due date as a day, like 2026-10-30.");
  const due = new Date(`${dueDate}T00:00:00Z`);
  const invoice = await db.salesInvoice.findFirst({
    where: { id: invoiceId, companyId },
    select: { id: true, invoiceNumber: true, invoiceDate: true, status: true },
  });
  if (!invoice) throw new DueDateRefused("That invoice is not in this workspace.");
  if (invoice.status === "PAID" || invoice.status === "VOIDED") {
    throw new DueDateRefused(`${invoice.invoiceNumber} is ${invoice.status === "PAID" ? "paid" : "voided"}; it is due no more.`);
  }
  if (due.getTime() < Date.UTC(invoice.invoiceDate.getUTCFullYear(), invoice.invoiceDate.getUTCMonth(), invoice.invoiceDate.getUTCDate())) {
    throw new DueDateRefused(`${invoice.invoiceNumber} cannot be due before its own date.`);
  }
  await db.salesInvoice.update({ where: { id: invoice.id }, data: { dueDate: due } });
  return { invoiceNumber: docLabel(invoice.invoiceNumber), dueDate };
}
