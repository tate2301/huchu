import { prisma } from "@/lib/prisma";

/**
 * Where a CRM document lives now: quotes, invoices and receipts are Books'
 * records, each at one address (design/books/NOTES.md §2). The CRM's own
 * addresses carried its document id; Books' quote, invoice and payment pages
 * take the quotation's, the invoice's and the receipt's (and also resolve a
 * CRM document id directly if given one).
 */
export async function booksAddressOf(
  companyId: string,
  documentId: string,
  kind: "QUOTATION" | "INVOICE" | "RECEIPT",
): Promise<string> {
  const doc = await prisma.crmLeadDocument.findFirst({
    where: { id: documentId, companyId },
    select: { quotationId: true, invoiceId: true, receiptId: true },
  });
  if (kind === "QUOTATION") {
    return `/books/quotes/${doc?.quotationId ?? documentId}`;
  }
  if (kind === "INVOICE") {
    return `/books/invoices/${doc?.invoiceId ?? documentId}`;
  }
  return `/books/payments/${doc?.receiptId ?? documentId}`;
}
