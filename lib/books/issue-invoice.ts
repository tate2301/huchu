import { issueFiscalReceipt } from "@/lib/accounting/fiscalisation";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { hasFeature } from "@/lib/platform/features";
import { prisma } from "@/lib/prisma";

type Issued = { id: string; invoiceNumber: string; invoiceDate: Date; total: number; subTotal: number; taxTotal: number };

/**
 * What issuing an invoice does to the books: its journal is posted, and it is
 * fiscalised where the workspace fiscalises. Neither stops the invoice being
 * issued; a failure is logged, as it always was.
 */
export async function postIssuedInvoice(companyId: string, invoice: Issued, userId: string): Promise<void> {
  try {
    await createJournalEntryFromSource({
      companyId,
      sourceType: "SALES_INVOICE",
      sourceId: invoice.id,
      entryDate: invoice.invoiceDate,
      description: `Sales invoice ${invoice.invoiceNumber}`,
      createdById: userId,
      amount: invoice.total,
      netAmount: invoice.subTotal,
      taxAmount: invoice.taxTotal,
      grossAmount: invoice.total,
    });
  } catch (error) {
    console.error("[Accounting] Sales invoice auto-post failed:", error);
  }
  if (await hasFeature(companyId, "accounting.zimra.fiscalisation")) {
    try {
      await issueFiscalReceipt(companyId, invoice.id, userId);
    } catch (error) {
      console.error("[Accounting] Fiscalisation issue failed:", error);
    }
  }
}

/** Why a draft was not issued or deleted, in a sentence. */
export class DraftInvoiceRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DraftInvoiceRefused";
  }
}

/** Issues a draft as the person: dated today if it carried no date of its own, posted and fiscalised. */
export async function issueDraftInvoice(actor: { companyId: string; userId: string }, invoiceId: string) {
  const now = new Date();
  const { count } = await prisma.salesInvoice.updateMany({
    where: { id: invoiceId, companyId: actor.companyId, status: "DRAFT" },
    data: { status: "ISSUED", issuedById: actor.userId, issuedAt: now },
  });
  const invoice = await prisma.salesInvoice.findFirst({
    where: { id: invoiceId, companyId: actor.companyId },
    select: { id: true, invoiceNumber: true, invoiceDate: true, total: true, subTotal: true, taxTotal: true, status: true, currency: true, customer: { select: { name: true } } },
  });
  if (!invoice) throw new DraftInvoiceRefused("That invoice is not here any more.");
  if (count === 0) throw new DraftInvoiceRefused(`${invoice.invoiceNumber} is not a draft: it was issued already.`);
  await postIssuedInvoice(actor.companyId, invoice, actor.userId);
  return invoice;
}

/** Deletes a draft Vane made, which nobody has issued: a person's own drafts are theirs to delete in Books. */
export async function deleteVaneDraftInvoice(companyId: string, invoiceId: string) {
  const invoice = await prisma.salesInvoice.findFirst({ where: { id: invoiceId, companyId }, select: { invoiceNumber: true, status: true, madeByVane: true } });
  if (!invoice) throw new DraftInvoiceRefused("That invoice is not here any more.");
  if (invoice.status !== "DRAFT") throw new DraftInvoiceRefused(`${invoice.invoiceNumber} was issued, so it stays.`);
  if (!invoice.madeByVane) throw new DraftInvoiceRefused(`${invoice.invoiceNumber} is a person's draft, not Vane's.`);
  await prisma.salesInvoice.deleteMany({ where: { id: invoiceId, companyId, status: "DRAFT", madeByVane: true } });
  return invoice;
}
