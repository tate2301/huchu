import { prisma } from "@/lib/prisma";

/**
 * Where a CRM document lives now: quotes, invoices and receipts are Books'
 * records, each at one address (design/books/NOTES.md §2). The CRM's own
 * addresses carried its document id; Books' invoice and payment pages take
 * the invoice's and the receipt's.
 */
export async function booksAddressOf(companyId: string, documentId: string, kind: "INVOICE" | "RECEIPT"): Promise<string> {
  const doc = await prisma.crmLeadDocument.findFirst({ where: { id: documentId, companyId }, select: { invoiceId: true, receiptId: true } });
  if (kind === "INVOICE") return doc?.invoiceId ? `/books/invoices/${doc.invoiceId}` : "/books/invoices";
  return doc?.receiptId ? `/books/payments?payment=${doc.receiptId}` : "/books/payments";
}
